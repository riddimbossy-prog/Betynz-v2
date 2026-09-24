import { number } from '../util.mjs';
const knownNames={'1':'1x2','10':'double chance','11':'draw no bet','18':'over/under','19':'home total goals','20':'away total goals','29':'both teams to score','35':'1x2 & both teams to score','36':'over/under & both teams to score'};
const clean=s=>String(s||'').toLowerCase().replace(/[–—]/g,'-').replace(/\s+/g,' ').trim();
const sign=v=>v>0?1:v<0?-1:0;
const pickSide=s=>/^(home|1)$/.test(s)?'home':/^(away|2)$/.test(s)?'away':/^(draw|x)$/.test(s)?'draw':null;
const yesNo=s=>s==='yes'?true:s==='no'?false:null;
function parseSpec(s) { return Object.fromEntries(String(s||'').split(/[|&]/).map(p=>p.split('='))); }
function lineFrom(m,o) {
  const spec=parseSpec(m.specifier); const explicit=number(spec.total??spec.hcp??spec.handicap);
  if(explicit!==null) return explicit;
  const match=clean(o.desc||o.name).match(/(?:over|under)\s*([+-]?\d+(?:\.\d+)?)/);
  return match?Number(match[1]):null;
}
export function marketActive(m) { return !m.banned && !m.suspended && !m.isSuspended && (m.status===undefined || m.status===null || String(m.status)==='0' || clean(m.status)==='active'); }
export function outcomeActive(o) { return !o.suspended && !o.isSuspended && o.isActive!==false && String(o.isActive)!=='0' && o.active!==false; }
function booleanResult(value,want) { return Boolean(value)===want?1:-1; }
export function lineResult(value,line,direction) {
  // Asian quarter lines split the stake equally. Returns net win/loss stake units.
  const q=Math.round(line*4);
  if(Math.abs(q/4-line)>1e-8) return null;
  if(q%2) return (lineResult(value,line-0.25,direction)+lineResult(value,line+0.25,direction))/2;
  return sign(direction==='over'?value-line:line-value);
}
export function compileSelection(m,o,fixture={}) {
  let name=clean(m.desc||m.name||knownNames[String(m.id)]);
  let outcome=clean(o.desc||o.name); const spec=parseSpec(m.specifier);
  if(outcome===clean(fixture.home?.name)) outcome='home';
  if(outcome===clean(fixture.away?.name)) outcome='away';
  const period=/1st half|first half|half time|halftime/.test(name)?'ht':/2nd half|second half/.test(name)?'sh':'ft';
  const stat=/corner/.test(name)?'corners':/yellow cards?/.test(name)?'yellow':/red cards?/.test(name)?'red':/cards?|booking/.test(name)?'unsupported-cards':'goals';
  // Goals data never stands in for player, timing, corner, card or sequence data.
  if(/player|scorer|assist|minute|next |first goal|last goal|first team|last team|in a row|consecutive|penalty|penalties|extra time|qualify|substitution|offside|throw.?in|goal kick|free kick|shot/.test(name)) return null;
  if(stat==='unsupported-cards') return null; // Provider card-points rules differ from yellow+red counts.
  if(/half.?time\s*\/\s*full.?time|ht\s*\/\s*ft|halftime\/fulltime/.test(name)) {
    const parts=outcome.split(/\s*\/\s*/).map(pickSide);
    if(parts.length!==2||parts.includes(null)) return null;
    return {kind:'htft',stat:'goals',period:'ft',parts};
  }
  name=name.replace(/1st half|first half|half time|halftime|2nd half|second half/g,'').replace(/^[\s:-]+|[\s:-]+$/g,'');
  const team=/\bhome\b/.test(name)?'home':/\baway\b/.test(name)?'away':null;
  const side=pickSide(outcome); const yn=yesNo(outcome);
  const line=lineFrom(m,o); const direction=/^over\b/.test(outcome)?'over':/^under\b/.test(outcome)?'under':null;
  const btts=/both teams (?:to )?score|\bbtts\b|\bgg\b/.test(name);
  const ou=/over\s*\/\s*under|total|number of goals/.test(name);
  if(/^no draw both teams to score yes\/no$/.test(name)&&yn!==null) return {kind:'no-draw-btts',period,stat,yes:yn};
  if(/^both halves (over|under)/.test(name)&&line!==null&&yn!==null&&line%1===0.5) return {kind:'both-halves-total',period:'ft',stat,line,direction:name.includes('under')?'under':'over',yes:yn};
  if((name.includes('&')||name.includes(' and ')||name.includes(' or ')) && stat==='goals') {
    // Only unambiguous supported combinations are compiled; never guess the operator.
    const isOr=name.includes(' or ');
    if(btts && /1x2|match result/.test(name)) {
      const parts=outcome.split(/\s*(?:&|and|\/)\s*/);
      if(parts.length===2&&pickSide(parts[0])&&yesNo(parts[1])!==null) return {kind:'result-btts',period,stat,side:pickSide(parts[0]),yes:yesNo(parts[1]),operator:isOr?'or':'and'};
    }
    if(btts && ou && line!==null) {
      const parts=outcome.split(/\s*(?:&|and)\s*/);
      if(parts.length===2&&/^(over|under)/.test(parts[0])&&yesNo(parts[1])!==null) return {kind:'total-btts',period,stat,line,direction:parts[0].startsWith('over')?'over':'under',yes:yesNo(parts[1]),operator:isOr?'or':'and'};
    }
    const resultTotal=name.match(/^(home|away|draw)(?: team)? (or|and) (over|under)(?:\/under)?/);
    if(resultTotal && line!==null && yn!==null && line%1===0.5) return {kind:'result-total',period,stat,side:resultTotal[1],operator:resultTotal[2],direction:resultTotal[3],line,yes:yn};
    return null;
  }
  if(/win (?:either|any) half/.test(name)&&team&&yn!==null) return {kind:'win-either-half',stat,period,team,yes:yn};
  if(/win both halves/.test(name)&&team&&yn!==null) return {kind:'win-both-halves',stat,period,team,yes:yn};
  if(/score (?:in )?both halves/.test(name)&&team&&yn!==null) return {kind:'score-both-halves',stat,period,team,yes:yn};
  if(/clean sheet/.test(name)&&team&&yn!==null) return {kind:'clean-sheet',period,stat,team,yes:yn};
  if(/win to nil/.test(name)&&team&&yn!==null) return {kind:'win-to-nil',period,stat,team,yes:yn};
  if(/correct score|exact score/.test(name)) { const p=outcome.match(/^(\d+)\s*[:-]\s*(\d+)$/); if(p) return {kind:'score',period,stat,home:Number(p[1]),away:Number(p[2])}; return null; }
  if(/odd\s*\/\s*even|odd or even/.test(name)&&/^(odd|even)$/.test(outcome)) return {kind:'parity',period,stat,team,parity:outcome};
  if(/double chance/.test(name)) {
    const map={'home or draw':['home','draw'],'1x':['home','draw'],'home or away':['home','away'],'12':['home','away'],'draw or away':['draw','away'],'x2':['draw','away']};
    return map[outcome]?{kind:'double-chance',period,stat,sides:map[outcome]}:null;
  }
  if(/draw no bet/.test(name)&&side&&side!=='draw') return {kind:'dnb',period,stat,side};
  if(btts&&yn!==null) return {kind:'btts',period,stat,yes:yn};
  if(/handicap/.test(name) && side && line!==null) {
    // For Asian handicap the hcp specifier applies to the HOME score.
    if(/asian/.test(name)&&side!=='draw') return {kind:'asian-handicap',period,stat,side,line};
    if(/3.?way|european/.test(name) && Number.isInteger(line)) return {kind:'handicap',period,stat,side,line};
    return null;
  }
  if((ou || /^home goals|^away goals/.test(name))&&line!==null&&direction) return {kind:'total',period,stat,team,line,direction};
  if(/^(1x2|match result|full time result|result)$/.test(name)&&side) return {kind:'result',period,stat,side};
  if(/^home team to score$|^away team to score$/.test(name)&&team&&yn!==null) return {kind:'team-score',period,stat,team,yes:yn};
  if(/exact (?:total )?(?:goals|corners)|number of goals/.test(name)&&/^\d+\+?$/.test(outcome)) return {kind:'exact-total',period,stat,team,value:parseInt(outcome),atLeast:outcome.endsWith('+')};
  return null;
}
export function evaluate(s,r) {
  let h=r.home,a=r.away;
  if(s.stat!=='goals') { if(s.period!=='ft') return null; h=r.stats?.home?.[s.stat]; a=r.stats?.away?.[s.stat]; }
  else if(s.period==='ht') { h=r.htHome; a=r.htAway; }
  else if(s.period==='sh') { if(r.htHome==null||r.htAway==null) return null; h-=r.htHome; a-=r.htAway; }
  if(h==null||a==null) return null;
  const result=h>a?'home':h<a?'away':'draw', goals=s.team==='home'?h:s.team==='away'?a:h+a;
  const combine=(x,y)=>s.operator==='or'?x||y:x&&y;
  switch(s.kind) {
    case 'result': return result===s.side?1:-1;
    case 'double-chance': return s.sides.includes(result)?1:-1;
    case 'dnb': return result==='draw'?0:result===s.side?1:-1;
    case 'total': return lineResult(goals,s.line,s.direction);
    case 'btts': return booleanResult(h>0&&a>0,s.yes);
    case 'no-draw-btts': return booleanResult(h!==a&&h>0&&a>0,s.yes);
    case 'both-halves-total': {
      if(r.htHome==null||r.htAway==null)return null;
      return booleanResult(lineResult(r.htHome+r.htAway,s.line,s.direction)===1&&lineResult(r.home+r.away-r.htHome-r.htAway,s.line,s.direction)===1,s.yes);
    }
    case 'clean-sheet': return booleanResult(s.team==='home'?a===0:h===0,s.yes);
    case 'win-to-nil': return booleanResult(s.team==='home'?h>0&&a===0:a>0&&h===0,s.yes);
    case 'team-score': return booleanResult(goals>0,s.yes);
    case 'score': return h===s.home&&a===s.away?1:-1;
    case 'parity': return (goals%2?'odd':'even')===s.parity?1:-1;
    case 'exact-total': return (s.atLeast?goals>=s.value:goals===s.value)?1:-1;
    case 'handicap': { const res=h+s.line>a?'home':h+s.line<a?'away':'draw'; return res===s.side?1:-1; }
    case 'asian-handicap': return lineResult(h-a,-s.line,s.side==='home'?'over':'under');
    case 'result-btts': return combine(result===s.side,(h>0&&a>0)===s.yes)?1:-1;
    case 'total-btts': { const g=lineResult(h+a,s.line,s.direction); if(g===0||Math.abs(g)!==1) return null; return combine(g===1,(h>0&&a>0)===s.yes)?1:-1; }
    case 'result-total': return booleanResult(combine(result===s.side,lineResult(h+a,s.line,s.direction)===1),s.yes);
    case 'htft': {
      if(r.htHome==null||r.htAway==null) return null;
      const ht=r.htHome>r.htAway?'home':r.htHome<r.htAway?'away':'draw';
      const ft=r.home>r.away?'home':r.home<r.away?'away':'draw';
      return ht===s.parts[0]&&ft===s.parts[1]?1:-1;
    }
    case 'win-either-half': case 'win-both-halves': case 'score-both-halves': {
      if(r.htHome==null||r.htAway==null) return null;
      const first=s.team==='home'?r.htHome-r.htAway:r.htAway-r.htHome;
      const second=s.team==='home'?r.home-r.htHome-(r.away-r.htAway):r.away-r.htAway-(r.home-r.htHome);
      const value=s.kind==='win-either-half'?first>0||second>0:s.kind==='win-both-halves'?first>0&&second>0:s.team==='home'?r.htHome>0&&r.home-r.htHome>0:r.htAway>0&&r.away-r.htAway>0;
      return booleanResult(value,s.yes);
    }
    default: return null;
  }
}
export function selections(fixture,maxOdds=1.5) {
  const candidates=[],excluded=[],seen=new Set(); let outcomes=0,qualifying=0;
  for(const m of fixture.markets||[]) {
    for(const o of m.outcomes||[]) {
      outcomes++; const odds=number(o.odds);
      if(odds===null||odds<=1||odds>maxOdds) continue;
      qualifying++;
      const key=[m.id,m.specifier||'',m.extendedSpecifier||'',o.id||o.desc||o.name].join('|');
      if(seen.has(key)) continue; seen.add(key);
      const base={id:key,marketId:String(m.id),market:m.desc||m.name||knownNames[String(m.id)]||String(m.id),specifier:m.specifier||'',selection:o.desc||o.name||String(o.id),odds};
      if(!marketActive(m)||!outcomeActive(o)) {excluded.push({...base,reason:'Market or outcome suspended'});continue;}
      const compiled=compileSelection(m,o,fixture);
      if(!compiled) {excluded.push({...base,reason:'Unsupported settlement definition or missing event/player statistics'});continue;}
      candidates.push({...base,compiled,category:`${compiled.stat}:${compiled.period}:${m.id}`});
    }
  }
  return {candidates,excluded,counts:{markets:(fixture.markets||[]).length,outcomes,underCap:qualifying,modelled:candidates.length}};
}
