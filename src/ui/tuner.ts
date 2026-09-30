// Tuner display: note name, cents deviation and a needle on a ±50 cent scale.

import type { NoteReading } from '../music/notes';

const SCALE_CENTS = 50;

export type TuneState = 'in-tune' | 'close' | 'off';

export function tuneState(cents: number, toleranceCents: number): TuneState {
  const deviation = Math.abs(cents);
  if (deviation <= toleranceCents) return 'in-tune';
  if (deviation <= toleranceCents * 2) return 'close';
  return 'off';
}

export class TunerView {
  private readonly note: HTMLElement;
  private readonly octave: HTMLElement;
  private readonly verdict: HTMLElement;
  private readonly frequency: HTMLElement;
  private readonly needle: HTMLElement;
  private readonly zone: HTMLElement;

  constructor(private readonly root: HTMLElement) {
    root.innerHTML = `
      <div class="tuner-note"><span class="tuner-name">–</span><sub class="tuner-octave"></sub></div>
      <div class="tuner-verdict">Press start and play a note</div>
      <div class="tuner-scale" aria-hidden="true">
        <div class="tuner-zone"></div>
        <div class="tuner-center"></div>
        <div class="tuner-needle"></div>
        <span class="tuner-label left">flat −50¢</span>
        <span class="tuner-label right">+50¢ sharp</span>
      </div>
      <div class="tuner-frequency"></div>`;
    this.note = root.querySelector('.tuner-name')!;
    this.octave = root.querySelector('.tuner-octave')!;
    this.verdict = root.querySelector('.tuner-verdict')!;
    this.frequency = root.querySelector('.tuner-frequency')!;
    this.needle = root.querySelector('.tuner-needle')!;
    this.zone = root.querySelector('.tuner-zone')!;
  }

  setTolerance(toleranceCents: number): void {
    const width = Math.min(100, (toleranceCents / SCALE_CENTS) * 50);
    this.zone.style.left = `${50 - width}%`;
    this.zone.style.width = `${2 * width}%`;
  }

  show(reading: NoteReading, frequency: number, toleranceCents: number): void {
    const cents = Math.round(reading.cents);
    const state = tuneState(reading.cents, toleranceCents);
    this.root.dataset.state = state;
    this.root.dataset.active = 'true';
    this.note.textContent = reading.name;
    this.octave.textContent = String(reading.octave);
    this.verdict.textContent =
      state === 'in-tune'
        ? `In tune (${cents >= 0 ? '+' : '−'}${Math.abs(cents)}¢)`
        : cents > 0
          ? `${cents}¢ sharp — too high`
          : `${-cents}¢ flat — too low`;
    this.frequency.textContent = `${frequency.toFixed(1)} Hz`;
    const clamped = Math.max(-SCALE_CENTS, Math.min(SCALE_CENTS, reading.cents));
    this.needle.style.left = `${50 + (clamped / SCALE_CENTS) * 50}%`;
  }

  /** No clear note right now: keep the last reading visible but dimmed. */
  idle(message?: string): void {
    this.root.dataset.active = 'false';
    if (message) this.verdict.textContent = message;
  }
}
