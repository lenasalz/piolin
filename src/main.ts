import './style.css';
import { FRAME_SIZE, openDemo, openMicrophone, type Microphone } from './audio/microphone';
import { detectPitch } from './audio/pitch';
import { PitchSmoother } from './audio/smoothing';
import { describePitch, frequencyToMidi, midiToFrequency } from './music/notes';
import { LEVEL_PRESETS, loadSettings, saveSettings, settingsForLevel, type Level, type Settings } from './settings';
import { TunerView } from './ui/tuner';

const DEMO = new URLSearchParams(location.search).has('demo');
/** How long without a clear note before the display dims. */
const SILENCE_MS = 200;

let settings: Settings = loadSettings();
const tuner = new TunerView(document.querySelector<HTMLElement>('#tuner')!);
const smoother = new PitchSmoother();

const startButton = document.querySelector<HTMLButtonElement>('#start')!;
const levelButtons = document.querySelectorAll<HTMLButtonElement>('[data-level]');
const referenceInput = document.querySelector<HTMLInputElement>('#reference-a')!;
const toleranceInput = document.querySelector<HTMLInputElement>('#tolerance')!;
const toleranceValue = document.querySelector<HTMLOutputElement>('#tolerance-value')!;
const levelHint = document.querySelector<HTMLElement>('#level-hint')!;

function applySettings(next: Settings): void {
  settings = next;
  saveSettings(settings);
  smoother.reset();
  tuner.setTolerance(settings.toleranceCents);

  levelButtons.forEach((button) => {
    button.setAttribute('aria-pressed', String(button.dataset.level === settings.level));
  });
  referenceInput.value = String(settings.referenceA);
  toleranceInput.value = String(settings.toleranceCents);
  toleranceValue.value = `±${settings.toleranceCents}¢`;
  const preset = LEVEL_PRESETS[settings.level];
  levelHint.textContent =
    preset.toleranceCents === settings.toleranceCents
      ? `${preset.label} preset: in tune within ±${preset.toleranceCents} cents.`
      : `${preset.label}, with a custom tolerance of ±${settings.toleranceCents} cents.`;
}

levelButtons.forEach((button) => {
  button.addEventListener('click', () => {
    applySettings(settingsForLevel(button.dataset.level as Level, settings.referenceA));
  });
});

referenceInput.addEventListener('change', () => {
  const value = Number(referenceInput.value);
  if (value >= 400 && value <= 480) applySettings({ ...settings, referenceA: value });
  else referenceInput.value = String(settings.referenceA);
});

toleranceInput.addEventListener('input', () => {
  applySettings({ ...settings, toleranceCents: Number(toleranceInput.value) });
});

let input: Microphone | null = null;
let frame = 0;
let lastHeard = 0;

async function start(): Promise<void> {
  startButton.disabled = true;
  try {
    input = DEMO ? await openDemo(settings.referenceA) : await openMicrophone();
  } catch (error) {
    tuner.idle(
      error instanceof DOMException && error.name === 'NotAllowedError'
        ? 'Microphone access was blocked. Allow it in the browser settings and try again.'
        : `Could not open the microphone: ${String(error)}`,
    );
    startButton.disabled = false;
    return;
  }
  startButton.textContent = 'Stop';
  startButton.disabled = false;
  tuner.idle('Listening… play a note');
  const buffer = new Float32Array(FRAME_SIZE);

  const loop = (now: number) => {
    if (!input) return;
    input.read(buffer);
    const pitch = detectPitch(buffer, { sampleRate: input.sampleRate });
    if (pitch) {
      lastHeard = now;
      const midi = smoother.push(now, frequencyToMidi(pitch.frequency, settings.referenceA));
      tuner.show(describePitch(midi), midiToFrequency(midi, settings.referenceA), settings.toleranceCents);
    } else if (now - lastHeard > SILENCE_MS) {
      smoother.reset();
      tuner.idle();
    }
    frame = requestAnimationFrame(loop);
  };
  frame = requestAnimationFrame(loop);
}

async function stop(): Promise<void> {
  cancelAnimationFrame(frame);
  await input?.stop();
  input = null;
  startButton.textContent = 'Start';
  tuner.idle('Stopped');
}

startButton.addEventListener('click', () => (input ? stop() : start()));

if (DEMO) document.body.classList.add('demo');
applySettings(settings);
