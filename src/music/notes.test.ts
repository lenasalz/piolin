import { describe, expect, it } from 'vitest';
import { describePitch, frequencyToMidi, midiToFrequency } from './notes';

describe('notes', () => {
  it('maps the reference A to A4 with 0 cents', () => {
    expect(describePitch(frequencyToMidi(442, 442))).toEqual({ midi: 69, name: 'A', octave: 4, cents: 0 });
  });

  it('reads 440 Hz as a flat A when tuned to 442 Hz', () => {
    const reading = describePitch(frequencyToMidi(440, 442));
    expect(reading.name).toBe('A');
    expect(reading.cents).toBeCloseTo(-7.85, 1);
  });

  it('names the open strings', () => {
    const names = [55, 62, 69, 76].map((midi) => {
      const { name, octave } = describePitch(frequencyToMidi(midiToFrequency(midi, 442), 442));
      return `${name}${octave}`;
    });
    expect(names).toEqual(['G3', 'D4', 'A4', 'E5']);
  });

  it('rounds to the nearest note', () => {
    expect(describePitch(69.49)).toMatchObject({ name: 'A', cents: expect.closeTo(49, 5) });
    expect(describePitch(69.51)).toMatchObject({ name: 'A♯', cents: expect.closeTo(-49, 5) });
  });
});
