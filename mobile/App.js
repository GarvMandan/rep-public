import React, { useState, useEffect } from 'react';
import { View, Text, Pressable, StyleSheet, ActivityIndicator, Alert, Platform } from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';

import { store, useStoreState, useStoreReady } from './src/useStore';
import { getDay } from '../core/store.js';
import { DAY_LABELS } from '../core/splits.js';
import { getExercise } from '../core/exercises.js';
import { C, S } from './src/theme';
import Setup from './src/screens/Setup';
import Today from './src/screens/Today';
import Session from './src/screens/Session';
import PlanScreen from './src/screens/Plan';
import Progress from './src/screens/Progress';
import Sheet from './src/screens/Sheets';

const TABS = [
  ['today', 'Today'],
  ['progress', 'Progress'],
  ['plan', 'Plan'],
];

export default function App() {
  const ready = useStoreReady();
  const state = useStoreState();
  const [tab, setTab] = useState('today');
  const [sheet, setSheet] = useState(null);

  const inSession = !!state.activeSession;

  // A session in progress owns the Today tab — never strand the user elsewhere
  // when they reopen the app mid-workout.
  useEffect(() => {
    if (inSession) setTab('today');
  }, [inSession]);

  if (!ready) {
    return (
      <SafeAreaProvider>
        <View style={[st.root, { alignItems: 'center', justifyContent: 'center' }]}>
          <StatusBar style="light" />
          <ActivityIndicator color={C.accent} />
        </View>
      </SafeAreaProvider>
    );
  }

  if (!state.profile) {
    return (
      <SafeAreaProvider>
        <SafeAreaView style={st.root} edges={['top', 'bottom']}>
          <StatusBar style="light" />
          <Setup />
        </SafeAreaView>
      </SafeAreaProvider>
    );
  }

  function openEditDay(dayId) {
    const day = getDay(state.plan, dayId);
    setSheet({ kind: 'editDay', dayId, title: day?.name || 'Workout' });
  }

  function newDay() {
    // RN has no inline prompt on Android, so name it after creating on that platform.
    if (Platform.OS === 'ios') {
      Alert.prompt('Name this workout', null, async (name) => {
        const day = await store.addDay((name || '').trim() || 'New workout', []);
        openEditDay(day.id);
      }, 'plain-text', 'New workout');
    } else {
      store.addDay('New workout', []).then((day) => openEditDay(day.id));
    }
  }

  const content = () => {
    if (inSession) {
      return (
        <Session
          state={state}
          onSwap={(exIdx) => setSheet({ kind: 'swap', exIdx, title: 'Swap exercise', subtitle: 'Sets you already logged are kept' })}
          onAddExercise={() => setSheet({ kind: 'addToSession', title: 'Add to this session', subtitle: 'Just for today — your plan is unchanged' })}
          onFinished={(done) => {
            setTab('progress');
            if (done) {
              Alert.alert(
                `${done.name} logged`,
                "Next time's weights are already set — check Today."
              );
            }
          }}
        />
      );
    }

    if (tab === 'progress') {
      return (
        <Progress
          state={state}
          onDetail={(exerciseId) =>
            setSheet({
              kind: 'detail',
              exerciseId,
              title: getExercise(exerciseId)?.name || exerciseId,
            })
          }
          onSession={(sessionId) => {
            const s = state.sessions.find((x) => x.id === sessionId);
            setSheet({ kind: 'session', sessionId, title: s?.name || 'Session', subtitle: s?.date });
          }}
        />
      );
    }

    if (tab === 'plan') {
      return (
        <PlanScreen
          state={state}
          onAssign={(weekday) =>
            setSheet({
              kind: 'assign',
              weekday,
              title: DAY_LABELS[weekday] || weekday,
              subtitle: 'What runs on this day?',
            })
          }
          onEditDay={openEditDay}
          onNewDay={newDay}
        />
      );
    }

    return (
      <Today
        state={state}
        onStart={async (day) => { await store.startSession(day); }}
        onEditDay={openEditDay}
        onGoPlan={() => setTab('plan')}
      />
    );
  };

  return (
    <SafeAreaProvider>
      <SafeAreaView style={st.root} edges={['top']}>
        <StatusBar style="light" />

        <View style={st.topbar}>
          <Text style={st.wordmark}>
            PO<Text style={{ color: C.accent }}>·</Text>
          </Text>
          <View style={st.tabs}>
            {TABS.map(([k, label]) => (
              <Pressable
                key={k}
                onPress={() => setTab(k)}
                style={[st.tab, tab === k && st.tabOn]}
                accessibilityRole="tab"
                accessibilityState={{ selected: tab === k }}
              >
                <Text style={[st.tabText, tab === k && { color: C.ink }]}>
                  {k === 'today' && inSession ? 'Session' : label}
                </Text>
              </Pressable>
            ))}
          </View>
        </View>

        <View style={{ flex: 1 }}>{content()}</View>

        <Sheet
          sheet={sheet}
          state={state}
          onClose={() => setSheet(null)}
          onOpen={(next) => {
            if (next.kind === 'newDay') { setSheet(null); newDay(); return; }
            setSheet(next);
          }}
        />
      </SafeAreaView>
    </SafeAreaProvider>
  );
}

const st = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.ground },
  topbar: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: S.pad, paddingTop: 6, paddingBottom: 10,
  },
  wordmark: { color: C.ink, fontSize: 19, fontWeight: '800', letterSpacing: 1 },
  tabs: { flexDirection: 'row', gap: 2, backgroundColor: C.surface, borderRadius: 8, padding: 3 },
  tab: { paddingVertical: 7, paddingHorizontal: 13, borderRadius: 6 },
  tabOn: { backgroundColor: C.surface2 },
  tabText: { color: C.muted, fontSize: 13, fontWeight: '600' },
});
