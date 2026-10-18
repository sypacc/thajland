// Oblíbené lety: ukládají se okamžitě v prohlížeči (localStorage), bez GitHubu.
// Volitelně se synchronizují do skeneru (watchlist.yaml), pokud je v Nastavení uložený token.
import { useEffect, useState } from "react";
import { getToken, itinOf, wkey } from "./format.js";
import { addWatch, removeWatch } from "./watchActions.js";

const KEY = "thajland.favorites", SEEN_KEY = "thajland.favSeen", OLD_KEY = "thajland.pins";

export function loadFavorites() {
  try {
    const cur = JSON.parse(localStorage.getItem(KEY) || "null");
    if (cur) return cur;
    // migrace ze starších „pinů v prohlížeči“
    const old = JSON.parse(localStorage.getItem(OLD_KEY) || "[]");
    const mig = old.map((p) => ({ key: p.key, itin: p.itin, price_at_add: p.price_at_pin, day: p.day }));
    if (mig.length) localStorage.setItem(KEY, JSON.stringify(mig));
    return mig;
  } catch (e) { return []; }
}
export function saveFavorites(list) {
  try { localStorage.setItem(KEY, JSON.stringify(list)); } catch (e) {}
  try { window.dispatchEvent(new CustomEvent("thajland:favorites", { detail: list })); } catch (e) {}
}
export function useFavorites() {
  const [favs, set] = useState(() => loadFavorites());
  useEffect(() => { const on = (e) => set(e.detail || loadFavorites()); window.addEventListener("thajland:favorites", on); return () => window.removeEventListener("thajland:favorites", on); }, []);
  return favs;
}
export const favKeyOf = (o) => `${wkey(o)}#${o.route || ""}`;
export const isFavorite = (favs, o) => favs.some((f) => f.key === wkey(o) && (!f.itin || !f.itin.route || !o.route || f.itin.route === o.route));

export function toggleFavorite(o) {
  const favs = loadFavorites();
  const on = isFavorite(favs, o);
  const next = on
    ? favs.filter((f) => !(f.key === wkey(o) && (!f.itin || !f.itin.route || !o.route || f.itin.route === o.route)))
    : [...favs, { key: wkey(o), itin: itinOf(o), price_at_add: o.price, day: new Date().toISOString().slice(0, 10) }];
  saveFavorites(next);
  // volitelná synchronizace do skeneru (jen s tokenem, nikdy neotevírá GitHub formulář)
  if (getToken()) (on ? removeWatch(o) : addWatch(o)).catch(() => {});
  return !on;
}

// „co se stalo od tvé poslední návštěvy“ – pamatujeme si cenu, kterou uživatel naposledy viděl
export const loadSeen = () => { try { return JSON.parse(localStorage.getItem(SEEN_KEY) || "{}"); } catch (e) { return {}; } };
export const saveSeen = (s) => { try { localStorage.setItem(SEEN_KEY, JSON.stringify(s)); } catch (e) {} };

// Oblíbený záznam → aktuální nabídka + historie. Preferujeme stejný itinerář (aerolinky+trasa), jinak nejlevnější na termín.
export function resolveFavorite(f, M, manualWatch) {
  const [origin, destination, depart_date, return_date] = f.key.split("|");
  const cands = M.offers.filter((x) => wkey(x) === f.key);
  const same = cands.filter((x) => !f.itin || !f.itin.route || x.route === f.itin.route);
  const pick = (same.length ? same : cands).sort((a, b) => a.price - b.price)[0] || null;
  const history = M.queryHistory({ origin, destination, depart_date, return_date, source: "google" });
  const hist = history.filter((x) => x != null);
  const prevIdx = history.length - 2;
  const prev = prevIdx >= 0 ? history[prevIdx] : null;
  return {
    key: f.key, favKey: `${f.key}#${(f.itin && f.itin.route) || ""}`, origin, destination, depart_date, return_date, itin: f.itin || {}, added: f.day, price_at_add: f.price_at_add,
    auto: false, favorite: true, synced: !!manualWatch, name: "Oblíbené", nick: manualWatch && manualWatch.nick,
    current: pick, same_itinerary: !!same.length, cheapest_any: cands.length ? [...cands].sort((a, b) => a.price - b.price)[0] : null,
    prev_price: manualWatch ? manualWatch.prev_price : prev, prev_day: manualWatch ? manualWatch.prev_day : (M.days[prevIdx] && M.days[prevIdx].day),
    min_seen: hist.length ? Math.min(...hist) : null, max_seen: hist.length ? Math.max(...hist) : null, history: history.map((m) => ({ min: m })),
  };
}
