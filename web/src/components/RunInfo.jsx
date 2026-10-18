import React from "react";
import { city, dcz, dshort } from "../lib/format.js";

export default function RunInfo({ M }) {
  const s = M.latest.stats, c = M.cfg, q = M.queries;
  const errs = q.filter((x) => x.status === "error"), empty = q.filter((x) => x.status === "empty" || (x.status === "ok" && !x.count));
  return (
    <details className="panel" id="runPanel">
      <summary><h2>Stav skenu a pokrytí termínů</h2><span className="muted small">{s.queries_ok} z {s.queries_total} dotazů s nabídkou · {Math.round(s.duration_s / 60)} min</span></summary>
      <div className="small">
        <div className="cover">{M.coverage.map((m) => <div key={m.month} className="chip"><div><strong>{m.name}</strong> · {m.okDates} z {m.dates} dnů odletu má nabídky</div><div className="bar"><i style={{ width: `${m.dates ? (m.okDates / m.dates) * 100 : 0}%` }} /></div></div>)}</div>
        <p>Plán: {c.origins.map(city).join(", ")} → {c.destinations.map(city).join(", ")}, odlety {dcz(c.depart_from)} – {dcz(c.depart_to)} po {c.depart_step_days} dnech, délky {c.trip_lengths.join("/")} dní, max. {c.max_stops ?? "∞"} přestupů, zdroje: {c.sources.join(", ")}.</p>
        <p>Dotazů {s.queries_total}: s nabídkou {s.queries_ok}, bez výsledků {empty.length}, chyb {errs.length}, přeskočeno {s.queries_skipped}, převzato ze staršího běhu {s.queries_stale}, nově v prodeji {s.queries_new || 0}.</p>
        {empty.length ? <details><summary className="muted">Termíny bez výsledků ({empty.length}) – typicky ještě neotevřený prodej</summary><p className="small muted">{empty.map((x) => `${x.origin}→${x.destination} ${dshort(x.depart_date)}–${dshort(x.return_date)}`).join(", ")}</p></details> : null}
        {errs.length ? <details><summary>Chyby ({errs.length})</summary><ul className="small">{errs.slice(0, 30).map((x, i) => <li key={i}>{x.source} {x.origin}→{x.destination} {x.depart_date}: {x.error || x.status}</li>)}</ul></details> : null}
      </div>
    </details>
  );
}
