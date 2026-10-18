// Jedno místo pro akce „sledovat / zrušit sledování“: s tokenem přes API, bez tokenu přes GitHub formulář.
import { useEffect, useState } from "react";
import { createWatchIssue, getToken, loadPending, savePending, toast, watchIssue, wkey, itinOf } from "./format.js";

export async function addWatch(o, refreshPending) {
  if (!getToken()) { window.open(watchIssue(o), "_blank", "noopener"); toast("Otevřel jsem GitHub formulář – jen potvrď „Create“. (V Nastavení si můžeš uložit token a příště to půjde jedním klikem.)"); return; }
  try {
    const issue = await createWatchIssue(o);
    const p = loadPending().filter((x) => x.key !== wkey(o));
    p.push({ key: wkey(o), itin: itinOf(o), price: o.price, issue: issue.number, day: new Date().toISOString().slice(0, 10), unwatch: false });
    savePending(p); refreshPending && refreshPending(p);
    toast(`★ Přidáno do sledování (issue #${issue.number}). Robot to zapíše do minuty, v datech se let objeví po dalším skenu.`, "good");
  } catch (e) { toast("Nepodařilo se založit issue: " + e.message, "bad"); }
}

export async function removeWatch(o, refreshPending) {
  if (!getToken()) { window.open(watchIssue(o, true), "_blank", "noopener"); toast("Otevřel jsem GitHub formulář pro zrušení – jen potvrď „Create“."); return; }
  try {
    const issue = await createWatchIssue(o, true);
    const p = loadPending().filter((x) => x.key !== wkey(o));
    p.push({ key: wkey(o), issue: issue.number, day: new Date().toISOString().slice(0, 10), unwatch: true });
    savePending(p); refreshPending && refreshPending(p);
    toast(`Zrušení sledování odesláno (issue #${issue.number}).`, "good");
  } catch (e) { toast("Nepodařilo se založit issue: " + e.message, "bad"); }
}

// Sdílený stav čekajících pinů napříč komponentami (localStorage + událost).
export function usePending() {
  const [pending, set] = useState(() => loadPending());
  useEffect(() => { const on = (e) => set(e.detail || loadPending()); window.addEventListener("thajland:pending", on); return () => window.removeEventListener("thajland:pending", on); }, []);
  return pending;
}
