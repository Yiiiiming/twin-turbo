import { build } from 'esbuild';
await build({entryPoints:['main.js'],bundle:true,format:'iife',platform:'browser',
  target:['es2022'],outfile:'.game-build.js',minify:true,legalComments:'inline',
  banner:{js:'/* Twin Turbo. Includes Three.js, Copyright 2010-2026 Three.js authors, MIT License. */'}});
