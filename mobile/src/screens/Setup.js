import React, { useState } from 'react';
import { View, Text, ScrollView, Pressable, StyleSheet } from 'react-native';
import { listPresets, PRESETS, getTemplate, DAYS } from '../../../core/splits.js';
import { EQUIPMENT, EQUIPMENT_LABELS } from '../../../core/exercises.js';
import { store } from '../useStore';
import { C, S } from '../theme';
import { Card, H1, Eyebrow, Muted, Btn, Chip, Field, Input } from '../components/ui';
import ExercisePicker from '../components/ExercisePicker';

const EXPERIENCE = [
  ['beginner', 'Beginner', 'Under a year of consistent lifting'],
  ['intermediate', 'Intermediate', '1 to 3 years'],
  ['advanced', 'Advanced', '3+ years'],
];

const HOW = [
  ['1 · Set your baseline', 'once', 'Height, weight and experience seed your first weights. Your first session corrects them.'],
  ['2 · Train', '2 taps', 'Every set arrives prescribed, down to which plates go on each side. Tap the reps you hit.'],
  ['3 · It adjusts', 'always', 'Hit the top of the range on every set and the weight goes up. Miss twice and it deloads you 10%.'],
];

export default function Setup() {
  const [step, setStep] = useState(0);
  const [d, setD] = useState({
    name: '', heightIn: '70', bodyweight: '180', experience: 'beginner',
    equipment: ['barbell', 'dumbbell', 'cable', 'machine', 'smith', 'bodyweight'],
    favorites: [],
    presetId: 'ppl-arnold',
    trainingDays: ['Mon', 'Tue', 'Wed', 'Fri', 'Sat', 'Sun'],
  });

  const patch = (p) => setD((prev) => ({ ...prev, ...p }));
  const toggle = (key, v, { min = 0 } = {}) => {
    const list = d[key];
    if (list.includes(v)) {
      if (list.length > min) patch({ [key]: list.filter((x) => x !== v) });
    } else {
      patch({ [key]: [...list, v] });
    }
  };

  async function finish() {
    const { presetId, trainingDays, heightIn, bodyweight, ...rest } = d;
    await store.completeSetup(
      {
        ...rest,
        heightIn: Number(heightIn) || 70,
        bodyweight: Number(bodyweight) || 180,
        goal: 'muscle',
      },
      { presetId, trainingDays }
    );
  }

  const Steps = () => (
    <View style={{ flexDirection: 'row', gap: 5, marginVertical: 20 }}>
      {[0, 1, 2, 3].map((i) => (
        <View
          key={i}
          style={{ flex: 1, height: 3, borderRadius: 2, backgroundColor: i <= step ? C.accent : C.line }}
        />
      ))}
    </View>
  );

  // ── Intro ───────────────────────────────────────────────────────────────
  if (step === 0) {
    return (
      <ScrollView contentContainerStyle={st.page}>
        <View style={{ paddingTop: 20, paddingBottom: 14 }}>
          <Eyebrow>Double progression · auto-regulated</Eyebrow>
          <H1 style={{ marginTop: 8, fontSize: 38, lineHeight: 41 }}>
            Lift more than you did last time.
          </H1>
          <Muted size={15} style={{ marginTop: 10 }}>
            Tell it your split. It tells you the exercise, the weight, the plates to load, the sets
            and the reps — then rewrites the next set the moment you log the last one.
          </Muted>
        </View>
        <Steps />
        <Card style={{ gap: 14 }}>
          <Eyebrow>How it works</Eyebrow>
          {HOW.map(([title, tag, body]) => (
            <View key={title} style={{ gap: 3 }}>
              <View style={st.spread}>
                <Text style={st.rowName}>{title}</Text>
                <Text style={st.rowTag}>{tag}</Text>
              </View>
              <Muted size={12.5}>{body}</Muted>
            </View>
          ))}
        </Card>
        <Btn title="Set up my plan" variant="primary" onPress={() => setStep(1)} style={{ marginTop: 14 }} />
      </ScrollView>
    );
  }

  // ── Numbers ─────────────────────────────────────────────────────────────
  if (step === 1) {
    return (
      <ScrollView contentContainerStyle={st.page} keyboardShouldPersistTaps="handled">
        <Steps />
        <H1>Your numbers</H1>
        <Muted style={{ marginTop: 8, marginBottom: 16 }}>
          Used to seed starting weights. Rough is fine — the first session corrects them.
        </Muted>

        <View style={{ gap: 14 }}>
          <Field label="Name">
            <Input value={d.name} onChangeText={(v) => patch({ name: v })} placeholder="Optional" />
          </Field>

          <View style={{ flexDirection: 'row', gap: 12 }}>
            <View style={{ flex: 1 }}>
              <Field label="Height (in)">
                <Input
                  value={d.heightIn}
                  onChangeText={(v) => patch({ heightIn: v })}
                  keyboardType="number-pad"
                />
              </Field>
            </View>
            <View style={{ flex: 1 }}>
              <Field label="Bodyweight (lbs)">
                <Input
                  value={d.bodyweight}
                  onChangeText={(v) => patch({ bodyweight: v })}
                  keyboardType="number-pad"
                />
              </Field>
            </View>
          </View>

          <Field label="Training experience">
            <View style={{ gap: 7 }}>
              {EXPERIENCE.map(([v, label, sub]) => (
                <Pressable
                  key={v}
                  onPress={() => patch({ experience: v })}
                  style={[st.opt, d.experience === v && st.optOn]}
                >
                  <Text style={st.optTitle}>{label}</Text>
                  <Muted size={12.5}>{sub}</Muted>
                </Pressable>
              ))}
            </View>
          </Field>

          <Field label="Equipment you have">
            <View style={st.wrap}>
              {EQUIPMENT.map((e) => (
                <Chip
                  key={e}
                  label={EQUIPMENT_LABELS[e]}
                  active={d.equipment.includes(e)}
                  onPress={() => toggle('equipment', e, { min: 1 })}
                />
              ))}
            </View>
          </Field>

          <View style={{ flexDirection: 'row', gap: 9 }}>
            <Btn title="Back" variant="ghost" onPress={() => setStep(0)} />
            <Btn title="Continue" variant="primary" style={{ flex: 1 }} onPress={() => setStep(2)} />
          </View>
        </View>
      </ScrollView>
    );
  }

  // ── Split ───────────────────────────────────────────────────────────────
  if (step === 2) {
    const preset = PRESETS[d.presetId];
    const week = DAYS.filter((x) => d.trainingDays.includes(x));
    return (
      <ScrollView contentContainerStyle={st.page}>
        <Steps />
        <H1>Your split</H1>
        <Muted style={{ marginTop: 8, marginBottom: 16 }}>
          Pick a starting point and your days. You can rearrange every day and every exercise afterward.
        </Muted>

        <View style={{ gap: 8 }}>
          {listPresets().map((p) => (
            <Pressable
              key={p.id}
              onPress={() => patch({ presetId: p.id })}
              style={[st.opt, d.presetId === p.id && st.optOn]}
            >
              <Text style={st.optTitle}>{p.name}</Text>
              <Muted size={12.5}>{p.description}</Muted>
            </Pressable>
          ))}
        </View>

        <View style={{ marginTop: 16, gap: 6 }}>
          <Text style={st.label}>TRAINING DAYS</Text>
          <View style={{ flexDirection: 'row', gap: 5 }}>
            {DAYS.map((day) => {
              const on = d.trainingDays.includes(day);
              return (
                <Pressable
                  key={day}
                  onPress={() => toggle('trainingDays', day)}
                  style={[st.day, on && st.dayOn]}
                >
                  <Text style={[st.dayText, on && { color: C.accent }]}>{day}</Text>
                </Pressable>
              );
            })}
          </View>
        </View>

        {week.length > 0 && (
          <View style={{ marginTop: 16, gap: 6 }}>
            <Text style={st.label}>YOUR WEEK</Text>
            <View style={{ borderRadius: 8, overflow: 'hidden' }}>
              {week.map((day, i) => {
                const t = getTemplate(preset.rotation[i % preset.rotation.length]);
                return (
                  <View key={day} style={st.schedRow}>
                    <Text style={st.schedDay}>{day}</Text>
                    <Text style={st.schedName}>{t.name}</Text>
                  </View>
                );
              })}
            </View>
          </View>
        )}

        <View style={{ flexDirection: 'row', gap: 9, marginTop: 18 }}>
          <Btn title="Back" variant="ghost" onPress={() => setStep(1)} />
          <Btn
            title="Continue"
            variant="primary"
            style={{ flex: 1 }}
            disabled={!d.trainingDays.length}
            onPress={() => setStep(3)}
          />
        </View>
      </ScrollView>
    );
  }

  // ── Favorites ───────────────────────────────────────────────────────────
  return (
    <View style={[st.page, { flex: 1, paddingBottom: 0 }]}>
      <Steps />
      <H1>Favorite lifts</H1>
      <Muted style={{ marginTop: 8, marginBottom: 12 }}>
        Star any you want prioritized — they get picked first when they fit a slot. Skip if you have
        no preference.
      </Muted>
      <Muted size={12.5} style={{ marginBottom: 8 }}>{d.favorites.length} starred</Muted>

      <ExercisePicker
        equipment={d.equipment}
        selected={d.favorites}
        onPick={(id) => toggle('favorites', id)}
      />

      <View style={{ flexDirection: 'row', gap: 9, paddingVertical: 12 }}>
        <Btn title="Back" variant="ghost" onPress={() => setStep(2)} />
        <Btn title="Build my plan" variant="primary" style={{ flex: 1 }} onPress={finish} />
      </View>
    </View>
  );
}

const st = StyleSheet.create({
  page: { padding: S.pad, paddingBottom: 40 },
  spread: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
  rowName: { color: C.ink, fontWeight: '600', fontSize: 15 },
  rowTag: { color: C.ink, fontSize: 17, fontWeight: '700' },
  label: { fontSize: 12, fontWeight: '700', letterSpacing: 0.6, color: C.muted },

  opt: {
    padding: 14, borderRadius: 9, backgroundColor: C.surface2,
    borderWidth: 1, borderColor: 'transparent', gap: 3,
  },
  optOn: { borderColor: C.accent, backgroundColor: 'rgba(228,255,58,.07)' },
  optTitle: { color: C.ink, fontWeight: '700', fontSize: 15 },

  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },

  day: {
    flex: 1, paddingVertical: 13, borderRadius: 8, alignItems: 'center',
    backgroundColor: C.surface2, borderWidth: 1, borderColor: 'transparent',
  },
  dayOn: { backgroundColor: 'rgba(228,255,58,.11)', borderColor: C.accent },
  dayText: { color: C.muted, fontWeight: '700', fontSize: 13 },

  schedRow: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingVertical: 10, paddingHorizontal: 13, backgroundColor: C.surface2, marginBottom: 1,
  },
  schedDay: { color: C.muted, fontWeight: '700', fontSize: 14 },
  schedName: { color: C.ink, fontSize: 14 },
});
