const ACCESS_COOKIE='betynz_access';
const REFRESH_COOKIE='betynz_refresh';
const MAX_BODY_BYTES=24*1024;
const AUTH_WINDOW_MS=10*60*1000;
const AUTH_MAX_ATTEMPTS=12;
const attempts=new Map();

function text(value){return String(value??'').trim()}

function config(){
  const url=text(process.env.SUPABASE_URL).replace(/\/$/,'');
  const key=text(process.env.SUPABASE_ANON_KEY)||text(process.env.SUPABASE_SERVICE_ROLE_KEY);
  return url&&key?{url,key}:null;
}

function authHeaders(cfg,token=null){
  return {
    apikey:cfg.key,
    'content-type':'application/json',
    ...(token?{authorization:`Bearer ${token}`}:{})
  };
}

function clientKey(req){
  const forwarded=text(req?.headers?.['x-forwarded-for']).split(',')[0].trim();
  return forwarded||text(req?.socket?.remoteAddress)||'unknown';
}

export function authRateLimit(req){
  const key=clientKey(req),now=Date.now();
  const row=attempts.get(key);
  if(!row||now-row.startedAt>AUTH_WINDOW_MS){
    attempts.set(key,{startedAt:now,count:1});
    return {allowed:true,remaining:AUTH_MAX_ATTEMPTS-1};
  }
  row.count+=1;
  if(row.count>AUTH_MAX_ATTEMPTS){
    return {allowed:false,retryAfterSeconds:Math.max(1,Math.ceil((AUTH_WINDOW_MS-(now-row.startedAt))/1000))};
  }
  return {allowed:true,remaining:Math.max(0,AUTH_MAX_ATTEMPTS-row.count)};
}

function parseCookies(req){
  const raw=text(req?.headers?.cookie);
  const out={};
  for(const chunk of raw.split(';')){
    const i=chunk.indexOf('=');
    if(i<1)continue;
    const key=chunk.slice(0,i).trim(),value=chunk.slice(i+1).trim();
    try{out[key]=decodeURIComponent(value)}catch{out[key]=value}
  }
  return out;
}

function secureCookie(){
  return process.env.NODE_ENV==='production'||Boolean(process.env.RENDER);
}

function cookie(name,value,maxAge){
  const attrs=[`${name}=${encodeURIComponent(value)}`,'Path=/','HttpOnly','SameSite=Lax',`Max-Age=${Math.max(0,Math.floor(maxAge))}`];
  if(secureCookie())attrs.push('Secure');
  return attrs.join('; ');
}

export function clearAuthCookies(){
  return [cookie(ACCESS_COOKIE,'',0),cookie(REFRESH_COOKIE,'',0)];
}

function sessionCookies(session){
  if(!session?.access_token||!session?.refresh_token)return [];
  const accessSeconds=Math.max(60,Number(session.expires_in)||3600);
  return [
    cookie(ACCESS_COOKIE,session.access_token,accessSeconds),
    cookie(REFRESH_COOKIE,session.refresh_token,60*60*24*30)
  ];
}

function safeUser(user){
  if(!user)return null;
  const metadata=user.user_metadata&&typeof user.user_metadata==='object'?user.user_metadata:{};
  return {
    id:String(user.id||''),
    email:String(user.email||''),
    displayName:text(metadata.display_name||metadata.full_name||metadata.name)||null,
    emailConfirmed:Boolean(user.email_confirmed_at||user.confirmed_at),
    createdAt:user.created_at||null
  };
}

async function readJson(req){
  return await new Promise((resolve,reject)=>{
    let size=0,raw='';
    req.setEncoding('utf8');
    req.on('data',chunk=>{
      size+=Buffer.byteLength(chunk);
      if(size>MAX_BODY_BYTES){reject(Object.assign(new Error('Request is too large.'),{status:413}));req.destroy();return}
      raw+=chunk;
    });
    req.on('end',()=>{
      if(!raw)return resolve({});
      try{resolve(JSON.parse(raw))}catch{reject(Object.assign(new Error('Invalid JSON body.'),{status:400}))}
    });
    req.on('error',reject);
  });
}

async function callAuth(path,{method='POST',body=null,token=null}={}){
  const cfg=config();
  if(!cfg)return {ok:false,status:503,data:null,message:'User accounts are not configured yet.'};
  let response;
  try{
    response=await fetch(`${cfg.url}/auth/v1/${path.replace(/^\//,'')}`,{
      method,
      headers:authHeaders(cfg,token),
      ...(body?{body:JSON.stringify(body)}:{})
    });
  }catch{
    return {ok:false,status:503,data:null,message:'Account service is temporarily unavailable.'};
  }
  const data=await response.json().catch(()=>({}));
  const providerMessage=text(data?.msg||data?.message||data?.error_description||data?.error);
  return {ok:response.ok,status:response.status,data,message:providerMessage||'Authentication request failed.'};
}

function validEmail(email){return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)&&email.length<=254}
function validPassword(password){return typeof password==='string'&&password.length>=8&&password.length<=128}

function friendlyAuthError(result,mode){
  const raw=text(result?.message).toLowerCase();
  if(result?.status===429||/rate limit/.test(raw))return 'Too many attempts. Please wait a moment and try again.';
  if(mode==='login'&&(result?.status===400||result?.status===401||/invalid login|invalid credentials/.test(raw)))return 'Email or password is incorrect.';
  if(mode==='signup'&&/already registered|user already exists/.test(raw))return 'An account with this email already exists.';
  if(/email not confirmed/.test(raw))return 'Please confirm your email before signing in.';
  if(/password/.test(raw)&&/weak|short|least/.test(raw))return 'Choose a stronger password with at least 8 characters.';
  return result?.status>=500?'Account service is temporarily unavailable.':text(result?.message)||'Authentication failed.';
}

export function authConfigured(){return Boolean(config())}

export async function signUpUser(req){
  const limit=authRateLimit(req);
  if(!limit.allowed)return {status:429,body:{ok:false,error:'RATE_LIMITED',message:'Too many attempts. Please try again shortly.',retryAfterSeconds:limit.retryAfterSeconds},cookies:[]};
  const body=await readJson(req),email=text(body.email).toLowerCase(),password=body.password,displayName=text(body.displayName).replace(/\s+/g,' ');
  if(!validEmail(email))return {status:400,body:{ok:false,error:'INVALID_EMAIL',message:'Enter a valid email address.'},cookies:[]};
  if(!validPassword(password))return {status:400,body:{ok:false,error:'INVALID_PASSWORD',message:'Password must be 8–128 characters.'},cookies:[]};
  if(displayName.length<2||displayName.length>40)return {status:400,body:{ok:false,error:'INVALID_NAME',message:'Display name must be 2–40 characters.'},cookies:[]};
  const result=await callAuth('signup',{body:{email,password,data:{display_name:displayName}}});
  if(!result.ok)return {status:result.status||400,body:{ok:false,error:'SIGNUP_FAILED',message:friendlyAuthError(result,'signup')},cookies:[]};
  const session=result.data?.access_token?result.data:null;
  const user=result.data?.user||result.data;
  return {
    status:200,
    body:{ok:true,user:safeUser(user),authenticated:Boolean(session?.access_token),needsConfirmation:!session?.access_token},
    cookies:sessionCookies(session)
  };
}

export async function signInUser(req){
  const limit=authRateLimit(req);
  if(!limit.allowed)return {status:429,body:{ok:false,error:'RATE_LIMITED',message:'Too many attempts. Please try again shortly.',retryAfterSeconds:limit.retryAfterSeconds},cookies:[]};
  const body=await readJson(req),email=text(body.email).toLowerCase(),password=body.password;
  if(!validEmail(email)||!validPassword(password))return {status:400,body:{ok:false,error:'INVALID_LOGIN',message:'Email or password is incorrect.'},cookies:[]};
  const result=await callAuth('token?grant_type=password',{body:{email,password}});
  if(!result.ok)return {status:result.status||401,body:{ok:false,error:'LOGIN_FAILED',message:friendlyAuthError(result,'login')},cookies:[]};
  return {status:200,body:{ok:true,authenticated:true,user:safeUser(result.data?.user)},cookies:sessionCookies(result.data)};
}

async function refreshSession(refreshToken){
  if(!refreshToken)return null;
  const result=await callAuth('token?grant_type=refresh_token',{body:{refresh_token:refreshToken}});
  return result.ok?result.data:null;
}

async function fetchUser(accessToken){
  if(!accessToken)return null;
  const result=await callAuth('user',{method:'GET',token:accessToken});
  return result.ok?result.data:null;
}

export async function currentUser(req){
  if(!authConfigured())return {status:200,body:{ok:true,configured:false,authenticated:false,user:null},cookies:[]};
  const cookies=parseCookies(req);
  let access=cookies[ACCESS_COOKIE],session=null,user=await fetchUser(access);
  if(!user&&cookies[REFRESH_COOKIE]){
    session=await refreshSession(cookies[REFRESH_COOKIE]);
    if(session){access=session.access_token;user=await fetchUser(access)}
  }
  if(!user)return {status:200,body:{ok:true,configured:true,authenticated:false,user:null},cookies:clearAuthCookies()};
  return {status:200,body:{ok:true,configured:true,authenticated:true,user:safeUser(user)},cookies:session?sessionCookies(session):[]};
}

export async function signOutUser(req){
  const cookies=parseCookies(req),access=cookies[ACCESS_COOKIE];
  if(access)await callAuth('logout',{token:access}).catch(()=>null);
  return {status:200,body:{ok:true,authenticated:false},cookies:clearAuthCookies()};
}
