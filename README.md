# Thajland – sledování letenek do Thajska (léto 2027)

Automatický denní sken cen zpátečních letenek **z Česka do Thajska na 2 týdny v srpnu–září 2027**
a dashboard, který ukazuje nejlepší příležitosti podle **poměru cena/výkon**.

## Co to dělá

1. **Každý den ráno** (GitHub Actions, cron `17 4 * * *` UTC) projde všechny kombinace
   `odletové letiště × cílové letiště × den odletu × délka pobytu` z `config.yaml`
   (výchozí: PRG + VIE → BKK + HKT, odlety 1. 8.–30. 9. 2027 po 3 dnech, 13/14/15 dní).
2. **Každý dotaz je „anonymní okno“** – samostatný HTTP požadavek z čerstvého runneru bez cookies
   a historie. Hlavní zdroj je **Google Flights** (protobuf dotaz `tfs`, knihovna `fast-flights`);
   když primp fetch selže, zkusí se headless Chromium v incognito kontextu (Playwright).
   **Azair.eu** je experimentální doplňkový zdroj.
3. Každou nabídku **ohodnotí skóre = efektivní cena v Kč**: cena + penalizace za čas nad 14 h,
   za 2. a další přestup, za dlouhé (>5 h) či rizikově krátké (<1 h) přestupy ± korekce za aerolinku,
   přímý let má bonus. Váhy jsou v `config.yaml` → sekce `scoring`.
4. Výsledky uloží do `data/` (poslední sken + denní historie + série pro grafy) a commitne je.
5. **Dashboard** (`index.html`) se publikuje na GitHub Pages: top příležitosti, grafy ceny podle data
   odletu a vývoje v čase, tabulka všech nabídek s filtry, detail itineráře (přestupy, časy),
   a u každé nabídky odkazy na **Google Flights, Kiwi.com, Skyscanner, Kayak a Azair** s předvyplněnými daty.

## Zprovoznění (jednorázově)

1. Repo musí mít tuto větev jako **výchozí** (plánované běhy `schedule` GitHub spouští jen z výchozí větve).
2. **Actions → „Sken letenek do Thajska“ → Run workflow** (první běh; do pole `limit` můžeš dát např. `10` pro rychlý test).
3. Workflow sám zapne **GitHub Pages** (zdroj „GitHub Actions“). URL dashboardu najdeš v běhu jobu
   „Publikovat dashboard“ nebo v Settings → Pages (typicky `https://sypacc.github.io/thajland/`).
   Pokud Pages nejde zapnout automaticky (soukromé repo na Free plánu), zapni je ručně v Settings → Pages
   a jako zdroj zvol „GitHub Actions“ – nebo si dashboard otevři lokálně (viz níže).

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
- **Čas běhu** → `.github/workflows/scan.yml` → `cron` (UTC).
- **Rychlost/šetrnost** k Google → `scan.delay_seconds`, `scan.time_budget_minutes`. Dotazy, které se
  nestihnou nebo selžou, se převezmou z předchozího běhu a v dashboardu jsou označeny jako „starší data“.

## Omezení (poctivě)

- Ceny jsou za **zpáteční letenku pro 1 dospělého**; zobrazený itinerář je cesta **tam**, zpáteční spoj
  se vybírá na webu. Před koupí vždy ověř přes odkaz – ceny se mění v řádu hodin.
- Google Flights se dotazujeme z US runneru s měnou CZK a jazykem cs; cena se může od českého trhu mírně lišit.
- Kiwi, Skyscanner a Pelikán nemají volně dostupné API a aktivně blokují roboty – proto jsou jen jako odkazy.
- Prodej na konec září 2027 aerolinky teprve otevírají (typicky ~11 měsíců dopředu), nabídky se doplní postupně.
