const ENGINE='GOLDEN_BANKER_V4_3';
const SUPABASE_URL=(Deno.env.get('SUPABASE_URL')||'').replace(/\/$/,'');
const SERVICE_KEY=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')||'';
const API_FOOTBALL_KEY=Deno.env.get('API_FOOTBALL_KEY')||'';
const API_FOOTBALL_BASE=(Deno.env.get('API_FOOTBALL_BASE_URL')||'https://v3.football.api-sports.io').replace(/\/$/,'');

const cors={
  'access-control-allow-origin':'*',
  'access-control-allow-headers':'authorization, x-client-info, apikey, content-type',
  'access-control-allow-methods':'GET, OPTIONS',
  'cache-control':'no-store'
};
const respond=(body:unknown,status=200,extra:Record<string,string>={})=>new Response(JSON.stringify(body),{status,headers:{...cors,'content-type':'application/json; charset=utf-8',...extra}});
const safeDate=(v:string|null)=>/^\d{4}-\d{2}-\d{2}$/.test(String(v||''));
const utcDate=(offset=0)=>{const d=new Date();d.setUTCDate(d.getUTCDate()+offset);return d.toISOString().slice(0,10)};
const addDays=(date:string,offset:number)=>{const d=new Date(`${date}T00:00:00Z`);d.setUTCDate(d.getUTCDate()+offset);return d.toISOString().slice(0,10)};

async function rest(path:string){
  if(!SUPABASE_URL||!SERVICE_KEY)throw new Error('Supabase service configuration is missing.');
  const response=await fetch(`${SUPABASE_URL}/rest/v1/${path.replace(/^\//,'')}`,{headers:{apikey:SERVICE_KEY,authorization:`Bearer ${SERVICE_KEY}`}});
  if(!response.ok)throw new Error(`Supabase REST ${response.status}: ${await response.text().catch(()=> '')}`);
  return await response.json();
}

async function boardForDate(date:string){
  const query=new URLSearchParams({
    select:'payload,complete,progress_processed,progress_total,generated_at,updated_at',
    board_key:`eq.${ENGINE}`,
    fixture_date:`eq.${date}`,
    order:'updated_at.desc',
    limit:'1'
  });
  const rows=await rest(`board_snapshots?${query}`);
  return Array.isArray(rows)?rows[0]||null:null;
}

function emptyBoard(date:string){
  return {engineCode:ENGINE,date,fixtures:[],all:[],topBankers:[],summary:{fixtures:0,eligible:0,analysed:0,waiting:0,bankersFound:0},progress:{processed:0,total:0,percent:0,restored:0},complete:false,warning:'Board snapshot is not ready yet.',generatedAt:new Date().toISOString()};
}

function normalizeLive(row:any){
  const id=String(row?.fixture?.id||'');
  const team=(t:any)=>({id:t?.id||null,name:t?.name||'',logo:t?.id?`/media/team/${t.id}.png`:null});
  return {
    id,sourceId:id,kickoff:row?.fixture?.date||null,status:String(row?.fixture?.status?.short||'NS').toUpperCase(),minute:row?.fixture?.status?.elapsed??null,
    score:{home:row?.goals?.home??null,away:row?.goals?.away??null,fulltimeHome:row?.score?.fulltime?.home??null,fulltimeAway:row?.score?.fulltime?.away??null},
    league:{id:row?.league?.id||null,name:row?.league?.name||'Unknown League',country:row?.league?.country||'International',logo:row?.league?.logo||null,flag:row?.league?.flag||null},
    home:team(row?.teams?.home),away:team(row?.teams?.away),odds:{}
  };
}

async function liveBoard(){
  if(!API_FOOTBALL_KEY)return {source:'API_FOOTBALL',configured:false,fixtures:[]};
  const response=await fetch(`${API_FOOTBALL_BASE}/fixtures?live=all`,{headers:{'x-apisports-key':API_FOOTBALL_KEY,accept:'application/json'}});
  if(!response.ok)throw new Error(`API-Football ${response.status}`);
  const body=await response.json().catch(()=>({}));
  return {source:'API_FOOTBALL',configured:true,fixtures:(Array.isArray(body?.response)?body.response:[]).map(normalizeLive),fetchedAt:new Date().toISOString()};
}

async function proof(from:string,to:string){
  const query=new URLSearchParams({select:'*',and:`(fixture_date.gte.${from},fixture_date.lte.${to})`,engine:`eq.${ENGINE}`,order:'fixture_date.desc,kickoff.desc',limit:'500'});
  const rows=await rest(`prediction_ledger?${query}`);
  return {from,to,rows:Array.isArray(rows)?rows:[]};
}

async function weekCounts(from:string){
  const to=addDays(from,6);
  const query=new URLSearchParams({select:'fixture_date,payload,updated_at',board_key:`eq.${ENGINE}`,and:`(fixture_date.gte.${from},fixture_date.lte.${to})`,order:'fixture_date.asc,updated_at.desc'});
  const rows=await rest(`board_snapshots?${query}`);
  const byDate=new Map<string,number>();
  for(const row of Array.isArray(rows)?rows:[]){
    const date=String(row?.fixture_date||'');
    if(!byDate.has(date))byDate.set(date,Array.isArray(row?.payload?.fixtures)?row.payload.fixtures.length:0);
  }
  const days=[];
  for(let n=0;n<7;n++){const date=addDays(from,n);days.push({date,count:byDate.get(date)||0});}
  return {from,to,days,counts:Object.fromEntries(days.map(x=>[x.date,x.count]))};
}

async function teamCrest(id:string){
  if(!/^\d{1,10}$/.test(id)||Number(id)<=0)return new Response('Not found',{status:404,headers:cors});
  const response=await fetch(`https://media.api-sports.io/football/teams/${id}.png`,{headers:{accept:'image/*'}});
  if(!response.ok)return new Response('Not found',{status:404,headers:cors});
  const body=await response.arrayBuffer();
  return new Response(body,{status:200,headers:{...cors,'content-type':response.headers.get('content-type')||'image/png','cache-control':'public, max-age=604800, immutable'}});
}

Deno.serve(async req=>{
  if(req.method==='OPTIONS')return new Response(null,{status:204,headers:cors});
  if(req.method!=='GET')return respond({error:'METHOD_NOT_ALLOWED'},405);
  try{
    const url=new URL(req.url);
    const marker='/betynz-api';
    const markerIndex=url.pathname.indexOf(marker);
    const path=markerIndex>=0?(url.pathname.slice(markerIndex+marker.length)||'/'):url.pathname;

    const crest=path.match(/^\/media\/team\/(\d+)\.png$/);
    if(crest)return await teamCrest(crest[1]);
    if(path==='/health')return respond({ok:true,backend:'SUPABASE_EDGE',engineCode:ENGINE,supabase:Boolean(SUPABASE_URL&&SERVICE_KEY),apiFootball:Boolean(API_FOOTBALL_KEY),generatedAt:new Date().toISOString()});
    if(path==='/live')return respond(await liveBoard());

    if(path==='/week-counts'){
      const from=url.searchParams.get('from')||utcDate();
      if(!safeDate(from))return respond({error:'INVALID_DATE'},400);
      return respond(await weekCounts(from),200,{'cache-control':'public, max-age=60'});
    }
    if(path==='/proof'){
      const to=url.searchParams.get('to')||utcDate(),from=url.searchParams.get('from')||addDays(to,-14);
      if(!safeDate(from)||!safeDate(to))return respond({error:'INVALID_DATE'},400);
      return respond(await proof(from,to));
    }
    // The browser board historically requests /api/golden, which runtime-client
    // rewrites to /golden on this Edge Function. Keep /golden-banker as the
    // canonical route while serving /golden as a backward-compatible alias.
    if(path==='/fixtures'||path==='/golden-banker'||path==='/golden'){
      const date=url.searchParams.get('date')||utcDate();
      if(!safeDate(date))return respond({error:'INVALID_DATE'},400);
      const row=await boardForDate(date);
      const payload=row?.payload||emptyBoard(date);
      if(path==='/fixtures')return respond({source:'SUPABASE_SNAPSHOT',date,cached:true,complete:Boolean(payload?.complete),generatedAt:payload?.generatedAt||row?.generated_at||null,fixtures:Array.isArray(payload?.fixtures)?payload.fixtures:[]},200,{'cache-control':'public, max-age=20, stale-while-revalidate=120'});
      return respond(payload);
    }
    return respond({error:'NOT_FOUND'},404);
  }catch(error){
    return respond({error:'BACKEND_UNAVAILABLE',message:error instanceof Error?error.message:'Backend unavailable'},503);
  }
});
