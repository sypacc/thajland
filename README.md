# Thajland – sledování letenek do Thajska (léto 2027)

Automatický denní sken cen zpátečních letenek **z Česka do Thajska na 2 týdny v srpnu–září 2027**
a dashboard, který ukazuje nejlepší příležitosti podle **poměru cena/výkon**.

## Co to dělá

1. **Každý den ráno** (GitHub Actions, cron `17 4 * * *` UTC) projde všechny kombinace
   `odletové letiště × cílové letiště × den odletu × délka pobytu` z `config.yaml`
   (výchozí: PRG + VIE → BKK + HKT, **každý den odletu** 1. 8.–30. 9. 2027 × 13/14/15 dní = 732 kombinací).
   V Actions běží 4 trasy paralelně (≈ 20 min) a pátý job výsledky sloučí, vyhodnotí a publikuje.
2. **Každý dotaz je „anonymní okno“** – samostatný HTTP požadavek z čerstvého runneru bez cookies
   a historie. Hlavní zdroj je **Google Flights** (protobuf dotaz `tfs`, knihovna `fast-flights`);
   když primp fetch selže, zkusí se headless Chromium v incognito kontextu (Playwright).
   **Azair.eu** je v kódu jako doplňkový zdroj, ale vypnutý: na dotazy ~10 měsíců dopředu odpovídá
   „dotaz je pro vyhledávací server příliš rozsáhlý“ (ověřeno v běhu), zapnout jde v `config.yaml` → `scan.sources`.
3. Každou nabídku **ohodnotí skóre = efektivní cena v Kč**: cena + penalizace za čas nad 14 h,
   za 2. a další přestup, za dlouhé (>5 h) či rizikově krátké (<1 h) přestupy ± korekce za aerolinku,
   přímý let má bonus. Váhy jsou v `config.yaml` → sekce `scoring`.
4. Výsledky uloží do `data/` (poslední sken + denní historie + série pro grafy) a commitne je.
5. **Dashboard** (`index.html`, GitHub Pages) v pořadí podle důležitosti:
   **Verdikt** (kupovat / férová cena / počkat, po trasách, s cenou pro N osob a pokrytím termínů) →
   **Postřehy z dat** (odkud a kam je levněji, nejlevnější týden, délka pobytu, přímé lety, trend) →
   **Hlášení** → **Nejlepší nabídky** (taby: poměr cena/výkon, nejlevnější, nejrychlejší, max 1 přestup;
   karta má časovou osu trasy s přestupy, „Kde koupit“ s cenami prodejců, Googlí odhad obvyklého rozpětí,
   rozpad skóre a odkazy na Google Flights, Kiwi, Skyscanner, Kayak, Azair, Pelikán, Letušku) →
   **Kalendář cen** (heatmapa den odletu × trasa, klik ukáže nabídky dne) → **Vývoj v čase** (tabulka změn
   vs. minule / 7 / 30 dní, minima, sparklines, graf) → sbalená tabulka všech nabídek s filtry a předvolbami →
   stav skenu a pokrytí termínů → metodika.

## Sledované lety (piny)

Hlavní pracovní režim: pár vybraných levných letů se hlídá přednostně.

- **Přidání z dashboardu:** tlačítko **★ Sledovat (GitHub)** u nabídky otevře předvyplněné issue
  (`watch: PRG→BKK 2027-08-26 → 2027-09-09` + itinerář v těle). Stačí potvrdit „Submit new issue“;
  workflow `watch.yml` ho zapíše do `watchlist.yaml`, commitne a issue zavře. Zrušení: `unwatch: …`.
- **Automaticky:** po každém skenu se do sledování přidá 5 nejlepších dealů (různé itineráře, max. 2 na trasu);
  když vypadnou z top 5 na víc než 10 dní, zase zmizí. Nastavení v `watchlist.yaml` → `auto`.
- **Co sledování dělá:** dotazy sledovaných letů jdou ve skenu první a vždy s plným opakováním; hlídá se cena
  *stejného letu* (aerolinky + trasa + čas odletu), ne jen nejlevnější na termín; historie je v `data/watch.json`;
  hlášení „sledovaný let zlevnil / na minimu / zdražil / zmizel z nabídky“.
- **„Připnout jen zde“** je rychlý pin uložený jen v prohlížeči (bez GitHubu, neovlivní sken).

Termíny na hranici prodejního okna (~330 dní dopředu) se skenují hned po sledovaných letech, takže nově
otevřené zářijové dny se objeví v den otevření a dostanou hlášení „nově v prodeji“.

## Hlášení dealů (alerty)

Po každém běhu se nabídky porovnají s historií a vzniknou hlášení (`data/alerts.json`, sekce „Hlášení“ v dashboardu):

| typ | kdy |
|---|---|
| pod cílovou cenou | cena/os ≤ `alerts.target_price` (výchozí 15 000 Kč) |
| prudký pokles | o ≥ 12 % nebo ≥ 2 500 Kč levnější než v předchozím běhu |
| abnormálně nízko | ≥ 15 % pod mediánem historických minim daného termínu (po ≥ 5 bězích) |
| nové minimum trasy | nejnižší cena na trase za celou historii (po ≥ 3 bězích) |
| nově v prodeji / nová trasa | termín nebo celá trasa, která se v historii (≥ 3 běhy) nikdy neobjevila a teď má nabídky – typicky nově otevřený prodej (září, Praha → Phuket) |
| sledovaný let zlevnil / na minimu / zdražil / zmizel | změna ceny sledovaného letu proti minulému měření (≥ 3 % nebo ≥ 400 Kč; zdražení ≥ 10 %) |

Jedna nabídka = jedno hlášení se všemi důvody, max. 8 za běh, stejný termín se neopakuje 7 dní (pokud neklesne o dalších 500 Kč).

**Kam se hlášení posílá** (zapnuto v `config.yaml` → `alerts.channels`, kanál se použije jen když existuje secret
v Settings → Secrets and variables → Actions):

- **GitHub issue** – funguje bez nastavení, GitHub pošle notifikaci/e-mail (issue má label `deal`).
- **Telegram** – secrets `TELEGRAM_BOT_TOKEN` (od @BotFather) a `TELEGRAM_CHAT_ID`.
- **ntfy** (push do mobilu) – secret `NTFY_TOPIC`, v aplikaci ntfy odebírej stejný topic.
- **E-mail** – secrets `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `ALERT_EMAIL_TO`.

## Cestovky a prodejci

- Google Flights porovnává aerolinky i prodejce (Kiwi, eDreams, Gotogate, Mytrip, Expedia…) a vrací nejnižší cenu.
- Pro nejlepší dealy (výchozí 8) se navíc headless prohlížečem načtou **„Možnosti rezervace“** = seznam prodejců
  a jejich cen (experimentální, `scan.enrich_sellers`). V dashboardu je to řádek „Kde koupit“.
- Kiwi.com, Skyscanner, Pelikán ani Letuška nemají veřejné API a blokují roboty, takže se automaticky nečtou.
  U každé nabídky jsou odkazy s předvyplněným termínem (Google Flights, Kiwi, Skyscanner, Kayak, Azair) a odkazy
  na Pelikán/Letušku pro ruční ověření.

## Zprovoznění (jednorázově)

1. Repo musí mít tuto větev jako **výchozí** (plánované běhy `schedule` GitHub spouští jen z výchozí větve).
2. **Actions → „Sken letenek do Thajska“ → Run workflow** (první běh; do pole `limit` můžeš dát např. `10` pro rychlý test).
3. Dashboard se publikuje na větev `gh-pages`; u veřejného repa GitHub Pages zapne sám.
   URL: `https://sypacc.github.io/thajland/` (první publikace trvá pár minut). Kdyby se stránka
   neobjevila, v Settings → Pages nastav Source = „Deploy from a branch“, branch `gh-pages`, složka `/ (root)`.
4. Po každém běhu je v Actions k dispozici artefakt `debug-N` se surovými odpověďmi (chybové stránky Google,
   HTML Azairu, screenshoty z načítání prodejců) pro ladění.

## Lokální spuštění

```bash
pip install -r requirements.txt playwright && python -m playwright install chromium
python -m scanner.run --limit 5      # rychlý test (5 dotazů)
python -m scanner.run                # plný běh dle config.yaml
python -m http.server 8000           # dashboard: http://localhost:8000/
python -m pytest -q tests
```

Dashboard čte `data/latest.js` a `data/series.js`, funguje i otevřený přímo ze souboru.

## Úpravy

- **Letiště, termíny, délka pobytu, počet cestujících** → `config.yaml` → `trip`.
- **Váhy skóre** (co je pro vás „výkon“) → `config.yaml` → `scoring`.
- **Hranice hlášení** (cílová cena, % poklesu, počet hlášení) → `config.yaml` → `alerts`.
- **Čas běhu** → `.github/workflows/scan.yml` → `cron` (UTC).
- **Rychlost/šetrnost** k Google → `scan.delay_seconds`, `scan.time_budget_minutes`. Dotazy, které se
  nestihnou nebo selžou, se převezmou z předchozího běhu a v dashboardu jsou označeny jako „starší data“.

## Omezení (poctivě)

- Ceny jsou za **zpáteční letenku pro 1 dospělého**; zobrazený itinerář je cesta **tam**, zpáteční spoj
  se vybírá na webu. Před koupí vždy ověř přes odkaz – ceny se mění v řádu hodin.
- Google Flights se dotazujeme z US runneru s měnou CZK a jazykem cs; cena se může od českého trhu mírně lišit.
- Kiwi, Skyscanner a Pelikán nemají volně dostupné API a aktivně blokují roboty – proto jsou jen jako odkazy.
- Prodej na konec září 2027 aerolinky teprve otevírají (typicky ~11 měsíců dopředu), nabídky se doplní postupně.
