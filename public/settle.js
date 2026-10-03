const cache = new Map();

function num(value) {
  if (value === null || value === undefined || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function sign(value) {
  return value > 0 ? 1 : value < 0 ? -1 : 0;
}

function booleanResult(value, want) {
  return Boolean(value) === want ? 1 : -1;
}

export function lineResult(value, line, direction) {
  const q = Math.round(line * 4);
  if (Math.abs(q / 4 - line) > 1e-8) return null;
  if (q % 2) return (lineResult(value, line - 0.25, direction) + lineResult(value, line + 0.25, direction)) / 2;
  return sign(direction === "over" ? value - line : line - value);
}

export function grade(selection, score) {
  if (!selection || !score) return null;
  let home = score.home;
  let away = score.away;
  if (selection.stat !== "goals") {
    if (selection.period !== "ft") return null;
    home = score.stats?.home?.[selection.stat];
    away = score.stats?.away?.[selection.stat];
  } else if (selection.period === "ht") {
    home = score.htHome;
    away = score.htAway;
  } else if (selection.period === "sh") {
    if (score.htHome == null || score.htAway == null) return null;
    home -= score.htHome;
    away -= score.htAway;
  }
  if (home == null || away == null) return null;
  const result = home > away ? "home" : home < away ? "away" : "draw";
  const goals = selection.team === "home" ? home : selection.team === "away" ? away : home + away;
  const combine = (left, right) => (selection.operator === "or" ? left || right : left && right);
  switch (selection.kind) {
    case "result": return result === selection.side ? 1 : -1;
    case "double-chance": return selection.sides.includes(result) ? 1 : -1;
    case "dnb": return result === "draw" ? 0 : result === selection.side ? 1 : -1;
    case "total": return lineResult(goals, selection.line, selection.direction);
    case "btts": return booleanResult(home > 0 && away > 0, selection.yes);
    case "no-draw-btts": return booleanResult(home !== away && home > 0 && away > 0, selection.yes);
    case "both-halves-total": {
      if (score.htHome == null || score.htAway == null) return null;
      return booleanResult(lineResult(score.htHome + score.htAway, selection.line, selection.direction) === 1 && lineResult(score.home + score.away - score.htHome - score.htAway, selection.line, selection.direction) === 1, selection.yes);
    }
    case "clean-sheet": return booleanResult(selection.team === "home" ? away === 0 : home === 0, selection.yes);
    case "win-to-nil": return booleanResult(selection.team === "home" ? home > 0 && away === 0 : away > 0 && home === 0, selection.yes);
    case "team-score": return booleanResult(goals > 0, selection.yes);
    case "score": return home === selection.home && away === selection.away ? 1 : -1;
    case "parity": return (goals % 2 ? "odd" : "even") === selection.parity ? 1 : -1;
    case "exact-total": return (selection.atLeast ? goals >= selection.value : goals === selection.value) ? 1 : -1;
    case "handicap": {
      const adjusted = home + selection.line > away ? "home" : home + selection.line < away ? "away" : "draw";
      return adjusted === selection.side ? 1 : -1;
    }
    case "asian-handicap": return lineResult(home - away, -selection.line, selection.side === "home" ? "over" : "under");
    case "result-btts": return combine(result === selection.side, (home > 0 && away > 0) === selection.yes) ? 1 : -1;
    case "total-btts": {
      const total = lineResult(home + away, selection.line, selection.direction);
      if (total === 0 || Math.abs(total) !== 1) return null;
      return combine(total === 1, (home > 0 && away > 0) === selection.yes) ? 1 : -1;
    }
    case "result-total": return booleanResult(combine(result === selection.side, lineResult(home + away, selection.line, selection.direction) === 1), selection.yes);
    case "htft": {
      if (score.htHome == null || score.htAway == null) return null;
      const ht = score.htHome > score.htAway ? "home" : score.htHome < score.htAway ? "away" : "draw";
      const ft = score.home > score.away ? "home" : score.home < score.away ? "away" : "draw";
      return ht === selection.parts[0] && ft === selection.parts[1] ? 1 : -1;
    }
    case "win-either-half":
    case "win-both-halves":
    case "score-both-halves": {
      if (score.htHome == null || score.htAway == null) return null;
      const first = selection.team === "home" ? score.htHome - score.htAway : score.htAway - score.htHome;
      const second = selection.team === "home" ? score.home - score.htHome - (score.away - score.htAway) : score.away - score.htAway - (score.home - score.htHome);
      const value = selection.kind === "win-either-half" ? first > 0 || second > 0 : selection.kind === "win-both-halves" ? first > 0 && second > 0 : selection.team === "home" ? score.htHome > 0 && score.home - score.htHome > 0 : score.htAway > 0 && score.away - score.htAway > 0;
      return booleanResult(value, selection.yes);
    }
    default: return null;
  }
}

export function htftCompiled(pick) {
  const id = pick?.id;
  const goals = { period: "ft", stat: "goals" };
  if (id === "home-win") return { ...goals, kind: "result", side: "home" };
  if (id === "draw") return { ...goals, kind: "result", side: "draw" };
  if (id === "away-win") return { ...goals, kind: "result", side: "away" };
  if (id === "home-1x") return { ...goals, kind: "double-chance", sides: ["home", "draw"] };
  if (id === "away-x2") return { ...goals, kind: "double-chance", sides: ["draw", "away"] };
  if (id === "home-dnb") return { ...goals, kind: "dnb", side: "home" };
  if (id === "away-dnb") return { ...goals, kind: "dnb", side: "away" };
  if (id === "over-1.5") return { ...goals, kind: "total", team: null, line: 1.5, direction: "over" };
  if (id === "over-2.5") return { ...goals, kind: "total", team: null, line: 2.5, direction: "over" };
  if (id === "gg") return { ...goals, kind: "btts", yes: true };
  return null;
}

export function verdictOf(value) {
  if (value == null) return "pending";
  if (value > 0) return "won";
  if (value < 0) return "lost";
  return "push";
}

export function scoreFromPayload(match, kickoff, now = Date.now()) {
  if (!match || typeof match !== "object") return { final: false };
  if (["canceled", "cancelled", "postponed", "walkover", "retired", "disqualified"].some((key) => match[key])) return { final: true, void: true };
  const ft = match.periods?.ft || {};
  const home = num(ft.home);
  const away = num(ft.away);
  const start = Date.parse(kickoff);
  const final = home !== null && away !== null && Number.isFinite(start) && now >= start + 100 * 60 * 1000;
  return {
    final,
    home,
    away,
    htHome: num(match.periods?.p1?.home),
    htAway: num(match.periods?.p1?.away),
  };
}

function settleTip(tip, score, now) {
  if (!tip) return;
  if (!score?.final) {
    tip.settlement = { verdict: "pending", at: now, live: true };
    return;
  }
  if (score.void) {
    tip.settlement = { verdict: "void", at: now };
    return;
  }
  const value = grade(tip.compiled, score);
  tip.settlement = {
    verdict: verdictOf(value),
    home: score.home,
    away: score.away,
    at: now,
    value,
  };
}

export function applyScore(match, score, now = Date.now()) {
  if (!match || !score) return match;
  const tips = [match.tip, ...(match.categoryTips || [])].filter(Boolean);
  const seen = new Set();
  for (const tip of tips) {
    if (seen.has(tip)) continue;
    seen.add(tip);
    settleTip(tip, score, now);
  }
  const compiled = htftCompiled(match.htft?.pick);
  if (match.htft?.pick && compiled) {
    if (!score.final) match.htft.settlement = { verdict: "pending", at: now, live: true };
    else if (score.void) match.htft.settlement = { verdict: "void", at: now };
    else {
      const value = grade(compiled, score);
      match.htft.settlement = { verdict: verdictOf(value), home: score.home, away: score.away, at: now, value };
    }
  }
  return match;
}

export function toneOf(settlement) {
  return settlement?.verdict === "won" || settlement?.verdict === "lost" || settlement?.verdict === "push" ? settlement.verdict : "";
}

export function resultLabel(settlement) {
  if (!settlement) return "";
  if (settlement.verdict === "pending" && settlement.live) return "Live";
  if (settlement.verdict === "void") return "Void";
  if (!["won", "lost", "push"].includes(settlement.verdict)) return "";
  const word = settlement.verdict === "won" ? "Won" : settlement.verdict === "lost" ? "Lost" : "Push";
  return Number.isFinite(settlement.home) && Number.isFinite(settlement.away) ? `${word} ${settlement.home}-${settlement.away}` : word;
}

async function fetchScore(id, kickoff) {
  const response = await fetch(`https://stats.fn.sportradar.com/sportybet/en/Etc:UTC/gismo/stats_match_get/${id}`, { cache: "no-store" });
  if (!response.ok) throw new Error(`Score request failed (${response.status})`);
  const body = await response.json();
  const doc = body?.doc?.[0];
  if (!doc?.data || doc.event === "exception") throw new Error("Score unavailable");
  return scoreFromPayload(doc.data, kickoff);
}

export function loadScore(match) {
  const id = String(match?.id || "").split(":").pop();
  const kickoff = match?.kickoff;
  if (!id || !kickoff || Date.parse(kickoff) > Date.now()) return Promise.resolve(null);
  const hit = cache.get(id);
  if (hit && (hit.final || Date.now() - hit.at < 45000)) return Promise.resolve(hit.score);
  const job = fetchScore(id, kickoff).then((score) => {
    cache.set(id, { score, final: Boolean(score.final), at: Date.now() });
    return score;
  }).catch((error) => {
    cache.delete(id);
    throw error;
  });
  return job;
}

export async function settleMatches(matches, limit = 4) {
  const jobs = (matches || []).filter((match) => match?.tip && Date.parse(match.kickoff) <= Date.now());
  let index = 0;
  async function worker() {
    while (index < jobs.length) {
      const match = jobs[index++];
      try {
        const score = await loadScore(match);
        if (score) applyScore(match, score);
      } catch {
        if (match.tip && !match.tip.settlement) match.tip.settlement = { verdict: "pending", at: Date.now(), live: true };
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, jobs.length) }, worker));
  return jobs;
}
