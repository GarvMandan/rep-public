import React from 'react';
import { View, Text, ScrollView, Pressable, StyleSheet } from 'react-native';
import Svg, { Rect, Line, Path, Circle, Text as SvgText } from 'react-native-svg';
import { MUSCLE_LABELS } from '../../../core/exercises.js';
import { store } from '../useStore';
import { C, S, fmtW, fmtVol } from '../theme';
import { Card, H1, Eyebrow, Muted, Empty } from '../components/ui';

export default function Progress({ state, onDetail, onSession }) {
  const stats = store.stats();

  if (!stats.totalSessions) {
    return (
      <ScrollView contentContainerStyle={st.page}>
        <Empty
          title="Nothing logged yet"
          body="Finish a workout and your volume, PRs and per-muscle balance show up here."
        />
      </ScrollView>
    );
  }

  const weeks = stats.weeks.slice(-8);
  const muscles = Object.entries(stats.byMuscle).sort((a, b) => b[1] - a[1]);
  const maxM = muscles[0]?.[1] || 1;

  return (
    <ScrollView contentContainerStyle={st.page}>
      <View style={st.statGrid}>
        <Stat v={String(stats.totalSessions)} k="Workouts" />
        <Stat v={fmtVol(stats.totalVolume)} unit=" lb" k="Total volume" />
        <Stat v={String(stats.totalSets)} k="Sets logged" />
        <Stat v={String(stats.streak)} unit=" wk" k="Current streak" />
      </View>

      {weeks.length > 1 && (
        <Card style={{ marginTop: 12 }}>
          <Eyebrow style={{ marginBottom: 12 }}>Weekly volume · last {weeks.length} weeks</Eyebrow>
          <BarChart weeks={weeks} />
        </Card>
      )}

      <Card style={{ marginTop: 12 }}>
        <Eyebrow style={{ marginBottom: 12 }}>Volume by muscle group</Eyebrow>
        <View style={{ gap: 9 }}>
          {muscles.map(([m, v]) => (
            <View key={m} style={st.barRow}>
              <Text style={st.barLabel}>{MUSCLE_LABELS[m] || m}</Text>
              <View style={st.barTrack}>
                <View style={[st.barFill, { width: `${Math.max(2, (v / maxM) * 100)}%` }]} />
              </View>
              <Text style={st.barNum}>{fmtVol(v)}</Text>
            </View>
          ))}
        </View>
      </Card>

      <Card style={{ marginTop: 12 }}>
        <Eyebrow style={{ marginBottom: 4 }}>Estimated 1RM · best per lift</Eyebrow>
        <Muted style={{ marginBottom: 6 }}>Tap a lift to see its trend.</Muted>
        {stats.prs.slice(0, 15).map((p, i) => (
          <Pressable
            key={p.exerciseId}
            onPress={() => onDetail(p.exerciseId)}
            style={({ pressed }) => [st.prRow, i > 0 && st.border, pressed && { opacity: 0.6 }]}
          >
            <Text style={{ color: C.ink, fontSize: 14, flex: 1 }}>{p.name}</Text>
            <Muted size={12.5}>{fmtW(p.weight)} lb working</Muted>
            <Text style={st.prVal}>{p.best1RM}</Text>
          </Pressable>
        ))}
      </Card>

      <Eyebrow style={{ marginTop: 20, marginBottom: 8 }}>History</Eyebrow>
      <View style={{ borderRadius: S.radius, overflow: 'hidden' }}>
        {[...state.sessions].reverse().slice(0, 25).map((s) => {
          const vol = s.exercises.reduce(
            (a, e) => a + e.sets.reduce((b, x) => b + (x.actualWeight ?? x.weight) * x.actualReps, 0),
            0
          );
          const sets = s.exercises.reduce((a, e) => a + e.sets.length, 0);
          return (
            <Pressable
              key={s.id}
              onPress={() => onSession(s.id)}
              style={({ pressed }) => [st.histRow, pressed && { backgroundColor: C.surface2 }]}
            >
              <View style={{ flex: 1 }}>
                <Text style={{ color: C.ink, fontSize: 14.5, fontWeight: '600' }}>{s.name}</Text>
                <Text style={{ color: C.faint, fontSize: 11.5, marginTop: 1 }}>
                  {s.date} · {s.day} · {sets} sets
                </Text>
              </View>
              <Text style={st.histVal}>{fmtVol(vol)} lb</Text>
            </Pressable>
          );
        })}
      </View>
    </ScrollView>
  );
}

function Stat({ v, unit, k }) {
  return (
    <View style={st.stat}>
      <Text style={st.statV}>
        {v}
        {!!unit && <Text style={st.statUnit}>{unit}</Text>}
      </Text>
      <Text style={st.statK}>{k.toUpperCase()}</Text>
    </View>
  );
}

// One scale places bars, gridlines and labels; every label names a value reached.
function BarChart({ weeks }) {
  const W = 520, H = 170, padL = 42, padB = 26, padT = 10, padR = 6;
  const max = Math.max(...weeks.map((w) => w.volume), 1);
  const nice = Math.ceil(max / 1000) * 1000 || 1000;
  const iw = W - padL - padR, ih = H - padB - padT;
  const bw = Math.min(48, (iw / weeks.length) * 0.62);
  const step = iw / weeks.length;

  return (
    <Svg width="100%" height={H} viewBox={`0 0 ${W} ${H}`}>
      {[0, 0.5, 1].map((f) => {
        const y = padT + ih - f * ih;
        return (
          <React.Fragment key={f}>
            <Line x1={padL} y1={y} x2={W - padR} y2={y} stroke={C.line} strokeWidth={1} />
            <SvgText x={padL - 7} y={y + 4} fill={C.faint} fontSize={10} textAnchor="end">
              {fmtVol(nice * f)}
            </SvgText>
          </React.Fragment>
        );
      })}
      {weeks.map((w, i) => {
        const h = Math.max(2, (w.volume / nice) * ih);
        const x = padL + i * step + (step - bw) / 2;
        const last = i === weeks.length - 1;
        return (
          <React.Fragment key={w.week}>
            <Rect x={x} y={padT + ih - h} width={bw} height={h} rx={3} fill={last ? C.accent : C.line} />
            <SvgText x={x + bw / 2} y={H - 9} fill={C.faint} fontSize={10} textAnchor="middle">
              {w.week.slice(5).replace('-', '/')}
            </SvgText>
          </React.Fragment>
        );
      })}
    </Svg>
  );
}

export function LineChart({ points }) {
  const W = 480, H = 150, padL = 38, padB = 24, padT = 12, padR = 10;
  const vals = points.map((p) => p.est1RM);
  const lo = Math.floor((Math.min(...vals) * 0.94) / 5) * 5;
  const hi = Math.ceil((Math.max(...vals) * 1.04) / 5) * 5;
  const span = Math.max(1, hi - lo);
  const iw = W - padL - padR, ih = H - padB - padT;
  const X = (i) => padL + (points.length === 1 ? iw / 2 : (i / (points.length - 1)) * iw);
  const Y = (v) => padT + ih - ((v - lo) / span) * ih;

  const d = points.map((p, i) => `${i ? 'L' : 'M'}${X(i).toFixed(1)},${Y(p.est1RM).toFixed(1)}`).join(' ');
  const area = `${d} L${X(points.length - 1).toFixed(1)},${padT + ih} L${X(0).toFixed(1)},${padT + ih} Z`;

  return (
    <Svg width="100%" height={H} viewBox={`0 0 ${W} ${H}`}>
      {[lo, hi].map((v) => (
        <React.Fragment key={v}>
          <Line x1={padL} y1={Y(v)} x2={W - padR} y2={Y(v)} stroke={C.line} strokeWidth={1} />
          <SvgText x={padL - 6} y={Y(v) + 4} fill={C.faint} fontSize={10} textAnchor="end">{v}</SvgText>
        </React.Fragment>
      ))}
      <Path d={area} fill="rgba(228,255,58,0.10)" />
      <Path d={d} fill="none" stroke={C.accent} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
      {points.map((p, i) => (
        <Circle
          key={i}
          cx={X(i)}
          cy={Y(p.est1RM)}
          r={i === points.length - 1 ? 4 : 2.5}
          fill={i === points.length - 1 ? C.accent : C.muted}
        />
      ))}
    </Svg>
  );
}

const st = StyleSheet.create({
  page: { padding: S.pad, paddingBottom: 60 },
  statGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 9 },
  stat: {
    flexBasis: '48%', flexGrow: 1,
    backgroundColor: C.surface, borderRadius: S.radius, paddingVertical: 13, paddingHorizontal: S.pad,
  },
  statV: { color: C.ink, fontSize: 28, fontWeight: '800' },
  statUnit: { color: C.faint, fontSize: 14, fontWeight: '600' },
  statK: { color: C.faint, fontSize: 10.5, fontWeight: '700', letterSpacing: 0.9, marginTop: 1 },

  barRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  barLabel: { color: C.ink, fontSize: 13, width: 82 },
  barTrack: { flex: 1, height: 7, backgroundColor: C.surface2, borderRadius: 4, overflow: 'hidden' },
  barFill: { height: '100%', backgroundColor: C.accent, borderRadius: 4 },
  barNum: { color: C.muted, fontSize: 11.5, width: 44, textAlign: 'right' },

  prRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 11 },
  border: { borderTopWidth: 1, borderTopColor: C.line },
  prVal: { color: C.ink, fontSize: 17, fontWeight: '700', width: 44, textAlign: 'right' },

  histRow: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingVertical: 13, paddingHorizontal: S.pad,
    backgroundColor: C.surface, marginBottom: 1,
  },
  histVal: { color: C.ink, fontSize: 16, fontWeight: '700' },
});
