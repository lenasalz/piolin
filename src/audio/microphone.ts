// Microphone input. Browser voice processing (echo cancellation, noise
// suppression, auto gain) is built for speech and distorts a violin, so it is off.

export interface Microphone {
  sampleRate: number;
  /** Fills the buffer with the most recent samples. */
  read(buffer: Float32Array<ArrayBuffer>): void;
  stop(): Promise<void>;
}

export const FRAME_SIZE = 1024;

export async function openMicrophone(): Promise<Microphone> {
  const stream = await navigator.mediaDevices.getUserMedia({
    audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false },
  });
  const context = new AudioContext();
  await context.resume();

  const analyser = context.createAnalyser();
  analyser.fftSize = FRAME_SIZE;
  context.createMediaStreamSource(stream).connect(analyser);

  return {
    sampleRate: context.sampleRate,
    read: (buffer) => analyser.getFloatTimeDomainData(buffer),
    stop: async () => {
      stream.getTracks().forEach((track) => track.stop());
      await context.close();
    },
  };
}

export interface DemoNote {
  midi: number;
  /** How far off the demo plays it. */
  cents: number;
  vibrato: boolean;
  seconds: number;
}

/** The default demo phrase, up the A string: some notes in tune, some not, some with vibrato. */
export const DEMO_PHRASE: DemoNote[] = [
  { midi: 69, cents: 12, vibrato: true, seconds: 1.4 }, // A4, a little sharp
  { midi: 71, cents: -18, vibrato: false, seconds: 1.4 }, // B4, flat
  { midi: 73, cents: 3, vibrato: true, seconds: 1.4 }, // C♯5, in tune
  { midi: 74, cents: 30, vibrato: false, seconds: 1.4 }, // D5, clearly sharp
  { midi: 76, cents: -6, vibrato: true, seconds: 1.4 }, // E5, in tune
  { midi: 74, cents: 0, vibrato: false, seconds: 1.4 }, // D5, in tune
];
/** Longest silence between notes, like a bow change. */
const DEMO_GAP_S = 0.15;
const DEMO_VIBRATO_CENTS = 30;

/**
 * A synthetic input for trying the app without a violin (open with ?demo): a
 * phrase played through the speakers and fed to the tuner, optionally looped.
 * The tone is a filtered sawtooth (rich in overtones, like a bowed string) with
 * 6 Hz vibrato on some notes.
 */
export async function openDemo(referenceA: number, phrase = DEMO_PHRASE, loop = true): Promise<Microphone> {
  const context = new AudioContext();
  await context.resume();

  const tone = context.createOscillator();
  tone.type = 'sawtooth';
  const vibrato = context.createOscillator();
  vibrato.frequency.value = 6;
  const vibratoDepth = context.createGain();
  vibrato.connect(vibratoDepth).connect(tone.frequency);

  const filter = context.createBiquadFilter();
  filter.type = 'lowpass';
  filter.frequency.value = 4000;
  const envelope = context.createGain();
  envelope.gain.value = 0;
  const analyser = context.createAnalyser();
  analyser.fftSize = FRAME_SIZE;
  const speaker = context.createGain();
  speaker.gain.value = 0.15;
  tone.connect(filter).connect(envelope);
  envelope.connect(analyser);
  envelope.connect(speaker).connect(context.destination);

  const play = (note: DemoNote, at: number) => {
    const frequency = referenceA * 2 ** ((note.midi - 69 + note.cents / 100) / 12);
    const release = at + note.seconds - Math.min(DEMO_GAP_S, note.seconds / 4);
    tone.frequency.setValueAtTime(frequency, at);
    vibratoDepth.gain.setValueAtTime(note.vibrato ? frequency * (2 ** (DEMO_VIBRATO_CENTS / 1200) - 1) : 0, at);
    envelope.gain.setValueAtTime(0, at);
    envelope.gain.linearRampToValueAtTime(0.3, at + 0.04);
    envelope.gain.setValueAtTime(0.3, release - 0.06);
    envelope.gain.linearRampToValueAtTime(0, release);
  };

  // Schedule notes a little ahead of time so timer hiccups can't be heard.
  let index = 0;
  let next = context.currentTime + 0.1;
  const scheduleAhead = () => {
    while (next < context.currentTime + 1 && (loop || index < phrase.length)) {
      const note = phrase[index++ % phrase.length];
      play(note, next);
      next += note.seconds;
    }
  };
  scheduleAhead();
  const timer = setInterval(scheduleAhead, 250);
  tone.start();
  vibrato.start();

  return {
    sampleRate: context.sampleRate,
    read: (buffer) => analyser.getFloatTimeDomainData(buffer),
    stop: () => {
      clearInterval(timer);
      return context.close();
    },
  };
}
