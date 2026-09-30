// Microphone input. Browser voice processing (echo cancellation, noise
// suppression, auto gain) is built for speech and distorts a violin, so it is off.

export interface Microphone {
  sampleRate: number;
  /** Fills the buffer with the most recent samples. */
  read(buffer: Float32Array<ArrayBuffer>): void;
  stop(): Promise<void>;
}

export const FRAME_SIZE = 2048;

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

/**
 * A silent synthetic input for trying the app without a violin (open with ?demo):
 * a sawtooth (rich in overtones, like a bowed string) with 6 Hz vibrato.
 */
export async function openDemoTone(frequency: number): Promise<Microphone> {
  const context = new AudioContext();
  await context.resume();

  const tone = context.createOscillator();
  tone.type = 'sawtooth';
  tone.frequency.value = frequency;

  const vibrato = context.createOscillator();
  vibrato.frequency.value = 6;
  const vibratoDepth = context.createGain();
  vibratoDepth.gain.value = frequency * (2 ** (30 / 1200) - 1); // ±30 cents
  vibrato.connect(vibratoDepth).connect(tone.frequency);

  const volume = context.createGain();
  volume.gain.value = 0.3;
  const analyser = context.createAnalyser();
  analyser.fftSize = FRAME_SIZE;
  tone.connect(volume).connect(analyser);
  tone.start();
  vibrato.start();

  return {
    sampleRate: context.sampleRate,
    read: (buffer) => analyser.getFloatTimeDomainData(buffer),
    stop: () => context.close(),
  };
}
