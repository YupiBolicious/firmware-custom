// In-memory login lockout per identifier. Single-instance assumption:
// counters reset on backend restart; use DB-backed storage if multi-instance
// or restart-persistence ever matters.
const attempts = new Map();

const LOCK_MS = (parseInt(process.env.LOGIN_LOCK_MINUTES, 10) || 5) * 60 * 1000;
const MAX_FAILED = 5;

const pruneExpired = (now) => {
  for (const [key, entry] of attempts) {
    if (entry.lockedUntil && entry.lockedUntil <= now) attempts.delete(key);
    else if (!entry.lockedUntil && now - entry.updatedAt > LOCK_MS) attempts.delete(key);
  }
};

const check = (identifier) => {
  const entry = attempts.get(identifier);
  if (!entry) return 0;
  if (!entry.lockedUntil) return 0;
  const remaining = entry.lockedUntil - Date.now();
  if (remaining > 0) return remaining;
  attempts.delete(identifier);
  return 0;
};

const registerFailure = (identifier) => {
  const now = Date.now();
  pruneExpired(now);
  const entry = attempts.get(identifier) || { count: 0, lockedUntil: 0, updatedAt: now };
  entry.count += 1;
  entry.updatedAt = now;
  if (entry.count >= MAX_FAILED && !entry.lockedUntil) {
    entry.lockedUntil = now + LOCK_MS;
  }
  attempts.set(identifier, entry);
  return { locked: entry.lockedUntil > now, retry_after: Math.max(0, Math.ceil((entry.lockedUntil - now) / 1000)) };
};

const reset = (identifier) => {
  attempts.delete(identifier);
};

module.exports = { check, registerFailure, reset, MAX_FAILED, LOCK_MS };