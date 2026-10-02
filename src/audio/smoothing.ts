// Steadies the pitch reading so that vibrato (a deliberate ±20–50 cent swing
// at ~4–7 Hz) is judged by its centre, not every wobble, while a steady note
// still responds at once when the player corrects it.
//
// Vibrato is recognised by its turning points (alternating peaks and troughs).
// Under vibrato the centre is the midpoint of the latest peak and trough,
// which is exact at any vibrato speed and settles within about one cycle
// after a correction. Without recent turning points the note is steady (or
// sliding), so only the last couple of frames are averaged.

/** A jump larger than this (in semitones) means a new note, so history is dropped. */
const NEW_NOTE_JUMP = 0.8;
/** Swings smaller than this (in semitones) are detection jitter, not vibrato. */
const TURN_HYSTERESIS = 0.03;
/** A turning point older than this means vibrato has stopped (a 4 Hz half-cycle is 125 ms, plus confirmation). */
const VIBRATO_TIMEOUT_MS = 220;
/** Averaging window for a steady note: a couple of frames to calm detection jitter. */
const STEADY_MS = 20;

type Sample = { time: number; midi: number };

export class PitchSmoother {
  /** Raw readings of the current note (only the last few are needed). */
  private samples: Sample[] = [];
  /** The same readings after a running median of 3, so one misdetected frame can't become a peak. */
  private filtered: Sample[] = [];
  /** A reading far from the current note; it becomes a new note only if the next one agrees. */
  private candidate: Sample | null = null;
  private current: number | null = null;

  // Turning-point tracker: the last two confirmed peaks/troughs, plus the extremes of the swing in progress.
  private turns: Sample[] = [];
  private high: Sample | null = null;
  private low: Sample | null = null;
  private direction = 0; // +1 rising, -1 falling, 0 not yet known

  /** Adds a reading (time in ms, pitch as float MIDI) and returns the smoothed pitch. */
  push(time: number, midi: number): number {
    if (this.current !== null && Math.abs(midi - this.current) > NEW_NOTE_JUMP) {
      const confirmed = this.candidate && Math.abs(midi - this.candidate.midi) <= NEW_NOTE_JUMP;
      if (!confirmed) {
        // Could be a one-frame glitch (e.g. an octave error): hold the current note.
        this.candidate = { time, midi };
        return this.current;
      }
      const first = this.candidate!;
      this.reset();
      this.add(first);
    }
    this.candidate = null;
    this.add({ time, midi });
    return this.current!;
  }

  reset(): void {
    this.samples = [];
    this.filtered = [];
    this.candidate = null;
    this.current = null;
    this.turns = [];
    this.high = this.low = null;
    this.direction = 0;
  }

  private add(sample: Sample): void {
    this.samples = [...this.samples.slice(-2), sample];
    const point = { time: sample.time, midi: median(this.samples.map((s) => s.midi)) };
    this.filtered = [...this.filtered.filter((s) => point.time - s.time <= STEADY_MS), point];
    this.track(point);

    const [previous, latest] = this.turns.slice(-2);
    if (latest && point.time - latest.time <= VIBRATO_TIMEOUT_MS) {
      this.current = (previous.midi + latest.midi) / 2;
    } else if (previous && point.time - previous.time <= VIBRATO_TIMEOUT_MS) {
      // Vibrato is just starting: pair the first turning point with the swing in progress.
      this.current = (previous.midi + (this.direction > 0 ? this.high! : this.low!).midi) / 2;
    } else {
      this.current = this.filtered.reduce((sum, s) => sum + s.midi, 0) / this.filtered.length;
    }
  }

  /** A peak or trough is confirmed once the pitch has moved back by more than the hysteresis. */
  private track(s: Sample): void {
    if (!this.high || !this.low) {
      this.high = this.low = s;
      return;
    }
    if (this.direction === 0) {
      if (s.midi > this.high.midi) this.high = s;
      if (s.midi < this.low.midi) this.low = s;
      // The very first extreme isn't a turning point: it may just be where the note started.
      if (this.high.midi - this.low.midi > TURN_HYSTERESIS) this.direction = this.high.time > this.low.time ? 1 : -1;
    } else if (this.direction > 0) {
      if (s.midi > this.high.midi) this.high = s;
      else if (this.high.midi - s.midi > TURN_HYSTERESIS) {
        this.turns = [...this.turns.slice(-1), this.high];
        this.direction = -1;
        this.low = s;
      }
    } else {
      if (s.midi < this.low.midi) this.low = s;
      else if (s.midi - this.low.midi > TURN_HYSTERESIS) {
        this.turns = [...this.turns.slice(-1), this.low];
        this.direction = 1;
        this.high = s;
      }
    }
  }
}

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}
