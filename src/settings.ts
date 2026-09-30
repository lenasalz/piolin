// User settings. Choosing a level applies its preset; individual values can
// still be adjusted afterwards. Settings persist per browser via localStorage.

export type Level = 'beginner' | 'intermediate' | 'advanced';

export interface LevelPreset {
  label: string;
  /** A note counts as "in tune" within ± this many cents. */
  toleranceCents: number;
  /** Pitch averaging window; long enough to find the centre of vibrato. */
  smoothingMs: number;
}

export const LEVEL_PRESETS: Record<Level, LevelPreset> = {
  beginner: { label: 'Beginner', toleranceCents: 25, smoothingMs: 400 },
  intermediate: { label: 'Intermediate', toleranceCents: 15, smoothingMs: 250 },
  advanced: { label: 'Advanced', toleranceCents: 8, smoothingMs: 250 },
};

export interface Settings {
  level: Level;
  referenceA: number;
  toleranceCents: number;
  smoothingMs: number;
}

export function settingsForLevel(level: Level, referenceA: number): Settings {
  const { toleranceCents, smoothingMs } = LEVEL_PRESETS[level];
  return { level, referenceA, toleranceCents, smoothingMs };
}

export const DEFAULT_SETTINGS: Settings = settingsForLevel('intermediate', 442);

const STORAGE_KEY = 'piolin.settings';

export function loadSettings(): Settings {
  try {
    const stored = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? 'null');
    if (stored && stored.level in LEVEL_PRESETS) return { ...DEFAULT_SETTINGS, ...stored };
  } catch {
    // Storage unavailable (private window, blocked) — fall back to defaults.
  }
  return { ...DEFAULT_SETTINGS };
}

export function saveSettings(settings: Settings): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  } catch {
    // Not critical; settings just won't survive a reload.
  }
}
