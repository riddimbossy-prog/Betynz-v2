import { cp,mkdir,rm,writeFile,readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { day,readJSON,writeJSON } from '../src/util.mjs';
await rm('dist',{recursive:true,force:true});await mkdir('dist/data',{recursive:true});
await cp('public','dist',{recursive:true});
// A new HTML page must never reuse an older cached interface script or styles.
let html=await readFile('dist/index.html','utf8');
for(const asset of ['app.js','styles.css']) {
  const hash=createHash('sha256').update(await readFile(`dist/${asset}`)).digest('hex').slice(0,12);
  html=html.replaceAll(`./${asset}"`,`./${asset}?v=${hash}"`);
}
await writeFile('dist/index.html',html);
const index=await readJSON('data/index.json');
if(index) {
  await writeJSON('dist/data/index.json',index);
  for(const d of index.dates)for(const prefix of ['board','markets']) await cp(`data/${prefix}-${d.date}.json`,`dist/data/${prefix}-${d.date}.json`);
} else {
  const date=day(),message='The first Sportybet refresh has not completed yet. No sample predictions are displayed.';
  await writeJSON('dist/data/index.json',{version:7,generatedAt:null,dates:[{date,fixtures:0,qualified:0,status:'pending'}],complete:false,diagnostics:[message]});
  await writeJSON(`dist/data/board-${date}.json`,{version:7,date,generatedAt:null,status:'pending',matches:[],summary:{fixtures:0,qualified:0,skipped:0,markets:0},diagnostics:[message]});
}
await writeFile('dist/CNAME','betynz.com\n');await writeFile('dist/.nojekyll','');
console.log('Built Betynz into dist/');
