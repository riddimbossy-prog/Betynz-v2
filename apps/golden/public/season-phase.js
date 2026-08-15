export function seasonRound(fixture={},analysis={}){
  const values=[
    fixture?.league?.round,
    fixture?.round,
    fixture?.fixture?.round,
    fixture?.seasonRound,
    analysis?.round,
    analysis?.leagueRound,
    analysis?.seasonRound,
    analysis?.meta?.round,
  ];
  for(const value of values){
    if(value==null)continue;
    const match=String(value).match(/(?:round|matchday|week)?\s*(\d{1,3})/i);
    if(match){
      const round=Number(match[1]);
      if(Number.isFinite(round)&&round>0)return round;
    }
  }
  return null;
}

export function seasonPhase(fixture={},analysis={}){
  const round=seasonRound(fixture,analysis);
  if(!Number.isFinite(round))return {key:'UNKNOWN',round:null,label:'Season stage unknown'};
  if(round<=8)return {key:'EARLY',round,label:'Early Season'};
  return {key:'SOLID',round,label:'Solid Season'};
}

export function earlySeasonFlag(fixture={},analysis={}){
  const phase=seasonPhase(fixture,analysis);
  if(phase.key!=='EARLY')return '';
  return `<span class="early-season-flag" title="Early season · Round ${phase.round}" aria-label="Early season">🚩</span>`;
}

export function seasonChip(fixture={},analysis={}){
  const phase=seasonPhase(fixture,analysis);
  if(phase.key==='UNKNOWN')return '';
  const cls=phase.key==='EARLY'?'early':'solid';
  return `<span class="season-chip ${cls}">${phase.key==='EARLY'?'🚩 ':''}${phase.label} · R${phase.round}</span>`;
}
