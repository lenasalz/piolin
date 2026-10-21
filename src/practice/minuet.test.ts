// The whole pipeline on a real piece: a synthetic violin plays the bundled
// minuet (some notes deliberately off, vibrato on long notes, short gaps like
// bow changes, some repeated notes re-bowed without a gap), and the follower
// must get through every note and measure each one's intonation.

import { describe, expect, it } from 'vitest';
import { FRAME_SIZE } from '../audio/microphone';
import { detectPitch } from '../audio/pitch';
import { PitchSmoother } from '../audio/smoothing';
import { frequencyToMidi, midiToFrequency } from '../music/notes';
import minuetXml from '../../scores/bach-minuet-in-g.musicxml?raw';
import { ScoreFollower, type FollowEvent } from './follower';

const SAMPLE_RATE = 44100;
const FPS = 60;
const REFERENCE_A = 442;
const BPM = 84;
const STEPS: Record<string, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };

/** The notes of the bundled score, read straight from the MusicXML (repeats not expanded). */
function minuetNotes(): { midi: number; beats: number }[] {
  const divisions = Number(/<divisions>(\d+)</.exec(minuetXml)![1]);
  return [...minuetXml.matchAll(/<note>([\s\S]*?)<\/note>/g)].map(([, note]) => {
    const step = /<step>(\w)</.exec(note)![1];
    const alter = Number(/<alter>(-?\d+)</.exec(note)?.[1] ?? 0);
    const octave = Number(/<octave>(\d)</.exec(note)![1]);
    return {
      midi: 12 * (octave + 1) + STEPS[step] + alter,
      beats: Number(/<duration>(\d+)</.exec(note)![1]) / divisions,
    };
  });
}

type Played = { midi: number; cents: number; vibrato: boolean; seconds: number; gap: number };

function synthesize(notes: Played[]): Float32Array {
  const total = Math.ceil((notes.reduce((t, n) => t + n.seconds, 0) + 0.3) * SAMPLE_RATE);
  const signal = new Float32Array(total);
  let i = 0;
  let phase = 0;
  for (const note of notes) {
    const length = Math.round(note.seconds * SAMPLE_RATE);
    const sounding = length - Math.round(note.gap * SAMPLE_RATE);
    for (let k = 0; k < length; k++, i++) {
      const t = k / SAMPLE_RATE;
      const vibrato = note.vibrato ? 0.3 * Math.sin(2 * Math.PI * 6 * t) : 0;
      phase += midiToFrequency(note.midi + note.cents / 100 + vibrato, REFERENCE_A) / SAMPLE_RATE;
      // Bow envelope: 40 ms attack, 60 ms release; a re-bow without gap still dips to 30%.
      const fromEnd = (sounding - k) / SAMPLE_RATE;
      const envelope = k >= sounding ? 0 : Math.min(1, t / 0.04, 0.3 + (0.7 * fromEnd) / 0.06);
      let value = 0;
      for (let n = 1; n <= 10; n++) value += Math.sin(2 * Math.PI * n * phase) / n;
      signal[i] = 0.3 * envelope * value;
    }
  }
  return signal;
}

describe('following the minuet', () => {
  it('gets through every note and measures its intonation', () => {
    const notes = minuetNotes();
    expect(notes).toHaveLength(126);

    const played: Played[] = notes.map((note, i) => {
      const seconds = (note.beats * 60) / BPM;
      // Every third repeated note is re-bowed without any silence.
      const repeated = i > 0 && notes[i - 1].midi === note.midi;
      return {
        midi: note.midi,
        cents: Math.round(40 * Math.sin(i * 2.4)),
        vibrato: note.beats >= 1,
        seconds,
        gap: repeated && i % 3 === 0 ? 0 : Math.min(0.15, seconds / 4),
      };
    });
    const signal = synthesize(played);

    const smoother = new PitchSmoother();
    const follower = new ScoreFollower(notes.map((n) => n.midi));
    const events: FollowEvent[] = [];
    let lastHeard = 0;
    for (let time = 1000 / FPS; time <= (signal.length / SAMPLE_RATE) * 1000; time += 1000 / FPS) {
      const end = Math.floor((time / 1000) * SAMPLE_RATE);
      if (end < FRAME_SIZE) continue;
      const pitch = detectPitch(signal.slice(end - FRAME_SIZE, end), { sampleRate: SAMPLE_RATE });
      let midi: number | null = null;
      if (pitch) {
        lastHeard = time;
        midi = smoother.push(time, frequencyToMidi(pitch.frequency, REFERENCE_A));
      } else if (time - lastHeard > 200) smoother.reset();
      const event = follower.update(time, midi, pitch?.rms ?? 0);
      if (event) events.push(event);
    }

    const results = events.filter((e) => e.type === 'played');
    expect(events.filter((e) => e.type === 'wrong')).toEqual([]);
    expect(results.map((e) => e.index)).toEqual(notes.map((_, i) => i));
    const worst = Math.max(...results.map((e) => Math.abs(e.cents - played[e.index].cents)));
    console.log(`minuet: ${results.length} notes followed, worst intonation error ${worst.toFixed(1)}¢`);
    expect(worst).toBeLessThan(4);
  }, 30_000);
});
