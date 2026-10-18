import React, { useMemo, useState } from "react";
import { city, czk, dcz, durShort, sortBy, wd } from "../lib/format.js";
import { Badges, Links, PinButtons, Sellers, Sparkline, Timeline, scoreWhy } from "./Shared.jsx";

const PRESETS = [["Vše", {}], ["Max 1 přestup", { stops: "1" }], ["Do 20 000 Kč", { maxPrice: "20000", sort: "price" }], ["Jen srpen", { month: "8" }], ["Jen září", { month: "9" }], ["Nejrychlejší", { sort: "duration_min" }]];
const EMPTY = { origin: "", dest: "", stops: "", nights: "", month: "", maxPrice: "", sort: "score", stale: "1" };

export default function AllOffers({ M }) {
  const { offers, travelers } = M;
  const [F, setF] = useState(EMPTY);
  const [shown, setShown] = useState(60);
  const [open, setOpen] = useState({});
  const [sortKey, setSortKey] = useState(null); const [sortDir, setSortDir] = useState(1);
  const watchedKeys = useMemo(() => new Set(M.watch.map((w) => w.key)), [M.watch]);
  const uniq = (k) => [...new Set(offers.map((o) => o[k]))].sort();
  const rows = useMemo(() => sortBy(offers.filter((o) => (!F.origin || o.origin === F.origin) && (!F.dest || o.destination === F.dest) && (F.stops === "" || o.stops <= +F.stops) && (!F.nights || String(o.nights) === F.nights) && (!F.month || o._month === +F.month) && (!F.maxPrice || o.price <= +F.maxPrice) && (F.stale === "1" || !o.stale)), sortKey || F.sort, sortDir), [offers, F, sortKey, sortDir]);
  const th = (k, t) => <th onClick={() => { if (sortKey === k) setSortDir(-sortDir); else { setSortKey(k); setSortDir(1); } }} style={{ cursor: "pointer" }}>{t}{sortKey === k ? (sortDir > 0 ? " ▲" : " ▼") : ""}</th>;
  const Sel = ({ k, label, opts }) => <label>{label}<select value={F[k]} onChange={(e) => setF({ ...F, [k]: e.target.value })}>{opts.map(([v, t]) => <option key={v} value={v}>{t}</option>)}</select></label>;
  return (
    <details className="panel" id="allPanel">
      <summary><h2>Všechny nabídky <span className="muted">({rows.length})</span></h2><span className="muted small">filtry, řazení, detail každého itineráře</span></summary>
      <div className="presets">{PRESETS.map(([t, f]) => <button key={t} className="tab" onClick={() => setF({ ...EMPTY, ...f })}>{t}</button>)}</div>
      <div className="filters">
        <Sel k="origin" label="Odkud" opts={[["", "vše"], ...uniq("origin").map((v) => [v, `${city(v)} (${v})`])]} />
        <Sel k="dest" label="Kam" opts={[["", "vše"], ...uniq("destination").map((v) => [v, `${city(v)} (${v})`])]} />
        <Sel k="stops" label="Max. přestupů" opts={[["", "libovolně"], ["0", "přímý"], ["1", "max 1"], ["2", "max 2"]]} />
        <Sel k="nights" label="Délka (dní)" opts={[["", "vše"], ...uniq("nights").map((v) => [String(v), String(v)])]} />
        <Sel k="month" label="Měsíc odletu" opts={[["", "srpen + září"], ["8", "srpen"], ["9", "září"]]} />
        <Sel k="sort" label="Řadit podle" opts={[["score", "skóre (cena/výkon)"], ["price", "ceny"], ["depart_date", "data odletu"], ["duration_min", "délky cesty"]]} />
        <Sel k="stale" label="Starší data" opts={[["1", "zobrazit"], ["0", "skrýt"]]} />
        <label>Max. cena/os<input type="number" placeholder="např. 20000" min="0" step="500" value={F.maxPrice} onChange={(e) => setF({ ...F, maxPrice: e.target.value })} /></label>
      </div>
      <div className="table-wrap">
        <table id="table">
          <thead><tr>{th("score", "Skóre")}{th("price", "Cena/os")}<th>Celkem</th>{th("depart_date", "Odlet")}<th>Návrat</th><th>Trasa</th><th>Aerolinky</th>{th("stops", "Přestupy")}{th("duration_min", "Cesta tam")}<th>Trend</th><th></th></tr></thead>
          <tbody>
            {!rows.length ? <tr><td colSpan="11" className="empty">Žádné nabídky pro zvolené filtry.</td></tr> : rows.slice(0, shown).map((o) => {
              const trend = o.yesterday_min == null ? "–" : o.price < o.yesterday_min ? `↓ ${czk(o.yesterday_min - o.price)}` : o.price > o.yesterday_min ? `↑ ${czk(o.price - o.yesterday_min)}` : "=";
              const cls = o.yesterday_min == null ? "" : o.price < o.yesterday_min ? "trend-down" : o.price > o.yesterday_min ? "trend-up" : "";
              return (
                <React.Fragment key={o.id + o._i}>
                  <tr>
                    <td className="num">{czk(o.score)}</td><td className="num"><strong>{czk(o.price)}</strong></td><td className="num">{czk(o.price * travelers)}</td>
                    <td>{wd(o.depart_date)} {dcz(o.depart_date)}</td><td>{dcz(o.return_date)} ({o.nights} d)</td><td>{o.route}</td><td>{o.airlines.join(", ") || "–"}</td><td className="num">{o.stops}</td><td>{durShort(o.duration_min)}</td>
                    <td className={cls}>{trend}{o.is_all_time_low ? " ★" : ""}{o.stale ? " (starší)" : ""}</td>
                    <td><button className="toggle" onClick={() => setOpen({ ...open, [o._i]: !open[o._i] })}>detail</button></td>
                  </tr>
                  {open[o._i] ? <tr className="detail"><td colSpan="11"><Timeline o={o} detailed /><Badges o={o} latestDay={M.latest.day} /><Sellers o={o} /><div className="why">{scoreWhy(o)}</div><div className="small muted">Vývoj ceny tohoto termínu: <Sparkline values={M.queryHistory(o)} /></div><Links o={o} /><PinButtons o={o} /></td></tr> : null}
                </React.Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
      {rows.length > shown ? <button className="btn" onClick={() => setShown(shown + 100)}>Zobrazit další</button> : null}
    </details>
  );
}
