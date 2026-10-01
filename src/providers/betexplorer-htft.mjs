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
    const response = await this.fetchImpl(url, { headers: { accept: 'text/html', 'user-agent': 'Betynz/1.0' }, signal: AbortSignal.timeout(25000) });
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
