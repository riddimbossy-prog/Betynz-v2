"use strict";
const {CONFIG,round1,round2,clamp}=require('./goldenCore.cjs');

function scoreLowWinUnder35(home,away){
  const homeWinRate=home?.sampleSize?home.wins/home.sampleSize:1;
  const awayWinRate=away?.sampleSize?away.wins/away.sampleSize:1;
  const homeLowWins=homeWinRate<0.20;
  const awayLowWins=awayWinRate<0.20;
  const homeLowPPG=Number(home?.ppg)<1.0;
  const awayLowPPG=Number(away?.ppg)<1.0;
  const lowFormRoute=homeLowWins&&awayLowWins&&homeLowPPG&&awayLowPPG;

  const homeOver=Number(home?.over25Rate);
  const awayOver=Number(away?.over25Rate);
  const homeEnv=Number(home?.totalGoalsAverage);
  const awayEnv=Number(away?.totalGoalsAverage);
  const homeBtts=Number(home?.bttsRate);
  const awayBtts=Number(away?.bttsRate);

  const lowOverProfile=Number.isFinite(homeOver)&&Number.isFinite(awayOver)&&homeOver<=0.40&&awayOver<=0.40;
  const controlledGoalEnvironment=Number.isFinite(homeEnv)&&Number.isFinite(awayEnv)&&homeEnv<=3.0&&awayEnv<=3.0;
  const bttsContained=Number.isFinite(homeBtts)&&Number.isFinite(awayBtts)&&homeBtts<=0.60&&awayBtts<=0.60;
  const qualified=lowFormRoute&&lowOverProfile&&controlledGoalEnvironment;
  const reasons=[];

  if(lowFormRoute){
    reasons.push(`Low-win/low-PPG entry gate clears: split wins ${Math.round(homeWinRate*100)}% / ${Math.round(awayWinRate*100)}%, PPG ${round2(home.ppg)} / ${round2(away.ppg)}.`);
  }else{
    reasons.push(`Under 3.5 entry gate needs both teams below 20% split wins and below 1.00 split PPG (${Math.round(homeWinRate*100)}% / ${Math.round(awayWinRate*100)}%; ${round2(home.ppg)} / ${round2(away.ppg)} PPG).`);
  }
  if(lowOverProfile)reasons.push(`Both split O2.5 rates are contained at 40% or lower (${Math.round(homeOver*100)}% / ${Math.round(awayOver*100)}%).`);
  else reasons.push(`Under 3.5 rejected unless both split O2.5 rates are 40% or lower (${Math.round((homeOver||0)*100)}% / ${Math.round((awayOver||0)*100)}%).`);
  if(controlledGoalEnvironment)reasons.push(`Both split goal environments are 3.00 or lower (${round2(homeEnv)} / ${round2(awayEnv)}).`);
  else reasons.push(`Under 3.5 rejected because at least one split goal environment is above 3.00 (${round2(homeEnv)} / ${round2(awayEnv)}).`);
  if(bttsContained)reasons.push(`BTTS frequency is also contained (${Math.round(homeBtts*100)}% / ${Math.round(awayBtts*100)}%).`);

  let score=0;
  if(qualified){
    score=7.0;
    score+=homeOver<=0.20&&awayOver<=0.20?1.0:0.6;
    score+=homeEnv<=2.6&&awayEnv<=2.6?0.8:0.4;
    if(bttsContained)score+=0.4;
  }
  score=round1(clamp(score));

  return {
    market:'Under 3.5 Goals',
    bet:'Under 3.5',
    score,
    verdict:qualified?'Qualified':'Not Qualified',
    qualified,
    forced:false,
    homeWinRate:round2(homeWinRate),
    awayWinRate:round2(awayWinRate),
    homePPG:round2(Number(home?.ppg)||0),
    awayPPG:round2(Number(away?.ppg)||0),
    thresholds:{winRateExclusive:0.20,ppgExclusive:1.0,maxOver25Rate:0.40,maxGoalEnvironment:3.0,sampleSize:CONFIG.sampleSize},
    confirmations:{lowFormRoute,lowOverProfile,controlledGoalEnvironment,bttsContained},
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
  const wasLegacyForced=previous.primaryBet==='Under 3.5'&&Boolean(previous.hardOverride);

  if(!under35.qualified){
    return {
      ...analysis,
      markets,
      banker:wasLegacyForced?false:analysis.banker,
      finalRecommendation:wasLegacyForced?{
        ...previous,
        primaryBet:'Skip',
        score:0,
        confidence:'Low',
        bankerStatus:'Not Banker',
        summary:'Legacy forced Under 3.5 removed because the goal evidence does not confirm a low-scoring profile.',
        hardOverride:false,
      }:{...previous,hardOverride:false},
    };
  }

  if(under35.score>Number(previous.score||0)||wasLegacyForced){
    return {
      ...analysis,
      markets,
      finalRecommendation:{
        ...previous,
        primaryBet:'Under 3.5',
        score:under35.score,
        confidence:under35.score>=8.5?'High':'Medium',
        bankerStatus:under35.score>=CONFIG.bankerMinScore?'Banker':'Not Banker',
        summary:under35.reasons[0],
        hardOverride:false,
      },
      banker:under35.score>=CONFIG.bankerMinScore,
    };
  }

  return {...analysis,markets,finalRecommendation:{...previous,hardOverride:false}};
}

module.exports={scoreLowWinUnder35,applyLowWinUnder35ToAnalysis};
