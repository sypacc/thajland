// Hlavní sekce: sledované tipy skeneru + tvoje oblíbené, s letovým řádem, vývojem ceny a akcemi.
import React, { useEffect, useMemo, useState } from "react";
import { czk, dcz, dshort, routeName, sortBy, wd } from "../lib/format.js";
import { loadSeen, resolveFavorite, saveSeen, toggleFavorite, useFavorites } from "../lib/favorites.js";
import { Badges, Links, FavButton, Sellers, Sparkline, Timeline, scoreWhy } from "./Shared.jsx";
import FlightCard from "./FlightCard.jsx";

export function DealCard({ o, i, M, label }) {
  return (
    <div className={"card" + (i === 0 ? " rank1" : "")}>
      <div className="head">
        <div><div className="price">{czk(o.price)}<span className="muted small"> /os</span></div><div className="total">{czk(o.price * M.travelers)} pro {M.travelers} · skóre {czk(o.score)}</div></div>
        <div className="rank">{label || `#${i + 1}`}</div>
      </div>
      <div className="route">{routeName(o._rk)}<span className="muted"> · {o.airlines.join(", ") || "–"}</span></div>
      <div className="dates">{wd(o.depart_date)} {dcz(o.depart_date)} → {wd(o.return_date)} {dcz(o.return_date)} · {o.nights} dní</div>
      <Timeline o={o} detailed />
      <Badges o={o} latestDay={M.latest.day} />
      <Sellers o={o} />
      <div className="why">{scoreWhy(o)}{M.days.length >= 2 ? <> · vývoj termínu: <Sparkline values={M.queryHistory(o)} w={80} h={20} /></> : null}</div>
      <Links o={o} />
      <div className="links"><FavButton o={o} /></div>
    </div>
  );
}

const TABS = [["best", "Nejlepší poměr", "Skóre = cena + penalizace za dlouhou cestu, přestupy a horší aerolinky. Čím nižší, tím lepší."], ["cheap", "Nejlevnější", "Čistě podle ceny za osobu, bez ohledu na délku cesty a přestupy."], ["fast", "Nejrychlejší", "Nejkratší cesta tam. Cena je druhotná."], ["direct", "Přímé / 1 přestup", "Jen přímé lety a lety s jedním přestupem, řazené podle skóre."]];
const SORTS = [["rec", "doporučené"], ["price", "nejlevnější"], ["dur", "nejkratší cesta"], ["dep", "nejbližší odlet"], ["delta", "největší zlevnění"]];

function useChanges(items, M) {
  // co se stalo s oblíbenými od poslední návštěvy (pamatujeme si naposledy viděnou cenu)
  const [snap] = useState(() => loadSeen());
  const changes = useMemo(() => items.filter((w) => w.favorite).map((w) => {
    const prev = snap[w.favKey]; const cur = w.current ? w.current.price : null;
    if (!prev) return null;
    if (cur == null && prev.price != null) return { w, kind: "gone", prev: prev.price, day: prev.day };
    if (cur != null && prev.price != null && cur !== prev.price) return { w, kind: cur < prev.price ? "down" : "up", d: cur - prev.price, day: prev.day };
    return null;
  }).filter(Boolean), [items, snap]);
  useEffect(() => {
    const next = { ...snap };
    items.filter((w) => w.favorite).forEach((w) => { next[w.favKey] = { price: w.current ? w.current.price : null, day: M.latest.day }; });
    saveSeen(next);
  }, [items, M.latest.day]); // eslint-disable-line react-hooks/exhaustive-deps
  return changes;
}

export default function Watch({ M }) {
  const favs = useFavorites();
  const [view, setView] = useState("all");
  const [sort, setSort] = useState("rec");
  const [tab, setTab] = useState("best");
  const [hideChanges, setHideChanges] = useState(false);
  const WATCH = M.watch;
  const tips = useMemo(() => WATCH.filter((w) => w.auto).slice(0, 5).map((w, i) => ({ ...w, rank: i + 1, favorite: false })), [WATCH]);
  const manualByKey = useMemo(() => new Map(WATCH.filter((w) => !w.auto).map((w) => [w.key, w])), [WATCH]);
  const favorites = useMemo(() => {
    const local = favs.map((f) => resolveFavorite(f, M, manualByKey.get(f.key)));
    const seen = new Set(local.map((x) => x.key));
    // ručně sledované ve watchlist.yaml (např. z jiného zařízení) ukážeme také jako oblíbené
    const remote = [...manualByKey.values()].filter((w) => !seen.has(w.key)).map((w) => ({ ...w, favorite: true, synced: true, favKey: `${w.key}#${(w.itin && w.itin.route) || ""}`, name: "Oblíbené" }));
    return [...local, ...remote];
  }, [favs, M, manualByKey]);
  const all = useMemo(() => [...tips, ...favorites], [tips, favorites]);
  const changes = useChanges(all, M);
  const shown = useMemo(() => {
    let l = view === "tips" ? tips : view === "fav" ? favorites : all;
    const price = (w) => w.current ? w.current.price : Infinity;
    if (sort === "price") l = [...l].sort((a, b) => price(a) - price(b));
    else if (sort === "dur") l = [...l].sort((a, b) => ((a.current && a.current.duration_min) || 1e9) - ((b.current && b.current.duration_min) || 1e9));
    else if (sort === "dep") l = [...l].sort((a, b) => a.depart_date.localeCompare(b.depart_date));
    else if (sort === "delta") l = [...l].sort((a, b) => ((a.current && a.prev_price != null) ? a.current.price - a.prev_price : 1e9) - ((b.current && b.prev_price != null) ? b.current.price - b.prev_price : 1e9));
    return l;
  }, [view, sort, tips, favorites, all]);
  const pool = M.fresh.filter((o) => o.score != null);
  const list = useMemo(() => {
    let l = tab === "cheap" ? sortBy(pool, "price") : tab === "fast" ? sortBy(pool, "duration_min") : tab === "direct" ? sortBy(pool.filter((o) => o.stops <= 1), "score") : sortBy(pool, "score");
    const seen = new Set(); return l.filter((o) => { const k = `${o.depart_date}|${o.price}|${o.airlines.join()}|${o.route}`; if (seen.has(k)) return false; seen.add(k); return true; }).slice(0, 6);
  }, [tab, pool]);
  const bestTip = tips.find((w) => w.current);
  const addBest = () => { const c = bestTip && bestTip.current; if (c) toggleFavorite({ ...c, origin: bestTip.origin, destination: bestTip.destination, depart_date: bestTip.depart_date, return_date: bestTip.return_date }); };
  const favTotal = favorites.filter((w) => w.current).reduce((a, w) => a + w.current.price, 0);

  return (
    <section id="watch" className="panel watch main">
      <div className="panel-head">
        <div>
          <h2><span className="ico">★</span> Sledované a oblíbené</h2>
          <p className="intro">Hlavní přehled. <strong>Tipy</strong> vybírá skener každý den sám (nejlepší poměr cena/výkon), <strong>oblíbené</strong> si ukládáš hvězdičkou – hned, bez přihlašování. U každého letu vidíš odlet, přílet, kde a jak dlouho je přestup a jak se hýbe cena.</p>
        </div>
        <div className="fc-controls">
          <div className="seg" role="tablist">
            <button role="tab" aria-selected={view === "all"} onClick={() => setView("all")}>Vše <span className="cnt">{all.length}</span></button>
            <button role="tab" aria-selected={view === "tips"} onClick={() => setView("tips")}>Tipy skeneru <span className="cnt">{tips.length}</span></button>
            <button role="tab" aria-selected={view === "fav"} onClick={() => setView("fav")}>★ Oblíbené <span className="cnt">{favorites.length}</span></button>
          </div>
          <label className="sortsel">Řadit <select value={sort} onChange={(e) => setSort(e.target.value)}>{SORTS.map(([k, t]) => <option key={k} value={k}>{t}</option>)}</select></label>
        </div>
      </div>

      {changes.length && !hideChanges ? (
        <div className="changes">
          <div className="changes-head"><strong>Od tvé poslední návštěvy</strong> <span className="muted small">(stav k {dcz(changes[0].day)})</span><button className="btn-more" onClick={() => setHideChanges(true)}>skrýt</button></div>
          <ul>{changes.map((c) => <li key={c.w.favKey}>{c.kind === "gone" ? <span className="chip up">zmizel z nabídky</span> : c.kind === "down" ? <span className="chip down">▼ {czk(-c.d)}</span> : <span className="chip up">▲ {czk(c.d)}</span>} {routeName(`${c.w.origin}→${c.w.destination}`)} · {dshort(c.w.depart_date)}–{dshort(c.w.return_date)} · {(c.w.itin && c.w.itin.airlines || []).join(", ")}{c.kind !== "gone" ? <span className="muted"> · teď {czk(c.w.current.price)}</span> : <span className="muted"> · naposledy {czk(c.prev)}</span>}</li>)}</ul>
        </div>
      ) : null}

      {view !== "tips" && !favorites.length ? (
        <div className="fav-empty">
          <div className="big">☆</div>
          <div>
            <strong>Zatím nemáš žádný oblíbený let.</strong>
            <div className="small muted">Klikni na „☆ Do oblíbených“ u kteréhokoliv tipu nebo nabídky. Uloží se okamžitě v tomto prohlížeči a hned uvidíš, jak se mu mění cena.</div>
            <div className="links" style={{ marginTop: 8 }}>
              {bestTip ? <button className="btn-fav" onClick={addBest}>☆ Přidat Tip 1 ({czk(bestTip.current.price)})</button> : null}
              <a className="search" href="#deals" onClick={() => { const d = document.getElementById("deals"); if (d) d.open = true; }}>prozkoumat další nabídky</a>
            </div>
          </div>
        </div>
      ) : null}

      {shown.length ? <div className="fcards">{shown.map((w) => <FlightCard key={(w.favorite ? "f" : "t") + (w.favKey || w.key)} w={w} M={M} rank={w.rank} />)}</div>
        : view === "tips" ? <div className="empty">Tipy se vyberou po příštím skenu.</div> : null}

      {favorites.length > 1 && favTotal ? <div className="fc-sum small muted">Součet tvých oblíbených: {czk(favTotal)}/os · {czk(favTotal * M.travelers)} pro {M.travelers} (jen lety, které jsou dnes v nabídce)</div> : null}

      <details id="deals" className="explore">
        <summary><strong>Prozkoumat další nabídky</strong> <span className="muted small">· nejlevnější, nejrychlejší, max 1 přestup · odtud přidáš oblíbené</span></summary>
        <div className="panel-head" style={{ marginTop: 10 }}><div className="tabs" role="tablist">{TABS.map(([k, t]) => <button key={k} className="tab" role="tab" aria-selected={tab === k} onClick={() => setTab(k)}>{t}</button>)}</div></div>
        <p className="muted small">{TABS.find((t) => t[0] === tab)[2]}</p>
        <div className="cards">{list.length ? list.map((o, i) => <DealCard key={o.id + i} o={o} i={i} M={M} />) : <div className="empty">Žádné nabídky v posledním skenu.</div>}</div>
      </details>
    </section>
  );
}
