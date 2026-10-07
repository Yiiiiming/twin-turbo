import { build } from 'esbuild';
const result = await build({entryPoints:['main.js'],bundle:true,format:'iife',platform:'browser',
  target:['es2022'],outfile:'.game-build.js',minify:true,legalComments:'inline',metafile:true});
const forbiddenInputs = Object.keys(result.metafile.inputs).filter(path => /city-renderer|city-landmarks|london-map|london-road-cache|three\//.test(path));
if (forbiddenInputs.length) throw new Error(`Harbor build contains London assets: ${forbiddenInputs.join(', ')}`);
