// Hlavní karta sledovaného / oblíbeného letu: flight strip (odlet → přestupy → přílet), rozpis úseků, cena, vývoj, akce.
import React, { useState } from "react";
import { buildLinks, city, czk, dcz, dshort, dur, durShort, routeName, tm, wd, wkey, LINK_NAMES } from "../lib/format.js";
import { Sellers, Sparkline, FavButton } from "./Shared.jsx";
import { usePending } from "../lib/watchActions.js";
import Icon from "./Icon.jsx";

export const layKind = (min) => min < 60 ? "short" : min <= 180 ? "ok" : min <= 300 ? "mid" : "long";
const LAY_LABEL = { short: "těsný přestup, riziko nestihnutí", ok: "pohodlný přestup", mid: "delší přestup, čas na jídlo", long: "dlouhý přestup, zvaž odpočinek nebo město" };
const dayDiff = (a, b) => a && b ? Math.round((new Date(b.slice(0, 10) + "T00:00:00Z") - new Date(a.slice(0, 10) + "T00:00:00Z")) / 864e5) : 0;

export function Strip({ o, returnDate }) {
  const legs = o.legs || [], lays = o.layovers || [];
  if (!legs.length) return <div className="strip-empty">Časy letů u této nabídky dnes nejsou k dispozici. Odlet {wd(o.depart_date)} {dcz(o.depart_date)}, zpět {wd(returnDate)} {dcz(returnDate)}.</div>;
  const first = legs[0], last = legs[legs.length - 1];
  const total = o.duration_min || legs.reduce((a, l) => a + (l.duration_min || 0), 0) + lays.reduce((a, l) => a + (l.minutes || 0), 0);
  const plus = dayDiff(first.departure, last.arrival);
  // pozice přestupů na lince podle odletěného času
  let acc = 0; const stops = [];
  legs.forEach((l, i) => { acc += l.duration_min || 0; if (lays[i]) { const start = acc / total; acc += lays[i].minutes || 0; stops.push({ ...lays[i], from: start, to: acc / total, kind: layKind(lays[i].minutes) }); } });
  return (
    <div className="strip">
      <div className="strip-row">
        <div className="ep"><div className="t">{tm(first.departure)}</div><div className="c">{first.from_airport}</div><div className="n">{city(first.from_airport)}</div></div>
        <div className="path">
          <div className="meta"><span>{durShort(total)}</span><span className="sep" /><span>{lays.length ? `${lays.length}× přestup` : "přímý let"}</span></div>
          <div className="line">
            {stops.map((s, i) => <span key={i} className={"gap " + s.kind} style={{ left: `${(s.from * 100).toFixed(1)}%`, width: `${Math.max((s.to - s.from) * 100, 2).toFixed(1)}%` }} />)}
            <i className="end a" /><i className="end b" />
            {stops.map((s, i) => <span key={"l" + i} className={"stop " + s.kind} style={{ left: `${(((s.from + s.to) / 2) * 100).toFixed(1)}%` }}><b>{city(s.airport)}</b><span>{durShort(s.minutes)}</span></span>)}
          </div>
        </div>
        <div className="ep right"><div className="t">{tm(last.arrival)}{plus ? <sup>+{plus}</sup> : null}</div><div className="c">{last.to_airport}</div><div className="n">{city(last.to_airport)}</div></div>
      </div>
      <ul className="legs">
        {legs.map((l, i) => (
          <React.Fragment key={i}>
            <li className="leg"><Icon name="plane" size={14} /><span className="tt">{tm(l.departure)}</span><span className="rt">{city(l.from_airport)} <em>{l.from_airport}</em> → {city(l.to_airport)} <em>{l.to_airport}</em>{dayDiff(l.departure, l.arrival) ? <sup>+{dayDiff(l.departure, l.arrival)}</sup> : null}</span><span className="tt">{tm(l.arrival)}</span><span className="du">{durShort(l.duration_min)}{l.plane ? ` · ${l.plane}` : ""}</span></li>
            {lays[i] ? <li className={"lay " + layKind(lays[i].minutes)}><i className="d" /><span className="rt"><strong>{dur(lays[i].minutes)}</strong> v {city(lays[i].airport)} <em>{lays[i].airport}</em> · {LAY_LABEL[layKind(lays[i].minutes)]}</span></li> : null}
          </React.Fragment>
        ))}
        <li className="ret"><Icon name="back" size={14} /><span className="rt">Zpět {wd(returnDate)} {dcz(returnDate)} · zpáteční spojení vybereš na Google Flights, cena platí pro celou cestu tam i zpět</span></li>
      </ul>
    </div>
  );
}

function Chip({ d, label }) {
  if (d == null) return <span className="chip flat">{label || "první měření"}</span>;
  if (d < 0) return <span className="chip down">▼ {czk(-d)} {label}</span>;
  if (d > 0) return <span className="chip up">▲ {czk(d)} {label}</span>;
  return <span className="chip flat">beze změny {label}</span>;
}

export default function FlightCard({ w, M, rank }) {
  const [more, setMore] = useState(false);
  const pending = usePending();
  let cur = w.current; const it = w.itin || {};
  if (cur && !(cur.legs && cur.legs.length)) {
    const full = M.offers.find((x) => x.id === cur.id) || M.offers.filter((x) => wkey(x) === w.key && x.route === cur.route).sort((a, b) => a.price - b.price)[0];
    if (full) cur = { ...full, ...cur, legs: full.legs, layovers: full.layovers, duration_min: full.duration_min };
  }
  const o = { origin: w.origin, destination: w.destination, depart_date: w.depart_date, return_date: w.return_date, price: cur ? cur.price : (w.prev_price || 0), airlines: (cur && cur.airlines) || it.airlines || [], route: (cur && cur.route) || it.route, legs: (cur && cur.legs) || [], layovers: (cur && cur.layovers) || [], duration_min: cur && cur.duration_min, stops: cur && cur.stops, links: { google: cur && cur.links && cur.links.google }, id: cur && cur.id };
  const bl = buildLinks(o);
  const d = cur && w.prev_price != null ? cur.price - w.prev_price : null;
  const state = !cur ? "missing" : d < 0 ? "down" : d > 0 ? "up" : "";
  const pend = pending.find((p) => p.key === w.key);
  const title = w.nick || o.airlines.join(" + ") || "–";
  const ins = cur && cur.price_insight;
  const nHist = (w.history || []).filter((h) => (h.itin != null ? h.itin : h.min) != null).length;
  return (
    <article className={`fcard ${w.favorite ? "fav" : "tip"} ${state}`}>
      <div className="fc-top">
        <div className="fc-id">
          <div className="fc-tags">
            <span className={"tag " + (w.favorite ? "fav" : "tip")}>{w.favorite ? <><Icon name="star" size={11} fill /> Oblíbené</> : (w.name || `Tip ${rank || ""}`)}</span>
            {w.favorite && w.synced ? <span className="tag soft" title="Let je ve watchlist.yaml: priorita ve skenu a hlášení e‑mailem/Telegramem">ve skeneru</span> : null}
            {pend ? <span className="tag soft">synchronizace #{pend.issue}</span> : null}
            {cur && cur.is_all_time_low ? <span className="tag good">nejnižší cena dosud</span> : null}
          </div>
          <h3 className="fc-name">{title}</h3>
          <div className="fc-route">{routeName(`${w.origin}→${w.destination}`)}<span className="sep" />{wd(w.depart_date)} {dshort(w.depart_date)} – {wd(w.return_date)} {dcz(w.return_date)}<span className="sep" />{dayDiff(w.depart_date, w.return_date)} dní</div>
        </div>
        <div className="fc-price">
          {cur ? <><div className="p">{czk(cur.price)}<small>/os</small></div><div className="p2">{czk(cur.price * M.travelers)} pro {M.travelers}</div><Chip d={d} label={d == null ? undefined : `od ${w.prev_day ? dshort(w.prev_day) : "minula"}`} /></>
            : <><div className="p muted">–</div><div className="p2 bad">{w.prev_price ? `dnes není v nabídce, naposledy ${czk(w.prev_price)} ${w.prev_day ? dshort(w.prev_day) : ""}` : "zatím bez nabídky"}</div></>}
        </div>
      </div>
      <Strip o={{ ...o, depart_date: w.depart_date }} returnDate={w.return_date} />
      <div className="fc-foot">
        <div className="fc-hist">
          {nHist >= 2 ? <Sparkline values={(w.history || []).map((h) => h.itin != null ? h.itin : h.min)} w={120} h={30} /> : null}
          <div className="small">{w.min_seen != null ? <>min <b>{czk(w.min_seen)}</b> · max {czk(w.max_seen)} · {nHist} měření</> : <span className="muted">vývoj ceny se začne kreslit po dalším skenu</span>}{w.price_at_add != null && cur ? <> · <Chip d={cur.price - w.price_at_add} label={`od přidání ${dshort(w.added || M.latest.day)}`} /></> : null}</div>
        </div>
        {cur ? <Sellers o={cur} /> : null}
        <div className="fc-badges">
          {ins && ins.level ? <span className={"tag soft " + (ins.level === "nízká" ? "good" : ins.level === "vysoká" ? "bad" : "")}>Google: {ins.level} cena{ins.low ? ` · obvykle ${(ins.low / 1000).toFixed(1)}–${(ins.high / 1000).toFixed(1)} tis.` : ""}</span> : null}
          {cur && !w.same_itinerary && it.route ? <span className="tag warn">stejný let dnes nenalezen, ukazuji nejlevnější na termín</span> : null}
          {cur && w.cheapest_any && w.cheapest_any.price < cur.price ? <span className="tag soft">levnější na termín: {czk(w.cheapest_any.price)} · {(w.cheapest_any.airlines || []).join(", ")}</span> : null}
          {cur && cur.stale ? <span className="tag warn">cena z předchozího běhu</span> : null}
        </div>
      </div>
      <div className="fc-actions">
        {bl.google ? <a className="btn primary" href={bl.google} target="_blank" rel="noopener" title="Přesně tento dotaz na Google Flights – vybereš zpáteční let a prodejce">Koupit na Google Flights <Icon name="ext" size={14} /></a> : null}
        <FavButton o={o} />
        <button className="btn ghost" onClick={() => setMore(!more)} aria-expanded={more}>vyhledávače <Icon name="chevron" size={14} className={more ? "flip" : ""} /></button>
        {more ? <div className="links more">{["kiwi", "skyscanner", "kayak", "azair", "pelikan", "letuska"].map((k) => bl[k] ? <a key={k} className="search" href={bl[k]} target="_blank" rel="noopener" title="Otevře vyhledávání s předvyplněným termínem; jejich ceny automaticky číst nejde">{LINK_NAMES[k]}</a> : null)}</div> : null}
      </div>
    </article>
  );
}
