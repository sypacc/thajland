import React from "react";
import { ago, dcz, tm } from "../lib/format.js";

export default function Header({ M }) {
  const s = M && M.latest.stats, days = M ? M.days.length : 0;
  return (
    <header className="top">
      <div className="wrap">
        <div className="brand">
          <div className="kicker">🌴 Sledování letenek</div>
          <h1>Thajsko 2027 <span className="sub">z Česka · 2 týdny · srpen–září</span></h1>
          <div className="status">
            {M ? <>
              <span>Poslední sken <strong>{dcz(M.latest.generated_at)} {tm(M.latest.generated_at)} UTC</strong> ({ago(M.latest.generated_at)})</span>
              <span><span className={s.queries_ok ? "ok" : "bad"}>{s.queries_ok} termínů s nabídkou</span> z {s.queries_total} dotazů</span>
              <span>{s.offers} nabídek</span>
              <span>historie {days} {days === 1 ? "den" : days < 5 ? "dny" : "dní"}</span>
              {s.queries_stale ? <span className="warn">{s.queries_stale} termínů převzato ze staršího běhu</span> : null}
              {s.google_disabled ? <span className="bad">Google Flights blokoval dotazy – data jsou neúplná</span> : null}
              {s.queries_error ? <span className="warn">chyb: {s.queries_error}</span> : null}
            </> : <span>Načítám data…</span>}
          </div>
        </div>
        <nav className="nav" aria-label="Sekce">
          <a href="#watch">Lety ke sledování</a><a href="#alertsPanel">Hlášení</a><a href="#deals">Prozkoumat</a><a href="#calendarPanel">Kalendář</a><a href="#trend">Vývoj</a><a href="#allPanel">Vše</a><a href="#howto">Jak číst</a>
        </nav>
      </div>
    </header>
  );
}
