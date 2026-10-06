import { resultLabel, settleMatches, toneOf } from "./settle.js";
import { badgeHtml, bindBadges } from "./badges.js";
const $ = (id) => document.getElementById(id);
const AMP = "&" + "amp;";
const LT = "&" + "lt;";
const GT = "&" + "gt;";
const QUOT = "&" + "quot;";
const APOS = "&" + "#39;";
const esc = (v) => String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": AMP, "<": LT, ">": GT, '"': QUOT, "'": APOS }[c]));
const models = ["shortlist", "htft", "banker"];
const openedModel = models.includes(location.hash.slice(1)) ? location.hash.slice(1) : "shortlist";
const state = { index: null, board: null, date: null, request: 0, mode: "board", model: openedModel, matchId: null, whyKey: null };
const STOP = new Set(["fc","cf","cd","sc","ac","afc","wfc","fk","sk","bk","if","de","da","do","del","la","el","the","of","and","w","women","club"]);

function wordsOf(name) {
  return String(name).normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^A-Za-z\s-]/g, " ").split(/[\s-]+/).filter((word) => word && !STOP.has(word.toLowerCase()));
}
function teamCode(name) {
  const words = wordsOf(name);
  if (!words.length) return "---";
  if (words.length === 1) return words[0].slice(0, 3).toUpperCase();
  if (words.length === 2) return (words[0].slice(0, 2) + words[1][0]).toUpperCase();
  return words.slice(0, 3).map((word) => word[0]).join("").toUpperCase();
}
function placeName(name) {
  const words = wordsOf(name);
  return words.length ? words.join(" ") : String(name);
}
function fitPlace(place) {
  const max = 24;
  if (place.length <= max) return place;
  const cut = place.slice(0, max);
  const last = cut.lastIndexOf(" ");
  return `${(last > 8 ? cut.slice(0, last) : cut).trim()}…`;
}
function clipPlace(name) {
  const place = placeName(name);
  return place.length > 16 ? `${place.slice(0, 15).trim()}…` : place;
}
function clock(iso) {
  return new Date(iso).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", hourCycle: "h23", timeZone: "UTC" });
}
function dayCode(isoDate) {
  return new Date(`${isoDate}T12:00:00Z`).toLocaleDateString("en-GB", { weekday: "short", timeZone: "UTC" }).slice(0, 3).toUpperCase();
}
function dayPlace(isoDate) {
  return new Date(`${isoDate}T12:00:00Z`).toLocaleDateString("en-GB", { day: "numeric", month: "long", timeZone: "UTC" });
}
function pct(value) { return Number.isFinite(value) ? `${Math.round(value * 100)}%` : "—"; }
function oddsText(value) { return Number.isFinite(value) ? value.toFixed(2) : "—"; }
function clip(value, max) {
  const clean = String(value).replace(/\s+/g, " ").trim();
  return clean.length > max ? `${clean.slice(0, max - 1).trim()}…` : clean;
}
function marketLines(market) {
  const clean = String(market).replace(/both teams to score/gi, "BTTS").replace(/gg\/ng/gi, "GG").replace(/over\/under/gi, "Total").replace(/\s+/g, " ").trim();
  const parts = clean.split(/\s[-–/]\s/);
  if (parts.length >= 2) return [clip(parts[0], 18), clip(parts.slice(1).join(" "), 18)];
  const words = clean.split(" ");
  if (words.length < 2) return [clip(clean, 18), ""];
  const mid = Math.ceil(words.length / 2);
  return [clip(words.slice(0, mid).join(" "), 18), clip(words.slice(mid).join(" "), 18)];
}
function carrier(tip) {
  const selection = String(tip.selection || "").trim();
  if (/^(yes|no)$/i.test(selection)) return `${selection} · ${marketLines(tip.market)[0]}`;
  return selection;
}
async function get(path) {
  const response = await fetch(`${path}?t=${Date.now()}`, { cache: "no-store" });
  if (!response.ok) throw new Error(`Data request failed (${response.status})`);
  return response.json();
}
function effective(match) {
  if (!match.tip || !state.board) return match;
  const min = state.board.policy?.minimumOdds ?? 1.2;
  const maxOdds = state.board.policy?.maximumOdds ?? 1.5;
  if (!Number.isFinite(match.tip.odds) || match.tip.odds < min || match.tip.odds > maxOdds) {
    return { ...match, tip: null, reasons: [`Odds must be between ${min.toFixed(2)} and ${maxOdds.toFixed(2)}.`] };
  }
  const started = Date.parse(match.kickoff) <= Date.now();
  return { ...match, started };
}
function fresh() {
  return Boolean(state.board?.generatedAt) && Date.now() - Date.parse(state.board.generatedAt) < 90 * 60000;
}
function matches() {
  return (state.board?.matches || []).map(effective);
}
function hasHtft(match) {
  return Boolean(match.htft?.pick);
}
function isBanker(match) {
  return Boolean(match.tip && hasHtft(match));
}
function visible() {
  const needle = $("search").value.trim().toLowerCase();
  const league = $("league").value;
  const skipped = $("show-skipped").checked && state.model === "shortlist";
  const rows = matches().filter((match) => {
    const shown = state.model === "htft" ? hasHtft(match) : state.model === "banker" ? isBanker(match) : Boolean(match.tip);
    if (!skipped && !shown) return false;
    if (league && match.league.id !== league) return false;
    if (!needle) return true;
    return `${match.home.name} ${match.away.name} ${match.league.name}`.toLowerCase().includes(needle);
  });
  const sort = $("sort").value;
  rows.sort((a, b) => sort === "kickoff" ? Date.parse(a.kickoff) - Date.parse(b.kickoff) : sort === "risk" ? (a.tip?.risk.score ?? 100) - (b.tip?.risk.score ?? 100) : sort === "value" ? (b.tip?.expectedReturn ?? -9) - (a.tip?.expectedReturn ?? -9) : (b.tip?.probability ?? -1) - (a.tip?.probability ?? -1));
  return rows;
}
function current() {
  const pool = matches();
  if (state.matchId) return pool.find((match) => match.id === state.matchId) || null;
  return null;
}
function orderedTips(match) {
  const rest = (match.categoryTips || []).filter((tip) => tip.id !== match.tip?.id).sort((a, b) => b.probability - a.probability);
  return match.tip ? [match.tip, ...rest].slice(0, 5) : rest.slice(0, 5);
}
function ticket(top, air, price, attrs, dim = false, tone = "") {
  const toneClass = tone ? ` ${tone}` : "";
  return `<button type="button" class="ticket${dim ? " dim" : ""}${toneClass}" ${attrs}><div class="ticket-top">${top}</div><div class="ticket-bot"><p class="t-air">${air}</p><p class="t-price">${price}</p></div></button>`;
}
function side(big, sub, end = false) {
  return `<div class="${end ? "t-end" : ""}"><p class="t-big">${big}</p><p class="t-sub">${sub}</p></div>`;
}
function teamSide(team, league, end = false) {
  return side(badgeHtml(team, league) || esc(teamCode(team.name)), esc(clipPlace(team.name)), end);
}
function matchTicket(match) {
  if (!match.tip) {
    return ticket(
      `${teamSide(match.home, match.league)}<p class="t-mid">${esc(clock(match.kickoff))}<br>Unavailable</p>${teamSide(match.away, match.league, true)}`,
      esc(match.reasons?.[0] || "Unavailable"),
      "—",
      `data-open="${esc(match.id)}"`,
      true,
    );
  }
  const label = resultLabel(match.tip.settlement);
  const scored = label && label !== "Live";
  const [line] = marketLines(match.tip.market);
  return ticket(
    `${teamSide(match.home, match.league)}<p class="t-mid">${esc(scored ? label : label || clock(match.kickoff))}<br>${esc(scored ? "Full time" : line)}</p>${teamSide(match.away, match.league, true)}`,
    esc(label ? `${carrier(match.tip)} · ${label}` : carrier(match.tip)),
    esc(oddsText(match.tip.odds)),
    `data-open="${esc(match.id)}"`,
    false,
    toneOf(match.tip.settlement),
  );
}
function htftListTicket(match) {
  const pick = match.htft.pick;
  const label = resultLabel(match.htft.settlement);
  const scored = label && label !== "Live";
  const thin = !(Number(pick.s) >= 0.4) && !label;
  return ticket(
    `${teamSide(match.home, match.league)}<p class="t-mid">${esc(scored ? label : clock(match.kickoff))}<br>${esc(scored ? "Full time" : pick.label)}</p>${teamSide(match.away, match.league, true)}`,
    esc(`${pick.label}${label ? ` · ${label}` : thin ? " · thin read" : ""} · ${match.htft.route || "no combo"}`),
    esc(Number(pick.odds).toFixed(2)),
    `data-open="${esc(match.id)}" data-kind="htft"`,
    thin,
    toneOf(match.htft.settlement),
  );
}
function bankerListTicket(match) {
  const tip = match.tip;
  const pick = match.htft.pick;
  const label = resultLabel(tip.settlement) || resultLabel(match.htft.settlement);
  const scored = label && label !== "Live";
  return ticket(
    `${teamSide(match.home, match.league)}<p class="t-mid">${esc(scored ? label : clock(match.kickoff))}<br>Banker</p>${teamSide(match.away, match.league, true)}`,
    esc(`Shortlist ${tip.selection} ${oddsText(tip.odds)} · HT/FT ${pick.label} ${Number(pick.odds).toFixed(2)}`),
    esc(oddsText(tip.odds)),
    `data-open="${esc(match.id)}"`,
    false,
    toneOf(tip.settlement) || toneOf(match.htft.settlement),
  );
}
function listTicket(match) {
  if (state.model === "htft" && hasHtft(match)) return htftListTicket(match);
  if (state.model === "banker" && isBanker(match)) return bankerListTicket(match);
  return matchTicket(match);
}
function optionTicket(match, tip, index) {
  const [a, b] = marketLines(tip.market);
  const label = resultLabel(tip.settlement);
  return ticket(
    `${side(esc(clock(match.kickoff)), "Kickoff")}<p class="t-mid">${esc(label || a)}${!label && b ? `<br>${esc(b)}` : ""}</p>${side(esc(pct(tip.probability)), tip.probabilityBasis === "odds" ? "Implied odds" : "Model", true)}`,
    esc(label ? `${carrier(tip)} · ${label}` : carrier(tip)),
    esc(oddsText(tip.odds)),
    `data-why="${index}"`,
    false,
    toneOf(tip.settlement),
  );
}
function header() {
  const match = current();
  if (state.mode === "route" && match) {
    $("from-code").innerHTML = badgeHtml(match.home, match.league) || esc(teamCode(match.home.name));
    $("from-place").textContent = `, ${fitPlace(placeName(match.home.name))}`;
    $("to-code").innerHTML = badgeHtml(match.away, match.league) || esc(teamCode(match.away.name));
    $("to-place").textContent = `, ${fitPlace(placeName(match.away.name))}`;
    return;
  }
  if (state.model === "htft") {
    $("from-code").textContent = "HT";
    $("from-place").textContent = ", half-time";
    $("to-code").textContent = "FT";
    $("to-place").textContent = ", full-time";
    return;
  }
  if (state.model === "banker") {
    $("from-code").textContent = "BOTH";
    $("from-place").textContent = ", shortlist";
    $("to-code").textContent = "BOTH";
    $("to-place").textContent = ", HT/FT";
    return;
  }
  const league = $("league").selectedOptions[0];
  const date = state.board?.date || new Date().toISOString().slice(0, 10);
  $("from-code").textContent = $("league").value ? teamCode(league?.textContent || "League") : "ALL";
  $("from-place").textContent = `, ${league && $("league").value ? league.textContent : "Every league"}`;
  $("to-code").textContent = dayCode(date);
  $("to-place").textContent = `, ${dayPlace(date)}`;
}
function warn() {
  const board = state.board;
  if (!board) return "";
  if (!fresh() && board.generatedAt) return "Refresh overdue. Prices may be stale.";
  if (board.status === "pending" || board.status === "unavailable") return "Waiting for the Sportybet scan.";
  return board.diagnostics?.[0] || "";
}
let settling = false;
function render() {
  if (!state.board) return;
  header();
  paintModels();
  const warning = warn();
  $("note").hidden = !warning;
  $("note").textContent = warning;
  const rows = visible();
  const match = current();
  const labels = { shortlist: "Shortlist", htft: "HT/FT", banker: "Banker" };
  $("board-label").textContent = state.mode === "route" ? "Match" : labels[state.model] || "Shortlist";
  if (state.mode === "board") {
    if (!rows.length) {
      const filtered = Boolean($("search").value || $("league").value);
      const empty = state.model === "banker"
        ? ["No banker", "Both models have to select the same match."]
        : state.model === "htft"
          ? ["No HT/FT card", "The table model ran. Nothing cleared 1.20–1.50."]
          : [filtered ? "No matches for these filters" : "No matches qualify right now", filtered ? "Clear the team or league filter to see the shortlist." : "Open unavailable matches to see missing prices or data."];
      const action = state.model === "shortlist" ? `<button type="button" id="empty-action">${filtered ? "Clear filters" : "View unavailable"}</button>` : "";
      $("results").innerHTML = `<div class="empty"><h3>${empty[0]}</h3><p>${empty[1]}</p>${action}</div>`;
      if ($("empty-action")) $("empty-action").onclick = () => {
        if (filtered) { $("search").value = ""; $("league").value = ""; }
        else $("show-skipped").checked = true;
        render();
      };
    } else $("results").innerHTML = boardList(rows);
  } else if (!match) {
    $("results").innerHTML = `<div class="empty"><h3>Match unavailable</h3><p>This matchup is no longer on the board.</p></div>`;
  } else if (state.model === "htft" && hasHtft(match)) {
    $("results").innerHTML = htftListTicket(match);
  } else if (state.model === "banker" && isBanker(match)) {
    $("results").innerHTML = `${orderedTips(match).map((tip, index) => optionTicket(match, tip, index)).join("")}${htftListTicket(match)}`;
  } else if (!match.tip) {
    $("results").innerHTML = `<div class="empty"><h3>Unavailable</h3><p>${esc(match.reasons?.[0] || "This matchup did not clear the shortlist.")}</p></div>`;
  } else $("results").innerHTML = orderedTips(match).map((tip, index) => optionTicket(match, tip, index)).join("");
  $("jumps").innerHTML = rows.map((row) => `<button type="button" data-open="${esc(row.id)}"><span>${esc(teamCode(row.home.name))} — ${esc(teamCode(row.away.name))}<small> · ${esc(placeName(row.home.name))} v ${esc(placeName(row.away.name))}</small></span><strong>${row.tip ? esc(oddsText(row.tip.odds)) : row.htft?.pick ? Number(row.htft.pick.odds).toFixed(2) : "—"}</strong></button>`).join("");
  if (typeof state.whyKey === "number" && match?.tip) fillWhy(match, orderedTips(match)[state.whyKey]);
  else if (state.whyKey === "htft" && match && hasHtft(match)) showHtftWhy(match);
  syncBack();
  if (!settling) queueSettle();
}
function boardList(rows) {
  const now = Date.now();
  const upcoming = [];
  const settled = [];
  for (const row of rows) (Date.parse(row.kickoff) <= now ? settled : upcoming).push(row);
  settled.sort((a, b) => Date.parse(b.kickoff) - Date.parse(a.kickoff));
  const blocks = [];
  if (upcoming.length) blocks.push(upcoming.map(listTicket).join(""));
  if (settled.length) blocks.push(`<h3 class="group-label">Settled</h3>${settled.map(listTicket).join("")}`);
  return blocks.join("");
}
function paintModels() {
  const rows = matches();
  const counts = { shortlist: rows.filter((match) => match.tip).length, htft: rows.filter(hasHtft).length, banker: rows.filter(isBanker).length };
  document.querySelectorAll("[data-model]").forEach((button) => {
    button.classList.toggle("active", button.dataset.model === state.model);
    const small = button.querySelector("small");
    if (small) small.textContent = String(counts[button.dataset.model] ?? 0);
  });
}
function needsScore(match) {
  const kickoff = Date.parse(match?.kickoff || "");
  if (!Number.isFinite(kickoff) || kickoff > Date.now()) return false;
  const pending = (settlement) => !settlement || (settlement.verdict === "pending" && Date.now() - settlement.at > 45000);
  if (match.tip && pending(match.tip.settlement)) return true;
  return hasHtft(match) && pending(match.htft.settlement);
}
async function queueSettle() {
  const jobs = [];
  const seen = new Set();
  for (const match of state.board?.matches || []) {
    if (!needsScore(match) || seen.has(match.id)) continue;
    seen.add(match.id);
    jobs.push(match);
  }
  if (!jobs.length || settling) return;
  settling = true;
  try {
    await settleMatches(jobs);
  } finally {
    settling = false;
  }
  if (document.querySelector("#stamps button.active")) return;
  render();
}
function fillWhy(match, tip) {
  if (!tip) { $("why").hidden = true; state.whyKey = null; return; }
  const form = match.form || {};
  const letters = (sideName) => (form[sideName]?.form || []).slice(0, 5).map((letter) => `<span class="${esc(letter)}">${esc(letter)}</span>`).join("");
  $("why-body").innerHTML = `<p class="why-kicker">WHY THIS PICK</p><h2 class="route-line"><span class="code">${esc(oddsText(tip.odds))}</span><span class="place">, ${esc(carrier(tip))}</span></h2><p class="note">${esc(match.home.name)} v ${esc(match.away.name)}</p>${optionTicket(match, tip, 0).replace("data-why=\"0\"", "disabled")}<div class="stat-row"><div><strong>${esc(pct(tip.probability))}</strong><span>${tip.probabilityBasis === "odds" ? "Implied odds" : "Model chance"}</span></div><div><strong>${esc(tip.risk?.score ?? "—")}</strong><span>${esc(tip.risk?.label || "Open")} risk / 100</span></div></div><h3>Why this price</h3><ul>${(match.reasons?.length ? match.reasons : ["No extra matchup note."]).slice(0, 6).map((reason) => `<li>${esc(reason)}</li>`).join("")}</ul><h3>Form</h3><div class="stat-row"><div><strong>${esc(teamCode(match.home.name))}</strong><span>home form</span><div class="form-row">${letters("home")}</div></div><div><strong>${esc(teamCode(match.away.name))}</strong><span>away form</span><div class="form-row">${letters("away")}</div></div></div>${match.h2h?.games ? `<p>${match.h2h.games} recent meetings. Both teams scored in ${esc(pct(match.h2h.bttsRate))}. Over 2.5 in ${esc(pct(match.h2h.over25Rate))}.</p>` : ""}<h3>If the match goes wrong</h3>${tip.scenarios?.length ? `<div class="stat-row">${tip.scenarios.slice(0, 4).map((scenario) => `<div><strong>${esc(pct(scenario.survivalProbability))}</strong><span>${esc(scenario.label)}</span></div>`).join("")}</div>` : "<p>No extra failure scenario for this market.</p>"}<p class="fine">${Number.isFinite(tip.expectedReturn) ? `Estimated return ${tip.expectedReturn >= 0 ? "+" : ""}${(tip.expectedReturn * 100).toFixed(1)}% per unit.` : "Estimated return unavailable."} Sample ${esc(tip.sampleCount)}. ${esc(tip.method)}</p>`;
  $("why").hidden = false;
}
function showHtftWhy(match) {
  const card = match.htft;
  const pick = card?.pick;
  if (!pick) { $("why").hidden = true; state.whyKey = null; return; }
  const label = resultLabel(card.settlement);
  $("why-body").innerHTML = `<p class="why-kicker">HT/FT</p><h2 class="route-line"><span class="code">${Number(pick.odds).toFixed(2)}</span><span class="place">, ${esc(pick.label)}${label ? ` · ${esc(label)}` : ""}</span></h2><p class="note">${esc(match.home.name)} v ${esc(match.away.name)}</p><div class="stat-row"><div><strong>${esc(pct(pick.s))}</strong><span>Table support</span></div><div><strong>${esc(card.route || "no combo")}</strong><span>Route</span></div></div><p>Home win ${esc(pct(card.support?.homeWin))} · Draw ${esc(pct(card.support?.draw))} · Away win ${esc(pct(card.support?.awayWin))}</p><p>Over 1.5 ${esc(pct(card.support?.over15))} · GG ${esc(pct(card.support?.gg))} · Over 2.5 ${esc(pct(card.support?.over25))}</p><p class="fine">${esc(card.caveat || "Published only when the formula has an active Sportybet price from 1.20 to 1.50.")}</p>`;
  $("why").hidden = false;
}
function snapshot() {
  return { mode: state.mode, model: state.model, matchId: state.matchId, whyKey: state.whyKey, sheet: !$("sheet").hidden, date: state.date, root: false };
}
function publish(replace) {
  const data = snapshot();
  data.root = replace;
  history[replace ? "replaceState" : "pushState"](data, "", `#${state.model}`);
  syncBack();
}
function syncBack() {
  $("back").disabled = !history.state || history.state.root === true;
}
async function restore(saved) {
  if (!saved) return;
  state.mode = saved.mode || "board";
  state.model = models.includes(saved.model) ? saved.model : "shortlist";
  state.matchId = saved.matchId || null;
  state.whyKey = saved.whyKey ?? null;
  $("why").hidden = saved.whyKey == null;
  setSheet(Boolean(saved.sheet));
  if (saved.date && saved.date !== state.date) await selectDate(saved.date, { fromHistory: true });
  else render();
  syncBack();
}
function go(change) {
  change();
  publish(false);
  render();
}
function openMatch(id) {
  if (state.mode === "route" && state.matchId === id && state.whyKey == null && $("sheet").hidden) return;
  go(() => {
    state.matchId = id;
    state.mode = "route";
    state.whyKey = null;
    $("why").hidden = true;
    setSheet(false);
  });
}
function setModel(model) {
  if (!models.includes(model)) return;
  if (model === state.model && state.mode === "board" && state.whyKey == null && $("sheet").hidden) return;
  go(() => {
    state.model = model;
    state.mode = "board";
    state.matchId = null;
    state.whyKey = null;
    $("why").hidden = true;
    setSheet(false);
  });
}
function setSheet(open) {
  $("sheet").hidden = !open;
  $("menu").setAttribute("aria-expanded", String(open));
}
async function selectDate(date, { fromHistory = false } = {}) {
  const request = ++state.request;
  const first = !state.date;
  const changed = Boolean(state.date && state.date !== date);
  state.date = date;
  if (changed && !fromHistory) {
    state.mode = "board";
    state.matchId = null;
    state.whyKey = null;
    $("why").hidden = true;
    setSheet(false);
  }
  document.querySelectorAll("#dates button, #stamps button").forEach((button) => button.classList.toggle("active", button.dataset.date === date));
  if (first || changed) $("results").innerHTML = `<div class="empty"><h3>Loading matches…</h3></div>`;
  try {
    const board = await get(`./data/board-${date}.json`);
    if (request !== state.request) return;
    if (!Array.isArray(board.matches)) throw new Error("The board data is incomplete");
    state.board = board;
    $("statistics-source").textContent = `Statistics: ${board.statisticsSource || "Awaiting data"}`;
    $("updated").textContent = board.generatedAt ? `Updated ${new Date(board.generatedAt).toLocaleString()}` : "Awaiting first scan";
    const leagues = new Map(board.matches.map((match) => [match.league.id, match.league.name]));
    const selected = $("league").value;
    $("league").innerHTML = `<option value="">All leagues</option>${[...leagues].sort((a, b) => a[1].localeCompare(b[1])).map(([id, name]) => `<option value="${esc(id)}">${esc(name)}</option>`).join("")}`;
    if ([...leagues.keys()].includes(selected)) $("league").value = selected;
    $("market-download").hidden = board.status === "pending";
    $("market-download").href = `./data/markets-${date}.json`;
    render();
    if (!fromHistory && (first || changed)) publish(first);
  } catch (error) {
    if (request !== state.request) return;
    state.board = null;
    $("results").innerHTML = `<div class="empty"><h3>Unable to load this board</h3><p>${esc(error.message)}</p><button type="button" id="retry-date">Try again</button></div>`;
    $("retry-date").onclick = () => selectDate(date);
  }
}
async function load() {
  $("refresh").disabled = true;
  $("refresh-icon").classList.add("spin");
  try {
    state.index = await get("./data/index.json");
    const days = state.index.dates || [];
    if (!days.length) throw new Error("No dates have been published yet");
    $("dates").innerHTML = days.map((day) => `<button type="button" data-date="${esc(day.date)}">${esc(day.date)}<small> · ${day.qualified || 0} picks</small></button>`).join("");
    $("dates").querySelectorAll("button").forEach((button) => { button.onclick = () => selectDate(button.dataset.date); });
    const today = new Date().toISOString().slice(0, 10);
    await selectDate(days.some((day) => day.date === state.date) ? state.date : days.find((day) => day.date === today)?.date || days[0].date);
  } catch (error) {
    $("note").hidden = false;
    $("note").textContent = `The board could not be loaded: ${error.message}`;
    $("results").innerHTML = `<div class="empty"><h3>The board is temporarily unavailable</h3><p>Please refresh in a moment.</p></div>`;
  } finally {
    $("refresh").disabled = false;
    $("refresh-icon").classList.remove("spin");
  }
}
$("results").addEventListener("click", (event) => {
  const open = event.target.closest("[data-open]");
  if (open) {
    if (open.dataset.kind === "htft" && state.mode === "route") {
      go(() => { state.whyKey = "htft"; });
      return;
    }
    openMatch(open.dataset.open);
    return;
  }
  const why = event.target.closest("[data-why]");
  if (!why) return;
  go(() => { state.whyKey = Number(why.dataset.why); });
});
$("jumps").addEventListener("click", (event) => {
  const open = event.target.closest("[data-open]");
  if (open) openMatch(open.dataset.open);
});
$("back").onclick = () => { if (history.state && !history.state.root) history.back(); };
window.addEventListener("popstate", (event) => {
  if (event.state) restore(event.state);
  else syncBack();
});
document.querySelector(".models").addEventListener("click", (event) => {
  const button = event.target.closest("[data-model]");
  if (button) setModel(button.dataset.model);
});
$("menu").onclick = () => {
  if ($("sheet").hidden) go(() => setSheet(true));
  else if (history.state && !history.state.root) history.back();
};
$("sheet-close").onclick = () => { if (history.state && !history.state.root) history.back(); else setSheet(false); };
$("why-close").onclick = () => { if (history.state && !history.state.root) history.back(); else { $("why").hidden = true; state.whyKey = null; } };
$("swap").onclick = () => {
  const rows = visible();
  if (rows.length < 2) return;
  const index = Math.max(0, rows.findIndex((match) => match.id === state.matchId));
  const next = rows[(index + 1) % rows.length].id;
  if (state.mode !== "route") { openMatch(next); return; }
  state.matchId = next;
  state.whyKey = null;
  $("why").hidden = true;
  render();
};
for (const id of ["search", "league", "sort", "show-skipped"]) $(id).addEventListener(id === "search" ? "input" : "change", render);
$("refresh").onclick = () => load();
window.betynzSelectDate = (date) => selectDate(date);
window.betynzDate = () => state.date;
syncBack();
setInterval(render, 60000);
setInterval(() => { if (!document.hidden) load(); }, 5 * 60000);
load();
bindBadges();
