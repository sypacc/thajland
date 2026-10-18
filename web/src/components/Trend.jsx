import React, { useEffect, useRef } from "react";
import Chart from "chart.js/auto";
import { czk, dshort, routeName } from "../lib/format.js";
import { Sparkline } from "./Shared.jsx";

const cssVar = (v) => getComputedStyle(document.documentElement).getPropertyValue(v).trim();

function HistoryChart({ M }) {
  const ref = useRef(null);
  useEffect(() => {
    const { days, routeOrder } = M;
    if (!ref.current) return;
    Chart.defaults.color = cssVar("--text-2"); Chart.defaults.borderColor = cssVar("--grid"); Chart.defaults.font.family = getComputedStyle(document.body).fontFamily;
    const routes = routeOrder.filter((r) => days.some((d) => d.routes[r.replace("→", "-")]));
    const chart = new Chart(ref.current, { type: "line", data: { labels: days.map((d) => dshort(d.day)), datasets: routes.map((r) => ({ label: routeName(r), data: days.map((d) => (d.routes[r.replace("→", "-")] || {}).min ?? null), borderColor: cssVar(`--s${(routeOrder.indexOf(r) % 6) + 1}`), backgroundColor: cssVar(`--s${(routeOrder.indexOf(r) % 6) + 1}`) })) }, options: {
      responsive: true, maintainAspectRatio: false, animation: false, interaction: { mode: "index", intersect: false },
      plugins: { legend: { display: false }, tooltip: { callbacks: { title: (it) => "sken " + it[0].label, label: (c) => ` ${c.dataset.label}: ${czk(c.parsed.y)}` } } },
      scales: { x: { grid: { display: false }, ticks: { maxRotation: 0, autoSkip: true } }, y: { ticks: { maxTicksLimit: 7, callback: (v) => (v / 1000).toFixed(1).replace(".", ",") + " tis." }, grid: { color: cssVar("--grid") } } },
      elements: { line: { borderWidth: 2, tension: .2, spanGaps: true }, point: { radius: 3, hoverRadius: 6, hitRadius: 10 } } } });
    return () => chart.destroy();
  }, [M]);
  return <div className="chart-wrap"><canvas ref={ref} role="img" aria-label="Graf vývoje nejnižší ceny po trasách" /></div>;
}

export default function Trend({ M }) {
  const { days, routeOrder, routeVerdict } = M;
  const last = days[days.length - 1];
  const dayDate = (d) => new Date(d.day + "T00:00:00Z");
  const back = (n) => { if (!last) return null; const t = dayDate(last).getTime() - n * 864e5; let best = null; for (const d of days) if (dayDate(d).getTime() <= t) best = d; return best; };
  const prev = days.length >= 2 ? days[days.length - 2] : null, d7 = back(7), d30 = back(30);
  const Delta = ({ now, then }) => { if (now == null || then == null) return <td className="muted">–</td>; const diff = now - then, pct = then ? (diff / then) * 100 : 0; return <td className={"num " + (diff < 0 ? "trend-down" : diff > 0 ? "trend-up" : "")}>{diff > 0 ? "+" : ""}{czk(diff)} ({pct > 0 ? "+" : ""}{pct.toFixed(0)} %)</td>; };
  const routes = routeOrder.filter((r) => days.some((d) => d.routes[r.replace("→", "-")]));
  return (
    <section className="panel" id="trend">
      <div className="panel-head"><h2>Vývoj ceny v čase</h2><span className="muted small">{days.length ? `${days.length} měření · ${dshort(days[0].day)} – ${dshort(last.day)}` : ""}</span></div>
      <div className="table-wrap">
        <table id="overview">
          <thead><tr><th>Trasa</th><th>Dnes</th><th>vs. minule</th><th>vs. 7 dní</th><th>vs. 30 dní</th><th>Minimum</th><th>Maximum</th><th>Vývoj</th><th>Verdikt</th></tr></thead>
          <tbody>
            {!days.length ? <tr><td colSpan="9" className="empty">Zatím žádná historie.</td></tr> : routeOrder.map((r, ri) => {
              const k = r.replace("→", "-"); const series = days.map((d) => (d.routes[k] || {}).min ?? null);
              if (!series.some((x) => x != null)) return null;
              const v = routeVerdict(r); let now = series[series.length - 1]; if (v.cur != null) now = v.cur;
              let minV = Infinity, minD = null, maxV = -Infinity, maxD = null;
              days.forEach((d, i) => { const x = series[i]; if (x == null) return; if (x < minV) { minV = x; minD = d.day; } if (x > maxV) { maxV = x; maxD = d.day; } });
              return (
                <tr key={r}>
                  <td><span style={{ color: `var(--s${(ri % 6) + 1})` }}>● </span>{routeName(r)}</td>
                  <td className="num"><strong>{czk(now)}</strong></td>
                  <Delta now={now} then={prev ? (prev.routes[k] || {}).min : null} /><Delta now={now} then={d7 ? (d7.routes[k] || {}).min : null} /><Delta now={now} then={d30 ? (d30.routes[k] || {}).min : null} />
                  <td className="num">{isFinite(minV) ? `${czk(minV)} (${dshort(minD)})` : "–"}</td>
                  <td className="num">{isFinite(maxV) ? `${czk(maxV)} (${dshort(maxD)})` : "–"}</td>
                  <td><Sparkline values={series} /></td>
                  <td className={v.state === "good" ? "verdict-down" : v.state === "warn" ? "verdict-up" : "verdict-flat"}>{v.label}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {days.length ? <HistoryChart M={M} /> : null}
      <div className="legend">{routes.map((r) => <span key={r} style={{ "--c": `var(--s${(routeOrder.indexOf(r) % 6) + 1})` }}>{routeName(r)}</span>)}{days.length < 2 ? <span className="muted" style={{ "--c": "transparent" }}>Křivky se vykreslí po dalších denních bězích.</span> : null}</div>
    </section>
  );
}
