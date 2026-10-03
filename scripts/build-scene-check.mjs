import { build } from 'esbuild';
await build({ entryPoints: ['tools/london-scene-test.js'], bundle: true,
  format: 'iife', platform: 'browser', target: ['es2022'],
  outfile: 'tools/london-scene-test.bundle.js', legalComments: 'inline' });
