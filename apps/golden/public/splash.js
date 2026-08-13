const splash=document.querySelector('#boardSplash');
const state=document.querySelector('#state');
const video=document.querySelector('#boardSplashVideo');
const reduced=window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches;
const FALLBACK_DURATION_MS=5200;
const DOMAIN_ONLY_SPLASH=true;
let finished=false;
let boardReady=false;
let videoDone=Boolean(DOMAIN_ONLY_SPLASH||reduced||!video);
let fallbackTimer=null;
let observer=null;

function syncVideoShape(){
  if(!video||!video.videoWidth||!video.videoHeight)return;
  const portrait=video.videoHeight>video.videoWidth;
  video.classList.toggle('is-portrait',portrait);
  video.classList.toggle('is-landscape',!portrait);
}

function stopVideo(){
  if(video&&!video.paused)video.pause();
}

function finish(){
  if(finished)return;
  finished=true;
  observer?.disconnect();
  if(fallbackTimer)window.clearTimeout(fallbackTimer);
  splash?.classList.add('is-hiding');
  document.body.classList.remove('splash-active');
  window.setTimeout(()=>{stopVideo();splash?.remove();},reduced?0:460);
}

function maybeFinish(){
  if(boardReady&&videoDone)finish();
}

function markVideoDone(){
  if(videoDone)return;
  videoDone=true;
  maybeFinish();
}

function scheduleStaticFallback(){
  if(videoDone||fallbackTimer)return;
  fallbackTimer=window.setTimeout(markVideoDone,FALLBACK_DURATION_MS);
}

function tryPlayVideo(){
  if(DOMAIN_ONLY_SPLASH||!video||reduced||finished||videoDone)return;
  video.muted=true;
  video.defaultMuted=true;
  video.loop=false;
  video.playsInline=true;
  syncVideoShape();
  const play=()=>{
    syncVideoShape();
    const promise=video.play();
    if(promise?.catch)promise.catch(scheduleStaticFallback);
  };
  if(video.readyState>=2)play();
  else video.addEventListener('canplay',play,{once:true});
}

if(video&&!reduced&&!DOMAIN_ONLY_SPLASH){
  video.addEventListener('loadedmetadata',syncVideoShape,{once:true});
  video.addEventListener('ended',markVideoDone,{once:true});
  video.addEventListener('error',scheduleStaticFallback,{once:true});
  if(video.readyState>=1)syncVideoShape();
  if(video.ended)markVideoDone();
}

tryPlayVideo();
document.addEventListener('visibilitychange',()=>{if(!document.hidden)tryPlayVideo();});

if(splash&&state){
  const isBoardReady=()=>/^(Complete|Analysing|Refresh failed)/i.test(String(state.textContent||'').trim());
  const checkBoard=()=>{
    if(!isBoardReady())return;
    boardReady=true;
    maybeFinish();
  };

  observer=new MutationObserver(checkBoard);
  observer.observe(state,{childList:true,subtree:true,characterData:true});
  window.addEventListener('load',()=>{tryPlayVideo();checkBoard();},{once:true});
  checkBoard();

  window.setTimeout(()=>{
    boardReady=true;
    videoDone=true;
    finish();
  },15000);
}else{
  stopVideo();
}
