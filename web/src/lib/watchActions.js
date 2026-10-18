// Jedno místo pro akce „sledovat / zrušit sledování“: s tokenem přes API, bez tokenu přes GitHub formulář.
import { useEffect, useState } from "react";
import { createWatchIssue, getToken, loadPending, savePending, toast, wkey, itinOf } from "./format.js";

export async function addWatch(o, refreshPending) {
  if (!getToken()) return false; // bez tokenu nic (oblíbené fungují lokálně), GitHub formulář je jen ruční volba v Nastavení
  try {
    const issue = await createWatchIssue(o);
    const p = loadPending().filter((x) => x.key !== wkey(o));
    p.push({ key: wkey(o), itin: itinOf(o), price: o.price, issue: issue.number, day: new Date().toISOString().slice(0, 10), unwatch: false });
    savePending(p); refreshPending && refreshPending(p);
    toast(`Synchronizováno do skeneru (issue #${issue.number}): let dostane prioritu a hlášení e‑mailem/Telegramem.`, "good");
  } catch (e) { toast("Synchronizace do skeneru selhala: " + e.message + " (oblíbené zůstává uložené v prohlížeči)", "bad"); }
}

export async function removeWatch(o, refreshPending) {
  if (!getToken()) return false;
  try {
    const issue = await createWatchIssue(o, true);
    const p = loadPending().filter((x) => x.key !== wkey(o));
    p.push({ key: wkey(o), issue: issue.number, day: new Date().toISOString().slice(0, 10), unwatch: true });
    savePending(p); refreshPending && refreshPending(p);
    toast(`Odebráno ze skeneru (issue #${issue.number}).`, "good");
  } catch (e) { toast("Synchronizace do skeneru selhala: " + e.message + " (oblíbené zůstává uložené v prohlížeči)", "bad"); }
}

// Sdílený stav čekajících pinů napříč komponentami (localStorage + událost).
export function usePending() {
  const [pending, set] = useState(() => loadPending());
  useEffect(() => { const on = (e) => set(e.detail || loadPending()); window.addEventListener("thajland:pending", on); return () => window.removeEventListener("thajland:pending", on); }, []);
  return pending;
}
