function roundNumber(fixture,analysis){
  const values=[fixture?.league?.round,fixture?.round,fixture?.seasonRound,analysis?.round,analysis?.leagueRound,analysis?.seasonRound,analysis?.meta?.round];
  for(const value of values){
    if(value==null)continue;
    const match=String(value).match(/(?:round|matchday|week)?\s*(\d{1,2})/i);
    if(match)return Number(match[1]);
  }
  return null;
}

function primaryMarket(analysis){return String(analysis?.finalRecommendation?.primaryBet||'Skip')}
function marketScore(analysis,key){const n=Number(analysis?.markets?.[key]?.score);return Number.isFinite(n)?n:0}
function numericBottomThree(position,tableSize){
  const p=Number(position),size=Number(tableSize);
  return Number.isFinite(p)&&Number.isFinite(size)&&size>=3&&p>=Math.max(1,size-2);
}
function verifiedTop2(position){
  const p=Number(position);
  return Number.isFinite(p)&&p>=1&&p<=2;
}

function conflictingMarkets(analysis){
  const bet=primaryMarket(analysis),warnings=[];
  if(bet==='Over 2.5'&&marketScore(analysis,'under35')>=7)warnings.push('Under 3.5 also grades 7/10+; goals direction is conflicted.');
  if(bet==='Under 3.5'&&(marketScore(analysis,'over25')>=7||marketScore(analysis,'btts')>=7))warnings.push('An opposing goals market also grades 7/10+; treat the under with caution.');
  if(/Win|DNB/.test(bet)&&(marketScore(analysis,'over25')>=8||marketScore(analysis,'btts')>=8))warnings.push('Winner route sits beside a very strong goals signal; match volatility is elevated.');
  return warnings;
}

export function evaluateTrust(fixture,analysis){
  if(!analysis||analysis.waiting)return {level:'blocked',score:0,label:'DATA INCOMPLETE',warnings:['Exact 5 + 5 split evidence is incomplete.'],blocked:true,zeusDecision:'SKIP'};
  const warnings=[],round=roundNumber(fixture,analysis);
  let score=100,blocked=false;
  if(Number.isFinite(round)&&round<=5){score-=22;warnings.push(`Early season round ${round}: form is still settling.`)}
  else if(Number.isFinite(round)&&round<=8){score-=12;warnings.push(`Early-season round ${round}: sample stability is still developing.`)}
  const conflicts=conflictingMarkets(analysis);warnings.push(...conflicts);score-=conflicts.length*18;
  const home=analysis?.split?.home,away=analysis?.split?.away,positions=analysis?.split?.positions||{};
  const bet=primaryMarket(analysis),winMarket=/Win|DNB/.test(bet),straightWin=/ Win$/.test(bet);
  if(winMarket){
    const favouriteSide=analysis?.markets?.winDnb?.favouriteSide;
    const fav=String(favouriteSide).toLowerCase()==='away'?away:home;
    const opp=String(favouriteSide).toLowerCase()==='away'?home:away;
    if(Number(fav?.ppg)<2){blocked=true;warnings.push('Zeus blocked winner market: favourite is below 2.0 split PPG.');}
    if(Number(opp?.ppg)>=1){blocked=true;warnings.push('Zeus blocked winner market: opponent is not weak enough (<1.0 split PPG required).');}
    const favPos=String(favouriteSide).toLowerCase()==='away'?positions?.away:positions?.home;
    const favTableSize=String(favouriteSide).toLowerCase()==='away'?(positions?.awayTableSize??positions?.tableSize):(positions?.homeTableSize??positions?.tableSize);
    if(numericBottomThree(favPos,favTableSize)){blocked=true;warnings.push(`Zeus blocked winner market: favourite is Bottom 3 in the relevant split-form table (#${favPos}/${favTableSize}).`);}
    if(straightWin&&!verifiedTop2(favPos)){
      blocked=true;
      warnings.push(Number.isFinite(Number(favPos))
        ? `Zeus blocked straight win: favourite is #${favPos} in the relevant split-form table. Only verified #1 or #2 may receive a Win tip.`
        : 'Zeus blocked straight win: no verified relevant split-form Top-2 position is available.');
    }
  }
  if(Number(analysis?.finalRecommendation?.score)<7){blocked=true;warnings.push('Primary market does not clear the 7/10 banker gate.');}
  score=Math.max(0,Math.min(100,score));
  const level=blocked?'blocked':score>=85?'strong':score>=70?'caution':'weak';
  return {round,score,level,label:blocked?'ZEUS BLOCKED':level==='strong'?'TRUST STRONG':level==='caution'?'TRUST CAUTION':'TRUST WEAK',warnings,blocked,zeusDecision:blocked?'SKIP':'APPROVE'};
}

export function applyTrustLayer(fixture,analysis){
  if(!analysis)return analysis;
  const trust=evaluateTrust(fixture,analysis),next={...analysis,trust,zeus:{decision:trust.zeusDecision,reasons:trust.warnings}};
  if(trust.blocked){
    next.banker=false;
    next.finalRecommendation={...(analysis.finalRecommendation||{}),bankerStatus:'Not Banker',confidence:'Low',summary:trust.warnings[0]||'Zeus rejected this selection.'};
  }
  return next;
}
