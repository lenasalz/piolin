import './style.css';
import minuetXml from '../scores/bach-minuet-in-g.musicxml?raw';
import { FRAME_SIZE, openDemo, openMicrophone, type DemoNote, type Microphone } from './audio/microphone';
import { detectPitch } from './audio/pitch';
import { PitchSmoother } from './audio/smoothing';
import { describePitch, frequencyToMidi, midiToFrequency } from './music/notes';
import { ScoreFollower, type FollowEvent } from './practice/follower';
import { LEVEL_PRESETS, loadSettings, saveSettings, settingsForLevel, type Level, type Settings } from './settings';
import { ScoreView } from './ui/score';
import { TunerView, tuneState } from './ui/tuner';

const DEMO = new URLSearchParams(location.search).has('demo');
/** How long without a clear note before the display dims. */
const SILENCE_MS = 200;
/** Tempo at which the demo plays a score. */
const DEMO_BPM = 84;

let settings: Settings = loadSettings();
const tuner = new TunerView(document.querySelector<HTMLElement>('#tuner')!);
const smoother = new PitchSmoother();

const startButton = document.querySelector<HTMLButtonElement>('#start')!;
const levelButtons = document.querySelectorAll<HTMLButtonElement>('[data-level]');
const referenceInput = document.querySelector<HTMLInputElement>('#reference-a')!;
const toleranceInput = document.querySelector<HTMLInputElement>('#tolerance')!;
const toleranceValue = document.querySelector<HTMLOutputElement>('#tolerance-value')!;
const levelHint = document.querySelector<HTMLElement>('#level-hint')!;
const pieceSelect = document.querySelector<HTMLSelectElement>('#piece')!;
const pieceFile = document.querySelector<HTMLInputElement>('#piece-file')!;
const pieceStatus = document.querySelector<HTMLElement>('#piece-status')!;
const restartButton = document.querySelector<HTMLButtonElement>('#restart')!;
const scoreElement = document.querySelector<HTMLElement>('#score')!;

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

// ---- Play along ----

const score = new ScoreView(scoreElement);
let follower: ScoreFollower | null = null;
/** Intonation of each played note, by note index. */
let results = new Map<number, number>();

const noteName = (midi: number) => {
  const { name, octave } = describePitch(midi);
  return `${name}${octave}`;
};

function showStatus(text: string, tone: 'normal' | 'wrong' = 'normal'): void {
  pieceStatus.hidden = false;
  pieceStatus.textContent = text;
  pieceStatus.dataset.tone = tone;
}

function showNextNote(): void {
  if (!follower) return;
  if (follower.done) {
    const inTune = [...results.values()].filter((cents) => tuneState(cents, settings.toleranceCents) === 'in-tune').length;
    showStatus(`Finished! ${inTune} of ${results.size} notes in tune (±${settings.toleranceCents}¢).`);
    return;
  }
  const note = score.notes[follower.index];
  showStatus(`Bar ${note.bar}: play ${noteName(note.midi)}`);
}

function handleFollowEvent(event: FollowEvent): void {
  if (event.type === 'wrong') {
    const expected = score.notes[event.index];
    showStatus(`Bar ${expected.bar}: expected ${noteName(expected.midi)}, hearing ${noteName(event.heardMidi)}`, 'wrong');
    return;
  }
  results.set(event.index, event.cents);
  score.mark(event.index, tuneState(event.cents, settings.toleranceCents));
  score.moveCursor(follower!.index);
  showNextNote();
}

function restartPiece(): void {
  if (!follower) return;
  follower.restart();
  results = new Map();
  score.clearMarks();
  score.moveCursor(0);
  showNextNote();
}

async function loadPiece(xml: string): Promise<void> {
  showStatus('Loading the sheet music…');
  scoreElement.hidden = false;
  document.body.classList.add('has-score');
  try {
    await score.load(xml);
  } catch (error) {
    closePiece();
    showStatus(`Could not read this file as MusicXML: ${String(error)}`, 'wrong');
    return;
  }
  if (score.notes.length === 0) {
    closePiece();
    showStatus('This score has no notes to play.', 'wrong');
    return;
  }
  follower = new ScoreFollower(score.notes.map((note) => note.midi));
  restartButton.hidden = false;
  restartPiece();
  if (DEMO && input) await restartInput();
}

function closePiece(): void {
  follower = null;
  scoreElement.hidden = true;
  restartButton.hidden = true;
  pieceStatus.hidden = true;
  document.body.classList.remove('has-score');
}

pieceSelect.addEventListener('change', () => {
  if (pieceSelect.value === 'minuet') void loadPiece(minuetXml);
  else if (pieceSelect.value === 'file') pieceFile.click();
  else closePiece();
});

pieceFile.addEventListener('change', () => {
  const file = pieceFile.files?.[0];
  pieceFile.value = '';
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => void loadPiece(reader.result as string);
  // Compressed .mxl files are zip archives, which OpenSheetMusicDisplay reads from a binary string.
  if (file.name.toLowerCase().endsWith('.mxl')) reader.readAsBinaryString(file);
  else reader.readAsText(file);
});

restartButton.addEventListener('click', async () => {
  restartPiece();
  if (DEMO && input) await restartInput();
});

let resizeTimer = 0;
window.addEventListener('resize', () => {
  clearTimeout(resizeTimer);
  resizeTimer = window.setTimeout(() => score.rerender(), 250);
});

// ---- Listening ----

let input: Microphone | null = null;
let frame = 0;
let lastHeard = 0;

/** In demo mode with a score loaded, the demo plays the score (some notes a little off). */
function demoPhrase(): DemoNote[] | undefined {
  if (!follower) return undefined;
  return score.notes.slice(follower.index).map((note, i) => ({
    midi: note.midi,
    cents: Math.round(40 * Math.sin(i * 2.4)),
    vibrato: note.beats >= 1,
    seconds: (note.beats * 60) / DEMO_BPM,
  }));
}

async function openInput(): Promise<Microphone> {
  if (!DEMO) return openMicrophone();
  const phrase = demoPhrase();
  return phrase ? openDemo(settings.referenceA, phrase, false) : openDemo(settings.referenceA);
}

async function start(): Promise<void> {
  startButton.disabled = true;
  try {
    input = await openInput();
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
    let midi: number | null = null;
    if (pitch) {
      lastHeard = now;
      midi = smoother.push(now, frequencyToMidi(pitch.frequency, settings.referenceA));
      tuner.show(describePitch(midi), midiToFrequency(midi, settings.referenceA), settings.toleranceCents);
    } else if (now - lastHeard > SILENCE_MS) {
      smoother.reset();
      tuner.idle();
    }
    const event = follower?.update(now, midi, pitch?.rms ?? 0);
    if (event) handleFollowEvent(event);
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

/** Restarts listening, so the demo plays the current piece from the current note. */
async function restartInput(): Promise<void> {
  await stop();
  await start();
}

startButton.addEventListener('click', () => (input ? stop() : start()));

if (DEMO) document.body.classList.add('demo');
applySettings(settings);
