import { HttpClient } from './http.mjs';
import { number, mapLimit, day } from '../util.mjs';
export function normalizeEvent(ev,tournament={},fetchedAt=new Date().toISOString()) {
  const cat=ev.sport?.category||{}; const tour=cat.tournament||tournament;
  const stamp=number(ev.estimateStartTime);
  return {id:String(ev.eventId||''),kickoff:stamp===null?null:new Date(stamp<1e12?stamp*1000:stamp).toISOString(),
    home:{id:String(ev.homeTeamId||''),name:ev.homeTeamName||'',logo:ev.homeTeamIcon||null},
    away:{id:String(ev.awayTeamId||''),name:ev.awayTeamName||'',logo:ev.awayTeamIcon||null},
    league:{id:String(tour.id||''),name:tour.name||'',country:cat.name||tournament.categoryName||''},
    status:ev.status, matchStatus:ev.matchStatus||'', markets:Array.isArray(ev.markets)?ev.markets:[],oddsFetchedAt:fetchedAt,source:'Sportybet'};
}
export function flattenPage(data,at) {
  if(!data || !Array.isArray(data.tournaments)) throw new Error('Sportybet fixture schema changed');
  return data.tournaments.flatMap(t=>(t.events||[]).map(e=>normalizeEvent(e,t,at)));
}
export class Sportybet {
  constructor({country=process.env.SPORTYBET_COUNTRY||'gh',client,concurrency=Number(process.env.SPORTYBET_CONCURRENCY||4)}={}) {
    if(!/^[a-z]{2}$/.test(country)) throw new Error('Invalid SPORTYBET_COUNTRY');
    this.country=country; this.base=`https://www.sportybet.com/api/${country}/factsCenter`;
    this.client=client||new HttpClient({interval:200,headers:{'user-agent':'Mozilla/5.0',origin:'https://www.sportybet.com',referer:`https://www.sportybet.com/${country}/sport/football`,clientid:'web',platform:'web'}});
    this.concurrency=concurrency;
  }
  async call(path,params={}) {
    const url=new URL(`${this.base}/${path}`);
    for(const [k,v] of Object.entries(params)) url.searchParams.set(k,String(v));
    const body=await this.client.json(url,{validate:b=>{if(Number(b.bizCode)!==10000 || !b.data) throw new Error(`Sportybet rejected request (${b.bizCode??'invalid body'})`);}});
    return body.data;
  }
  async fixtures() {
    const records=new Map(); const diagnostics=[]; let complete=true;
    // Today and Upcoming are separate books. No market whitelist on discovery.
    for(const today of [true,false]) {
      let expected=null; const seen=new Set();
      for(let page=1;page<=200;page++) {
        try {
          const data=await this.call('pcUpcomingEvents',{sportId:'sr:sport:1',pageSize:100,pageNum:page,...(today?{todayGames:true}:{})});
          const rows=flattenPage(data,new Date().toISOString());
          expected=number(data.totalNum);
          let added=0;
          for(const row of rows) { if(!row.id || !row.kickoff) continue; if(!seen.has(row.id)) added++; seen.add(row.id); records.set(row.id,row); }
          if(expected!==null && seen.size>=expected) break;
          if(!rows.length || !added) {
            if(expected!==null && seen.size<expected) { complete=false; diagnostics.push(`Incomplete ${today?'today':'upcoming'} book: ${seen.size}/${expected}`); }
            break;
          }
          if(page===200) { complete=false; diagnostics.push('Sportybet pagination safety limit reached'); }
        } catch(e) { complete=false; diagnostics.push(`${today?'Today':'Upcoming'} fixtures: ${e.message}`); break; }
      }
    }
    return {fixtures:[...records.values()],complete,diagnostics};
  }
  async eventMarkets(fixture) {
    const data=await this.call('event',{eventId:fixture.id,productId:3});
    const ev=data.event||data;
    if(!Array.isArray(ev.markets)) throw new Error('Sportybet event market schema changed');
    if(ev.eventId && String(ev.eventId)!==fixture.id) throw new Error('Sportybet event identity mismatch');
    const merged=normalizeEvent({...ev,eventId:fixture.id,homeTeamName:ev.homeTeamName||fixture.home.name,awayTeamName:ev.awayTeamName||fixture.away.name},fixture.league);
    return {...fixture,...merged,kickoff:merged.kickoff||fixture.kickoff,league:merged.league.id?merged.league:fixture.league,marketFetchStatus:'complete'};
  }
  async dailyBooks(dates) {
    const book=await this.fixtures();
    const fixtures=book.fixtures.filter(f=>dates.includes(day(f.kickoff)));
    const detailed=await mapLimit(fixtures,this.concurrency,async f=>{
      try { return await this.eventMarkets(f); }
      catch(e) { book.diagnostics.push(`${f.home.name} v ${f.away.name}: ${e.message}`); return {...f,markets:[],marketFetchStatus:'failed'}; }
    });
    return {...book,fixtures:detailed,complete:book.complete&&detailed.every(f=>f.marketFetchStatus==='complete')};
  }
}
