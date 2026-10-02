// Reuse the existing, still-valid Sportybet snapshot while a full scan runs.
// Foul markets previously used goal counts; remove those estimates and rank
// the remaining, already-computed category winners without inventing data.
import {writeJSON} from '../src/util.mjs';
async function get(path) {
  const response=await fetch(`https://www.betynz.com/data/${path}?repair=${Date.now()}`,{signal:AbortSignal.timeout(25000)});
  if(!response.ok)throw new Error(`Published snapshot unavailable: ${response.status}`);
  return response.json();
}
export function repairBoard(board) {
  for(const match of board.matches||[]) {
    const old=match.tip;
    match.categoryTips=(match.categoryTips||[]).filter(c=>c.probabilityBasis==='odds'||!/\bfouls?\b/i.test(c.market));
    if(!old||old.probabilityBasis==='odds'||!/\bfouls?\b/i.test(old.market))continue;
    match.tip=match.categoryTips.sort((a,b)=>b.probability-a.probability||b.expectedReturn-a.expectedReturn||a.risk.score-b.risk.score)[0]||null;
    match.status=match.tip?'qualified':'skipped';
    if(match.tip) {
      match.tip={...match.tip,scenarios:[]};
      match.reasons=(match.reasons||[]).filter(r=>!r.includes('highest estimated chance')&&!r.startsWith('For this particular market,')&&!r.startsWith('The estimated return at this price')&&!r.startsWith('The matchup model and observed'));
      match.reasons.push(`${match.tip.selection} in ${match.tip.market} is the highest estimated chance among the remaining valid category winners at odds from 1.20 to 1.50.`);
      match.reasons.push('Foul estimates calculated from goal counts were removed. Conditional failure scenarios are unavailable for this republished selection until the next full scan.');
    } else match.reasons=['No supported active market in the requested odds range'];
  }
  const selected=board.matches.filter(m=>m.tip);
  board.summary.qualified=selected.length;board.summary.skipped=board.matches.length-selected.length;
  board.matches.sort((a,b)=>(b.tip?.probability??-1)-(a.tip?.probability??-1));
  return board;
}
if(import.meta.url===`file://${process.argv[1]}`) {
  const index=await get('index.json');
  if(!index.policy?.publishAllMatches)throw new Error('The all-matches snapshot is not available');
  for(const date of index.dates) {
    const board=repairBoard(await get(`board-${date.date}.json`));
    await writeJSON(`data/board-${date.date}.json`,board);
    await writeJSON(`data/markets-${date.date}.json`,await get(`markets-${date.date}.json`));
    Object.assign(date,board.summary);
  }
  await writeJSON('data/index.json',index);
  console.log(JSON.stringify(index.dates));
}
