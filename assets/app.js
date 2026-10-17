/* Thajland dashboard – čistý JS; data z data/latest.js, data/series.js, data/alerts.js */
(function () {
  "use strict";
  const LATEST = window.THAJLAND_LATEST || null;
  const SERIES = window.THAJLAND_SERIES || { days: [] };
  const ALERTS = (window.THAJLAND_ALERTS && window.THAJLAND_ALERTS.alerts) || [];
  const REPO = (() => { try { const h = location.hostname, m = h.match(/^([^.]+)\.github\.io$/); const seg = location.pathname.split("/").filter(Boolean)[0]; if (m && seg) return `${m[1]}/${seg}`; } catch (e) {} return "sypacc/thajland"; })();
  const issueUrl = (title, body, label) => `https://github.com/${REPO}/issues/new?${new URLSearchParams({ title, body, labels: label }).toString()}`;
  const LS_KEY = "thajland.pins";
  const loadPins = () => { try { return JSON.parse(localStorage.getItem(LS_KEY) || "[]"); } catch (e) { return []; } };
  const savePins = (p) => { try { localStorage.setItem(LS_KEY, JSON.stringify(p)); } catch (e) {} };
  const $ = (s) => document.querySelector(s);
  const el = (tag, attrs, ...kids) => {
    const n = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs || {})) {
      if (v == null) continue;
      if (k === "class") n.className = v; else if (k === "html") n.innerHTML = v; else n.setAttribute(k, v);
    }
    for (const k of kids.flat()) if (k != null && k !== false) n.append(k.nodeType ? k : document.createTextNode(String(k)));
    return n;
  };
  const CUR = (LATEST && LATEST.config && LATEST.config.currency) || "CZK";
  const czk = (n) => n == null || !isFinite(n) ? "–" : Math.round(n).toLocaleString("cs-CZ") + (CUR === "CZK" ? " Kč" : " " + CUR);
  const kcs = (n) => n == null ? "–" : (n / 1000).toLocaleString("cs-CZ", { maximumFractionDigits: 1, minimumFractionDigits: 1 });
  const dur = (m) => m == null ? "–" : `${Math.floor(m / 60)} h ${String(m % 60).padStart(2, "0")} min`;
  const durShort = (m) => m == null ? "–" : (m % 60 ? `${Math.floor(m / 60)}h${String(m % 60).padStart(2, "0")}` : `${Math.floor(m / 60)} h`);
  const dcz = (iso) => { if (!iso) return "–"; const [y, m, d] = iso.slice(0, 10).split("-"); return `${+d}. ${+m}. ${y}`; };
  const dshort = (iso) => { const [, m, d] = iso.slice(0, 10).split("-"); return `${+d}.${+m}.`; };
  const dday = (iso) => +iso.slice(8, 10);
  const tm = (iso) => iso ? iso.slice(11, 16) : "";
  const WD = ["ne", "po", "út", "st", "čt", "pá", "so"];
  const MONTHS = ["", "leden", "únor", "březen", "duben", "květen", "červen", "červenec", "srpen", "září", "říjen", "listopad", "prosinec"];
  const wd = (iso) => WD[new Date(iso + "T00:00:00Z").getUTCDay()];
  const CITY = { PRG: "Praha", VIE: "Vídeň", BUD: "Budapešť", BRQ: "Brno", MUC: "Mnichov", BER: "Berlín", BKK: "Bangkok", DMK: "Bangkok (DMK)", HKT: "Phuket", CNX: "Chiang Mai", USM: "Ko Samui", KBV: "Krabi",
    IST: "Istanbul", DXB: "Dubaj", DOH: "Dauhá", AUH: "Abú Dhabí", ZRH: "Curych", HEL: "Helsinky", FRA: "Frankfurt", MUC2: "Mnichov", WAW: "Varšava", CDG: "Paříž", AMS: "Amsterdam", LHR: "Londýn", SIN: "Singapur", TPE: "Tchaj-pej", HKG: "Hongkong", PEK: "Peking", PVG: "Šanghaj", CAN: "Kanton", KUL: "Kuala Lumpur", MCT: "Maskat", CAI: "Káhira", ADD: "Addis Abeba", BAH: "Bahrajn", KWI: "Kuvajt", RUH: "Rijád", JED: "Džidda", TLV: "Tel Aviv", BOM: "Bombaj", DEL: "Dillí", CMB: "Kolombo", ALA: "Almaty", TAS: "Taškent", BEG: "Bělehrad", OTP: "Bukurešť", SAW: "Istanbul (SAW)", CPH: "Kodaň", ARN: "Stockholm", OSL: "Oslo", BRU: "Brusel", MXP: "Milán", FCO: "Řím", VIE2: "Vídeň" };
  const city = (c) => CITY[c] || c;
  const LINK_NAMES = { google: "Google Flights", kiwi: "Kiwi.com", skyscanner: "Skyscanner", kayak: "Kayak", azair: "Azair", pelikan: "Pelikán", letuska: "Letuška" };
  const FROM = { PRG: "z Prahy", VIE: "z Vídně", BUD: "z Budapešti", BRQ: "z Brna", MUC: "z Mnichova", BER: "z Berlína" };
  const fromCity = (c) => FROM[c] || "z " + city(c);
  const SLUG = { PRG: "prague-czechia", VIE: "vienna-austria", BUD: "budapest-hungary", BRQ: "brno-czechia", MUC: "munich-germany", BER: "berlin-germany", BKK: "bangkok-thailand", DMK: "bangkok-thailand", HKT: "phuket-thailand", CNX: "chiang-mai-thailand", USM: "ko-samui-thailand", KBV: "krabi-thailand" };
  const ENAME = { PRG: "Prague", VIE: "Vienna", BUD: "Budapest", BRQ: "Brno", MUC: "Munich", BER: "Berlin", BKK: "Bangkok", DMK: "Bangkok", HKT: "Phuket", CNX: "Chiang Mai", USM: "Koh Samui", KBV: "Krabi" };
  // odkazy s předvyplněným termínem (stejná logika jako scanner/links.py); v datech je jen Google (přesný dotaz)
  const buildLinks = (o) => {
    const l = { google: (o.links || {}).google };
    const dep = o.depart_date, ret = o.return_date, yy = (d) => d.slice(2, 4) + d.slice(5, 7) + d.slice(8, 10);
    l.kiwi = `https://www.kiwi.com/cz/search/results/${SLUG[o.origin] || o.origin.toLowerCase()}/${SLUG[o.destination] || o.destination.toLowerCase()}/${dep}/${ret}?adults=1`;
    l.skyscanner = `https://www.skyscanner.cz/transport/lety/${o.origin.toLowerCase()}/${o.destination.toLowerCase()}/${yy(dep)}/${yy(ret)}/?adults=1&cabinclass=economy&rtn=1&preferdirects=false`;
    l.kayak = `https://www.kayak.com/flights/${o.origin}-${o.destination}/${dep}/${ret}/1adults?sort=bestflight_a`;
    const d1 = new Date(dep + "T00:00:00Z"), d2 = new Date(ret + "T00:00:00Z"), n = Math.round((d2 - d1) / 864e5);
    const cz = (d) => `${d.getUTCDate()}.${d.getUTCMonth() + 1}.${d.getUTCFullYear()}`;
    const az = { tp: 0, searchtype: "flexi", isOneway: "return", srcAirport: `${ENAME[o.origin] || o.origin} [${o.origin}]`, srcap0: o.origin, dstAirport: `${ENAME[o.destination] || o.destination} [${o.destination}]`, dstap0: o.destination, adults: 1, children: 0, infants: 0, minHourStay: "0:45", maxHourStay: "23:20", minHourOutbound: "0:00", maxHourOutbound: "24:00", minHourInbound: "0:00", maxHourInbound: "24:00", depdate: cz(d1), arrdate: cz(d2), minDaysStay: Math.max(1, n - 1), maxDaysStay: n + 1, nextday: 0, autoprice: "true", currency: "CZK", wizzxclub: "false", flyoneclub: "false", blueairbenefits: "false", megavolotea: "false", schengen: "false", transfer: "false", samedep: "true", samearr: "true", maxChng: 2, isOneway2: undefined, resultSubmit: "Search" };
    for (let i = 0; i < 7; i++) { az["dep" + i] = "true"; az["arr" + i] = "true"; }
    delete az.isOneway2;
    l.azair = "https://www.azair.eu/azfin.php?" + new URLSearchParams(az).toString();
    l.pelikan = "https://www.pelikan.cz/cs/letenky"; l.letuska = "https://www.letuska.cz/";
    return l;
  };
  const SERIES_VARS = ["--s1", "--s2", "--s3", "--s4", "--s5", "--s6"];
  const cssVar = (v) => getComputedStyle(document.documentElement).getPropertyValue(v).trim();
  const median = (arr) => { const a = arr.filter((x) => x != null).sort((x, y) => x - y); return a.length ? a[Math.floor(a.length / 2)] : null; };
  const ago = (iso) => { const h = (Date.now() - new Date(iso).getTime()) / 36e5; return h < 1 ? "před chvílí" : h < 48 ? `před ${Math.round(h)} h` : `před ${Math.round(h / 24)} dny`; };

  // ---------- no data ----------
  if (!LATEST || !LATEST.offers) {
    $("#status").innerHTML = '<span class="warn">Zatím nejsou žádná data.</span> Spusť workflow „Sken letenek do Thajska“ v záložce Actions nebo počkej na ranní běh.';
    $("#verdict").append(el("div", { class: "main info" }, el("div", { class: "label" }, "Stav"), el("div", { class: "headline" }, "Čekáme na první sken"), el("div", { class: "sub" }, "Po prvním běhu se tu objeví verdikt, nejlepší nabídky a kalendář cen.")));
    return;
  }

  const cfg = LATEST.config;
  const travelers = cfg.travelers || 1;
  const offers = LATEST.offers.map((o, i) => ({ ...o, _i: i, _month: +o.depart_date.slice(5, 7), _rk: `${o.origin}→${o.destination}`, links: buildLinks(o) }));
  const fresh = offers.filter((o) => !o.stale);
  const routeOrder = [];
  for (const o of cfg.origins) for (const d of cfg.destinations) routeOrder.push(`${o}→${d}`);
  const routeColor = (r) => { let i = routeOrder.indexOf(r); if (i < 0) { routeOrder.push(r); i = routeOrder.length - 1; } return cssVar(SERIES_VARS[i % SERIES_VARS.length]); };
  const routeName = (r) => { const [a, b] = r.split("→"); return `${city(a)} → ${city(b)}`; };
  const days = SERIES.days || [];
  const sortBy = (arr, key, dir = 1) => [...arr].sort((a, b) => { const x = a[key] ?? Infinity, y = b[key] ?? Infinity; return (x < y ? -1 : x > y ? 1 : 0) * dir || a.price - b.price; });

  // ---------- pokrytí termínů ----------
  const queries = LATEST.queries || [];
  const HORIZON = LATEST.booking_horizon || (() => { const d = new Date(LATEST.generated_at); d.setUTCDate(d.getUTCDate() + 329); return d.toISOString().slice(0, 10); })();
  const HORIZON_DAYS = Math.round((new Date(HORIZON + "T00:00:00Z") - new Date(LATEST.generated_at.slice(0, 10) + "T00:00:00Z")) / 864e5);
  const opensOn = (retIso) => { const d = new Date(retIso + "T00:00:00Z"); d.setUTCDate(d.getUTCDate() - HORIZON_DAYS); return d.toISOString().slice(0, 10); };
  const addDays = (iso, n) => { const d = new Date(iso + "T00:00:00Z"); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
  const byMonth = {};
  for (const q of queries) {
    const m = +q.depart_date.slice(5, 7);
    const b = (byMonth[m] ||= { total: 0, ok: 0, dates: new Set(), okDates: new Set() });
    b.total++; b.dates.add(q.depart_date);
    if (q.status === "ok" && q.count) { b.ok++; b.okDates.add(q.depart_date); }
  }
  const coverage = Object.entries(byMonth).map(([m, b]) => ({ month: +m, name: MONTHS[+m], dates: b.dates.size, okDates: b.okDates.size, total: b.total, ok: b.ok }));

  // ---------- status ----------
  {
    const s = LATEST.stats;
    const parts = [`Poslední sken <strong>${dcz(LATEST.generated_at)} ${tm(LATEST.generated_at)} UTC</strong> (${ago(LATEST.generated_at)})`,
      `<span class="${s.queries_ok ? "ok" : "bad"}">${s.queries_ok} termínů s nabídkou</span> z ${s.queries_total} dotazů`,
      `${s.offers} nabídek`, `historie ${days.length} ${days.length === 1 ? "den" : days.length < 5 ? "dny" : "dní"}`];
    if (s.queries_stale) parts.push(`<span class="warn">${s.queries_stale} termínů převzato ze staršího běhu</span>`);
    if (s.google_disabled) parts.push('<span class="bad">Google Flights blokoval dotazy – data jsou neúplná</span>');
    if (s.queries_error) parts.push(`<span class="warn">chyb: ${s.queries_error}</span>`);
    $("#status").innerHTML = parts.map((p) => `<span>${p}</span>`).join("");
  }

  // ---------- verdikt ----------
  const routeHistory = (r) => days.map((d) => (d.routes[r.replace("→", "-")] || {}).min ?? null);
  function routeVerdict(r) {
    const hist = routeHistory(r).filter((x) => x != null);
    const cur = Math.min(...fresh.filter((o) => o._rk === r).map((o) => o.price), Infinity);
    if (!isFinite(cur)) return { state: "none", label: "Google zatím nenabízí žádné spojení · hlídáme dál", cur: null, days: hist.length };
    const med = median(hist), allMin = hist.length ? Math.min(...hist) : cur;
    if (hist.length < 5) return { state: "info", label: `sbíráme data (${hist.length}/5 dní)`, cur, days: hist.length, med };
    if (cur <= allMin && cur <= med * 0.92) return { state: "good", label: `dobrá chvíle na nákup · ${Math.round((1 - cur / med) * 100)} % pod obvyklou cenou`, cur, days: hist.length, med };
    if (cur <= med * 1.03) return { state: "fair", label: "férová cena, sledujeme dál", cur, days: hist.length, med };
    return { state: "warn", label: `počkat · ${Math.round((cur / med - 1) * 100)} % nad obvyklou cenou`, cur, days: hist.length, med };
  }
  function renderVerdict() {
    const v = $("#verdict"); v.innerHTML = "";
    const best = sortBy(fresh.filter((o) => o.score != null), "score")[0];
    const cheapest = sortBy(fresh, "price")[0];
    const rv = routeOrder.map((r) => ({ r, ...routeVerdict(r) }));
    const states = rv.map((x) => x.state);
    let cls = "info", headline, sub;
    if (!best) {
      headline = "Dnes žádné nabídky"; sub = "Buď ještě není otevřený prodej, nebo sken selhal. Podrobnosti ve stavu skenu dole.";
    } else if (states.includes("good")) {
      cls = "good"; const g = rv.filter((x) => x.state === "good").map((x) => routeName(x.r)).join(", ");
      headline = `Dobrá chvíle na nákup: ${g}`; sub = "Cena je na historickém minimu a výrazně pod obvyklou úrovní. Ověř přes odkaz u nabídky a kupuj.";
    } else if (states.every((s) => s === "info" || s === "none")) {
      cls = "info"; headline = `Zatím sbíráme data · nejlepší nabídka ${czk(best.price)}/os`;
      sub = `Verdikt „kupovat / počkat“ dává smysl až po ~5 denních měřeních (máme ${days.length}). Do té doby ber ceny jako výchozí úroveň.`;
    } else if (states.includes("warn") && !states.includes("fair")) {
      cls = "warn"; headline = "Spíš počkat – ceny jsou nad obvyklou úrovní"; sub = "Historická minima byla níž. Hlášení přijde, jakmile cena spadne.";
    } else {
      cls = "info"; headline = `Férové ceny · nejlepší nabídka ${czk(best.price)}/os`; sub = "Nic abnormálně levného. Sledujeme dál, hlášení přijde při poklesu.";
    }
    const main = el("div", { class: "main " + cls },
      el("div", { class: "label" }, "Verdikt k " + dcz(LATEST.day)),
      el("div", { class: "headline" }, headline), el("div", { class: "sub" }, sub));
    if (best) main.append(el("div", { class: "sub" }, el("strong", null, "Nejlepší poměr: "), `${czk(best.price)}/os · ${routeName(best._rk)} · ${dshort(best.depart_date)}–${dshort(best.return_date)} · ${best.airlines.join(", ")} · ${best.stops === 0 ? "přímý" : best.stops + "× přestup"} · tam ${durShort(best.duration_min)}`));
    if (cheapest && best && cheapest.id !== best.id) main.append(el("div", { class: "sub" }, el("strong", null, "Nejlevnější: "), `${czk(cheapest.price)}/os · ${routeName(cheapest._rk)} · ${dshort(cheapest.depart_date)} · ${cheapest.airlines.join(", ")} · tam ${durShort(cheapest.duration_min)}`));
    v.append(main);
    const routes = el("div", { class: "routes" });
    rv.forEach((x) => routes.append(el("div", { class: "rv " + x.state },
      el("span", { class: "dot", style: `--c:${routeColor(x.r)}` }),
      el("div", null, el("span", { class: "name" }, routeName(x.r)), " ", el("span", { class: "price" }, x.cur != null ? czk(x.cur) : "–")),
      el("div", { class: "state" }, x.label + (x.med && x.days >= 5 ? ` · obvykle ${czk(x.med)}` : "")))));
    v.append(routes);
    const kp = el("div", { class: "routes" });
    const tile = (label, value, hint) => kp.append(el("div", { class: "kpi" }, el("div", { class: "label" }, label), el("div", { class: "value" }, value), el("div", { class: "hint" }, hint || "")));
    if (best) tile(`Pro ${travelers} os.`, czk(best.price * travelers), "nejlepší poměr × počet cestujících");
    const inWin = queries.filter((q) => !(q.beyond_horizon || q.return_date > HORIZON));
    const inWinDates = new Set(inWin.map((q) => q.depart_date)), inWinOk = new Set(inWin.filter((q) => q.status === "ok" && q.count).map((q) => q.depart_date));
    const allDates = new Set(queries.map((q) => q.depart_date));
    tile("Termíny v prodeji", `${inWinOk.size}/${inWinDates.size}`, `dnů odletu s nabídkou z těch, které už aerolinky prodávají · ${allDates.size - inWinDates.size} dnů čeká na otevření prodeje`);
    if (days.length >= 2) {
      const minOf = (d) => Math.min(...Object.values(d.routes).map((r) => r.min).filter((x) => x != null));
      const a = minOf(days[days.length - 2]), b = minOf(days[days.length - 1]);
      if (isFinite(a) && isFinite(b)) tile("Minimum vs. minule", (b - a > 0 ? "+" : "") + czk(b - a), `${czk(a)} → ${czk(b)}`);
    }
    v.append(kp);
  }

  // ---------- postřehy ----------
  function insights() {
    const out = [];
    if (!fresh.length) return out;
    // prodejní okno
    const minLen = Math.min(...(cfg.trip_lengths || [14])), maxLen = Math.max(...(cfg.trip_lengths || [14]));
    const lastDep = cfg.depart_to;
    if (addDays(lastDep, minLen) > HORIZON) {
      const firstHidden = (() => { let d = cfg.depart_from; while (addDays(d, minLen) <= HORIZON && d <= lastDep) d = addDays(d, 1); return d; })();
      out.push(`<strong>Prodejní okno:</strong> aerolinky prodávají ~${HORIZON_DAYS} dní dopředu, dnes tedy do návratu ${dcz(HORIZON)}. Odlety od ${dcz(firstHidden)} se objeví postupně: ${dcz(firstHidden)} ≈ ${dcz(opensOn(addDays(firstHidden, minLen)))}, poslední (${dcz(lastDep)}, ${maxLen} dní) ≈ ${dcz(opensOn(addDays(lastDep, maxLen)))}. Každý nově otevřený termín dostane hlášení „nově v prodeji“.`);
    }
    const minByKey = (keyFn) => { const m = {}; for (const o of fresh) { const k = keyFn(o); m[k] = Math.min(m[k] ?? Infinity, o.price); } return m; };
    // odkud: párové srovnání na stejných (cíl, odlet, délka)
    const origins = cfg.origins;
    if (origins.length >= 2) {
      const m = minByKey((o) => `${o.origin}|${o.destination}|${o.depart_date}|${o.nights}`);
      const diffs = [];
      for (const k of Object.keys(m)) if (k.startsWith(origins[0] + "|")) { const k2 = origins[1] + k.slice(origins[0].length); if (m[k2] != null && isFinite(m[k2])) diffs.push(m[k] - m[k2]); }
      if (diffs.length >= 3) { const d = median(diffs); const cap = (t) => t.charAt(0).toUpperCase() + t.slice(1); out.push(d > 500 ? `${cap(fromCity(origins[1]))} vychází stejný termín typicky o <strong>${czk(d)}</strong> levněji než ${fromCity(origins[0])} (${diffs.length} srovnání). K ceně připočti dopravu na letiště.` : d < -500 ? `${cap(fromCity(origins[0]))} je to typicky o <strong>${czk(-d)}</strong> levnější než ${fromCity(origins[1])}.` : `${city(origins[0])} a ${city(origins[1])} vycházejí cenově podobně (rozdíl do 500 Kč).`); }
    }
    // kam
    if (cfg.destinations.length >= 2) {
      const [a, b] = cfg.destinations;
      const m = minByKey((o) => `${o.destination}|${o.origin}|${o.depart_date}|${o.nights}`);
      const diffs = [];
      for (const k of Object.keys(m)) if (k.startsWith(a + "|")) { const k2 = b + k.slice(a.length); if (isFinite(m[k2] ?? NaN)) diffs.push(m[k2] - m[k]); }
      if (diffs.length >= 3) { const d = median(diffs); out.push(Math.abs(d) < 500 ? `${city(a)} i ${city(b)} stojí prakticky stejně.` : d > 0 ? `${city(b)} je oproti ${city(a)} dražší typicky o <strong>${czk(d)}</strong>; zvaž přílet do Bangkoku a vnitrostátní let.` : `${city(b)} vychází typicky o <strong>${czk(-d)}</strong> levněji než ${city(a)}.`); }
    }
    // nejlevnější týden odletu
    const byDate = minByKey((o) => o.depart_date);
    const dates = Object.keys(byDate).sort();
    if (dates.length >= 4) {
      const weeks = {};
      for (const d of dates) { const w = `${d.slice(5, 7)}-${Math.min(4, Math.ceil(dday(d) / 7))}`; (weeks[w] ||= []).push(byDate[d]); }
      const ranked = Object.entries(weeks).map(([w, v]) => [w, median(v)]).sort((x, y) => x[1] - y[1]);
      const [w, p] = ranked[0]; const [mm, wk] = w.split("-");
      const worst = ranked[ranked.length - 1];
      out.push(`Nejlevnější odlety: <strong>${wk}. týden ${MONTHS[+mm].replace("srpen", "srpna").replace("září", "září")}</strong> (medián ${czk(p)}); nejdražší ${worst[0].split("-")[1]}. týden ${MONTHS[+worst[0].split("-")[0]].replace("srpen", "srpna")} (${czk(worst[1])}).`);
    }
    // délka pobytu
    if (cfg.trip_lengths.length >= 2) {
      const m = minByKey((o) => `${o.nights}|${o.origin}|${o.destination}|${o.depart_date}`);
      const per = {}; for (const [k, v] of Object.entries(m)) { const n = k.split("|")[0]; (per[n] ||= []).push(v); }
      const meds = Object.entries(per).map(([n, v]) => [n, median(v)]).sort((x, y) => x[1] - y[1]);
      if (meds.length >= 2 && meds[meds.length - 1][1] - meds[0][1] > 400) out.push(`Délka pobytu <strong>${meds[0][0]} dní</strong> vychází nejlevněji (medián ${czk(meds[0][1])}), ${meds[meds.length - 1][0]} dní ${czk(meds[meds.length - 1][1])}.`);
      else if (meds.length >= 2) out.push("Délka pobytu 13/14/15 dní cenu prakticky nemění, vyber podle dovolené.");
    }
    // přímé lety / přestupy
    const direct = fresh.filter((o) => o.stops === 0);
    if (direct.length) out.push(`Přímý let existuje od <strong>${czk(Math.min(...direct.map((o) => o.price)))}</strong> (${[...new Set(direct.map((o) => o.airlines.join("/")))].join(", ")}).`);
    else out.push("Přímý let z Česka ani Vídně v nabídce není, počítej s jedním přestupem (typicky Istanbul, Dubaj nebo Dauhá).");
    // aerolinky s nejlepším skóre
    const top = sortBy(fresh.filter((o) => o.score != null), "score").slice(0, 10);
    if (top.length >= 5) { const c = {}; for (const o of top) for (const a of o.airlines) c[a] = (c[a] || 0) + 1; const [a, n] = Object.entries(c).sort((x, y) => y[1] - x[1])[0]; out.push(`V top 10 podle poměru cena/výkon je nejčastěji <strong>${a}</strong> (${n}×).`); }
    // trend
    if (days.length >= 3) {
      const minOf = (d) => Math.min(...Object.values(d.routes).map((r) => r.min).filter((x) => x != null));
      const first = minOf(days[Math.max(0, days.length - 8)]), last = minOf(days[days.length - 1]);
      if (isFinite(first) && isFinite(last)) { const pct = (last - first) / first * 100; out.push(Math.abs(pct) < 3 ? `Za posledních ${Math.min(7, days.length - 1)} dní je nejnižší cena stabilní (${czk(last)}).` : pct < 0 ? `Nejnižší cena za posledních ${Math.min(7, days.length - 1)} dní <strong>klesla o ${Math.abs(pct).toFixed(0)} %</strong> (${czk(first)} → ${czk(last)}).` : `Nejnižší cena za posledních ${Math.min(7, days.length - 1)} dní <strong>vzrostla o ${pct.toFixed(0)} %</strong> (${czk(first)} → ${czk(last)}).`); }
    }
    // nově v prodeji
    const newQ = queries.filter((q) => q.is_new);
    if (newQ.length) {
      const byR = {}; for (const q of newQ) (byR[`${q.origin}→${q.destination}`] ||= []).push(q);
      out.push(`<strong>Nově v prodeji od minula:</strong> ${Object.entries(byR).map(([r, qs]) => `${routeName(r)} ${[...new Set(qs.map((q) => q.depart_date))].length} dnů odletu (od ${czk(Math.min(...qs.map((q) => q.min_price)))})`).join("; ")}.`);
    }
    // trasy úplně bez nabídek
    for (const r of routeOrder) if (!fresh.some((o) => o._rk === r)) {
      const [o, d] = r.split("→");
      const alt = routeOrder.filter((x) => x !== r && fresh.some((q) => q._rk === x) && x.endsWith("→" + d)).map(routeName);
      out.push(`<strong>${routeName(r)}</strong>: Google pro tyto termíny zatím nenabízí žádné spojení (ani s přestupy). Sken to kontroluje denně${alt.length ? `; mezitím srovnej ${alt.join(" / ")}` : ""}${d === "HKT" ? " nebo let do Bangkoku a vnitrostátní přelet (≈ 1 500–3 000 Kč)" : ""}.`);
    }
    return out.slice(0, 9);
  }
  function renderInsights() {
    const box = $("#insights"); box.innerHTML = "";
    const items = insights();
    box.append(el("div", { class: "panel-head" }, el("h2", null, "Postřehy z dat"), el("span", { class: "muted small" }, "spočítané z posledního skenu a historie")));
    if (!items.length) { box.append(el("div", { class: "empty" }, "Postřehy se objeví, jakmile budou nabídky.")); return; }
    box.append(el("ul", null, items.map((t) => el("li", { html: t }))));
  }

  // ---------- společné prvky nabídky ----------
  function badges(o) {
    const b = [];
    b.push(el("span", { class: "badge " + (o.stops === 0 ? "good" : o.stops >= 2 ? "warn" : "") }, o.stops === 0 ? "přímý let" : o.stops === 1 ? "1 přestup" : `${o.stops} přestupy`));
    if (o.watched) b.push(el("span", { class: "badge good" }, "★ sledováno"));
    if (o.is_new_route) b.push(el("span", { class: "badge good" }, "nová trasa v prodeji"));
    else if (o.is_new) b.push(el("span", { class: "badge good" }, "nově v prodeji"));
    if (o.is_all_time_low) b.push(el("span", { class: "badge good" }, "nejnižší cena dosud"));
    if (o.yesterday_min != null && o.price < o.yesterday_min) b.push(el("span", { class: "badge good" }, `↓ ${czk(o.yesterday_min - o.price)} od minula`));
    if (o.yesterday_min != null && o.price > o.yesterday_min) b.push(el("span", { class: "badge bad" }, `↑ ${czk(o.price - o.yesterday_min)} od minula`));
    const longLay = (o.layovers || []).find((l) => l.minutes > 300);
    if (longLay) b.push(el("span", { class: "badge warn" }, `dlouhý přestup ${city(longLay.airport)} ${durShort(longLay.minutes)}`));
    const shortLay = (o.layovers || []).find((l) => l.minutes > 0 && l.minutes < 60);
    if (shortLay) b.push(el("span", { class: "badge bad" }, `krátký přestup ${durShort(shortLay.minutes)}`));
    if (o.duration_min && o.duration_min <= 840) b.push(el("span", { class: "badge good" }, "rychlá cesta"));
    if (o.price_insight && o.price_insight.level) {
      const pi = o.price_insight; const lvl = pi.level;
      b.push(el("span", { class: "badge " + (lvl === "nízká" ? "good" : lvl === "vysoká" ? "bad" : ""), title: "Odhad Google Flights: jak si tato cena stojí proti obvyklému rozpětí pro tento termín" },
        `Google: ${lvl} cena${pi.low && pi.high ? ` (obvykle ${kcs(pi.low)}–${kcs(pi.high)} tis.)` : ""}`));
    }
    if (o.stale) b.push(el("span", { class: "badge warn" }, `starší data (${dshort(o.fetched_at || LATEST.generated_at)})`));
    return el("div", { class: "badges" }, b);
  }
  function timeline(o) {
    if (!o.legs || !o.legs.length) return null;
    const total = o.duration_min || o.legs.reduce((a, l) => a + l.duration_min, 0);
    const bar = el("div", { class: "tl", title: `cesta tam ${dur(total)}` });
    o.legs.forEach((l, i) => {
      bar.append(el("span", { class: "leg", style: `flex:${l.duration_min}`, title: `${l.from_airport}→${l.to_airport} ${dur(l.duration_min)}` }));
      const lay = o.layovers && o.layovers[i];
      if (lay) bar.append(el("span", { class: "lay" + (lay.minutes > 300 ? " long" : lay.minutes < 60 ? " short" : ""), style: `flex:${Math.max(lay.minutes, 20)}`, title: `přestup ${city(lay.airport)} ${dur(lay.minutes)}` }));
    });
    const first = o.legs[0], last = o.legs[o.legs.length - 1];
    const mid = (o.layovers || []).map((l) => `${city(l.airport)} ${durShort(l.minutes)}`).join(" · ");
    const labels = el("div", { class: "tl-labels" },
      el("span", null, el("b", null, tm(first.departure)), ` ${first.from_airport}`),
      el("span", { class: "muted" }, mid || "přímo", ` · celkem ${durShort(total)}`),
      el("span", null, el("b", null, tm(last.arrival)), ` ${last.to_airport}`, last.arrival.slice(0, 10) !== first.departure.slice(0, 10) ? " +1" : ""));
    return el("div", null, bar, labels);
  }
  const why = (o) => {
    const b = o.score_breakdown || {}; const parts = [];
    if (b.stops < 0) parts.push("bonus za přímý let"); if (b.stops > 0) parts.push(`+${czk(b.stops)} za přestupy navíc`);
    if (b.duration > 0) parts.push(`+${czk(b.duration)} za čas nad 14 h`); if (b.layover > 0) parts.push(`+${czk(b.layover)} za přestupy`);
    if (b.airline < 0) parts.push(`−${czk(-b.airline)} bonus aerolinka`); if (b.airline > 0) parts.push(`+${czk(b.airline)} malus aerolinka`);
    return `Skóre ${czk(o.score)}: cena ${czk(o.price)}${parts.length ? " · " + parts.join(" · ") : " · bez penalizací"}`;
  };
  const linkRow = (o, primary = true) => el("div", { class: "links" }, Object.entries(o.links || {}).map(([k, u], i) =>
    el("a", { href: u, target: "_blank", rel: "noopener", class: k === "google" ? (primary ? "primary" : null) : "search", title: k === "google" ? "Přesně tento dotaz na Google Flights – tam vybereš zpáteční let a prodejce" : `Otevře vyhledávání na ${LINK_NAMES[k] || k} s předvyplněným termínem (jejich ceny automaticky číst nejde)` }, (k === "google" ? "Koupit přes " : "hledat na ") + (LINK_NAMES[k] || k))));
  const sellersRow = (o) => {
    if (!o.sellers || !o.sellers.length) return null;
    const items = [...o.sellers].sort((a, b) => a.price - b.price).slice(0, 8).map((x, i) => el("span", null, i ? " · " : "", i === 0 ? el("strong", null, `${x.name} ${czk(x.price)}`) : `${x.name} ${czk(x.price)}`));
    return el("div", { class: "sellers" }, "Kde koupit: ", ...items);
  };
  const sparkline = (vals, w = 120, h = 28) => {
    const v = vals.filter((x) => x != null);
    if (v.length < 2) return el("span", { class: "muted small" }, v.length ? "1 měření" : "–");
    const min = Math.min(...v), max = Math.max(...v), span = max - min || 1;
    const pts = vals.map((x, i) => x == null ? null : [2 + (i / (vals.length - 1)) * (w - 4), h - 3 - ((x - min) / span) * (h - 6)]);
    const d = pts.filter(Boolean).map((p, i) => (i ? "L" : "M") + p[0].toFixed(1) + " " + p[1].toFixed(1)).join(" ");
    const last = pts.filter(Boolean).pop();
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute("class", "spark"); svg.setAttribute("viewBox", `0 0 ${w} ${h}`);
    svg.innerHTML = `<title>${v.map((x) => czk(x)).join(", ")}</title><path d="${d}"/><circle cx="${last[0].toFixed(1)}" cy="${last[1].toFixed(1)}" r="2.5"/>`;
    return svg;
  };
  const queryHistory = (o) => days.map((d) => { const r = (d.queries || []).find((q) => q[0] === o.origin && q[1] === o.destination && q[2] === o.depart_date && q[3] === o.return_date && q[4] === o.source); return r ? r[5] : null; });
  const legList = (o) => !o.legs || !o.legs.length ? (o.note ? el("p", { class: "legs" }, o.note) : null) : el("ul", { class: "legs" }, o.legs.flatMap((l, i) => [
    el("li", null, `${city(l.from_airport)} ${tm(l.departure)} → ${city(l.to_airport)} ${tm(l.arrival)} (${dur(l.duration_min)}${l.plane ? ", " + l.plane : ""})`),
    o.layovers && o.layovers[i] ? el("li", { class: "muted" }, `přestup ${city(o.layovers[i].airport)}: ${dur(o.layovers[i].minutes)}`) : null]));

  function card(o, i, label) {
    return el("div", { class: "card" + (i === 0 ? " rank1" : "") },
      el("div", { class: "head" },
        el("div", null, el("div", { class: "price" }, czk(o.price), el("span", { class: "muted small" }, " /os")), el("div", { class: "total" }, `${czk(o.price * travelers)} pro ${travelers} · skóre ${czk(o.score)}`)),
        el("div", { class: "rank" }, label || `#${i + 1}`)),
      el("div", { class: "route" }, `${routeName(o._rk)}`, el("span", { class: "muted" }, ` · ${o.airlines.join(", ") || "–"}`)),
      el("div", { class: "dates" }, `${wd(o.depart_date)} ${dcz(o.depart_date)} → ${wd(o.return_date)} ${dcz(o.return_date)} · ${o.nights} dní`),
      timeline(o), badges(o), sellersRow(o),
      el("div", { class: "why" }, why(o), days.length >= 2 ? [" · vývoj termínu: ", sparkline(queryHistory(o), 80, 20)] : null),
      linkRow(o), pinButtons(o));
  }

  // ---------- sledování (piny) ----------
  const wkey = (o) => `${o.origin}|${o.destination}|${o.depart_date}|${o.return_date}`;
  const itinOf = (o) => ({ airlines: o.airlines || [], route: o.route, dep_time: o.legs && o.legs.length ? tm(o.legs[0].departure) : null });
  const WATCH = (LATEST.watch || []);
  const watchedKeys = new Set(WATCH.map((w) => w.key));
  const watchIssue = (o, unwatch = false) => {
    const title = `${unwatch ? "unwatch" : "watch"}: ${o.origin}→${o.destination} ${o.depart_date} → ${o.return_date}`;
    const it = itinOf(o);
    const body = unwatch ? "Zrušit sledování tohoto letu." : `Sledovat tento let (${(it.airlines || []).join(", ")} · ${it.route} · odlet ${it.dep_time || "?"} · ${czk(o.price)}).\n\n\u0060\u0060\u0060json\n${JSON.stringify({ itin: it, price_at_add: o.price, note: "" }, null, 0)}\n\u0060\u0060\u0060\n\nStačí kliknout na „Submit new issue“. Robot let zapíše do watchlist.yaml a issue zavře.`;
    return issueUrl(title, body, "watch");
  };
  let pins = loadPins();
  const isPinned = (o) => pins.some((p) => p.key === wkey(o) && (!p.itin || !p.itin.route || p.itin.route === o.route));
  function pinButtons(o) {
    const box = el("div", { class: "links" });
    if (watchedKeys.has(wkey(o))) box.append(el("span", { class: "tag-manual" }, "✓ sledováno"));
    else box.append(el("a", { class: "btn-pin gh", href: watchIssue(o), target: "_blank", rel: "noopener", title: "Trvalé sledování: otevře předvyplněné GitHub issue, stačí potvrdit. Let pak má prioritu ve skenu, vlastní historii a hlášení." }, "★ Sledovat (GitHub)"));
    const b = el("button", { class: "btn-pin" + (isPinned(o) ? " on" : ""), title: "Rychlý pin jen v tomto prohlížeči (bez GitHubu, neovlivní sken)" }, isPinned(o) ? "✓ připnuto zde" : "připnout jen zde");
    b.addEventListener("click", () => { if (isPinned(o)) pins = pins.filter((p) => !(p.key === wkey(o) && (!p.itin || p.itin.route === o.route))); else pins.push({ key: wkey(o), itin: itinOf(o), price_at_pin: o.price, day: LATEST.day }); savePins(pins); renderLocalPins(); renderDeals(); });
    box.append(b);
    return box;
  }
  const changeCell = (cur, prev, label) => {
    if (cur == null || prev == null) return el("span", { class: "muted" }, `${label}: –`);
    const d = cur - prev; const cls = d < 0 ? "trend-down" : d > 0 ? "trend-up" : "";
    return el("span", { class: cls }, `${label}: ${d > 0 ? "+" : ""}${czk(d)} (${d > 0 ? "+" : ""}${(d / prev * 100).toFixed(0)} %)`);
  };
  function watchCard(w) {
    const cur = w.current; const it = w.itin || {};
    const state = !cur ? "missing" : (w.prev_price != null && cur.price < w.prev_price) ? "down" : (w.prev_price != null && cur.price > w.prev_price) ? "up" : "";
    const c = el("div", { class: "wcard " + (w.auto ? "auto" : "manual") + " " + state });
    c.append(el("div", null,
      el("div", { class: "wtitle" }, `${routeName(`${w.origin}→${w.destination}`)} `, el("span", { class: w.auto ? "tag-auto" : "tag-manual" }, w.auto ? "automaticky" : "můj pin")),
      el("div", { class: "wsub" }, `${wd(w.depart_date)} ${dcz(w.depart_date)} → ${dcz(w.return_date)} · ${(it.airlines || (cur && cur.airlines) || []).join(", ") || "libovolná aerolinka"}${it.route ? " · " + it.route : ""}${it.dep_time ? " · odlet " + it.dep_time : ""}${w.note ? " · " + w.note : ""}`)));
    if (cur) {
      const d = w.prev_price != null ? cur.price - w.prev_price : null;
      const chip = d == null ? el("span", { class: "chip flat" }, "první měření") : d < 0 ? el("span", { class: "chip down" }, `▼ ${czk(-d)} od minula`) : d > 0 ? el("span", { class: "chip up" }, `▲ ${czk(d)} od minula`) : el("span", { class: "chip flat" }, "beze změny");
      c.append(el("div", null, el("div", { class: "wprice" }, czk(cur.price)), el("div", { class: "wdelta" }, chip)));
    } else {
      c.append(el("div", null, el("div", { class: "wprice muted" }, "–"), el("div", { class: "wdelta bad" }, w.prev_price ? `dnes není v nabídce (naposledy ${czk(w.prev_price)} ${w.prev_day ? dshort(w.prev_day) : ""})` : "zatím bez nabídky")));
    }
    const foot = el("div", { class: "wfoot" },
      sparkline((w.history || []).map((h) => h.itin != null ? h.itin : h.min), 160, 32),
      w.price_at_add != null && cur ? changeCell(cur.price, w.price_at_add, `od přidání (${dshort(w.added || LATEST.day)})`) : null,
      w.min_seen != null ? el("span", null, `min ${czk(w.min_seen)} · max ${czk(w.max_seen)} · ${(w.history || []).length} měření`) : null,
      cur && !w.same_itinerary && it.route ? el("span", { class: "warn" }, "stejný let dnes nenalezen, ukazuji nejlevnější na termín") : null,
      cur && w.cheapest_any && w.cheapest_any.price < cur.price ? el("span", null, `nejlevnější na termín: ${czk(w.cheapest_any.price)} (${(w.cheapest_any.airlines || []).join(", ")})`) : null);
    c.append(foot);
    if (cur && cur.sellers && cur.sellers.length) c.append(sellersRow(cur));
    else if (cur && cur.sellers_error) c.append(el("div", { class: "sellers muted" }, "Ceny prodejců se dnes nepodařilo načíst, zkusíme příště."));
    if (cur && cur.price_insight && cur.price_insight.level) c.append(el("div", { class: "badges" }, el("span", { class: "badge " + (cur.price_insight.level === "nízká" ? "good" : cur.price_insight.level === "vysoká" ? "bad" : "") }, `Google: ${cur.price_insight.level} cena${cur.price_insight.low ? ` (obvykle ${kcs(cur.price_insight.low)}–${kcs(cur.price_insight.high)} tis.)` : ""}`)));
    const o = { origin: w.origin, destination: w.destination, depart_date: w.depart_date, return_date: w.return_date, price: cur ? cur.price : (w.prev_price || 0), airlines: it.airlines || [], route: it.route, legs: [] };
    const links = el("div", { class: "links" });
    const gl = (cur && cur.links && cur.links.google) || buildLinks(o).google;
    if (gl) links.append(el("a", { class: "primary", href: gl, target: "_blank", rel: "noopener", title: "Přesně tento dotaz na Google Flights – vybereš zpáteční let a prodejce" }, "Koupit přes Google Flights"));
    const bl = buildLinks(o); ["kiwi", "skyscanner", "kayak"].forEach((k) => links.append(el("a", { class: "search", href: bl[k], target: "_blank", rel: "noopener", title: "Otevře vyhledávání s předvyplněným termínem; jejich ceny automaticky číst nejde" }, "hledat na " + LINK_NAMES[k])));
    links.append(w.auto ? el("a", { class: "btn-pin gh", href: watchIssue(o), target: "_blank", rel: "noopener" }, "★ Nechat trvale") : el("a", { class: "btn-pin", href: watchIssue(o, true), target: "_blank", rel: "noopener" }, "zrušit sledování"));
    c.append(links);
    return c;
  }
  function renderWatch() {
    const A = $("#watchAuto"), M = $("#watchManual"); A.innerHTML = ""; M.innerHTML = "";
    const auto = WATCH.filter((w) => w.auto), man = WATCH.filter((w) => !w.auto);
    $("#watchMeta").textContent = WATCH.length ? `${auto.length} vybral skener · ${man.length} tvoje · priorita ve skenu` : "";
    if (!WATCH.length) { A.append(el("div", { class: "empty" }, "Zatím nic. Po příštím skenu se sem automaticky přidají nejlepší dealy; vlastní let přidáš tlačítkem „★ Sledovat“ u nabídky níže.")); return; }
    A.append(el("div", { class: "wgroup" }, el("h3", null, "Výběr skeneru"), el("span", { class: "muted" }, "nejlepší poměr cena/výkon z posledního skenu, obměňuje se automaticky")));
    A.append(el("div", { class: "cards" }, auto.length ? auto.map(watchCard) : el("div", { class: "empty" }, "Po příštím skenu.")));
    M.append(el("div", { class: "wgroup" }, el("h3", null, "Tvoje piny"), el("span", { class: "muted" }, "ručně vybrané, hlídáme stejný let (aerolinky + trasa)")));
    M.append(el("div", { class: "cards" }, man.length ? man.map(watchCard) : el("div", { class: "empty" }, "Zatím žádný. Klikni na „★ Sledovat (GitHub)“ u nabídky a potvrď issue.")));
  }
  function renderLocalPins() {
    const box = $("#localPins"); box.innerHTML = "";
    if (!pins.length) return;
    box.append(el("div", { class: "panel-head" }, el("h2", null, "Připnuto jen v tomto prohlížeči"), el("span", { class: "muted small" }, "neovlivňuje sken; pro trvalé sledování použij ★ Sledovat (GitHub)")));
    const list = el("div", { class: "cards" });
    for (const p of pins) {
      const [o, d, dep, ret] = p.key.split("|");
      const cands = offers.filter((x) => wkey(x) === p.key);
      const same = cands.filter((x) => !p.itin || !p.itin.route || x.route === p.itin.route);
      const cur = (same.length ? same : cands).sort((a, b) => a.price - b.price)[0];
      const w = { origin: o, destination: d, depart_date: dep, return_date: ret, itin: p.itin, auto: false, added: p.day, price_at_add: p.price_at_pin,
        current: cur ? { price: cur.price, airlines: cur.airlines, links: cur.links } : null, same_itinerary: !!same.length, cheapest_any: cands.length ? { price: Math.min(...cands.map((x) => x.price)), airlines: cands.sort((a, b) => a.price - b.price)[0].airlines } : null,
        history: queryHistory({ origin: o, destination: d, depart_date: dep, return_date: ret, source: "google" }).map((m) => ({ min: m })), prev_price: null };
      const card = watchCard(w);
      const unpin = el("button", { class: "btn-pin" }, "odepnout"); unpin.addEventListener("click", () => { pins = pins.filter((x) => x !== p); savePins(pins); renderLocalPins(); renderDeals(); });
      card.querySelector(".links").append(unpin);
      list.append(card);
    }
    box.append(list);
  }

  // ---------- dealy (taby) ----------
  let dealTab = "best";
  function renderDeals() {
    const tabs = $("#dealTabs"); tabs.innerHTML = "";
    const pool = fresh.filter((o) => o.score != null);
    const defs = [["best", "Nejlepší poměr"], ["cheap", "Nejlevnější"], ["fast", "Nejrychlejší"], ["direct", "Přímé / 1 přestup"]];
    for (const [k, t] of defs) { const b = el("button", { class: "tab", role: "tab", "aria-selected": String(dealTab === k) }, t); b.addEventListener("click", () => { dealTab = k; renderDeals(); }); tabs.append(b); }
    const uniqByItin = (arr) => { const seen = new Set(); return arr.filter((o) => { const k = `${o.depart_date}|${o.price}|${o.airlines.join()}|${o.route}`; if (seen.has(k)) return false; seen.add(k); return true; }); };
    let list, hint;
    if (dealTab === "cheap") { list = sortBy(pool, "price"); hint = "Čistě podle ceny za osobu, bez ohledu na délku cesty a přestupy."; }
    else if (dealTab === "fast") { list = sortBy(pool, "duration_min"); hint = "Nejkratší cesta tam. Cena je druhotná."; }
    else if (dealTab === "direct") { list = sortBy(pool.filter((o) => o.stops <= 1), "score"); hint = "Jen přímé lety a lety s jedním přestupem, řazené podle skóre."; }
    else { list = sortBy(pool, "score"); hint = "Skóre = cena + penalizace za dlouhou cestu, přestupy a horší aerolinky. Čím nižší, tím lepší."; }
    $("#dealsHint").textContent = hint;
    const t = $("#top"); t.innerHTML = "";
    const top = uniqByItin(list).slice(0, 6);
    if (!top.length) { t.append(el("div", { class: "empty" }, "Žádné nabídky v posledním skenu.")); return; }
    top.forEach((o, i) => t.append(card(o, i)));
  }

  // ---------- kalendář cen ----------
  let selectedCell = null;
  function renderCalendar() {
    const box = $("#calendar"); box.innerHTML = "";
    const planDates = [...new Set(queries.map((q) => q.depart_date))].sort();
    if (!planDates.length) { box.append(el("div", { class: "empty" }, "Žádné termíny.")); return; }
    const cellMin = {}, cellStale = {}, cellStatus = {}, cellNew = {}, cellFuture = {};
    for (const q of queries) {
      const k = `${q.origin}→${q.destination}|${q.depart_date}`;
      if (q.beyond_horizon || q.return_date > HORIZON) cellFuture[k] = Math.min(cellFuture[k] ?? Infinity, +new Date(q.return_date)) ; 
      const st = q.status === "ok" && q.count ? "ok" : q.status === "empty" ? "empty" : q.status;
      cellStatus[k] = cellStatus[k] === "ok" || st === "ok" ? "ok" : (cellStatus[k] === "empty" || st === "empty" ? "empty" : st);
      if (q.is_new) cellNew[k] = true;
    }
    for (const o of offers) { const k = `${o._rk}|${o.depart_date}`; if (o.price < (cellMin[k] ?? Infinity)) { cellMin[k] = o.price; cellStale[k] = !!o.stale; } }
    const vals = Object.values(cellMin); const lo = Math.min(...vals), hi = Math.max(...vals);
    const globalMin = Math.min(...fresh.map((o) => o.price), Infinity);
    const months = [...new Set(planDates.map((d) => d.slice(0, 7)))];
    for (const ym of months) {
      const dates = planDates.filter((d) => d.startsWith(ym));
      const table = el("table", { class: "cal" });
      table.append(el("tr", null, el("th", { class: "month" }, MONTHS[+ym.slice(5, 7)] + " " + ym.slice(0, 4)), dates.map((d) => el("th", { class: wd(d) === "so" || wd(d) === "ne" ? "wknd" : null }, el("div", null, dday(d) + "."), el("div", { class: "muted" }, wd(d))))));
      for (const r of routeOrder) {
        const tr = el("tr", null, el("th", { class: "row" }, el("span", { style: `color:${routeColor(r)}` }, "● "), routeName(r)));
        for (const d of dates) {
          const k = `${r}|${d}`; const v = cellMin[k]; const st = cellStatus[k];
          let c;
          if (v == null) {
            const minRet = cfg.trip_lengths && cfg.trip_lengths.length ? addDays(d, Math.min(...cfg.trip_lengths)) : null;
            const future = minRet && minRet > HORIZON;
            c = future
              ? el("div", { class: "cell future", title: `${routeName(r)} ${dcz(d)}: mimo prodejní okno aerolinek (${HORIZON_DAYS} dní dopředu). Nejkratší pobyt se dá hledat od ≈ ${dcz(opensOn(minRet))}.` }, "→")
              : el("div", { class: "cell " + (st === "empty" ? "nosale" : "none"), title: st === "empty" ? `${routeName(r)} ${dcz(d)}: v prodejním okně, ale Google zatím nenabízí žádné spojení` : `${routeName(r)} ${dcz(d)}: nezjištěno (dotaz neproběhl)` }, st === "empty" ? "·" : "?");
          }
          else {
            const p = hi > lo ? 90 - ((v - lo) / (hi - lo)) * 80 : 50;
            c = el("div", { class: "cell" + (p > 55 ? " dark" : "") + (cellStale[k] ? " stale" : "") + (v === globalMin ? " min" : "") + (cellNew[k] ? " new" : ""), style: `--p:${p.toFixed(0)}%`, title: `${routeName(r)} · odlet ${dcz(d)}: od ${czk(v)}/os${cellNew[k] ? " · nově v prodeji" : ""}${cellStale[k] ? " (starší data)" : ""}` }, kcs(v));
            c.addEventListener("click", () => { selectedCell = selectedCell === k ? null : k; renderCalendar(); renderCalendarDetail(r, d); });
            if (selectedCell === k) c.classList.add("sel");
          }
          tr.append(el("td", null, c));
        }
        table.append(tr);
      }
      box.append(table);
    }
    const L = $("#calendarLegend"); L.innerHTML = "";
    L.append("Cena v tisících Kč/os (nejlevnější ze všech délek pobytu): nejlevnější", el("i", { class: "ramp" }), "nejdražší",
      el("span", { style: "--c:transparent; margin-left:14px" }, `→ = mimo prodejní okno (${HORIZON_DAYS} dní dopředu), otevře se postupně`), el("span", { style: "--c:transparent" }, "· = v okně, ale Google nenabízí spojení"),
      el("span", { style: "--c:transparent" }, "★ = nejnižší cena skenu"), el("span", { style: "--c:var(--good)" }, "zelený rámeček = nově v prodeji"), el("span", { style: "--c:transparent" }, "bledé = starší data"));
  }
  function renderCalendarDetail(r, d) {
    const box = $("#calendarDetail");
    if (!selectedCell) { box.hidden = true; box.innerHTML = ""; return; }
    box.hidden = false; box.innerHTML = "";
    const dayOffers = offers.filter((o) => o._rk === r && o.depart_date === d && o.score != null);
    const list = sortBy(dayOffers, "score").slice(0, 3);
    const perLen = cfg.trip_lengths.map((n) => { const xs = dayOffers.filter((o) => o.nights === n); return `${n} dní: ${xs.length ? czk(Math.min(...xs.map((o) => o.price))) : "–"}`; }).join(" · ");
    box.append(el("div", { class: "panel-head" }, el("h2", null, `${routeName(r)} · odlet ${wd(d)} ${dcz(d)}`), el("span", { class: "muted small" }, `nejnižší cena podle délky pobytu: ${perLen}`)));
    box.append(el("div", { class: "cards" }, list.map((o, i) => card(o, i))));
  }

  // ---------- trend ----------
  let chartHistory;
  const hasChart = typeof Chart !== "undefined";
  function renderOverview() {
    const tb = $("#overview tbody"); tb.innerHTML = "";
    $("#trendMeta").textContent = days.length ? `${days.length} ${days.length === 1 ? "měření" : "měření"} · ${dshort(days[0].day)} – ${dshort(days[days.length - 1].day)}` : "";
    if (!days.length) { tb.append(el("tr", null, el("td", { colspan: "9", class: "empty" }, "Zatím žádná historie."))); return; }
    const last = days[days.length - 1];
    const dayDate = (d) => new Date(d.day + "T00:00:00Z");
    const back = (n) => { const target = dayDate(last).getTime() - n * 864e5; let best = null; for (const d of days) if (dayDate(d).getTime() <= target) best = d; return best; };
    const prev = days.length >= 2 ? days[days.length - 2] : null, d7 = back(7), d30 = back(30);
    const rk = (r) => r.replace("→", "-");
    const delta = (now, then) => {
      if (now == null || then == null) return el("td", { class: "muted" }, "–");
      const diff = now - then, pct = then ? (diff / then) * 100 : 0;
      return el("td", { class: "num " + (diff < 0 ? "trend-down" : diff > 0 ? "trend-up" : "") }, `${diff > 0 ? "+" : ""}${czk(diff)} (${pct > 0 ? "+" : ""}${pct.toFixed(0)} %)`);
    };
    for (const r of routeOrder) {
      const k = rk(r); const series = days.map((d) => (d.routes[k] || {}).min ?? null);
      if (!series.some((x) => x != null)) continue;
      let now = series[series.length - 1];
      let minV = Infinity, minD = null, maxV = -Infinity, maxD = null;
      days.forEach((d, i) => { const v = series[i]; if (v == null) return; if (v < minV) { minV = v; minD = d.day; } if (v > maxV) { maxV = v; maxD = d.day; } });
      const v = routeVerdict(r);
      if (v.cur != null) now = v.cur;  // stejná hodnota jako ve verdiktu (poslední sken)
      const vcell = el("td", { class: v.state === "good" ? "verdict-down" : v.state === "warn" ? "verdict-up" : "verdict-flat" }, v.label);
      tb.append(el("tr", null,
        el("td", null, el("span", { style: `color:${routeColor(r)}` }, "● "), routeName(r)),
        el("td", { class: "num" }, el("strong", null, czk(now))),
        delta(now, prev ? (prev.routes[k] || {}).min : null), delta(now, d7 ? (d7.routes[k] || {}).min : null), delta(now, d30 ? (d30.routes[k] || {}).min : null),
        el("td", { class: "num" }, isFinite(minV) ? `${czk(minV)} (${dshort(minD)})` : "–"),
        el("td", { class: "num" }, isFinite(maxV) ? `${czk(maxV)} (${dshort(maxD)})` : "–"),
        el("td", null, sparkline(series)), vcell));
    }
  }
  function renderChartHistory() {
    const L = $("#legendHistory"); L.innerHTML = "";
    if (!hasChart) { L.textContent = "Knihovna grafů se nenačetla (offline?)."; return; }
    Chart.defaults.color = cssVar("--text-2"); Chart.defaults.borderColor = cssVar("--grid"); Chart.defaults.font.family = getComputedStyle(document.body).fontFamily;
    const routes = routeOrder.filter((r) => days.some((d) => d.routes[r.replace("→", "-")]));
    const ds = routes.map((r) => ({ label: routeName(r), data: days.map((d) => (d.routes[r.replace("→", "-")] || {}).min ?? null), borderColor: routeColor(r), backgroundColor: routeColor(r) }));
    routes.forEach((r) => L.append(el("span", { style: `--c:${routeColor(r)}` }, routeName(r))));
    if (chartHistory) chartHistory.destroy();
    chartHistory = new Chart($("#chartHistory"), { type: "line", data: { labels: days.map((d) => dshort(d.day)), datasets: ds }, options: {
      responsive: true, maintainAspectRatio: false, animation: false, interaction: { mode: "index", intersect: false },
      plugins: { legend: { display: false }, tooltip: { callbacks: { title: (it) => "sken " + it[0].label, label: (c) => ` ${c.dataset.label}: ${czk(c.parsed.y)}` } } },
      scales: { x: { grid: { display: false }, ticks: { maxRotation: 0, autoSkip: true } }, y: { ticks: { callback: (v) => Math.round(v / 1000) + " tis." }, grid: { color: cssVar("--grid") } } },
      elements: { line: { borderWidth: 2, tension: .2, spanGaps: true }, point: { radius: 3, hoverRadius: 6, hitRadius: 10 } } } });
    if (days.length < 2) L.append(el("span", { class: "muted", style: "--c:transparent" }, "Křivky se vykreslí po dalších denních bězích."));
  }

  // ---------- hlášení ----------
  function renderAlerts() {
    const box = $("#alerts"); box.innerHTML = "";
    const today = LATEST.day; const todays = ALERTS.filter((a) => a.day === today);
    $("#alertsMeta").textContent = ALERTS.length ? `${todays.length} dnes · ${ALERTS.length} celkem` : "";
    if (!ALERTS.length) { box.append(el("div", { class: "empty" }, `Zatím žádné hlášení. Přijde, jakmile cena spadne pod ${czk((cfg.alerts || {}).target_price || 15000)}/os, prudce klesne od minula, nebo bude výrazně pod historií termínu.`)); return; }
    ALERTS.slice(0, 10).forEach((a) => box.append(el("div", { class: "alert " + (a.severity || "") },
      el("div", { class: "price" }, czk(a.price), el("span", { class: "muted small" }, " /os")),
      el("div", { class: "when" }, (a.day === today ? "dnes" : dcz(a.day)) + " · " + (a.kind_label || a.kind)),
      el("div", { class: "body" },
        el("div", { class: "title" }, `${city(a.origin)} → ${city(a.destination)} · ${dcz(a.depart_date)} – ${dcz(a.return_date)} (${a.nights} dní) · ${(a.airlines || []).join(", ") || "–"} · ${a.stops === 0 ? "přímý" : a.stops === 1 ? "1 přestup" : a.stops + " přestupy"}`),
        el("div", { class: "reason" }, a.reason),
        el("div", { class: "links" }, Object.entries(a.links || {}).slice(0, 5).map(([k, u], i) => el("a", { href: u, target: "_blank", rel: "noopener", class: i === 0 ? "primary" : null }, LINK_NAMES[k] || k)))))));
    if (ALERTS.length > 10) box.append(el("div", { class: "muted small" }, `… a dalších ${ALERTS.length - 10} starších v data/alerts.json`));
  }

  // ---------- všechny nabídky ----------
  const F = { origin: "", dest: "", stops: "", nights: "", month: "", maxPrice: "", sort: "score", stale: "1" };
  const uniq = (k) => [...new Set(offers.map((o) => o[k]))].sort();
  const sel = (key, label, opts) => { const s = el("select", { id: "f-" + key }); for (const [v, t] of opts) s.append(el("option", { value: v }, t)); s.value = F[key]; s.addEventListener("change", () => { F[key] = s.value; renderTable(); }); return el("label", null, label, s); };
  function buildFilters() {
    const fl = $("#filters"); fl.innerHTML = "";
    fl.append(
      sel("origin", "Odkud", [["", "vše"], ...uniq("origin").map((v) => [v, `${city(v)} (${v})`])]),
      sel("dest", "Kam", [["", "vše"], ...uniq("destination").map((v) => [v, `${city(v)} (${v})`])]),
      sel("stops", "Max. přestupů", [["", "libovolně"], ["0", "přímý"], ["1", "max 1"], ["2", "max 2"]]),
      sel("nights", "Délka (dní)", [["", "vše"], ...uniq("nights").map((v) => [String(v), String(v)])]),
      sel("month", "Měsíc odletu", [["", "srpen + září"], ["8", "srpen"], ["9", "září"]]),
      sel("sort", "Řadit podle", [["score", "skóre (cena/výkon)"], ["price", "ceny"], ["depart_date", "data odletu"], ["duration_min", "délky cesty"]]),
      sel("stale", "Starší data", [["1", "zobrazit"], ["0", "skrýt"]]));
    const mp = el("input", { type: "number", id: "f-maxPrice", placeholder: "např. 20000", min: "0", step: "500" }); mp.value = F.maxPrice;
    mp.addEventListener("input", () => { F.maxPrice = mp.value; renderTable(); });
    fl.append(el("label", null, `Max. cena/os (${CUR})`, mp));
    const pr = $("#presets"); pr.innerHTML = "";
    const preset = (t, f) => { const b = el("button", { class: "tab" }, t); b.addEventListener("click", () => { Object.assign(F, { origin: "", dest: "", stops: "", nights: "", month: "", maxPrice: "", sort: "score" }, f); buildFilters(); renderTable(); }); pr.append(b); };
    preset("Vše", {}); preset("Max 1 přestup", { stops: "1" }); preset("Do 20 000 Kč", { maxPrice: "20000", sort: "price" }); preset("Jen srpen", { month: "8" }); preset("Jen září", { month: "9" }); preset("Nejrychlejší", { sort: "duration_min" });
  }
  const filtered = () => offers.filter((o) => (!F.origin || o.origin === F.origin) && (!F.dest || o.destination === F.dest) && (F.stops === "" || o.stops <= +F.stops) && (!F.nights || String(o.nights) === F.nights) && (!F.month || o._month === +F.month) && (!F.maxPrice || o.price <= +F.maxPrice) && (F.stale === "1" || !o.stale));
  let shown = 60, sortKey = "score", sortDir = 1;
  document.querySelectorAll("th[data-sort]").forEach((th) => th.addEventListener("click", () => { const k = th.dataset.sort; if (sortKey === k) sortDir *= -1; else { sortKey = k; sortDir = 1; } renderTable(); }));
  $("#more").addEventListener("click", () => { shown += 100; renderTable(); });
  function renderTable() {
    const tb = $("#table tbody"); tb.innerHTML = "";
    const key = F.sort !== "score" || sortKey !== "score" ? (sortKey !== "score" ? sortKey : F.sort) : "score";
    const rows = sortBy(filtered(), key, sortDir);
    $("#count").textContent = `(${rows.length})`;
    rows.slice(0, shown).forEach((o) => {
      const trend = o.yesterday_min == null ? "–" : o.price < o.yesterday_min ? `↓ ${czk(o.yesterday_min - o.price)}` : o.price > o.yesterday_min ? `↑ ${czk(o.price - o.yesterday_min)}` : "=";
      const trendCls = o.yesterday_min == null ? "" : o.price < o.yesterday_min ? "trend-down" : o.price > o.yesterday_min ? "trend-up" : "";
      const btn = el("button", { class: "toggle" }, "detail");
      const tr = el("tr", null,
        el("td", { class: "num" }, czk(o.score)), el("td", { class: "num" }, el("strong", null, czk(o.price))), el("td", { class: "num" }, czk(o.price * travelers)),
        el("td", null, `${wd(o.depart_date)} ${dcz(o.depart_date)}`), el("td", null, `${dcz(o.return_date)} (${o.nights} d)`), el("td", null, o.route),
        el("td", null, o.airlines.join(", ") || "–"), el("td", { class: "num" }, o.stops), el("td", null, durShort(o.duration_min)),
        el("td", { class: trendCls }, trend + (o.is_all_time_low ? " ★" : "") + (o.stale ? " (starší)" : "")), el("td", null, btn));
      tb.append(tr);
      btn.addEventListener("click", () => {
        if (tr.nextSibling && tr.nextSibling.classList.contains("detail")) { tr.nextSibling.remove(); return; }
        tr.after(el("tr", { class: "detail" }, el("td", { colspan: "11" }, timeline(o), badges(o), legList(o), sellersRow(o), el("div", { class: "why" }, why(o)), el("div", { class: "small muted" }, "Vývoj ceny tohoto termínu: ", sparkline(queryHistory(o))), linkRow(o), pinButtons(o))));
      });
    });
    $("#more").hidden = rows.length <= shown;
    if (!rows.length) tb.append(el("tr", null, el("td", { colspan: "11", class: "empty" }, "Žádné nabídky pro zvolené filtry.")));
  }

  // ---------- stav skenu ----------
  function renderRunInfo() {
    const s = LATEST.stats, c = cfg; const r = $("#runinfo"); r.innerHTML = "";
    $("#runMeta").textContent = `${s.queries_ok} z ${s.queries_total} dotazů s nabídkou · ${Math.round(s.duration_s / 60)} min`;
    const cov = el("div", { class: "cover" });
    for (const m of coverage) cov.append(el("div", { class: "chip" }, el("div", null, el("strong", null, m.name), ` · ${m.okDates} z ${m.dates} dnů odletu má nabídky`), el("div", { class: "bar" }, el("i", { style: `width:${m.dates ? (m.okDates / m.dates) * 100 : 0}%` }))));
    r.append(cov);
    r.append(el("p", null, `Plán: ${c.origins.map(city).join(", ")} → ${c.destinations.map(city).join(", ")}, odlety ${dcz(c.depart_from)} – ${dcz(c.depart_to)} po ${c.depart_step_days} dnech, délky ${c.trip_lengths.join("/")} dní, max. ${c.max_stops ?? "∞"} přestupů, zdroje: ${c.sources.join(", ")}.`));
    const errs = queries.filter((q) => q.status === "error");
    const empty = queries.filter((q) => q.status === "empty" || (q.status === "ok" && !q.count));
    r.append(el("p", null, `Dotazů ${s.queries_total}: s nabídkou ${s.queries_ok}, bez výsledků ${empty.length}, chyb ${errs.length}, přeskočeno ${s.queries_skipped}, převzato ze staršího běhu ${s.queries_stale}.`));
    if (empty.length) r.append(el("details", null, el("summary", { class: "muted" }, `Termíny bez výsledků (${empty.length}) – typicky ještě neotevřený prodej`), el("p", { class: "small muted" }, empty.map((q) => `${q.origin}→${q.destination} ${dshort(q.depart_date)}–${dshort(q.return_date)}`).join(", "))));
    if (errs.length) r.append(el("details", null, el("summary", null, `Chyby (${errs.length})`), el("ul", { class: "small" }, errs.slice(0, 30).map((q) => el("li", null, `${q.source} ${q.origin}→${q.destination} ${q.depart_date}: ${q.error || q.status}`)))));
  }

  renderVerdict(); renderWatch(); renderLocalPins(); renderInsights(); renderAlerts(); renderDeals(); renderCalendar(); renderOverview(); renderChartHistory(); buildFilters(); renderTable(); renderRunInfo();
  if (ALERTS.length) $("#alertsPanel").scrollIntoView && 0;
  if (window.matchMedia) window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", () => { renderChartHistory(); renderCalendar(); });
})();
