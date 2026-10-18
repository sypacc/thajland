// Sdílené kousky: badge, časová osa itineráře s přestupy, prodejci, sparkline, odkazy, piny.
import React from "react";
import { buildLinks, city, czk, dshort, dur, durShort, itinOf, kcs, LINK_NAMES, tm, watchIssue, wkey } from "../lib/format.js";

export function Badges({ o, latestDay }) {
  const b = [];
  b.push(<span key="s" className={"badge " + (o.stops === 0 ? "good" : o.stops >= 2 ? "warn" : "")}>{o.stops === 0 ? "přímý let" : o.stops === 1 ? "1 přestup" : `${o.stops} přestupy`}</span>);
  if (o.watched) b.push(<span key="w" className="badge good">★ sledováno</span>);
  if (o.is_new_route) b.push(<span key="nr" className="badge good">nová trasa v prodeji</span>);
  else if (o.is_new) b.push(<span key="n" className="badge good">nově v prodeji</span>);
  if (o.is_all_time_low) b.push(<span key="l" className="badge good">nejnižší cena dosud</span>);
  if (o.yesterday_min != null && o.price < o.yesterday_min) b.push(<span key="d" className="badge good">↓ {czk(o.yesterday_min - o.price)} od minula</span>);
  if (o.yesterday_min != null && o.price > o.yesterday_min) b.push(<span key="u" className="badge bad">↑ {czk(o.price - o.yesterday_min)} od minula</span>);
  const longLay = (o.layovers || []).find((l) => l.minutes > 300);
  if (longLay) b.push(<span key="ll" className="badge warn">dlouhý přestup {city(longLay.airport)} {durShort(longLay.minutes)}</span>);
  const shortLay = (o.layovers || []).find((l) => l.minutes > 0 && l.minutes < 60);
  if (shortLay) b.push(<span key="sl" className="badge bad">krátký přestup {durShort(shortLay.minutes)}</span>);
  if (o.duration_min && o.duration_min <= 840) b.push(<span key="f" className="badge good">rychlá cesta</span>);
  if (o.price_insight && o.price_insight.level) { const pi = o.price_insight; b.push(<span key="pi" className={"badge " + (pi.level === "nízká" ? "good" : pi.level === "vysoká" ? "bad" : "")} title="Odhad Google Flights: jak si tato cena stojí proti obvyklému rozpětí pro tento termín">Google: {pi.level} cena{pi.low && pi.high ? ` (obvykle ${kcs(pi.low)}–${kcs(pi.high)} tis.)` : ""}</span>); }
  if (o.stale) b.push(<span key="st" className="badge warn">starší data ({dshort(o.fetched_at || latestDay)})</span>);
  return <div className="badges">{b}</div>;
}

/** Časová osa cesty tam: segmenty letů a přestupy (šrafované), pod ní čitelný rozpis přestupů. */
export function Timeline({ o, detailed = false }) {
  if (!o.legs || !o.legs.length) return null;
  const total = o.duration_min || o.legs.reduce((a, l) => a + (l.duration_min || 0), 0) + (o.layovers || []).reduce((a, l) => a + (l.minutes || 0), 0);
  const first = o.legs[0], last = o.legs[o.legs.length - 1];
  const lays = o.layovers || [];
  return (
    <div className="tlwrap">
      <div className="tl" title={`cesta tam ${dur(total)}`}>
        {o.legs.map((l, i) => (
          <React.Fragment key={i}>
            <span className="leg" style={{ flex: l.duration_min || 1 }} title={`${l.from_airport}→${l.to_airport} ${dur(l.duration_min)}`} />
            {lays[i] ? <span className={"lay" + (lays[i].minutes > 300 ? " long" : lays[i].minutes < 60 ? " short" : "")} style={{ flex: Math.max(lays[i].minutes, 20) }} title={`přestup ${city(lays[i].airport)} ${dur(lays[i].minutes)}`} /> : null}
          </React.Fragment>
        ))}
      </div>
      <div className="tl-labels">
        <span><b>{tm(first.departure)}</b> {first.from_airport}</span>
        <span className="muted">{lays.length ? lays.map((l) => `${city(l.airport)} ${durShort(l.minutes)}`).join(" · ") : "přímo"} · celkem {durShort(total)}</span>
        <span><b>{tm(last.arrival)}</b> {last.to_airport}{last.arrival && first.departure && last.arrival.slice(0, 10) !== first.departure.slice(0, 10) ? " +1" : ""}</span>
      </div>
      {detailed && lays.length ? (
        <ul className="layover-list">
          {o.legs.map((l, i) => (
            <React.Fragment key={i}>
              <li><span className="seg">✈ {city(l.from_airport)} {tm(l.departure)} → {city(l.to_airport)} {tm(l.arrival)}</span><span className="muted"> · {dur(l.duration_min)}{l.plane ? " · " + l.plane : ""}</span></li>
              {lays[i] ? <li className={"lay-row" + (lays[i].minutes > 300 ? " long" : lays[i].minutes < 60 ? " short" : "")}><strong>⏱ přestup {city(lays[i].airport)} ({lays[i].airport})</strong> · {dur(lays[i].minutes)}{lays[i].minutes > 300 ? " · dlouhý, zvaž odpočinek/město" : lays[i].minutes < 60 ? " · těsný, riziko nestihnutí" : " · pohodlný"}</li> : null}
            </React.Fragment>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

export function Sellers({ o }) {
  if (!o.sellers || !o.sellers.length) return o.sellers_error ? <div className="sellers muted">Ceny prodejců se dnes nepodařilo načíst, zkusíme příště.</div> : null;
  const items = [...o.sellers].sort((a, b) => a.price - b.price).slice(0, 8);
  return <div className="sellers">Kde koupit: {items.map((x, i) => <span key={i}>{i ? " · " : ""}{i === 0 ? <strong>{x.name} {czk(x.price)}</strong> : `${x.name} ${czk(x.price)}`}</span>)}</div>;
}

export function Sparkline({ values, w = 120, h = 28 }) {
  const v = (values || []).filter((x) => x != null);
  if (v.length < 2) return <span className="muted small">{v.length ? "1 měření" : "–"}</span>;
  const min = Math.min(...v), max = Math.max(...v), span = max - min || 1;
  const pts = values.map((x, i) => x == null ? null : [2 + (i / (values.length - 1)) * (w - 4), h - 3 - ((x - min) / span) * (h - 6)]).filter(Boolean);
  const d = pts.map((p, i) => (i ? "L" : "M") + p[0].toFixed(1) + " " + p[1].toFixed(1)).join(" ");
  const last = pts[pts.length - 1];
  return <svg className="spark" viewBox={`0 0 ${w} ${h}`}><title>{v.map((x) => czk(x)).join(", ")}</title><path d={d} /><circle cx={last[0].toFixed(1)} cy={last[1].toFixed(1)} r="2.5" /></svg>;
}

export function Links({ o, primary = true }) {
  const links = o.links && o.links.kiwi ? o.links : buildLinks(o);
  return (
    <div className="links">
      {Object.entries(links).map(([k, u]) => u ? <a key={k} href={u} target="_blank" rel="noopener" className={k === "google" ? (primary ? "primary" : undefined) : "search"} title={k === "google" ? "Přesně tento dotaz na Google Flights – tam vybereš zpáteční let a prodejce" : `Otevře vyhledávání na ${LINK_NAMES[k] || k} s předvyplněným termínem (jejich ceny automaticky číst nejde)`}>{(k === "google" ? "Koupit přes " : "hledat na ") + (LINK_NAMES[k] || k)}</a> : null)}
    </div>
  );
}

export function PinButtons({ o, pins, setPins, watchedKeys }) {
  const key = wkey(o);
  const pinned = pins.some((p) => p.key === key && (!p.itin || !p.itin.route || p.itin.route === o.route));
  const toggle = () => setPins(pinned ? pins.filter((p) => !(p.key === key && (!p.itin || p.itin.route === o.route))) : [...pins, { key, itin: itinOf(o), price_at_pin: o.price, day: new Date().toISOString().slice(0, 10) }]);
  return (
    <div className="links">
      {watchedKeys.has(key) ? <span className="tag-manual">✓ sledováno</span> : <a className="btn-pin gh" href={watchIssue(o)} target="_blank" rel="noopener" title="Trvalé sledování: otevře předvyplněné GitHub issue, stačí potvrdit. Let pak má prioritu ve skenu, vlastní historii a hlášení.">★ Sledovat (GitHub)</a>}
      <button className={"btn-pin" + (pinned ? " on" : "")} onClick={toggle} title="Rychlý pin jen v tomto prohlížeči (bez GitHubu, neovlivní sken)">{pinned ? "✓ připnuto zde" : "připnout jen zde"}</button>
    </div>
  );
}

export function scoreWhy(o) {
  const b = o.score_breakdown || {}; const parts = [];
  if (b.stops < 0) parts.push("bonus za přímý let"); if (b.stops > 0) parts.push(`+${czk(b.stops)} za přestupy navíc`);
  if (b.duration > 0) parts.push(`+${czk(b.duration)} za čas nad 14 h`); if (b.layover > 0) parts.push(`+${czk(b.layover)} za přestupy`);
  if (b.airline < 0) parts.push(`−${czk(-b.airline)} bonus aerolinka`); if (b.airline > 0) parts.push(`+${czk(b.airline)} malus aerolinka`);
  return `Skóre ${czk(o.score)}: cena ${czk(o.price)}${parts.length ? " · " + parts.join(" · ") : " · bez penalizací"}`;
}
