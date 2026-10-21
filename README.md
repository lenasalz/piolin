# 🎻 Piolin

**Pitch + violin.** A browser app that listens while you play the violin and tells you, in real time, whether you are in tune.

> Status: early development. The tuner works, and you can play along with sheet music in wait mode.

## Features

- **Play along with sheet music**: load a MusicXML score (a Bach minuet is included). The cursor waits on each note until you play it, then colours it green, yellow or red by intonation. Wrong notes are pointed out, and you get a summary at the end.
- **Live tuner**: note name, deviation in cents (positive = sharp/too high, negative = flat/too low) and a needle.
- **Vibrato-aware**: judges the centre of your vibrato, not every wobble.
- **Levels**: Beginner (±25¢), Intermediate (±15¢) and Advanced (±8¢) presets; the tolerance can be fine-tuned by hand.
- **Adjustable reference pitch**: defaults to A = 442 Hz, as common in European orchestras.
- **Private by design**: audio is analysed live in the browser and is never recorded or uploaded.

## Roadmap

1. ~~Tuner with level presets~~
2. ~~Score player: load MusicXML, display it with [OpenSheetMusicDisplay](https://opensheetmusicdisplay.org/), colour each note by intonation (wait mode)~~
3. Practice modes: play-along at tempo (with timing)
4. Find free scores by title (public-domain sources)
5. Session summary ("bar 12 was consistently flat"), PDF import via optical music recognition

## Getting started

Requires [Node.js](https://nodejs.org/) 20 or newer.

```bash
npm install
npm run dev
```

Open the printed URL (usually http://localhost:5173), press **Start**, and allow microphone access.
Works in Safari, Chrome and Firefox.

To play along, choose a piece under **Play along**, press **Start** and play from the first note.

No violin at hand? Open http://localhost:5173/?demo: a synthetic violin plays through your speakers and the app listens to it instead of the microphone. With a piece chosen, it plays that piece with some notes deliberately off; otherwise a short looping phrase.

| Command | What it does |
|---|---|
| `npm run dev` | Start the development server with live reload |
| `npm test` | Run the unit tests |
| `npm run build` | Type-check and build the static site into `dist/` |

## How it works

- **Pitch detection** ([src/audio/pitch.ts](src/audio/pitch.ts)): the McLeod Pitch Method, which handles the strong overtones of a bowed string and rarely jumps an octave. High notes are refined over several periods for sub-cent accuracy.
- **Smoothing** ([src/audio/smoothing.ts](src/audio/smoothing.ts)): vibrato is recognised by its peaks and troughs, and judged by the midpoint of the latest pair, which is exact at any vibrato speed. Steady notes skip this and respond within about 50 ms. One-frame glitches are ignored.
- **Microphone** ([src/audio/microphone.ts](src/audio/microphone.ts)): the browser's speech processing (noise suppression, echo cancellation, auto gain) is turned off, since it distorts a violin.

- **Score following** ([src/practice/follower.ts](src/practice/follower.ts)): waits for the expected note (within 60 cents, so a badly tuned note still counts), measures it while it sounds, and moves on when the pitch changes, the sound stops or the bow re-attacks. Sheet music is drawn by [OpenSheetMusicDisplay](https://opensheetmusicdisplay.org/) ([src/ui/score.ts](src/ui/score.ts)), which also follows repeat signs.

Notes are compared with equal temperament. Expressive intonation (e.g. high leading tones) will therefore show as small deviations.

## Your own scores

Put scores you own (for example, bought PDFs or MusicXML) in `scores/private/`. This folder is ignored by git, so copyrighted music never ends up in the public repository. Only public-domain pieces are committed, in `scores/`.

To play your own score, choose **Open a MusicXML file…** under Play along. MusicXML (`.musicxml`, `.xml` or compressed `.mxl`) can be exported from MuseScore, Sibelius, Finale or Dorico, and many free scores are available in this format.

## License

[MIT](LICENSE)
