import { build } from 'esbuild';
import { mkdir, readdir, unlink } from 'node:fs/promises';

// Only clear generated bundle files; source, saves, and assets are untouched.
const outdir = new URL('../game/dist/', import.meta.url);
await mkdir(outdir, { recursive: true });
for (const file of await readdir(outdir)) {
  if (file.endsWith('.js')) await unlink(new URL(file, outdir));
}
await build({
  entryPoints: ['game/js/boot.js', 'game/js/version.js'],
  outdir: 'game/dist', bundle: true, splitting: true, format: 'esm',
  target: ['safari15', 'chrome90', 'firefox90'], minify: true,
  chunkNames: 'chunk-[hash]', legalComments: 'eof', logLevel: 'info',
});
