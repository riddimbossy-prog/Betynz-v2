"use strict";
const {CONFIG,calculateSplitStats,confidence,resolvePositions,scoreOver25,scoreBTTS}=require('./goldenStats.cjs');
const {scoreWinDNB}=require('./goldenWin.cjs');
const {scoreLowWinUnder35}=require('./goldenUnder35.cjs');

function choosePrimaryMarket(under35,over25,btts,winDnb){
  const candidates=[];
  if(under35?.qualified){
    candidates.push({type:"UNDER35",bet:"Under 3.5",score:under35.score,market:under35.market,protectionPriority:5,forced:false});
  }
  if(winDnb.qualified&&winDnb.bet!=="Skip"){
    candidates.push({type:"WIN_DNB",bet:winDnb.bet,score:winDnb.score,market:winDnb.market,protectionPriority:winDnb.bet.endsWith("DNB")?4:3});
  }
  if(over25.qualified){
    candidates.push({type:"OVER25",bet:"Over 2.5",score:over25.score,market:over25.market,protectionPriority:2});
  }
  if(btts.qualified){
    candidates.push({type:"BTTS",bet:"BTTS Yes",score:btts.score,market:btts.market,protectionPriority:1});
  }
  if(!candidates.length){
    return {type:"SKIP",bet:"Skip",score:Math.max(under35?.score||0,over25.score,btts.score,winDnb.score),market:"None",protectionPriority:0};
  }
  candidates.sort((a,b)=>{
    const gap=Math.abs(Number(b.score)-Number(a.score));
    if(gap<=0.4&&b.protectionPriority!==a.protectionPriority)return b.protectionPriority-a.protectionPriority;
    if(b.score!==a.score)return b.score-a.score;
    return b.protectionPriority-a.protectionPriority;
  });
  return candidates[0];
}

function analyseMatch(input){
  if(!input||typeof input!=="object")throw new Error("analyseMatch requires a match object.");
  const homeTeam=String(input.homeTeam??input.home??"").trim();
  const awayTeam=String(input.awayTeam??input.away??"").trim();
  const league=String(input.league??"Unknown League").trim();
  if(!homeTeam||!awayTeam)throw new Error("homeTeam and awayTeam are required.");

  const home=calculateSplitStats(input.homeLast5,`${homeTeam} last 5 HOME matches`);
  const away=calculateSplitStats(input.awayLast5,`${awayTeam} last 5 AWAY matches`);
  const positions=resolvePositions(input);

  const under35=scoreLowWinUnder35(home,away);
  const over25=scoreOver25(home,away);
  const btts=scoreBTTS(home,away);
  const winDnb=scoreWinDNB(homeTeam,awayTeam,home,away,positions);
  const primary=choosePrimaryMarket(under35,over25,btts,winDnb);
  const banker=primary.bet!=="Skip"&&primary.score>=CONFIG.bankerMinScore;

  const primaryReasons=
    primary.type==="UNDER35"?under35.reasons:
    primary.type==="OVER25"?over25.reasons:
    primary.type==="BTTS"?btts.reasons:
    primary.type==="WIN_DNB"?winDnb.reasons:
    ["No market cleared the qualification gates."];

  return {
    id:input.id??`${homeTeam}__${awayTeam}`,
    homeTeam,
    awayTeam,
    league,
    split:{home,away,positions},
    markets:{under35,over25,btts,winDnb},
    finalRecommendation:{
      primaryBet:primary.bet,
      score:primary.score,
      confidence:confidence(primary.score),
      bankerStatus:banker?"Banker":"Not Banker",
      summary:primaryReasons[0],
      hardOverride:false,
    },
    banker,
  };
}

function selectTopBankers(analyses,maxBankers=CONFIG.maxBankers){
  if(!Array.isArray(analyses))throw new Error("selectTopBankers expects an array of analysed matches.");
  return analyses
    .filter(a=>a&&a.banker)
    .sort((a,b)=>{
      const scoreDiff=b.finalRecommendation.score-a.finalRecommendation.score;
      if(scoreDiff!==0)return scoreDiff;
      const priority=bet=>{
        if(bet==="Under 3.5")return 5;
        if(/DNB$/.test(bet))return 4;
        if(/ Win$/.test(bet))return 3;
        if(bet==="Over 2.5")return 2;
        if(bet==="BTTS Yes")return 1;
        return 0;
      };
      return priority(b.finalRecommendation.primaryBet)-priority(a.finalRecommendation.primaryBet);
    })
    .slice(0,Math.max(0,Math.min(CONFIG.maxBankers,maxBankers)));
}

function analyseBoard(matches){
  if(!Array.isArray(matches))throw new Error("analyseBoard requires an array of matches.");
  const analyses=matches.map(analyseMatch);
  const topBankers=selectTopBankers(analyses,CONFIG.maxBankers);
  return {
    engine:"Golden Banker v4.3",
    philosophy:"Protect the stake first. Last 5 split home/away data only. Markets must clear their own directional confirmation gates.",
    analysed:analyses.length,
    bankersFound:topBankers.length,
    analyses,
    topBankers,
  };
}

module.exports={CONFIG,calculateSplitStats,analyseMatch,analyseBoard,selectTopBankers};
