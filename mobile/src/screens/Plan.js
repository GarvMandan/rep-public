import React from 'react';
import { View, Text, ScrollView, Pressable, StyleSheet, Alert } from 'react-native';
import { DAYS, listPresets, PRESETS } from '../../../core/splits.js';
import { getDay } from '../../../core/store.js';
import { EQUIPMENT, EQUIPMENT_LABELS } from '../../../core/exercises.js';
import { PRESET_INVENTORIES } from '../../../core/plates.js';
import { store } from '../useStore';
import { C, S, fmtW } from '../theme';
import { Card, H1, Eyebrow, Muted, Btn, Chip, Field, Input, Pill } from '../components/ui';

/** How many exercises a day holds, whether pinned or auto-filled. */
function exerciseCount(day) {
  if (!day) return 0;
  return Array.isArray(day.exercises)
    ? day.exercises.length
    : (day.slots || []).reduce((a, s) => a + s.count, 0);
}

export default function Plan({ state, onAssign, onEditDay, onNewDay }) {
  const { plan, profile, inventory } = state;

  const usage = {};
  for (const d of DAYS) if (plan.week[d]) usage[plan.week[d]] = (usage[plan.week[d]] || 0) + 1;

  function pickPreset() {
    Alert.alert(
      'Load a preset',
      'Replaces your current week. Logged history and progress are kept.',
      [
        { text: 'Cancel', style: 'cancel' },
        ...listPresets().slice(0, 5).map((p) => ({
          text: p.name,
          onPress: () => store.applyPreset(p.id, p.defaultDays),
        })),
      ]
    );
  }

  function pickInventory() {
    Alert.alert('Bar & plates', 'Drives the plate breakdown under every barbell weight.', [
      { text: 'Cancel', style: 'cancel' },
      ...Object.entries(PRESET_INVENTORIES).map(([k, v]) => ({
        text: v.label,
        onPress: () => {
          const { label, ...rest } = v;
          store.setInventory(rest);
        },
      })),
    ]);
  }

  function confirmReset() {
    Alert.alert('Erase everything?', 'Your profile, plan and every logged workout. This cannot be undone.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Erase', style: 'destructive', onPress: () => store.reset() },
    ]);
  }

  return (
    <ScrollView contentContainerStyle={st.page}>
      <H1>Your week</H1>
      <Muted style={{ marginTop: 7, marginBottom: 14 }}>
        Tap a day to change what runs on it. Any workout can run on any day, as often as you like.
      </Muted>

      <View style={{ borderRadius: 9, overflow: 'hidden' }}>
        {DAYS.map((d) => {
          const day = plan.week[d] ? getDay(plan, plan.week[d]) : null;
          return (
            <Pressable
              key={d}
              onPress={() => onAssign(d)}
              style={({ pressed }) => [st.weekRow, pressed && { backgroundColor: C.surface3 }]}
            >
              <Text style={st.weekDay}>{d}</Text>
              <View style={{ flex: 1 }}>
                <Text style={[st.weekName, !day && { color: C.faint, fontWeight: '500' }]}>
                  {day ? day.name : 'Rest day'}
                </Text>
                {!!day && (
                  <Text style={st.weekMeta}>
                    {exerciseCount(day)} exercises
                    {Array.isArray(day.exercises) ? '' : ' · auto-picked'}
                  </Text>
                )}
              </View>
              <Text style={{ color: C.muted, fontSize: 18 }}>›</Text>
            </Pressable>
          );
        })}
      </View>

      <View style={[st.spread, { marginTop: 20, marginBottom: 9 }]}>
        <Eyebrow>Your workouts</Eyebrow>
        <Pressable onPress={onNewDay} hitSlop={8}>
          <Text style={{ color: C.accent, fontSize: 13, fontWeight: '600' }}>+ New workout</Text>
        </Pressable>
      </View>

      <View style={{ gap: 7 }}>
        {plan.days.length ? (
          plan.days.map((day) => {
            const runs = usage[day.id] || 0;
            return (
              <Pressable
                key={day.id}
                onPress={() => onEditDay(day.id)}
                style={({ pressed }) => [st.dayCard, pressed && { backgroundColor: C.surface3 }]}
              >
                <View style={{ flex: 1 }}>
                  <Text style={st.weekName}>{day.name}</Text>
                  <Text style={st.weekMeta}>
                    {exerciseCount(day)} exercises ·{' '}
                    {Array.isArray(day.exercises) ? 'you picked these' : 'auto-picked'}
                  </Text>
                </View>
                <Pill
                  bg={runs ? C.surface3 : 'rgba(245,158,11,.14)'}
                  color={runs ? C.muted : C.hold}
                >
                  {runs ? `${runs}x/wk` : 'unused'}
                </Pill>
                <Text style={{ color: C.muted, fontSize: 18 }}>›</Text>
              </Pressable>
            );
          })
        ) : (
          <Card>
            <Muted style={{ textAlign: 'center' }}>
              No workouts yet. Create one, or load a preset below.
            </Muted>
          </Card>
        )}
      </View>

      <Card style={{ marginTop: 16, gap: 10 }}>
        <Eyebrow>Start from a preset</Eyebrow>
        <Muted>Replaces your current week. Logged history and progress are kept.</Muted>
        <Btn title="Choose a preset…" variant="ghost" onPress={pickPreset} />
      </Card>

      {/* ── Settings ─────────────────────────────────────────────────── */}
      <Card style={{ marginTop: 12, gap: 14 }}>
        <Eyebrow>Your numbers</Eyebrow>
        <View style={{ flexDirection: 'row', gap: 12 }}>
          <View style={{ flex: 1 }}>
            <Field label="Bodyweight (lbs)">
              <Input
                defaultValue={String(profile.bodyweight)}
                keyboardType="number-pad"
                onEndEditing={(e) => {
                  const w = Number(e.nativeEvent.text);
                  if (w > 0) store.logBodyweight(w);
                }}
              />
            </Field>
          </View>
          <View style={{ flex: 1 }}>
            <Field label="Height (in)">
              <Input
                defaultValue={String(profile.heightIn)}
                keyboardType="number-pad"
                onEndEditing={(e) => {
                  const h = Number(e.nativeEvent.text);
                  if (h > 0) store.updateProfile({ heightIn: h });
                }}
              />
            </Field>
          </View>
        </View>

        {state.bodyweightLog.length > 1 && (
          <Muted>
            {state.bodyweightLog.length} weigh-ins ·{' '}
            {(() => {
              const delta = profile.bodyweight - state.bodyweightLog[0].weight;
              return `${delta >= 0 ? '+' : ''}${fmtW(delta)} lb since ${state.bodyweightLog[0].date}`;
            })()}
          </Muted>
        )}

        <Field label="Bar & plates">
          <Btn
            variant="ghost"
            title={`${fmtW(inventory.barWeight)} ${inventory.unit} bar · tap to change`}
            onPress={pickInventory}
          />
        </Field>

        <Field label="Equipment you have">
          <View style={st.wrap}>
            {EQUIPMENT.map((e) => (
              <Chip
                key={e}
                small
                label={EQUIPMENT_LABELS[e]}
                active={profile.equipment.includes(e)}
                onPress={() => {
                  const eq = [...profile.equipment];
                  const i = eq.indexOf(e);
                  if (i >= 0) {
                    if (eq.length > 1) eq.splice(i, 1);
                  } else {
                    eq.push(e);
                  }
                  store.updateProfile({ equipment: eq });
                }}
              />
            ))}
          </View>
        </Field>

        <Eyebrow>Data</Eyebrow>
        <Muted>
          Stored on this phone only. There is no account yet, so nothing syncs and nothing is
          uploaded.
        </Muted>
        <Btn title="Erase everything" variant="danger" onPress={confirmReset} />
      </Card>
    </ScrollView>
  );
}

const st = StyleSheet.create({
  page: { padding: S.pad, paddingBottom: 60 },
  spread: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },

  weekRow: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingVertical: 12, paddingHorizontal: 13,
    backgroundColor: C.surface2, marginBottom: 1,
  },
  weekDay: { color: C.muted, fontSize: 14, fontWeight: '700', width: 38 },
  weekName: { color: C.ink, fontSize: 14.5, fontWeight: '600' },
  weekMeta: { color: C.faint, fontSize: 11.5, marginTop: 1 },

  dayCard: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    padding: 12, borderRadius: 8, backgroundColor: C.surface2,
  },
});
