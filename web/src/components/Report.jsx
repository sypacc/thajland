// Report vývoje ceny a výhled: co říkají nasbíraná data (po trasách, aerolinkách a měsících) a typování
// dalšího postupu podle obvyklé sezónnosti letenek Evropa → Thajsko. Čím víc dní sběru, tím přesnější.
import React from "react";
import { addDays, czk, dcz, dshort, median, MONTHS, routeName } from "../lib/format.js";
import { Sparkline } from "./Shared.jsx";

const pct = (now, then) => (now != null && then ? ((now - then) / then) * 100 : null);
const Delta = ({ now, then, label }) => {
  const p = pct(now, then);
  if (p == null) return <span className="muted">–</span>;
  const cls = p < -0.5 ? "trend-down" : p > 0.5 ? "trend-up" : "muted";
  return <span className={cls}>{p > 0 ? "+" : ""}{p.toFixed(0)} %{label ? <span className="muted"> {label}</span> : null}</span>;
};
const roundTo = (x, step = 500) => Math.round(x / step) * step;

// Obvyklá sezónnost: kdy aerolinky z Perského zálivu a Turecka zlevňují a kdy už ceny spíš rostou.
// Odhad z obecné zkušenosti s letenkami Evropa → Asie na léto, ne z našich dat (ta sbíráme teprve od října 2026).
function windows(today, departFrom) {
  const y = +today.slice(0, 4);
  const lastFriday = (yy, m) => { const d = new Date(Date.UTC(yy, m, 0)); while (d.getUTCDay() !== 5) d.setUTCDate(d.getUTCDate() - 1); return d.toISOString().slice(0, 10); };
  const bf = lastFriday(y, 11);
  const list = [
    { from: bf, to: addDays(bf, 4), name: "Black Friday a Cyber Monday", who: "Qatar, Emirates, Etihad, Turkish", what: "nejčastější velký výprodej na léto, typicky −10 až −20 % z běžné ceny" },
    { from: `${y + 1}-01-04`, to: `${y + 1}-01-31`, name: "Novoroční výprodeje", who: "Qatar (New Year sale), Emirates, Etihad, Turkish, Finnair", what: "druhá velká vlna slev, letenky na léto bývají nejlevněji ze zimy" },
    { from: `${y + 1}-03-01`, to: `${y + 1}-04-15`, name: "Jarní akce", who: "Etihad, Emirates, Oman Air, Turkish", what: "kratší akce a cílené slevy na konkrétní trasy" },
    { from: addDays(departFrom, -150), to: addDays(departFrom, -90), name: "3–5 měsíců před odletem", who: "všechny", what: "obvykle poslední období s dobrou cenou, pak kapacita na srpen mizí" },
    { from: addDays(departFrom, -90), to: addDays(departFrom, -30), name: "Poslední 3 měsíce", who: "všechny", what: "ceny na srpen spíš rostou, slevy jsou vzácné; kupovat při prvním poklesu" },
  ];
  return list.filter((w) => w.to >= today).map((w) => ({ ...w, inDays: Math.round((new Date(w.from + "T00:00:00Z") - new Date(today + "T00:00:00Z")) / 864e5) }));
}

export default function Report({ M }) {
  const { days, cfg, routeOrder, latest, fresh, pref } = M;
  if (!days.length) return null;
  const last = days[days.length - 1], first = days[0], n = days.length;
  const today = latest.day;
  const dayDate = (d) => new Date(d.day + "T00:00:00Z");
  const back = (k) => { const t = dayDate(last).getTime() - k * 864e5; let best = null; for (const d of days) if (dayDate(d).getTime() <= t) best = d; return best; };
  const d7 = back(7), d30 = back(30);
  const minOf = (d) => { const v = Object.values(d.routes || {}).map((r) => r.min).filter((x) => x != null); return v.length ? Math.min(...v) : null; };
  const overall = days.map(minOf);
  const todayMin = overall[n - 1];
  let allMin = Infinity, allMinDay = null; days.forEach((d, i) => { if (overall[i] != null && overall[i] < allMin) { allMin = overall[i]; allMinDay = d.day; } });
  const med = median(overall);
  const spread = overall.filter((x) => x != null); const vol = spread.length > 2 ? (Math.max(...spread) - Math.min(...spread)) / med * 100 : null;

  // trasy
  const routeRows = routeOrder.map((r) => { const k = r.replace("→", "-"); const s = days.map((d) => (d.routes[k] || {}).min ?? null); if (!s.some((x) => x != null)) return null; let mn = Infinity, mnD = null; days.forEach((d, i) => { if (s[i] != null && s[i] < mn) { mn = s[i]; mnD = d.day; } }); return { r, s, now: s[n - 1], w: d7 ? (d7.routes[k] || {}).min : null, m: d30 ? (d30.routes[k] || {}).min : null, min: mn, minDay: mnD, med: median(s) }; }).filter(Boolean);
  // aerolinky (preferovaná + prémiová skupina + ostatní s dostatkem dat)
  const airNames = [...new Set([...(pref ? pref.cfg.airlines : []), ...(pref ? pref.cfg.peers : []), ...days.flatMap((d) => Object.keys(d.airlines || {}))])];
  const airRows = airNames.map((a) => { const s = days.map((d) => ((d.airlines || {})[a] || {}).min ?? null); const have = s.filter((x) => x != null).length; if (have < Math.min(3, n)) return null; let mn = Infinity, mnD = null; days.forEach((d, i) => { if (s[i] != null && s[i] < mn) { mn = s[i]; mnD = d.day; } }); const exact = pref && pref.cfg.airlines.includes(a) && pref.overall ? pref.overall.price : (pref && (pref.peers.find((p) => p.name === a) || {}).best || {}).price; return { a, s, now: exact ?? s[n - 1], w: d7 ? ((d7.airlines || {})[a] || {}).min : null, min: Math.min(mn, exact ?? Infinity), minDay: mnD, isPref: pref && pref.cfg.airlines.includes(a), isPeer: pref && pref.cfg.peers.includes(a) }; }).filter(Boolean).sort((x, y) => (y.isPref - x.isPref) || (y.isPeer - x.isPeer) || x.now - y.now).slice(0, 8);
  // měsíce
  const months = ["08", "09"].map((m) => { const s = days.map((d) => (d.months || {})[m] ?? null); if (!s.some((x) => x != null)) return null; return { m, name: MONTHS[+m], now: s[n - 1], w: d7 ? (d7.months || {})[m] : null, min: Math.min(...s.filter((x) => x != null)), s }; }).filter(Boolean);

  // výhled
  const departFrom = cfg.depart_from;
  const toDep = Math.round((new Date(departFrom + "T00:00:00Z") - new Date(today + "T00:00:00Z")) / 864e5);
  const target = pref && pref.cfg.target_price;
  const prefNow = pref && pref.overall ? pref.overall.price : null;
  const peerBest = pref ? pref.peers.filter((p) => p.best).sort((a, b) => a.best.price - b.best.price)[0] : null;
  const wins = windows(today, departFrom);
  const next = wins[0];
  let phase, advice, cls = "info";
  if (prefNow != null && target && prefNow <= target) { cls = "good"; phase = "Cena je pod cílem"; advice = `${pref.name} je dnes za ${czk(prefNow)}/os, tedy pod tvým cílem ${czk(target)}. Ověř přes odkaz u nabídky a kupuj; na další výprodej nemá smysl čekat.`; }
  else if (toDep > 240) { phase = "Startovní ceny, 8+ měsíců před odletem"; advice = `Aerolinky teprve otevírají prodej na srpen a září, ceny jsou „ceníkové“ a mění se po stokorunách. Tady se kupuje jen při mimořádném poklesu pod cíl; jinak čekej na ${next ? next.name.toLowerCase() : "výprodej"}${next && next.inDays > 0 ? ` (za ${next.inDays} dní, ${dcz(next.from)}–${dcz(next.to)})` : ""}.`; }
  else if (toDep > 150) { phase = "Výprodejové okno, 5–8 měsíců před odletem"; advice = "Tohle je období, kdy letní dálkové letenky bývají nejlevněji. Kupuj při poklesu pod cíl nebo na dosavadní minimum; další pokles už nemusí přijít."; }
  else if (toDep > 90) { phase = "3–5 měsíců před odletem"; advice = "Poslední období s dobrou cenou. Kupuj při prvním poklesu, kapacita na srpen z Prahy a Vídně mizí a ceny spíš porostou."; }
  else { cls = "warn"; phase = "Méně než 3 měsíce do odletu"; advice = "Ceny na srpen rostou, slevy jsou vzácné. Kupuj hned to nejlepší, co dnes vidíš."; }
  const expect = prefNow != null ? [roundTo(prefNow * 0.82), roundTo(prefNow * 0.92)] : null;
  const expectPeer = peerBest ? [roundTo(peerBest.best.price * 0.82), roundTo(peerBest.best.price * 0.92)] : null;

  return (
    <section id="report" className="panel report" aria-label="Report a výhled">
      <div className="panel-head">
        <div><h2>Report a výhled</h2><p className="intro">Co říkají nasbíraná data o vývoji ceny a co z toho (a z obvyklé sezónnosti) typujeme dál. Report se přepočítá po každém skenu.</p></div>
        <span className="muted small">k {dcz(last.day)} · {n}. den sběru · od {dshort(first.day)}</span>
      </div>

      <div className="report-kpis">
        <div className="kpi"><div className="label">Nejnižší cena dnes</div><div className="value">{czk(todayMin)}</div><div className="hint"><Delta now={todayMin} then={d7 ? minOf(d7) : null} label="za 7 dní" />{d30 ? <> · <Delta now={todayMin} then={minOf(d30)} label="za 30 dní" /></> : null}</div></div>
        <div className="kpi"><div className="label">Minimum za sledování</div><div className="value">{isFinite(allMin) ? czk(allMin) : "–"}</div><div className="hint">{allMinDay ? `${dcz(allMinDay)}${allMinDay === last.day ? " · dnes" : ""}` : ""} · medián {czk(med)}</div></div>
        {pref && pref.overall ? <div className="kpi pref"><div className="label">{pref.name} dnes</div><div className="value">{czk(prefNow)}</div><div className="hint">{target ? `cíl ${czk(target)} · ` : ""}{routeName(pref.overall._rk)} · {dshort(pref.overall.depart_date)}–{dshort(pref.overall.return_date)}</div></div> : null}
        {peerBest ? <div className="kpi"><div className="label">Nejlevnější z prémiových</div><div className="value">{czk(peerBest.best.price)}</div><div className="hint">{peerBest.name} · {routeName(peerBest.best._rk)} · {dshort(peerBest.best.depart_date)}–{dshort(peerBest.best.return_date)}</div></div> : null}
        <div className="kpi"><div className="label">Kolísání</div><div className="value">{vol != null ? `${vol.toFixed(0)} %` : "–"}</div><div className="hint">{vol == null ? "po 3 měřeních" : vol < 5 ? "ceny jsou stabilní, nic velkého se neděje" : vol < 15 ? "mírné pohyby, sleduj hlášení" : "velké výkyvy, sledujeme denně"}</div></div>
      </div>

      <div className="report-cols">
        <div>
          <h3>Vývoj po trasách</h3>
          <div className="table-wrap"><table className="report-table">
            <thead><tr><th>Trasa</th><th>Dnes</th><th>7 dní</th><th>30 dní</th><th>Minimum</th><th>Medián</th><th>Vývoj</th></tr></thead>
            <tbody>{routeRows.map((x, i) => <tr key={x.r}><td><span style={{ color: `var(--s${(i % 6) + 1})` }}>● </span>{routeName(x.r)}</td><td className="num"><strong>{czk(x.now)}</strong></td><td className="num"><Delta now={x.now} then={x.w} /></td><td className="num"><Delta now={x.now} then={x.m} /></td><td className="num">{czk(x.min)} <span className="muted small">{dshort(x.minDay)}</span></td><td className="num">{czk(x.med)}</td><td><Sparkline values={x.s} /></td></tr>)}</tbody>
          </table></div>
          <h3>Vývoj po aerolinkách</h3>
          <div className="table-wrap"><table className="report-table">
            <thead><tr><th>Aerolinka</th><th>Dnes</th><th>7 dní</th><th>Minimum</th><th>Vývoj</th></tr></thead>
            <tbody>{airRows.map((x) => <tr key={x.a} className={x.isPref ? "pref" : ""}><td><strong>{x.a}</strong>{x.isPref ? <span className="tag fav"> ★ preferovaná</span> : x.isPeer ? <span className="tag"> prémiová</span> : null}</td><td className="num"><strong>{czk(x.now)}</strong></td><td className="num"><Delta now={x.now} then={x.w} /></td><td className="num">{isFinite(x.min) ? czk(x.min) : "–"} <span className="muted small">{x.minDay ? dshort(x.minDay) : ""}</span></td><td><Sparkline values={x.s} /></td></tr>)}</tbody>
          </table></div>
          <p className="muted small">Křivky aerolinek vycházejí z nejlevnější nabídky každého termínu (kde daná aerolinka vyhrála), dnešní hodnota preferované a prémiových je přesné minimum ze skenu.{months.length ? <> Nejlevnější odlet: {months.map((m) => `${m.name} ${czk(m.now)}`).join(", ")}.</> : null}</p>
        </div>
        <div className={"report-outlook " + cls}>
          <div className="label">Výhled · {toDep} dní do prvního odletu ({dcz(departFrom)})</div>
          <div className="headline">{phase}</div>
          <p>{advice}</p>
          {expect ? <p><strong>Typ, kam se cena může dostat:</strong> ve výprodeji bývá sleva 8–18 %, tedy {pref.name} zhruba <strong>{czk(expect[0])}–{czk(expect[1])}</strong>{expectPeer ? <>, {peerBest.name} <strong>{czk(expectPeer[0])}–{czk(expectPeer[1])}</strong></> : null}. Pod {target ? czk(target) : "cíl"} přijde hlášení automaticky.</p> : null}
          <h3>Co nás čeká</h3>
          <ul className="windows">{wins.slice(0, 4).map((w) => <li key={w.name}><strong>{w.name}</strong> <span className="muted small">{dshort(w.from)}–{dshort(w.to)}{w.inDays > 0 ? ` · za ${w.inDays} dní` : " · právě teď"}</span><div className="small">{w.what} <span className="muted">({w.who})</span></div></li>)}</ul>
          <p className="muted small">Typování vychází z obvyklé sezónnosti letenek Evropa → Thajsko a z výprodejových zvyklostí aerolinek, ne z našich dat z minulých let (ta nemáme, sbíráme od {dcz(first.day)}). Srpen a září jsou v Thajsku období dešťů (slabší poptávka tam), ale evropské prázdniny drží ceny nahoře; proto se vyplatí koupit ve výprodeji, ne čekat na poslední chvíli.</p>
        </div>
      </div>
    </section>
  );
}
