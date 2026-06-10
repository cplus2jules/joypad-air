import { Platform } from 'react-native';

// Switch official Neon palette
export const C = {
  bg: '#0b0d12',
  redLight: '#ff5366',
  red: '#ff3d54',
  redDark: '#c01a30',
  blueLight: '#2dd4ff',
  blue: '#00c3e2',
  blueDark: '#0080a3',
  ink: '#f5f6f8',
  inkDim: '#9aa0ad',
  btnBgTop: '#26272d',
  btnBg: '#15171b',
  btnBgInner: '#0a0a0d',
  btnRing: '#3a3d45',
  btnText: '#f5f6f8',
  chip: '#1c1f27',
  chipActive: '#3a4055',
  ok: '#5ad07a',
  err: '#ff6f7a',
};

export const SHADOW = Platform.select({
  ios: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.35,
    shadowRadius: 4,
  },
  android: { elevation: 4 },
});
