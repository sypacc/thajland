import React, { useEffect, useState } from "react";
import { applyTheme, getTheme, getToken, REPO, setToken, testToken, toast, tokenUrl } from "../lib/format.js";

export function Toasts() {
  const [items, setItems] = useState([]);
  useEffect(() => {
    const on = (e) => { setItems((x) => [...x, e.detail]); setTimeout(() => setItems((x) => x.filter((i) => i.id !== e.detail.id)), 6000); };
    window.addEventListener("thajland:toast", on); return () => window.removeEventListener("thajland:toast", on);
  }, []);
  return <div className="toasts">{items.map((t) => <div key={t.id} className={"toast " + t.kind}>{t.message}</div>)}</div>;
}

export function ThemeToggle() {
  const [theme, setTheme] = useState(getTheme);
  useEffect(() => { applyTheme(theme); }, [theme]);
  const next = { light: "dark", dark: "auto", auto: "light" }[theme];
  const label = { light: "☀️ světlý", dark: "🌙 tmavý", auto: "🖥 podle systému" }[theme];
  return <button className="nav-btn" onClick={() => setTheme(next)} title="Přepnout motiv">{label}</button>;
}

export default function Settings({ open, onClose }) {
  const [token, setTok] = useState(getToken);
  const [status, setStatus] = useState("");
  if (!open) return null;
  const save = async () => {
    setToken(token);
    if (!token.trim()) { setStatus("Token odebrán. Oblíbené fungují dál jen v tomto prohlížeči."); return; }
    setStatus("Ověřuji…");
    try { const name = await testToken(); setStatus(`✅ Funguje, token má přístup k ${name}. Oblíbené se budou synchronizovat.`); toast("Token uložen, oblíbené se teď synchronizují do skeneru.", "good"); }
    catch (e) { setStatus("❌ " + e.message); }
  };
  return (
    <div className="modal-bg" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="panel-head"><h2>Nastavení</h2><button className="btn-pin" onClick={onClose}>zavřít</button></div>
        <h3>Oblíbené</h3>
        <p className="small">Hvězdička ukládá oblíbené lety <strong>okamžitě a bez přihlašování</strong> do tohoto prohlížeče. Historii ceny mají, protože skener měří všechny termíny každý den.</p>
        <h3>Volitelné: synchronizace do skeneru</h3>
        <p className="small">Chceš mít oblíbené i na jiném zařízení a dostávat o nich hlášení (GitHub issue, Telegram, e‑mail)? Ulož sem GitHub token s právem zakládat issues v repu <code>{REPO}</code>. Každé přidání/odebrání oblíbeného se pak potichu zapíše i do <code>watchlist.yaml</code>. Token zůstává jen v tomto prohlížeči a volá se s ním pouze api.github.com.</p>
        <ol className="small">
          <li><a href={tokenUrl()} target="_blank" rel="noopener">Vytvořit fine-grained token</a> → <em>Repository access: Only select repositories → {REPO}</em> → <em>Permissions: Issues → Read and write</em> → Generate.</li>
          <li>Vlož ho sem a ulož. Bez tokenu se nic nesynchronizuje a oblíbené fungují jen lokálně.</li>
        </ol>
        <div className="filters">
          <label style={{ flex: 1 }}>GitHub token<input type="password" value={token} onChange={(e) => setTok(e.target.value)} placeholder="github_pat_…" autoComplete="off" /></label>
          <button className="btn-pin gh" onClick={save}>Uložit a ověřit</button>
        </div>
        {status ? <p className="small">{status}</p> : null}
        <h3>Motiv</h3>
        <p className="small">Výchozí je světlý. <ThemeToggle /></p>
      </div>
    </div>
  );
}
