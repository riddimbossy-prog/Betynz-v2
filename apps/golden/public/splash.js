const splash=document.querySelector('#boardSplash');
const state=document.querySelector('#state');
const video=document.querySelector('#boardSplashVideo');
let finished=false;
let boardReady=false;
let videoDone=!video;
const MAX_SPLASH_MS=5200;

function finish(){
 if(finished)return;
 finished=true;
 splash?.classList.add('is-hiding');
 document.body.classList.remove('splash-active');
 setTimeout(()=>splash?.remove(),460);
}

function maybeFinish(){
 if(boardReady&&videoDone) finish();
}

if(video){
 video.muted=true;
 video.defaultMuted=true;
 video.playsInline=true;
 video.loop=false;
 video.controls=false;
 video.removeAttribute('controls');
 video.setAttribute('playsinline','');
 video.setAttribute('webkit-playsinline','');
 video.setAttribute('disablepictureinpicture','');
 video.style.pointerEvents='none';
 video.addEventListener('contextmenu',e=>e.preventDefault());
 video.addEventListener('loadedmetadata',()=>{
  try{video.currentTime=0.001}catch{}
  video.play().catch(()=>{videoDone=true;maybeFinish()});
 },{once:true});
 video.addEventListener('playing',()=>{video.classList.add('is-playing')},{once:true});
 video.addEventListener('ended',()=>{videoDone=true;maybeFinish()},{once:true});
 video.addEventListener('error',()=>{videoDone=true;maybeFinish()},{once:true});
 if(video.readyState>=1){
  try{video.currentTime=0.001}catch{}
  video.play().catch(()=>{videoDone=true;maybeFinish()});
 }
}

if(state){
 const markReady=()=>{
  const text=state.textContent.trim();
  if(/^(Complete|Analysing|Refresh failed)/i.test(text)){
   boardReady=true;
   maybeFinish();
  }
 };
 const observer=new MutationObserver(markReady);
 observer.observe(state,{childList:true,subtree:true,characterData:true});
 markReady();
}

setTimeout(()=>{boardReady=true;videoDone=true;finish()},MAX_SPLASH_MS);
