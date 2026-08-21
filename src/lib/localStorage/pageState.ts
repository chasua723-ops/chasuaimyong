function todayKey(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function savePageState<T>(key: string, data: T): void {
  try {
    localStorage.setItem(key, JSON.stringify({ date: todayKey(), data }));
  } catch {
    // localStorage can be unavailable (private mode quota, SSR) — this is a convenience
    // feature, so fail silently rather than breaking the page.
  }
}

export function loadPageState<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { date: string; data: T };
    if (parsed.date !== todayKey()) {
      localStorage.removeItem(key);
      return null;
    }
    return parsed.data;
  } catch {
    return null;
  }
}

export function clearPageState(key: string): void {
  try {
    localStorage.removeItem(key);
  } catch {
    // ignore
  }
}
