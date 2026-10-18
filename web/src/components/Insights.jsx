import React from "react";
import { insights } from "../lib/analysis.js";

export default function Insights({ M }) {
  const items = insights(M);
  return (
    <section id="insights" className="panel insights" aria-label="Postřehy">
      <div className="panel-head"><h2>Postřehy z dat</h2><span className="muted small">spočítané z posledního skenu a historie</span></div>
      {items.length ? <ul>{items.map((t, i) => <li key={i} dangerouslySetInnerHTML={{ __html: t }} />)}</ul> : <div className="empty">Postřehy se objeví, jakmile budou nabídky.</div>}
    </section>
  );
}
