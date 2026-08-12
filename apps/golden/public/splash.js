import p1 from './video/zeus-thunder.part01.js';
import p2 from './video/zeus-thunder.part02.js';
import p3 from './video/zeus-thunder.part03.js';
import p4 from './video/zeus-thunder.part04.js';
import p5 from './video/zeus-thunder.part05.js';

const splash=document.querySelector('#boardSplash');
const state=document.querySelector('#state');
const video=document.querySelector('#boardSplashVideo');
const reduced=window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches;
let videoUrl=null;

function mountVideo(){
  if(!video||reduced)return;
  try{
    const raw=atob([p1,p2,p3,p4,p5].join(''));
    const bytes=new Uint8Array(raw.length);
    for(let i=0;i<raw.length;i++)bytes[i]=raw.charCodeAt(i);
    videoUrl=URL.createObjectURL(new Blob([bytes],{type:'video/mp4'}));
    video.src=videoUrl;
    video.muted=true;
    video.loop=true;
    video.playsInline=true;
    video.play().catch(()=>{});
  }catch{
    video.removeAttribute('src');
  }
}

function releaseVideo(){
  if(video){video.pause();video.removeAttribute('src');video.load();}
  if(videoUrl){URL.revokeObjectURL(videoUrl);videoUrl=null;}
}

mountVideo();

if(splash&&state){
  const started=performance.now();
  let done=false;
  let observer=null;

  const ready=()=>/^(Complete|Analysing|Refresh failed)/i.test(String(state.textContent||'').trim());
  const finish=()=>{
    if(done)return;
    done=true;
    const elapsed=performance.now()-started;
    const wait=reduced?0:Math.max(0,850-elapsed);
    window.setTimeout(()=>{
      splash.classList.add('is-hiding');
      document.body.classList.remove('splash-active');
      window.setTimeout(()=>{releaseVideo();splash.remove();},reduced?0:620);
    },wait);
    observer?.disconnect();
  };

  observer=new MutationObserver(()=>{if(ready())finish();});
  observer.observe(state,{childList:true,subtree:true,characterData:true});
  window.addEventListener('load',()=>{if(ready())finish();},{once:true});
  if(ready())finish();
  window.setTimeout(finish,15000);
}else{
  releaseVideo();
}
