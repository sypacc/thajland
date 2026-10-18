import React, { useEffect, useMemo, useState } from "react";
import { buildModel } from "./lib/analysis.js";
import { applyTheme, getTheme, setCurrency } from "./lib/format.js";
import Settings, { Toasts } from "./components/Settings.jsx";
import Header from "./components/Header.jsx";
import Verdict from "./components/Verdict.jsx";
import Watch from "./components/Watch.jsx";
import Insights from "./components/Insights.jsx";
import Alerts from "./components/Alerts.jsx";
import Calendar from "./components/Calendar.jsx";
import Trend from "./components/Trend.jsx";
import AllOffers from "./components/AllOffers.jsx";
import RunInfo from "./components/RunInfo.jsx";
import HowTo from "./components/HowTo.jsx";

const DATA_BASE = (import.meta.env.BASE_URL || "./") + "data/";

async function loadJson(name, fallback) {
  try { const r = await fetch(DATA_BASE + name, { cache: "no-store" }); if (!r.ok) return fallback; return await r.json(); } catch (e) { return fallback; }
}

applyTheme(getTheme());

export default function App() {
  const [state, setState] = useState({ loading: true, latest: null, series: { days: [] }, alerts: [] });
  const [settings, setSettings] = useState(false);
  useEffect(() => {
    (async () => {
      const [latest, series, alerts] = await Promise.all([loadJson("latest.json", null), loadJson("series.json", { days: [] }), loadJson("alerts.json", { alerts: [] })]);
      if (latest && latest.config) setCurrency(latest.config.currency);
      setState({ loading: false, latest, series, alerts: (alerts && alerts.alerts) || [] });
    })();
  }, []);
  const M = useMemo(() => state.latest && state.latest.offers ? buildModel(state.latest, state.series, state.alerts) : null, [state]);

  const chrome = <><Toasts /><Settings open={settings} onClose={() => setSettings(false)} /></>;
  if (state.loading) return <><Header onSettings={() => setSettings(true)} /><main className="wrap"><div className="panel empty">Načítám data…</div></main>{chrome}</>;
  if (!M) return <><Header onSettings={() => setSettings(true)} /><main className="wrap"><section className="hero"><div className="main info"><div className="label">Stav</div><div className="headline">Čekáme na první sken</div><div className="sub">Po prvním běhu se tu objeví verdikt, sledované lety a kalendář cen. Spusť workflow „Sken letenek do Thajska“ v záložce Actions nebo počkej na ranní běh.</div></div></section></main>{chrome}</>;

  return (
    <>
      <Header M={M} onSettings={() => setSettings(true)} />
      <main className="wrap">
        <Watch M={M} />
        <Verdict M={M} />
        <Insights M={M} />
        <Alerts M={M} />
        <Calendar M={M} />
        <Trend M={M} />
        <AllOffers M={M} />
        <RunInfo M={M} />
        <HowTo />
      </main>
      <footer className="wrap muted small">Data: <code>data/latest.json</code> · historie <code>data/history/</code> · hlášení <code>data/alerts.json</code> · sledování <code>watchlist.yaml</code> · repozitář sypacc/thajland</footer>
      {chrome}
    </>
  );
}
