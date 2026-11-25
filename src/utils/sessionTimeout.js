export const SESSION_IDLE_TIMEOUT_MS = 15 * 60 * 1000;
export const SESSION_ABSOLUTE_TIMEOUT_MS = 8 * 60 * 60 * 1000;

const SESSION_STORAGE_PREFIX = 'nutrigrid_session_timeout:';
const SESSION_ACTIVITY_WRITE_INTERVAL_MS = 10 * 1000;

function sessionStorageKey(userId) {
  return `${SESSION_STORAGE_PREFIX}${userId}`;
}

function readSession(userId) {
  const raw = localStorage.getItem(sessionStorageKey(userId));
  if (!raw) return null;
  const session = JSON.parse(raw);
  if (Number.isFinite(session?.signedOutAt)) return session;
  if (
    !Number.isFinite(session?.startedAt) ||
    !Number.isFinite(session?.lastActivityAt)
  ) {
    throw new Error('The saved sign-in timeout state is invalid.');
  }
  return session;
}

export function startSessionTimeout(userId, now = Date.now()) {
  if (!userId) throw new Error('A user ID is required to start a sign-in session.');
  localStorage.setItem(
    sessionStorageKey(userId),
    JSON.stringify({ startedAt: now, lastActivityAt: now })
  );
}

export function checkSessionTimeout(userId, now = Date.now()) {
  if (!userId) throw new Error('A user ID is required to check a sign-in session.');
  const session = readSession(userId);
  if (Number.isFinite(session?.signedOutAt)) return 'signed_out';
  if (!session) return 'missing';
  if (now - session.startedAt >= SESSION_ABSOLUTE_TIMEOUT_MS) return 'absolute';
  if (now - session.lastActivityAt >= SESSION_IDLE_TIMEOUT_MS) return 'idle';
  return null;
}

export function restoreSessionTimeout(userId, now = Date.now()) {
  const reason = checkSessionTimeout(userId, now);
  if (reason === 'missing') {
    startSessionTimeout(userId, now);
    return null;
  }
  return reason;
}

export function recordSessionActivity(userId, now = Date.now()) {
  if (!userId) return;
  const session = readSession(userId);
  if (!session) {
    throw new Error('The saved sign-in timeout state is missing.');
  }
  if (session.signedOutAt) throw new Error('The sign-in session has ended.');
  if (now - session.lastActivityAt < SESSION_ACTIVITY_WRITE_INTERVAL_MS) return;
  localStorage.setItem(
    sessionStorageKey(userId),
    JSON.stringify({ ...session, lastActivityAt: now })
  );
}

export function clearSessionTimeout(userId) {
  if (userId) {
    localStorage.setItem(
      sessionStorageKey(userId),
      JSON.stringify({ signedOutAt: Date.now() })
    );
  }
}
