const $=s=>document.querySelector(s);
const loginTab=$('#loginTab'),signupTab=$('#signupTab'),loginForm=$('#loginForm'),signupForm=$('#signupForm'),message=$('#authMessage'),signedIn=$('#signedIn');
const title=$('#authTitle'),subtitle=$('#authSubtitle');
const requestedMode=new URLSearchParams(location.search).get('mode');
let mode=requestedMode==='signup'||location.pathname==='/create-account'?'signup':'login';

function safeNext(){
  const next=new URLSearchParams(location.search).get('next')||'/';
  return next.startsWith('/')&&!next.startsWith('//')?next:'/';
}
function showMessage(text,type=''){
  message.hidden=!text;message.textContent=text||'';message.className=`auth-message ${type}`.trim();
}
function setMode(next){
  mode=next==='signup'?'signup':'login';
  loginTab.classList.toggle('active',mode==='login');signupTab.classList.toggle('active',mode==='signup');
  loginTab.setAttribute('aria-selected',String(mode==='login'));signupTab.setAttribute('aria-selected',String(mode==='signup'));
  loginForm.hidden=mode!=='login';signupForm.hidden=mode!=='signup';signedIn.hidden=true;
  title.textContent=mode==='login'?'Welcome back':'Create your account';
  subtitle.textContent=mode==='login'?'We’ll email you a secure sign-in link.':'Join Betynz with a secure email link.';
  showMessage('');
  const url=new URL(location.href);if(mode==='signup')url.searchParams.set('mode','signup');else url.searchParams.delete('mode');history.replaceState(null,'',url.pathname+url.search);
}
async function api(path,body=null){
  const response=await fetch(path,{method:body?'POST':'GET',headers:body?{'content-type':'application/json'}:undefined,body:body?JSON.stringify(body):undefined,cache:'no-store'});
  const data=await response.json().catch(()=>({}));
  if(!response.ok)throw new Error(data.message||'Account request failed.');
  return data;
}
function setBusy(form,busy){const button=form.querySelector('button[type="submit"]');if(button){button.disabled=busy;button.dataset.label||=(button.querySelector('span')?.textContent||button.textContent);const span=button.querySelector('span');if(span)span.textContent=busy?'Sending…':button.dataset.label}}
function renderUser(user){
  loginForm.hidden=true;signupForm.hidden=true;document.querySelector('.auth-tabs').hidden=true;signedIn.hidden=false;
  const name=user?.displayName||user?.email?.split('@')[0]||'Member';
  $('#signedName').textContent=name;$('#signedEmail').textContent=user?.email||'';$('#signedAvatar').textContent=name.slice(0,1).toUpperCase();$('#continueBoard').href=safeNext();
  title.textContent='Welcome to Betynz';subtitle.textContent='Your member session is active.';showMessage('');
}
async function acceptMagicSession(){
  const hash=new URLSearchParams(location.hash.replace(/^#/,''));
  const accessToken=hash.get('access_token'),refreshToken=hash.get('refresh_token');
  const error=hash.get('error_description')||hash.get('error');
  if(error){history.replaceState(null,'',location.pathname+location.search);showMessage(error,'error');return false}
  if(!accessToken||!refreshToken)return false;
  showMessage('Securing your Betynz session…');
  try{
    const result=await api('/api/auth/session',{accessToken,refreshToken,expiresIn:Number(hash.get('expires_in'))||3600});
    history.replaceState(null,'',location.pathname+location.search);
    if(result.user)renderUser(result.user);return true;
  }catch(e){history.replaceState(null,'',location.pathname+location.search);showMessage(e.message,'error');return false}
}
async function loadUser(){
  try{
    const data=await api('/api/auth/me');
    if(data.authenticated&&data.user){renderUser(data.user);return}
    if(data.configured===false)showMessage('Member accounts need Supabase Auth configuration before sign-in can be used.','error');
  }catch{}
}
loginTab.onclick=()=>setMode('login');signupTab.onclick=()=>setMode('signup');
document.querySelectorAll('[data-mode]').forEach(b=>b.onclick=()=>setMode(b.dataset.mode));
loginForm.onsubmit=async e=>{
  e.preventDefault();setBusy(loginForm,true);showMessage('');
  try{const data=await api('/api/auth/login-link',{email:$('#loginEmail').value});showMessage(data.message||'Check your email for your secure login link.','success')}catch(err){showMessage(err.message,'error')}finally{setBusy(loginForm,false)}
};
signupForm.onsubmit=async e=>{
  e.preventDefault();setBusy(signupForm,true);showMessage('');
  try{const data=await api('/api/auth/signup-link',{displayName:$('#signupName').value,email:$('#signupEmail').value});showMessage(data.message||'Check your email to finish creating your account.','success')}catch(err){showMessage(err.message,'error')}finally{setBusy(signupForm,false)}
};
$('#logoutButton').onclick=async()=>{try{await api('/api/auth/logout',{});}catch{}location.href='/auth.html'};
setMode(mode);
const accepted=await acceptMagicSession();if(!accepted)await loadUser();
