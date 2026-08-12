const splash=document.querySelector('#boardSplash');
const state=document.querySelector('#state');

if(splash&&state){
  const started=performance.now();
  let done=false;
  let observer=null;

  const ready=()=>/^(Complete|Analysing|Refresh failed)/i.test(String(state.textContent||'').trim());
  const finish=()=>{
    if(done)return;
    done=true;
    const reduced=window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches;
    const elapsed=performance.now()-started;
    const wait=reduced?0:Math.max(0,850-elapsed);
    window.setTimeout(()=>{
      splash.classList.add('is-hiding');
      document.body.classList.remove('splash-active');
      window.setTimeout(()=>splash.remove(),reduced?0:620);
    },wait);
    observer?.disconnect();
  };

  observer=new MutationObserver(()=>{if(ready())finish();});
  observer.observe(state,{childList:true,subtree:true,characterData:true});
  window.addEventListener('load',()=>{if(ready())finish();},{once:true});
  if(ready())finish();
  window.setTimeout(finish,15000);
}
