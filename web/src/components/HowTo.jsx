import React from "react";

export default function HowTo() {
  return (
    <details className="panel notes" id="howto">
      <summary><h2>Jak to číst</h2><span className="muted small">zdroje, skóre, hlášení, omezení</span></summary>
      <ul>
        <li><strong>Lety ke sledování</strong>: „Tip 1–5“ vybírá skener automaticky (nejlepší poměr cena/výkon, obměňují se), „tvoje piny“ přidáš tlačítkem „★ Sledovat“ u nabídky (nebo „★ Nechat trvale“ u tipu). S uloženým tokenem (⚙️ Nastavení) to proběhne jedním klikem přímo na stránce: založí se issue, robot ho do minuty zapíše do <code>watchlist.yaml</code> a od dalšího skenu má let prioritu, vlastní křivku ceny a hlášení při zlevnění/zdražení/zmizení; do té doby je pin vidět jako „čeká na zpracování“. Bez tokenu se otevře předvyplněný GitHub formulář, kde jen potvrdíš. „Připnout jen zde“ je rychlý pin bez GitHubu (neovlivní sken).</li>
        <li><strong>Verdikt</strong> porovnává dnešní nejnižší cenu na trase s mediánem všech dosavadních měření. Prvních pár dní jen sbíráme data, pak se objeví doporučení „kupovat / férová cena / počkat“.</li>
        <li><strong>Skóre = efektivní cena v Kč</strong>: cena + penalizace za čas nad 14 h, za 2. a další přestup, za dlouhé (&gt;5 h) nebo rizikově krátké (&lt;1 h) přestupy ± korekce za aerolinku; přímý let má bonus. Čím nižší, tím lepší. Váhy jsou v <code>config.yaml</code>.</li>
        <li><strong>Hlášení</strong>: cena pod cílovou hranicí, prudký pokles od minula, výrazně pod mediánem historie termínu, nové minimum trasy, nově v prodeji, změny sledovaných letů. Posílají se jako GitHub issue, volitelně Telegram / ntfy / e-mail.</li>
        <li><strong>Zdroje a cestovky</strong>: Google Flights porovnává aerolinky i prodejce (Kiwi, eDreams, Gotogate, Mytrip, Expedia…) a vrací nejnižší cenu; u sledovaných letů a top dealů se načítají „Možnosti rezervace“ = u koho a za kolik koupit. Kiwi, Skyscanner, Pelikán ani Letuška nejdou automaticky číst, proto jsou u každé nabídky jen odkazy s předvyplněným termínem („hledat na…“).</li>
        <li><strong>Anonymně</strong>: každý dotaz je čistý požadavek bez cookies z čerstvého runneru, tedy ekvivalent anonymního okna.</li>
        <li><strong>Pozor</strong>: cena je za zpáteční letenku pro 1 dospělého, zobrazený itinerář je cesta tam (zpáteční spoj vybereš na webu). Ceny se mění v řádu hodin, před koupí ověř přes odkaz. Prodej aerolinky otevírají ~330 dní dopředu, zářijová políčka se doplní postupně.</li>
      </ul>
    </details>
  );
}
