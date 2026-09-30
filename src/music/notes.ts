// Pitch <-> note conversions. "midi" values are floats: 69.0 is A4 exactly,
// 69.12 is A4 twelve cents sharp. All conversions depend on the reference A.

export const NOTE_NAMES = ['C', 'C♯', 'D', 'D♯', 'E', 'F', 'F♯', 'G', 'G♯', 'A', 'A♯', 'B'] as const;

export interface NoteReading {
  /** Nearest equal-tempered note as a MIDI number (60 = middle C). */
  midi: number;
  name: string;
  octave: number;
  /** Deviation from that note in cents; positive = sharp (too high), negative = flat (too low). */
  cents: number;
}

export function frequencyToMidi(frequency: number, referenceA: number): number {
  return 69 + 12 * Math.log2(frequency / referenceA);
}

export function midiToFrequency(midi: number, referenceA: number): number {
  return referenceA * 2 ** ((midi - 69) / 12);
}

export function describePitch(midiFloat: number): NoteReading {
  const midi = Math.round(midiFloat);
  return {
    midi,
    name: NOTE_NAMES[((midi % 12) + 12) % 12],
    octave: Math.floor(midi / 12) - 1,
    cents: (midiFloat - midi) * 100,
  };
}
