// Steadies the pitch reading so that vibrato (a deliberate ±20–50 cent swing
// at ~5–7 Hz) is judged by its centre, not every wobble. The centre is the
// midpoint between the highest and lowest pitch in the window, which is exact
// for any vibrato speed as long as the window spans at least one cycle.
// A plain average would be biased unless the window held whole cycles.

/** A jump larger than this (in semitones) means a new note, so history is dropped. */
const NEW_NOTE_JUMP = 0.8;

type Sample = { time: number; midi: number };

export class PitchSmoother {
  private samples: Sample[] = [];
  /** A reading far from the current note; it becomes a new note only if the next one agrees. */
  private candidate: Sample | null = null;

  constructor(public windowMs: number) {}

  /** Adds a reading (time in ms, pitch as float MIDI) and returns the smoothed pitch. */
  push(time: number, midi: number): number {
    this.samples = this.samples.filter((s) => time - s.time <= this.windowMs);
    if (this.samples.length > 0 && Math.abs(midi - this.centre()) > NEW_NOTE_JUMP) {
      const confirmed = this.candidate && Math.abs(midi - this.candidate.midi) <= NEW_NOTE_JUMP;
      if (!confirmed) {
        // Could be a one-frame glitch (e.g. an octave error): hold the current note.
        this.candidate = { time, midi };
        return this.centre();
      }
      this.samples = [this.candidate!];
    }
    this.candidate = null;
    this.samples.push({ time, midi });
    return this.centre();
  }

  reset(): void {
    this.samples = [];
    this.candidate = null;
  }

  private centre(): number {
    // A running median of 3 first, so a single misdetected frame can't become an extreme.
    const values = this.samples.map((_, i) => median(this.samples.slice(Math.max(0, i - 2), i + 1).map((s) => s.midi)));
    return (Math.min(...values) + Math.max(...values)) / 2;
  }
}

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}
