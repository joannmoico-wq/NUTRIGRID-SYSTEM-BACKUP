import assert from 'node:assert/strict';
import test from 'node:test';
import { getTaskNotificationErrorMessage } from './taskNotificationErrors.js';

test('shows the Edge Function error body instead of the generic HTTP message', async () => {
  const error = {
    context: new Response(
      JSON.stringify({ error: 'Push notification server settings are incomplete.' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    ),
  };

  assert.equal(
    await getTaskNotificationErrorMessage(error),
    'Push notification server settings are incomplete.'
  );
});

test('reports the HTTP status when the Edge Function has no message body', async () => {
  const error = {
    context: new Response(JSON.stringify({ detail: 'no public error message' }), {
      status: 502,
      headers: { 'Content-Type': 'application/json' },
    }),
  };

  assert.equal(
    await getTaskNotificationErrorMessage(error),
    'The task notification service returned HTTP 502.'
  );
});

test('falls back to the original message when there is no response context', async () => {
  assert.equal(
    await getTaskNotificationErrorMessage(new Error('Network unavailable')),
    'Network unavailable'
  );
});
