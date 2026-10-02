import { nameSimilarity } from './football.mjs';
const ALIASES = {
  'england|premier league': 'england/premier-league',
  'england|championship': 'england/championship',
  'england|league one': 'england/league-one',
  'england|league two': 'england/league-two',
  'spain|la liga': 'spain/laliga',
  'spain|laliga': 'spain/laliga',
  'italy|serie a': 'italy/serie-a',
  'germany|bundesliga': 'germany/bundesliga',
  'france|ligue 1': 'france/ligue-1',
  'netherlands|eredivisie': 'netherlands/eredivisie',
  'portugal|primeira liga': 'portugal/liga-portugal',
  'scotland|premiership': 'scotland/premiership',
  'ghana|premier league': 'ghana/premier-league',
};

function slug(value) {
  return String(value || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/&/g, ' and ').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

export function leaguePath(league) {
  const key = `${league.country || ''}|${league.name || ''}`.toLowerCase();
  return ALIASES[key] || `${slug(league.country)}/${slug(league.name)}`;
}

export function teamKey(name) {
  return String(name || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\b(fc|cf|sc|afc|club)\b/g, '').replace(/[^a-z0-9]+/g, ' ').trim();
}

export function parseHtftTable(html) {
  const rows = [];
  const pattern = /<tr[\s\S]*?<\/tr>/gi;
  for (const row of String(html).match(pattern) || []) {
    const cells = [...row.matchAll(/<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/gi)].map(cell => cell[1].replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim());
    if (cells.length < 11) continue;
    const name = cells[1].replace(/^\d+\.?\s*/, '');
    const nums = cells.slice(2, 12).map(value => Number(String(value).replace(/[^\d]/g, '')));
    if (!name || nums.some(value => !Number.isInteger(value))) continue;
    rows.push({ name, mp: nums[0], 'W/W': nums[1], 'W/D': nums[2], 'W/L': nums[3], 'D/W': nums[4], 'D/D': nums[5], 'D/L': nums[6], 'L/W': nums[7], 'L/D': nums[8], 'L/L': nums[9] });
  }
  return rows;
}

export function findTeam(rows, name) {
  const key = teamKey(name);
  return rows.find(row => teamKey(row.name) === key) || rows.find(row => teamKey(row.name).includes(key) || key.includes(teamKey(row.name))) || null;
}

export function parseResults(html,anchor=new Date()) {
  const records=[];
  const clean=value=>String(value).replace(/<[^>]+>/g,' ').replace(/&amp;/g,'&').replace(/&#39;|&apos;/g,"'").replace(/&nbsp;/g,' ').replace(/\s+/g,' ').trim();
  for(const row of String(html).match(/<tr\b[^>]*>[\s\S]*?<\/tr>/gi)||[]) {
    const cells=[...row.matchAll(/<td\b[^>]*>([\s\S]*?)<\/td>/gi)].map(m=>m[1]);
    if(cells.length<3)continue;
    const teams=cells[0].match(/class=["']in-match["'][^>]*>([\s\S]*?)<\/a>/i);
    const names=teams?clean(teams[1]).split(/\s+-\s+/):[];
    const score=clean(cells[1]).match(/^(\d+):(\d+)$/);
    const date=clean(cells.at(-1)).match(/^(\d{1,2})\.(\d{1,2})\.(?:(\d{4}))?$/);
    const path=cells[0].match(/href=["']([^"']+)["']/)?.[1];
    if(names.length!==2||!score||!date||!path||/aet|penalt|awarded|walkover/i.test(row))continue;
    let year=Number(date[3])||anchor.getUTCFullYear();
    let at=new Date(Date.UTC(year,Number(date[2])-1,Number(date[1])));
    if(!date[3]&&at>anchor)at=new Date(Date.UTC(--year,Number(date[2])-1,Number(date[1])));
    if(at.getUTCMonth()!==Number(date[2])-1||at.getUTCDate()!==Number(date[1])||at>=anchor)continue;
    records.push({id:`betexplorer:${path}`,date:at.toISOString(),homeName:names[0],awayName:names[1],
      homeId:`be:${teamKey(names[0])}`,awayId:`be:${teamKey(names[1])}`,home:Number(score[1]),away:Number(score[2]),htHome:null,htAway:null,stats:null});
  }
  return [...new Map(records.map(r=>[r.id,r])).values()].sort((a,b)=>Date.parse(b.date)-Date.parse(a.date));
}

function resolveTeam(records,name) {
  const names=[...new Set(records.flatMap(r=>[r.homeName,r.awayName]))];
  const ranked=names.map(n=>({name:n,score:teamKey(n)===teamKey(name)?1:nameSimilarity(n,name)})).sort((a,b)=>b.score-a.score);
  if(!ranked.length||ranked[0].score<0.8||(ranked[1]&&ranked[0].score-ranked[1].score<0.08))throw new Error(`BetExplorer team identity not verified: ${name}`);
  return `be:${teamKey(ranked[0].name)}`;
}

export class BetexplorerHtft {
  constructor({ fetchImpl = fetch, interval = 400 } = {}) {
    this.fetchImpl = fetchImpl;
    this.interval = interval;
    this.next = 0;
    this.cache = new Map();
  }
  async text(url) {
    const slot = Math.max(Date.now(), this.next);
    this.next = slot + this.interval;
    if (slot > Date.now()) await new Promise(resolve => setTimeout(resolve, slot - Date.now()));
    const response = await this.fetchImpl(url, { headers: { accept: 'text/html', 'user-agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/131.0.0.0 Safari/537.36' }, signal: AbortSignal.timeout(25000) });
    if (!response.ok) throw new Error(`BetExplorer HTTP ${response.status}`);
    return response.text();
  }
  async leagueTables(league) {
    const path = leaguePath(league);
    if (this.cache.has(path)) return this.cache.get(path);
    const run = this.load(path);
    this.cache.set(path, run);
    return run;
  }
  async enrich(fixture) {
    const path=leaguePath(fixture.league),key=`results:${path}`;
    if(!this.cache.has(key))this.cache.set(key,this.text(`https://www.betexplorer.com/football/${path}/results/`));
    const history=parseResults(await this.cache.get(key),new Date(Math.min(Date.now(),Date.parse(fixture.kickoff))));
    const home=resolveTeam(history,fixture.home.name),away=resolveTeam(history,fixture.away.name);
    const homeHistory=history.filter(r=>r.homeId===home).slice(0,10),awayHistory=history.filter(r=>r.awayId===away).slice(0,10);
    if(!homeHistory.length||!awayHistory.length)throw new Error('BetExplorer home/away results unavailable');
    return {...fixture,table:[],homeStanding:null,awayStanding:null,home:{...fixture.home,apiId:home},away:{...fixture.away,apiId:away},
      homeHistory,awayHistory,leagueHistory:history,h2h:history.filter(r=>(r.homeId===home&&r.awayId===away)||(r.homeId===away&&r.awayId===home)),
      statsSource:'BetExplorer',statsFetchedAt:new Date().toISOString(),diagnostics:['BetExplorer completed results supplied the home/away form. Half-time and advanced statistics are unavailable in this fallback.'],
      statisticsUrl:`https://www.betexplorer.com/football/${path}/results/`};
  }
  async load(path) {
    const page = await this.text(`https://www.betexplorer.com/football/${path}/`);
    const href = page.match(/standings\/\?table=ht_ft[^"']+/)?.[0];
    if (!href) throw new Error(`BetExplorer HT/FT table not found for ${path}`);
    const base = `https://www.betexplorer.com/football/${path}/${href}`.replaceAll('amp;', '');
    const withSub = sub => base.replace(/table_sub=[^&]*/, `table_sub=${sub}`);
    const [homeHtml, awayHtml] = await Promise.all([this.text(withSub('home')), this.text(withSub('away'))]);
    const home = parseHtftTable(homeHtml);
    const away = parseHtftTable(awayHtml);
    if (!home.length || !away.length) throw new Error(`BetExplorer HT/FT rows empty for ${path}`);
    return { path, home, away, venueConfirmed: true };
  }
}
