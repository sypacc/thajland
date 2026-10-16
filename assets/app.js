/* Thajland dashboard – čistý JS, data z data/latest.js + data/series.js */
(function () {
  "use strict";
  const LATEST = window.THAJLAND_LATEST || null;
  const SERIES = window.THAJLAND_SERIES || { days: [] };
  const $ = (s) => document.querySelector(s);
  const el = (tag, attrs, ...kids) => {
    const n = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs || {})) {
      if (k === "class") n.className = v; else if (k === "html") n.innerHTML = v; else n.setAttribute(k, v);
    }
    for (const k of kids.flat()) if (k != null) n.append(k.nodeType ? k : document.createTextNode(String(k)));
    return n;
  };
  const CUR = (LATEST && LATEST.config && LATEST.config.currency) || "CZK";
  const czk = (n) => n == null ? "–" : Math.round(n).toLocaleString("cs-CZ") + (CUR === "CZK" ? " Kč" : " " + CUR);
  const dur = (m) => m == null ? "–" : `${Math.floor(m / 60)} h ${String(m % 60).padStart(2, "0")} min`;
  const dcz = (iso) => { if (!iso) return "–"; const [y, m, d] = iso.slice(0, 10).split("-"); return `${+d}. ${+m}. ${y}`; };
  const dshort = (iso) => { const [, m, d] = iso.slice(0, 10).split("-"); return `${+d}.${+m}.`; };
  const tm = (iso) => iso ? iso.slice(11, 16) : "";
  const CITY = { PRG: "Praha", VIE: "Vídeň", BUD: "Budapešť", BRQ: "Brno", MUC: "Mnichov", BER: "Berlín",
    BKK: "Bangkok", DMK: "Bangkok (DMK)", HKT: "Phuket", CNX: "Chiang Mai", USM: "Ko Samui", KBV: "Krabi" };
  const city = (c) => CITY[c] || c;
  const LINK_NAMES = { google: "Google Flights", kiwi: "Kiwi.com", skyscanner: "Skyscanner", kayak: "Kayak", azair: "Azair" };
  const SERIES_VARS = ["--s1", "--s2", "--s3", "--s4", "--s5", "--s6"];
  const cssVar = (v) => getComputedStyle(document.documentElement).getPropertyValue(v).trim();

  // ---------- no data ----------
  if (!LATEST || !LATEST.offers) {
    $("#status").innerHTML = '<span class="warn">Zatím nejsou žádná data.</span> Spusť workflow „Sken letenek do Thajska“ v záložce Actions (nebo počkej na ranní běh).';
    return;
  }

  const offers = LATEST.offers.map((o, i) => ({ ...o, _i: i, _month: +o.depart_date.slice(5, 7) }));
  const travelers = LATEST.config.travelers || 1;
  const routeOrder = [];
  for (const o of LATEST.config.origins) for (const d of LATEST.config.destinations) routeOrder.push(`${o}→${d}`);
  const routeColor = (r) => { let i = routeOrder.indexOf(r); if (i < 0) { routeOrder.push(r); i = routeOrder.length - 1; } return cssVar(SERIES_VARS[i % SERIES_VARS.length]); };

  // ---------- status ----------
  {
    const s = LATEST.stats;
    const parts = [`Poslední sken: <strong>${dcz(LATEST.generated_at)} ${tm(LATEST.generated_at)} UTC</strong>`,
      `dotazů OK ${s.queries_ok}/${s.queries_total}`, `nabídek ${s.offers}`];
    if (s.queries_stale) parts.push(`<span class="warn">${s.queries_stale} dotazů převzato ze staršího běhu</span>`);
    if (s.google_disabled) parts.push('<span class="bad">Google Flights blokoval dotazy – data jsou neúplná</span>');
    if (s.queries_error) parts.push(`<span class="warn">chyb: ${s.queries_error}</span>`);
    $("#status").innerHTML = parts.map((p) => `<span>${p}</span>`).join("");
  }

  // ---------- filters ----------
  const F = { origin: "", dest: "", stops: "", nights: "", month: "", maxPrice: "", source: "", sort: "score", stale: "1" };
  const uniq = (k) => [...new Set(offers.map((o) => o[k]))].sort();
  const sel = (key, label, opts) => {
    const s = el("select", { id: "f-" + key });
    for (const [v, t] of opts) s.append(el("option", { value: v }, t));
    s.value = F[key];
    s.addEventListener("change", () => { F[key] = s.value; render(); });
    return el("label", null, label, s);
  };
  const fl = $("#filters");
  fl.append(
    sel("origin", "Odkud", [["", "vše"], ...uniq("origin").map((v) => [v, `${city(v)} (${v})`])]),
    sel("dest", "Kam", [["", "vše"], ...uniq("destination").map((v) => [v, `${city(v)} (${v})`])]),
    sel("stops", "Max. přestupů", [["", "libovolně"], ["0", "přímý"], ["1", "max 1"], ["2", "max 2"]]),
    sel("nights", "Délka (dní)", [["", "vše"], ...uniq("nights").map((v) => [String(v), String(v)])]),
    sel("month", "Měsíc odletu", [["", "srpen + září"], ["8", "srpen"], ["9", "září"]]),
    sel("source", "Zdroj", [["", "vše"], ...uniq("source").map((v) => [v, v])]),
    sel("sort", "Řadit podle", [["score", "skóre (cena/výkon)"], ["price", "ceny"], ["depart_date", "data odletu"], ["duration_min", "délky cesty"]]),
    sel("stale", "Starší data", [["1", "zobrazit"], ["0", "skrýt"]]),
  );
  const mp = el("input", { type: "number", id: "f-maxPrice", placeholder: "např. 20000", min: "0", step: "500" });
  mp.addEventListener("input", () => { F.maxPrice = mp.value; render(); });
  fl.append(el("label", null, `Max. cena/os (${CUR})`, mp));

  const filtered = () => offers.filter((o) =>
    (!F.origin || o.origin === F.origin) && (!F.dest || o.destination === F.dest) &&
    (F.stops === "" || o.stops <= +F.stops) && (!F.nights || String(o.nights) === F.nights) &&
    (!F.month || o._month === +F.month) && (!F.maxPrice || o.price <= +F.maxPrice) &&
    (!F.source || o.source === F.source) && (F.stale === "1" || !o.stale));
  const sortBy = (arr, key, dir = 1) => [...arr].sort((a, b) => {
    const x = a[key] ?? Infinity, y = b[key] ?? Infinity;
    return (x < y ? -1 : x > y ? 1 : 0) * dir || a.price - b.price;
  });

  // ---------- badges ----------
  function badges(o) {
    const b = [];
    b.push(el("span", { class: "badge " + (o.stops === 0 ? "good" : o.stops >= 2 ? "warn" : "") },
      o.stops === 0 ? "přímý let" : o.stops === 1 ? "1 přestup" : `${o.stops} přestupy`));
    if (o.is_all_time_low) b.push(el("span", { class: "badge good" }, "nejnižší cena dosud"));
    if (o.yesterday_min != null && o.price < o.yesterday_min) b.push(el("span", { class: "badge good" }, `↓ ${czk(o.yesterday_min - o.price)} od včera`));
    if (o.yesterday_min != null && o.price > o.yesterday_min) b.push(el("span", { class: "badge bad" }, `↑ ${czk(o.price - o.yesterday_min)} od včera`));
    const longLay = (o.layovers || []).find((l) => l.minutes > 300);
    if (longLay) b.push(el("span", { class: "badge warn" }, `dlouhý přestup ${city(longLay.airport)} ${dur(longLay.minutes)}`));
    const shortLay = (o.layovers || []).find((l) => l.minutes > 0 && l.minutes < 60);
    if (shortLay) b.push(el("span", { class: "badge bad" }, `krátký přestup ${dur(shortLay.minutes)}`));
    if (o.stale) b.push(el("span", { class: "badge warn" }, `starší data (${dshort(o.fetched_at || LATEST.generated_at)})`));
    if (o.source === "azair") b.push(el("span", { class: "badge" }, "Azair (experimentální)"));
    return el("div", { class: "badges" }, b);
  }
  const linkRow = (o) => el("div", { class: "links" }, Object.entries(o.links || {}).map(([k, u]) =>
    el("a", { href: u, target: "_blank", rel: "noopener" }, LINK_NAMES[k] || k)));
  const legList = (o) => {
    if (!o.legs || !o.legs.length) return o.note ? el("p", { class: "legs" }, o.note) : null;
    const items = [];
    o.legs.forEach((l, i) => {
      items.push(el("li", null, `${l.from_airport} ${tm(l.departure)} → ${l.to_airport} ${tm(l.arrival)} (${dur(l.duration_min)}${l.plane ? ", " + l.plane : ""})`));
      if (o.layovers && o.layovers[i]) items.push(el("li", { class: "muted" }, `přestup ${city(o.layovers[i].airport)}: ${dur(o.layovers[i].minutes)}`));
    });
    return el("ul", { class: "legs" }, items);
  };
  const breakdown = (o) => {
    const names = { price: "cena", duration: "čas navíc", stops: "přestupy", layover: "přestupy (délka)", airline: "aerolinka" };
    return Object.entries(o.score_breakdown || {}).map(([k, v]) => `${names[k] || k} ${v > 0 && k !== "price" ? "+" : ""}${Math.round(v).toLocaleString("cs-CZ")}`).join(" · ");
  };

  // ---------- KPIs ----------
  function renderKpis(list) {
    const k = $("#kpis"); k.innerHTML = "";
    const tile = (label, value, hint) => k.append(el("div", { class: "kpi" }, el("div", { class: "label" }, label), el("div", { class: "value" }, value), el("div", { class: "hint" }, hint || "")));
    if (!list.length) { tile("Nabídky", "0", "nic neodpovídá filtrům"); return; }
    const cheapest = sortBy(list, "price")[0];
    const best = sortBy(list, "score")[0];
    const prices = sortBy(list, "price").map((o) => o.price);
    const median = prices[Math.floor(prices.length / 2)];
    tile("Nejlevnější / os", czk(cheapest.price), `${cheapest.route} · ${dshort(cheapest.depart_date)}–${dshort(cheapest.return_date)}`);
    tile("Nejlepší poměr", czk(best.price), `skóre ${czk(best.score)} · ${best.airlines.join(", ") || best.route}`);
    tile(`Pro ${travelers} os.`, czk(best.price * travelers), "nejlepší poměr × počet cestujících");
    tile("Medián ceny", czk(median), `z ${list.length} nabídek`);
    const days = SERIES.days || [];
    if (days.length >= 2) {
      const minOf = (d) => Math.min(...Object.values(d.routes).map((r) => r.min).filter((x) => x != null));
      const a = minOf(days[days.length - 2]), b = minOf(days[days.length - 1]);
      if (isFinite(a) && isFinite(b)) tile("Změna minima od minula", (b - a > 0 ? "+" : "") + czk(b - a), `${czk(a)} → ${czk(b)} (celé okno)`);
    } else tile("Historie", `${days.length} den`, "trend se ukáže po více bězích");
  }

  // ---------- top cards ----------
  function renderTop(list) {
    const t = $("#top"); t.innerHTML = "";
    const top = sortBy(list, "score").slice(0, 6);
    if (!top.length) { t.append(el("div", { class: "empty" }, "Žádné nabídky pro zvolené filtry.")); return; }
    top.forEach((o, i) => t.append(el("div", { class: "card" },
      el("div", { class: "head" }, el("div", { class: "price" }, czk(o.price), el("span", { class: "muted small" }, ` /os · ${czk(o.price * travelers)} pro ${travelers}`)), el("div", { class: "rank" }, `#${i + 1} · skóre ${czk(o.score)}`)),
      el("div", { class: "route" }, `${city(o.origin)} → ${city(o.destination)}  ·  ${o.route}`),
      el("div", { class: "meta" }, `${dcz(o.depart_date)} – ${dcz(o.return_date)} (${o.nights} dní) · tam ${dur(o.duration_min)} · ${o.airlines.join(", ") || "–"}`),
      badges(o), legList(o), linkRow(o),
    )));
  }

  // ---------- charts ----------
  let chartDates, chartHistory;
  function chartTheme() {
    if (!hasChart) return;
    Chart.defaults.color = cssVar("--text-2");
    Chart.defaults.borderColor = cssVar("--grid");
    Chart.defaults.font.family = getComputedStyle(document.body).fontFamily;
  }
  const legend = (id, items) => { const L = $(id); L.innerHTML = ""; items.forEach(([name, c]) => L.append(el("span", { style: `--c:${c}` }, name))); };
  const baseOpts = (fmtTitle) => ({
    responsive: true, maintainAspectRatio: false, animation: false,
    interaction: { mode: "index", intersect: false },
    plugins: { legend: { display: false }, tooltip: { callbacks: { title: (it) => fmtTitle(it[0].label), label: (c) => ` ${c.dataset.label}: ${czk(c.parsed.y)}` } } },
    scales: { x: { grid: { display: false }, ticks: { maxRotation: 0, autoSkip: true } },
      y: { beginAtZero: false, ticks: { callback: (v) => Math.round(v / 1000) + " tis." }, grid: { color: cssVar("--grid") } } },
    elements: { line: { borderWidth: 2, tension: .2, spanGaps: true }, point: { radius: 3, hoverRadius: 6, hitRadius: 10 } },
  });
  const hasChart = typeof Chart !== "undefined";
  function renderChartDates(list) {
    if (!hasChart) { $("#legendDates").textContent = "Knihovna grafů se nenačetla."; return; }
    const dates = [...new Set(list.map((o) => o.depart_date))].sort();
    const byRoute = {};
    for (const o of list) { const r = `${o.origin}→${o.destination}`; (byRoute[r] ||= {}); byRoute[r][o.depart_date] = Math.min(byRoute[r][o.depart_date] ?? Infinity, o.price); }
    const routes = routeOrder.filter((r) => byRoute[r]).concat(Object.keys(byRoute).filter((r) => !routeOrder.includes(r))).slice(0, 6);
    const ds = routes.map((r) => ({ label: r, data: dates.map((d) => byRoute[r][d] ?? null), borderColor: routeColor(r), backgroundColor: routeColor(r) }));
    legend("#legendDates", routes.map((r) => [r, routeColor(r)]));
    if (chartDates) chartDates.destroy();
    chartDates = new Chart($("#chartDates"), { type: "line", data: { labels: dates.map(dshort), datasets: ds }, options: baseOpts((l) => "odlet " + l) });
  }
  function renderChartHistory() {
    if (!hasChart) { $("#legendHistory").textContent = "Knihovna grafů se nenačetla."; return; }
    const days = SERIES.days || [];
    const routes = routeOrder.filter((r) => days.some((d) => d.routes[r.replace("→", "-")]));
    const ds = routes.map((r) => ({ label: r, data: days.map((d) => (d.routes[r.replace("→", "-")] || {}).min ?? null), borderColor: routeColor(r), backgroundColor: routeColor(r) }));
    legend("#legendHistory", routes.map((r) => [r, routeColor(r)]));
    if (chartHistory) chartHistory.destroy();
    chartHistory = new Chart($("#chartHistory"), { type: "line", data: { labels: days.map((d) => dshort(d.day)), datasets: ds }, options: baseOpts((l) => "sken " + l) });
    if (days.length < 2) $("#legendHistory").append(el("span", { class: "muted", style: "--c:transparent" }, "Graf se naplní po dalších denních bězích."));
  }

  // ---------- table ----------
  let shown = 60, sortKey = "score", sortDir = 1;
  document.querySelectorAll("th[data-sort]").forEach((th) => th.addEventListener("click", () => {
    const k = th.dataset.sort; if (sortKey === k) sortDir *= -1; else { sortKey = k; sortDir = 1; } render();
  }));
  $("#more").addEventListener("click", () => { shown += 100; render(); });
  function renderTable(list) {
    const tb = $("#table tbody"); tb.innerHTML = "";
    const rows = sortBy(list, sortKey, sortDir);
    $("#count").textContent = `(${rows.length})`;
    rows.slice(0, shown).forEach((o) => {
      const trend = o.yesterday_min == null ? "–" : o.price < o.yesterday_min ? `↓ ${czk(o.yesterday_min - o.price)}` : o.price > o.yesterday_min ? `↑ ${czk(o.price - o.yesterday_min)}` : "=";
      const trendCls = o.yesterday_min == null ? "" : o.price < o.yesterday_min ? "trend-down" : o.price > o.yesterday_min ? "trend-up" : "";
      const btn = el("button", { class: "toggle" }, "detail");
      const tr = el("tr", null,
        el("td", { class: "num" }, czk(o.score)), el("td", { class: "num" }, el("strong", null, czk(o.price))), el("td", { class: "num" }, czk(o.price * travelers)),
        el("td", null, dcz(o.depart_date)), el("td", null, `${dcz(o.return_date)} (${o.nights} d)`), el("td", null, o.route),
        el("td", null, o.airlines.join(", ") || "–"), el("td", { class: "num" }, o.stops), el("td", null, dur(o.duration_min)),
        el("td", { class: trendCls }, trend + (o.is_all_time_low ? " ★" : "")), el("td", null, o.source + (o.stale ? " (starší)" : "")), el("td", null, btn));
      tb.append(tr);
      btn.addEventListener("click", () => {
        if (tr.nextSibling && tr.nextSibling.classList.contains("detail")) { tr.nextSibling.remove(); return; }
        const d = el("tr", { class: "detail" }, el("td", { colspan: "12" }, badges(o), legList(o) || "", el("div", { class: "small muted" }, "Skóre: " + breakdown(o)), linkRow(o)));
        tr.after(d);
      });
    });
    $("#more").hidden = rows.length <= shown;
    if (!rows.length) tb.append(el("tr", null, el("td", { colspan: "12", class: "empty" }, "Žádné nabídky.")));
  }

  // ---------- run info ----------
  function renderRunInfo() {
    const s = LATEST.stats, c = LATEST.config;
    const errs = (LATEST.queries || []).filter((q) => q.status === "error");
    const empty = (LATEST.queries || []).filter((q) => q.status === "empty" || (q.status === "ok" && !q.count));
    const r = $("#runinfo");
    r.innerHTML = `<p>Plán: ${c.origins.join(", ")} → ${c.destinations.join(", ")}, odlety ${dcz(c.depart_from)} – ${dcz(c.depart_to)} po ${c.depart_step_days} dnech, délky ${c.trip_lengths.join("/")} dní, max. ${c.max_stops ?? "∞"} přestupů, zdroje: ${c.sources.join(", ")}.</p>
      <p>Dotazů celkem ${s.queries_total}: OK ${s.queries_ok}, bez výsledků ${empty.length}, chyb ${errs.length}, přeskočeno ${s.queries_skipped}, převzato ze staršího běhu ${s.queries_stale}. Běh trval ${Math.round(s.duration_s / 60)} min.</p>`;
    if (empty.length) r.append(el("p", { class: "muted" }, `Bez výsledků (často ještě neotevřený prodej): ${empty.slice(0, 12).map((q) => `${q.origin}→${q.destination} ${dshort(q.depart_date)}`).join(", ")}${empty.length > 12 ? " …" : ""}`));
    if (errs.length) r.append(el("details", null, el("summary", null, `Chyby (${errs.length})`), el("ul", { class: "small" }, errs.slice(0, 30).map((q) => el("li", null, `${q.source} ${q.origin}→${q.destination} ${q.depart_date}: ${q.error || q.status}`)))));
  }

  function render() {
    chartTheme();
    const list = filtered();
    renderKpis(list); renderTop(list); renderChartDates(list); renderTable(list);
  }
  renderRunInfo();
  renderChartHistory();
  render();
  if (window.matchMedia) window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", () => { render(); renderChartHistory(); });
})();
