import { describe, expect, it } from 'vitest';
import { PitchSmoother } from './smoothing';

describe('PitchSmoother', () => {
  it.each([4.5, 5.5, 6, 7])('finds the centre of %f Hz vibrato', (rate) => {
    const smoother = new PitchSmoother();
    const centre = 69.1; // A4, 10 cents sharp
    // ±40 cents vibrato sampled at 60 fps; check every frame after the first 300 ms.
    for (let t = 0; t <= 1500; t += 1000 / 60) {
      const smoothed = smoother.push(t, centre + 0.4 * Math.sin(2 * Math.PI * rate * (t / 1000)));
      if (t > 300) expect(Math.abs(smoothed - centre) * 100).toBeLessThan(4);
    }
  });

  it('ignores a single misdetected frame', () => {
    const smoother = new PitchSmoother();
    for (let t = 0; t < 200; t += 16) smoother.push(t, 69);
    expect(smoother.push(200, 69.5)).toBe(69);
  });

  it('switches to a new note after two agreeing frames, without gliding', () => {
    const smoother = new PitchSmoother();
    smoother.push(0, 69);
    smoother.push(16, 69);
    expect(smoother.push(32, 71)).toBe(69);
    expect(smoother.push(48, 71)).toBe(71);
  });

  it('ignores a one-frame octave error during vibrato', () => {
    const smoother = new PitchSmoother();
    const vibrato = (t: number) => 69.1 + 0.3 * Math.sin(2 * Math.PI * 6 * (t / 1000));
    for (let t = 0; t < 500; t += 16) smoother.push(t, vibrato(t));
    smoother.push(500, 81.1); // octave glitch
    for (let t = 516; t < 600; t += 16) {
      expect(Math.abs(smoother.push(t, vibrato(t)) - 69.1) * 100).toBeLessThan(4);
    }
  });
});
