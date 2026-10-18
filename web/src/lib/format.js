// Formátování, názvy míst, odkazy na vyhledávače a lokální piny – sdílené všemi komponentami.
export const CITY = { PRG: "Praha", VIE: "Vídeň", BUD: "Budapešť", BRQ: "Brno", MUC: "Mnichov", BER: "Berlín", BKK: "Bangkok", DMK: "Bangkok (DMK)", HKT: "Phuket", CNX: "Chiang Mai", USM: "Ko Samui", KBV: "Krabi",
  IST: "Istanbul", SAW: "Istanbul (SAW)", DXB: "Dubaj", DOH: "Dauhá", AUH: "Abú Dhabí", ZRH: "Curych", HEL: "Helsinky", FRA: "Frankfurt", WAW: "Varšava", CDG: "Paříž", AMS: "Amsterdam", LHR: "Londýn", SIN: "Singapur", TPE: "Tchaj-pej", HKG: "Hongkong", PEK: "Peking", PVG: "Šanghaj", CAN: "Kanton", KUL: "Kuala Lumpur", MCT: "Maskat", CAI: "Káhira", ADD: "Addis Abeba", BAH: "Bahrajn", KWI: "Kuvajt", RUH: "Rijád", JED: "Džidda", TLV: "Tel Aviv", BOM: "Bombaj", DEL: "Dillí", CMB: "Kolombo", ALA: "Almaty", TAS: "Taškent", BEG: "Bělehrad", OTP: "Bukurešť", CPH: "Kodaň", ARN: "Stockholm", OSL: "Oslo", BRU: "Brusel", MXP: "Milán", FCO: "Řím", SHJ: "Šardžá" };
export const city = (c) => CITY[c] || c;
export const FROM = { PRG: "z Prahy", VIE: "z Vídně", BUD: "z Budapešti", BRQ: "z Brna", MUC: "z Mnichova", BER: "z Berlína" };
export const fromCity = (c) => FROM[c] || "z " + city(c);
export const MONTHS = ["", "leden", "únor", "březen", "duben", "květen", "červen", "červenec", "srpen", "září", "říjen", "listopad", "prosinec"];
export const WD = ["ne", "po", "út", "st", "čt", "pá", "so"];
export const LINK_NAMES = { google: "Google Flights", kiwi: "Kiwi.com", skyscanner: "Skyscanner", kayak: "Kayak", azair: "Azair", pelikan: "Pelikán", letuska: "Letuška" };

let CUR = "CZK";
export const setCurrency = (c) => { CUR = c || "CZK"; };
export const czk = (n) => n == null || !isFinite(n) ? "–" : Math.round(n).toLocaleString("cs-CZ") + (CUR === "CZK" ? " Kč" : " " + CUR);
export const kcs = (n) => n == null ? "–" : (n / 1000).toLocaleString("cs-CZ", { maximumFractionDigits: 1, minimumFractionDigits: 1 });
export const dur = (m) => m == null ? "–" : `${Math.floor(m / 60)} h ${String(m % 60).padStart(2, "0")} min`;
export const durShort = (m) => m == null ? "–" : (m % 60 ? `${Math.floor(m / 60)}h${String(m % 60).padStart(2, "0")}` : `${Math.floor(m / 60)} h`);
export const dcz = (iso) => { if (!iso) return "–"; const [y, m, d] = iso.slice(0, 10).split("-"); return `${+d}. ${+m}. ${y}`; };
export const dshort = (iso) => { if (!iso) return "–"; const [, m, d] = iso.slice(0, 10).split("-"); return `${+d}.${+m}.`; };
export const dday = (iso) => +iso.slice(8, 10);
export const tm = (iso) => iso ? iso.slice(11, 16) : "";
export const wd = (iso) => WD[new Date(iso + "T00:00:00Z").getUTCDay()];
export const addDays = (iso, n) => { const d = new Date(iso + "T00:00:00Z"); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
export const ago = (iso) => { const h = (Date.now() - new Date(iso).getTime()) / 36e5; return h < 1 ? "před chvílí" : h < 48 ? `před ${Math.round(h)} h` : `před ${Math.round(h / 24)} dny`; };
export const median = (arr) => { const a = arr.filter((x) => x != null).sort((x, y) => x - y); return a.length ? a[Math.floor(a.length / 2)] : null; };
export const sortBy = (arr, key, dir = 1) => [...arr].sort((a, b) => { const x = a[key] ?? Infinity, y = b[key] ?? Infinity; return (x < y ? -1 : x > y ? 1 : 0) * dir || a.price - b.price; });
export const routeName = (r) => { const [a, b] = r.split("→"); return `${city(a)} → ${city(b)}`; };
export const wkey = (o) => `${o.origin}|${o.destination}|${o.depart_date}|${o.return_date}`;
export const itinOf = (o) => ({ airlines: o.airlines || [], route: o.route, dep_time: o.legs && o.legs.length ? tm(o.legs[0].departure) : (o.dep_time || null) });

// ---- repo / GitHub issue pro piny
export const REPO = (() => { try { const h = location.hostname, m = h.match(/^([^.]+)\.github\.io$/); const seg = location.pathname.split("/").filter(Boolean)[0]; if (m && seg) return `${m[1]}/${seg}`; } catch (e) {} return "sypacc/thajland"; })();
export const issueUrl = (title, body, label) => `https://github.com/${REPO}/issues/new?${new URLSearchParams({ title, body, labels: label }).toString()}`;
export const watchIssue = (o, unwatch = false) => {
  const title = `${unwatch ? "unwatch" : "watch"}: ${o.origin}→${o.destination} ${o.depart_date} → ${o.return_date}`;
  const it = itinOf(o);
  const body = unwatch ? "Zrušit sledování tohoto letu." : `Sledovat tento let (${(it.airlines || []).join(", ")} · ${it.route} · odlet ${it.dep_time || "?"} · ${czk(o.price)}).\n\n\`\`\`json\n${JSON.stringify({ itin: it, price_at_add: o.price, note: "" })}\n\`\`\`\n\nStačí kliknout na „Submit new issue“. Robot let zapíše do watchlist.yaml a issue zavře.`;
  return issueUrl(title, body, "watch");
};

// ---- odkazy s předvyplněným termínem (stejná logika jako scanner/links.py)
const SLUG = { PRG: "prague-czechia", VIE: "vienna-austria", BUD: "budapest-hungary", BRQ: "brno-czechia", MUC: "munich-germany", BER: "berlin-germany", BKK: "bangkok-thailand", DMK: "bangkok-thailand", HKT: "phuket-thailand", CNX: "chiang-mai-thailand", USM: "ko-samui-thailand", KBV: "krabi-thailand" };
const ENAME = { PRG: "Prague", VIE: "Vienna", BUD: "Budapest", BRQ: "Brno", MUC: "Munich", BER: "Berlin", BKK: "Bangkok", DMK: "Bangkok", HKT: "Phuket", CNX: "Chiang Mai", USM: "Koh Samui", KBV: "Krabi" };
export const buildLinks = (o) => {
  const l = { google: (o.links || {}).google };
  const dep = o.depart_date, ret = o.return_date, yy = (d) => d.slice(2, 4) + d.slice(5, 7) + d.slice(8, 10);
  l.kiwi = `https://www.kiwi.com/cz/search/results/${SLUG[o.origin] || o.origin.toLowerCase()}/${SLUG[o.destination] || o.destination.toLowerCase()}/${dep}/${ret}?adults=1`;
  l.skyscanner = `https://www.skyscanner.cz/transport/lety/${o.origin.toLowerCase()}/${o.destination.toLowerCase()}/${yy(dep)}/${yy(ret)}/?adults=1&cabinclass=economy&rtn=1&preferdirects=false`;
  l.kayak = `https://www.kayak.com/flights/${o.origin}-${o.destination}/${dep}/${ret}/1adults?sort=bestflight_a`;
  const d1 = new Date(dep + "T00:00:00Z"), d2 = new Date(ret + "T00:00:00Z"), n = Math.round((d2 - d1) / 864e5);
  const cz = (d) => `${d.getUTCDate()}.${d.getUTCMonth() + 1}.${d.getUTCFullYear()}`;
  const az = { tp: 0, searchtype: "flexi", isOneway: "return", srcAirport: `${ENAME[o.origin] || o.origin} [${o.origin}]`, srcap0: o.origin, dstAirport: `${ENAME[o.destination] || o.destination} [${o.destination}]`, dstap0: o.destination, adults: 1, children: 0, infants: 0, minHourStay: "0:45", maxHourStay: "23:20", minHourOutbound: "0:00", maxHourOutbound: "24:00", minHourInbound: "0:00", maxHourInbound: "24:00", depdate: cz(d1), arrdate: cz(d2), minDaysStay: Math.max(1, n - 1), maxDaysStay: n + 1, nextday: 0, autoprice: "true", currency: "CZK", wizzxclub: "false", flyoneclub: "false", blueairbenefits: "false", megavolotea: "false", schengen: "false", transfer: "false", samedep: "true", samearr: "true", maxChng: 2, resultSubmit: "Search" };
  for (let i = 0; i < 7; i++) { az["dep" + i] = "true"; az["arr" + i] = "true"; }
  l.azair = "https://www.azair.eu/azfin.php?" + new URLSearchParams(az).toString();
  l.pelikan = "https://www.pelikan.cz/cs/letenky"; l.letuska = "https://www.letuska.cz/";
  return l;
};

// ---- lokální piny (jen v prohlížeči)
const LS_KEY = "thajland.pins";
export const loadPins = () => { try { return JSON.parse(localStorage.getItem(LS_KEY) || "[]"); } catch (e) { return []; } };
export const savePins = (p) => { try { localStorage.setItem(LS_KEY, JSON.stringify(p)); } catch (e) {} };

// ---- GitHub API přímo z prohlížeče (token uložený jen v localStorage) + čekající piny + toasty + motiv
const TOKEN_KEY = "thajland.ghToken", PENDING_KEY = "thajland.pendingWatch", THEME_KEY = "thajland.theme";
export const getToken = () => { try { return localStorage.getItem(TOKEN_KEY) || ""; } catch (e) { return ""; } };
export const setToken = (t) => { try { t ? localStorage.setItem(TOKEN_KEY, t.trim()) : localStorage.removeItem(TOKEN_KEY); } catch (e) {} };
export const tokenUrl = () => `https://github.com/settings/personal-access-tokens/new?name=thajland-dashboard&description=Piny+z+dashboardu+(Issues:+Read+and+write)&target_name=${REPO.split("/")[0]}`;
export async function ghRequest(path, { method = "GET", body } = {}) {
  const token = getToken();
  if (!token) throw new Error("no-token");
  const r = await fetch(`https://api.github.com/repos/${REPO}${path}`, { method, headers: { Authorization: `Bearer ${token}`, Accept: "application/vnd.github+json", "X-GitHub-Api-Version": "2022-11-28", ...(body ? { "Content-Type": "application/json" } : {}) }, body: body ? JSON.stringify(body) : undefined });
  if (r.status === 401) throw new Error("Token je neplatný nebo expiroval (401).");
  if (r.status === 403 || r.status === 404) throw new Error(`GitHub odmítl požadavek (${r.status}). Token potřebuje právo Issues: Read and write pro ${REPO}.`);
  if (!r.ok) throw new Error(`GitHub: HTTP ${r.status}`);
  return r.json();
}
export const testToken = () => ghRequest("?per_page=1").then((repo) => repo.full_name || REPO);
export function issuePayload(o, unwatch = false) {
  const it = itinOf(o);
  return {
    title: `${unwatch ? "unwatch" : "watch"}: ${o.origin}→${o.destination} ${o.depart_date} → ${o.return_date}`,
    body: unwatch ? "Zrušit sledování tohoto letu (z dashboardu)." : `Sledovat tento let (${(it.airlines || []).join(", ")} · ${it.route} · odlet ${it.dep_time || "?"} · ${czk(o.price)}).\n\n\`\`\`json\n${JSON.stringify({ itin: it, price_at_add: o.price, note: o.note || "" })}\n\`\`\`\n\nZaloženo z dashboardu.`,
    labels: ["watch"],
  };
}
export const createWatchIssue = (o, unwatch = false) => ghRequest("/issues", { method: "POST", body: issuePayload(o, unwatch) });
export const loadPending = () => { try { return JSON.parse(localStorage.getItem(PENDING_KEY) || "[]"); } catch (e) { return []; } };
export const savePending = (p) => { try { localStorage.setItem(PENDING_KEY, JSON.stringify(p)); } catch (e) {} try { window.dispatchEvent(new CustomEvent("thajland:pending", { detail: p })); } catch (e) {} };
export const toast = (message, kind = "info") => window.dispatchEvent(new CustomEvent("thajland:toast", { detail: { message, kind, id: Date.now() + Math.random() } }));
export const getTheme = () => { try { return localStorage.getItem(THEME_KEY) || "light"; } catch (e) { return "light"; } };
export const applyTheme = (t) => { try { localStorage.setItem(THEME_KEY, t); } catch (e) {} if (t === "auto") document.documentElement.removeAttribute("data-theme"); else document.documentElement.setAttribute("data-theme", t); };
