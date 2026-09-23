export const now=Date.parse('2026-09-23T10:00:00Z');
export const standing=(id,rank,size=20)=>({rank,team:{id:Number(id),name:`Team ${id}`},points:Math.max(7,42-rank),all:{played:15},home:{played:8,win:6,draw:1,lose:1,goals:{for:20,against:6}},away:{played:7,win:4,draw:1,lose:2,goals:{for:12,against:8}}});
export function record(id,home,away,h=3,a=0,offset=0) {return {id:String(id),homeId:String(home),awayId:String(away),home:h,away:a,htHome:Math.min(1,h),htAway:0,date:new Date(now-(offset+1)*86400000).toISOString(),leagueId:39,stats:{[home]:{xg:h*0.9,shots:14,corners:6,yellow:1,red:0},[away]:{xg:a+0.4,shots:7,corners:3,yellow:2,red:0}}};}
export function market(id,desc,items,specifier='') {return {id:String(id),desc,status:0,specifier,outcomes:items.map(([desc,odds],i)=>({id:String(i+1),desc,odds:String(odds),isActive:1}))};}
export function fixture() {
  const table=Array.from({length:20},(_,i)=>standing(i+1,i+1));
  return {id:'sr:match:1',status:0,kickoff:'2026-09-23T20:00:00Z',oddsFetchedAt:'2026-09-23T09:59:00Z',home:{id:'s1',apiId:'1',name:'Alpha FC'},away:{id:'s18',apiId:'18',name:'Beta FC'},league:{id:'sr:tournament:1',apiId:'39',name:'Test League',country:'Test',size:20},
    table,homeStanding:table[0],awayStanding:table[17],homeHistory:Array.from({length:10},(_,i)=>record(i+10,1,i+2,3,i%2,i*7)),awayHistory:Array.from({length:10},(_,i)=>record(i+30,i+3,18,2,i%3===0?1:0,i*7)),h2h:[record(90,1,18,3,0,100),record(91,18,1,0,2,180)],leagueHistory:Array.from({length:100},(_,i)=>record(i+100,1,18,2,0,i*2)),
    markets:[market(1,'1X2',[['Home',1.40],['Draw',4.8],['Away',8]]),market(18,'Over/Under',[['Over 1.5',1.25],['Under 1.5',3.9]],'total=1.5'),market(19,'Home Total Goals',[['Over 0.5',1.08],['Under 0.5',7]],'total=0.5'),market(10,'Double Chance',[['Home or Draw',1.10],['Draw or Away',2.5]])]};
}
export const stable={reliable:true,score:80,sampleSize:200,forecastChecks:120,upsetRate:0.12};
