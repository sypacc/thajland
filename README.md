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
5. **Dashboard** (React + Vite ve složce `web/`, publikovaný na GitHub Pages) v pořadí podle důležitosti:
   **Verdikt** (kupovat / férová cena / počkat, po trasách, s cenou pro N osob a pokrytím termínů) →
   **Postřehy z dat** (odkud a kam je levněji, nejlevnější týden, délka pobytu, přímé lety, trend) →
   **Hlášení** → **Nejlepší nabídky** (taby: poměr cena/výkon, nejlevnější, nejrychlejší, max 1 přestup;
   karta má časovou osu trasy s přestupy, „Kde koupit“ s cenami prodejců, Googlí odhad obvyklého rozpětí,
   rozpad skóre a odkazy na Google Flights, Kiwi, Skyscanner, Kayak, Azair, Pelikán, Letušku) →
   **Kalendář cen** (heatmapa den odletu × trasa, klik ukáže nabídky dne) → **Vývoj v čase** (tabulka změn
   vs. minule / 7 / 30 dní, minima, sparklines, graf) → sbalená tabulka všech nabídek s filtry a předvolbami →
   stav skenu a pokrytí termínů → metodika.

## Lety ke sledování (tipy + piny)

Hlavní pracovní režim: jedna sekce, v ní **Tip 1–5** (automatický výběr skeneru podle poměru cena/výkon, pak ceny)
a pod nimi **tvoje piny**. Každý let má jednoduché jméno („Tip 2 · Qatar přes Dauhá“, „Můj pin 1 · Scoot přes Singapur“),
které se používá i v hlášeních. Ostatní nabídky jsou ve sbalené části „Prozkoumat další nabídky“.

- **Oblíbené z dashboardu:** tlačítko **☆ Do oblíbených** u tipu nebo nabídky uloží let okamžitě
  do prohlížeče (localStorage), bez přihlašování. Sekce „Sledované a oblíbené“ je hlavní část stránky:
  u každého letu je odlet, přílet, jednotlivé úseky s časy, místo a délka přestupu, kde koupit, vývoj
  ceny a při další návštěvě přehled, co se s oblíbenými od minula stalo. Historii mají, protože skener
  měří všechny termíny každý den.
  - **Volitelná synchronizace do skeneru** (priorita ve skenu + hlášení e‑mailem/Telegramem/issue,
    oblíbené i na jiném zařízení): v ⚙️ Nastavení ulož fine-grained GitHub token (Repository access:
    jen tento repozitář, Permissions: Issues → Read and write). Každé přidání/odebrání pak potichu založí
    issue `watch: …` / `unwatch: …`, které workflow `watch.yml` zapíše do `watchlist.yaml`. Token zůstává
    jen v prohlížeči a volá se s ním pouze `api.github.com`.
  - **Ručně:** issue s titulkem `watch: PRG→BKK 2027-08-26 → 2027-09-09` (volitelně JSON s itinerářem v těle).
- **Automaticky:** po každém skenu se do sledování přidá 5 nejlepších dealů (různé itineráře, max. 2 na trasu);
  když vypadnou z top 5 na víc než 10 dní, zase zmizí. Nastavení v `watchlist.yaml` → `auto`.
- **Co sledování dělá:** dotazy sledovaných letů jdou ve skenu první a vždy s plným opakováním; hlídá se cena
  *stejného letu* (aerolinky + trasa + čas odletu), ne jen nejlevnější na termín; historie je v `data/watch.json`;
  hlášení „sledovaný let zlevnil / na minimu / zdražil / zmizel z nabídky“.
- **„Připnout jen zde“** je rychlý pin uložený jen v prohlížeči (bez GitHubu, neovlivní sken).

Termíny na hranici prodejního okna (~330 dní dopředu) se skenují hned po sledovaných letech, takže nově
otevřené zářijové dny se objeví v den otevření a dostanou hlášení „nově v prodeji“.

## Preferovaná aerolinka (Qatar Airways)

V `config.yaml → preferred` je jedna aerolinka s prioritou napříč systémem (teď Qatar Airways):

- **Vlastní hranice pro hlášení** `preferred.target_price` (14 000 Kč/os) nezávisle na obecné hranici 15 000:
  hlášení `pref_target`, jakmile pod ni Qatar klesne. Hlášení `pref_low` přijde při každém **novém minimu
  Qataru na trase** (minima se pamatují v `data/pref.json`), takže pokles vidíš první den, kdy nastane.
- **Rezervovaná místa v tipech** (`reserve_tips: 2`): nejlevnější Qatar na každou destinaci je vždy mezi
  automatickými tipy a tím pádem se skenuje přednostně a má vlastní historii ceny.
- **Přednostní znovuověření** (`recheck_top: 8`): doplňkový sken z Claude rutiny zopakuje 8 nejlevnějších
  Qatar termínů i když ranní běh proběhl, tj. cena se měří dvakrát denně.
- **Dashboard**: karta „Qatar Airways · nejlevněji“ ve verdiktu (srpen vs. září, dosavadní minimum, cíl),
  záložka „★ Qatar Airways“ v Prozkoumat (výchozí) a řádek v Postřezích.
- **Skóre**: bonus −1 800 Kč, aby Qatar vyhrával poměr cena/výkon při malém cenovém rozdílu.

**Prémiová skupina** (`preferred.peers`: Emirates, EVA Air, Singapore Airlines, Cathay Pacific, Etihad) = aerolinky
stejné nebo lepší úrovně než Qatar. Pro každou se pamatuje minimum po trasách (`data/pref.json → airlines_min`),
hlásí se `peer_target` (pod `peer_target_price`, 14 000 Kč) a `peer_miracle` = **zázračná sleva**: cena aspoň
o `peer_drop_pct` % (20 %) pod dosavadním minimem té aerolinky na trase. Jejich nejlevnější termíny se znovu ověřují
v doplňkovém skenu (`peer_recheck_top` na aerolinku) a na dashboardu mají záložku „Prémiové“ a řádek v Postřezích.

Změna aerolinky = upravit `preferred.airlines`; víc aerolinek najednou je možné (musí letět celou cestu).

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

## Doplňkový sken (druhé měření, 09:24 Praha)

Ranní běh v GitHub Actions občas na část dotazů nedosáhne: Google některé zablokuje, vrátí dočasně
prázdnou stránku, nebo dojde časový rozpočet. Druhý průchod proto běží workflow `complement.yml`
(denně 07:24 UTC) a výsledek se **sjednotí** s ranním během:

```bash
python -m scanner.run --complement-dry-run      # jen vypíše, co by se opakovalo a proč
python -m scanner.run --complement --time-budget 40
```

- Vstup je dnešní `data/latest.json`. Vyberou se jen dotazy, které za to stojí, v tomhle pořadí:
  sledované lety, nejlevnější termíny preferované aerolinky, selhané/přeskočené, převzaté ze staršího
  běhu, prázdné uvnitř prodejního okna, hranice prodejního okna (termíny, které se právě otevírají).
- Sloučení je konzervativní: nový výsledek nahradí ranní jen když je lepší (má nabídky, nebo ranní
  neměl žádné a nový aspoň regulérně doběhl). Pak se přepočítají příznaky, sledované lety, historie dne,
  série i hlášení – stejně jako po ranním běhu. Nahrazené dotazy a nabídky mají `run: "complement"`,
  souhrn je v `latest.json → complement` a na dashboardu ve „Stavu skenu“.
- Když se data změní, workflow je commitne a znovu publikuje dashboard. Když ranní běh pokryl všechno,
  nic se nemění.

**Proč GitHub Actions a ne cloudová rutina Claude:** zkoušeli jsme to (19. 10.). Z cloudového prostředí
Claude Code Google Flights po pár desítkách dotazů vrací HTTP 429 a captchu, zatímco z runnerů GitHub
Actions projde přes 280 dotazů denně. Rutina „Doplňkový sken letenek“ v účtu zůstává vypnutá; kdyby se to
někdy změnilo, stačí ji zapnout. Kiwi, Skyscanner, Pelikán a Letuška strojově číst nejdou odnikud, Azair
hledá jen pár měsíců dopředu.

## Provoz bez zásahu (co se hlídá samo)

| Kdy (UTC) | Co | Když selže |
|---|---|---|
| 04:17 (+ zálohy 06:47, 09:17) | `scan.yml` – plný sken, hlášení, commit dat, publikace | brána pustí jen jeden běh denně; zálohy pokryjí zpoždění GitHubu |
| 07:24 (+ zálohy 10:54, 14:24) | `complement.yml` – druhé měření vybraných dotazů, sloučení | běží jen nad dnešními ranními daty a jen jednou |
| při pushi dat/webu | `publish.yml` – sestavení a nasazení dashboardu | – |
| 12:40, 16:40 | `health.yml` – ověří dnešní sken, doplnění i shodu nasazeného webu s daty; co chybí, spustí znovu; při selhání skenu založí issue `provoz`; zavře issue s dealy starší 14 dní | – |
| 04:20, 07:20, 12:20, 16:20 | Claude session „Thajland dispečer“ (rutina) – přes GitHub API spustí ranní sken, po 07:15 doplnění, případně publikaci; nanejvýš jednu akci za probuzení | hlásí selhané běhy |
| 12:40 ČR | Claude rutina „Denní souhrn letenek“ – přečte publikovaná data, zkusí dohnat chybějící běhy a pošle push souhrn (hlášení, Qatar, prémiové, sledované) | souhrn řekne, co chybí |

**Proč je primární spouštěč mimo GitHub.** GitHub doručuje `schedule` události tohoto repozitáře se zpožděním
4–5,5 hodiny (20. 10.: cron 04:17 → běh 09:24, cron 07:24 → 12:47, cron 12:40 → 17:30; 21. 10. do 09:00 nic).
Není to chyba konfigurace (běhy jsou připsané správnému uživateli, stav GitHubu „operational“), je to známé
chování plánovače u repozitářů s vyšším využitím Actions. Proto skeny spouští **Claude session „Thajland dispečer“**
(trvalá session s přístupem k repu, budí ji rutina ve 04:20, 07:20, 12:20 a 16:20 UTC) přes `workflow_dispatch`,
který GitHub vykoná okamžitě. GitHub cron zůstává jen jako záloha; opožděné běhy brána ve workflow přeskočí.
Rutina „Doplňkový sken letenek“ v Claude zůstává vypnutá: Google z cloudu Claude blokuje dotazy (429/captcha).

## Lokální spuštění

```bash
pip install -r requirements.txt playwright && python -m playwright install chromium
python -m scanner.run --limit 5      # rychlý test (5 dotazů)
python -m scanner.run                # plný běh dle config.yaml
python -m pytest -q tests

cd web && npm install && npm run dev # dashboard na http://localhost:5173/ (data se kopírují z ../data)
npm run build                        # produkční build do web/dist
```

Dashboard je React (Vite) ve složce `web/`: komponenty po sekcích v `web/src/components/`, sdílené výpočty
v `web/src/lib/` (`analysis.js` = verdikt, postřehy, pokrytí; `format.js` = formátování, názvy, odkazy, piny).
Načítá `data/latest.json`, `data/series.json`, `data/alerts.json` relativně, takže funguje na Pages i lokálně.

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
