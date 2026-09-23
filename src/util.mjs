import { readFile, writeFile, mkdir, rename } from 'node:fs/promises';
import { dirname } from 'node:path';
export const clamp = (v, min=0, max=1) => Math.min(max, Math.max(min, v));
export const round = (v, places=3) => Number.isFinite(v) ? Number(v.toFixed(places)) : null;
export const mean = a => a.length ? a.reduce((s,v)=>s+v,0)/a.length : null;
export const number = v => v === null || v === undefined || v === '' ? null : Number.isFinite(Number(v)) ? Number(v) : null;
export const day = (d=new Date()) => new Date(d).toISOString().slice(0,10);
export const addDays = (d,n) => day(Date.parse(`${d}T00:00:00Z`)+n*86400000);
export const sleep = ms => new Promise(resolve=>setTimeout(resolve,ms));
export async function readJSON(path, fallback=null) { try { return JSON.parse(await readFile(path,'utf8')); } catch(e) { if(e.code==='ENOENT') return fallback; throw e; } }
export async function writeJSON(path, value) { await mkdir(dirname(path),{recursive:true}); const temp=`${path}.${process.pid}.tmp`; await writeFile(temp,JSON.stringify(value)); await rename(temp,path); }
export async function mapLimit(items, limit, fn) {
  let next=0; const out=new Array(items.length);
  await Promise.all(Array.from({length:Math.min(limit,items.length)},async()=>{
    while(next<items.length) { const i=next++; out[i]=await fn(items[i],i); }
  })); return out;
}
export function normalizeName(s) { return String(s||'').normalize('NFKD').replace(/\p{Diacritic}/gu,'').toLowerCase().replace(/&/g,' and ').replace(/[^a-z0-9]+/g,' ').trim(); }
export const unique = values => [...new Set(values)];
