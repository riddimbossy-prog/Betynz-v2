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
  const min = board.policy?.minimumSurety ?? 0.9;
  const max = board.policy?.maximumSurety ?? 1;
  const sure = (tip) => Number.isFinite(tip?.probability) && tip.probability >= min && tip.probability <= max;
  const eligible = (tip) => tip && (tip.probabilityBasis === 'odds' || !/\bfouls?\b/i.test(tip.market || '')) && sure(tip);
  for(const match of board.matches||[]) {
    const old=match.tip;
    match.categoryTips=(match.categoryTips||[]).filter(eligible);
    if(old && eligible(old)) continue;
    match.tip=match.categoryTips.sort((a,b)=>b.probability-a.probability||b.expectedReturn-a.expectedReturn||(a.risk?.score??100)-(b.risk?.score??100))[0]||null;
    match.status=match.tip?'qualified':'skipped';
    if(match.tip) {
      match.tip={...match.tip,scenarios:[]};
      match.reasons=(match.reasons||[]).filter(r=>!r.includes('highest estimated chance')&&!r.includes('highest surity')&&!r.startsWith('For this particular market,')&&!r.startsWith('The estimated return at this price')&&!r.startsWith('The matchup model and observed'));
      match.reasons.push(`${match.tip.selection} in ${match.tip.market} is the highest surity among the remaining markets backed from ${Math.round(min*100)} to ${Math.round(max*100)}.`);
      match.reasons.push('Foul estimates calculated from goal counts were removed. Conditional failure scenarios are unavailable for this republished selection until the next full scan.');
    } else match.reasons=[`No supported market is backed at ${Math.round(min*100)}–${Math.round(max*100)} surity`];
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
