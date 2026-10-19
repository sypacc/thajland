// Hlášení: nahoře to, co přibylo v posledním skenu (nebo prázdný stav), dole starší hlášení seskupená po dnech.
import React, { useState } from "react";
import { city, czk, dcz, dshort, wd, wkey } from "../lib/format.js";
import { FavButton } from "./Shared.jsx";
import Icon from "./Icon.jsx";

function nowPrice(M, a) {
  const xs = M.offers.filter((o) => wkey(o) === wkey(a));
  return xs.length ? Math.min(...xs.map((o) => o.price)) : null;
}

function AlertRow({ a, M, fresh }) {
  const now = fresh ? a.price : nowPrice(M, a);
  const d = !fresh && now != null ? now - a.price : null;
  const o = { origin: a.origin, destination: a.destination, depart_date: a.depart_date, return_date: a.return_date, price: now ?? a.price, airlines: a.airlines || [], route: a.route, links: a.links };
  return (
    <div className={"alert " + (a.severity || "") + (fresh ? " fresh" : " old")}>
      <div className="a-price">
        <div className="p">{czk(a.price)}<small>/os</small></div>
        {!fresh ? (now == null ? <span className="chip up">dnes není v nabídce</span> : d === 0 ? <span className="chip flat">stále {czk(now)}</span> : d < 0 ? <span className="chip down">▼ teď {czk(now)}</span> : <span className="chip up">▲ teď {czk(now)}</span>) : null}
      </div>
      <div className="a-body">
        <div className="a-kind"><span className={"tag " + (a.severity === "high" ? "good" : a.severity === "medium" ? "warn" : "soft")}>{a.kind_label || a.kind}</span>{a.watch_name ? <span className="tag fav">{a.watch_name}</span> : null}</div>
        <div className="a-title">{city(a.origin)} → {city(a.destination)}<span className="sep" />{wd(a.depart_date)} {dshort(a.depart_date)} – {wd(a.return_date)} {dcz(a.return_date)}<span className="sep" />{a.nights} dní</div>
        <div className="a-sub">{(a.airlines || []).join(", ") || "–"}{a.route ? ` · ${a.route}` : ""}{a.stops == null ? "" : " · " + (a.stops === 0 ? "přímý" : a.stops === 1 ? "1 přestup" : a.stops + " přestupy")}</div>
        <div className="a-reason">{a.reason}</div>
      </div>
      <div className="a-actions">
        {a.links && a.links.google ? <a className="btn primary sm" href={a.links.google} target="_blank" rel="noopener">Koupit <Icon name="ext" size={13} /></a> : null}
        <FavButton o={o} compact />
      </div>
    </div>
  );
}

export default function Alerts({ M }) {
  const A = M.alerts, today = M.latest.day;
  const fresh = A.filter((a) => a.day === today), older = A.filter((a) => a.day !== today);
  const [showAll, setShowAll] = useState(false);
  const target = (M.cfg.alerts || {}).target_price || 15000;
  const groups = []; older.forEach((a) => { const g = groups[groups.length - 1]; if (g && g.day === a.day) g.items.push(a); else groups.push({ day: a.day, items: [a] }); });
  const visible = showAll ? groups : groups.slice(0, 1);
  const hidden = older.length - visible.reduce((n, g) => n + g.items.length, 0);
  return (
    <section id="alertsPanel" className="panel" aria-label="Hlášení">
      <div className="panel-head"><h2>Hlášení</h2><span className="muted small">hranice {czk(target)}/os · pokles ≥ 12 % · abnormálně nízko vs. historie · změny sledovaných</span></div>

      <div className="a-group fresh">
        <div className="a-group-head"><span className="pulse" /><h3>Nové od posledního skenu</h3><span className="muted small">{wd(today)} {dcz(today)}</span>{fresh.length ? <span className="cnt">{fresh.length}</span> : null}</div>
        {fresh.length ? <div className="alerts">{fresh.map((a, i) => <AlertRow key={a.id || i} a={a} M={M} fresh />)}</div>
          : <div className="a-empty"><Icon name="check" size={16} /><div><strong>Dnes nic nového.</strong><div className="muted small">Žádná cena nespadla pod {czk(target)}/os ani se neobjevil jiný zajímavý pohyb. Přehled se obnoví po ranním skenu.</div></div></div>}
      </div>

      {older.length ? (
        <div className="a-group old">
          <div className="a-group-head"><h3>Starší hlášení</h3><span className="muted small">{older.length} · u každého vidíš, kolik stojí dnes</span></div>
          {visible.map((g) => (
            <div key={g.day} className="a-day">
              <div className="a-day-label">{wd(g.day)} {dcz(g.day)}</div>
              <div className="alerts">{g.items.map((a, i) => <AlertRow key={a.id || i} a={a} M={M} />)}</div>
            </div>
          ))}
          {hidden > 0 ? <button className="btn ghost sm" onClick={() => setShowAll(true)}>zobrazit dalších {hidden}</button> : null}
        </div>
      ) : null}
    </section>
  );
}
