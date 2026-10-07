import { build } from 'esbuild';

await build({
  entryPoints: ['src/client/main.ts'],
  bundle: true,
  format: 'esm',
  target: 'es2022',
  minify: process.argv.includes('--minify') || process.env.NODE_ENV === 'production',
  sourcemap: true,
  outfile: 'public/app.js',
  logLevel: 'info',
});
