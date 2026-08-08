const form=document.getElementById('login-form');
const message=document.getElementById('login-message');
const button=document.getElementById('login-button');
const requested=new URLSearchParams(location.search).get('next')||'/admin-engine-audit.html';
const next=requested.startsWith('/')&&!requested.startsWith('//')?requested:'/admin-engine-audit.html';
function setMessage(text,type=''){message.textContent=text;message.className=`login-message ${type}`.trim()}
async function checkExisting(){try{const res=await fetch('/api/auth/me',{credentials:'same-origin',cache:'no-store'});if(res.ok)location.replace(next)}catch{}}
form.addEventListener('submit',async event=>{event.preventDefault();setMessage('Signing in…');button.disabled=true;try{const res=await fetch('/api/auth/login',{method:'POST',credentials:'same-origin',headers:{'content-type':'application/json'},body:JSON.stringify({email:document.getElementById('login-email').value.trim(),password:document.getElementById('login-password').value})});const body=await res.json().catch(()=>({error:`HTTP ${res.status}`}));if(!res.ok)throw new Error(body.error||'Sign-in failed.');setMessage('Signed in. Opening admin tools…','success');location.replace(next)}catch(error){setMessage(error.message,'error')}finally{button.disabled=false}});
checkExisting();
