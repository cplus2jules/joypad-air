import { useEffect, useState } from 'react';
import { StyleSheet } from 'react-native';
import { useKeepAwake } from 'expo-keep-awake';
import * as ScreenOrientation from 'expo-screen-orientation';
import { StatusBar } from 'expo-status-bar';
import { GestureHandlerRootView } from 'react-native-gesture-handler';

import { C } from './src/theme';
import { SettingsProvider } from './src/store/settings';
import Picker from './src/screens/Picker';
import Pad from './src/screens/Pad';

// ── App root ────────────────────────────────────────────
export default function App() {
  useKeepAwake();
  const [player, setPlayer] = useState(null);
  const [layout, setLayout] = useState('full'); // 'full' | 'left' | 'right'
  const [compact, setCompact] = useState(false); // oculta dpad, stick derecho, capture, home

  useEffect(() => {
    ScreenOrientation.lockAsync(
      ScreenOrientation.OrientationLock.LANDSCAPE
    ).catch(() => {});
  }, []);

  return (
    <SettingsProvider>
      <GestureHandlerRootView style={s.root}>
        <StatusBar hidden />
        {player == null ? (
          <Picker layout={layout} onLayout={setLayout} onPick={setPlayer} />
        ) : (
          <Pad
            player={player}
            layout={layout}
            compact={compact}
            onToggleCompact={() => setCompact((c) => !c)}
            onBack={() => setPlayer(null)}
          />
        )}
      </GestureHandlerRootView>
    </SettingsProvider>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.bg },
});
