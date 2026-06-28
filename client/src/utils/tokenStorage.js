import { Capacitor } from '@capacitor/core';
import { Preferences } from '@capacitor/preferences';

const TOKEN_KEY = 'auth_token';

export function isNative() {
  return Capacitor.isNativePlatform();
}

let memoryToken = null;

export async function saveToken(token) {
  memoryToken = token;
  if (isNative()) {
    await Preferences.set({ key: TOKEN_KEY, value: token });
  }
}

export async function getToken() {
  if (memoryToken) return memoryToken;
  if (isNative()) {
    const { value } = await Preferences.get({ key: TOKEN_KEY });
    memoryToken = value;
    return value;
  }
  return null;
}

export async function clearToken() {
  memoryToken = null;
  if (isNative()) {
    await Preferences.remove({ key: TOKEN_KEY });
  }
}
