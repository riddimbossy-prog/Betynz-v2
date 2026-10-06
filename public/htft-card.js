import { resultLabel, settleMatches, toneOf } from "./settle.js";
const AMP = "&" + "amp;";
const LT = "&" + "lt;";
const GT = "&" + "gt;";
const QUOT = "&" + "quot;";
const APOS = "&" + "#39;";
const esc = (v) => String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": AMP, "<": LT, ">": GT, '"': QUOT, "'": APOS }[c]));
async function board() {
  const index = await fetch(`./data/index.json?t=${Date.now()}`).then((r) => r.json());
  const date = document.querySelector("#dates button.active")?.dataset.date || index.dates?.[0]?.date;
  if (!date) return null;
  return fetch(`./data/board-${date}.json?t=${Date.now()}`).then((r) => r.json());
}
function ticket(match) {
  const card = match.htft;
  if (!card) return "";
  const pick = card.pick;
  const label = resultLabel(card.settlement);
  const tone = toneOf(card.settlement);
  return `<button type="button" class="ticket${pick ? "" : " dim"}${tone ? ` ${tone}` : ""}" data-htft-card="1"><div class="ticket-top"><div><p class="t-big">HT</p><p class="t-sub">half</p></div><p class="t-mid">HT/FT<br>${esc(label || card.route || "no combo")}</p><div class="t-end"><p class="t-big">FT</p><p class="t-sub">full</p></div></div><div class="ticket-bot"><p class="t-air">${esc(pick ? pick.label : "No pick")}${label ? ` · ${esc(label)}` : ""}</p><p class="t-price">${pick ? Number(pick.odds).toFixed(2) : "\u2014"}</p></div></button>`;
}
function detail(match) {
  const card = match.htft;
  const rows = ["1/1","1/X","1/2","X/1","X/X","X/2","2/1","2/X","2/2"];
  const line = (column) => column ? rows.map((row) => `${row} ${column.counts[row]}`).join(" \u00b7 ") : "missing";
  const rate = (value) => Number.isFinite(value) ? `${Math.round(value * 100)}%` : "\u2014";
  const pick = card.pick;
  const label = resultLabel(card.settlement);
  return `<p class="why-kicker">HT/FT CARD</p><h2 class="route-line"><span class="code">${pick ? Number(pick.odds).toFixed(2) : "\u2014"}</span><span class="place">, ${esc(pick ? pick.label : "No pick")}${label ? ` · ${esc(label)}` : ""}</span></h2><p class="note">${esc(match.home.name)} v ${esc(match.away.name)}</p><h3>Nine counts</h3><p>Home column: ${esc(line(card.home))}</p><p>Away column, in match codes: ${esc(line(card.away))}</p><p>Home win ${rate(card.support?.homeWin)} \u00b7 Draw ${rate(card.support?.draw)} \u00b7 Away win ${rate(card.support?.awayWin)}</p><p>Over 1.5 ${rate(card.support?.over15)} \u00b7 GG ${rate(card.support?.gg)} \u00b7 Over 2.5 ${rate(card.support?.over25)}</p><p>Route: ${esc(card.route || "no combo")}. ${esc(card.caveat || "")}</p><p class="fine">Published only when surity is 90 to 100 and the selection has an active Sportybet price. Closed is not Under 2.5.</p>`;
}
let painting = false;
async function paint() {
  const results = document.getElementById("results");
  const why = document.getElementById("why-body");
  if (!results || painting || results.querySelector("[data-htft-card]")) return;
  if (!results.querySelector("[data-why]")) return;
  painting = true;
  try {
    const data = await board();
    const home = (document.getElementById("from-place")?.textContent || "").replace(/^,\s*/, "").toLowerCase();
    const away = (document.getElementById("to-place")?.textContent || "").replace(/^,\s*/, "").toLowerCase();
    const chosen = (data?.matches || []).find((row) => row.htft && home && away && row.home.name.toLowerCase().startsWith(home.slice(0, 6)) && row.away.name.toLowerCase().startsWith(away.slice(0, 6)));
    if (!chosen?.htft || results.querySelector("[data-htft-card]")) return;
    await settleMatches([chosen]);
    if (results.querySelector("[data-htft-card]")) return;
    results.insertAdjacentHTML("beforeend", ticket(chosen));
    results.querySelector("[data-htft-card]").onclick = () => {
      if (!why) return;
      why.innerHTML = detail(chosen);
      document.getElementById("why").hidden = false;
    };
  } finally {
    painting = false;
  }
}
new MutationObserver(() => paint()).observe(document.getElementById("results"), { childList: true });
