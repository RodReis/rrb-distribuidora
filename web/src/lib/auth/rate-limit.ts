const WINDOW_MS = 15 * 60 * 1000;
const MAX_FAILURES = 5;

type Entry = { failures: number; resetAt: number };

const store = new Map<string, Entry>();

function prune(now: number) {
  if (store.size < 500) return;
  for (const [key, entry] of store) {
    if (entry.resetAt <= now) store.delete(key);
  }
}

export function isBlocked(key: string): boolean {
  const entry = store.get(key);
  if (!entry) return false;
  if (entry.resetAt <= Date.now()) {
    store.delete(key);
    return false;
  }
  return entry.failures >= MAX_FAILURES;
}

export function registerFailure(key: string) {
  const now = Date.now();
  prune(now);
  const entry = store.get(key);
  if (!entry || entry.resetAt <= now) {
    store.set(key, { failures: 1, resetAt: now + WINDOW_MS });
    return;
  }
  entry.failures += 1;
}

export function clearFailures(key: string) {
  store.delete(key);
}

export function getClientIp(headers: Headers): string {
  const realIp = headers.get("x-real-ip");
  if (realIp) return realIp.trim();
  const forwarded = headers.get("x-forwarded-for");
  if (forwarded) {
    const parts = forwarded.split(",").map((p) => p.trim());
    return parts[parts.length - 1];
  }
  return "unknown";
}
