import React from 'react';
import { View, Text, ScrollView, Pressable, StyleSheet } from 'react-native';
import { DAYS } from '../../../core/splits.js';
import { dayName, todayISO, schedule } from '../../../core/store.js';
import { store } from '../useStore';
import { C, S, VERDICT, fmtW } from '../theme';
import { Card, H1, H2, Eyebrow, Muted, Btn, Pill, PlateCue } from '../components/ui';

function weekMonday() {
  const d = new Date();
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  return todayISO(d);
}

export default function Today({ state, onStart, onEditDay, onGoPlan }) {
  const today = dayName();
  const pres = store.prescribeFor(today);
  const next = store.nextTrainingDay();

  // ── Rest day ────────────────────────────────────────────────────────────
  if (!pres) {
    const upcoming = next ? store.prescribeFor(next.day) : null;
    return (
      <ScrollView contentContainerStyle={st.page}>
        <Card style={{ alignItems: 'center', paddingVertical: 30 }}>
          <Eyebrow>{today} · Rest day</Eyebrow>
          <H1 style={{ marginTop: 8, marginBottom: 6 }}>Recover.</H1>
          <Muted style={{ textAlign: 'center' }}>
            Muscle is built between sessions, not during them.
          </Muted>
        </Card>

        {next && (
          <Card style={{ marginTop: 12 }}>
            <View style={[st.spread, { marginBottom: 10 }]}>
              <View>
                <Eyebrow>Next session</Eyebrow>
                <H2 style={{ marginTop: 3 }}>{next.name}</H2>
              </View>
              <View style={{ alignItems: 'flex-end' }}>
                <Text style={st.bigDay}>{next.day}</Text>
                <Eyebrow>{next.daysAway === 1 ? 'Tomorrow' : `in ${next.daysAway} days`}</Eyebrow>
              </View>
            </View>
            <PlanList pres={upcoming} />
            <Btn
              title="Start it now anyway"
              variant="ghost"
              style={{ marginTop: 14 }}
              onPress={() => onStart(next.day)}
            />
          </Card>
        )}

        <WeekStrip state={state} today={today} onGoPlan={onGoPlan} />
      </ScrollView>
    );
  }

  // ── Scheduled but empty ─────────────────────────────────────────────────
  if (pres.empty) {
    return (
      <ScrollView contentContainerStyle={st.page}>
        <Eyebrow>{today} · Today</Eyebrow>
        <H1 style={{ marginTop: 5 }}>{pres.name}</H1>
        <Card style={{ marginTop: 14, alignItems: 'center', paddingVertical: 30 }}>
          <H2 style={{ color: C.muted }}>No exercises yet</H2>
          <Muted style={{ textAlign: 'center', marginTop: 7, marginBottom: 16 }}>
            This workout is empty. Add some lifts and it is ready to run.
          </Muted>
          <Btn title="Add exercises" variant="primary" onPress={() => onEditDay(pres.dayId)} />
        </Card>
      </ScrollView>
    );
  }

  // ── Today's workout ─────────────────────────────────────────────────────
  const totalSets = pres.exercises.reduce((a, e) => a + e.sets, 0);
  return (
    <View style={{ flex: 1 }}>
      <ScrollView contentContainerStyle={[st.page, { paddingBottom: 110 }]}>
        <Eyebrow>{today} · Today</Eyebrow>
        <H1 style={{ marginTop: 5 }}>{pres.name}</H1>
        <Muted style={{ marginTop: 7 }}>
          {pres.exercises.length} exercises · {totalSets} working sets
          {pres.rotation > 0 ? ' · rotated accessories' : ''}
        </Muted>

        <Card style={{ marginTop: 14 }}>
          <PlanList pres={pres} />
        </Card>

        <Btn
          title="Edit this workout"
          variant="ghost"
          style={{ marginTop: 12, paddingVertical: 10 }}
          onPress={() => onEditDay(pres.dayId)}
        />

        <WeekStrip state={state} today={today} onGoPlan={onGoPlan} />
      </ScrollView>

      <View style={st.dock}>
        <Btn title="Start workout" variant="primary" style={{ flex: 1 }} onPress={() => onStart(today)} />
      </View>
    </View>
  );
}

function PlanList({ pres }) {
  if (!pres || !pres.exercises.length) return null;
  return (
    <View>
      {pres.exercises.map((e, i) => {
        const [bg, fg, label] = VERDICT[e.verdict] || VERDICT.new;
        return (
          <View key={e.exerciseId} style={[st.planRow, i > 0 && st.planRowBorder]}>
            <View style={st.spread}>
              <View style={{ flex: 1, paddingRight: 10 }}>
                <Text style={st.exName}>{e.name}</Text>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 3 }}>
                  <Muted size={13}>{e.sets} × {e.targetReps}</Muted>
                  <Pill bg={bg} color={fg}>{label}</Pill>
                </View>
              </View>
              <Text style={st.exWeight}>{e.weight > 0 ? `${fmtW(e.weight)} lb` : 'BW'}</Text>
            </View>
            <View style={{ marginTop: 6, gap: 3 }}>
              <PlateCue hint={e.hint} />
              {!!e.reason && <Muted size={12}>{e.reason}</Muted>}
            </View>
          </View>
        );
      })}
    </View>
  );
}

function WeekStrip({ state, today, onGoPlan }) {
  const sched = schedule(state.plan);
  if (!sched.length) return null;
  const monday = weekMonday();
  const done = new Set(state.sessions.filter((s) => s.date >= monday).map((s) => s.day));

  return (
    <Card style={{ marginTop: 12 }}>
      <View style={[st.spread, { marginBottom: 10 }]}>
        <Eyebrow>This week</Eyebrow>
        <Pressable onPress={onGoPlan} hitSlop={8}>
          <Text style={{ color: C.muted, fontSize: 13 }}>Edit ›</Text>
        </Pressable>
      </View>
      <View style={{ flexDirection: 'row', gap: 5 }}>
        {DAYS.map((d) => {
          const slot = sched.find((x) => x.day === d);
          const isDone = done.has(d);
          const isToday = d === today;
          return (
            <View
              key={d}
              style={[
                st.weekCell,
                isDone && { backgroundColor: 'rgba(74,222,128,.13)', borderColor: C.up },
                !isDone && slot && isToday && { backgroundColor: 'rgba(228,255,58,.11)', borderColor: C.accent },
                !slot && { opacity: 0.4 },
              ]}
            >
              <Text
                style={[
                  st.weekDay,
                  isDone && { color: C.up },
                  !isDone && slot && isToday && { color: C.accent },
                ]}
              >
                {d}
              </Text>
              <Text style={st.weekTag} numberOfLines={1}>
                {isDone ? '✓' : slot ? slot.name.split(/[\s&/]+/)[0] : '—'}
              </Text>
            </View>
          );
        })}
      </View>
    </Card>
  );
}

const st = StyleSheet.create({
  page: { padding: S.pad, paddingBottom: 40 },
  spread: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },

  planRow: { paddingVertical: 13 },
  planRowBorder: { borderTopWidth: 1, borderTopColor: C.line },
  exName: { color: C.ink, fontSize: 15, fontWeight: '600' },
  exWeight: { color: C.ink, fontSize: 18, fontWeight: '700' },

  bigDay: { color: C.ink, fontSize: 24, fontWeight: '800' },

  weekCell: {
    flex: 1, paddingVertical: 10, borderRadius: 8, alignItems: 'center',
    backgroundColor: C.surface2, borderWidth: 1, borderColor: 'transparent',
  },
  weekDay: { color: C.muted, fontSize: 12, fontWeight: '700' },
  weekTag: { color: C.faint, fontSize: 9, fontWeight: '600', marginTop: 2 },

  dock: {
    position: 'absolute', left: 0, right: 0, bottom: 0,
    flexDirection: 'row', gap: 9,
    paddingHorizontal: S.pad, paddingTop: 12, paddingBottom: 12,
    backgroundColor: C.ground, borderTopWidth: 1, borderTopColor: C.line,
  },
});
