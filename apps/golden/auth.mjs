const ACCESS_COOKIE='betynz_access';
const REFRESH_COOKIE='betynz_refresh';
const MAX_BODY_BYTES=16*1024;
const AUTH_WINDOW_MS=10*60*1000;
const AUTH_MAX_ATTEMPTS=10;
const attempts=new Map();

function text(v){return String(v??'').trim()}
function config(){
  const url=text(process.env.SUPABASE_URL).replace(/\/$/,'');
  const key=text(process.env.SUPABASE_ANON_KEY)||text(process.env.SUPABASE_SERVICE_ROLE_KEY);
  return url&&key?{url,key}:null;
}
function headers(cfg,token=null){return{apikey:cfg.key,'content-type':'application/json',...(token?{authorization:`Bearer ${token}`}:{})}}
function clientKey(req){return text(req?.headers?.['x-forwarded-for']).split(',')[0].trim()||text(req?.socket?.remoteAddress)||'unknown'}
function rateLimit(req){
  const key=clientKey(req),now=Date.now(),row=attempts.get(key);
  if(!row||now-row.startedAt>AUTH_WINDOW_MS){attempts.set(key,{startedAt:now,count:1});return{allowed:true}}
  row.count+=1;
  if(row.count>AUTH_MAX_ATTEMPTS)return{allowed:false,retryAfterSeconds:Math.max(1,Math.ceil((AUTH_WINDOW_MS-(now-row.startedAt))/1000))};
  return{allowed:true};
}
function parseCookies(req){
  const out={};
  for(const chunk of text(req?.headers?.cookie).split(';')){
    const i=chunk.indexOf('=');if(i<1)continue;
    const k=chunk.slice(0,i).trim(),v=chunk.slice(i+1).trim();
    try{out[k]=decodeURIComponent(v)}catch{out[k]=v}
  }
  return out;
}
function secureCookie(){return process.env.NODE_ENV==='production'||Boolean(process.env.RENDER)}
function cookie(name,value,maxAge){
  const a=[`${name}=${encodeURIComponent(value)}`,'Path=/','HttpOnly','SameSite=Lax',`Max-Age=${Math.max(0,Math.floor(maxAge))}`];
  if(secureCookie())a.push('Secure');
  return a.join('; ');
}
export function clearAuthCookies(){return[cookie(ACCESS_COOKIE,'',0),cookie(REFRESH_COOKIE,'',0)]}
function sessionCookies(session){
  if(!session?.access_token||!session?.refresh_token)return[];
  return[cookie(ACCESS_COOKIE,session.access_token,Math.max(60,Number(session.expires_in)||3600)),cookie(REFRESH_COOKIE,session.refresh_token,60*60*24*30)];
}
function safeUser(user){
  if(!user)return null;
  const m=user.user_metadata&&typeof user.user_metadata==='object'?user.user_metadata:{};
  return{id:String(user.id||''),email:String(user.email||''),displayName:text(m.display_name||m.full_name||m.name)||null,emailConfirmed:Boolean(user.email_confirmed_at||user.confirmed_at),createdAt:user.created_at||null};
}
async function readJson(req){
  return await new Promise((resolve,reject)=>{
    let size=0,raw='';req.setEncoding('utf8');
    req.on('data',c=>{size+=Buffer.byteLength(c);if(size>MAX_BODY_BYTES){reject(Object.assign(new Error('Request too large'),{status:413}));req.destroy();return}raw+=c});
    req.on('end',()=>{if(!raw)return resolve({});try{resolve(JSON.parse(raw))}catch{reject(Object.assign(new Error('Invalid JSON'),{status:400}))}});
    req.on('error',reject);
  });
}
async function callAuth(path,{method='POST',body=null,token=null}={}){
  const cfg=config();if(!cfg)return{ok:false,status:503,data:null,message:'User accounts are not configured yet.'};
  try{
    const r=await fetch(`${cfg.url}/auth/v1/${path.replace(/^\//,'')}`,{method,headers:headers(cfg,token),...(body?{body:JSON.stringify(body)}:{})});
    const data=await r.json().catch(()=>({}));
    return{ok:r.ok,status:r.status,data,message:text(data?.msg||data?.message||data?.error_description||data?.error)||'Authentication request failed.'};
  }catch{return{ok:false,status:503,data:null,message:'Account service is temporarily unavailable.'}}
}
function validEmail(email){return/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)&&email.length<=254}
function ownOrigin(req){
  const proto=text(req?.headers?.['x-forwarded-proto']).split(',')[0]||'https';
  const host=text(req?.headers?.['x-forwarded-host']).split(',')[0]||text(req?.headers?.host);
  return host?`${proto}://${host}`:null;
}
export function authConfigured(){return Boolean(config())}

export async function sendMagicLink(req,{createUser=false}={}){
  const limit=rateLimit(req);
  if(!limit.allowed)return{status:429,body:{ok:false,error:'RATE_LIMITED',message:'Too many requests. Please try again shortly.',retryAfterSeconds:limit.retryAfterSeconds},cookies:[]};
  const body=await readJson(req),email=text(body.email).toLowerCase(),displayName=text(body.displayName).replace(/\s+/g,' ');
  if(!validEmail(email))return{status:400,body:{ok:false,error:'INVALID_EMAIL',message:'Enter a valid email address.'},cookies:[]};
  if(createUser&&(displayName.length<2||displayName.length>40))return{status:400,body:{ok:false,error:'INVALID_NAME',message:'Display name must be 2–40 characters.'},cookies:[]};
  const origin=ownOrigin(req),redirect=origin?`${origin}/auth.html`:null;
  const path=`otp${redirect?`?redirect_to=${encodeURIComponent(redirect)}`:''}`;
  const payload={email,create_user:Boolean(createUser),...(createUser?{data:{display_name:displayName}}:{})};
  const result=await callAuth(path,{body:payload});
  if(!result.ok){
    const msg=result.status===429?'Too many requests. Please wait a moment and try again.':result.status>=500?'Account service is temporarily unavailable.':'We could not send the secure sign-in link.';
    return{status:result.status||400,body:{ok:false,error:'MAGIC_LINK_FAILED',message:msg},cookies:[]};
  }
  return{status:200,body:{ok:true,sent:true,message:createUser?'Check your email to finish creating your account.':'Check your email for your secure login link.'},cookies:[]};
}

export async function acceptSession(req){
  const body=await readJson(req),accessToken=text(body.accessToken),refreshToken=text(body.refreshToken),expiresIn=Number(body.expiresIn)||3600;
  if(!accessToken||!refreshToken)return{status:400,body:{ok:false,error:'SESSION_REQUIRED',message:'Secure session details are missing.'},cookies:[]};
  const result=await callAuth('user',{method:'GET',token:accessToken});
  if(!result.ok)return{status:401,body:{ok:false,error:'INVALID_SESSION',message:'This sign-in link is invalid or has expired.'},cookies:clearAuthCookies()};
  const session={access_token:accessToken,refresh_token:refreshToken,expires_in:expiresIn};
  return{status:200,body:{ok:true,authenticated:true,user:safeUser(result.data)},cookies:sessionCookies(session)};
}
async function refreshSession(refreshToken){if(!refreshToken)return null;const r=await callAuth('token?grant_type=refresh_token',{body:{refresh_token:refreshToken}});return r.ok?r.data:null}
async function fetchUser(accessToken){if(!accessToken)return null;const r=await callAuth('user',{method:'GET',token:accessToken});return r.ok?r.data:null}
export async function currentUser(req){
  if(!authConfigured())return{status:200,body:{ok:true,configured:false,authenticated:false,user:null},cookies:[]};
  const c=parseCookies(req);let session=null,user=await fetchUser(c[ACCESS_COOKIE]);
  if(!user&&c[REFRESH_COOKIE]){session=await refreshSession(c[REFRESH_COOKIE]);if(session)user=await fetchUser(session.access_token)}
  if(!user)return{status:200,body:{ok:true,configured:true,authenticated:false,user:null},cookies:clearAuthCookies()};
  return{status:200,body:{ok:true,configured:true,authenticated:true,user:safeUser(user)},cookies:session?sessionCookies(session):[]};
}
export async function signOutUser(req){
  const c=parseCookies(req),access=c[ACCESS_COOKIE];
  if(access)await callAuth('logout',{token:access}).catch(()=>null);
  return{status:200,body:{ok:true,authenticated:false},cookies:clearAuthCookies()};
}
