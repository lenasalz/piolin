import { describe, expect, it } from 'vitest';
import { detectPitch } from './pitch';

const SAMPLE_RATE = 48000;
const SIZE = 2048;

function centsBetween(a: number, b: number): number {
  return 1200 * Math.log2(a / b);
}

function sine(frequency: number, amplitude = 0.5): Float32Array {
  return Float32Array.from({ length: SIZE }, (_, i) => amplitude * Math.sin((2 * Math.PI * frequency * i) / SAMPLE_RATE));
}

/** Bowed-string-like tone: a sawtooth built from 10 harmonics with 1/n amplitude. */
function sawtooth(frequency: number): Float32Array {
  return Float32Array.from({ length: SIZE }, (_, i) => {
    let value = 0;
    for (let n = 1; n <= 10; n++) value += Math.sin((2 * Math.PI * n * frequency * i) / SAMPLE_RATE) / n;
    return 0.3 * value;
  });
}

describe('detectPitch', () => {
  // Open strings at A = 442 Hz, plus a high note in third position and beyond.
  const violinNotes = [196.8, 294.9, 442, 662.3, 1325.9, 2651.8];

  it.each(violinNotes)('finds a %f Hz sine within 1 cent', (frequency) => {
    const result = detectPitch(sine(frequency), { sampleRate: SAMPLE_RATE });
    expect(result).not.toBeNull();
    expect(Math.abs(centsBetween(result!.frequency, frequency))).toBeLessThan(1);
  });

  it.each(violinNotes)('finds the fundamental of a %f Hz sawtooth (no octave error)', (frequency) => {
    const result = detectPitch(sawtooth(frequency), { sampleRate: SAMPLE_RATE });
    expect(result).not.toBeNull();
    expect(Math.abs(centsBetween(result!.frequency, frequency))).toBeLessThan(2);
  });

  it('tells apart notes 5 cents apart', () => {
    const base = 442;
    const sharp = base * 2 ** (5 / 1200);
    const a = detectPitch(sine(base), { sampleRate: SAMPLE_RATE })!;
    const b = detectPitch(sine(sharp), { sampleRate: SAMPLE_RATE })!;
    expect(centsBetween(b.frequency, a.frequency)).toBeCloseTo(5, 0);
  });

  it('returns null for silence', () => {
    expect(detectPitch(new Float32Array(SIZE), { sampleRate: SAMPLE_RATE })).toBeNull();
  });

  it('returns null for noise', () => {
    let seed = 1;
    const random = () => ((seed = (seed * 16807) % 2147483647) / 2147483647) * 2 - 1;
    const noise = Float32Array.from({ length: SIZE }, () => 0.5 * random());
    expect(detectPitch(noise, { sampleRate: SAMPLE_RATE })).toBeNull();
  });
});
