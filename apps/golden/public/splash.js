const splash=document.querySelector('#boardSplash');
const state=document.querySelector('#state');
const video=document.querySelector('#boardSplashVideo');
const reduced=window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches;
let finished=false;

function tryPlayVideo(){
  if(!video||reduced||finished)return;
  video.muted=true;
  video.defaultMuted=true;
  video.loop=true;
  video.playsInline=true;
  const play=()=>video.play().catch(()=>{});
  if(video.readyState>=2)play();
  else video.addEventListener('canplay',play,{once:true});
}

function stopVideo(){
  if(!video)return;
  video.pause();
}

tryPlayVideo();
document.addEventListener('visibilitychange',()=>{if(!document.hidden)tryPlayVideo();});

if(splash&&state){
  const started=performance.now();
  let observer=null;

  const ready=()=>/^(Complete|Analysing|Refresh failed)/i.test(String(state.textContent||'').trim());
  const finish=()=>{
    if(finished)return;
    finished=true;
    const elapsed=performance.now()-started;
    const wait=reduced?0:Math.max(0,850-elapsed);
    window.setTimeout(()=>{
      splash.classList.add('is-hiding');
      document.body.classList.remove('splash-active');
      window.setTimeout(()=>{stopVideo();splash.remove();},reduced?0:620);
    },wait);
    observer?.disconnect();
  };

  observer=new MutationObserver(()=>{if(ready())finish();});
  observer.observe(state,{childList:true,subtree:true,characterData:true});
  window.addEventListener('load',()=>{tryPlayVideo();if(ready())finish();},{once:true});
  if(ready())finish();
  window.setTimeout(finish,15000);
}else{
  stopVideo();
}