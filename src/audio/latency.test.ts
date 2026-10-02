// End-to-end responsiveness: a synthetic bowed tone runs through pitch
// detection and smoothing frame by frame, as in the app, and we measure how
// long the reading takes to settle after the pitch changes.

import { describe, expect, it } from 'vitest';
import { frequencyToMidi, midiToFrequency } from '../music/notes';
import { FRAME_SIZE } from './microphone';
import { detectPitch } from './pitch';
import { PitchSmoother } from './smoothing';

const SAMPLE_RATE = 44100;
const FPS = 60;
const REFERENCE_A = 442;

type Reading = { time: number; midi: number | null };

/** Plays `pitchAt(ms)` (float MIDI) as a 10-harmonic sawtooth and returns the smoothed reading per frame. */
function simulate(pitchAt: (ms: number) => number, durationMs: number): Reading[] {
  const total = Math.ceil((durationMs / 1000) * SAMPLE_RATE);
  const signal = new Float32Array(total);
  let phase = 0;
  for (let i = 0; i < total; i++) {
    phase += midiToFrequency(pitchAt((i / SAMPLE_RATE) * 1000), REFERENCE_A) / SAMPLE_RATE;
    let value = 0;
    for (let n = 1; n <= 10; n++) value += Math.sin(2 * Math.PI * n * phase) / n;
    signal[i] = 0.3 * value;
  }

  const smoother = new PitchSmoother();
  const readings: Reading[] = [];
  for (let time = 1000 / FPS; time <= durationMs; time += 1000 / FPS) {
    const end = Math.floor((time / 1000) * SAMPLE_RATE);
    if (end < FRAME_SIZE) continue;
    const pitch = detectPitch(signal.slice(end - FRAME_SIZE, end), { sampleRate: SAMPLE_RATE });
    readings.push({
      time,
      midi: pitch ? smoother.push(time, frequencyToMidi(pitch.frequency, REFERENCE_A)) : null,
    });
  }
  return readings;
}

/** Milliseconds after `from` until the reading stays within `toleranceCents` of `target`. */
function settleTime(readings: Reading[], from: number, target: number, toleranceCents: number): number {
  let settled = Infinity;
  for (const { time, midi } of readings) {
    if (time < from) continue;
    const inside = midi !== null && Math.abs(midi - target) * 100 <= toleranceCents;
    if (!inside) settled = Infinity;
    else if (settled === Infinity) settled = time;
  }
  return settled - from;
}

const vibrato = (ms: number, cents = 30, rate = 6) => (cents / 100) * Math.sin(2 * Math.PI * rate * (ms / 1000));

describe('responsiveness', () => {
  it('shows a new note quickly', () => {
    const readings = simulate((ms) => (ms < 600 ? 69 : 71), 1200);
    const ms = settleTime(readings, 600, 71, 3);
    console.log(`new note: ${ms.toFixed(0)} ms`);
    expect(ms).toBeLessThan(80);
  });

  it('follows a finger correction on a steady note quickly', () => {
    // Playing 20 cents sharp, then rolling the finger back into tune.
    const readings = simulate((ms) => (ms < 600 ? 69.2 : 69), 1200);
    const ms = settleTime(readings, 600, 69, 3);
    console.log(`steady correction: ${ms.toFixed(0)} ms`);
    expect(ms).toBeLessThan(80);
  });

  it('follows a correction under vibrato within about one vibrato cycle', () => {
    const readings = simulate((ms) => (ms < 800 ? 69.2 : 69) + vibrato(ms), 1600);
    const ms = settleTime(readings, 800, 69, 4);
    console.log(`vibrato correction: ${ms.toFixed(0)} ms`);
    expect(ms).toBeLessThan(220);
  });

  it.each([4.5, 6, 7])('still reads the centre of %f Hz vibrato', (rate) => {
    const readings = simulate((ms) => 69.1 + vibrato(ms, 35, rate), 1500);
    const worst = Math.max(...readings.filter((r) => r.time > 400).map((r) => Math.abs(r.midi! - 69.1) * 100));
    console.log(`vibrato ${rate} Hz: worst error ${worst.toFixed(1)}¢`);
    expect(worst).toBeLessThan(4);
  });

  it('settles on the centre within one cycle when a note starts with vibrato', () => {
    // The first half-swing can't be told apart from a finger correction until it turns back.
    const readings = simulate((ms) => (ms < 600 ? 66 : 69 + vibrato(ms)), 1200);
    const ms = settleTime(readings, 600, 69, 5);
    console.log(`vibrato onset: ${ms.toFixed(0)} ms`);
    expect(ms).toBeLessThan(220);
  });

  it('settles after vibrato stops', () => {
    const readings = simulate((ms) => 69 + (ms < 800 ? vibrato(ms) : 0), 1600);
    const ms = settleTime(readings, 800, 69, 3);
    console.log(`vibrato stops: ${ms.toFixed(0)} ms`);
    expect(ms).toBeLessThan(220);
  });
});
