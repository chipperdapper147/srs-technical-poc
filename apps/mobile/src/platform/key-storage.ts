import type { KeyStorage } from "@app/client";
import * as SecureStore from "expo-secure-store";

const ACCESS_KEY_STORAGE = "srs.access-key";

/**
 * The access key in the platform keychain (iOS Keychain, Android Keystore).
 * Unavailable storage keeps nothing, like the web's localStorage adapter.
 */
export const secureKeyStorage: KeyStorage = {
  read() {
    try {
      return SecureStore.getItem(ACCESS_KEY_STORAGE);
    } catch {
      return null;
    }
  },
  write(key) {
    try {
      if (key === null) SecureStore.deleteItemAsync(ACCESS_KEY_STORAGE).catch(() => {});
      else SecureStore.setItem(ACCESS_KEY_STORAGE, key);
    } catch {}
  },
};
