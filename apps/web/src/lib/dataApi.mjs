import { fetchJson } from "./http.mjs";
import { cacheGet, cacheSet } from "./cache.mjs";
import { pickFirst } from "./utils.mjs";
import { configuredValue } from "./env.mjs";

const STRICT_ODDS_VERSION = "STRICT_MARKET_IDENTITY_V2_AUDIT";

const MAIN_RESULT_MARKETS = new Set([
  "1x2", "match result", "full time result", "fulltime result", "ft result",
  "match winner", "three way", "3 way", "result"
]);


const norm = value => String(value || "").toLowerCase().replace(/[^a-z0-9.]+/g, " ").trim();

function cleanEnvValue(value) {
  return String(value ?? '').trim().replace(/^['"]|['"]$/g, '').trim();
}

function configured(value, fallback = '') {
  return configuredValue(value) ? cleanEnvValue(value) : fallback;
}

function splitFeedEndpoint(baseValue, pathValue) {
  const base = cleanEnvValue(baseValue);
  const pathTemplate = cleanEnvValue(pathValue) || 'search_matches?date={date}&page=1&page_size=100';
  try {
    const parsed = new URL(base);
    const marker = '/search_matches';
    const index = parsed.pathname.indexOf(marker);
    if (index >= 0) {
      const endpointPath = `${parsed.pathname.slice(index + 1)}${parsed.search}`;
      parsed.pathname = `${parsed.pathname.slice(0, index + 1)}`;
      parsed.search = '';
      parsed.hash = '';
      return { base: parsed.toString(), pathTemplate: endpointPath || pathTemplate, endpointWasEmbedded: true };
    }
  } catch {}
  return { base, pathTemplate, endpointWasEmbedded: false };
}

function feedCandidate(env = process.env) {
  const rawBase = configured(env.BETYNZ_DATA_API_BASE_URL);
  const key = configured(env.BETYNZ_DATA_API_KEY);
  if (!configuredValue(rawBase) || !configuredValue(key)) return null;
  const endpoint = splitFeedEndpoint(
    rawBase,
    configured(env.BETYNZ_DATA_API_FIXTURES_PATH, 'search_matches?date={date}&page=1&page_size=100')
  );
  return {
    base: endpoint.base,
    key,
    headerName: configured(env.BETYNZ_DATA_API_KEY_HEADER, 'X-API-Key'),
    pathTemplate: endpoint.pathTemplate,
    endpointWasEmbedded: endpoint.endpointWasEmbedded,
    weekPageSize: Number(configured(env.BETYNZ_DATA_API_PAGE_SIZE, '100')),
    timeoutMs: Number(configured(env.BETYNZ_DATA_API_TIMEOUT_MS, '60000')),
    retries: Math.max(0, Math.min(4, Number(configured(env.BETYNZ_DATA_API_RETRIES, '2')) || 0)),
    configured: true,
    mode: 'CUSTOM_DATA_API'
  };
}

export function resolveDataApiConfigs(env = process.env) {
  const candidate = feedCandidate(env);
  return candidate ? [candidate] : [];
}

export function resolveDataApiConfig(env = process.env) {
  const candidate = feedCandidate(env);
  if (!candidate) {
    return {
      base: '', key: '', headerName: 'X-API-Key',
      pathTemplate: 'search_matches?date={date}&page=1&page_size=100',
      weekPageSize: 100, timeoutMs: 60000, retries: 2,
      configured: false, mode: 'MISSING', candidateCount: 0
    };
  }
  return { ...candidate, candidateCount: 1 };
}

/**
 * Some odds feeds include Simulated Reality League (SRL) fixtures. Betynz excludes
 * them because they are simulated events and do not have the same verifiable
 * team history as real-world football matches.
 */
export function isSrlFixture(value = {}) {
  const league = value?.league?.name ?? value?.leagueName ?? value?.league_name ?? value?.competition?.name ?? value?.competitionName ?? value?.competition_name ?? '';
  const country = value?.league?.country ?? value?.country ?? value?.countryName ?? value?.country_name ?? '';
  const home = value?.home?.name ?? value?.home_team?.name ?? value?.homeTeam?.name ?? value?.home_team ?? value?.homeTeam ?? '';
  const away = value?.away?.name ?? value?.away_team?.name ?? value?.awayTeam?.name ?? value?.away_team ?? value?.awayTeam ?? '';
  const title = value?.title ?? value?.name ?? value?.eventName ?? value?.event_name ?? value?.matchName ?? value?.match_name ?? '';
  const text = [league, country, home, away, title].map(item => String(item || '')).join(' ');
  return /(^|[^a-z0-9])srl([^a-z0-9]|$)/i.test(text) || /simulated\s+reality\s+league/i.test(text);
}
const asOdds = value => {
  const n = Number(value);
  return Number.isFinite(n) && n > 1 && n < 1000 ? n : null;
};

function oddsValue(value) {
  const direct = asOdds(value);
  if (direct) return direct;
  if (!plainObject(value)) return null;
  return asOdds(pickFirst(
    value.decimal,
    value.decimalOdds,
    value.decimal_odds,
    value.current,
    value.currentOdds,
    value.current_odds,
    value.price,
    value.odds,
    value.value,
    null
  ));
}

function plainObject(value) {
  return value && typeof value === "object" && !Array.isArray(value);
}

function entityName(value) {
  if (typeof value === "string" || typeof value === "number") return String(value).trim();
  if (!plainObject(value)) return "";
  return String(pickFirst(
    value.name,
    value.teamName,
    value.team_name,
    value.displayName,
    value.display_name,
    value.shortName,
    value.short_name,
    value.competitorName,
    value.competitor_name,
    value.participantName,
    value.participant_name,
    value.label,
    value.title,
    value.team?.name,
    value.competitor?.name,
    ""
  )).trim();
}

function entityId(value) {
  if (!plainObject(value)) return null;
  return pickFirst(value.id, value.teamId, value.team_id, value.competitorId, value.competitor_id, value.participantId, value.participant_id, null);
}

const SIDE_ALIASES = {
  home: ["home", "homeTeam", "home_team", "homeCompetitor", "home_competitor", "host", "localTeam", "local_team", "team1", "team_1", "participant1", "participant_1"],
  away: ["away", "awayTeam", "away_team", "awayCompetitor", "away_competitor", "guest", "visitor", "visitorTeam", "visitor_team", "team2", "team_2", "participant2", "participant_2"]
};

function directSide(raw, side) {
  for (const key of SIDE_ALIASES[side]) {
    if (raw?.[key] !== undefined && raw?.[key] !== null) return raw[key];
    if (raw?.teams?.[key] !== undefined && raw?.teams?.[key] !== null) return raw.teams[key];
  }
  return null;
}

function participantSide(raw, side) {
  const lists = [raw?.participants, raw?.competitors, raw?.contestants, raw?.teams, raw?.runners]
    .filter(Array.isArray);
  for (const list of lists) {
    const tagged = list.find(item => {
      const role = norm(pickFirst(item?.role, item?.qualifier, item?.side, item?.position, item?.type));
      return side === "home" ? /(home|host|local|team 1|participant 1)/.test(role) : /(away|guest|visitor|team 2|participant 2)/.test(role);
    });
    if (tagged) return tagged;
    if (list.length === 2) return side === "home" ? list[0] : list[1];
  }
  return null;
}

function namesFromTitle(raw) {
  const title = String(pickFirst(raw?.eventName, raw?.event_name, raw?.matchName, raw?.match_name, raw?.name, raw?.title, ""));
  const separators = [/\s+vs\.?\s+/i, /\s+v\s+/i, /\s+-\s+/, /\s+–\s+/, /\s+—\s+/];
  for (const separator of separators) {
    const parts = title.split(separator).map(x => x.trim()).filter(Boolean);
    if (parts.length === 2 && parts.every(x => x.length >= 2)) return { home: parts[0], away: parts[1] };
  }
  return null;
}

function sidesOf(raw) {
  let home = directSide(raw, "home") || participantSide(raw, "home");
  let away = directSide(raw, "away") || participantSide(raw, "away");
  if (!entityName(home) || !entityName(away)) {
    const parsed = namesFromTitle(raw);
    if (parsed) {
      home = entityName(home) ? home : parsed.home;
      away = entityName(away) ? away : parsed.away;
    }
  }
  return { home, away, homeName: entityName(home), awayName: entityName(away) };
}

function kickoffValue(raw) {
  return pickFirst(
    raw?.startTime, raw?.start_time, raw?.kickoff, raw?.kick_off, raw?.scheduled,
    raw?.scheduledAt, raw?.scheduled_at, raw?.eventTime, raw?.event_time,
    raw?.startDate, raw?.start_date, raw?.fixture?.date, raw?.fixture?.timestamp,
    raw?.timestamp, raw?.startTimestamp, raw?.start_timestamp, raw?.dateTime, raw?.datetime,
    raw?.date, null
  );
}

function leagueValue(raw) {
  return pickFirst(raw?.league, raw?.competition, raw?.tournament, raw?.category, raw?.championship, raw?.sportEvent?.tournament, null);
}

function eventScore(raw) {
  if (!plainObject(raw)) return 0;
  const sides = sidesOf(raw);
  let score = 0;
  if (sides.homeName && sides.awayName && norm(sides.homeName) !== norm(sides.awayName)) score += 8;
  const kickoff = kickoffValue(raw);
  const league = leagueValue(raw);
  const identity = pickFirst(raw?.id, raw?.eventId, raw?.event_id, raw?.fixtureId, raw?.fixture_id, raw?.gameId, raw?.game_id, null);
  if (kickoff !== null) score += 3;
  if (league !== null || raw?.leagueName || raw?.league_name || raw?.competitionName || raw?.competition_name) score += 2;
  if (identity !== null) score += 1;
  const numericSide = value => /^\d+(?:[.,]\d+)?$/.test(String(value || '').trim());
  if (numericSide(sides.homeName) || numericSide(sides.awayName)) score -= 12;
  if (kickoff === null && league === null && identity === null) score -= 8;
  if (Array.isArray(raw?.markets) || Array.isArray(raw?.betOffers) || Array.isArray(raw?.marketGroups)) score += 1;
  const type = norm(pickFirst(raw?.sport, raw?.sportName, raw?.sport_name, raw?.type));
  if (/(football|soccer)/.test(type)) score += 1;
  if (!sides.homeName || !sides.awayName) score -= 5;
  if ((raw?.selections || raw?.outcomes || raw?.options) && !kickoffValue(raw)) score -= 6;
  return score;
}

/**
 * Finds event-like objects anywhere in an arbitrary custom API JSON response.
 * This deliberately does not depend on one fixed wrapper such as data.events.
 */
export function extractFixtureObjects(body) {
  const found = [];
  const seen = new WeakSet();
  const stack = [{ value: body, depth: 0 }];
  let visited = 0;

  while (stack.length && visited < 100000) {
    const { value, depth } = stack.pop();
    if (!value || typeof value !== "object" || depth > 16) continue;
    if (seen.has(value)) continue;
    seen.add(value);
    visited += 1;

    if (plainObject(value) && eventScore(value) >= 8) found.push(value);

    if (Array.isArray(value)) {
      for (let i = value.length - 1; i >= 0; i -= 1) stack.push({ value: value[i], depth: depth + 1 });
    } else {
      for (const child of Object.values(value)) {
        if (child && typeof child === "object") stack.push({ value: child, depth: depth + 1 });
      }
    }
  }

  return found;
}

function directOdds(raw) {
  const source = raw?.odds || raw?.prices || raw?.marketsMap || raw?.markets_map || {};
  return {
    homeWin: oddsValue(pickFirst(source.homeWin, source.home_win, source["1"], raw?.homeOdds, raw?.home_odds)),
    draw: oddsValue(pickFirst(source.draw, source["X"], source.x, raw?.drawOdds, raw?.draw_odds)),
    awayWin: oddsValue(pickFirst(source.awayWin, source.away_win, source["2"], raw?.awayOdds, raw?.away_odds)),
    doubleChance1X: oddsValue(pickFirst(source.doubleChance1X, source.double_chance_1x, source["1X"], source.oneX)),
    doubleChance12: oddsValue(pickFirst(source.doubleChance12, source.double_chance_12, source["12"])),
    doubleChanceX2: oddsValue(pickFirst(source.doubleChanceX2, source.double_chance_x2, source["X2"], source.xTwo)),
    over05: oddsValue(pickFirst(source.over05, source.over0_5, source["over_0.5"])),
    under05: oddsValue(pickFirst(source.under05, source.under0_5, source["under_0.5"])),
    over15: oddsValue(pickFirst(source.over15, source.over1_5, source["over_1.5"])),
    under15: oddsValue(pickFirst(source.under15, source.under1_5, source["under_1.5"])),
    over25: oddsValue(pickFirst(source.over25, source.over2_5, source["over_2.5"])),
    under25: oddsValue(pickFirst(source.under25, source.under2_5, source["under_2.5"])),
    over35: oddsValue(pickFirst(source.over35, source.over3_5, source["over_3.5"])),
    under35: oddsValue(pickFirst(source.under35, source.under3_5, source["under_3.5"])),
    bttsYes: oddsValue(pickFirst(source.bttsYes, source.btts_yes, source.gg, source.bothTeamsToScoreYes)),
    bttsNo: oddsValue(pickFirst(source.bttsNo, source.btts_no, source.ng, source.bothTeamsToScoreNo)),
    homeOver05: oddsValue(pickFirst(source.homeOver05, source.home_over_0_5, source.homeTeamOver05)),
    homeUnder05: oddsValue(pickFirst(source.homeUnder05, source.home_under_0_5, source.homeTeamUnder05)),
    homeOver15: oddsValue(pickFirst(source.homeOver15, source.home_over_1_5, source.homeTeamOver15)),
    homeUnder15: oddsValue(pickFirst(source.homeUnder15, source.home_under_1_5, source.homeTeamUnder15)),
    awayOver05: oddsValue(pickFirst(source.awayOver05, source.away_over_0_5, source.awayTeamOver05)),
    awayUnder05: oddsValue(pickFirst(source.awayUnder05, source.away_under_0_5, source.awayTeamUnder05)),
    awayOver15: oddsValue(pickFirst(source.awayOver15, source.away_over_1_5, source.awayTeamOver15)),
    awayUnder15: oddsValue(pickFirst(source.awayUnder15, source.away_under_1_5, source.awayTeamUnder15)),
    firstHalfOver05: oddsValue(pickFirst(source.firstHalfOver05, source.first_half_over_0_5, source.firstHalfOver0_5)),
    firstHalfUnder05: oddsValue(pickFirst(source.firstHalfUnder05, source.first_half_under_0_5, source.firstHalfUnder0_5)),
    firstHalfOver15: oddsValue(pickFirst(source.firstHalfOver15, source.first_half_over_1_5, source.firstHalfOver1_5)),
    firstHalfUnder15: oddsValue(pickFirst(source.firstHalfUnder15, source.first_half_under_1_5, source.firstHalfUnder1_5))
  };
}

function marketSelections(market) {
  const candidate = pickFirst(
    market?.selections,
    market?.outcomes,
    market?.options,
    market?.runners,
    market?.choices,
    market?.bets,
    Array.isArray(market?.odds) ? market.odds : null,
    []
  );
  return Array.isArray(candidate) ? candidate : [];
}

function marketLike(value) {
  return plainObject(value) && marketSelections(value).length > 0;
}

function collectMarketArrays(raw) {
  const found = [];
  const seen = new WeakSet();
  const roots = [raw?.markets, raw?.betOffers, raw?.bet_offers, raw?.marketGroups, raw?.market_groups, raw?.odds?.markets]
    .filter(value => value && typeof value === "object");
  const stack = [...roots];

  while (stack.length && found.length < 2000) {
    const value = stack.pop();
    if (!value || typeof value !== "object" || seen.has(value)) continue;
    seen.add(value);
    if (Array.isArray(value)) {
      for (const item of value) {
        if (marketLike(item)) found.push(item);
        else if (item && typeof item === "object") stack.push(item);
      }
      continue;
    }
    if (marketLike(value)) found.push(value);
    for (const [key, child] of Object.entries(value)) {
      if (!child || typeof child !== "object") continue;
      if (/(market|offer|group|bet)/i.test(key)) stack.push(child);
    }
  }
  return found;
}

function marketText(market) {
  return String(pickFirst(
    market?.name,
    market?.marketName,
    market?.market_name,
    market?.label,
    market?.type,
    market?.desc,
    market?.description,
    market?.title,
    market?.key,
    ""
  )).trim();
}

function selectionText(selection) {
  return String(pickFirst(
    selection?.name,
    selection?.label,
    selection?.outcome,
    selection?.type,
    selection?.desc,
    selection?.description,
    selection?.title,
    selection?.key,
    ""
  )).trim();
}

function flattenSelections(raw) {
  const rows = [];
  for (const market of collectMarketArrays(raw)) {
    const marketRaw = marketText(market);
    const marketName = norm(marketRaw);
    const marketLine = String(pickFirst(
      market?.line,
      market?.total,
      market?.points,
      market?.handicap,
      market?.specifier,
      market?.specifiers,
      ""
    )).trim();
    for (const selection of marketSelections(market)) {
      const selectionRaw = selectionText(selection);
      const selectionLine = String(pickFirst(
        selection?.line,
        selection?.total,
        selection?.points,
        selection?.handicap,
        selection?.specifier,
        selection?.specifiers,
        ""
      )).trim();
      rows.push({
        market: marketName,
        marketRaw,
        marketId: pickFirst(market?.id, market?.marketId, market?.market_id, market?.key, null),
        marketLine,
        selection: norm(selectionRaw),
        selectionRaw,
        selectionId: pickFirst(selection?.id, selection?.selectionId, selection?.selection_id, selection?.outcomeId, selection?.outcome_id, selection?.key, null),
        selectionLine,
        odds: oddsValue(pickFirst(
          selection?.odds,
          selection?.price,
          selection?.value,
          selection?.decimalOdds,
          selection?.decimal_odds,
          selection?.currentOdds,
          selection?.current_odds,
          null
        ))
      });
    }
  }
  return rows.filter(row => row.odds);
}

function compact(value) {
  return norm(value).replace(/\s+/g, "");
}

function hasDerivativeQualifier(market) {
  return /(first half|1st half|half time|halftime|second half|2nd half|corner|booking|card|offside|throw in|penalt|handicap|double chance|draw no bet|correct score|winning margin|team total|home total|away total|both teams)/.test(market);
}

function isMainResultMarket(market) {
  const normalized = norm(market);
  const compacted = compact(market);
  if (hasDerivativeQualifier(normalized)) return false;
  if (MAIN_RESULT_MARKETS.has(normalized)) return true;
  return /(^|\s)(1x2|3 way|three way|match result|full time result|match winner)(\s|$)/.test(normalized)
    || /^(ft)?1x2$/.test(compacted);
}

function exactSelection(selection, options) {
  const value = compact(selection);
  return options.some(option => value === compact(option));
}

function rowEvidence(row) {
  return { market: row.marketRaw || row.market, selection: row.selectionRaw || row.selection };
}

function findLine(row) {
  const text = `${row.market} ${row.marketLine} ${row.selection} ${row.selectionLine}`;
  const match = text.match(/(?:^|\s)(\d+(?:\.\d+)?)(?:\s|$)/);
  return match ? Number(match[1]) : null;
}

function sideForMarket(row, sides) {
  const market = row.market;
  const home = compact(sides?.homeName);
  const away = compact(sides?.awayName);
  if (/(home|host|team 1|team1)/.test(market) || (home && compact(market).includes(home))) return "home";
  if (/(away|guest|visitor|team 2|team2)/.test(market) || (away && compact(market).includes(away))) return "away";
  return null;
}

function classifyRow(row, sides) {
  const market = row.market;
  const choice = compact(row.selection);
  const homeName = compact(sides?.homeName);
  const awayName = compact(sides?.awayName);

  if (isMainResultMarket(market)) {
    if (["1", "home", "homewin", "team1"].includes(choice) || (homeName && choice === homeName)) return { key: "homeWin", reason: "Verified full-time result market and exact home selection." };
    if (["x", "draw", "tie"].includes(choice)) return { key: "draw", reason: "Verified full-time result market and exact draw selection." };
    if (["2", "away", "awaywin", "team2"].includes(choice) || (awayName && choice === awayName)) return { key: "awayWin", reason: "Verified full-time result market and exact away selection." };
    return { key: null, reason: "Full-time result market recognized, but the selection is not an exact supported 1/X/2 identity." };
  }

  if (/(double chance|doublechance)/.test(market)) {
    if (["1x", "homeordraw"].includes(choice)) return { key: "doubleChance1X", reason: "Verified double-chance 1X selection." };
    if (["12", "homeoraway"].includes(choice)) return { key: "doubleChance12", reason: "Verified double-chance 12 selection." };
    if (["x2", "draworaway"].includes(choice)) return { key: "doubleChanceX2", reason: "Verified double-chance X2 selection." };
    return { key: null, reason: "Double-chance market recognized, but the selection identity is unsupported." };
  }

  if (/(both teams to score|bothteamstoscore|btts|gg ng|gg\/ng)/.test(market)) {
    if (["yes", "gg", "both", "bothyes"].includes(choice)) return { key: "bttsYes", reason: "Verified BTTS Yes selection." };
    if (["no", "ng", "bothno"].includes(choice)) return { key: "bttsNo", reason: "Verified BTTS No selection." };
    return { key: null, reason: "BTTS market recognized, but the selection is not an exact Yes/No identity." };
  }

  const isFirstHalf = /(first half|1st half|1h|half time|halftime)/.test(market);
  const isSecondHalf = /(second half|2nd half|2h)/.test(market);
  const isNonGoalDerivative = /(corner|booking|card|offside|throw in|penalt)/.test(market);
  const side = sideForMarket(row, sides);
  const isTeamTotal = /(team total|team goals|home total|away total|home goals|away goals)/.test(market) || side !== null;
  const totalLike = /(total|goals|over under|over\/under)/.test(market) || /^(over|under)/.test(row.selection);

  if (!totalLike) return { key: null, reason: "Market identity is outside the currently supported Betynz mappings." };
  if (isSecondHalf) return { key: null, reason: "Second-half totals are visible for audit but are not normalized yet." };
  if (isNonGoalDerivative) return { key: null, reason: "Derivative market (corners/cards/etc.) is intentionally excluded from goal normalization." };

  const line = findLine(row);
  if (![0.5, 1.5, 2.5, 3.5].includes(line)) return { key: null, reason: "Goal market recognized, but its line is missing or not currently supported." };
  const direction = choice.startsWith("over") ? "over" : choice.startsWith("under") ? "under" : null;
  if (!direction) return { key: null, reason: "Goal market recognized, but the selection is not an exact Over/Under identity." };

  if (isFirstHalf) {
    if (![0.5, 1.5].includes(line)) return { key: null, reason: "First-half goal line is outside the supported 0.5/1.5 set." };
    return { key: `firstHalf${direction === "over" ? "Over" : "Under"}${String(line).replace(".", "")}`, reason: "Verified first-half total and exact Over/Under line." };
  }

  if (isTeamTotal) {
    if (!side) return { key: null, reason: "Team-total market recognized, but home/away identity could not be proved." };
    if (![0.5, 1.5].includes(line)) return { key: null, reason: "Team-total line is outside the supported 0.5/1.5 set." };
    return { key: `${side}${direction === "over" ? "Over" : "Under"}${String(line).replace(".", "")}`, reason: "Verified team-total side, direction and line." };
  }

  return { key: `${direction}${String(line).replace(".", "")}`, reason: "Verified full-match total and exact Over/Under line." };
}

function mapStrictRows(result, meta, rows, sides) {
  const decisions = new Map();
  for (const row of rows) {
    const classified = classifyRow(row, sides);
    if (!classified.key) {
      decisions.set(row, { status: "REJECTED", normalizedKey: null, reason: classified.reason });
      continue;
    }
    if (result[classified.key]) {
      decisions.set(row, {
        status: "REJECTED",
        normalizedKey: classified.key,
        reason: `Duplicate candidate: ${classified.key} already has a trusted price.`
      });
      continue;
    }
    result[classified.key] = row.odds;
    meta[classified.key] = rowEvidence(row);
    decisions.set(row, { status: "ACCEPTED", normalizedKey: classified.key, reason: classified.reason });
  }
  return decisions;
}

const AUDIT_MARKET_LABELS = {
  homeWin: "Full Time Home Win", draw: "Full Time Draw", awayWin: "Full Time Away Win",
  doubleChance1X: "Double Chance 1X", doubleChance12: "Double Chance 12", doubleChanceX2: "Double Chance X2",
  over05: "Over 0.5", under05: "Under 0.5", over15: "Over 1.5", under15: "Under 1.5",
  over25: "Over 2.5", under25: "Under 2.5", over35: "Over 3.5", under35: "Under 3.5",
  bttsYes: "BTTS Yes", bttsNo: "BTTS No",
  homeOver05: "Home Over 0.5", homeUnder05: "Home Under 0.5", homeOver15: "Home Over 1.5", homeUnder15: "Home Under 1.5",
  awayOver05: "Away Over 0.5", awayUnder05: "Away Under 0.5", awayOver15: "Away Over 1.5", awayUnder15: "Away Under 1.5",
  firstHalfOver05: "First Half Over 0.5", firstHalfUnder05: "First Half Under 0.5",
  firstHalfOver15: "First Half Over 1.5", firstHalfUnder15: "First Half Under 1.5"
};

function buildAuditRows(rows, decisions) {
  const identityCounts = new Map();
  for (const row of rows) {
    const key = `${norm(row.marketRaw)}|${norm(row.selectionRaw)}`;
    identityCounts.set(key, (identityCounts.get(key) || 0) + 1);
  }
  return rows.map((row, index) => {
    const decision = decisions.get(row) || { status: "REJECTED", normalizedKey: null, reason: "No mapping decision was produced." };
    const identity = `${norm(row.marketRaw)}|${norm(row.selectionRaw)}`;
    const flags = [];
    if ((identityCounts.get(identity) || 0) > 1) flags.push("DUPLICATE_RAW_SELECTION");
    if (row.odds > 100) flags.push("UNUSUALLY_HIGH_ODDS");
    if (!row.marketRaw) flags.push("MISSING_MARKET_NAME");
    if (!row.selectionRaw) flags.push("MISSING_SELECTION_NAME");
    return {
      row: index + 1,
      marketId: row.marketId ?? null,
      selectionId: row.selectionId ?? null,
      rawMarket: row.marketRaw || "",
      rawSelection: row.selectionRaw || "",
      marketLine: row.marketLine || "",
      selectionLine: row.selectionLine || "",
      odds: row.odds,
      status: decision.status,
      normalizedKey: decision.normalizedKey,
      normalizedMarket: decision.normalizedKey ? (AUDIT_MARKET_LABELS[decision.normalizedKey] || decision.normalizedKey) : null,
      reason: decision.reason,
      flags
    };
  });
}

function summarizeAudit(rows) {
  const accepted = rows.filter(row => row.status === "ACCEPTED").length;
  const rejected = rows.length - accepted;
  const duplicates = rows.filter(row => row.flags.includes("DUPLICATE_RAW_SELECTION") || /Duplicate candidate/.test(row.reason)).length;
  const suspicious = rows.filter(row => row.flags.length > 0).length;
  const unrecognizedMarkets = [...new Set(rows.filter(row => row.status === "REJECTED").map(row => row.rawMarket).filter(Boolean))].slice(0, 100);
  return { totalRows: rows.length, accepted, rejected, duplicates, suspicious, unrecognizedMarkets };
}

function readableRows(rows) {
  const seen = new Set();
  const output = [];
  for (const row of rows) {
    const market = row.marketRaw || row.market || "Market";
    const selection = row.selectionRaw || row.selection || "Selection";
    const key = `${norm(market)}|${norm(selection)}|${row.odds}`;
    if (seen.has(key)) continue;
    seen.add(key);
    output.push({ market, selection, odds: row.odds });
    if (output.length >= 160) break;
  }
  return output;
}

function marketOdds(raw, sides) {
  const result = directOdds(raw);
  const meta = {};
  const rows = flattenSelections(raw);
  const decisions = mapStrictRows(result, meta, rows, sides);
  const auditRows = buildAuditRows(rows, decisions);
  return {
    odds: result,
    oddsMeta: meta,
    marketRows: readableRows(rows),
    oddsAudit: {
      parser: STRICT_ODDS_VERSION,
      summary: summarizeAudit(auditRows),
      rows: auditRows
    },
    parser: STRICT_ODDS_VERSION
  };
}


function scoreNumber(value) {
  const n = Number(value);
  return Number.isFinite(n) && n >= 0 ? n : null;
}

function normalizeScore(raw) {
  const score = raw?.score || raw?.scores || raw?.result || raw?.fixture?.score || {};
  const home = scoreNumber(pickFirst(
    raw?.homeScore, raw?.home_score, raw?.goals?.home, score?.home, score?.homeScore, score?.home_score,
    raw?.result?.home, raw?.fullTime?.home, raw?.full_time?.home, null
  ));
  const away = scoreNumber(pickFirst(
    raw?.awayScore, raw?.away_score, raw?.goals?.away, score?.away, score?.awayScore, score?.away_score,
    raw?.result?.away, raw?.fullTime?.away, raw?.full_time?.away, null
  ));
  const htHome = scoreNumber(pickFirst(
    raw?.halfTime?.home, raw?.half_time?.home, raw?.score?.halftime?.home, raw?.score?.halfTime?.home,
    score?.htHome, score?.half_home, score?.halftimeHome, score?.halftime_home, null
  ));
  const htAway = scoreNumber(pickFirst(
    raw?.halfTime?.away, raw?.half_time?.away, raw?.score?.halftime?.away, raw?.score?.halfTime?.away,
    score?.htAway, score?.half_away, score?.halftimeAway, score?.halftime_away, null
  ));
  return home == null || away == null ? null : { home, away, htHome, htAway };
}


function normalizeMediaUrl(value) {
  const raw = String(value || '').trim().replace(/&amp;/g, '&');
  if (!raw || /^data:|^javascript:/i.test(raw)) return null;
  try {
    const base = cleanEnvValue(process.env.BETYNZ_DATA_API_MEDIA_BASE_URL || 'https://www.sportybet.com/');
    const url = raw.startsWith('//') ? new URL(`https:${raw}`) : new URL(raw, base);
    return ['http:', 'https:'].includes(url.protocol) ? url.toString() : null;
  } catch { return null; }
}

function normalizeParticipant(value, fallbackName = "Unknown") {
  return {
    id: entityId(value),
    name: entityName(value) || fallbackName,
    logo: normalizeMediaUrl(pickFirst(value?.logo, value?.crest, value?.image, value?.icon, value?.badge, value?.src, null))
  };
}

function textValue(value, fallback = "") {
  if (typeof value === "string" || typeof value === "number") return String(value);
  if (!plainObject(value)) return fallback;
  return String(pickFirst(value.name, value.label, value.title, value.description, fallback));
}

function inferCountryFromCompetition(leagueName, countryName) {
  const current = String(countryName || '').trim();
  if (current && !/^(international|world|unknown)$/i.test(current)) return current;
  const league = String(leagueName || '').toLowerCase();
  const rules = [
    [/\b(ettan|division 1.*norra|division 1.*sodra|allsvenskan|superettan|svenska cupen)\b/, 'Sweden'],
    [/\b(veikkausliiga|ykkosliiga|kakkonen|suomen cup)\b/, 'Finland'],
    [/\b(eliteserien|obos ligaen|norwegian cup)\b/, 'Norway'],
    [/\b(superliga|1st division|danish cup)\b/, 'Denmark'],
    [/\b(premier league|championship|league one|league two|fa cup)\b/, 'England'],
    [/\b(primera division|la liga|segunda division|copa del rey)\b/, 'Spain'],
    [/\b(serie a|serie b|coppa italia)\b/, 'Italy'],
    [/\b(bundesliga|2 bundesliga|dfb pokal)\b/, 'Germany'],
    [/\b(ligue 1|ligue 2|coupe de france)\b/, 'France']
  ];
  for (const [pattern, country] of rules) if (pattern.test(league)) return country;
  return current || 'International';
}

function normalizeKickoff(raw, date) {
  let value = kickoffValue(raw);
  const separateTime = pickFirst(raw?.time, raw?.start_clock, raw?.kickoff_time, null);
  if (value && /^\d{4}-\d{2}-\d{2}$/.test(String(value)) && separateTime) value = `${value}T${separateTime}`;
  if (typeof value === "number" || /^\d{10,13}$/.test(String(value || ""))) {
    const n = Number(value);
    value = new Date(n < 1e12 ? n * 1000 : n);
  }
  const parsed = value instanceof Date ? value : new Date(value || `${date}T12:00:00Z`);
  return Number.isNaN(parsed.getTime()) ? `${date}T12:00:00Z` : parsed.toISOString();
}


function directDataApiOdds(raw = {}) {
  const pools = [raw?.odds, raw?.prices, raw?.bookmaker_odds, raw?.bookmakerOdds, raw?.markets_summary, raw?.marketSummary]
    .filter(plainObject);
  const value = names => {
    for (const pool of pools) {
      for (const name of names) {
        if (pool[name] !== undefined) {
          const found = oddsValue(pool[name]);
          if (found) return found;
        }
      }
    }
    for (const name of names) {
      if (raw[name] !== undefined) {
        const found = oddsValue(raw[name]);
        if (found) return found;
      }
    }
    return null;
  };
  return {
    homeWin: value(['1','home','homeWin','home_win','odds1','odd1','home_odds','homeOdds']),
    draw: value(['X','x','draw','drawOdds','draw_odds','oddsX','oddX']),
    awayWin: value(['2','away','awayWin','away_win','odds2','odd2','away_odds','awayOdds']),
    doubleChance1X: value(['1X','1x','doubleChance1X','double_chance_1x']),
    doubleChance12: value(['12','doubleChance12','double_chance_12']),
    doubleChanceX2: value(['X2','x2','doubleChanceX2','double_chance_x2']),
    over15: value(['over15','over_1_5','o15','O1.5']),
    under15: value(['under15','under_1_5','u15','U1.5']),
    over25: value(['over25','over_2_5','o25','O2.5']),
    under25: value(['under25','under_2_5','u25','U2.5']),
    over35: value(['over35','over_3_5','o35','O3.5']),
    under35: value(['under35','under_3_5','u35','U3.5']),
    bttsYes: value(['bttsYes','btts_yes','gg','bothTeamsToScoreYes']),
    bttsNo: value(['bttsNo','btts_no','ng','bothTeamsToScoreNo']),
    homeOver05: value(['homeOver05','home_over_0_5','homeTeamOver05']),
    homeUnder05: value(['homeUnder05','home_under_0_5','homeTeamUnder05']),
    homeOver15: value(['homeOver15','home_over_1_5','homeTeamOver15']),
    homeUnder15: value(['homeUnder15','home_under_1_5','homeTeamUnder15']),
    awayOver05: value(['awayOver05','away_over_0_5','awayTeamOver05']),
    awayUnder05: value(['awayUnder05','away_under_0_5','awayTeamUnder05']),
    awayOver15: value(['awayOver15','away_over_1_5','awayTeamOver15']),
    awayUnder15: value(['awayUnder15','away_under_1_5','awayTeamUnder15']),
    firstHalfOver05: value(['firstHalfOver05','first_half_over_0_5','fhOver05']),
    firstHalfUnder05: value(['firstHalfUnder05','first_half_under_0_5','fhUnder05']),
    firstHalfOver15: value(['firstHalfOver15','first_half_over_1_5','fhOver15']),
    firstHalfUnder15: value(['firstHalfUnder15','first_half_under_1_5','fhUnder15'])
  };
}

function normalizeFixture(raw, index, date) {
  const sides = sidesOf(raw);
  const parsedMarkets = marketOdds(raw, sides);
  const directOdds = directDataApiOdds(raw);
  const mergedOdds = { ...parsedMarkets.odds };
  for (const [key, value] of Object.entries(directOdds)) if (!mergedOdds[key] && value) mergedOdds[key] = value;
  const leagueRaw = leagueValue(raw);
  const countryRaw = pickFirst(
    raw?.country,
    raw?.region,
    raw?.category?.country,
    raw?.category?.region,
    raw?.league?.country,
    raw?.league?.category?.country,
    raw?.league?.category?.region,
    raw?.competition?.country,
    raw?.competition?.category?.country,
    raw?.competition?.category?.region,
    raw?.tournament?.country,
    raw?.tournament?.category?.country,
    raw?.tournament?.category?.region,
    null
  );
  const leagueName = pickFirst(
    textValue(leagueRaw),
    raw?.leagueName,
    raw?.league_name,
    raw?.competitionName,
    raw?.competition_name,
    raw?.tournamentName,
    raw?.tournament_name,
    "Unknown League"
  );
  const countryNameRaw = pickFirst(
    textValue(countryRaw),
    raw?.countryName,
    raw?.country_name,
    raw?.regionName,
    raw?.region_name,
    "International"
  );
  const countryName = inferCountryFromCompetition(leagueName, countryNameRaw);
  const sourceId = pickFirst(raw?.id, raw?.eventId, raw?.event_id, raw?.fixtureId, raw?.fixture_id, raw?.gameId, raw?.game_id, null);
  return {
    id: String(sourceId || `feed-${date}-${index}`),
    sourceId,
    kickoff: normalizeKickoff(raw, date),
    status: String(pickFirst(raw?.status, raw?.state, raw?.matchStatus, raw?.match_status, raw?.fixture?.status?.short, "NS")),
    minute: (() => {
      const value = Number(pickFirst(raw?.minute, raw?.elapsed, raw?.time?.elapsed, raw?.fixture?.status?.elapsed, null));
      return Number.isFinite(value) && value >= 0 ? value : null;
    })(),
    score: normalizeScore(raw),
    events: Array.isArray(raw?.events) ? raw.events : Array.isArray(raw?.incidents) ? raw.incidents : [],
    league: {
      id: pickFirst(leagueRaw?.id, leagueRaw?.leagueId, leagueRaw?.league_id, raw?.leagueId, raw?.league_id, null),
      name: leagueName,
      country: countryName,
      logo: normalizeMediaUrl(pickFirst(leagueRaw?.logo, leagueRaw?.image, leagueRaw?.icon, leagueRaw?.flag, null)),
      season: pickFirst(raw?.season, leagueRaw?.season, null),
      flag: normalizeMediaUrl(pickFirst(raw?.country_flag, raw?.countryFlag, leagueRaw?.country_flag, leagueRaw?.countryFlag, null))
    },
    home: normalizeParticipant(sides.home, sides.homeName || "Home Team"),
    away: normalizeParticipant(sides.away, sides.awayName || "Away Team"),
    odds: mergedOdds,
    oddsMeta: parsedMarkets.oddsMeta,
    marketRows: parsedMarkets.marketRows,
    oddsAudit: parsedMarkets.oddsAudit,
    oddsParser: parsedMarkets.parser,
    availableMarketCount: Object.values(mergedOdds).filter(Boolean).length,
    rawSource: "SPORTYBET_CUSTOM_API",
    eventUrl: pickFirst(raw?.event_url, raw?.eventUrl, raw?.match_url, raw?.matchUrl, raw?.url, raw?.href, null),
    enrichment: { matched: false, confidence: 0, statsAvailable: false }
  };
}

function dedupeFixtures(fixtures) {
  const map = new Map();
  for (const fixture of fixtures) {
    const key = fixture.sourceId
      ? `id:${fixture.sourceId}`
      : `${norm(fixture.home.name)}|${norm(fixture.away.name)}|${fixture.kickoff.slice(0, 16)}`;
    const current = map.get(key);
    if (!current || Object.values(fixture.odds || {}).filter(Boolean).length > Object.values(current.odds || {}).filter(Boolean).length) map.set(key, fixture);
  }
  return [...map.values()].sort((a, b) => new Date(a.kickoff) - new Date(b.kickoff));
}

function endpointUrl(base, pathTemplate, date) {
  const safeBase = String(base).endsWith("/") ? String(base) : `${base}/`;
  const path = String(pathTemplate).replace(/\{date\}|%7Bdate%7D/gi, encodeURIComponent(date)).replace(/^\/+/, "");
  return new URL(path, safeBase).toString();
}

function setPathQuery(pathTemplate, updates = {}, removals = []) {
  const raw = String(pathTemplate || '').trim();
  const absolute = /^https?:\/\//i.test(raw);
  const parsed = new URL(raw, 'https://betynz.invalid/');
  for (const key of removals) parsed.searchParams.delete(key);
  for (const [key, value] of Object.entries(updates)) {
    if (value === null || value === undefined || value === '') parsed.searchParams.delete(key);
    else parsed.searchParams.set(key, String(value));
  }
  return absolute ? parsed.toString() : `${parsed.pathname.replace(/^\/+/, '')}${parsed.search}`;
}

function uniquePaths(paths = []) {
  return [...new Set(paths.map(value => String(value || '').trim()).filter(Boolean))];
}

function futurePathStrategies(pathTemplate, config) {
  const safePageSize = Math.max(20, Math.min(100, Number(config.weekPageSize) || 100));
  const base = setPathQuery(pathTemplate, { page_size: safePageSize, page: 1 });
  return uniquePaths([
    setPathQuery(base, { today_only: 'false' }),
    setPathQuery(base, {}, ['today_only']),
    String(pathTemplate).includes('{date}') ? setPathQuery(base, { date: '{date}' }, ['today_only']) : ''
  ]);
}

function todayPathStrategies(pathTemplate, config) {
  const safePageSize = Math.max(20, Math.min(100, Number(config.weekPageSize) || 100));
  const base = setPathQuery(pathTemplate, { page_size: safePageSize, page: 1 });
  return uniquePaths([
    base,
    setPathQuery(base, { today_only: 'true' }),
    setPathQuery(base, {}, ['today_only'])
  ]);
}

function fixtureDateOf(fixture) {
  const value = String(fixture?.kickoff || '').slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : null;
}

function seedDateCaches(baseValue, fixtures, ttl) {
  const grouped = new Map();
  for (const fixture of fixtures) {
    const fixtureDate = fixtureDateOf(fixture);
    if (!fixtureDate) continue;
    if (!grouped.has(fixtureDate)) grouped.set(fixtureDate, []);
    grouped.get(fixtureDate).push(fixture);
  }
  for (const [fixtureDate, dateFixtures] of grouped) {
    cacheSet(`data-api-feed:${fixtureDate}:data-api-only-v1`, {
      ...baseValue,
      fixtures: dateFixtures,
      adapter: { ...baseValue.adapter, normalized: dateFixtures.length }
    }, ttl);
  }
}

function safeErrorReason(error) {
  if (error?.name === 'TimeoutError' || /timed? out|timeout/i.test(String(error?.message || ''))) return 'TIMEOUT';
  if (error?.status === 401 || error?.status === 403) return 'AUTH_REJECTED';
  if (error?.status === 404) return 'ENDPOINT_NOT_FOUND';
  if (error?.status === 429) return 'RATE_LIMITED';
  if (error?.status >= 500) return 'UPSTREAM_UNAVAILABLE';
  if (/ENOTFOUND|EAI_AGAIN|ECONNREFUSED|ECONNRESET|fetch failed/i.test(String(error?.cause?.message || error?.message || ''))) return 'NETWORK_ERROR';
  return 'UPSTREAM_ERROR';
}

function safeRequestTarget(base, path, date) {
  try {
    const parsed = new URL(endpointUrl(base, path, date));
    return { host: parsed.host, pathname: parsed.pathname, queryKeys: [...parsed.searchParams.keys()] };
  } catch {
    return { host: null, pathname: null, queryKeys: [] };
  }
}

async function fetchFeedJsonWithRetry(url, options, timeoutMs, retries = 2) {
  let lastError = null;
  for (let attempt = 0; attempt <= retries; attempt += 1) {
    try {
      return await fetchJson(url, options, timeoutMs);
    } catch (error) {
      lastError = error;
      const retryable = !error?.status || error.status === 408 || error.status === 429 || error.status >= 500;
      if (!retryable || attempt >= retries) break;
      await new Promise(resolve => setTimeout(resolve, Math.min(2500, 350 * (2 ** attempt))));
    }
  }
  throw lastError || new Error('Feed request failed');
}

async function requestFeedStrategy({ base, key, headerName, timeoutMs, retries, path, date, maxPages, pageSize }) {
  const normalized = [];
  const pageAudit = [];
  const signatures = new Set();
  let firstBody = null;

  const configuredPageLimit = Number(maxPages);
  for (let page = 1; ; page += 1) {
    if (configuredPageLimit > 0 && page > configuredPageLimit) break;
    const pagedPath = setPathQuery(path, { page, page_size: pageSize });
    const url = endpointUrl(base, pagedPath, date);
    let body;
    try {
      body = await fetchFeedJsonWithRetry(
        url,
        { headers: { [headerName]: key, accept: 'application/json', 'user-agent': 'Betynz-Data-API-Worker/4.0.1' } },
        timeoutMs,
        retries
      );
    } catch (error) {
      const target = safeRequestTarget(base, pagedPath, date);
      const failure = {
        page,
        status: 'REQUEST_FAILED',
        httpStatus: error.status || null,
        reason: safeErrorReason(error),
        host: target.host,
        pathname: target.pathname,
        queryKeys: target.queryKeys,
        timeoutMs,
        retries
      };
      if (page === 1) {
        error.feedFailure = failure;
        throw error;
      }
      pageAudit.push(failure);
      break;
    }
    if (!firstBody) firstBody = body;
    const rawFixtures = extractFixtureObjects(body);
    const pageFixtures = dedupeFixtures(rawFixtures.map((raw, index) => normalizeFixture(raw, index + ((page - 1) * pageSize), date)))
      .filter(fixture => !isSrlFixture(fixture));
    const signature = pageFixtures.map(item => item.sourceId || `${item.home?.name}|${item.away?.name}|${item.kickoff}`).join('||');
    pageAudit.push({ page, status: 'READY', discovered: rawFixtures.length, normalized: pageFixtures.length });
    if (!pageFixtures.length || signatures.has(signature)) break;
    signatures.add(signature);
    normalized.push(...pageFixtures);
    if (rawFixtures.length < pageSize) break;
  }

  return {
    body: firstBody,
    fixtures: dedupeFixtures(normalized),
    pageAudit
  };
}

export async function fetchDataApiFixtures(date) {
  const cacheKey = `data-api-feed:${date}:data-api-only-v1`;
  const cached = cacheGet(cacheKey);
  if (cached) return { ...cached, cache: "HIT" };

  const configs = resolveDataApiConfigs();

  if (!configs.length) {
    const error = new Error("SportyBet custom API fixture source is not configured");
    error.code = "BETYNZ_DATA_API_NOT_CONFIGURED";
    throw error;
  }

  const today = new Date().toISOString().slice(0, 10);
  const isFutureDate = date !== today;
  const requestedPageLimit = Number(process.env.BETYNZ_DATA_API_MAX_PAGES ?? 0);
  const maxPages = requestedPageLimit > 0 ? Math.max(1, Math.min(1000, requestedPageLimit)) : 0;
  const configurationAttempts = [];
  const successful = [];
  let firstError = null;

  for (const config of configs) {
    try {
      const { base, key, pathTemplate } = config;
      const pageSize = isFutureDate
        ? Math.max(20, Math.min(100, Number(config.weekPageSize) || 100))
        : Math.max(20, Math.min(100, Number(new URL(endpointUrl(base, pathTemplate, date)).searchParams.get('page_size')) || 100));
      const strategies = isFutureDate ? futurePathStrategies(pathTemplate, config) : todayPathStrategies(pathTemplate, config);
      const attempts = [];
      let best = null;
      let strategyError = null;

      for (const path of strategies) {
        try {
          const result = await requestFeedStrategy({
            base,
            key,
            headerName: config.headerName,
            timeoutMs: config.timeoutMs,
            retries: config.retries,
            path,
            date,
            maxPages,
            pageSize
          });
          const allFixtures = result.fixtures.filter(fixture => !isSrlFixture(fixture));
          const requested = allFixtures.filter(fixture => fixtureDateOf(fixture) === date);
          attempts.push({
            path: path.replace(/([?&](?:api[_-]?key|key|token)=)[^&]*/ig, '$1***'),
            status: 'READY',
            pages: result.pageAudit,
            discoveredAcrossDates: allFixtures.length,
            requestedDate: requested.length
          });
          if (!best || requested.length > best.requested.length || (requested.length === best.requested.length && allFixtures.length > best.allFixtures.length)) {
            best = { body: result.body, allFixtures, requested, pageAudit: result.pageAudit, path };
          }
          if (requested.length) break;
        } catch (error) {
          if (!strategyError) strategyError = error;
          const target = safeRequestTarget(base, path, date);
          attempts.push({
            path: path.replace(/([?&](?:api[_-]?key|key|token)=)[^&]*/ig, '$1***'),
            status: 'REQUEST_FAILED',
            httpStatus: error.status || null,
            reason: safeErrorReason(error),
            host: target.host,
            pathname: target.pathname,
            queryKeys: target.queryKeys,
            timeoutMs: config.timeoutMs,
            retries: config.retries
          });
        }
      }

      if (!best) {
        const failure = strategyError || new Error('No feed strategy completed');
        failure.strategyAttempts = attempts;
        throw failure;
      }
      const allFixtures = best.allFixtures.filter(fixture => !isSrlFixture(fixture));
      const fixtures = allFixtures.filter(fixture => fixtureDateOf(fixture) === date);
      const value = {
        fixtures,
        allFixturesForCache: allFixtures,
        source: "SPORTYBET_CUSTOM_API",
        cache: "MISS",
        warning: fixtures.length ? null : "The Custom data API fixture source responded successfully, but no real matches were listed for this date.",
        adapter: {
          mode: isFutureDate ? "FUTURE_PAGINATED_FALLBACK" : "TODAY_DIRECT",
          configurationMode: config.mode,
          discovered: allFixtures.length,
          normalized: fixtures.length,
          discoveredAcrossDates: allFixtures.length,
          srlExcluded: 0,
          pageSize,
          maxPages: maxPages || 'UNTIL_EMPTY',
          attempts,
          topLevelKeys: plainObject(best.body) ? Object.keys(best.body).slice(0, 20) : []
        }
      };
      successful.push(value);
      configurationAttempts.push({ mode: config.mode, status: 'READY', fixtures: fixtures.length, discoveredAcrossDates: allFixtures.length });
      if (fixtures.length) break;
    } catch (error) {
      if (!firstError) firstError = error;
      const failure = error.feedFailure || null;
      const summary = {
        mode: config.mode,
        status: 'REQUEST_FAILED',
        httpStatus: error.status || error.cause?.status || failure?.httpStatus || null,
        reason: safeErrorReason(error),
        baseHost: (() => { try { return new URL(config.base).host; } catch { return null; } })(),
        endpointWasEmbedded: Boolean(config.endpointWasEmbedded),
        timeoutMs: config.timeoutMs,
        retries: config.retries,
        attempts: Array.isArray(error.strategyAttempts) ? error.strategyAttempts : (failure ? [failure] : [])
      };
      configurationAttempts.push(summary);
      console.error('[fixture-feed] request failed', JSON.stringify(summary));
    }
  }

  if (successful.length) {
    successful.sort((a, b) => (b.fixtures?.length || 0) - (a.fixtures?.length || 0) || (b.adapter?.discoveredAcrossDates || 0) - (a.adapter?.discoveredAcrossDates || 0));
    const selected = successful[0];
    const allFixturesForCache = selected.allFixturesForCache || selected.fixtures || [];
    const { allFixturesForCache: _internal, ...value } = selected;
    value.adapter = { ...value.adapter, configurationAttempts };
    const ttl = Number(process.env.CACHE_TTL_SECONDS || 300);
    cacheSet(cacheKey, value, ttl);
    if (allFixturesForCache.length) seedDateCaches(value, allFixturesForCache, ttl);
    return value;
  }

  const wrapped = new Error("Custom data API fixture request failed");
  wrapped.code = "BETYNZ_DATA_API_REQUEST_FAILED";
  wrapped.cause = firstError || new Error('Every configured feed connection failed');
  wrapped.attempts = configurationAttempts;
  throw wrapped;
}

export { normalizeFixture, endpointUrl, setPathQuery, futurePathStrategies };

function actionPath(name, fallback = '') {
  return cleanEnvValue(process.env[name] || fallback).replace(/^\/+/, '');
}

function actionHeaders() {
  const config = resolveDataApiConfig();
  return config.configured
    ? { [config.headerName]: config.key, accept: 'application/json', 'user-agent': 'Betynz-Data-API-Worker/4.0.1' }
    : { accept: 'application/json' };
}

function unwrapPayload(value) {
  if (!value || typeof value !== 'object') return value;
  return value.data ?? value.result ?? value.response ?? value.payload ?? value;
}

function meaningfulPayload(value) {
  const unwrapped = unwrapPayload(value);
  if (unwrapped == null) return false;
  if (Array.isArray(unwrapped)) return unwrapped.length > 0;
  if (typeof unwrapped !== 'object') return false;
  return Object.keys(unwrapped).length > 0 && !unwrapped.error;
}

async function callAction(path, params = {}, ttl = 900) {
  const config = resolveDataApiConfig();
  if (!config.configured || !path) return null;
  const key = `data-api-action:${path}:${JSON.stringify(params)}`;
  const cached = cacheGet(key);
  if (cached) return cached;
  const url = new URL(path.replace(/^\//, ''), config.base.endsWith('/') ? config.base : `${config.base}/`);
  for (const [name, value] of Object.entries(params)) {
    if (value !== undefined && value !== null && value !== '') url.searchParams.set(name, String(value));
  }
  try {
    const body = await fetchFeedJsonWithRetry(
      url.toString(),
      { headers: actionHeaders() },
      config.timeoutMs,
      config.retries
    );
    cacheSet(key, body, ttl);
    return body;
  } catch (error) {
    console.error('[data-api-action] request failed', JSON.stringify({
      action: path,
      status: error.status || null,
      reason: safeErrorReason(error)
    }));
    return null;
  }
}

function intelligenceParams(context = {}) {
  const params = {
    date: context.beforeDate || context.date || '',
    before_date: context.beforeDate || context.date || '',
    home: context.homeName || '',
    away: context.awayName || '',
    league: context.league || '',
    country: context.country || '',
    kickoff: context.kickoff || ''
  };
  const eventId = context.sourceEventId || context.fixtureId || context.eventId || '';
  const eventUrl = context.eventUrl || '';
  if (eventId) params[cleanEnvValue(process.env.BETYNZ_DATA_API_EVENT_ID_PARAM || 'event_id')] = eventId;
  if (eventUrl) params[cleanEnvValue(process.env.BETYNZ_DATA_API_EVENT_URL_PARAM || 'event_url')] = eventUrl;
  return params;
}

export async function getDataApiIntelligence(context = {}) {
  if (!resolveDataApiConfig().configured) return null;
  const base = intelligenceParams(context);
  const singlePath = actionPath('BETYNZ_DATA_API_INTELLIGENCE_PATH', '');
  if (singlePath) {
    const single = await callAction(singlePath, base, Number(process.env.MATCH_INTELLIGENCE_CACHE_TTL_SECONDS || 600));
    if (meaningfulPayload(single)) return unwrapPayload(single);
  }

  const fixturePath = actionPath('BETYNZ_DATA_API_FIXTURE_STATS_PATH', 'get_fixture_stats');
  const historyPath = actionPath('BETYNZ_DATA_API_TEAM_HISTORY_PATH', 'get_team_history');
  const streaksPath = actionPath('BETYNZ_DATA_API_TEAM_STREAKS_PATH', 'get_team_streaks');
  const standingsPath = actionPath('BETYNZ_DATA_API_STANDINGS_PATH', 'get_standings');
  const competitionPath = actionPath('BETYNZ_DATA_API_COMPETITION_STATS_PATH', 'get_competition_stats');

  const [fixture, homeHistory, awayHistory, homeStreaks, awayStreaks, standings, competition] = await Promise.all([
    callAction(fixturePath, base, 900),
    callAction(historyPath, { ...base, team: 'home', venue: 'home', limit: 10 }, 1800),
    callAction(historyPath, { ...base, team: 'away', venue: 'away', limit: 10 }, 1800),
    callAction(streaksPath, { ...base, team: 'home', venue: 'home' }, 1200),
    callAction(streaksPath, { ...base, team: 'away', venue: 'away' }, 1200),
    callAction(standingsPath, base, 1800),
    callAction(competitionPath, { ...base, scope: 'overall' }, 3600)
  ]);

  const composite = {
    fixture: unwrapPayload(fixture),
    home: { history: unwrapPayload(homeHistory), streaks: unwrapPayload(homeStreaks) },
    away: { history: unwrapPayload(awayHistory), streaks: unwrapPayload(awayStreaks) },
    standings: unwrapPayload(standings),
    competition: unwrapPayload(competition)
  };
  return Object.values(composite).some(meaningfulPayload) ? composite : null;
}


function fixtureDetailFromPayload(payload, date, fallbackFixture = null) {
  const unwrapped = unwrapPayload(payload);
  const objects = extractFixtureObjects(unwrapped);
  let raw = objects.find(item => {
    const id = pickFirst(item?.id, item?.eventId, item?.event_id, item?.fixtureId, item?.fixture_id, null);
    return fallbackFixture?.sourceId && id != null && String(id) === String(fallbackFixture.sourceId);
  }) || objects[0] || null;
  if (!raw && plainObject(unwrapped) && eventScore(unwrapped) >= 8) raw = unwrapped;
  return raw ? normalizeFixture(raw, 0, date) : null;
}

function mergeFixtureDetail(fixture, detail) {
  if (!detail) return fixture;
  const odds = { ...(fixture.odds || {}) };
  for (const [key, value] of Object.entries(detail.odds || {})) if (value) odds[key] = value;
  return {
    ...fixture,
    status: detail.status && detail.status !== 'NS' ? detail.status : fixture.status,
    score: detail.score || fixture.score || null,
    league: {
      ...fixture.league,
      logo: detail.league?.logo || fixture.league?.logo || null,
      flag: detail.league?.flag || fixture.league?.flag || null,
      season: detail.league?.season || fixture.league?.season || null
    },
    home: { ...fixture.home, id: detail.home?.id || fixture.home?.id || null, logo: detail.home?.logo || fixture.home?.logo || null },
    away: { ...fixture.away, id: detail.away?.id || fixture.away?.id || null, logo: detail.away?.logo || fixture.away?.logo || null },
    odds,
    oddsMeta: { ...(fixture.oddsMeta || {}), ...(detail.oddsMeta || {}) },
    marketRows: [...(fixture.marketRows || []), ...(detail.marketRows || [])],
    availableMarketCount: Object.values(odds).filter(Boolean).length,
    eventUrl: detail.eventUrl || fixture.eventUrl || null
  };
}

export async function enrichDataApiMarketOdds(date, fixtures = []) {
  const concurrency = Math.max(1, Math.min(8, Number(process.env.BETYNZ_DATA_API_ENRICH_CONCURRENCY || 3)));
  const fixturePath = actionPath('BETYNZ_DATA_API_FIXTURE_STATS_PATH', 'get_fixture_stats');
  const enriched = await mapLimit(fixtures, concurrency, async fixture => {
    const context = {
      sourceEventId: fixture.sourceId || fixture.id,
      beforeDate: date,
      homeName: fixture.home?.name || '',
      awayName: fixture.away?.name || '',
      league: fixture.league?.name || '',
      country: fixture.league?.country || '',
      kickoff: fixture.kickoff || '',
      eventUrl: fixture.eventUrl || ''
    };
    const payload = await callAction(fixturePath, intelligenceParams(context), 900);
    return mergeFixtureDetail(fixture, fixtureDetailFromPayload(payload, date, fixture));
  });
  return { configured: resolveDataApiConfig().configured, source: 'SPORTYBET_CUSTOM_API', fixtures: enriched };
}

async function mapLimit(items, limit, mapper) {
  const results = new Array(items.length);
  let cursor = 0;
  const workers = Array.from({ length: Math.max(1, Math.min(Number(limit) || 1, items.length || 1)) }, async () => {
    while (cursor < items.length) {
      const index = cursor++;
      results[index] = await mapper(items[index], index);
    }
  });
  await Promise.all(workers);
  return results;
}

export async function enrichDataApiFixtures(date, fixtures = [], extractStats) {
  const concurrency = Math.max(1, Math.min(8, Number(process.env.BETYNZ_DATA_API_ENRICH_CONCURRENCY || 3)));
  const enriched = await mapLimit(fixtures, concurrency, async fixture => {
    const context = {
      sourceEventId: fixture.sourceId || fixture.id,
      beforeDate: date,
      homeName: fixture.home?.name || '',
      awayName: fixture.away?.name || '',
      league: fixture.league?.name || '',
      country: fixture.league?.country || '',
      kickoff: fixture.kickoff || '',
      eventUrl: fixture.eventUrl || ''
    };
    const intelligence = await getDataApiIntelligence(context);
    const detailedFixture = mergeFixtureDetail(fixture, fixtureDetailFromPayload(intelligence?.fixture, date, fixture));
    const stats = typeof extractStats === 'function' ? extractStats(intelligence, context) : null;
    return {
      ...detailedFixture,
      stats: stats || null,
      enrichment: {
        matched: Boolean(intelligence),
        confidence: intelligence ? 1 : 0,
        statsAvailable: Boolean(stats?.homeSplit || stats?.awaySplit),
        source: 'SPORTYBET_CUSTOM_API'
      }
    };
  });
  return {
    configured: resolveDataApiConfig().configured,
    source: 'SPORTYBET_CUSTOM_API',
    fixtures: enriched,
    warning: enriched.some(item => item?.stats?.homeSplit || item?.stats?.awaySplit)
      ? null
      : 'Custom data API fixtures loaded, but venue histories were unavailable for this date.'
  };
}

export async function getDataApiLiveFixtures(date = new Date().toISOString().slice(0, 10)) {
  const path = actionPath('BETYNZ_DATA_API_LIVE_PATH', 'live');
  const body = await callAction(path, { date }, Number(process.env.LIVE_CACHE_TTL_SECONDS || 30));
  const raw = extractFixtureObjects(body || {});
  const fixtures = dedupeFixtures(raw.map((item, index) => normalizeFixture(item, index, date)))
    .filter(item => !isSrlFixture(item) && /LIVE|1H|2H|HT|INPLAY|BREAK|AET|PEN/i.test(String(item.status || '')));
  return {
    configured: resolveDataApiConfig().configured,
    source: 'SPORTYBET_CUSTOM_API',
    fixtures,
    warning: body ? null : 'SportyBet live feed is temporarily unavailable.'
  };
}

export async function getDataApiResults(date = new Date().toISOString().slice(0, 10)) {
  const path = actionPath('BETYNZ_DATA_API_RESULTS_PATH', 'results');
  const body = await callAction(path, { date }, Number(process.env.RESULTS_CACHE_TTL_SECONDS || 300));
  const raw = extractFixtureObjects(body || {});
  const fixtures = dedupeFixtures(raw.map((item, index) => normalizeFixture(item, index, date)))
    .filter(item => !isSrlFixture(item));
  return {
    configured: resolveDataApiConfig().configured,
    source: fixtures.length ? 'SPORTYBET_CUSTOM_API' : 'UNAVAILABLE',
    fixtures,
    warning: body ? null : 'SportyBet results feed is temporarily unavailable.'
  };
}

export async function getDataApiFixtureEvents(fixtureId, date = new Date().toISOString().slice(0, 10)) {
  const path = actionPath('BETYNZ_DATA_API_EVENTS_PATH', 'events');
  const idParam = cleanEnvValue(process.env.BETYNZ_DATA_API_EVENT_ID_PARAM || 'event_id');
  const body = await callAction(path, { [idParam]: fixtureId, date }, 30);
  const value = unwrapPayload(body);
  if (Array.isArray(value)) return value;
  if (Array.isArray(value?.events)) return value.events;
  const fixture = extractFixtureObjects(body || {})[0];
  return Array.isArray(fixture?.events) ? fixture.events : [];
}

export async function diagnoseDataApi(date) {
  const config = resolveDataApiConfig();
  if (!config.configured) return { configured: false, status: 'NOT_CONFIGURED' };
  try {
    const feed = await fetchDataApiFixtures(date);
    return {
      configured: true,
      status: 'READY',
      date,
      fixtures: feed.fixtures?.length || 0,
      warning: feed.warning || null,
      adapter: feed.adapter || null
    };
  } catch (error) {
    return {
      configured: true,
      status: 'REQUEST_FAILED',
      code: error.code || null,
      message: error.cause?.message || error.message || 'Request failed',
      attempts: Array.isArray(error.attempts) ? error.attempts : []
    };
  }
}
