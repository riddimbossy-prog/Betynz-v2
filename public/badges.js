const FLAGS = {
  england: "gb-eng", scotland: "gb-sct", wales: "gb-wls", "northern ireland": "gb-nir",
  ireland: "ie", "republic of ireland": "ie", spain: "es", italy: "it", germany: "de", france: "fr",
  netherlands: "nl", holland: "nl", "the netherlands": "nl", portugal: "pt", belgium: "be",
  turkey: "tr", turkiye: "tr", greece: "gr", brazil: "br", argentina: "ar", uruguay: "uy", paraguay: "py",
  chile: "cl", colombia: "co", peru: "pe", ecuador: "ec", bolivia: "bo", venezuela: "ve", mexico: "mx",
  usa: "us", "united states": "us", "united states of america": "us", canada: "ca", jamaica: "jm",
  "costa rica": "cr", panama: "pa", honduras: "hn", guatemala: "gt", "el salvador": "sv", nicaragua: "ni",
  "trinidad and tobago": "tt", haiti: "ht", cuba: "cu", "dominican republic": "do", "puerto rico": "pr",
  guadeloupe: "gp", martinique: "mq", "french guiana": "gf", "saint lucia": "lc", "st lucia": "lc",
  "antigua and barbuda": "ag", "saint kitts and nevis": "kn", barbados: "bb", suriname: "sr", guyana: "gy",
  curacao: "cw", "cape verde": "cv", "cabo verde": "cv",
  japan: "jp", "south korea": "kr", "korea republic": "kr", "republic of korea": "kr", "north korea": "kp", "korea dpr": "kp",
  china: "cn", "hong kong": "hk", "chinese taipei": "tw", taiwan: "tw", australia: "au", "new zealand": "nz",
  "saudi arabia": "sa", uae: "ae", "united arab emirates": "ae", qatar: "qa", iran: "ir", iraq: "iq", israel: "il",
  syria: "sy", lebanon: "lb", jordan: "jo", oman: "om", bahrain: "bh", kuwait: "kw",
  egypt: "eg", morocco: "ma", tunisia: "tn", algeria: "dz", nigeria: "ng", ghana: "gh", senegal: "sn", cameroon: "cm",
  "ivory coast": "ci", "cote d ivoire": "ci", "south africa": "za", kenya: "ke", uganda: "ug", tanzania: "tz",
  zambia: "zm", zimbabwe: "zw", angola: "ao", mozambique: "mz", mali: "ml", "burkina faso": "bf",
  "congo dr": "cd", "dr congo": "cd", drc: "cd", "democratic republic of the congo": "cd", congo: "cg",
  gabon: "ga", guinea: "gn", "equatorial guinea": "gq", "guinea bissau": "gw", togo: "tg", benin: "bj", niger: "ne",
  "sierra leone": "sl", liberia: "lr", gambia: "gm", "the gambia": "gm", namibia: "na", botswana: "bw", rwanda: "rw",
  libya: "ly", sudan: "sd", ethiopia: "et", madagascar: "mg", mauritius: "mu",
  sweden: "se", norway: "no", denmark: "dk", finland: "fi", iceland: "is", "faroe islands": "fo",
  poland: "pl", czechia: "cz", "czech republic": "cz", austria: "at", switzerland: "ch", romania: "ro",
  hungary: "hu", croatia: "hr", serbia: "rs", ukraine: "ua", russia: "ru", bulgaria: "bg", slovakia: "sk",
  slovenia: "si", "bosnia and herzegovina": "ba", bosnia: "ba", "north macedonia": "mk", macedonia: "mk",
  montenegro: "me", albania: "al", kosovo: "xk", cyprus: "cy", malta: "mt", luxembourg: "lu",
  georgia: "ge", armenia: "am", azerbaijan: "az", kazakhstan: "kz", uzbekistan: "uz", belarus: "by",
  moldova: "md", latvia: "lv", lithuania: "lt", estonia: "ee", andorra: "ad", "san marino": "sm",
  liechtenstein: "li", monaco: "mc", gibraltar: "gi",
  india: "in", indonesia: "id", thailand: "th", vietnam: "vn", malaysia: "my", singapore: "sg",
  philippines: "ph", bangladesh: "bd", pakistan: "pk",
};

const BLOCKED = new Set(["international", "world", "europe", "asia", "africa", "south america", "north america", "oceania", "concacaf", "uefa", "caf", "afc", "conmebol"]);

function normalize(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/\b(amateur|youth|women|olympic|u\d{2}|fc|cf|national team)\b/g, " ")
    .replace(/[^a-z ]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function isInternational(league) {
  return /international|world cup|nations league|european championship|copa america|africa cup|asian cup|olympic|friendly games/i.test(`${league?.country || ""} ${league?.name || ""}`);
}

export function flagCode(name) {
  const key = normalize(name);
  if (!key || BLOCKED.has(key)) return "";
  return FLAGS[key] || "";
}

function safeHttps(value) {
  const url = String(value || "").trim();
  return /^https:\/\/[^\s"'<>]+$/i.test(url) ? url : "";
}

export function badgeSrc(team, league) {
  const crest = safeHttps(team?.logo);
  const teamFlag = flagCode(team?.name);
  const countryFlag = flagCode(league?.country);
  if (isInternational(league)) return (teamFlag && flagUrl(teamFlag)) || (countryFlag && flagUrl(countryFlag)) || crest || "";
  return crest || (countryFlag && flagUrl(countryFlag)) || "";
}

function flagUrl(code) {
  return code ? `https://flagcdn.com/w80/${code}.png` : "";
}

function esc(value) {
  const AMP = "&" + "amp;";
  const LT = "&" + "lt;";
  const GT = "&" + "gt;";
  const QUOT = "&" + "quot;";
  const APOS = "&" + "#39;";
  return String(value ?? "").replace(/[&<>"']/g, (char) => ({ "&": AMP, "<": LT, ">": GT, '"': QUOT, "'": APOS }[char]));
}

function shortCode(name) {
  const words = normalize(name).split(" ").filter(Boolean);
  if (!words.length) return "";
  if (words.length === 1) return words[0].slice(0, 3).toUpperCase();
  return words.slice(0, 3).map((word) => word[0]).join("").toUpperCase();
}

export function badgeHtml(team, league) {
  const crest = isInternational(league) ? "" : safeHttps(team?.logo);
  const src = badgeSrc(team, league);
  if (!src) return "";
  const flag = flagUrl(flagCode(isInternational(league) ? team?.name : league?.country) || flagCode(team?.name));
  const fallback = crest && flag && flag !== src ? flag : "";
  return `<img class="crest" src="${esc(src)}" alt="" data-flag="${esc(fallback)}" data-code="${esc(shortCode(team?.name))}" width="48" height="48" loading="lazy" decoding="async">`;
}

let badgesBound = false;
export function bindBadges(root = document) {
  if (badgesBound) return;
  badgesBound = true;
  root.addEventListener("error", (event) => {
    const img = event.target;
    if (!(img instanceof HTMLImageElement) || !img.classList.contains("crest")) return;
    const next = img.dataset.flag;
    if (next) {
      img.dataset.flag = "";
      img.src = next;
      return;
    }
    const fallback = document.createElement("span");
    fallback.className = "crest-fallback";
    fallback.textContent = img.dataset.code || "";
    img.replaceWith(fallback);
  }, true);
}
