import { defineConfig } from 'vite';

// Relative base so the built app works both locally and on GitHub Pages (/piolin/).
export default defineConfig({
  base: './',
  build: {
    // OpenSheetMusicDisplay is ~1.4 MB; it is loaded only once a piece is chosen.
    chunkSizeWarningLimit: 1500,
  },
});
