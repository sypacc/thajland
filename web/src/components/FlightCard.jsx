// Hlavní karta sledovaného / oblíbeného letu: odlet, přílet, přestupy, cena, vývoj, akce.
import React, { useState } from "react";
import { buildLinks, city, czk, dcz, dshort, dur, durShort, routeName, tm, wd, wkey, LINK_NAMES } from "../lib/format.js";
import { Sellers, Sparkline, FavButton } from "./Shared.jsx";
import { usePending } from "../lib/watchActions.js";

export const layKind = (min) => min < 60 ? "short" : min <= 180 ? "ok" : min <= 300 ? "mid" : "long";
const LAY_LABEL = { short: "těsný · riziko nestihnutí", ok: "pohodlný", mid: "delší, čas na jídlo", long: "dlouhý · zvaž odpočinek/město" };
const dayDiff = (a, b) => a && b ? Math.round((new Date(b.slice(0, 10) + "T00:00:00Z") - new Date(a.slice(0, 10) + "T00:00:00Z")) / 864e5) : 0;

export function Itinerary({ o, returnDate }) {
  const legs = o.legs || [], lays = o.layovers || [];
  if (!legs.length) return <div className="fc-itin muted small">Podrobný letový řád dnes není k dispozici (u této nabídky chybí časy letů). Odlet {wd(o.depart_date)} {dcz(o.depart_date)}, zpět {wd(returnDate)} {dcz(returnDate)}.</div>;
  const first = legs[0], last = legs[legs.length - 1];
  const total = o.duration_min || legs.reduce((a, l) => a + (l.duration_min || 0), 0) + lays.reduce((a, l) => a + (l.minutes || 0), 0);
  const plus = dayDiff(first.departure, last.arrival);
  return (
    <div className="fc-itin">
      <div className="fc-endpoints">
        <div className="ep"><div className="t">{tm(first.departure)}</div><div className="c">{first.from_airport}</div><div className="n">{city(first.from_airport)} · {wd(first.departure.slice(0, 10))} {dshort(first.departure)}</div></div>
        <div className="mid">
          <div className="bar">
            {legs.map((l, i) => (
              <React.Fragment key={i}>
                <span className="leg" style={{ flex: l.duration_min || 1 }} title={`${l.from_airport}→${l.to_airport} ${dur(l.duration_min)}`} />
                {lays[i] ? <span className={"lay " + layKind(lays[i].minutes)} style={{ flex: Math.max(lays[i].minutes, 25) }} title={`přestup ${city(lays[i].airport)} ${dur(lays[i].minutes)}`}><i>{lays[i].airport}</i></span> : null}
              </React.Fragment>
            ))}
          </div>
          <div className="meta">{durShort(total)} celkem · {lays.length ? `${lays.length}× přestup` : "přímý let"}</div>
        </div>
        <div className="ep right"><div className="t">{tm(last.arrival)}{plus ? <sup>+{plus}</sup> : null}</div><div className="c">{last.to_airport}</div><div className="n">{city(last.to_airport)} · {wd(last.arrival.slice(0, 10))} {dshort(last.arrival)}</div></div>
      </div>
      <ol className="fc-legs">
        {legs.map((l, i) => (
          <React.Fragment key={i}>
            <li className="leg"><span className="ic">✈</span><span><b>{tm(l.departure)}</b> {city(l.from_airport)} ({l.from_airport}) → <b>{tm(l.arrival)}</b> {city(l.to_airport)} ({l.to_airport}){dayDiff(l.departure, l.arrival) ? <sup> +{dayDiff(l.departure, l.arrival)}</sup> : null}</span><span className="muted">{dur(l.duration_min)}{l.plane ? " · " + l.plane : ""}{l.airline ? " · " + l.airline : ""}</span></li>
            {lays[i] ? <li className={"lay " + layKind(lays[i].minutes)}><span className="ic">⏱</span><span><b>Přestup {city(lays[i].airport)}</b> ({lays[i].airport}) · <b>{dur(lays[i].minutes)}</b></span><span>{LAY_LABEL[layKind(lays[i].minutes)]}</span></li> : null}
          </React.Fragment>
        ))}
      </ol>
      <div className="fc-return">↩ Zpět <b>{wd(returnDate)} {dcz(returnDate)}</b> · zpáteční spojení vybereš na Google Flights (u zpáteční ceny Google ukazuje jen cestu tam; cena je za celou cestu tam i zpět)</div>
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
  // kompaktní záznam ze skeneru nemusí mít legs – doplníme z plných nabídek
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
  return (
    <article className={`fcard ${w.favorite ? "fav" : "tip"} ${state}`}>
      <header className="fc-head">
        <div className="fc-tags">
          <span className={"fc-tag " + (w.favorite ? "fav" : "tip")}>{w.favorite ? "★ Oblíbené" : (w.name || `Tip ${rank || ""}`)}</span>
          {w.favorite && w.synced ? <span className="fc-tag sync" title="Let je zapsaný ve watchlist.yaml: má prioritu ve skenu a hlášení e‑mailem/Telegramem">⇅ ve skeneru</span> : null}
          {pend ? <span className="fc-tag sync">⏳ synchronizace (#{pend.issue})</span> : null}
          {cur && cur.is_all_time_low ? <span className="fc-tag low">nejnižší cena dosud</span> : null}
        </div>
        <div className="fc-title"><span className="fc-name">{title}</span><span className="fc-route">{routeName(`${w.origin}→${w.destination}`)}</span></div>
        <div className="fc-price">
          {cur ? <><div className="p">{czk(cur.price)}<small>/os</small></div><div className="p2">{czk(cur.price * M.travelers)} pro {M.travelers}</div><Chip d={d} label={d == null ? undefined : `od ${w.prev_day ? dshort(w.prev_day) : "minula"}`} /></>
            : <><div className="p muted">–</div><div className="p2 bad">{w.prev_price ? `dnes není v nabídce (naposledy ${czk(w.prev_price)} ${w.prev_day ? dshort(w.prev_day) : ""})` : "zatím bez nabídky"}</div></>}
        </div>
      </header>
      <div className="fc-dates">📅 <b>{wd(w.depart_date)} {dcz(w.depart_date)}</b> → <b>{wd(w.return_date)} {dcz(w.return_date)}</b> · {dayDiff(w.depart_date, w.return_date)} dní{o.route ? <> · <span className="muted">{o.route}</span></> : null}</div>
      <Itinerary o={{ ...o, depart_date: w.depart_date }} returnDate={w.return_date} />
      <div className="fc-meta">
        <div className="fc-trend">
          {(w.history || []).filter((h) => (h.itin != null ? h.itin : h.min) != null).length >= 2 ? <Sparkline values={(w.history || []).map((h) => h.itin != null ? h.itin : h.min)} w={150} h={34} /> : null}
          <div className="small">
            {w.min_seen != null ? <span>min <b>{czk(w.min_seen)}</b> · max {czk(w.max_seen)} · {(w.history || []).filter((h) => (h.itin != null ? h.itin : h.min) != null).length} měření</span> : <span className="muted">historie se začne kreslit po dalším skenu</span>}
            {w.price_at_add != null && cur ? <> · <Chip d={cur.price - w.price_at_add} label={`od přidání ${dshort(w.added || M.latest.day)}`} /></> : null}
          </div>
        </div>
        <div className="fc-badges">
          {ins && ins.level ? <span className={"badge " + (ins.level === "nízká" ? "good" : ins.level === "vysoká" ? "bad" : "")}>Google: {ins.level} cena{ins.low ? ` (obvykle ${(ins.low / 1000).toFixed(1)}–${(ins.high / 1000).toFixed(1)} tis.)` : ""}</span> : null}
          {cur && !w.same_itinerary && it.route ? <span className="badge warn">stejný let dnes nenalezen, ukazuji nejlevnější na termín</span> : null}
          {cur && w.cheapest_any && w.cheapest_any.price < cur.price ? <span className="badge">levnější na termín: {czk(w.cheapest_any.price)} ({(w.cheapest_any.airlines || []).join(", ")})</span> : null}
          {cur && cur.stale ? <span className="badge warn">cena z předchozího běhu</span> : null}
        </div>
        {cur ? <Sellers o={cur} /> : null}
      </div>
      <footer className="fc-actions">
        {bl.google ? <a className="btn-buy" href={bl.google} target="_blank" rel="noopener" title="Přesně tento dotaz na Google Flights – vybereš zpáteční let a prodejce">Koupit přes Google Flights ↗</a> : null}
        <FavButton o={o} />
        <button className="btn-more" onClick={() => setMore(!more)} aria-expanded={more}>{more ? "méně ▴" : "další vyhledávače ▾"}</button>
        {more ? <div className="links fc-more">{["kiwi", "skyscanner", "kayak", "azair", "pelikan", "letuska"].map((k) => bl[k] ? <a key={k} className="search" href={bl[k]} target="_blank" rel="noopener" title="Otevře vyhledávání s předvyplněným termínem; jejich ceny automaticky číst nejde">hledat na {LINK_NAMES[k]}</a> : null)}</div> : null}
      </footer>
    </article>
  );
}
