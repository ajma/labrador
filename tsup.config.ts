import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/server/index.ts'],
  outDir: 'dist/server',
  format: ['esm'],
  target: 'node24',
  clean: true,
  noExternal: [/^@shared/],
});
