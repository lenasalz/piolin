import { describe, expect, it } from 'vitest';
import { ScoreFollower, type FollowEvent } from './follower';

/** A stretch of playing: `midi` null is silence. */
type Segment = { ms: number; midi: number | null; rms?: number };

/** Feeds the segments to the follower at 60 fps and collects its events. */
function play(follower: ScoreFollower, segments: Segment[]): FollowEvent[] {
  const events: FollowEvent[] = [];
  let time = 0;
  for (const { ms, midi, rms = midi === null ? 0 : 0.2 } of segments) {
    for (const end = time + ms; time < end; time += 1000 / 60) {
      const event = follower.update(time, midi, rms);
      if (event) events.push(event);
    }
  }
  return events;
}

describe('ScoreFollower', () => {
  it('advances through a melody and measures each note', () => {
    const follower = new ScoreFollower([74, 67, 69]);
    const events = play(follower, [
      { ms: 300, midi: 74.08 },
      { ms: 300, midi: 66.85 },
      { ms: 300, midi: 69 },
      { ms: 100, midi: null },
    ]);
    expect(events.map((e) => e.type)).toEqual(['played', 'played', 'played']);
    expect(events.map((e) => (e.type === 'played' ? Math.round(e.cents) : 0))).toEqual([8, -15, 0]);
    expect(follower.done).toBe(true);
  });

  it('counts a badly out-of-tune note as the expected note', () => {
    const follower = new ScoreFollower([69, 71]);
    const events = play(follower, [
      { ms: 300, midi: 68.6 }, // 40 cents flat: nearer G♯ than A, but clearly meant as A
      { ms: 100, midi: null },
    ]);
    expect(events).toEqual([{ type: 'played', index: 0, cents: expect.closeTo(-40, 0) }]);
  });

  it('separates repeated notes by a pause', () => {
    const follower = new ScoreFollower([67, 67, 76]);
    const events = play(follower, [
      { ms: 250, midi: 67 },
      { ms: 50, midi: null },
      { ms: 250, midi: 67 },
      { ms: 250, midi: 76 },
      { ms: 50, midi: null },
    ]);
    expect(events.filter((e) => e.type === 'played')).toHaveLength(3);
  });

  it('separates repeated notes by a bow change without silence', () => {
    const follower = new ScoreFollower([67, 67, 76]);
    const events = play(follower, [
      { ms: 250, midi: 67, rms: 0.2 },
      { ms: 50, midi: 67, rms: 0.08 }, // bow change: loudness dips
      { ms: 250, midi: 67, rms: 0.2 },
      { ms: 250, midi: 76 },
    ]);
    expect(events.map((e) => e.index)).toEqual([0, 1]);
    expect(follower.index).toBe(2);
  });

  it('does not split a held note', () => {
    const follower = new ScoreFollower([67, 67]);
    play(follower, [{ ms: 1000, midi: 67 }]);
    expect(follower.index).toBe(0);
  });

  it('reports a wrong note once and keeps waiting', () => {
    const follower = new ScoreFollower([74, 67]);
    const events = play(follower, [
      { ms: 400, midi: 76 },
      { ms: 300, midi: 74 },
      { ms: 100, midi: null },
    ]);
    expect(events).toEqual([
      { type: 'wrong', index: 0, heardMidi: 76 },
      { type: 'played', index: 0, cents: 0 },
    ]);
  });

  it('ignores a passing flicker of the expected note', () => {
    const follower = new ScoreFollower([74, 67]);
    play(follower, [
      { ms: 30, midi: 74 },
      { ms: 200, midi: null },
    ]);
    expect(follower.index).toBe(0);
  });
});
