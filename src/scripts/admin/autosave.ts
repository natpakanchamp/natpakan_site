/**
 * Per-browser safety net for unsaved edits. localStorage can be unavailable
 * (private mode, blocked storage), so every access is guarded and failure
 * simply means no autosave — never a broken editor.
 */
export interface FormSnapshot {
  title: string;
  date: string;
  time: string;
  slug: string;
  excerpt?: string;
  categories: string[];
  body: string;
}

interface Stored {
  savedAt: number;
  data: FormSnapshot;
}

const PREFIX = 'admin-autosave:';

export function readAutosave(key: string): Stored | null {
  try {
    const raw = localStorage.getItem(PREFIX + key);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Stored;
    return typeof parsed?.savedAt === 'number' && parsed.data ? parsed : null;
  } catch {
    return null;
  }
}

export function writeAutosave(key: string, data: FormSnapshot): void {
  try {
    localStorage.setItem(PREFIX + key, JSON.stringify({ savedAt: Date.now(), data }));
  } catch {
    /* storage full or blocked: autosave is best-effort */
  }
}

export function clearAutosave(key: string): void {
  try {
    localStorage.removeItem(PREFIX + key);
  } catch {
    /* ignore */
  }
}
