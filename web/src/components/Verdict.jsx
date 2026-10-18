import React from "react";
import { czk, dcz, dshort, durShort, routeName, sortBy } from "../lib/format.js";

export default function Verdict({ M }) {
  const { fresh, routeOrder, routeVerdict, days, latest, travelers, queries, HORIZON } = M;
  const best = sortBy(fresh.filter((o) => o.score != null), "score")[0];
  const cheapest = sortBy(fresh, "price")[0];
  const rv = routeOrder.map((r) => ({ r, ...routeVerdict(r) }));
  const states = rv.map((x) => x.state);
  let cls = "info", headline, sub;
  if (!best) { headline = "Dnes žádné nabídky"; sub = "Buď ještě není otevřený prodej, nebo sken selhal. Podrobnosti ve stavu skenu dole."; }
  else if (states.includes("good")) { cls = "good"; headline = `Dobrá chvíle na nákup: ${rv.filter((x) => x.state === "good").map((x) => routeName(x.r)).join(", ")}`; sub = "Cena je na historickém minimu a výrazně pod obvyklou úrovní. Ověř přes odkaz u nabídky a kupuj."; }
  else if (states.every((s) => s === "info" || s === "none")) { headline = `Zatím sbíráme data · nejlepší nabídka ${czk(best.price)}/os`; sub = `Verdikt „kupovat / počkat“ dává smysl až po ~5 denních měřeních (máme ${days.length}). Do té doby ber ceny jako výchozí úroveň.`; }
  else if (states.includes("warn") && !states.includes("fair")) { cls = "warn"; headline = "Spíš počkat – ceny jsou nad obvyklou úrovní"; sub = "Historická minima byla níž. Hlášení přijde, jakmile cena spadne."; }
  else { headline = `Férové ceny · nejlepší nabídka ${czk(best.price)}/os`; sub = "Nic abnormálně levného. Sledujeme dál, hlášení přijde při poklesu."; }
  const inWin = queries.filter((q) => !(q.beyond_horizon || q.return_date > HORIZON));
  const inWinDates = new Set(inWin.map((q) => q.depart_date)), inWinOk = new Set(inWin.filter((q) => q.status === "ok" && q.count).map((q) => q.depart_date));
  const allDates = new Set(queries.map((q) => q.depart_date));
  let delta = null;
  if (days.length >= 2) { const minOf = (d) => Math.min(...Object.values(d.routes).map((r) => r.min).filter((x) => x != null)); const a = minOf(days[days.length - 2]), b = minOf(days[days.length - 1]); if (isFinite(a) && isFinite(b)) delta = [a, b]; }
  return (
    <section id="verdict" className="hero" aria-label="Verdikt">
      <div className={"main " + cls}>
        <div className="label">Verdikt k {dcz(latest.day)}</div>
        <div className="headline">{headline}</div>
        <div className="sub">{sub}</div>
        {best ? <div className="sub"><strong>Nejlepší poměr: </strong>{czk(best.price)}/os · {routeName(best._rk)} · {dshort(best.depart_date)}–{dshort(best.return_date)} · {best.airlines.join(", ")} · {best.stops === 0 ? "přímý" : best.stops + "× přestup"} · tam {durShort(best.duration_min)}</div> : null}
        {cheapest && best && cheapest.id !== best.id ? <div className="sub"><strong>Nejlevnější: </strong>{czk(cheapest.price)}/os · {routeName(cheapest._rk)} · {dshort(cheapest.depart_date)} · {cheapest.airlines.join(", ")} · tam {durShort(cheapest.duration_min)}</div> : null}
      </div>
      <div className="routes">
        {rv.map((x, i) => (
          <div key={x.r} className={"rv " + x.state}>
            <span className="dot" style={{ "--c": `var(--s${(i % 6) + 1})` }} />
            <div><span className="name">{routeName(x.r)}</span> <span className="price">{x.cur != null ? czk(x.cur) : "–"}</span></div>
            <div className="state">{x.label}{x.med && x.days >= 5 ? ` · obvykle ${czk(x.med)}` : ""}</div>
          </div>
        ))}
      </div>
      <div className="routes">
        {best ? <div className="kpi"><div className="label">Pro {travelers} os.</div><div className="value">{czk(best.price * travelers)}</div><div className="hint">nejlepší poměr × počet cestujících</div></div> : null}
        <div className="kpi"><div className="label">Termíny v prodeji</div><div className="value">{inWinOk.size}/{inWinDates.size}</div><div className="hint">dnů odletu s nabídkou z těch, které už aerolinky prodávají · {allDates.size - inWinDates.size} dnů čeká na otevření prodeje</div></div>
        {delta ? <div className="kpi"><div className="label">Minimum vs. minule</div><div className="value">{(delta[1] - delta[0] > 0 ? "+" : "") + czk(delta[1] - delta[0])}</div><div className="hint">{czk(delta[0])} → {czk(delta[1])}</div></div> : null}
      </div>
    </section>
  );
}
