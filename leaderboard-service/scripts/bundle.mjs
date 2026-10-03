import {readFile,writeFile} from 'node:fs/promises';
const rules=(await readFile('worker/rules.js','utf8')).replace(/^export /gm,'');
const worker=(await readFile('worker/index.js','utf8')).replace(/^import .*?;\n/gm,'');
await writeFile('dist/server/index.js',rules+'\n'+worker);
