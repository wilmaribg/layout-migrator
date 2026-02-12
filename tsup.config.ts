import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm'],
  target: 'node20',
  outDir: 'dist',
  clean: true,
  dts: false,
  sourcemap: false,
  minify: false,
  splitting: false,
  treeshake: true,
  shims: true,
  banner: {
    js: '#!/usr/bin/env node',
  },
  noExternal: ['@design-studio/schema'],
  esbuildOptions(options) {
    options.charset = 'utf8';
  },
});
