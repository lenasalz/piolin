// Monophonic pitch detection using the McLeod Pitch Method (MPM):
// McLeod & Wyvill, "A Smarter Way to Find Pitch" (2005).
// It copes well with the strong overtones of a bowed string and rarely
// jumps an octave, which simple autocorrelation tends to do.

export interface PitchResult {
  frequency: number;
  /** 0..1, how periodic the signal is. Bowed notes are typically > 0.9. */
  clarity: number;
  /** Loudness (root mean square of the samples). */
  rms: number;
}

export interface PitchDetectorOptions {
  sampleRate: number;
  /** Lowest detectable frequency. The violin's open G is ~196 Hz. */
  minFrequency?: number;
  /** Highest detectable fundamental. */
  maxFrequency?: number;
  /** Results below this clarity are treated as noise. */
  clarityThreshold?: number;
  /** Buffers quieter than this RMS level are treated as silence. */
  rmsThreshold?: number;
}

/** MPM's "k" constant: pick the first peak within this fraction of the highest one. */
const PEAK_THRESHOLD = 0.9;

export function detectPitch(buffer: Float32Array, options: PitchDetectorOptions): PitchResult | null {
  const {
    sampleRate,
    minFrequency = 150,
    maxFrequency = 4000,
    clarityThreshold = 0.8,
    rmsThreshold = 0.01,
  } = options;
  const n = buffer.length;

  let sumSquares = 0;
  for (let i = 0; i < n; i++) sumSquares += buffer[i] * buffer[i];
  const rms = Math.sqrt(sumSquares / n);
  if (rms < rmsThreshold) return null;

  const minLag = Math.max(2, Math.floor(sampleRate / maxFrequency));
  const maxLag = Math.min(Math.ceil(sampleRate / minFrequency), Math.floor(n / 2));
  if (maxLag <= minLag) return null;

  // Normalised square difference function, only over the lags we care about.
  const nsdf = new Float32Array(maxLag + 2);
  for (let tau = 0; tau <= maxLag + 1; tau++) {
    let acf = 0;
    let energy = 0;
    for (let j = 0; j < n - tau; j++) {
      acf += buffer[j] * buffer[j + tau];
      energy += buffer[j] * buffer[j] + buffer[j + tau] * buffer[j + tau];
    }
    nsdf[tau] = energy > 0 ? (2 * acf) / energy : 0;
  }

  // Key maxima: the highest point of each positive region after the first negative dip.
  const peaks: number[] = [];
  let tau = 1;
  while (tau <= maxLag && nsdf[tau] > 0) tau++;
  while (tau <= maxLag) {
    while (tau <= maxLag && nsdf[tau] <= 0) tau++;
    let best = -1;
    while (tau <= maxLag && nsdf[tau] > 0) {
      if (best < 0 || nsdf[tau] > nsdf[best]) best = tau;
      tau++;
    }
    if (best >= minLag) peaks.push(best);
  }
  if (peaks.length === 0) return null;

  const highest = Math.max(...peaks.map((p) => nsdf[p]));
  const chosen = peaks.find((p) => nsdf[p] >= PEAK_THRESHOLD * highest)!;

  const { position, value: clarity } = interpolatePeak(nsdf, chosen);
  if (clarity < clarityThreshold) return null;

  // High notes have short periods, so interpolation error is large relative to
  // the period. The signal repeats, so measure m periods at once and divide.
  const repeats = Math.floor((maxLag - 1) / position);
  let period = position;
  if (repeats >= 2) {
    const around = Math.round(position * repeats);
    let peak = around;
    for (let t = around - 2; t <= around + 2; t++) if (nsdf[t] > nsdf[peak]) peak = t;
    period = interpolatePeak(nsdf, peak).position / repeats;
  }

  return { frequency: sampleRate / period, clarity, rms };
}

/** Parabolic interpolation around a peak for sub-sample accuracy. */
function interpolatePeak(values: Float32Array, index: number): { position: number; value: number } {
  const a = values[index - 1];
  const b = values[index];
  const c = values[index + 1];
  const denominator = a - 2 * b + c;
  const shift = denominator === 0 ? 0 : (0.5 * (a - c)) / denominator;
  return { position: index + shift, value: b - 0.25 * (a - c) * shift };
}
