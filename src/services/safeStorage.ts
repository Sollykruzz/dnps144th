/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

// Dual-layer safe storage with localStorage persistence and memory fallback.
// This preserves the bursar's login session, active school selection, and offline cache across reloads,
// while gracefully handling environments where localStorage is restricted, disabled, or full.

const memoryStore: Record<string, string> = {};

function isLocalStorageAvailable(): boolean {
  try {
    if (typeof window === 'undefined' || !window.localStorage) return false;
    const testKey = '__storage_test__';
    window.localStorage.setItem(testKey, '1');
    window.localStorage.removeItem(testKey);
    return true;
  } catch {
    return false;
  }
}

const hasLocalStorage = isLocalStorageAvailable();

export const safeStorage = {
  getItem: (key: string): string | null => {
    if (hasLocalStorage) {
      try {
        const val = window.localStorage.getItem(key);
        if (val !== null) return val;
      } catch {
        // Fallback to memoryStore below
      }
    }
    return memoryStore[key] ?? null;
  },

  setItem: (key: string, value: string): void => {
    memoryStore[key] = value;
    if (hasLocalStorage) {
      try {
        window.localStorage.setItem(key, value);
      } catch (e) {
        // If quota exceeded or restricted, keep in memoryStore without throwing
        console.warn(`[safeStorage] localStorage quota exceeded or write failed for key "${key}", using memory store:`, e);
      }
    }
  },

  removeItem: (key: string): void => {
    delete memoryStore[key];
    if (hasLocalStorage) {
      try {
        window.localStorage.removeItem(key);
      } catch {
        // Ignore
      }
    }
  },

  clear: (): void => {
    for (const key of Object.keys(memoryStore)) {
      delete memoryStore[key];
    }
    if (hasLocalStorage) {
      try {
        window.localStorage.clear();
      } catch {
        // Ignore
      }
    }
  },
};

