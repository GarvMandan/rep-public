// The React Native storage adapter.
//
// This is the entire platform port: core/store.js talks to a three-method
// adapter, so swapping localStorage for AsyncStorage is all it takes to run the
// same engine on a phone. Nothing in core/ changes.

import AsyncStorage from '@react-native-async-storage/async-storage';

export function createAsyncStorageAdapter() {
  return {
    async get(key) {
      const raw = await AsyncStorage.getItem(key);
      return raw ? JSON.parse(raw) : null;
    },
    async set(key, value) {
      await AsyncStorage.setItem(key, JSON.stringify(value));
    },
    async remove(key) {
      await AsyncStorage.removeItem(key);
    },
  };
}
