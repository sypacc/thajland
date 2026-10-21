// Odvozená data: pokrytí, prodejní okno, verdikt po trasách, postřehy.
import { addDays, city, czk, dcz, dshort, fromCity, median, MONTHS, routeName, sortBy } from "./format.js";

export function buildModel(latest, series, alerts) {
  const cfg = latest.config;
  const offers = latest.offers.map((o, i) => ({ ...o, _i: i, _month: +o.depart_date.slice(5, 7), _rk: `${o.origin}→${o.destination}` }));
  const fresh = offers.filter((o) => !o.stale);
  const routeOrder = [];
  for (const o of cfg.origins) for (const d of cfg.destinations) routeOrder.push(`${o}→${d}`);
  for (const o of offers) if (!routeOrder.includes(o._rk)) routeOrder.push(o._rk);
  const days = series.days || [];
  const queries = latest.queries || [];
  const HORIZON = latest.booking_horizon || addDays(latest.generated_at.slice(0, 10), 329);
  const HORIZON_DAYS = Math.round((new Date(HORIZON + "T00:00:00Z") - new Date(latest.generated_at.slice(0, 10) + "T00:00:00Z")) / 864e5);
  const opensOn = (retIso) => addDays(retIso, -HORIZON_DAYS);
  const byMonth = {};
  for (const q of queries) {
    const m = +q.depart_date.slice(5, 7);
    const b = (byMonth[m] ||= { total: 0, ok: 0, dates: new Set(), okDates: new Set() });
    b.total++; b.dates.add(q.depart_date);
    if (q.status === "ok" && q.count) { b.ok++; b.okDates.add(q.depart_date); }
  }
  const coverage = Object.entries(byMonth).map(([m, b]) => ({ month: +m, name: MONTHS[+m], dates: b.dates.size, okDates: b.okDates.size, total: b.total, ok: b.ok }));
  const routeHistory = (r) => days.map((d) => (d.routes[r.replace("→", "-")] || {}).min ?? null);
  const routeVerdict = (r) => {
    const hist = routeHistory(r).filter((x) => x != null);
    const cur = Math.min(...fresh.filter((o) => o._rk === r).map((o) => o.price), Infinity);
    if (!isFinite(cur)) return { state: "none", label: "Google zatím nenabízí žádné spojení · hlídáme dál", cur: null, days: hist.length };
    const med = median(hist), allMin = hist.length ? Math.min(...hist) : cur;
    if (hist.length < 5) return { state: "info", label: `sbíráme data (${hist.length}/5 dní)`, cur, days: hist.length, med };
    if (cur <= allMin && cur <= med * 0.92) return { state: "good", label: `dobrá chvíle na nákup · ${Math.round((1 - cur / med) * 100)} % pod obvyklou cenou`, cur, days: hist.length, med };
    if (cur <= med * 1.03) return { state: "fair", label: "férová cena, sledujeme dál", cur, days: hist.length, med };
    return { state: "warn", label: `počkat · ${Math.round((cur / med - 1) * 100)} % nad obvyklou cenou`, cur, days: hist.length, med };
  };
  const queryHistory = (o) => days.map((d) => { const r = (d.queries || []).find((q) => q[0] === o.origin && q[1] === o.destination && q[2] === o.depart_date && q[3] === o.return_date && q[4] === (o.source || "google")); return r ? r[5] : null; });
  // preferovaná aerolinka (config.preferred): minima po trasách a měsících z čerstvých nabídek
  const prefCfg = (cfg.preferred && cfg.preferred.airlines && cfg.preferred.airlines.length) ? cfg.preferred : null;
  const isPref = (o) => !!prefCfg && o.airlines && o.airlines.length > 0 && o.airlines.every((a) => prefCfg.airlines.includes(a));
  const prefOffers = prefCfg ? fresh.filter(isPref) : [];
  const minBy = (fn) => { const m = {}; for (const o of prefOffers) { const k = fn(o); if (!m[k] || o.price < m[k].price) m[k] = o; } return m; };
  const peerNames = (prefCfg && prefCfg.peers) || [];
  const isPeer = (o) => o.airlines && o.airlines.length > 0 && peerNames.some((p) => o.airlines.every((a) => a === p));
  const peers = peerNames.map((name) => { const mine = fresh.filter((o) => o.airlines.length && o.airlines.every((a) => a === name)).sort((a, b) => a.price - b.price); const prev = ((latest.preferred && latest.preferred.peers && latest.preferred.peers[name]) || {}).prev_min_by_route || {}; const prevAll = Object.values(prev).map((x) => x.price).filter((x) => x != null); return { name, best: mine[0] || null, count: mine.length, prevMin: prevAll.length ? Math.min(...prevAll) : null, miracles: ((latest.preferred && latest.preferred.peers && latest.preferred.peers[name]) || {}).miracles || {} }; });
  const pref = prefCfg ? { cfg: prefCfg, name: prefCfg.airlines.join(", "), offers: prefOffers, isPref, isPeer, peers, isPremium: (o) => isPref(o) || isPeer(o),
    overall: prefOffers.length ? [...prefOffers].sort((a, b) => a.price - b.price)[0] : null,
    byRoute: minBy((o) => o._rk), byMonth: minBy((o) => o._month), byDest: minBy((o) => o.destination),
    prev: (latest.preferred && latest.preferred.prev_min_by_route) || {}, newLow: (latest.preferred && latest.preferred.new_low_routes) || {} } : null;
  return { latest, cfg, offers, fresh, routeOrder, days, queries, alerts: alerts || [], watch: latest.watch || [], pref, HORIZON, HORIZON_DAYS, opensOn, coverage, routeHistory, routeVerdict, queryHistory, travelers: cfg.travelers || 1 };
}

export function insights(M) {
  const { cfg, fresh, days, queries, coverage, routeOrder, HORIZON, HORIZON_DAYS, opensOn } = M;
  const out = [];
  if (!fresh.length) return out;
  const minLen = Math.min(...(cfg.trip_lengths || [14])), maxLen = Math.max(...(cfg.trip_lengths || [14]));
  const lastDep = cfg.depart_to;
  if (addDays(lastDep, minLen) > HORIZON) {
    let firstHidden = cfg.depart_from; while (addDays(firstHidden, minLen) <= HORIZON && firstHidden <= lastDep) firstHidden = addDays(firstHidden, 1);
    out.push(`<strong>Prodejní okno:</strong> aerolinky prodávají ~${HORIZON_DAYS} dní dopředu, dnes tedy do návratu ${dcz(HORIZON)}. Odlety od ${dcz(firstHidden)} se objeví postupně: ${dcz(firstHidden)} ≈ ${dcz(opensOn(addDays(firstHidden, minLen)))}, poslední (${dcz(lastDep)}, ${maxLen} dní) ≈ ${dcz(opensOn(addDays(lastDep, maxLen)))}. Každý nově otevřený termín dostane hlášení „nově v prodeji“.`);
  }
  const minByKey = (keyFn) => { const m = {}; for (const o of fresh) { const k = keyFn(o); m[k] = Math.min(m[k] ?? Infinity, o.price); } return m; };
  const origins = cfg.origins;
  if (origins.length >= 2) {
    const m = minByKey((o) => `${o.origin}|${o.destination}|${o.depart_date}|${o.nights}`);
    const diffs = [];
    for (const k of Object.keys(m)) if (k.startsWith(origins[0] + "|")) { const k2 = origins[1] + k.slice(origins[0].length); if (isFinite(m[k2] ?? NaN)) diffs.push(m[k] - m[k2]); }
    if (diffs.length >= 3) { const d = median(diffs); const cap = (t) => t.charAt(0).toUpperCase() + t.slice(1); out.push(d > 500 ? `${cap(fromCity(origins[1]))} vychází stejný termín typicky o <strong>${czk(d)}</strong> levněji než ${fromCity(origins[0])} (${diffs.length} srovnání). K ceně připočti dopravu na letiště.` : d < -500 ? `${cap(fromCity(origins[0]))} je to typicky o <strong>${czk(-d)}</strong> levnější než ${fromCity(origins[1])}.` : `${city(origins[0])} a ${city(origins[1])} vycházejí cenově podobně (rozdíl do 500 Kč).`); }
  }
  if (cfg.destinations.length >= 2) {
    const [a, b] = cfg.destinations;
    const m = minByKey((o) => `${o.destination}|${o.origin}|${o.depart_date}|${o.nights}`);
    const diffs = [];
    for (const k of Object.keys(m)) if (k.startsWith(a + "|")) { const k2 = b + k.slice(a.length); if (isFinite(m[k2] ?? NaN)) diffs.push(m[k2] - m[k]); }
    if (diffs.length >= 3) { const d = median(diffs); out.push(Math.abs(d) < 500 ? `${city(a)} i ${city(b)} stojí prakticky stejně.` : d > 0 ? `${city(b)} je oproti ${city(a)} dražší typicky o <strong>${czk(d)}</strong>; zvaž přílet do Bangkoku a vnitrostátní let.` : `${city(b)} vychází typicky o <strong>${czk(-d)}</strong> levněji než ${city(a)}.`); }
  }
  const byDate = minByKey((o) => o.depart_date);
  const dates = Object.keys(byDate).sort();
  if (dates.length >= 4) {
    const weeks = {};
    for (const d of dates) { const w = `${d.slice(5, 7)}-${Math.min(4, Math.ceil(+d.slice(8, 10) / 7))}`; (weeks[w] ||= []).push(byDate[d]); }
    const ranked = Object.entries(weeks).map(([w, v]) => [w, median(v)]).sort((x, y) => x[1] - y[1]);
    const gen = (w) => { const [mm, wk] = w.split("-"); return `${wk}. týden ${MONTHS[+mm].replace("srpen", "srpna")}`; };
    out.push(`Nejlevnější odlety: <strong>${gen(ranked[0][0])}</strong> (medián ${czk(ranked[0][1])}); nejdražší ${gen(ranked[ranked.length - 1][0])} (${czk(ranked[ranked.length - 1][1])}).`);
  }
  if (cfg.trip_lengths.length >= 2) {
    const m = minByKey((o) => `${o.nights}|${o.origin}|${o.destination}|${o.depart_date}`);
    const per = {}; for (const [k, v] of Object.entries(m)) { const n = k.split("|")[0]; (per[n] ||= []).push(v); }
    const meds = Object.entries(per).map(([n, v]) => [n, median(v)]).sort((x, y) => x[1] - y[1]);
    if (meds.length >= 2 && meds[meds.length - 1][1] - meds[0][1] > 400) out.push(`Délka pobytu <strong>${meds[0][0]} dní</strong> vychází nejlevněji (medián ${czk(meds[0][1])}), ${meds[meds.length - 1][0]} dní ${czk(meds[meds.length - 1][1])}.`);
    else if (meds.length >= 2) out.push(`Délka pobytu (${cfg.trip_lengths.join("/")} dní) cenu prakticky nemění, vyber podle dovolené.`);
  }
  if (M.pref && M.pref.overall) {
    const P = M.pref, o = P.overall; const months = Object.entries(P.byMonth).sort().map(([m, x]) => `${MONTHS[+m]} od <strong>${czk(x.price)}</strong>`).join(", ");
    const prevAll = Object.values(P.prev).map((x) => x.price).filter((x) => x != null); const prevMin = prevAll.length ? Math.min(...prevAll) : null;
    const tgt = P.cfg.target_price;
    out.unshift(`<strong>${P.name} (preferovaná):</strong> nejlevněji ${czk(o.price)}/os · ${routeName(o._rk)} · ${dshort(o.depart_date)}–${dshort(o.return_date)}; ${months}${prevMin != null ? (o.price < prevMin ? ` · <strong>nové minimum</strong> (dosud ${czk(prevMin)})` : ` · dosavadní minimum ${czk(prevMin)}`) : ""}${tgt ? ` · hlášení přijde pod ${czk(tgt)}` : ""}.`);
  }
  if (M.pref && M.pref.peers.length) {
    const P = M.pref; const have = P.peers.filter((p) => p.best); const miss = P.peers.filter((p) => !p.best).map((p) => p.name);
    const mir = (p) => { const ms = Object.entries(p.miracles || {}); return ms.length ? ` <strong>ZÁZRAČNÁ SLEVA −${Math.max(...ms.map(([, m]) => m.drop_pct))} %</strong> proti dosavadnímu minimu` : ""; };
    if (have.length) out.splice(1, 0, `<strong>Prémiové aerolinky:</strong> ${have.sort((a, b) => a.best.price - b.best.price).map((p) => `${p.name} od <strong>${czk(p.best.price)}</strong> (${routeName(p.best._rk)}, ${dshort(p.best.depart_date)}${p.prevMin != null && p.best.price < p.prevMin ? ", nové minimum" : ""})${mir(p)}`).join(" · ")}${miss.length ? ` · bez nabídky: ${miss.join(", ")}` : ""}${P.cfg.peer_target_price ? ` · hlášení pod ${czk(P.cfg.peer_target_price)} nebo při pádu o ${P.cfg.peer_drop_pct || 20} % pod dosavadní minimum.` : "."}`);
  }
  const direct = fresh.filter((o) => o.stops === 0);
  if (direct.length) out.push(`Přímý let existuje od <strong>${czk(Math.min(...direct.map((o) => o.price)))}</strong> (${[...new Set(direct.map((o) => o.airlines.join("/")))].join(", ")}).`);
  else out.push("Přímý let z Česka ani Vídně v nabídce není, počítej s jedním přestupem (typicky Istanbul, Dubaj nebo Dauhá).");
  const top = sortBy(fresh.filter((o) => o.score != null), "score").slice(0, 10);
  if (top.length >= 5) { const c = {}; for (const o of top) for (const a of o.airlines) c[a] = (c[a] || 0) + 1; const [a, n] = Object.entries(c).sort((x, y) => y[1] - x[1])[0]; out.push(`V top 10 podle poměru cena/výkon je nejčastěji <strong>${a}</strong> (${n}×).`); }
  if (days.length >= 3) {
    const minOf = (d) => Math.min(...Object.values(d.routes).map((r) => r.min).filter((x) => x != null));
    const first = minOf(days[Math.max(0, days.length - 8)]), last = minOf(days[days.length - 1]);
    if (isFinite(first) && isFinite(last)) { const pct = (last - first) / first * 100; const n = Math.min(7, days.length - 1); out.push(Math.abs(pct) < 3 ? `Za posledních ${n} dní je nejnižší cena stabilní (${czk(last)}).` : pct < 0 ? `Nejnižší cena za posledních ${n} dní <strong>klesla o ${Math.abs(pct).toFixed(0)} %</strong> (${czk(first)} → ${czk(last)}).` : `Nejnižší cena za posledních ${n} dní <strong>vzrostla o ${pct.toFixed(0)} %</strong> (${czk(first)} → ${czk(last)}).`); }
  }
  const newQ = queries.filter((q) => q.is_new);
  if (newQ.length) {
    const byR = {}; for (const q of newQ) (byR[`${q.origin}→${q.destination}`] ||= []).push(q);
    out.push(`<strong>Nově v prodeji od minula:</strong> ${Object.entries(byR).map(([r, qs]) => `${routeName(r)} ${[...new Set(qs.map((q) => q.depart_date))].length} dnů odletu (od ${czk(Math.min(...qs.map((q) => q.min_price)))})`).join("; ")}.`);
  }
  for (const r of routeOrder) if (!fresh.some((o) => o._rk === r)) {
    const [, d] = r.split("→");
    const alt = routeOrder.filter((x) => x !== r && fresh.some((q) => q._rk === x) && x.endsWith("→" + d)).map(routeName);
    out.push(`<strong>${routeName(r)}</strong>: Google pro tyto termíny zatím nenabízí žádné spojení (ani s přestupy). Sken to kontroluje denně${alt.length ? `; mezitím srovnej ${alt.join(" / ")}` : ""}${d === "HKT" ? " nebo let do Bangkoku a vnitrostátní přelet (≈ 1 500–3 000 Kč)" : ""}.`);
  }
  void coverage;
  return out.slice(0, 9);
}
