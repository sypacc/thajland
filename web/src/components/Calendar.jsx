import React, { useMemo, useState } from "react";
import { addDays, czk, dcz, dday, kcs, MONTHS, routeName, sortBy, wd } from "../lib/format.js";
import { DealCard } from "./Watch.jsx";
import { loadPins, savePins } from "../lib/format.js";

export default function Calendar({ M }) {
  const { queries, offers, fresh, routeOrder, cfg, HORIZON, HORIZON_DAYS, opensOn } = M;
  const [sel, setSel] = useState(null);
  const [pins, setPinsState] = useState(loadPins);
  const setPins = (p) => { setPinsState(p); savePins(p); };
  const watchedKeys = useMemo(() => new Set(M.watch.map((w) => w.key)), [M.watch]);
  const model = useMemo(() => {
    const planDates = [...new Set(queries.map((q) => q.depart_date))].sort();
    const cellMin = {}, cellStale = {}, cellStatus = {}, cellNew = {};
    for (const q of queries) {
      const k = `${q.origin}→${q.destination}|${q.depart_date}`;
      const st = q.status === "ok" && q.count ? "ok" : q.status === "empty" ? "empty" : q.status;
      cellStatus[k] = cellStatus[k] === "ok" || st === "ok" ? "ok" : (cellStatus[k] === "empty" || st === "empty" ? "empty" : st);
      if (q.is_new) cellNew[k] = true;
    }
    for (const o of offers) { const k = `${o._rk}|${o.depart_date}`; if (o.price < (cellMin[k] ?? Infinity)) { cellMin[k] = o.price; cellStale[k] = !!o.stale; } }
    const vals = Object.values(cellMin); const lo = Math.min(...vals), hi = Math.max(...vals);
    const globalMin = Math.min(...fresh.map((o) => o.price), Infinity);
    return { planDates, cellMin, cellStale, cellStatus, cellNew, lo, hi, globalMin, months: [...new Set(planDates.map((d) => d.slice(0, 7)))] };
  }, [queries, offers, fresh]);
  const minLen = Math.min(...(cfg.trip_lengths || [14]));
  const detail = sel ? (() => { const [r, d] = sel.split("|"); const dayOffers = offers.filter((o) => o._rk === r && o.depart_date === d && o.score != null); const list = sortBy(dayOffers, "score").slice(0, 3); const perLen = cfg.trip_lengths.map((n) => { const xs = dayOffers.filter((o) => o.nights === n); return `${n} dní: ${xs.length ? czk(Math.min(...xs.map((o) => o.price))) : "–"}`; }).join(" · "); return { r, d, list, perLen }; })() : null;
  return (
    <section className="panel" id="calendarPanel">
      <div className="panel-head"><h2><span className="ico">📅</span> Kalendář cen</h2><span className="muted small">nejnižší cena/os pro den odletu · klikni na políčko</span></div>
      <div className="calendar">
        {model.months.map((ym) => {
          const dates = model.planDates.filter((d) => d.startsWith(ym));
          return (
            <table key={ym} className="cal">
              <tbody>
                <tr><th className="month">{MONTHS[+ym.slice(5, 7)]} {ym.slice(0, 4)}</th>{dates.map((d) => <th key={d} className={wd(d) === "so" || wd(d) === "ne" ? "wknd" : undefined}><div>{dday(d)}.</div><div className="muted">{wd(d)}</div></th>)}</tr>
                {routeOrder.map((r, ri) => (
                  <tr key={r}>
                    <th className="row"><span style={{ color: `var(--s${(ri % 6) + 1})` }}>● </span>{routeName(r)}</th>
                    {dates.map((d) => {
                      const k = `${r}|${d}`, v = model.cellMin[k], st = model.cellStatus[k];
                      if (v == null) {
                        const minRet = addDays(d, minLen), future = minRet > HORIZON;
                        return <td key={d}>{future ? <div className="cell future" title={`${routeName(r)} ${dcz(d)}: mimo prodejní okno aerolinek (${HORIZON_DAYS} dní dopředu). Nejkratší pobyt se dá hledat od ≈ ${dcz(opensOn(minRet))}.`}>→</div> : <div className={"cell " + (st === "empty" ? "nosale" : "none")} title={st === "empty" ? `${routeName(r)} ${dcz(d)}: v prodejním okně, ale Google zatím nenabízí žádné spojení` : `${routeName(r)} ${dcz(d)}: nezjištěno (dotaz neproběhl)`}>{st === "empty" ? "·" : "?"}</div>}</td>;
                      }
                      const p = model.hi > model.lo ? 90 - ((v - model.lo) / (model.hi - model.lo)) * 80 : 50;
                      return <td key={d}><div className={"cell" + (p > 55 ? " dark" : "") + (model.cellStale[k] ? " stale" : "") + (v === model.globalMin ? " min" : "") + (model.cellNew[k] ? " new" : "") + (sel === k ? " sel" : "")} style={{ "--p": `${p.toFixed(0)}%` }} title={`${routeName(r)} · odlet ${dcz(d)}: od ${czk(v)}/os${model.cellNew[k] ? " · nově v prodeji" : ""}${model.cellStale[k] ? " (starší data)" : ""}`} onClick={() => setSel(sel === k ? null : k)}>{kcs(v)}</div></td>;
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          );
        })}
      </div>
      <div className="legend small">Cena v tisících Kč/os (nejlevnější ze všech délek pobytu): nejlevnější<i className="ramp" />nejdražší<span style={{ "--c": "transparent", marginLeft: 14 }}>→ = mimo prodejní okno ({HORIZON_DAYS} dní dopředu), otevře se postupně</span><span style={{ "--c": "transparent" }}>· = v okně, ale Google nenabízí spojení</span><span style={{ "--c": "transparent" }}>★ = nejnižší cena skenu</span><span style={{ "--c": "var(--good)" }}>zelený rámeček = nově v prodeji</span><span style={{ "--c": "transparent" }}>bledé = starší data</span></div>
      {detail ? <div className="cal-detail"><div className="panel-head"><h2>{routeName(detail.r)} · odlet {wd(detail.d)} {dcz(detail.d)}</h2><span className="muted small">nejnižší cena podle délky pobytu: {detail.perLen}</span></div><div className="cards">{detail.list.map((o, i) => <DealCard key={o.id} o={o} i={i} M={M} pins={pins} setPins={setPins} watchedKeys={watchedKeys} />)}</div></div> : null}
    </section>
  );
}
