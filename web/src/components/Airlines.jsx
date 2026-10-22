// Hodnocení aerolinek: subjektivní úprava skóre z config.yaml (scoring.airline_adjust_czk) převedená na hvězdičky,
// doplněná tím, co o každé aerolince říkají dnešní nabídky (počet, nejlevnější termín, přímé lety, délka cesty).
import React, { useMemo, useState } from "react";
import { czk, dshort, durShort, median, routeName } from "../lib/format.js";

// Google někdy vrací jiný název než config (např. „THAI“ místo „Thai Airways“); skener hledá název z configu
// jako podřetězec názvu aerolinky, tady navíc několik známých aliasů, aby hodnocení sedělo i na dashboardu.
const ALIASES = { thai: "thai airways", swiss: "swiss" };

function adjustFor(name, adjust) {
  const low = name.toLowerCase();
  for (const [k, v] of Object.entries(adjust)) if (k.toLowerCase() === low || low.includes(k.toLowerCase())) return { value: +v, matched: k };
  const alias = ALIASES[low];
  if (alias) for (const [k, v] of Object.entries(adjust)) if (k.toLowerCase() === alias) return { value: +v, matched: k, alias: true };
  return null;
}
const starsOf = (adj) => adj == null ? 3 : Math.max(1, Math.min(5, Math.round((3 - adj / 800) * 2) / 2));
const labelOf = (st, adj) => adj == null ? "bez hodnocení" : st >= 4.5 ? "prémiová" : st >= 3.5 ? "velmi dobrá" : st >= 3 ? "standardní" : st >= 2 ? "slabší" : "nedoporučená";
const Stars = ({ n }) => { const full = Math.floor(n), half = n % 1 >= 0.5; return <span className="stars" title={`${n} z 5`}>{"★".repeat(full)}{half ? "½" : ""}{"☆".repeat(5 - full - (half ? 1 : 0))}</span>; };

export default function Airlines({ M }) {
  const { fresh, latest, travelers } = M;
  const [onlyRated, setOnlyRated] = useState(false);
  const adjust = (latest.config.scoring && latest.config.scoring.airline_adjust_czk) || {};
  const prefNames = new Set(((latest.config.preferred || {}).airlines) || []);
  const peerNames = new Set(((latest.config.preferred || {}).peers) || []);
  const rows = useMemo(() => {
    const by = {};
    for (const o of fresh) for (const a of o.airlines) { if (!a) continue; (by[a] ||= { name: a, any: [], pure: [] }).any.push(o); if (o.airlines.every((x) => x === a)) by[a].pure.push(o); }
    return Object.values(by).map((r) => {
      const adj = adjustFor(r.name, adjust);
      const base = r.pure.length ? r.pure : r.any;
      const cheapest = [...base].sort((a, b) => a.price - b.price)[0];
      const best = [...base].filter((o) => o.score != null).sort((a, b) => a.score - b.score)[0] || null;
      const stars = starsOf(adj && adj.value);
      const isPref = prefNames.has(r.name) || (adj && prefNames.has(adj.matched));
      const isPeer = peerNames.has(r.name) || (adj && peerNames.has(adj.matched));
      return {
        name: r.name, adj, stars, label: isPref ? "preferovaná" : labelOf(stars, adj && adj.value), isPref, isPeer,
        count: r.any.length, pure: r.pure.length, cheapest, best,
        direct: base.filter((o) => o.stops === 0).length, oneStop: base.filter((o) => o.stops <= 1).length,
        medPrice: median(base.map((o) => o.price)), medDur: median(base.map((o) => o.duration_min)),
        routes: [...new Set(base.map((o) => o._rk))].length, lows: base.filter((o) => o.is_all_time_low).length,
      };
    }).filter((r) => !onlyRated || r.adj).sort((a, b) => b.stars - a.stars || (a.isPref ? -1 : b.isPref ? 1 : 0) || a.cheapest.price - b.cheapest.price);
  }, [fresh, adjust, onlyRated]); // eslint-disable-line react-hooks/exhaustive-deps
  const unrated = rows.filter((r) => !r.adj).length;
  return (
    <section className="panel" id="airlines" aria-label="Hodnocení aerolinek">
      <div className="panel-head">
        <div>
          <h2>Hodnocení aerolinek</h2>
          <p className="intro">Hvězdičky vycházejí z <strong>bonusu či malusu</strong>, který skener každé aerolince připočítává ke skóre (<code>config.yaml → scoring.airline_adjust_czk</code>, záporné = lepší). Je to tvoje subjektivní hodnocení kvality, ne cena. Zbytek řádku říká, co dnes aerolinka reálně nabízí (ceny za osobu, „obvykle“ = medián dnešních nabídek).</p>
        </div>
        <label className="sortsel"><input type="checkbox" checked={onlyRated} onChange={(e) => setOnlyRated(e.target.checked)} /> jen hodnocené</label>
      </div>
      <div className="table-wrap">
        <table className="airlines">
          <thead><tr><th>Aerolinka</th><th>Hodnocení · vliv na skóre</th><th>Nabídek</th><th>Nejlevněji /os</th><th>Nejlepší skóre</th><th>Obvykle</th></tr></thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.name} className={r.isPref ? "pref" : ""}>
                <td><strong>{r.name}</strong>{r.isPref ? <> <span className="tag fav">★ preferovaná</span></> : r.isPeer ? <> <span className="tag">prémiová skupina</span></> : null}{r.adj && r.adj.alias ? <span className="muted small" title={`v configu jako „${r.adj.matched}“`}> *</span> : null}</td>
                <td><Stars n={r.stars} /> <span className={"small " + (r.stars >= 4 ? "good" : r.stars < 2.5 ? "bad" : "muted")}>{r.label}</span><div className={"small " + (r.adj ? (r.adj.value < 0 ? "good" : r.adj.value > 0 ? "bad" : "muted") : "muted")}>{r.adj ? (r.adj.value < 0 ? "−" + czk(-r.adj.value) + " ke skóre" : "+" + czk(r.adj.value) + " ke skóre") : "bez vlivu na skóre"}</div></td>
                <td className="num">{r.pure || r.count}<div className="small muted">{r.pure ? (r.count > r.pure ? `+${r.count - r.pure} komb.` : "celá cesta") : "jen v kombinaci"}{r.lows ? <span className="good" title="nabídky na historickém minimu"> · {r.lows}× min</span> : null}</div></td>
                <td className="num"><strong>{r.cheapest.links && r.cheapest.links.google ? <a href={r.cheapest.links.google} target="_blank" rel="noopener" title="ověřit na Google Flights">{czk(r.cheapest.price)}</a> : czk(r.cheapest.price)}</strong><div className="small muted">{routeName(r.cheapest._rk)} · {dshort(r.cheapest.depart_date)}–{dshort(r.cheapest.return_date)}</div></td>
                <td className="num">{r.best ? <>{czk(r.best.score)}<div className="small muted">{czk(r.best.price)} · {r.best.stops === 0 ? "přímý" : r.best.stops + "× přestup"} · {durShort(r.best.duration_min)}</div></> : "–"}</td>
                <td className="num">{czk(r.medPrice)}<div className="small muted">tam {durShort(r.medDur)} · {r.routes} {r.routes === 1 ? "trasa" : r.routes < 5 ? "trasy" : "tras"}{r.direct ? <span className="good"> · {r.direct} přímých</span> : null}</div></td>
              </tr>
            ))}
            {!rows.length ? <tr><td colSpan="6" className="empty">V posledním skenu nejsou žádné nabídky.</td></tr> : null}
          </tbody>
        </table>
      </div>
      <p className="muted small">Hodnocení: 5★ prémiová (bonus od 1 000 Kč), 4★ velmi dobrá (bonus 200–800 Kč), 3★ standardní nebo bez záznamu v configu{unrated ? ` (dnes ${unrated})` : ""}, 2★ slabší (malus do 1 000 Kč), 1★ nedoporučená (malus nad 1 000 Kč). „V kombinaci“ = aerolinka letí jen část cesty s jinou. Hvězdička „*“ u názvu: Google aerolinku pojmenovává jinak než config (např. „THAI“ vs. „Thai Airways“). Přidat či změnit hodnocení = upravit <code>airline_adjust_czk</code> v <code>config.yaml</code>; projeví se v dalším skenu.</p>
    </section>
  );
}
