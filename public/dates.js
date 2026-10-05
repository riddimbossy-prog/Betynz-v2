const AMP = "&" + "amp;";
const LT = "&" + "lt;";
const GT = "&" + "gt;";
const QUOT = "&" + "quot;";
const APOS = "&" + "#39;";
const esc = (v) => String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": AMP, "<": LT, ">": GT, '"': QUOT, "'": APOS }[c]));
const root = document.getElementById("stamps");
async function index() { return fetch(`./data/index.json?t=${Date.now()}`).then((r) => r.json()); }
function mark(date) {
  root.querySelectorAll("button").forEach((item) => item.classList.toggle("active", item.dataset.date === date));
}
async function stamps() {
  if (!root) return;
  const data = await index();
  const days = data.dates || [];
  root.innerHTML = days.map((day) => `<button type="button" data-date="${esc(day.date)}">${esc(day.date.slice(8))}<small>${day.qualified || 0} picks</small></button>`).join("");
  root.querySelectorAll("button").forEach((button) => { button.onclick = () => window.betynzSelectDate?.(button.dataset.date); });
  mark(window.betynzDate?.() || "");
}
stamps();