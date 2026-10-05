import { resultLabel, settleMatches, toneOf } from "./settle.js";

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

function pct(value) {
  return Number.isFinite(value) ? `${Math.round(value * 100)}%` : "—";
}

function clock(iso) {
  return new Date(iso).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", hourCycle: "h23", timeZone: "UTC" });
}

function cards(matches) {
  return (matches || []).filter((match) => match.htft?.pick).sort((a, b) => Date.parse(a.kickoff) - Date.parse(b.kickoff));
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
  return `<button type="button" class="ticket${weak ? " dim" : ""}${tone ? ` ${tone}` : ""}" data-id="${esc(match.id)}"><div class="ticket-top"><div><p class="t-big">${esc(match.home.name.slice(0, 3).toUpperCase())}</p><p class="t-sub">${esc(match.home.name)}</p></div><p class="t-mid">${esc(clock(match.kickoff))}<br>${esc(match.league?.name || "League")}</p><div class="t-end"><p class="t-big">${esc(match.away.name.slice(0, 3).toUpperCase())}</p><p class="t-sub">${esc(match.away.name)}</p></div></div><div class="ticket-bot"><p class="t-air">${esc(air)}</p><p class="t-price">${Number(pick.odds).toFixed(2)}</p></div><p class="t-sub">Table support ${esc(pct(pick.s))} · ${esc(match.htft.route || "no combo")}</p></button>`;
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
  return `<p class="why-kicker">HT/FT CARD</p><h2 class="route-line"><span class="code">${Number(pick.odds).toFixed(2)}</span><span class="place">, ${esc(pick.label)}${label ? ` · ${esc(label)}` : ""}</span></h2><p class="note">${esc(match.home.name)} v ${esc(match.away.name)} · ${esc(match.league?.country || "")} ${esc(match.league?.name || "")}</p><div class="stat-row"><div><strong>${esc(pct(pick.s))}</strong><span>Table support</span></div><div><strong>${homeN}+${awayN}</strong><span>Home and away samples</span></div></div><h3>Nine counts</h3><p>Home column: ${esc(columnLine(card.home))}</p><p>Away column, in match codes: ${esc(columnLine(card.away))}</p><p>Home win ${pct(card.support?.homeWin)} · Draw ${pct(card.support?.draw)} · Away win ${pct(card.support?.awayWin)}</p><p>Over 1.5 ${pct(card.support?.over15)} · GG ${pct(card.support?.gg)} · Over 2.5 ${pct(card.support?.over25)}</p><p>Route: ${esc(card.route || "no combo")}. ${esc(card.caveat || "")}</p><p class="fine">${thin(match) ? "Thin read: the table supports this under 40%, so it is dimmed on the board. " : ""}Published only when the formula selection is an active price from 1.20 to 1.50. This is not a 1/1 scoreline call. Closed is not Under 2.5.</p>`;
}

function noteFor(day, rows, published) {
  const strong = published.filter((match) => !thin(match)).length;
  const weak = published.length - strong;
  const blocked = blockedCount(rows);
  if (!published.length && blocked > rows.length / 2) return `${day.date}: no card cleared. Most league tables were rate-limited on this scan.`;
  if (!published.length) return `${day.date}: no HT/FT card cleared 1.20–1.50.`;
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
      $("results").innerHTML = published.length
        ? published.map(ticket).join("")
        : `<div class="empty"><h3>No HT/FT card for ${esc(date.slice(8))}</h3><p>The formula ran. Nothing cleared an active 1.20–1.50 price.</p><a class="htft-nav" href="./index.html">Back to the shortlist</a></div>`;
    };
    paint();
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

$("results").addEventListener("click", (event) => {
  const button = event.target.closest("[data-id]");
  if (!button) return;
  const match = currentRows.find((row) => row.id === button.dataset.id);
  if (!match) return;
  $("why-body").innerHTML = detail(match);
  $("why").hidden = false;
});

$("why-close").onclick = () => { $("why").hidden = true; };

start().catch((error) => {
  $("note").textContent = error.message;
  $("results").innerHTML = `<div class="empty"><h3>The HT/FT board is unavailable</h3><p>${esc(error.message)}</p></div>`;
});
