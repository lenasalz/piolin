// Wait-mode score following: the follower waits on the next note of the score
// until the player plays it, measures its intonation while it sounds, and moves
// on when the note ends. A note ends when the pitch changes, the sound stops,
// or the bow re-attacks (a dip in loudness), which separates repeated notes.

/** Within this many semitones of the expected note counts as playing it (so a badly tuned note still counts). */
const MATCH_SEMITONES = 0.6;
/** Once started, the note lasts until the pitch is this far away, so wide vibrato on an off note doesn't end it. */
const LEAVE_SEMITONES = 0.75;
/** The expected note must sound this long before it counts as started. */
const CONFIRM_MS = 60;
/** A different steady note for this long is reported as a wrong note. */
const WRONG_MS = 150;
/** Loudness below this fraction of the note's peak is a bow change (or the note fading)... */
const DIP = 0.6;
/** ...and rising back above this fraction afterwards is a new attack. */
const REATTACK = 0.8;

export type FollowEvent =
  | { type: 'played'; index: number; cents: number }
  | { type: 'wrong'; index: number; heardMidi: number };

export class ScoreFollower {
  index = 0;
  private playing = false;
  private matchSince: number | null = null;
  private cents: number[] = [];
  private peakRms = 0;
  private dipped = false;
  private wrong: { midi: number; since: number; reported: boolean } | null = null;

  /** `notes` are the expected pitches in playing order, as MIDI numbers. */
  constructor(private readonly notes: readonly number[]) {}

  get done(): boolean {
    return this.index >= this.notes.length;
  }

  get expected(): number | undefined {
    return this.notes[this.index];
  }

  restart(index = 0): void {
    this.index = index;
    this.resetNote();
  }

  /** Feed one frame: time in ms, smoothed pitch as float MIDI (null = no clear note) and loudness. */
  update(time: number, midi: number | null, rms: number): FollowEvent | null {
    if (this.done) return null;
    let event: FollowEvent | null = null;

    if (this.playing) {
      const expected = this.notes[this.index];
      const stillOn = midi !== null && Math.abs(midi - expected) <= LEAVE_SEMITONES;
      if (rms < DIP * this.peakRms) this.dipped = true;
      const reattack = this.dipped && rms > REATTACK * this.peakRms;
      if (stillOn && !reattack) {
        this.cents.push((midi - expected) * 100);
        this.peakRms = Math.max(this.peakRms, rms);
        return null;
      }
      event = { type: 'played', index: this.index, cents: median(this.cents) };
      this.index++;
      this.resetNote();
      if (this.done) return event;
      // Fall through: this frame may already be the start of the next note.
    }

    const expected = this.notes[this.index];
    if (midi !== null && Math.abs(midi - expected) <= MATCH_SEMITONES) {
      this.wrong = null;
      this.matchSince ??= time;
      this.cents.push((midi - expected) * 100);
      this.peakRms = Math.max(this.peakRms, rms);
      if (time - this.matchSince >= CONFIRM_MS) this.playing = true;
      return event;
    }

    this.matchSince = null;
    this.cents = [];
    this.peakRms = 0;
    if (midi === null) {
      this.wrong = null;
      return event;
    }
    const heard = Math.round(midi);
    if (!this.wrong || this.wrong.midi !== heard) this.wrong = { midi: heard, since: time, reported: false };
    else if (!this.wrong.reported && time - this.wrong.since >= WRONG_MS) {
      this.wrong.reported = true;
      return event ?? { type: 'wrong', index: this.index, heardMidi: heard };
    }
    return event;
  }

  private resetNote(): void {
    this.playing = false;
    this.matchSince = null;
    this.cents = [];
    this.peakRms = 0;
    this.dipped = false;
    this.wrong = null;
  }
}

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}
