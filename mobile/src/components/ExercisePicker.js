import React, { useMemo, useState } from 'react';
import { View, Text, Pressable, FlatList, StyleSheet } from 'react-native';
import {
  searchExercises, groupByMuscle, EXERCISES,
  MUSCLE_ORDER, MUSCLE_LABELS, EQUIPMENT_LABELS,
} from '../../../core/exercises.js';
import { C, S } from '../theme';
import { Input, Chip, Muted } from './ui';

/**
 * Searchable exercise catalog. Used for starring favorites, building a workout,
 * swapping mid-session, and adding an extra lift on the day.
 *
 * @param {string[]} selected      ids already chosen — shown with a check
 * @param {(id) => void} onPick
 * @param {string[]|null} equipment restrict to this equipment, or null for all
 */
export default function ExercisePicker({ selected = [], onPick, equipment = null, footer }) {
  const [query, setQuery] = useState('');
  const [muscle, setMuscle] = useState(null);

  const sel = useMemo(() => new Set(selected), [selected]);

  // When searching, show a flat ranked list. When browsing, group by muscle so
  // the catalog is explorable without typing.
  const rows = useMemo(() => {
    const pool = searchExercises(query, {
      equipment,
      muscles: muscle ? [muscle] : [],
      limit: 400,
    });
    if (query.trim()) return pool.map((e) => ({ type: 'ex', e }));
    return groupByMuscle(pool).flatMap((g) => [
      { type: 'head', label: `${g.label} · ${g.exercises.length}`, key: `h-${g.muscle}` },
      ...g.exercises.map((e) => ({ type: 'ex', e })),
    ]);
  }, [query, muscle, equipment]);

  return (
    <View style={{ flex: 1, gap: 10 }}>
      <Input
        placeholder={`Search ${EXERCISES.length} exercises — try "incline" or "rdl"`}
        value={query}
        onChangeText={setQuery}
        autoCorrect={false}
        autoCapitalize="none"
        clearButtonMode="while-editing"
        returnKeyType="search"
      />

      <FlatList
        horizontal
        showsHorizontalScrollIndicator={false}
        data={[{ id: null, label: 'All' }, ...MUSCLE_ORDER.map((m) => ({ id: m, label: MUSCLE_LABELS[m] }))]}
        keyExtractor={(i) => i.id || 'all'}
        contentContainerStyle={{ gap: 6, paddingRight: 6 }}
        renderItem={({ item }) => (
          <Chip small label={item.label} active={muscle === item.id} onPress={() => setMuscle(item.id)} />
        )}
        style={{ flexGrow: 0 }}
      />

      <FlatList
        data={rows}
        keyExtractor={(r, i) => (r.type === 'head' ? r.key : `${r.e.id}-${i}`)}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{ paddingBottom: 20 }}
        ListEmptyComponent={
          <View style={{ padding: 28, alignItems: 'center' }}>
            <Muted>Nothing matches “{query}”.</Muted>
          </View>
        }
        renderItem={({ item }) => {
          if (item.type === 'head') {
            return <Text style={st.head}>{item.label.toUpperCase()}</Text>;
          }
          const e = item.e;
          const on = sel.has(e.id);
          return (
            <Pressable
              onPress={() => onPick(e.id)}
              style={({ pressed }) => [st.row, pressed && { backgroundColor: C.surface3 }]}
              accessibilityRole="button"
              accessibilityState={{ selected: on }}
            >
              <View style={{ flex: 1 }}>
                <Text style={st.name}>{e.name}</Text>
                <Text style={st.meta}>
                  {EQUIPMENT_LABELS[e.equipment]} · {e.muscles.map((m) => MUSCLE_LABELS[m] || m).join(', ')} · {e.repRange[0]}–{e.repRange[1]} reps
                </Text>
              </View>
              <Text style={[st.add, on && { color: C.up }]}>{on ? '✓' : '+'}</Text>
            </Pressable>
          );
        }}
      />

      {footer}
    </View>
  );
}

const st = StyleSheet.create({
  head: {
    paddingTop: 12, paddingBottom: 5, paddingHorizontal: 2,
    fontSize: 11, fontWeight: '700', letterSpacing: 1.3, color: C.faint,
  },
  row: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingVertical: 11, paddingHorizontal: 13,
    backgroundColor: C.surface2, borderRadius: 8, marginBottom: 1,
  },
  name: { fontSize: 14, fontWeight: '600', color: C.ink },
  meta: { fontSize: 11.5, color: C.faint, marginTop: 1 },
  add: { fontSize: 20, fontWeight: '700', color: C.accent, width: 24, textAlign: 'center' },
});
