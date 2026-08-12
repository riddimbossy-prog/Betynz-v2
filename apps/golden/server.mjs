import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { VERSION, safeDate, utcDate, addDays, outOfRange, health, fixtureBoard, weekCounts, goldenBoard, liveBoard, proof, startRuntime } from './runtime.mjs';

const PORT=Number(process.env.PORT||10000);
const publicRoot=fileURLToPath(new URL('./public/',import.meta.url));
const assetRoot=fileURLToPath(new URL('../web/public/assets/',import.meta.url));
const mediaCache=new Map();
const security=()=>({'x-content-type-options':'nosniff','x-frame-options':'DENY','referrer-policy':'strict-origin-when-cross-origin','content-security-policy':"default-src 'self'; img-src 'self' https: data:; style-src 'self'; script-src 'self'; connect-src 'self'"});
const json=(res,status,body,cache='no-store')=>{res.writeHead(status,{...security(),'content-type':'application/json; charset=utf-8','cache-control':cache});res.end(JSON.stringify(body))};
const send=(res,status,body,type='text/plain; charset=utf-8',cache='no-cache')=>{res.writeHead(status,{...security(),'content-type':type,'cache-control':cache});res.end(body)};
async function serveFile(res,path){const name=normalize(path).replace(/^([.][.][/\\])+/,'').replace(/^[/\\]+/,'');const root=path.startsWith('assets/')?assetRoot:publicRoot,file=join(root,path.startsWith('assets/')?name.slice(7):name);if(!file.startsWith(root))return send(res,403,'Forbidden');try{const body=await readFile(file),type={'.html':'text/html; charset=utf-8','.css':'text/css; charset=utf-8','.js':'text/javascript; charset=utf-8','.png':'image/png','.ico':'image/x-icon'}[extname(file)]||'application/octet-stream';return send(res,200,body,type,path.startsWith('assets/')?'public, max-age=604800, immutable':'no-cache')}catch{return send(res,404,'Not found')}}

function trimMediaCache(){
  while(mediaCache.size>512){
    const first=mediaCache.keys().next().value;
    if(first===undefined)break;
    mediaCache.delete(first);
  }
}

async function serveTeamCrest(res,id){
  if(!/^\d{1,10}$/.test(String(id||''))||Number(id)<=0)return send(res,404,'Crest not found');
  const key=String(id),cached=mediaCache.get(key);
  if(cached){
    res.writeHead(200,{...security(),'content-type':cached.type,'cache-control':'public, max-age=604800, immutable','cross-origin-resource-policy':'same-origin'});
    return res.end(cached.body);
  }
  const controller=new AbortController();
  const timer=setTimeout(()=>controller.abort(),8000);
  try{
    const upstream=await fetch(`https://media.api-sports.io/football/teams/${key}.png`,{
      headers:{accept:'image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8','user-agent':'Betynz-Crest-Proxy/6.2.1'},
      signal:controller.signal
    });
    if(!upstream.ok)throw new Error(`HTTP ${upstream.status}`);
    const type=String(upstream.headers.get('content-type')||'image/png').split(';')[0].trim();
    if(!/^image\//i.test(type))throw new Error('Invalid crest content type');
    const body=Buffer.from(await upstream.arrayBuffer());
    if(body.length<32||body.length>1572864)throw new Error('Invalid crest payload');
    mediaCache.set(key,{type,body});
    trimMediaCache();
    res.writeHead(200,{...security(),'content-type':type,'cache-control':'public, max-age=604800, immutable','cross-origin-resource-policy':'same-origin'});
    return res.end(body);
  }catch{
    return send(res,404,'Crest unavailable','text/plain; charset=utf-8','public, max-age=300');
  }finally{
    clearTimeout(timer);
  }
}

async function api(res,url){if(url.pathname==='/api/health')return json(res,200,health());if(url.pathname==='/api/fixtures'){const date=url.searchParams.get('date')||utcDate();if(!safeDate(date))return json(res,400,{error:'INVALID_DATE'});try{return json(res,200,await fixtureBoard(date),'public, max-age=20, stale-while-revalidate=120')}catch(e){return json(res,503,{error:'FEED_UNAVAILABLE',message:e.message,fixtures:[]})}}if(url.pathname==='/api/week-counts'){const from=url.searchParams.get('from')||utcDate();if(!safeDate(from))return json(res,400,{error:'INVALID_DATE'});return json(res,200,await weekCounts(from),'public, max-age=60')}if(url.pathname==='/api/golden-banker'){const date=url.searchParams.get('date')||utcDate();if(!safeDate(date))return json(res,400,{error:'INVALID_DATE'});if(outOfRange(date))return json(res,400,{error:'DATE_OUT_OF_RANGE'});return json(res,200,await goldenBoard(date))}if(url.pathname==='/api/live')return json(res,200,await liveBoard());if(url.pathname==='/api/proof'){const to=url.searchParams.get('to')||utcDate(),from=url.searchParams.get('from')||addDays(to,-14);if(!safeDate(from)||!safeDate(to))return json(res,400,{error:'INVALID_DATE'});return json(res,200,await proof(from,to))}return json(res,404,{error:'NOT_FOUND'})}
const server=createServer(async(req,res)=>{try{const url=new URL(req.url||'/','http://localhost');const crest=url.pathname.match(/^\/media\/team\/(\d{1,10})\.png$/);if(crest)return await serveTeamCrest(res,crest[1]);if(url.pathname.startsWith('/api/'))return await api(res,url);if(url.pathname==='/')return serveFile(res,'index.html');return serveFile(res,url.pathname.slice(1))}catch(e){return json(res,500,{error:'INTERNAL_ERROR',message:process.env.NODE_ENV==='production'?'Internal server error':e.message})}});
await startRuntime();server.listen(PORT,()=>console.log(`Betynz ${VERSION} · Golden Banker v4.3 on :${PORT}`));
