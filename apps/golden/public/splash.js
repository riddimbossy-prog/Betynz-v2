const splash=document.querySelector('#boardSplash');
const media=document.querySelector('#boardSplashMedia');
const state=document.querySelector('#state');
let finished=false;
let boardReady=false;
let mediaDone=false;
const MAX_SPLASH_MS=3600;

function finish(){
  if(finished)return;
  finished=true;
  splash?.classList.add('is-hiding');
  document.body.classList.remove('splash-active');
  setTimeout(()=>splash?.remove(),460);
}

function maybeFinish(){
  if(boardReady&&mediaDone)finish();
}

function startMedia(){
  if(!media||finished){mediaDone=true;maybeFinish();return;}
  const v=document.createElement('video');
  v.className='board-splash__video';
  v.muted=true;
  v.defaultMuted=true;
  v.controls=false;
  v.playsInline=true;
  v.loop=false;
  v.preload='auto';
  v.setAttribute('playsinline','');
  v.setAttribute('webkit-playsinline','');
  v.setAttribute('disablepictureinpicture','');
  v.setAttribute('controlslist','nodownload noplaybackrate nofullscreen');
  v.setAttribute('aria-hidden','true');
  v.style.pointerEvents='none';
  v.addEventListener('playing',()=>v.classList.add('is-playing'),{once:true});
  v.addEventListener('ended',()=>{mediaDone=true;maybeFinish()},{once:true});
  v.addEventListener('error',()=>{mediaDone=true;maybeFinish()},{once:true});
  v.addEventListener('loadeddata',()=>{
    try{v.currentTime=.06}catch{}
    v.play().catch(()=>{mediaDone=true;maybeFinish()});
  },{once:true});
  media.appendChild(v);
  setTimeout(()=>{v.src='/media/zeus-thunder-original.mp4';v.load()},80);
}

if(state){
  const markReady=()=>{
    if(/^(Complete|Analysing|Refresh failed)/i.test(state.textContent.trim())){
      boardReady=true;
      maybeFinish();
    }
  };
  const observer=new MutationObserver(markReady);
  observer.observe(state,{childList:true,subtree:true,characterData:true});
  markReady();
}

requestAnimationFrame(()=>requestAnimationFrame(startMedia));
setTimeout(()=>{mediaDone=true;boardReady=true;finish()},MAX_SPLASH_MS);
