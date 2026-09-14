import React, { useState, useEffect, useRef } from 'react';
import { View, Text, ScrollView, Pressable, StyleSheet, Alert } from 'react-native';
import * as Haptics from 'expo-haptics';
import { useKeepAwake } from 'expo-keep-awake';
import { getExercise } from '../../../core/exercises.js';
import { store } from '../useStore';
import { C, S, fmtW } from '../theme';
import { Card, H2, Eyebrow, Muted, Btn, PlateCue, Pips } from '../components/ui';

export default function Session({ state, onSwap, onAddExercise, onFinished }) {
  // The screen must not sleep between sets — you put the phone down mid-workout.
  useKeepAwake();

  const s = state.activeSession;
  const [activeEx, setActiveEx] = useState(0);
  const [coach, setCoach] = useState(null);
  const [restUntil, setRestUntil] = useState(null);
  const [, forceTick] = useState(0);
  const timer = useRef(null);

  // Tick the rest countdown once a second while one is running.
  useEffect(() => {
    if (!restUntil) return undefined;
    timer.current = setInterval(() => forceTick((n) => n + 1), 1000);
    return () => clearInterval(timer.current);
  }, [restUntil]);

  if (!s) return null;
  const idx = Math.min(activeEx, s.exercises.length - 1);
  const ex = s.exercises[idx];
  const setIdx = ex.sets.findIndex((x) => !x.done);
  const cur = setIdx >= 0 ? ex.sets[setIdx] : null;
  const meta = getExercise(ex.exerciseId);

  const doneSets = s.exercises.reduce((a, e) => a + e.sets.filter((x) => x.done).length, 0);
  const totalSets = s.exercises.reduce((a, e) => a + e.sets.length, 0);
  const hint = cur ? store.hintFor(cur.weight, ex.loading) : null;

  async function logReps(reps) {
    if (!cur) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    const advice = await store.logSet(idx, setIdx, reps, cur.weight);
    setCoach(advice ? advice.reason : null);

    if (advice) {
      // Rest scales with how heavy the lift is — a compound needs more than a curl.
      const secs = meta?.tier === 'primary' ? 180 : meta?.tier === 'secondary' ? 120 : 75;
      setRestUntil(Date.now() + secs * 1000);
    } else {
      setRestUntil(null);
    }
  }

  async function bumpWeight(dir) {
    if (!cur) return;
    Haptics.selectionAsync();
    const step = ex.increment || 5;
    await store.overrideWeight(idx, setIdx, Math.max(0, cur.weight + dir * step));
  }

  function goEx(n) {
    setActiveEx(n);
    setCoach(null);
    setRestUntil(null);
  }

  function confirmFinish() {
    Alert.alert('Finish workout?', `${doneSets} set${doneSets === 1 ? '' : 's'} logged.`, [
      { text: 'Keep going', style: 'cancel' },
      {
        text: 'Finish',
        style: 'default',
        onPress: async () => {
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
          const done = await store.finishSession();
          onFinished(done);
        },
      },
    ]);
  }

  function confirmDiscard() {
    Alert.alert('Discard this workout?', 'Nothing will be saved.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Discard', style: 'destructive', onPress: () => store.discardSession() },
    ]);
  }

  // Rep buttons center on the target so the expected outcome is one tap.
  const reps = [];
  const start = cur ? Math.max(0, cur.targetReps - 2) : ex.repRange[0];
  for (let r = start; reps.length < 5; r++) reps.push(r);

  const restLeft = restUntil ? Math.max(0, Math.ceil((restUntil - Date.now()) / 1000)) : 0;

  return (
    <View style={{ flex: 1 }}>
      <ScrollView contentContainerStyle={[st.page, { paddingBottom: 110 }]}>
        <View style={st.spread}>
          <View>
            <Eyebrow>{s.name} · in progress</Eyebrow>
            <Muted style={{ marginTop: 2 }}>{doneSets} of {totalSets} sets logged</Muted>
          </View>
          <Pips
            items={s.exercises.map((e, i) =>
              e.sets.every((x) => x.done) ? 'done' : i === idx ? 'now' : 'todo'
            )}
          />
        </View>

        <View style={{ marginTop: 14 }}>
          <View style={[st.spread, { alignItems: 'flex-end' }]}>
            <H2 style={{ fontSize: 24, flex: 1 }}>{ex.name}</H2>
            <Muted size={12}>{idx + 1}/{s.exercises.length}</Muted>
          </View>
          <Muted style={{ marginTop: 2 }}>
            Target range {ex.repRange[0]}–{ex.repRange[1]} reps
            {ex.unilateral ? ' · per side' : ''}
            {meta?.notes ? ` · ${meta.notes}` : ''}
          </Muted>
        </View>

        {cur ? (
          <View style={st.live}>
            <View style={st.liveBar} />
            <View style={[st.spread, { marginBottom: 2 }]}>
              <Text style={st.setNo}>SET {setIdx + 1} OF {ex.sets.length}</Text>
              <Pips
                items={ex.sets.map((x, i) =>
                  !x.done ? (i === setIdx ? 'now' : 'todo') : x.actualReps >= x.targetReps ? 'done' : 'miss'
                )}
              />
            </View>

            <View style={st.weightLine}>
              <Pressable onPress={() => bumpWeight(-1)} style={st.wbtn} hitSlop={6}>
                <Text style={st.wbtnText}>−</Text>
              </Pressable>
              <View style={{ flexDirection: 'row', alignItems: 'baseline' }}>
                <Text style={st.weight}>
                  {ex.bodyweightLoad && cur.weight === 0 ? 'BW' : fmtW(cur.weight)}
                </Text>
                {!(ex.bodyweightLoad && cur.weight === 0) && <Text style={st.weightUnit}>LB</Text>}
              </View>
              <Pressable onPress={() => bumpWeight(1)} style={st.wbtn} hitSlop={6}>
                <Text style={st.wbtnText}>+</Text>
              </Pressable>
            </View>

            <View style={{ marginTop: 8, marginBottom: 2 }}>
              <PlateCue hint={hint} center />
            </View>

            <Text style={st.target}>
              aim for <Text style={st.targetNum}>{cur.targetReps}</Text> reps
            </Text>

            <Text style={st.tapLabel}>TAP THE REPS YOU ACTUALLY GOT</Text>
            <View style={st.repGrid}>
              {reps.map((r) => {
                const isTarget = r === cur.targetReps;
                return (
                  <Pressable
                    key={r}
                    onPress={() => logReps(r)}
                    style={({ pressed }) => [
                      st.rep,
                      isTarget && { backgroundColor: C.accent },
                      pressed && { opacity: 0.7, transform: [{ scale: 0.95 }] },
                    ]}
                  >
                    <Text
                      style={[
                        st.repText,
                        isTarget && { color: C.accentInk },
                        !isTarget && r > cur.targetReps && { color: C.up },
                        !isTarget && r < cur.targetReps && { color: C.muted },
                      ]}
                    >
                      {r}
                    </Text>
                  </Pressable>
                );
              })}
            </View>

            {!!coach && (
              <View style={st.coach}>
                <Text style={st.coachText}>{coach}</Text>
              </View>
            )}

            {restUntil && (
              <View style={[st.rest, restLeft === 0 && { borderColor: C.up }]}>
                {restLeft > 0 ? (
                  <>
                    <Muted>Rest</Muted>
                    <Text style={st.restTime}>
                      {Math.floor(restLeft / 60)}:{String(restLeft % 60).padStart(2, '0')}
                    </Text>
                    <Pressable onPress={() => setRestUntil(null)} hitSlop={8}>
                      <Text style={{ color: C.faint, fontSize: 13 }}>skip</Text>
                    </Pressable>
                  </>
                ) : (
                  <Text style={[st.restTime, { color: C.up }]}>Rested — go</Text>
                )}
              </View>
            )}
          </View>
        ) : (
          <View style={[st.live, { alignItems: 'center' }]}>
            <View style={st.liveBar} />
            <Text style={st.setNo}>{ex.name.toUpperCase()} COMPLETE</Text>
            <Text style={[st.weight, { fontSize: 50, color: C.up, marginVertical: 10 }]}>✓</Text>
            <Muted style={{ marginBottom: 14 }}>All {ex.sets.length} sets logged.</Muted>
            <Btn
              title={idx + 1 < s.exercises.length ? `Next: ${s.exercises[idx + 1].name}` : 'Review & finish'}
              variant="primary"
              style={{ alignSelf: 'stretch' }}
              onPress={() => (idx + 1 < s.exercises.length ? goEx(idx + 1) : confirmFinish())}
            />
          </View>
        )}

        {/* Logged sets for this exercise */}
        {ex.sets.some((x) => x.done) && (
          <View style={{ marginTop: 16 }}>
            <Eyebrow style={{ marginBottom: 7 }}>Logged</Eyebrow>
            {ex.sets.map((x, i) => {
              if (!x.done) return null;
              const hit = x.actualReps >= x.targetReps;
              return (
                <View key={i} style={st.logRow}>
                  <Text style={st.logIx}>{i + 1}</Text>
                  <Text style={st.logRes}>
                    {fmtW(x.actualWeight)} lb × {x.actualReps}
                  </Text>
                  <Text style={{ color: hit ? C.up : C.hold, fontSize: 12 }}>
                    {hit ? '✓' : `${x.actualReps - x.targetReps}`}
                    <Text style={{ color: C.muted }}> vs {x.targetReps}</Text>
                  </Text>
                  <Pressable onPress={() => store.unlogSet(idx, i)} hitSlop={8}>
                    <Text style={{ color: C.faint, fontSize: 12 }}>undo</Text>
                  </Pressable>
                </View>
              );
            })}
          </View>
        )}

        <View style={{ flexDirection: 'row', gap: 7, marginTop: 14 }}>
          <Btn title="← Prev" variant="ghost" style={st.navBtn} disabled={idx === 0} onPress={() => goEx(idx - 1)} />
          <Btn title="+ Set" variant="ghost" style={[st.navBtn, { flex: 1 }]} onPress={() => store.addSet(idx)} />
          <Btn title="Swap" variant="ghost" style={[st.navBtn, { flex: 1 }]} onPress={() => onSwap(idx)} />
          <Btn
            title="Next →"
            variant="ghost"
            style={st.navBtn}
            disabled={idx + 1 >= s.exercises.length}
            onPress={() => goEx(idx + 1)}
          />
        </View>

        <Card style={{ marginTop: 12 }}>
          <View style={[st.spread, { marginBottom: 8 }]}>
            <Eyebrow>Rest of the session</Eyebrow>
            <Pressable onPress={onAddExercise} hitSlop={8}>
              <Text style={{ color: C.accent, fontSize: 13, fontWeight: '600' }}>+ Add exercise</Text>
            </Pressable>
          </View>
          {s.exercises.map((e, i) => {
            const d = e.sets.filter((x) => x.done).length;
            const complete = d === e.sets.length;
            return (
              <Pressable
                key={e.exerciseId + i}
                onPress={() => goEx(i)}
                style={[st.upRow, { opacity: i === idx ? 1 : 0.6 }]}
              >
                <View style={{ flex: 1 }}>
                  <Text style={st.upName}>{e.name}</Text>
                  <Muted size={12.5}>
                    {d}/{e.sets.length} sets · {e.plannedWeight > 0 ? `${fmtW(e.plannedWeight)} lb` : 'BW'}
                  </Muted>
                </View>
                <Text style={{ color: complete ? C.up : C.faint, fontSize: 15, fontWeight: '700' }}>
                  {complete ? '✓' : `${e.plannedSets}×${e.plannedReps}`}
                </Text>
              </Pressable>
            );
          })}
        </Card>
      </ScrollView>

      <View style={st.dock}>
        <Btn title="Discard" variant="ghost" onPress={confirmDiscard} />
        <Btn
          title={`Finish${doneSets ? ` · ${doneSets} set${doneSets === 1 ? '' : 's'}` : ''}`}
          variant="primary"
          style={{ flex: 1 }}
          disabled={doneSets === 0}
          onPress={confirmFinish}
        />
      </View>
    </View>
  );
}

const st = StyleSheet.create({
  page: { padding: S.pad },
  spread: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },

  live: {
    backgroundColor: C.surface, borderRadius: 14, padding: S.pad, paddingTop: 20,
    borderWidth: 1, borderColor: C.line, marginTop: 14, overflow: 'hidden',
  },
  liveBar: { position: 'absolute', top: 0, left: 0, right: 0, height: 3, backgroundColor: C.accent },
  setNo: { color: C.accent, fontSize: 11, fontWeight: '800', letterSpacing: 1.3 },

  weightLine: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 14, marginTop: 6 },
  wbtn: {
    width: 46, height: 46, borderRadius: 23, backgroundColor: C.surface2,
    alignItems: 'center', justifyContent: 'center',
  },
  wbtnText: { color: C.muted, fontSize: 24, lineHeight: 28 },
  weight: { color: C.ink, fontSize: 68, fontWeight: '800', letterSpacing: -1.5 },
  weightUnit: { color: C.faint, fontSize: 16, fontWeight: '700', marginLeft: 4 },

  target: { color: C.muted, fontSize: 14, textAlign: 'center', marginTop: 6 },
  targetNum: { color: C.ink, fontSize: 18, fontWeight: '800' },

  tapLabel: {
    color: C.faint, fontSize: 11, fontWeight: '600', letterSpacing: 1.3,
    textAlign: 'center', marginTop: 16,
  },
  repGrid: { flexDirection: 'row', gap: 6, marginTop: 10 },
  rep: {
    flex: 1, paddingVertical: 15, borderRadius: 9,
    backgroundColor: C.surface2, alignItems: 'center',
  },
  repText: { color: C.ink, fontSize: 21, fontWeight: '800' },

  coach: {
    marginTop: 13, padding: 11, borderRadius: 8,
    backgroundColor: C.surface2, borderLeftWidth: 3, borderLeftColor: C.accent,
  },
  coachText: { color: C.ink, fontSize: 13.5, lineHeight: 19 },

  rest: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10,
    marginTop: 12, padding: 10, borderRadius: 8,
    backgroundColor: C.surface2, borderWidth: 1, borderColor: 'transparent',
  },
  restTime: { color: C.ink, fontSize: 20, fontWeight: '800' },

  logRow: {
    flexDirection: 'row', alignItems: 'center', gap: 11,
    paddingVertical: 10, paddingHorizontal: 13,
    backgroundColor: C.surface, marginBottom: 1, borderRadius: 6,
  },
  logIx: { color: C.faint, fontSize: 11, width: 12 },
  logRes: { color: C.ink, fontSize: 16, fontWeight: '700', flex: 1 },

  navBtn: { paddingVertical: 10, paddingHorizontal: 12 },

  upRow: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingVertical: 11, borderTopWidth: 1, borderTopColor: C.line,
  },
  upName: { color: C.ink, fontSize: 14.5, fontWeight: '600' },

  dock: {
    position: 'absolute', left: 0, right: 0, bottom: 0,
    flexDirection: 'row', gap: 9,
    paddingHorizontal: S.pad, paddingTop: 12, paddingBottom: 12,
    backgroundColor: C.ground, borderTopWidth: 1, borderTopColor: C.line,
  },
});
