import { readdir } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
async function walk(dir) {return (await Promise.all((await readdir(dir,{withFileTypes:true})).map(e=>e.isDirectory()?walk(`${dir}/${e.name}`):[`${dir}/${e.name}`]))).flat();}
for(const dir of ['src','scripts','public','tests'])for(const file of await walk(dir))if(/\.(mjs|js)$/.test(file)) {
  const r=spawnSync(process.execPath,['--check',file],{stdio:'inherit'});if(r.status)process.exit(r.status);
}
console.log('JavaScript syntax checks passed');
