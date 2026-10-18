import React, { useEffect, useMemo, useState } from "react";
import { buildLinks, city, czk, dcz, dshort, durShort, loadPins, routeName, savePins, sortBy, watchIssue, wd, wkey, LINK_NAMES } from "../lib/format.js";
import { Badges, Links, PinButtons, Sellers, Sparkline, Timeline, scoreWhy } from "./Shared.jsx";

function Delta({ cur, prev, label }) {
  if (cur == null || prev == null) return <span className="muted">{label}: –</span>;
  const d = cur - prev; const cls = d < 0 ? "trend-down" : d > 0 ? "trend-up" : "";
  return <span className={cls}>{label}: {d > 0 ? "+" : ""}{czk(d)} ({d > 0 ? "+" : ""}{(d / prev * 100).toFixed(0)} %)</span>;
}

export function WatchCard({ w, M, extra }) {
  const cur = w.current; const it = w.itin || {};
  const state = !cur ? "missing" : (w.prev_price != null && cur.price < w.prev_price) ? "down" : (w.prev_price != null && cur.price > w.prev_price) ? "up" : "";
  const nick = w.nick || ((cur && cur.airlines) || it.airlines || []).join(", ");
  const d = cur && w.prev_price != null ? cur.price - w.prev_price : null;
  const o = { origin: w.origin, destination: w.destination, depart_date: w.depart_date, return_date: w.return_date, price: cur ? cur.price : (w.prev_price || 0), airlines: (cur && cur.airlines) || it.airlines || [], route: (cur && cur.route) || it.route, legs: (cur && cur.legs) || [], layovers: (cur && cur.layovers) || [], duration_min: cur && cur.duration_min, links: { google: cur && cur.links && cur.links.google } };
  const bl = buildLinks(o);
  return (
    <div className={`wcard ${w.auto ? "auto" : "manual"} ${state}`}>
      <div>
        <div className="wname">{w.name || (w.auto ? "Tip" : "Můj pin")} · <span className="nick">{nick}</span></div>
        <div className="wtitle">{routeName(`${w.origin}→${w.destination}`)}<span className="muted"> · {wd(w.depart_date)} {dcz(w.depart_date)} → {dcz(w.return_date)}</span></div>
        <div className="wsub">{o.route || ""}{(it.dep_time || (cur && cur.dep_time)) ? " · odlet " + (it.dep_time || cur.dep_time) : ""}{cur && cur.duration_min ? " · tam " + durShort(cur.duration_min) : ""}{cur && cur.stops != null ? " · " + (cur.stops === 0 ? "přímý" : cur.stops + "× přestup") : ""}{w.note ? ` · „${w.note}“` : ""}</div>
      </div>
      {cur ? (
        <div><div className="wprice">{czk(cur.price)}</div><div className="wdelta">{d == null ? <span className="chip flat">první měření</span> : d < 0 ? <span className="chip down">▼ {czk(-d)} od minula</span> : d > 0 ? <span className="chip up">▲ {czk(d)} od minula</span> : <span className="chip flat">beze změny</span>}</div></div>
      ) : (
        <div><div className="wprice muted">–</div><div className="wdelta bad">{w.prev_price ? `dnes není v nabídce (naposledy ${czk(w.prev_price)} ${w.prev_day ? dshort(w.prev_day) : ""})` : "zatím bez nabídky"}</div></div>
      )}
      {cur && cur.legs && cur.legs.length ? <div className="wfull"><Timeline o={o} detailed /></div> : null}
      <div className="wfoot">
        <Sparkline values={(w.history || []).map((h) => h.itin != null ? h.itin : h.min)} w={160} h={32} />
        {w.price_at_add != null && cur ? <Delta cur={cur.price} prev={w.price_at_add} label={`od přidání (${dshort(w.added || M.latest.day)})`} /> : null}
        {w.min_seen != null ? <span>min {czk(w.min_seen)} · max {czk(w.max_seen)} · {(w.history || []).length} měření</span> : null}
        {cur && !w.same_itinerary && it.route ? <span className="warn">stejný let dnes nenalezen, ukazuji nejlevnější na termín</span> : null}
        {cur && w.cheapest_any && w.cheapest_any.price < cur.price ? <span>nejlevnější na termín: {czk(w.cheapest_any.price)} ({(w.cheapest_any.airlines || []).join(", ")})</span> : null}
      </div>
      {cur ? <div className="wfull"><Sellers o={cur} />{cur.price_insight && cur.price_insight.level ? <div className="badges"><span className={"badge " + (cur.price_insight.level === "nízká" ? "good" : cur.price_insight.level === "vysoká" ? "bad" : "")}>Google: {cur.price_insight.level} cena{cur.price_insight.low ? ` (obvykle ${(cur.price_insight.low / 1000).toFixed(1)}–${(cur.price_insight.high / 1000).toFixed(1)} tis.)` : ""}</span></div> : null}</div> : null}
      <div className="links">
        {bl.google ? <a className="primary" href={bl.google} target="_blank" rel="noopener" title="Přesně tento dotaz na Google Flights – vybereš zpáteční let a prodejce">Koupit přes Google Flights</a> : null}
        {["kiwi", "skyscanner", "kayak"].map((k) => <a key={k} className="search" href={bl[k]} target="_blank" rel="noopener" title="Otevře vyhledávání s předvyplněným termínem; jejich ceny automaticky číst nejde">hledat na {LINK_NAMES[k]}</a>)}
        {extra}
        {w.auto ? <a className="btn-pin gh" href={watchIssue(o)} target="_blank" rel="noopener">★ Nechat trvale</a> : (w.local ? null : <a className="btn-pin" href={watchIssue(o, true)} target="_blank" rel="noopener">zrušit sledování</a>)}
      </div>
    </div>
  );
}

export function DealCard({ o, i, M, pins, setPins, watchedKeys, label }) {
  return (
    <div className={"card" + (i === 0 ? " rank1" : "")}>
      <div className="head">
        <div><div className="price">{czk(o.price)}<span className="muted small"> /os</span></div><div className="total">{czk(o.price * M.travelers)} pro {M.travelers} · skóre {czk(o.score)}</div></div>
        <div className="rank">{label || `#${i + 1}`}</div>
      </div>
      <div className="route">{routeName(o._rk)}<span className="muted"> · {o.airlines.join(", ") || "–"}</span></div>
      <div className="dates">{wd(o.depart_date)} {dcz(o.depart_date)} → {wd(o.return_date)} {dcz(o.return_date)} · {o.nights} dní</div>
      <Timeline o={o} />
      <Badges o={o} latestDay={M.latest.day} />
      <Sellers o={o} />
      <div className="why">{scoreWhy(o)}{M.days.length >= 2 ? <> · vývoj termínu: <Sparkline values={M.queryHistory(o)} w={80} h={20} /></> : null}</div>
      <Links o={o} />
      <PinButtons o={o} pins={pins} setPins={setPins} watchedKeys={watchedKeys} />
    </div>
  );
}

const TABS = [["best", "Nejlepší poměr", "Skóre = cena + penalizace za dlouhou cestu, přestupy a horší aerolinky. Čím nižší, tím lepší."], ["cheap", "Nejlevnější", "Čistě podle ceny za osobu, bez ohledu na délku cesty a přestupy."], ["fast", "Nejrychlejší", "Nejkratší cesta tam. Cena je druhotná."], ["direct", "Přímé / 1 přestup", "Jen přímé lety a lety s jedním přestupem, řazené podle skóre."]];

export default function Watch({ M }) {
  const [pins, setPinsState] = useState(loadPins);
  const setPins = (p) => { setPinsState(p); savePins(p); };
  const [tab, setTab] = useState("best");
  const WATCH = M.watch; const auto = WATCH.filter((w) => w.auto).slice(0, 5), man = WATCH.filter((w) => !w.auto);
  const watchedKeys = useMemo(() => new Set(WATCH.map((w) => w.key)), [WATCH]);
  const pool = M.fresh.filter((o) => o.score != null);
  const list = useMemo(() => {
    let l = tab === "cheap" ? sortBy(pool, "price") : tab === "fast" ? sortBy(pool, "duration_min") : tab === "direct" ? sortBy(pool.filter((o) => o.stops <= 1), "score") : sortBy(pool, "score");
    const seen = new Set(); return l.filter((o) => { const k = `${o.depart_date}|${o.price}|${o.airlines.join()}|${o.route}`; if (seen.has(k)) return false; seen.add(k); return true; }).slice(0, 6);
  }, [tab, pool]);
  const localCards = pins.map((p) => {
    const [o, d, dep, ret] = p.key.split("|");
    const cands = M.offers.filter((x) => wkey(x) === p.key);
    const same = cands.filter((x) => !p.itin || !p.itin.route || x.route === p.itin.route);
    const cur = (same.length ? same : cands).sort((a, b) => a.price - b.price)[0];
    const w = { key: p.key, origin: o, destination: d, depart_date: dep, return_date: ret, itin: p.itin, auto: false, local: true, added: p.day, price_at_add: p.price_at_pin, name: "Pin v prohlížeči", nick: p.itin && p.itin.airlines ? p.itin.airlines.join(", ") : "",
      current: cur ? { ...cur, dep_time: cur.legs && cur.legs[0] ? cur.legs[0].departure.slice(11, 16) : null } : null, same_itinerary: !!same.length, cheapest_any: cands.length ? [...cands].sort((a, b) => a.price - b.price)[0] : null,
      history: M.queryHistory({ origin: o, destination: d, depart_date: dep, return_date: ret, source: "google" }).map((m) => ({ min: m })), prev_price: null };
    return <WatchCard key={p.key} w={w} M={M} extra={<button className="btn-pin" onClick={() => setPins(pins.filter((x) => x !== p))}>odepnout</button>} />;
  });
  return (
    <section id="watch" className="panel watch">
      <div className="panel-head"><h2><span className="ico">★</span> Lety ke sledování</h2><span className="muted small">{WATCH.length ? `${auto.length} tipů · ${man.length} tvoje · priorita ve skenu` : ""}</span></div>
      <p className="intro">Jeden přehled: <strong>Tip 1–5</strong> jsou moje aktuálně nejlepší lety podle poměru cena/výkon (seřazené od nejlepšího, pak podle ceny), pod nimi <strong>tvoje piny</strong>. Všechny se kontrolují jako první, u každého je vidět, kde a jak dlouho je přestup, a při změně ceny přijde hlášení.</p>
      {!WATCH.length ? <div className="empty">Zatím nic. Po příštím skenu se sem automaticky přidají nejlepší dealy; vlastní let přidáš tlačítkem „★ Sledovat“ v části „Prozkoumat“.</div> : <>
        <div className="wgroup"><h3>Moje tipy</h3><span className="muted">Tip 1 = nejlepší poměr cena/výkon, dál podle ceny · obměňují se automaticky</span></div>
        <div className="cards">{auto.length ? auto.map((w) => <WatchCard key={w.key} w={w} M={M} />) : <div className="empty">Po příštím skenu.</div>}</div>
        <div className="wgroup"><h3>Tvoje piny</h3><span className="muted">ručně vybrané, hlídáme stejný let (aerolinky + trasa)</span></div>
        <div className="cards">{man.length ? man.map((w) => <WatchCard key={w.key} w={w} M={M} />) : <div className="empty">Zatím žádný. Klikni na „★ Sledovat (GitHub)“ u nabídky a potvrď issue.</div>}</div>
      </>}
      {pins.length ? <div className="localpins"><div className="panel-head"><h2>Připnuto jen v tomto prohlížeči</h2><span className="muted small">neovlivňuje sken; pro trvalé sledování použij ★ Sledovat (GitHub)</span></div><div className="cards">{localCards}</div></div> : null}
      <details id="deals" className="explore">
        <summary><strong>Prozkoumat další nabídky</strong> <span className="muted small">· nejlevnější, nejrychlejší, max 1 přestup · odtud přidáš vlastní pin</span></summary>
        <div className="panel-head" style={{ marginTop: 10 }}><div className="tabs" role="tablist">{TABS.map(([k, t]) => <button key={k} className="tab" role="tab" aria-selected={tab === k} onClick={() => setTab(k)}>{t}</button>)}</div></div>
        <p className="muted small">{TABS.find((t) => t[0] === tab)[2]}</p>
        <div className="cards">{list.length ? list.map((o, i) => <DealCard key={o.id + i} o={o} i={i} M={M} pins={pins} setPins={setPins} watchedKeys={watchedKeys} />) : <div className="empty">Žádné nabídky v posledním skenu.</div>}</div>
      </details>
    </section>
  );
}
