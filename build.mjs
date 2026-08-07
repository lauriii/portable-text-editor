import { build } from 'esbuild';

await build({
  entryPoints: ['js-src/editor.jsx'],
  outfile: 'js/portable-text-editor.js',
  bundle: true,
  minify: true,
  format: 'iife',
  target: 'es2020',
  jsx: 'automatic',
  legalComments: 'none',
  define: { 'process.env.NODE_ENV': '"production"', global: 'window' },
});
