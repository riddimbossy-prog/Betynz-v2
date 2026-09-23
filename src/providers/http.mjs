import { createHash } from 'node:crypto';
import { readJSON, writeJSON, sleep } from '../util.mjs';
export class HttpClient {
  constructor({fetchImpl=fetch,cacheDir='.cache/http',interval=0,headers={}}={}) { Object.assign(this,{fetchImpl,cacheDir,interval,headers}); this.next=0; this.inflight=new Map(); }
  async json(url,{ttl=0,headers={},validate=()=>{}}={}) {
    const key=createHash('sha256').update(String(url)).digest('hex');
    if(this.inflight.has(key)) return this.inflight.get(key);
    const run=this.request(url,key,{ttl,headers,validate}).finally(()=>this.inflight.delete(key));
    this.inflight.set(key,run); return run;
  }
  async request(url,key,{ttl,headers,validate}) {
    const path=`${this.cacheDir}/${key}.json`;
    if(ttl) { const cached=await readJSON(path); if(cached && Date.now()-cached.at<ttl) return cached.body; }
    for(let attempt=0;attempt<3;attempt++) {
      const slot=Math.max(Date.now(),this.next); this.next=slot+this.interval;
      if(slot>Date.now()) await sleep(slot-Date.now());
      const response=await this.fetchImpl(url,{headers:{accept:'application/json',...this.headers,...headers},signal:AbortSignal.timeout(25000)});
      if((response.status===429 || response.status>=500) && attempt<2) {
        const retry=Number(response.headers.get('retry-after'))||3*(attempt+1);
        await sleep(Math.min(45000,retry*1000)); continue;
      }
      if(!response.ok) throw new Error(`${new URL(url).hostname}: HTTP ${response.status}`);
      const body=await response.json(); validate(body);
      if(ttl) await writeJSON(path,{at:Date.now(),body});
      return body;
    }
    throw new Error('Provider retry limit exceeded');
  }
}
