import React from 'react';
import { View, Text, ScrollView, Pressable, StyleSheet, Modal, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { getDay } from '../../../core/store.js';
import { getExercise, EQUIPMENT_LABELS, MUSCLE_LABELS } from '../../../core/exercises.js';
import { store } from '../useStore';
import { C, S, fmtW, fmtVol } from '../theme';
import { H2, Eyebrow, Muted, Btn, Pill, Card } from '../components/ui';
import ExercisePicker from '../components/ExercisePicker';
import { LineChart } from './Progress';

/** One modal host — only one sheet is ever open. */
export default function Sheet({ sheet, state, onClose, onOpen }) {
  if (!sheet) return null;

  const body = {
    assign: () => <AssignSheet sheet={sheet} state={state} onClose={onClose} onOpen={onOpen} />,
    editDay: () => <EditDaySheet sheet={sheet} state={state} onClose={onClose} onOpen={onOpen} />,
    addExercise: () => <AddExerciseSheet sheet={sheet} state={state} onOpen={onOpen} />,
    swap: () => <SwapSheet sheet={sheet} state={state} onClose={onClose} />,
    addToSession: () => <AddToSessionSheet state={state} onClose={onClose} />,
    detail: () => <DetailSheet sheet={sheet} state={state} />,
    session: () => <SessionSheet sheet={sheet} state={state} />,
  }[sheet.kind];

  return (
    <Modal visible animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <SafeAreaView style={{ flex: 1, backgroundColor: C.surface }} edges={['top', 'bottom']}>
        <View style={st.sheet}>
          <View style={st.head}>
            <View style={{ flex: 1 }}>
              <H2>{sheet.title || ''}</H2>
              {!!sheet.subtitle && <Muted style={{ marginTop: 2 }}>{sheet.subtitle}</Muted>}
            </View>
            <Pressable onPress={onClose} hitSlop={12} style={st.x}>
              <Text style={{ color: C.muted, fontSize: 20 }}>✕</Text>
            </Pressable>
          </View>
          {body ? body() : null}
        </View>
      </SafeAreaView>
    </Modal>
  );
}

// ── Assign a workout to a weekday ─────────────────────────────────────────
function AssignSheet({ sheet, state, onClose, onOpen }) {
  const current = state.plan.week[sheet.weekday];

  async function pick(dayId) {
    await store.assignDay(sheet.weekday, dayId);
    onClose();
  }

  return (
    <ScrollView contentContainerStyle={{ gap: 7, paddingBottom: 30 }}>
      <Pressable onPress={() => pick(null)} style={st.optRow}>
        <View style={{ flex: 1 }}>
          <Text style={[st.optName, current && { color: C.muted }]}>Rest day</Text>
          <Muted size={11.5}>Nothing scheduled</Muted>
        </View>
        {!current && <Text style={st.check}>✓</Text>}
      </Pressable>

      {state.plan.days.map((d) => {
        const count = Array.isArray(d.exercises)
          ? d.exercises.length
          : (d.slots || []).reduce((a, s) => a + s.count, 0);
        return (
          <Pressable key={d.id} onPress={() => pick(d.id)} style={st.optRow}>
            <View style={{ flex: 1 }}>
              <Text style={st.optName}>{d.name}</Text>
              <Muted size={11.5}>
                {count} exercises{Array.isArray(d.exercises) ? '' : ' · auto-picked'}
              </Muted>
            </View>
            {current === d.id && <Text style={st.check}>✓</Text>}
          </Pressable>
        );
      })}

      <Btn
        title="+ Create a new workout"
        variant="ghost"
        style={{ marginTop: 6 }}
        onPress={() => onOpen({ kind: 'newDay' })}
      />
    </ScrollView>
  );
}

// ── Edit one workout ──────────────────────────────────────────────────────
function EditDaySheet({ sheet, state, onClose, onOpen }) {
  const day = getDay(state.plan, sheet.dayId);
  if (!day) return <Muted>Workout not found.</Muted>;

  const pinned = Array.isArray(day.exercises);
  const list = pinned
    ? day.exercises.map((x) => ({ ...x, meta: getExercise(x.exerciseId) })).filter((x) => x.meta)
    : [];

  function confirmDelete() {
    Alert.alert(
      `Delete “${day.name}”?`,
      'Any days running it become rest days. Logged history is kept.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => { await store.removeDay(day.id); onClose(); },
        },
      ]
    );
  }

  function confirmUnpin() {
    Alert.alert(
      'Hand this back to the app?',
      'Your chosen exercises will be replaced by automatic picks.',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Auto-pick', onPress: () => store.unpinDay(day.id) },
      ]
    );
  }

  return (
    <ScrollView contentContainerStyle={{ paddingBottom: 30, gap: 12 }}>
      {pinned ? (
        <>
          <View style={st.spread}>
            <Eyebrow>Exercises · {list.length}</Eyebrow>
            <Pressable onPress={confirmUnpin} hitSlop={8}>
              <Text style={{ color: C.muted, fontSize: 12.5 }}>Auto-pick instead</Text>
            </Pressable>
          </View>

          <View style={{ gap: 6 }}>
            {list.length ? (
              list.map((x, i) => (
                <View key={x.exerciseId} style={st.exEdit}>
                  <View style={{ gap: 2 }}>
                    <Pressable
                      onPress={() => store.moveExerciseInDay(day.id, x.exerciseId, -1)}
                      disabled={i === 0}
                      hitSlop={6}
                    >
                      <Text style={[st.arrow, i === 0 && { opacity: 0.25 }]}>▲</Text>
                    </Pressable>
                    <Pressable
                      onPress={() => store.moveExerciseInDay(day.id, x.exerciseId, 1)}
                      disabled={i === list.length - 1}
                      hitSlop={6}
                    >
                      <Text style={[st.arrow, i === list.length - 1 && { opacity: 0.25 }]}>▼</Text>
                    </Pressable>
                  </View>

                  <View style={{ flex: 1 }}>
                    <Text style={st.optName}>{x.meta.name}</Text>
                    <Muted size={11.5}>
                      {EQUIPMENT_LABELS[x.meta.equipment]} · {x.meta.repRange[0]}–{x.meta.repRange[1]} reps
                    </Muted>
                  </View>

                  <View style={st.setStep}>
                    <Pressable
                      onPress={() => store.setExerciseSets(day.id, x.exerciseId, Math.max(1, x.sets - 1))}
                      style={st.stepBtn}
                      hitSlop={4}
                    >
                      <Text style={{ color: C.muted, fontSize: 16 }}>−</Text>
                    </Pressable>
                    <Text style={st.setCount}>{x.sets}</Text>
                    <Pressable
                      onPress={() => store.setExerciseSets(day.id, x.exerciseId, x.sets + 1)}
                      style={st.stepBtn}
                      hitSlop={4}
                    >
                      <Text style={{ color: C.muted, fontSize: 16 }}>+</Text>
                    </Pressable>
                  </View>

                  <Pressable onPress={() => store.removeExerciseFromDay(day.id, x.exerciseId)} hitSlop={8}>
                    <Text style={{ color: C.faint, fontSize: 15 }}>✕</Text>
                  </Pressable>
                </View>
              ))
            ) : (
              <Card><Muted style={{ textAlign: 'center' }}>No exercises yet.</Muted></Card>
            )}
          </View>

          <Btn
            title="+ Add exercise"
            variant="primary"
            onPress={() => onOpen({ kind: 'addExercise', dayId: day.id, title: `Add to ${day.name}` })}
          />
        </>
      ) : (
        <Card style={{ backgroundColor: C.surface2, gap: 10 }}>
          <View style={st.spread}>
            <Eyebrow>Auto-picked</Eyebrow>
            <Pill bg="rgba(96,165,250,.14)" color={C.new}>Automatic</Pill>
          </View>
          <Muted>
            The app fills this day from your equipment and favorites, rotating accessories on the
            week&apos;s second pass.
          </Muted>
          <View style={{ gap: 5 }}>
            {(day.slots || []).map((s, i) => (
              <View key={i} style={st.spread}>
                <Muted size={13}>{s.count}× {s.tier}</Muted>
                <Muted size={13}>{s.muscles.map((m) => MUSCLE_LABELS[m] || m).join(' / ')}</Muted>
              </View>
            ))}
          </View>
          <Btn title="Pick the exercises myself" variant="primary" onPress={() => store.pinDay(day.id)} />
        </Card>
      )}

      <View style={{ flexDirection: 'row', gap: 9, marginTop: 4 }}>
        <Btn
          title="Duplicate"
          variant="ghost"
          style={{ flex: 1 }}
          onPress={async () => {
            const copy = await store.duplicateDay(day.id);
            if (copy) onOpen({ kind: 'editDay', dayId: copy.id, title: copy.name });
          }}
        />
        <Btn title="Delete workout" variant="danger" style={{ flex: 1 }} onPress={confirmDelete} />
      </View>
    </ScrollView>
  );
}

// ── Add an exercise to a workout ──────────────────────────────────────────
function AddExerciseSheet({ sheet, state, onOpen }) {
  const day = getDay(state.plan, sheet.dayId);
  if (!day) return <Muted>Workout not found.</Muted>;
  const selected = Array.isArray(day.exercises) ? day.exercises.map((x) => x.exerciseId) : [];

  return (
    <ExercisePicker
      equipment={state.profile.equipment}
      selected={selected}
      onPick={async (id) => {
        if (selected.includes(id)) await store.removeExerciseFromDay(day.id, id);
        else await store.addExerciseToDay(day.id, id);
      }}
      footer={
        <Btn
          title="Done"
          variant="primary"
          onPress={() => onOpen({ kind: 'editDay', dayId: day.id, title: day.name })}
        />
      }
    />
  );
}

// ── Swap the current exercise mid-session ─────────────────────────────────
function SwapSheet({ sheet, state, onClose }) {
  const ex = state.activeSession?.exercises[sheet.exIdx];
  if (!ex) return null;
  return (
    <ExercisePicker
      equipment={state.profile.equipment}
      selected={[ex.exerciseId]}
      onPick={async (id) => { await store.swapExercise(sheet.exIdx, id); onClose(); }}
    />
  );
}

function AddToSessionSheet({ state, onClose }) {
  const existing = state.activeSession?.exercises.map((e) => e.exerciseId) || [];
  return (
    <ExercisePicker
      equipment={state.profile.equipment}
      selected={existing}
      onPick={async (id) => { await store.addExerciseToSession(id); onClose(); }}
    />
  );
}

// ── One lift's history ────────────────────────────────────────────────────
function DetailSheet({ sheet, state }) {
  const hist = store.exerciseHistory(sheet.exerciseId);
  const cur = state.exerciseState[sheet.exerciseId];
  if (!hist.length) return <Muted>No history yet.</Muted>;

  const delta = hist[hist.length - 1].est1RM - hist[0].est1RM;

  return (
    <ScrollView contentContainerStyle={{ paddingBottom: 30 }}>
      <View style={{ flexDirection: 'row', gap: 5, marginBottom: 14 }}>
        <Text style={{ color: delta >= 0 ? C.up : C.down, fontSize: 13, fontWeight: '600' }}>
          {delta >= 0 ? '+' : ''}{delta} lb est. 1RM
        </Text>
        <Muted size={13}>since {hist[0].date}</Muted>
      </View>

      {hist.length > 1 && (
        <View style={{ marginBottom: 14 }}>
          <LineChart points={hist} />
        </View>
      )}

      {!!cur?.reason && (
        <View style={st.coach}>
          <Text style={{ color: C.ink, fontSize: 13.5, lineHeight: 19 }}>{cur.reason}</Text>
        </View>
      )}

      <View style={{ marginTop: 12 }}>
        {[...hist].reverse().slice(0, 12).map((h, i) => (
          <View key={i} style={st.logRow}>
            <Text style={{ color: C.faint, fontSize: 11, width: 38 }}>{h.date.slice(5)}</Text>
            <Text style={{ color: C.ink, fontSize: 15, fontWeight: '700', flex: 1 }}>
              {fmtW(h.topWeight)} × {h.topReps}
            </Text>
            <Muted size={12}>{h.sets} sets · {fmtVol(h.volume)} lb</Muted>
          </View>
        ))}
      </View>
    </ScrollView>
  );
}

// ── One past session ──────────────────────────────────────────────────────
function SessionSheet({ sheet, state }) {
  const s = state.sessions.find((x) => x.id === sheet.sessionId);
  if (!s) return <Muted>Session not found.</Muted>;

  return (
    <ScrollView contentContainerStyle={{ paddingBottom: 30, gap: 16 }}>
      {s.exercises.map((ex, i) => (
        <View key={i}>
          <Text style={{ color: C.ink, fontSize: 16, fontWeight: '700', marginBottom: 5 }}>
            {ex.name}
          </Text>
          {ex.sets.map((x, j) => (
            <View key={j} style={st.logRow}>
              <Text style={{ color: C.faint, fontSize: 11, width: 16 }}>{j + 1}</Text>
              <Text style={{ color: C.ink, fontSize: 15, fontWeight: '700', flex: 1 }}>
                {fmtW(x.actualWeight ?? x.weight)} lb × {x.actualReps}
              </Text>
              <Text style={{ color: x.actualReps >= x.targetReps ? C.up : C.hold, fontSize: 12 }}>
                {x.actualReps >= x.targetReps ? '✓' : `vs ${x.targetReps}`}
              </Text>
            </View>
          ))}
        </View>
      ))}
    </ScrollView>
  );
}

const st = StyleSheet.create({
  sheet: { flex: 1, padding: S.pad },
  head: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, marginBottom: 14 },
  x: { padding: 4 },
  spread: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },

  optRow: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    padding: 12, borderRadius: 8, backgroundColor: C.surface2,
  },
  optName: { color: C.ink, fontSize: 14.5, fontWeight: '600' },
  check: { color: C.accent, fontSize: 17, fontWeight: '700' },

  exEdit: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    padding: 10, borderRadius: 8, backgroundColor: C.surface2,
  },
  arrow: { color: C.faint, fontSize: 10, paddingHorizontal: 4 },
  setStep: { flexDirection: 'row', alignItems: 'center', gap: 2 },
  stepBtn: {
    width: 26, height: 26, borderRadius: 6, backgroundColor: C.surface3,
    alignItems: 'center', justifyContent: 'center',
  },
  setCount: { color: C.ink, fontSize: 15, fontWeight: '700', minWidth: 22, textAlign: 'center' },

  coach: {
    padding: 11, borderRadius: 8,
    backgroundColor: C.surface2, borderLeftWidth: 3, borderLeftColor: C.accent,
  },
  logRow: {
    flexDirection: 'row', alignItems: 'center', gap: 11,
    paddingVertical: 10, paddingHorizontal: 12,
    backgroundColor: C.surface2, marginBottom: 1, borderRadius: 6,
  },
});
