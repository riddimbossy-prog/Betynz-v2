const login=document.querySelector('[data-account-login]');
const create=document.querySelector('[data-account-create]');
if(login){
  fetch('/api/auth/me',{cache:'no-store'}).then(r=>r.json()).then(data=>{
    if(data?.authenticated&&data.user){
      const name=data.user.displayName||String(data.user.email||'Member').split('@')[0]||'Member';
      login.textContent=`⚡ ${name}`;
      login.href='/auth.html';
      login.classList.add('signed');
      if(create)create.hidden=true;
    }
  }).catch(()=>{});
}
