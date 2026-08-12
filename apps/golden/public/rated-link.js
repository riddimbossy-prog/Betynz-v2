const link=document.querySelector('#moreHighlyRated');
const today=()=>new Date().toISOString().slice(0,10);
const currentDate=()=>document.querySelector('#days [data-date].on')?.dataset?.date||today();
let requestSeq=0;

async function refreshRatedLink(date=currentDate()){
  if(!link)return;
  const seq=++requestSeq;
  link.href=`/highly-rated.html?date=${encodeURIComponent(date)}`;
  try{
    const r=await fetch(`/api/golden-banker?date=${encodeURIComponent(date)}`,{cache:'no-store'});
    if(!r.ok)throw new Error(`HTTP ${r.status}`);
    const g=await r.json();
    if(seq!==requestSeq)return;
    const qualified=(g?.all||[]).filter(x=>x?.analysis?.banker).length;
    const top=(g?.topBankers||[]).length;
    const extras=Math.max(0,qualified-top);
    link.hidden=Boolean(g?.complete)&&extras===0;
    link.textContent=extras>0?`More Highly Rated Picks (${extras}) →`:'View Highly Rated Picks →';
  }catch{
    if(seq!==requestSeq)return;
    link.hidden=false;
    link.textContent='View Highly Rated Picks →';
  }
}

document.addEventListener('click',e=>{
  const day=e.target.closest?.('#days [data-date]');
  if(day)setTimeout(()=>refreshRatedLink(day.dataset.date),60);
  if(e.target.closest?.('#refresh'))setTimeout(()=>refreshRatedLink(currentDate()),500);
});

setInterval(()=>refreshRatedLink(currentDate()),15000);
setTimeout(()=>refreshRatedLink(currentDate()),250);
