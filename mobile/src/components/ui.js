import React from 'react';
import { View, Text, Pressable, TextInput, StyleSheet, ScrollView } from 'react-native';
import { C, S, F, fmtW } from '../theme';

export function Card({ children, style }) {
  return <View style={[st.card, style]}>{children}</View>;
}

export function Eyebrow({ children, style }) {
  return <Text style={[st.eyebrow, style]}>{String(children).toUpperCase()}</Text>;
}

export function H1({ children, style }) {
  return <Text style={[st.h1, style]}>{children}</Text>;
}

export function H2({ children, style }) {
  return <Text style={[st.h2, style]}>{children}</Text>;
}

export function Muted({ children, style, size = 13 }) {
  return <Text style={[{ color: C.muted, fontSize: size, lineHeight: size * 1.45 }, style]}>{children}</Text>;
}

export function Btn({ title, onPress, variant = 'default', style, disabled, children }) {
  const bg = variant === 'primary' ? C.accent : variant === 'ghost' ? 'transparent' : C.surface2;
  const fg = variant === 'primary' ? C.accentInk : variant === 'danger' ? C.down : C.ink;
  return (
    <Pressable
      onPress={disabled ? undefined : onPress}
      style={({ pressed }) => [
        st.btn,
        { backgroundColor: bg, opacity: disabled ? 0.4 : pressed ? 0.75 : 1 },
        variant === 'ghost' && { borderWidth: 1, borderColor: C.line },
        variant === 'danger' && { borderWidth: 1, borderColor: 'rgba(239,68,68,.3)' },
        style,
      ]}
      accessibilityRole="button"
      accessibilityState={{ disabled: !!disabled }}
    >
      {children ?? <Text style={[st.btnText, { color: fg }]}>{title}</Text>}
    </Pressable>
  );
}

export function Pill({ bg, color, children }) {
  return (
    <View style={[st.pill, { backgroundColor: bg }]}>
      <Text style={[st.pillText, { color }]}>{String(children).toUpperCase()}</Text>
    </View>
  );
}

export function Chip({ label, active, onPress, small }) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected: !!active }}
      style={({ pressed }) => [
        st.chip,
        small && { paddingVertical: 6, paddingHorizontal: 11, borderRadius: 7 },
        active && { backgroundColor: 'rgba(228,255,58,.11)', borderColor: C.accent },
        pressed && { opacity: 0.7 },
      ]}
    >
      <Text style={[st.chipText, small && { fontSize: 12.5 }, active && { color: C.accent }]}>{label}</Text>
    </Pressable>
  );
}

export function Field({ label, children }) {
  return (
    <View style={{ gap: 6 }}>
      {!!label && <Text style={st.fieldLabel}>{String(label).toUpperCase()}</Text>}
      {children}
    </View>
  );
}

export function Input(props) {
  return (
    <TextInput
      placeholderTextColor={C.faint}
      selectionColor={C.accent}
      {...props}
      style={[st.input, props.style]}
    />
  );
}

/**
 * The loading cue under a weight: which plates go on each side, or what to grab.
 * Mirrors the web app's hint exactly — it's the same function from core/plates.js.
 */
export function PlateCue({ hint, center }) {
  if (!hint) return null;

  if (hint.kind === 'plates') {
    return (
      <View style={[st.plateRow, center && { justifyContent: 'center' }]}>
        {hint.bar > 0 && (
          <View style={[st.plate, st.plateBar]}>
            <Text style={[st.plateText, { color: C.faint }]}>bar {fmtW(hint.bar)}</Text>
          </View>
        )}
        {hint.perSide.map(([p, n], i) => (
          <View key={`${p}-${i}`} style={st.plate}>
            <Text style={st.plateText}>{n > 1 ? `${n}×${fmtW(p)}` : fmtW(p)}</Text>
          </View>
        ))}
        <Text style={st.plateLabel}>per side</Text>
        {hint.short > 0 && (
          <Text style={[st.plateLabel, { color: C.hold }]}>{fmtW(hint.short)} short</Text>
        )}
      </View>
    );
  }

  return (
    <View style={[st.plateRow, center && { justifyContent: 'center' }]}>
      <Text style={st.plateLabel}>{hint.text}</Text>
    </View>
  );
}

/** Small square progress dots — one per set or per exercise. */
export function Pips({ items }) {
  return (
    <View style={{ flexDirection: 'row', gap: 3 }}>
      {items.map((kind, i) => (
        <View
          key={i}
          style={{
            width: 7, height: 7, borderRadius: 2,
            backgroundColor:
              kind === 'done' ? C.up : kind === 'miss' ? C.down : kind === 'now' ? C.accent : C.line,
          }}
        />
      ))}
    </View>
  );
}

export function Empty({ title, body }) {
  return (
    <View style={{ alignItems: 'center', paddingVertical: 44, paddingHorizontal: 20 }}>
      <H2 style={{ color: C.muted, marginBottom: 7 }}>{title}</H2>
      <Muted style={{ textAlign: 'center' }}>{body}</Muted>
    </View>
  );
}

export function Divider() {
  return <View style={{ height: 1, backgroundColor: C.line }} />;
}

export { ScrollView };

const st = StyleSheet.create({
  card: { backgroundColor: C.surface, borderRadius: S.radius, padding: S.pad },
  eyebrow: { fontSize: 11, fontWeight: '600', letterSpacing: 1.3, color: C.faint },
  h1: { fontSize: 32, fontWeight: '800', color: C.ink, letterSpacing: -0.3, lineHeight: 36 },
  h2: { fontSize: 21, fontWeight: '700', color: C.ink, letterSpacing: 0.1 },

  btn: {
    paddingVertical: 14, paddingHorizontal: 18, borderRadius: 9,
    alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 8,
  },
  btnText: { fontSize: 15, fontWeight: '700' },

  pill: { paddingVertical: 3, paddingHorizontal: 9, borderRadius: 999, alignSelf: 'flex-start' },
  pillText: { fontSize: 10, fontWeight: '800', letterSpacing: 0.5 },

  chip: {
    paddingVertical: 9, paddingHorizontal: 14, borderRadius: 8,
    backgroundColor: C.surface2, borderWidth: 1, borderColor: 'transparent',
  },
  chipText: { fontSize: 14, fontWeight: '500', color: C.muted },

  fieldLabel: { fontSize: 12, fontWeight: '700', letterSpacing: 0.6, color: C.muted },
  input: {
    backgroundColor: C.surface2, borderWidth: 1, borderColor: C.line, borderRadius: 8,
    paddingVertical: 12, paddingHorizontal: 13, color: C.ink, fontSize: 15,
  },

  plateRow: { flexDirection: 'row', alignItems: 'center', gap: 4, flexWrap: 'wrap' },
  plate: { paddingVertical: 2, paddingHorizontal: 7, borderRadius: 3, backgroundColor: C.surface3 },
  plateBar: { backgroundColor: 'transparent', borderWidth: 1, borderColor: C.line },
  plateText: { ...F.mono, fontSize: 11.5, color: C.ink },
  plateLabel: { ...F.mono, fontSize: 11.5, color: C.muted },
});
