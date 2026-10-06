import { resultLabel, settleMatches, toneOf } from "./settle.js";
import { badgeHtml, bindBadges } from "./badges.js";

const AMP = "&" + "amp;";
const LT = "&" + "lt;";
const GT = "&" + "gt;";
const QUOT = "&" + "quot;";
const APOS = "&" + "#39;";
const esc = (value) => String(value ?? "").replace(/[&<>"']/g, (char) => ({ "&": AMP, "<": LT, ">": GT, '"': QUOT, "'": APOS }[char]));
const ROWS = ["1/1", "1/X", "1/2", "X/1", "X/X", "X/2", "2/1", "2/X", "2/2"];
const THIN = 0.4;

const $ = (id) => document.getElementById(id);
let activeDate = "";
let currentRows = [];
let status = "upcoming";
let repaint = () => {};

function phase(match, now = Date.now()) {
  const kickoff = Date.parse(match?.kickoff || "");
  if (!Number.isFinite(kickoff) || kickoff > now) return "upcoming";
  const settlement = match.htft?.settlement;
  if (settlement && ["won", "lost", "push", "void"].includes(settlement.verdict)) return "settled";
  return "live";
}

function pct(value) {
  return Number.isFinite(value) ? `${Math.round(value * 100)}%` : "—";
}

function clock(iso) {
  return new Date(iso).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", hourCycle: "h23", timeZone: "UTC" });
}

function cards(matches) {
  return (matches || []).filter((match) => Number(match.htft?.pick?.odds) >= 1.2).sort((a, b) => Date.parse(a.kickoff) - Date.parse(b.kickoff));
}

function thin(match) {
  return !(Number(match.htft.pick.s) >= THIN);
}

function blockedCount(matches) {
  return (matches || []).filter((match) => /429|rate/i.test(match.htft?.caveat || "")).length;
}

function ticket(match) {
  const pick = match.htft.pick;
  const label = resultLabel(match.htft.settlement);
  const tone = toneOf(match.htft.settlement);
  const weak = thin(match) && !tone;
  const air = `${pick.label}${label ? ` · ${label}` : weak ? " · thin read" : ""}`;
  const home = badgeHtml(match.home, match.league) || esc(match.home.name.slice(0, 3).toUpperCase());
  const away = badgeHtml(match.away, match.league) || esc(match.away.name.slice(0, 3).toUpperCase());
  return `<button type="button" class="ticket${weak ? " dim" : ""}${tone ? ` ${tone}` : ""}" data-id="${esc(match.id)}"><div class="ticket-top"><div><p class="t-big">${home}</p><p class="t-sub">${esc(match.home.name)}</p></div><p class="t-mid">${esc(clock(match.kickoff))}<br>${esc(match.league?.name || "League")}</p><div class="t-end"><p class="t-big">${away}</p><p class="t-sub">${esc(match.away.name)}</p></div></div><div class="ticket-bot"><p class="t-air">${esc(air)}</p><p class="t-price">${Number(pick.odds).toFixed(2)}</p></div><p class="t-sub">Surity ${esc(pct(pick.s))} · ${esc(match.htft.route || "no combo")}</p></button>`;
}

function columnLine(column) {
  return column ? ROWS.map((row) => `${row} ${column.counts?.[row] ?? 0}`).join(" · ") : "missing";
}

function detail(match) {
  const card = match.htft;
  const pick = card.pick;
  const label = resultLabel(card.settlement);
  const homeN = card.home?.N ?? 0;
  const awayN = card.away?.N ?? 0;
  return `<p class="why-kicker">HT/FT CARD</p><h2 class="route-line"><span class="code">${Number(pick.odds).toFixed(2)}</span><span class="place">, ${esc(pick.label)}${label ? ` · ${esc(label)}` : ""}</span></h2><p class="note">${esc(match.home.name)} v ${esc(match.away.name)} · ${esc(match.league?.country || "")} ${esc(match.league?.name || "")}</p><div class="stat-row"><div><strong>${esc(pct(pick.s))}</strong><span>Surity</span></div><div><strong>${homeN}+${awayN}</strong><span>Home and away samples</span></div></div><h3>Nine counts</h3><p>Home column: ${esc(columnLine(card.home))}</p><p>Away column, in match codes: ${esc(columnLine(card.away))}</p><p>Home win ${pct(card.support?.homeWin)} · Draw ${pct(card.support?.draw)} · Away win ${pct(card.support?.awayWin)}</p><p>Over 1.5 ${pct(card.support?.over15)} · GG ${pct(card.support?.gg)} · Over 2.5 ${pct(card.support?.over25)}</p><p>Route: ${esc(card.route || "no combo")}. ${esc(card.caveat || "")}</p><p class="fine">${thin(match) ? "Thin read: the table supports this under 40%, so it is dimmed on the board. " : ""}Published only when surity is 90 to 100 and the Sportybet price is at least 1.20. This is not a 1/1 scoreline call. Closed is not Under 2.5.</p>`;
}

function noteFor(day, rows, published) {
  const strong = published.filter((match) => !thin(match)).length;
  const weak = published.length - strong;
  const blocked = blockedCount(rows);
  if (!published.length && blocked > rows.length / 2) return `${day.date}: no card cleared. Most league tables were rate-limited on this scan.`;
  if (!published.length) return `${day.date}: no HT/FT card reached 90–100 surity.`;
  const thinNote = weak ? ` ${weak} ${weak === 1 ? "is a thin read" : "are thin reads"} under 40%.` : "";
  return `${published.length} card${published.length === 1 ? "" : "s"}. ${strong} supported at 40% or better.${thinNote} Kickoffs in UTC.`;
}

async function openDate(date, button, days) {
  activeDate = date;
  document.querySelectorAll("#stamps button").forEach((item) => item.classList.toggle("active", item === button));
  $("why").hidden = true;
  $("results").innerHTML = `<div class="empty"><h3>Loading ${esc(date)}</h3></div>`;
  try {
    const board = await fetch(`./data/board-${date}.json?t=${Date.now()}`).then((response) => {
      if (!response.ok) throw new Error("This date is not on the board yet");
      return response.json();
    });
    if (activeDate !== date) return;
    const rows = board.matches || [];
    const published = cards(rows);
    currentRows = published;
    const day = days.find((item) => item.date === date) || { date };
    $("note").textContent = noteFor(day, rows, published);
    const paint = () => {
      if (activeDate !== date) return;
      const counts = { upcoming: 0, live: 0, settled: 0 };
      for (const match of published) counts[phase(match)] += 1;
      document.querySelectorAll("#status [data-status]").forEach((button) => {
        button.classList.toggle("active", button.dataset.status === status);
        const small = button.querySelector("small");
        if (small) small.textContent = String(counts[button.dataset.status] ?? 0);
      });
      const rows = published.filter((match) => phase(match) === status);
      rows.sort((a, b) => status === "settled" ? Date.parse(b.kickoff) - Date.parse(a.kickoff) : Date.parse(a.kickoff) - Date.parse(b.kickoff));
      const copy = {
        upcoming: ["No upcoming cards", "Nothing left to kick off on this day."],
        live: ["No live cards", "Nothing is in play right now."],
        settled: ["No settled cards", "No full-time result on this day yet."],
      };
      $("results").innerHTML = rows.length
        ? rows.map(ticket).join("")
        : published.length
          ? `<div class="empty"><h3>${copy[status][0]}</h3><p>${copy[status][1]}</p></div>`
          : `<div class="empty"><h3>No HT/FT card for ${esc(date.slice(8))}</h3><p>The formula ran. Nothing reached 90–100 surity.</p><a class="htft-nav" href="./index.html">Back to the shortlist</a></div>`;
    };
    paint();
    repaint = paint;
    await settleMatches(published);
    paint();
  } catch (error) {
    if (activeDate !== date) return;
    currentRows = [];
    $("note").textContent = error.message;
    $("results").innerHTML = `<div class="empty"><h3>Could not load ${esc(date)}</h3><p>${esc(error.message)}</p></div>`;
  }
}

async function start() {
  const index = await fetch(`./data/index.json?t=${Date.now()}`).then((response) => response.json());
  const days = index.dates || [];
  $("stamps").innerHTML = days.map((day) => `<button type="button" data-date="${esc(day.date)}">${esc(day.date.slice(8))}<small>${day.htft || 0} htft</small></button>`).join("");
  const buttons = [...$("stamps").querySelectorAll("button")];
  buttons.forEach((button) => {
    button.onclick = () => openDate(button.dataset.date, button, days);
  });
  const today = new Date().toISOString().slice(0, 10);
  const first = buttons.find((button) => button.dataset.date === today) || buttons.find((button) => Number(button.querySelector("small")?.textContent) > 0) || buttons[0];
  if (first) await openDate(first.dataset.date, first, days);
  else {
    $("note").textContent = "No dates have been published yet.";
    $("results").innerHTML = `<div class="empty"><h3>No board yet</h3></div>`;
  }
}

document.getElementById("back").addEventListener("click", (event) => {
  if (!$("why").hidden) { event.preventDefault(); $("why").hidden = true; return; }
  if (history.length > 1) { event.preventDefault(); history.back(); }
});
$("results").addEventListener("click", (event) => {
  const button = event.target.closest("[data-id]");
  if (!button) return;
  const match = currentRows.find((row) => row.id === button.dataset.id);
  if (!match) return;
  $("why-body").innerHTML = detail(match);
  $("why").hidden = false;
});

$("why-close").onclick = () => { $("why").hidden = true; };
$("status").addEventListener("click", (event) => {
  const button = event.target.closest("[data-status]");
  if (!button || button.dataset.status === status) return;
  status = button.dataset.status;
  repaint();
});
bindBadges();

start().catch((error) => {
  $("note").textContent = error.message;
  $("results").innerHTML = `<div class="empty"><h3>The HT/FT board is unavailable</h3><p>${esc(error.message)}</p></div>`;
});
