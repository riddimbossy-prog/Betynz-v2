"use strict";
const {CONFIG,round2}=require('./goldenCore.cjs');

function scoreLowWinUnder35(home,away){
  const homeWinRate=home?.sampleSize?home.wins/home.sampleSize:1;
  const awayWinRate=away?.sampleSize?away.wins/away.sampleSize:1;
  const homeLowWins=homeWinRate<0.20;
  const awayLowWins=awayWinRate<0.20;
  const homeLowPPG=Number(home?.ppg)<1.0;
  const awayLowPPG=Number(away?.ppg)<1.0;
  const forced=homeLowWins&&awayLowWins&&homeLowPPG&&awayLowPPG;
  const reasons=[];

  if(forced){
    reasons.push(`Hard U3.5 override: both teams are below 20% split wins (${Math.round(homeWinRate*100)}% / ${Math.round(awayWinRate*100)}%) and both are below 1.00 split PPG (${round2(home.ppg)} / ${round2(away.ppg)}).`);
    reasons.push('Goals scored and conceded are ignored once this low-win/low-PPG condition is met.');
  }

  return {
    market:'Under 3.5 Goals',
    bet:'Under 3.5',
    score:forced?10.0:0.0,
    verdict:forced?'Hard Override':'Not Triggered',
    qualified:forced,
    forced,
    homeWinRate:round2(homeWinRate),
    awayWinRate:round2(awayWinRate),
    homePPG:round2(Number(home?.ppg)||0),
    awayPPG:round2(Number(away?.ppg)||0),
    thresholds:{winRateExclusive:0.20,ppgExclusive:1.0,sampleSize:CONFIG.sampleSize},
    reasons,
  };
}

function applyLowWinUnder35ToAnalysis(analysis){
  if(!analysis||analysis.waiting)return analysis;
  const home=analysis?.split?.home;
  const away=analysis?.split?.away;
  if(!home||!away)return analysis;

  const under35=scoreLowWinUnder35(home,away);
  const markets={...(analysis.markets||{}),under35};
  const previous=analysis.finalRecommendation||{};

  if(!under35.forced){
    return {
      ...analysis,
      markets,
      finalRecommendation:{...previous,hardOverride:false},
    };
  }

  return {
    ...analysis,
    markets,
    finalRecommendation:{
      ...previous,
      primaryBet:'Under 3.5',
      score:10,
      confidence:'High',
      bankerStatus:'Banker',
      summary:under35.reasons[0],
      hardOverride:true,
    },
    banker:true,
  };
}

module.exports={scoreLowWinUnder35,applyLowWinUnder35ToAnalysis};
