export async function fetchJsonWithRetry<T>(
  url: string,
  init: RequestInit = {},
  attempts = 3,
  baseDelayMs = 500
): Promise<T> {
  let lastError: unknown;
  for (let i = 0; i < attempts; i++) {
    try {
      const res = await fetch(url, { ...init, signal: AbortSignal.timeout(20_000) });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return (await res.json()) as T;
    } catch (err) {
      lastError = err;
      if (i < attempts - 1) {
        await new Promise((r) => setTimeout(r, baseDelayMs * 2 ** i));
      }
    }
  }
  throw new Error(
    `Falha após ${attempts} tentativas: ${lastError instanceof Error ? lastError.message : String(lastError)}`
  );
}
