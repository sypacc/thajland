import React from "react";
import { ago, dcz, tm } from "../lib/format.js";
import { ThemeToggle } from "./Settings.jsx";
import { useFavorites } from "../lib/favorites.js";
import Icon from "./Icon.jsx";

export default function Header({ M, onSettings }) {
  const s = M && M.latest.stats, days = M ? M.days.length : 0;
  const favs = useFavorites();
  return (
    <header className="top">
      <div className="wrap topbar">
        <a className="logo" href="#top">Thajsko <span>2027</span></a>
        <nav className="nav" aria-label="Sekce">
          <a href="#watch" className="nav-main"><Icon name="star" size={13} fill /> Sledované{favs.length ? <span className="cnt">{favs.length}</span> : null}</a>
          <a href="#verdict">Verdikt</a><a href="#alertsPanel">Hlášení</a><a href="#calendarPanel">Kalendář</a><a href="#trend">Vývoj</a><a href="#allPanel">Vše</a><a href="#airlines">Aerolinky</a><a href="#howto">Jak číst</a>
        </nav>
        <div className="tools">
          <ThemeToggle />
          {onSettings ? <button className="icon-btn" onClick={onSettings} title="Nastavení" aria-label="Nastavení"><Icon name="gear" size={17} /></button> : null}
        </div>
      </div>
      <div className="wrap statusbar">
        {M ? <>
          <span className={"dot " + (s.google_disabled ? "bad" : s.queries_error > 20 ? "warn" : "ok")} />
          <span>Sken {dcz(M.latest.generated_at)} {tm(M.latest.generated_at)} UTC · {ago(M.latest.generated_at)}</span>
          <span className="sep" /><span>{s.queries_ok} z {s.queries_total} termínů s nabídkou</span>
          <span className="sep" /><span>{s.offers} nabídek</span>
          <span className="sep" /><span>historie {days} {days === 1 ? "den" : days < 5 ? "dny" : "dní"}</span>
          {s.queries_stale ? <><span className="sep" /><span className="warn">{s.queries_stale} převzato ze staršího běhu</span></> : null}
          {s.google_disabled ? <><span className="sep" /><span className="bad">Google blokoval dotazy, data jsou neúplná</span></> : null}
        </> : <span>Načítám data…</span>}
      </div>
    </header>
  );
}
