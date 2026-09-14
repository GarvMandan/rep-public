// Transactional email via Resend.
//
// Kept behind a small interface so swapping providers means rewriting `send`
// and nothing else. Every call is best-effort: a failed email must never fail
// the request that triggered it, because a user who cannot be emailed should
// still end up with a working account.
//
// Without RESEND_API_KEY configured, sends are skipped and logged. The app
// still works; verification links just have to be fetched another way.

const RESEND_ENDPOINT = 'https://api.resend.com/emails';

/**
 * @returns {{sent: boolean, skipped?: string, error?: string}}
 */
export async function send(env, { to, subject, html, text }) {
  const key = env.RESEND_API_KEY;
  if (!key) {
    console.log(`[email] skipped (no RESEND_API_KEY): "${subject}" -> ${to}`);
    return { sent: false, skipped: 'not-configured' };
  }

  // Resend's shared sender works with no domain setup. Once a domain is
  // verified, set EMAIL_FROM and mail comes from your own address instead.
  const from = env.EMAIL_FROM || 'Progressive Overload <onboarding@resend.dev>';

  try {
    const res = await fetch(RESEND_ENDPOINT, {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from, to: [to], subject, html, text }),
    });

    if (!res.ok) {
      const detail = await res.text();
      console.error(`[email] ${res.status} sending "${subject}": ${detail.slice(0, 300)}`);
      return { sent: false, error: `Provider returned ${res.status}` };
    }
    return { sent: true };
  } catch (err) {
    console.error('[email] network failure:', err?.message);
    return { sent: false, error: 'Could not reach the email provider.' };
  }
}

// ── Templates ─────────────────────────────────────────────────────────────
//
// Plain, dark-friendly HTML. Email clients strip most CSS, so this stays to
// inline styles on tables — the only thing that renders consistently — and
// every message ships a text/plain alternative.

const BRAND = '#E4FF3A';
const INK = '#12151A';

function shell(title, bodyHtml) {
  return `<!doctype html><html><body style="margin:0;padding:0;background:#f4f5f7;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f5f7;padding:32px 16px">
    <tr><td align="center">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:480px;background:#ffffff;border-radius:12px;overflow:hidden">
        <tr><td style="background:${INK};padding:20px 24px">
          <span style="color:#ffffff;font-size:17px;font-weight:700;letter-spacing:.04em">
            PROGRESSIVE<span style="color:${BRAND}">·</span>OVERLOAD
          </span>
        </td></tr>
        <tr><td style="padding:28px 24px">
          <h1 style="margin:0 0 14px;font-size:21px;color:#12151A">${title}</h1>
          ${bodyHtml}
        </td></tr>
        <tr><td style="padding:16px 24px;background:#fafafa;color:#8C97A8;font-size:12px;line-height:1.5">
          If you did not expect this email, you can ignore it safely.
        </td></tr>
      </table>
    </td></tr>
  </table></body></html>`;
}

function button(href, label) {
  return `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:20px 0">
    <tr><td style="background:${BRAND};border-radius:8px">
      <a href="${href}" style="display:inline-block;padding:13px 26px;color:${INK};font-weight:700;font-size:15px;text-decoration:none">${label}</a>
    </td></tr></table>`;
}

export function verificationEmail(link) {
  return {
    subject: 'Verify your email',
    html: shell(
      'Confirm your email',
      `<p style="margin:0 0 6px;color:#3c4450;font-size:15px;line-height:1.55">
         Confirm your address to add friends and share workouts.
       </p>
       ${button(link, 'Verify email')}
       <p style="margin:14px 0 0;color:#8C97A8;font-size:13px;line-height:1.5">
         Or paste this into your browser:<br>
         <span style="color:#5B6675;word-break:break-all">${link}</span><br><br>
         This link expires in 24 hours.
       </p>`
    ),
    text: `Confirm your email to add friends and share workouts.\n\n${link}\n\nThis link expires in 24 hours.`,
  };
}

export function inviteEmail({ link, fromName, note }) {
  const safeName = headerSafe(fromName);
  return {
    subject: `${safeName} invited you to train`,
    html: shell(
      `${escapeHtml(safeName)} invited you`,
      `<p style="margin:0 0 6px;color:#3c4450;font-size:15px;line-height:1.55">
         They are tracking workouts on Progressive Overload and want you training alongside them.
         It tells you the exercise, the weight, the plates to load, the sets and the reps, then
         adjusts as you go.
       </p>
       ${note ? `<table role="presentation" width="100%" style="margin:16px 0"><tr>
         <td style="border-left:3px solid ${BRAND};padding:10px 14px;background:#fafafa;color:#3c4450;font-size:14px;line-height:1.5">
           ${escapeHtml(note)}
         </td></tr></table>` : ''}
       ${button(link, 'Accept invite')}
       <p style="margin:14px 0 0;color:#8C97A8;font-size:13px;line-height:1.5">
         Or paste this into your browser:<br>
         <span style="color:#5B6675;word-break:break-all">${link}</span>
       </p>`
    ),
    text: `${safeName} invited you to train on Progressive Overload.\n`
      + (note ? `\n"${note}"\n` : '')
      + `\nAccept: ${link}\n`,
  };
}

export function passwordResetEmail(link) {
  return {
    subject: 'Reset your password',
    html: shell(
      'Reset your password',
      `<p style="margin:0 0 6px;color:#3c4450;font-size:15px;line-height:1.55">
         Choose a new password for your account.
       </p>
       ${button(link, 'Reset password')}
       <p style="margin:14px 0 0;color:#8C97A8;font-size:13px;line-height:1.5">
         Or paste this into your browser:<br>
         <span style="color:#5B6675;word-break:break-all">${link}</span><br><br>
         This link expires in one hour. Your current password still works until you use it.
       </p>`
    ),
    text: `Reset your password:\n\n${link}\n\nThis link expires in one hour.`,
  };
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

/**
 * Strip anything that could break out of an email header.
 *
 * A display name reaches the Subject line, and CR/LF there is header injection:
 * a crafted name could append `Bcc:` and turn an invite into a spam relay.
 */
function headerSafe(s) {
  return String(s || 'Someone').replace(/[\r\n]+/g, ' ').trim().slice(0, 80) || 'Someone';
}
