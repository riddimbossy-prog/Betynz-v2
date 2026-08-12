const SCHEDULED=new Set(['NS','TBD'])
const LIVE=new Set(['1H','HT','2H','ET','BT','P','LIVE','INT','INPLAY'])
const FINISHED=new Set(['FT','AET','PEN','FINISHED','ENDED','COMPLETED'])
let fixtures=new Map(),defaultedDate='',pollTimer=null,paintQueued=false

const q=s=>document.querySelector(s)
const qa=s=>[...document.querySelectorAll(s)]
const statusOf=f=>String(f?.status||'NS').toUpperCase()
const kickMs=f=>{const n=Date.parse(f?.kickoff||'');return Number.isFinite(n)?n:Number.MAX_SAFE_INTEGER}
const selectedDate=()=>q('#days button.on')?.dataset?.date||new Date().toISOString().slice(0,10)
function scoreOf(f){const s=f?.score||{},h=Number.isFinite(Number(s.fulltimeHome))?Number(s.fulltimeHome):Number(s.home),a=Number.isFinite(Number(s.fulltimeAway))?Number(s.fulltimeAway):Number(s.away);return Number.isFinite(h)&&Number.isFinite(a)?{h,a}:null}
function matchLabel(f){
  const s=statusOf(f),m=f?.minute
  if(s==='NS')return'Scheduled'
  if(s==='TBD')return'Time TBD'
  if(s==='1H')return`LIVE · 1H${m!=null?` · ${m}'`:''}`
  if(s==='HT')return'Half Time'
  if(s==='2H')return`LIVE · 2H${m!=null?` · ${m}'`:''}`
  if(s==='ET')return`Extra Time${m!=null?` · ${m}'`:''}`
  if(s==='BT')return'Break Time'
  if(s==='P')return'Penalties'
  if(s==='INT')return'Interrupted'
  if(s==='SUSP')return'Suspended'
  if(s==='FT'||s==='FINISHED'||s==='ENDED'||s==='COMPLETED')return'Full Time'
  if(s==='AET')return'Full Time · AET'
  if(s==='PEN')return'Full Time · Pens'
  if(s==='PST')return'Postponed'
  if(s==='CANC')return'Cancelled'
  if(s==='ABD')return'Abandoned'
  if(s==='AWD')return'Awarded'
  if(s==='WO')return'Walkover'
  return s
}
function matchClass(f){const s=statusOf(f);if(LIVE.has(s))return'live';if(FINISHED.has(s))return'settled';if(/PST|CANC|ABD|SUSP/.test(s))return'interrupted';return'scheduled'}
function outcome(f,bet){
  if(!FINISHED.has(statusOf(f)))return null
  const sc=scoreOf(f);if(!sc)return null
  const h=sc.h,a=sc.a,text=String(bet||'').trim(),lower=text.toLowerCase()
  if(text==='Under 3.5')return h+a<=3?'WON':'LOST'
  if(text==='Over 2.5')return h+a>=3?'WON':'LOST'
  if(text==='BTTS Yes')return h>0&&a>0?'WON':'LOST'
  const home=String(f?.home?.name||'').toLowerCase(),away=String(f?.away?.name||'').toLowerCase(),side=home&&lower.startsWith(home)?'home':away&&lower.startsWith(away)?'away':null
  if(/ DNB$/i.test(text)){if(!side)return'REVIEW';if(h===a)return'PUSH';return side==='home'?(h>a?'WON':'LOST'):(a>h?'WON':'LOST')}
  if(/ Win$/i.test(text)){if(!side)return'REVIEW';return side==='home'?(h>a?'WON':'LOST'):(a>h?'WON':'LOST')}
  return'REVIEW'
}
function ensureStatus(host,f){
  let badge=host.querySelector(':scope > .provider-match-status');if(!badge){badge=document.createElement('span');badge.className='provider-match-status';host.appendChild(badge)}
  const cls=`provider-match-status ${matchClass(f)}`;if(badge.className!==cls)badge.className=cls
  const sc=scoreOf(f),text=`${matchLabel(f)}${sc&&!SCHEDULED.has(statusOf(f))?` · ${sc.h}–${sc.a}`:''}`;if(badge.textContent!==text)badge.textContent=text
}
function reorder(root,cards,idOf){
  const sorted=[...cards].sort((a,b)=>kickMs(fixtures.get(idOf(a)))-kickMs(fixtures.get(idOf(b))))
  if(sorted.some((node,i)=>node!==cards[i]))sorted.forEach(node=>root.appendChild(node))
  return sorted
}
function decorateTop(){
  const root=q('#top4');if(!root)return
  const cards=qa('#top4 .banker-card')
  for(const card of cards){
    const id=String(card.dataset.open||card.querySelector('[data-open]')?.dataset.open||''),f=fixtures.get(id);if(!f)continue
    const meta=card.querySelector('.banker-league');if(meta)ensureStatus(meta,f)
    const pick=card.querySelector('.banker-pick'),bet=pick?.querySelector('strong')?.textContent||'',result=outcome(f,bet)
    let badge=pick?.querySelector('.provider-settlement')
    if(result&&!badge&&pick){badge=document.createElement('span');badge.className='provider-settlement';pick.appendChild(badge)}
    if(badge){badge.className=`provider-settlement ${String(result||'').toLowerCase()}`;badge.textContent=result||'';badge.hidden=!result}
  }
  reorder(root,cards,node=>String(node.dataset.open||'')).forEach((card,i)=>{const rank=card.querySelector('.banker-rank');if(rank&&rank.textContent!==`#${i+1}`)rank.textContent=`#${i+1}`})
}
function decorateMatches(){
  const root=q('#matches');if(!root)return
  const cards=qa('#matches .match')
  for(const card of cards){const f=fixtures.get(String(card.dataset.id||''));if(!f)continue;const meta=card.querySelector('.match-meta');if(meta)ensureStatus(meta,f)}
  reorder(root,cards,node=>String(node.dataset.id||''))
}
function defaultEarlyKickoffView(){
  const date=selectedDate();if(date===defaultedDate)return;defaultedDate=date
  const all=q('#scopeTabs [data-scope="ALL"]');if(all&&!all.classList.contains('active'))all.click()
}
function paint(){paintQueued=false;defaultEarlyKickoffView();decorateTop();decorateMatches()}
function queuePaint(){if(paintQueued)return;paintQueued=true;requestAnimationFrame(paint)}
async function refreshStates(){
  const date=selectedDate()
  try{const r=await fetch(`/api/fixtures?date=${encodeURIComponent(date)}`,{cache:'no-store'}),data=await r.json();if(r.ok){fixtures=new Map((data.fixtures||[]).map(f=>[String(f.id),f]));queuePaint()}}catch{}
}
function schedule(){clearInterval(pollTimer);refreshStates();pollTimer=setInterval(refreshStates,30000)}

q('#days')?.addEventListener('click',()=>setTimeout(()=>{defaultedDate='';schedule()},0))
q('#refresh')?.addEventListener('click',()=>setTimeout(schedule,250))
new MutationObserver(queuePaint).observe(document.body,{subtree:true,childList:true})
schedule()