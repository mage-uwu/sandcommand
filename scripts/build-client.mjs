import { build } from 'esbuild';
import { writeFileSync } from 'node:fs';

// Each build gets an id: baked into the client and published beside it
// (public/version.json), so a running (installed) client can tell when a
// newer build is live and reload onto it.
const buildId = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

await build({
  entryPoints: ['src/client/main.ts'],
  bundle: true,
  format: 'esm',
  target: 'es2022',
  minify: process.argv.includes('--minify') || process.env.NODE_ENV === 'production',
  sourcemap: true,
  outfile: 'public/app.js',
  logLevel: 'info',
  define: { __BUILD_ID__: JSON.stringify(buildId) },
});
writeFileSync('public/version.json', JSON.stringify({ build: buildId }) + '\n');
