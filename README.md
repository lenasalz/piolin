# 🎻 Piolin

**Pitch + violin.** A browser app that listens while you play the violin and tells you, in real time, whether you are in tune.

> Status: early development. The tuner works; sheet-music following is next.

## Features

- **Live tuner**: note name, deviation in cents (positive = sharp/too high, negative = flat/too low) and a needle.
- **Vibrato-aware**: judges the centre of your vibrato, not every wobble.
- **Levels**: Beginner (±25¢), Intermediate (±15¢) and Advanced (±8¢) presets; the tolerance can be fine-tuned by hand.
- **Adjustable reference pitch**: defaults to A = 442 Hz, as common in European orchestras.
- **Private by design**: audio is analysed live in the browser and is never recorded or uploaded.

## Roadmap

1. ~~Tuner with level presets~~
2. Score player: load MusicXML, display it with [OpenSheetMusicDisplay](https://opensheetmusicdisplay.org/), colour each note by intonation
3. Practice modes: play-along at tempo (with timing) and wait mode (the cursor waits for the right note)
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

No violin at hand? Open http://localhost:5173/?demo: a synthetic violin plays a short looping phrase (some notes in tune, some not, some with vibrato) through your speakers, and the tuner listens to it instead of the microphone.

| Command | What it does |
|---|---|
| `npm run dev` | Start the development server with live reload |
| `npm test` | Run the unit tests |
| `npm run build` | Type-check and build the static site into `dist/` |

## How it works

- **Pitch detection** ([src/audio/pitch.ts](src/audio/pitch.ts)): the McLeod Pitch Method, which handles the strong overtones of a bowed string and rarely jumps an octave. High notes are refined over several periods for sub-cent accuracy.
- **Smoothing** ([src/audio/smoothing.ts](src/audio/smoothing.ts)): vibrato is recognised by its peaks and troughs, and judged by the midpoint of the latest pair, which is exact at any vibrato speed. Steady notes skip this and respond within about 50 ms. One-frame glitches are ignored.
- **Microphone** ([src/audio/microphone.ts](src/audio/microphone.ts)): the browser's speech processing (noise suppression, echo cancellation, auto gain) is turned off, since it distorts a violin.

Notes are compared with equal temperament. Expressive intonation (e.g. high leading tones) will therefore show as small deviations.

## Your own scores

Put scores you own (for example, bought PDFs or MusicXML) in `scores/private/`. This folder is ignored by git, so copyrighted music never ends up in the public repository. Only public-domain pieces are committed.

## License

[MIT](LICENSE)
