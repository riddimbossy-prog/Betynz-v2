(()=>{
  const cfg=window.BETYNZ_CONFIG||{};
  const supabaseUrl=String(cfg.supabaseUrl||'').replace(/\/$/,'');
  const anonKey=String(cfg.supabaseAnonKey||'');
  const functionName=String(cfg.apiFunction||'betynz-api');
  const configured=/^https:\/\//.test(supabaseUrl)&&anonKey&&!anonKey.includes('__');
  const originalFetch=window.fetch.bind(window);
  const sessionKey='betynz_supabase_session_v1';
  const apiBase=configured?`${supabaseUrl}/functions/v1/${functionName}`:'';

  const json=(body,status=200)=>new Response(JSON.stringify(body),{status,headers:{'content-type':'application/json; charset=utf-8','cache-control':'no-store'}});
  const parseBody=init=>{try{return init?.body?JSON.parse(String(init.body)):{};}catch{return{};}};
  const safeUser=user=>{
    if(!user)return null;
    const meta=user.user_metadata&&typeof user.user_metadata==='object'?user.user_metadata:{};
    return {id:String(user.id||''),email:String(user.email||''),displayName:String(meta.display_name||meta.full_name||meta.name||'').trim()||null,emailConfirmed:Boolean(user.email_confirmed_at||user.confirmed_at),createdAt:user.created_at||null};
  };
  const getSession=()=>{try{return JSON.parse(localStorage.getItem(sessionKey)||'null');}catch{return null;}};
  const setSession=s=>{if(s?.accessToken&&s?.refreshToken)localStorage.setItem(sessionKey,JSON.stringify(s));};
  const clearSession=()=>localStorage.removeItem(sessionKey);

  async function supabaseAuth(path,{method='POST',body=null,token=null}={}){
    if(!configured)return {ok:false,status:503,data:null,message:'Supabase browser runtime is not configured.'};
    const headers={apikey:anonKey,'content-type':'application/json'};
    if(token)headers.authorization=`Bearer ${token}`;
    const response=await originalFetch(`${supabaseUrl}/auth/v1/${path.replace(/^\//,'')}`,{method,headers,...(body?{body:JSON.stringify(body)}:{})});
    const data=await response.json().catch(()=>({}));
    const message=String(data?.msg||data?.message||data?.error_description||data?.error||'Authentication request failed.');
    return {ok:response.ok,status:response.status,data,message};
  }

  async function currentUser(){
    let session=getSession();
    if(!session?.accessToken)return {configured,authenticated:false,user:null};
    let result=await supabaseAuth('user',{method:'GET',token:session.accessToken});
    if(!result.ok&&session.refreshToken){
      const refreshed=await supabaseAuth('token?grant_type=refresh_token',{body:{refresh_token:session.refreshToken}});
      if(refreshed.ok&&refreshed.data?.access_token&&refreshed.data?.refresh_token){
        session={accessToken:refreshed.data.access_token,refreshToken:refreshed.data.refresh_token,expiresAt:Date.now()+Math.max(60,Number(refreshed.data.expires_in)||3600)*1000};
        setSession(session);
        result=await supabaseAuth('user',{method:'GET',token:session.accessToken});
      }
    }
    if(!result.ok){clearSession();return {configured,authenticated:false,user:null};}
    return {configured,authenticated:true,user:safeUser(result.data)};
  }

  async function authBridge(path,init){
    const body=parseBody(init);
    if(path==='/api/auth/login-link'||path==='/api/auth/signup-link'){
      const createUser=path.endsWith('signup-link');
      const email=String(body.email||'').trim().toLowerCase();
      const displayName=String(body.displayName||'').trim().replace(/\s+/g,' ');
      if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))return json({ok:false,message:'Enter a valid email address.'},400);
      if(createUser&&(displayName.length<2||displayName.length>40))return json({ok:false,message:'Display name must be 2–40 characters.'},400);
      const redirect=`${location.origin}/auth.html`;
      const result=await supabaseAuth(`otp?redirect_to=${encodeURIComponent(redirect)}`,{body:{email,create_user:createUser,...(createUser?{data:{display_name:displayName}}:{})}});
      if(!result.ok)return json({ok:false,message:result.status===429?'Too many requests. Please wait a moment and try again.':'We could not send the secure email link.'},result.status||400);
      return json({ok:true,sent:true,message:createUser?'Check your email to finish creating your account.':'Check your email for your secure login link.'});
    }
    if(path==='/api/auth/session'){
      const accessToken=String(body.accessToken||''),refreshToken=String(body.refreshToken||'');
      if(!accessToken||!refreshToken)return json({ok:false,message:'Invalid account session.'},400);
      const userResult=await supabaseAuth('user',{method:'GET',token:accessToken});
      if(!userResult.ok)return json({ok:false,message:'The sign-in link has expired or is invalid.'},401);
      setSession({accessToken,refreshToken,expiresAt:Date.now()+Math.max(60,Number(body.expiresIn)||3600)*1000});
      return json({ok:true,authenticated:true,user:safeUser(userResult.data)});
    }
    if(path==='/api/auth/me')return json({ok:true,...await currentUser()});
    if(path==='/api/auth/logout'){
      const session=getSession();
      if(session?.accessToken)await supabaseAuth('logout',{token:session.accessToken}).catch(()=>null);
      clearSession();
      return json({ok:true,authenticated:false});
    }
    return json({ok:false,message:'Unknown account endpoint.'},404);
  }

  window.fetch=async(input,init={})=>{
    let url;
    try{url=new URL(typeof input==='string'?input:input?.url||String(input),location.origin);}catch{return originalFetch(input,init);}
    if(url.origin===location.origin&&url.pathname.startsWith('/api/auth/')){
      if(!configured)return originalFetch(input,init);
      return authBridge(url.pathname,init);
    }
    if(url.origin===location.origin&&url.pathname.startsWith('/api/')){
      if(!configured)return originalFetch(input,init);
      const path=url.pathname.slice('/api'.length)||'/';
      const headers=new Headers(init.headers||{});
      headers.set('apikey',anonKey);
      headers.set('authorization',`Bearer ${anonKey}`);
      return originalFetch(`${apiBase}${path}${url.search}`,{...init,headers});
    }
    return originalFetch(input,init);
  };

  function rewriteCrest(img){
    if(!configured||!(img instanceof HTMLImageElement))return;
    const src=img.getAttribute('src')||'';
    if(/^\/media\/team\/\d+\.png(?:\?.*)?$/.test(src))img.src=`${apiBase}${src}`;
  }
  const scan=root=>{if(root instanceof HTMLImageElement)rewriteCrest(root);root?.querySelectorAll?.('img').forEach(rewriteCrest);};
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>scan(document),{once:true});else scan(document);
  new MutationObserver(records=>records.forEach(r=>r.addedNodes.forEach(scan))).observe(document.documentElement,{childList:true,subtree:true});

  window.BETYNZ_BACKEND=configured?'GITHUB_PAGES_SUPABASE':'NODE_FALLBACK';
})();
