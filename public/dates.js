import { resultLabel, settleMatches, toneOf } from "./settle.js";
const AMP = "&" + "amp;";
const LT = "&" + "lt;";
const GT = "&" + "gt;";
const QUOT = "&" + "quot;";
const APOS = "&" + "#39;";
const esc = (v) => String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": AMP, "<": LT, ">": GT, '"': QUOT, "'": APOS }[c]));
const root = document.getElementById("stamps");
async function index() { return fetch(`./data/index.json?t=${Date.now()}`).then((r) => r.json()); }
function ticket(match) {
  const tip = match.tip;
  const htft = match.htft?.pick;
  const label = resultLabel(tip?.settlement);
  const scored = label && label !== "Live";
  const line = tip ? `${esc(tip.selection)} · ${esc(tip.market)}` : esc(match.reasons?.[0] || "No shortlist pick");
  const air = label && tip ? `${line} · ${esc(label)}` : line;
  const ht = htft ? `<p class="t-sub">HT/FT ${esc(htft.label)} ${Number(htft.odds).toFixed(2)}${resultLabel(match.htft?.settlement) ? ` · ${esc(resultLabel(match.htft.settlement))}` : ""}</p>` : `<p class="t-sub">HT/FT no pick</p>`;
  const mid = scored ? esc(label) : esc((match.kickoff || "").slice(11, 16));
  const tone = toneOf(tip?.settlement);
  return `<button type="button" class="ticket${tip ? "" : " dim"}${tone ? ` ${tone}` : ""}" data-open="${esc(match.id)}"><div class="ticket-top"><div><p class="t-big">${esc(match.home.name.slice(0, 3).toUpperCase())}</p><p class="t-sub">${esc(match.home.name)}</p></div><p class="t-mid">${mid}${scored ? "<br>Full time" : ""}</p><div class="t-end"><p class="t-big">${esc(match.away.name.slice(0, 3).toUpperCase())}</p><p class="t-sub">${esc(match.away.name)}</p></div></div><div class="ticket-bot"><p class="t-air">${air}</p><p class="t-price">${tip ? Number(tip.odds).toFixed(2) : "—"}</p></div>${ht}</button>`;
}
let stampDate = "";
async function openDate(date, button) {
  stampDate = date;
  root.querySelectorAll("button").forEach((item) => item.classList.toggle("active", item === button));
  const results = document.getElementById("results");
  results.innerHTML = `<div class="empty"><h3>Loading ${esc(date)}</h3></div>`;
  const board = await fetch(`./data/board-${date}.json?t=${Date.now()}`).then((r) => r.json());
  const rows = (board.matches || []).filter((match) => match.tip || match.htft);
  const paint = () => { if (stampDate === date) results.innerHTML = rows.length ? rows.map(ticket).join("") : `<div class="empty"><h3>No predictions for ${esc(date)}</h3><p>Both models ran. Nothing cleared the 1.20–1.50 gate.</p></div>`; };
  paint();
  await settleMatches(rows);
  paint();
}
async function stamps() {
  if (!root) return;
  const data = await index();
  const days = data.dates || [];
  root.innerHTML = days.map((day) => `<button type="button" data-date="${esc(day.date)}">${esc(day.date.slice(8))}<small>${day.qualified || 0} picks</small></button>`).join("");
  root.querySelectorAll("button").forEach((button) => { button.onclick = () => openDate(button.dataset.date, button); });
}
stamps();
