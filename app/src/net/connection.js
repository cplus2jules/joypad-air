import Constants from 'expo-constants';

export const SERVER_PORT = 3001;

export function detectHost() {
  const hu =
    Constants.expoConfig?.hostUri ||
    Constants.expoGoConfig?.developer?.hostUri ||
    '';
  const ip = hu.split(':')[0];
  return ip || null;
}
