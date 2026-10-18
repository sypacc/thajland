import React from "react";
import { city, czk, dcz, LINK_NAMES } from "../lib/format.js";

export default function Alerts({ M }) {
  const A = M.alerts, today = M.latest.day, todays = A.filter((a) => a.day === today);
  return (
    <section id="alertsPanel" className="panel" aria-label="Hlášení">
      <div className="panel-head"><h2><span className="ico">🔔</span> Hlášení</h2><span className="muted small">{A.length ? `${todays.length} dnes · ${A.length} celkem` : ""}</span></div>
      {!A.length ? <div className="alerts"><div className="empty">Zatím žádné hlášení. Přijde, jakmile cena spadne pod {czk((M.cfg.alerts || {}).target_price || 15000)}/os, prudce klesne od minula, bude výrazně pod historií termínu, nebo se změní cena sledovaného letu.</div></div> : (
        <div className="alerts">
          {A.slice(0, 10).map((a, i) => (
            <div key={a.id || i} className={"alert " + (a.severity || "")}>
              <div className="price">{czk(a.price)}<span className="muted small"> /os</span></div>
              <div className="when">{(a.day === today ? "dnes" : dcz(a.day)) + " · " + (a.kind_label || a.kind)}</div>
              <div className="body">
                <div className="title">{a.watch_name ? a.watch_name + " · " : ""}{city(a.origin)} → {city(a.destination)} · {dcz(a.depart_date)} – {dcz(a.return_date)} ({a.nights} dní) · {(a.airlines || []).join(", ") || "–"}{a.stops == null ? "" : " · " + (a.stops === 0 ? "přímý" : a.stops === 1 ? "1 přestup" : a.stops + " přestupy")}</div>
                <div className="reason">{a.reason}</div>
                <div className="links">{Object.entries(a.links || {}).slice(0, 5).map(([k, u], j) => <a key={k} href={u} target="_blank" rel="noopener" className={j === 0 ? "primary" : undefined}>{LINK_NAMES[k] || k}</a>)}</div>
              </div>
            </div>
          ))}
          {A.length > 10 ? <div className="muted small">… a dalších {A.length - 10} starších v data/alerts.json</div> : null}
        </div>
      )}
    </section>
  );
}
