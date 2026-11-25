import assert from 'node:assert/strict';
import test from 'node:test';
import {
  checkSessionTimeout,
  clearSessionTimeout,
  restoreSessionTimeout,
} from './sessionTimeout.js';

function installLocalStorage() {
  const values = new Map();
  const original = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    value: {
      getItem: (key) => values.get(key) ?? null,
      setItem: (key, value) => values.set(key, String(value)),
      removeItem: (key) => values.delete(key),
    },
  });
  return () => {
    if (original) Object.defineProperty(globalThis, 'localStorage', original);
    else delete globalThis.localStorage;
  };
}

test('restoring a session without saved timeout metadata initializes its timeout', () => {
  const restoreStorage = installLocalStorage();
  try {
    assert.equal(restoreSessionTimeout('offline-user', 1000), null);
    assert.equal(checkSessionTimeout('offline-user', 1001), null);
  } finally {
    restoreStorage();
  }
});

test('restoring a signed-out session does not reactivate it', () => {
  const restoreStorage = installLocalStorage();
  try {
    clearSessionTimeout('signed-out-user');
    assert.equal(restoreSessionTimeout('signed-out-user'), 'signed_out');
    assert.equal(checkSessionTimeout('signed-out-user'), 'signed_out');
  } finally {
    restoreStorage();
  }
});
