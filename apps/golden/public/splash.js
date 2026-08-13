const splash=document.querySelector('#boardSplash');
const state=document.querySelector('#state');
const video=document.querySelector('#boardSplashVideo');
let finished=false;
let boardReady=false;
let videoDone=!video;

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
 video.playsInline=true;
 video.loop=false;
 video.addEventListener('ended',()=>{videoDone=true;maybeFinish()},{once:true});
 video.addEventListener('error',()=>{videoDone=true;maybeFinish()},{once:true});
 video.play().catch(()=>{videoDone=true;maybeFinish()});
}

if(state){
 const observer=new MutationObserver(()=>{
  if(/^(Complete|Analysing|Refresh failed)/i.test(state.textContent.trim())){
   boardReady=true;
   maybeFinish();
  }
 });
 observer.observe(state,{childList:true,subtree:true,characterData:true});
}

setTimeout(()=>{boardReady=true;videoDone=true;finish()},15000);
