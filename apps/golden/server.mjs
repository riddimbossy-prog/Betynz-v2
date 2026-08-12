import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { VERSION, safeDate, utcDate, addDays, outOfRange, health, fixtureBoard, weekCounts, goldenBoard, liveBoard, proof, startRuntime } from './runtime.mjs';
import { sendMagicLink,acceptSession,currentUser,signOutUser } from './auth.mjs';

const PORT=Number(process.env.PORT||10000);
const publicRoot=fileURLToPath(new URL('./public/',import.meta.url));
const assetRoot=fileURLToPath(new URL('../web/public/assets/',import.meta.url));
const splashVideoPath=join(assetRoot,'zeus-thunder-original.mp4');
const mediaCache=new Map();
let splashVideoPromise=null;

const security=()=>({'x-content-type-options':'nosniff','x-frame-options':'DENY','referrer-policy':'strict-origin-when-cross-origin','content-security-policy':"default-src 'self'; img-src 'self' https: data:; media-src 'self'; style-src 'self'; script-src 'self'; connect-src 'self'"});
const json=(res,status,body,cache='no-store',extra={})=>{res.writeHead(status,{...security(),'content-type':'application/json; charset=utf-8','cache-control':cache,...extra});res.end(JSON.stringify(body))};
const send=(res,status,body,type='text/plain; charset=utf-8',cache='no-cache')=>{res.writeHead(status,{...security(),'content-type':type,'cache-control':cache});res.end(body)};
async function serveFile(res,path){const name=normalize(path).replace(/^([.][.][/\\])+/,'').replace(/^[/\\]+/,'');const root=path.startsWith('assets/')?assetRoot:publicRoot,file=join(root,path.startsWith('assets/')?name.slice(7):name);if(!file.startsWith(root))return send(res,403,'Forbidden');try{const body=await readFile(file),type={'.html':'text/html; charset=utf-8','.css':'text/css; charset=utf-8','.js':'text/javascript; charset=utf-8','.png':'image/png','.jpg':'image/jpeg','.jpeg':'image/jpeg','.mp4':'video/mp4','.ico':'image/x-icon'}[extname(file)]||'application/octet-stream';return send(res,200,body,type,path.startsWith('assets/')?'public, max-age=604800, immutable':'no-cache')}catch{return send(res,404,'Not found')}}

async function getOriginalSplashVideo(){
  if(!splashVideoPromise){
    splashVideoPromise=readFile(splashVideoPath).then(body=>{
      if(body.length<1000000||body.toString('ascii',4,8)!=='ftyp')throw new Error('Invalid original Zeus splash MP4');
      return body;
    }).catch(error=>{splashVideoPromise=null;throw error;});
  }
  return splashVideoPromise;
}

async function serveSplashVideo(req,res){
  let splashVideo;
  try{splashVideo=await getOriginalSplashVideo();}
  catch{return send(res,404,'Original Zeus splash video is not installed','text/plain; charset=utf-8','no-store');}

  const total=splashVideo.length;
  const common={...security(),'content-type':'video/mp4','cache-control':'public, max-age=604800, immutable','accept-ranges':'bytes','cross-origin-resource-policy':'same-origin'};
  if(req.method==='HEAD'){
    res.writeHead(200,{...common,'content-length':String(total)});
    return res.end();
  }
  const range=String(req.headers.range||'').trim();
  if(!range){
    res.writeHead(200,{...common,'content-length':String(total)});
    return res.end(splashVideo);
  }
  const match=/^bytes=(\d*)-(\d*)$/.exec(range);
  if(!match){
    res.writeHead(416,{...common,'content-range':`bytes */${total}`});
    return res.end();
  }
  let start=match[1]?Number(match[1]):0;
  let end=match[2]?Number(match[2]):total-1;
  if(!match[1]&&match[2]){
    const suffix=Math.min(Number(match[2]),total);
    start=total-suffix;
    end=total-1;
  }
  if(!Number.isFinite(start)||!Number.isFinite(end)||start<0||end<start||start>=total){
    res.writeHead(416,{...common,'content-range':`bytes */${total}`});
    return res.end();
  }
  end=Math.min(end,total-1);
  const body=splashVideo.subarray(start,end+1);
  res.writeHead(206,{...common,'content-range':`bytes ${start}-${end}/${total}`,'content-length':String(body.length)});
  return res.end(body);
}

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

async function authResponse(res,promise){
  try{
    const result=await promise;
    const extra=result?.cookies?.length?{'set-cookie':result.cookies}:{};
    return json(res,result?.status||200,result?.body||{ok:true},'no-store',extra);
  }catch(e){
    return json(res,Number(e?.status)||400,{ok:false,error:'AUTH_REQUEST_FAILED',message:Number(e?.status)===413?'Request is too large.':'Account request could not be completed.'});
  }
}

async function api(req,res,url){
  if(url.pathname==='/api/auth/login-link')return req.method==='POST'?authResponse(res,sendMagicLink(req,{createUser:false})):json(res,405,{error:'METHOD_NOT_ALLOWED'});
  if(url.pathname==='/api/auth/signup-link')return req.method==='POST'?authResponse(res,sendMagicLink(req,{createUser:true})):json(res,405,{error:'METHOD_NOT_ALLOWED'});
  if(url.pathname==='/api/auth/session')return req.method==='POST'?authResponse(res,acceptSession(req)):json(res,405,{error:'METHOD_NOT_ALLOWED'});
  if(url.pathname==='/api/auth/me')return req.method==='GET'?authResponse(res,currentUser(req)):json(res,405,{error:'METHOD_NOT_ALLOWED'});
  if(url.pathname==='/api/auth/logout')return req.method==='POST'?authResponse(res,signOutUser(req)):json(res,405,{error:'METHOD_NOT_ALLOWED'});
  if(url.pathname==='/api/health')return json(res,200,health());
  if(url.pathname==='/api/fixtures'){const date=url.searchParams.get('date')||utcDate();if(!safeDate(date))return json(res,400,{error:'INVALID_DATE'});try{return json(res,200,await fixtureBoard(date),'public, max-age=20, stale-while-revalidate=120')}catch(e){return json(res,503,{error:'FEED_UNAVAILABLE',message:e.message,fixtures:[]})}}
  if(url.pathname==='/api/week-counts'){const from=url.searchParams.get('from')||utcDate();if(!safeDate(from))return json(res,400,{error:'INVALID_DATE'});return json(res,200,await weekCounts(from),'public, max-age=60')}
  if(url.pathname==='/api/golden-banker'){const date=url.searchParams.get('date')||utcDate();if(!safeDate(date))return json(res,400,{error:'INVALID_DATE'});if(outOfRange(date))return json(res,400,{error:'DATE_OUT_OF_RANGE'});return json(res,200,await goldenBoard(date))}
  if(url.pathname==='/api/live')return json(res,200,await liveBoard());
  if(url.pathname==='/api/proof'){const to=url.searchParams.get('to')||utcDate(),from=url.searchParams.get('from')||addDays(to,-14);if(!safeDate(from)||!safeDate(to))return json(res,400,{error:'INVALID_DATE'});return json(res,200,await proof(from,to))}
  return json(res,404,{error:'NOT_FOUND'});
}

const server=createServer(async(req,res)=>{
  try{
    const url=new URL(req.url||'/','http://localhost');
    if(url.pathname==='/media/zeus-thunder-original.mp4')return await serveSplashVideo(req,res);
    const crest=url.pathname.match(/^\/media\/team\/(\d{1,10})\.png$/);if(crest)return await serveTeamCrest(res,crest[1]);
    if(url.pathname.startsWith('/api/'))return await api(req,res,url);
    if(url.pathname==='/')return serveFile(res,'index.html');
    if(url.pathname==='/login'||url.pathname==='/create-account')return serveFile(res,'auth.html');
    return serveFile(res,url.pathname.slice(1));
  }catch(e){return json(res,500,{error:'INTERNAL_ERROR',message:process.env.NODE_ENV==='production'?'Internal server error':e.message})}
});
await startRuntime();server.listen(PORT,()=>console.log(`Betynz ${VERSION} · Golden Banker v4.3 on :${PORT}`));
