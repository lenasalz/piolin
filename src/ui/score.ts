// Sheet music display, rendered by OpenSheetMusicDisplay (loaded on demand, as
// it is large). Lists the notes in playing order (following repeats), moves the
// cursor and colours notes by intonation.

import type { GraphicalNote, OpenSheetMusicDisplay } from 'opensheetmusicdisplay';
import type { TuneState } from './tuner';

export interface ScoreNote {
  /** Expected pitch as a MIDI number. */
  midi: number;
  /** Length in quarter-note beats. */
  beats: number;
  /** Bar number, counting from 1. */
  bar: number;
}

/** A note on the page: one per cursor position, so a repeated passage lists its notes again. */
interface Position {
  /** How many cursor steps from the start (rests take steps too). */
  step: number;
  graphical: GraphicalNote;
}

export class ScoreView {
  notes: ScoreNote[] = [];
  private osmd: OpenSheetMusicDisplay | null = null;
  private positions: Position[] = [];
  private marks = new Map<number, TuneState>();
  private cursorIndex = 0;
  private cursorStep = 0;

  constructor(private readonly container: HTMLElement) {}

  /** Loads MusicXML (plain text, or the zipped .mxl format as a binary string). */
  async load(xml: string): Promise<void> {
    const { OpenSheetMusicDisplay } = await import('opensheetmusicdisplay');
    this.osmd ??= new OpenSheetMusicDisplay(this.container, {
      autoResize: false, // re-rendering loses the colours, so main.ts handles resizes via rerender()
      autoBeam: true,
      drawPartNames: false,
      followCursor: true,
    });
    await this.osmd.load(xml);
    this.marks.clear();
    this.render();
    this.notes = this.collect().map(({ note }) => note);
    this.moveCursor(0);
  }

  get title(): string {
    return this.osmd?.Sheet.TitleString || 'Untitled';
  }

  /** Re-lays out the score for the current width, keeping colours and cursor. */
  rerender(): void {
    if (!this.osmd) return;
    this.render();
    this.collect();
    for (const [index, state] of this.marks) this.paint(index, state);
    const index = this.cursorIndex;
    this.cursorStep = 0;
    this.moveCursor(index);
  }

  /** Puts the cursor on the note with this index (or hides it past the end). */
  moveCursor(index: number): void {
    const cursor = this.osmd?.cursor;
    if (!cursor) return;
    this.cursorIndex = index;
    const target = this.positions[index]?.step;
    if (target === undefined) {
      cursor.hide();
      return;
    }
    if (target < this.cursorStep || cursor.Hidden) {
      cursor.reset();
      cursor.show();
      this.cursorStep = 0;
    }
    for (; this.cursorStep < target; this.cursorStep++) cursor.next();
  }

  mark(index: number, state: TuneState): void {
    this.marks.set(index, state);
    this.paint(index, state);
  }

  clearMarks(): void {
    for (const index of this.marks.keys()) this.paint(index, null);
    this.marks.clear();
  }

  private render(): void {
    // Full size from about 900 px wide; smaller on phones so a line holds several bars.
    this.osmd!.Zoom = Math.max(0.5, Math.min(1, this.container.clientWidth / 900));
    this.osmd!.render();
  }

  /** Walks the cursor through the piece, recording each sounding note. */
  private collect(): { note: ScoreNote }[] {
    const cursor = this.osmd!.cursor;
    cursor.reset();
    const found: { note: ScoreNote; position: Position }[] = [];
    for (let step = 0; !cursor.Iterator.EndReached; step++, cursor.next()) {
      const notes = cursor.NotesUnderCursor();
      const graphical = cursor.GNotesUnderCursor();
      // The highest sounding note, in case of chords; tied continuations aren't played again.
      let best = -1;
      notes.forEach((note, i) => {
        const continuation = note.NoteTie && note.NoteTie.StartNote !== note;
        if (note.isRest() || note.IsGraceNote || continuation || !graphical[i]) return;
        if (best < 0 || note.halfTone > notes[best].halfTone) best = i;
      });
      if (best < 0) continue;
      const note = notes[best];
      found.push({
        // OSMD counts half tones from C0 = 0; MIDI has C-1 = 0.
        note: { midi: note.halfTone + 12, beats: note.Length.RealValue * 4, bar: cursor.Iterator.CurrentMeasureIndex + 1 },
        position: { step, graphical: graphical[best] },
      });
    }
    cursor.reset();
    this.cursorStep = 0;
    this.positions = found.map(({ position }) => position);
    return found;
  }

  /** Colours a note on the page (null restores the default colour). */
  private paint(index: number, state: TuneState | null): void {
    const element = (this.positions[index]?.graphical as { getSVGGElement?: () => SVGGElement })?.getSVGGElement?.();
    if (!element) return;
    const color = state ? getComputedStyle(this.container).getPropertyValue(`--note-${state}`).trim() : '';
    element.querySelectorAll<SVGElement>('path, rect').forEach((shape) => {
      shape.style.fill = shape.getAttribute('fill') === 'none' ? '' : color;
      shape.style.stroke = shape.getAttribute('stroke') === 'none' ? '' : color;
    });
  }
}
