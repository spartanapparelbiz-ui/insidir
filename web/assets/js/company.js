/* Company profile page: sample profiles driven by ?ticker=, ARIA tabs synced to
   location.hash, range-switchable price chart, watchlist toggle and the
   Insider Activity / SEC Filings / Financials / Ownership / News sections.
   All figures are illustrative sample data (see the footer note). */
(() => {
  const I = window.Insidir || {};
  const main = document.querySelector(".co");
  if (!main) return;

  const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const esc = s => String(s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const raf2 = fn => requestAnimationFrame(() => requestAnimationFrame(fn));
  const ARROW = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6"/></svg>';
  const EXT = '<svg class="ext" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M7 17 17 7M8 7h9v9"/></svg>';

  /* ------------------------------------------------------------------
     Sample data
     ------------------------------------------------------------------ */
  // AAPL one-year closes, traced from the reference chart (Jan–Dec 2023).
  const AAPL_1Y = [122.06,124.69,125.81,127.5,129.38,128.62,126.75,126,127.12,127.88,128.81,129.19,129.56,129.19,129.75,130.5,131.06,131.81,132,131.06,130.12,130.12,130.31,130.31,129.56,128.25,127.88,128.81,130.31,131.44,132.38,132.56,132.19,132.19,132.75,133.69,134.81,135.94,137.44,138.75,138.19,137.25,137.06,137.81,138.38,138.94,139.31,139.31,139.12,138.56,138.56,138.38,138.94,139.88,140.62,140.81,140.81,141,141.56,142.31,141.75,140.62,139.69,139.31,140.25,139.5,138.38,137.44,137.62,138.38,139.12,140.06,141,141.75,142.69,143.25,143.81,144,143.81,144.56,145.31,145.88,145.69,145.88,146.62,147.38,147.56,147.38,147.38,148.12,149.06,149.62,148.5,147.56,147.38,147,146.81,146.25,145.88,145.31,144.56,144,144.38,145.12,146.25,147,147.94,148.88,149.44,149.81,150.56,150.94,151.69,152.62,153.75,155.25,156.19,155.62,155.06,155.06,155.81,156.94,158.06,157.69,156.75,157.12,157.5,157.5,156.75,156.38,155.44,154.69,154.12,154.5,154.88,155.25,155.81,156.38,156,155.25,154.12,153.56,153,151.88,152.06,153,153,152.62,153,154.12,155.44,156,155.62,154.88,155.25,155.62,154.69,153.94,153.38,154.12,155.44,156.56,157.88,158.62,159.38,160.31,161.25,162,162,161.62,161.44,162,162.56,163.5,163.88,163.69,163.31,163.88,164.81,165.38,164.81,163.5,162.75,162,161.25,160.5,160.88,161.62,162,161.06,159.75,158.44,157.12,157.31,158.44,159.56,160.12,160.5,161.06,161.62,162.38,162.75,162.94,163.31,164.62,165.56,166.69,167.62,168.38,169.12,169.88,170.62,171.38,172.12,171.94,171.38,170.81,170.25,170.81,171.75,172.5,173.25,173.44,173.06,172.5,172.31,172.69,172.31,171.38,171.19,171.56,172.5,173.06,173.81,173.81,173.62,173.81,174.19,174.75,175.31,175.88,176.62,176.81,176.62,176.81,177.75,178.5,178.5,177.38,177.38,177.94,178.5,179.25,179.62,179.25,180,180.56,181.12,181.31,181.5,181.31];

  const PROFILES = {
    AAPL: { name: "Apple Inc.", short: "Apple", logo: "apple", sector: "Technology", exchange: "Nasdaq", price: 168.21, change: 0.60,
      cap: "2.63T", volume: "34.2M", pe: "28.4", range: "124.17 – 199.62", industry: "Consumer Electronics", website: "apple.com",
      cik: "0000320193", five: 3.0, ceo: ["Tim Cook", "Chief Executive Officer", "Sell", 49938] },
    NVDA: { name: "NVIDIA Corporation", short: "NVIDIA", logo: "nvidia", sector: "Technology", exchange: "Nasdaq", price: 146.33, change: 2.30,
      cap: "3.59T", volume: "212.4M", pe: "57.6", industry: "Semiconductors", website: "nvidia.com",
      cik: "0001045810", growth: 1.86, vol: 0.021, five: 6.5, ceo: ["Jensen Huang", "President & CEO", "Buy", 120276] },
    MSFT: { name: "Microsoft Corporation", short: "Microsoft", logo: "microsoft", sector: "Technology", exchange: "Nasdaq", price: 443.21, change: 0.40,
      cap: "3.29T", volume: "18.7M", pe: "37.9", industry: "Software—Infrastructure", website: "microsoft.com",
      cik: "0000789019", growth: 1.21, vol: 0.011, five: 2.4, ceo: ["Satya Nadella", "Chairman & CEO", "Buy", 74908] },
    TSLA: { name: "Tesla, Inc.", short: "Tesla", logo: "tesla", sector: "Consumer Cyclical", exchange: "Nasdaq", price: 195.22, change: -0.80,
      cap: "622.8B", volume: "96.3M", pe: "49.8", industry: "Auto Manufacturers", website: "tesla.com",
      cik: "0001318605", growth: 0.88, vol: 0.02, five: 4.2 },
    META: { name: "Meta Platforms, Inc.", short: "Meta", logo: "meta", sector: "Communication Services", exchange: "Nasdaq", price: 301.12, change: 1.20,
      cap: "773.9B", volume: "15.2M", pe: "26.1", industry: "Internet Content & Information", website: "meta.com",
      cik: "0001326801", growth: 1.44, vol: 0.016, five: 1.9, ceo: ["Mark Zuckerberg", "Chair & CEO", "Sell", 99960] },
    GOOGL: { name: "Alphabet Inc.", short: "Alphabet", logo: "google", sector: "Communication Services", exchange: "Nasdaq", price: 139.69, change: 0.85,
      cap: "1.75T", volume: "24.8M", pe: "24.6", industry: "Internet Content & Information", website: "abc.xyz",
      cik: "0001652044", growth: 1.31, vol: 0.014, five: 2.6 },
    ABNB: { name: "Airbnb, Inc.", short: "Airbnb", logo: "airbnb", sector: "Consumer Cyclical", exchange: "Nasdaq", price: 144.26, change: -0.35,
      cap: "92.3B", volume: "4.1M", pe: "21.8", industry: "Travel Services", website: "airbnb.com",
      cik: "0001559720", growth: 1.12, vol: 0.017, five: 1.6, ceo: ["Brian Chesky", "Co-founder & CEO", "Buy", 74865] }
  };

  const FILINGS = {
    AAPL: [["8-K", "Jan 8, 2024", "Current report", "Material event disclosure"],
      ["4", "Jan 8, 2024", "Statement of changes in beneficial ownership", "Reported by Tim Cook, Chief Executive Officer"],
      ["10-K", "Jan 6, 2024", "Annual report", "Fiscal year ended September 30, 2023"],
      ["DEF 14A", "Jan 2, 2024", "Definitive proxy statement", "Annual meeting of shareholders"],
      ["8-K", "Nov 2, 2023", "Current report", "Results of operations and financial condition"],
      ["10-Q", "Aug 4, 2023", "Quarterly report", "Quarter ended July 1, 2023"]],
    NVDA: [["10-Q", "Jan 8, 2024", "Quarterly report", "Quarter ended October 29, 2023"],
      ["4", "Jan 8, 2024", "Statement of changes in beneficial ownership", "Reported by Jensen Huang, President & CEO"],
      ["8-K", "Nov 21, 2023", "Current report", "Results of operations and financial condition"],
      ["DEF 14A", "May 8, 2023", "Definitive proxy statement", "Annual meeting of stockholders"],
      ["10-K", "Feb 24, 2023", "Annual report", "Fiscal year ended January 29, 2023"]],
    MSFT: [["4", "Jan 8, 2024", "Statement of changes in beneficial ownership", "Reported by Satya Nadella, Chairman & CEO"],
      ["8-K", "Jan 7, 2024", "Current report", "Material event disclosure"],
      ["10-Q", "Oct 24, 2023", "Quarterly report", "Quarter ended September 30, 2023"],
      ["DEF 14A", "Oct 19, 2023", "Definitive proxy statement", "Annual shareholders meeting"],
      ["10-K", "Jul 27, 2023", "Annual report", "Fiscal year ended June 30, 2023"]],
    TSLA: [["4", "Jan 7, 2024", "Statement of changes in beneficial ownership", "Reported by a director"],
      ["8-K", "Jan 2, 2024", "Current report", "Production and deliveries update"],
      ["10-Q", "Oct 23, 2023", "Quarterly report", "Quarter ended September 30, 2023"],
      ["DEF 14A", "Apr 28, 2023", "Definitive proxy statement", "Annual meeting of stockholders"],
      ["10-K", "Jan 31, 2023", "Annual report", "Fiscal year ended December 31, 2022"]],
    META: [["4", "Jan 8, 2024", "Statement of changes in beneficial ownership", "Reported by Mark Zuckerberg, Chair & CEO"],
      ["10-K", "Jan 6, 2024", "Annual report", "Most recent fiscal year"],
      ["10-Q", "Oct 26, 2023", "Quarterly report", "Quarter ended September 30, 2023"],
      ["8-K", "Oct 25, 2023", "Current report", "Results of operations and financial condition"],
      ["DEF 14A", "Apr 14, 2023", "Definitive proxy statement", "Annual meeting of stockholders"]],
    GOOGL: [["8-K", "Jan 5, 2024", "Current report", "Material event disclosure"],
      ["4", "Dec 20, 2023", "Statement of changes in beneficial ownership", "Reported by a director"],
      ["10-Q", "Oct 25, 2023", "Quarterly report", "Quarter ended September 30, 2023"],
      ["DEF 14A", "Apr 21, 2023", "Definitive proxy statement", "Annual meeting of stockholders"],
      ["10-K", "Feb 3, 2023", "Annual report", "Fiscal year ended December 31, 2022"]],
    ABNB: [["4", "Jan 8, 2024", "Statement of changes in beneficial ownership", "Reported by Brian Chesky, Co-founder & CEO"],
      ["8-K", "Jan 5, 2024", "Current report", "Material event disclosure"],
      ["10-Q", "Nov 2, 2023", "Quarterly report", "Quarter ended September 30, 2023"],
      ["DEF 14A", "Apr 21, 2023", "Definitive proxy statement", "Annual meeting of stockholders"],
      ["10-K", "Feb 17, 2023", "Annual report", "Fiscal year ended December 31, 2022"]]
  };

  // Revenue / net income in USD billions, diluted EPS in USD, operating margin in %.
  const FINANCIALS = {
    AAPL: { rev: [365.8, 394.3, 383.3], ni: [94.7, 99.8, 97.0], eps: [5.61, 6.11, 6.13], om: [29.8, 30.3, 29.8], note: "Fiscal years end in late September." },
    NVDA: { rev: [16.7, 26.9, 27.0], ni: [4.3, 9.8, 4.4], eps: [1.73, 3.85, 1.74], om: [27.2, 37.3, 15.7], note: "Fiscal years end in late January; EPS before the 2024 stock split." },
    MSFT: { rev: [168.1, 198.3, 211.9], ni: [61.3, 72.7, 72.4], eps: [8.05, 9.65, 9.68], om: [41.6, 42.1, 41.8], note: "Fiscal years end June 30." },
    TSLA: { rev: [53.8, 81.5, 96.8], ni: [5.5, 12.6, 15.0], eps: [1.63, 3.62, 4.30], om: [12.1, 16.8, 9.2], note: "Fiscal years end December 31." },
    META: { rev: [117.9, 116.6, 134.9], ni: [39.4, 23.2, 39.1], eps: [13.77, 8.59, 14.87], om: [39.6, 24.8, 34.7], note: "Fiscal years end December 31." },
    GOOGL: { rev: [257.6, 282.8, 307.4], ni: [76.0, 60.0, 73.8], eps: [5.61, 4.56, 5.80], om: [30.6, 26.5, 27.4], note: "Fiscal years end December 31; EPS split-adjusted." },
    ABNB: { rev: [6.0, 8.4, 9.9], ni: [-0.35, 1.9, 4.8], eps: [-0.57, 2.79, 7.24], om: [7.2, 21.5, 15.3], note: "Fiscal years end December 31." }
  };

  const HOLDERS = {
    AAPL: [["Vanguard Group", 8.6], ["BlackRock", 6.6], ["Berkshire Hathaway", 5.8], ["State Street", 3.7], ["FMR (Fidelity)", 2.0], ["Geode Capital Management", 1.9]],
    NVDA: [["Vanguard Group", 8.3], ["BlackRock", 7.4], ["FMR (Fidelity)", 4.2], ["State Street", 3.9], ["Geode Capital Management", 2.0], ["JPMorgan Chase", 1.5]],
    MSFT: [["Vanguard Group", 8.9], ["BlackRock", 7.3], ["State Street", 3.9], ["FMR (Fidelity)", 2.9], ["Geode Capital Management", 2.1], ["T. Rowe Price", 1.6]],
    TSLA: [["Vanguard Group", 7.2], ["BlackRock", 5.9], ["State Street", 3.4], ["Geode Capital Management", 1.7], ["Capital Research", 1.3], ["Morgan Stanley", 1.1]],
    META: [["Vanguard Group", 7.6], ["BlackRock", 6.5], ["FMR (Fidelity)", 5.4], ["State Street", 3.4], ["T. Rowe Price", 2.4], ["Geode Capital Management", 1.7]],
    GOOGL: [["Vanguard Group", 7.3], ["BlackRock", 6.2], ["State Street", 3.4], ["FMR (Fidelity)", 2.9], ["Geode Capital Management", 1.7], ["T. Rowe Price", 1.4]],
    ABNB: [["Vanguard Group", 8.1], ["BlackRock", 5.6], ["Baillie Gifford", 3.2], ["State Street", 2.6], ["Morgan Stanley", 2.1], ["Geode Capital Management", 1.5]]
  };

  // Placeholder insiders (fictional names) used for the sample tables.
  const NAMES = ["Marisa Hale", "Owen Patel", "Grace Lindqvist", "Daniel Okafor", "Helen Moreau", "Victor Alvarez", "Naomi Brandt", "Samuel Reyes", "Ingrid Toft", "Paul Ishikawa", "Clara Novak", "Martin Doyle"];
  const TITLES = ["Director", "SVP, Operations", "General Counsel", "Chief Accounting Officer", "Director", "EVP, Finance", "Chief Technology Officer", "Director"];
  const DATES = ["Jan 8, 2024", "Jan 3, 2024", "Dec 15, 2023", "Nov 30, 2023", "Nov 14, 2023", "Oct 2, 2023", "Sep 12, 2023"];

  /* ------------------------------------------------------------------
     Helpers
     ------------------------------------------------------------------ */
  function rng(seed) {
    let s = 0;
    for (const ch of String(seed)) s = (s * 131 + ch.charCodeAt(0)) >>> 0;
    return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
  }
  // Random walk bent into a bridge that starts at `from` and ends exactly at `to`.
  function bridge(seed, n, from, to, vol) {
    const r = rng(seed), w = [0];
    for (let i = 1; i < n; i++) w.push(w[i - 1] + ((r() - 0.5) * 2 + (r() - 0.5)) * vol);
    const end = w[n - 1], k = Math.log(to / from);
    return w.map((v, i) => +(from * Math.exp(v - end * i / (n - 1) + k * i / (n - 1))).toFixed(2));
  }
  // Light centred moving average so generated series read like the reference trace
  // rather than raw noise; endpoints are pinned back to their original values.
  function smooth(values, radius) {
    const n = values.length, out = values.map((_, i) => {
      let sum = 0, c = 0;
      for (let k = Math.max(0, i - radius); k <= Math.min(n - 1, i + radius); k++) { sum += values[k]; c++; }
      return sum / c;
    });
    const d0 = values[0] - out[0], d1 = values[n - 1] - out[n - 1];
    return out.map((v, i) => +(v + d0 + (d1 - d0) * i / (n - 1)).toFixed(2));
  }
  // Adds intermediate points (with a little texture) between existing ones.
  function densify(values, k, seed, vol) {
    const r = rng(seed), out = [];
    for (let i = 0; i < values.length - 1; i++) {
      const a = values[i], b = values[i + 1];
      out.push(a);
      for (let j = 1; j < k; j++) out.push(+(a + (b - a) * j / k + (r() - 0.5) * vol * a).toFixed(2));
    }
    out.push(values[values.length - 1]);
    return out;
  }
  function niceTicks(min, max) {
    const span = max - min || Math.abs(max) * 0.02 || 1;
    const raw = span / 4;
    const p = Math.pow(10, Math.floor(Math.log10(raw)));
    const step = [1, 2, 2.5, 5, 10].map(m => m * p).find(s => s >= raw - 1e-12);
    const decimals = Math.max(0, Math.ceil(-Math.log10(step) - 1e-9) + (String(step / p).includes(".") ? 1 : 0));
    const ticks = [];
    let start = Math.floor(min / step) * step;
    if (min - start > step * 0.5) start += step; // don't stretch the plot far below the data
    for (let t = start; t <= max + 1e-9; t += step) ticks.push(+t.toFixed(6));
    return { ticks, decimals };
  }
  const money = v => {
    const a = Math.abs(v), sign = v < 0 ? "−" : "";
    if (a >= 1e9) return `${sign}$${(a / 1e9).toFixed(2)}B`;
    if (a >= 1e6) return `${sign}$${(a / 1e6).toFixed(1)}M`;
    if (a >= 1e3) return `${sign}$${(a / 1e3).toFixed(1)}K`;
    return `${sign}$${a.toFixed(0)}`;
  };
  const int = n => Math.round(n).toLocaleString("en-US");
  const bigNum = n => n >= 1e9 ? (n / 1e9).toFixed(2) + "B" : n >= 1e6 ? (n / 1e6).toFixed(1) + "M" : int(n);
  const parseCap = s => { const m = String(s).match(/([\d.]+)\s*([TBM])/); return m ? +m[1] * { T: 1e12, B: 1e9, M: 1e6 }[m[2]] : 0; };
  const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const dayToDate = (doy, year = 2023) => { const d = new Date(Date.UTC(year, 0, 1 + Math.round(doy))); return `${MONTHS[d.getUTCMonth()]} ${d.getUTCDate()}, ${d.getUTCFullYear()}`; };
  const dateToDoy = str => { const d = new Date(str + " UTC"); return (d - Date.UTC(d.getUTCFullYear(), 0, 1)) / 864e5; };
  const hm = mins => `${Math.floor(mins / 60)}:${String(mins % 60).padStart(2, "0")}`;
  const brand = (ticker, size) => (I.logo ? I.logo(ticker, size) : "");

  /* ------------------------------------------------------------------
     Resolve the requested ticker
     ------------------------------------------------------------------ */
  const params = new URLSearchParams(location.search);
  const rawTicker = (params.get("ticker") || "AAPL").trim();
  const T = rawTicker.toUpperCase().replace(/[^A-Z0-9.\-]/g, "").slice(0, 10) || "AAPL";
  const P = PROFILES[T];
  main.dataset.ticker = T;

  if (!P) { renderMissing(); return; }

  /* ------------------------------------------------------------------
     Series for every chart range (all derived from one 1Y base so the
     ranges agree with each other)
     ------------------------------------------------------------------ */
  const N = 261;
  const base = T === "AAPL" ? AAPL_1Y.slice()
    : smooth(bridge(T + "-1y", N, P.price / P.growth, P.price, P.vol || 0.015), 2);
  const last = base[N - 1];
  const doyAt = i => i / (N - 1) * 364;
  const idxAt = doy => Math.max(0, Math.min(N - 1, Math.round(doy / 364 * (N - 1))));

  if (!P.range) {
    const lo = Math.min(...base) * 0.985, hi = Math.max(...base) * 1.012;
    P.range = `${lo.toFixed(2)} – ${hi.toFixed(2)}`;
  }

  const RANGES = {
    "1D": () => {
      const open = last / (1 + P.change / 100);
      const values = bridge(T + "-1d", 196, open, last, 0.00072);
      const labels = [], pos = [];
      for (let k = 0; k <= 13; k++) { const m = 570 + k * 30; labels.push(m % 60 === 0 || k === 0 ? hm(m) : ""); pos.push(k / 13); }
      return { values, labels, pos, caption: "1 day, 9:30 to 16:00 ET", tip: i => `${hm(570 + i * 2)} ET` };
    },
    "1W": () => {
      const closes = base.slice(N - 6), values = [];
      for (let d = 0; d < 5; d++) {
        const day = bridge(`${T}-1w-${d}`, 15, closes[d], closes[d + 1], 0.0016);
        values.push(...(d ? day.slice(1) : day));
      }
      const days = ["Mon", "Tue", "Wed", "Thu", "Fri"];
      return { values, labels: days, pos: [0, 0.2, 0.4, 0.6, 0.8], caption: "1 week",
        tip: i => { const d = Math.min(4, Math.floor(i / 14)); return `${days[d]} ${hm(570 + (i - d * 14) * 30)}`; } };
    },
    "1M": () => {
      const start = idxAt(334), slice = base.slice(start);
      const values = densify(slice, 4, T + "-1m", 0.0016);
      const span = 364 - doyAt(start);
      const days = [1, 8, 15, 22, 29];
      return { values, labels: days.map(d => `Dec ${d}`), pos: days.map(d => Math.max(0, (333 + d - doyAt(start)) / span)), caption: "1 month",
        tip: i => dayToDate(doyAt(start) + i / (values.length - 1) * span) };
    },
    "3M": () => {
      const start = idxAt(273), slice = base.slice(start);
      const values = densify(slice, 2, T + "-3m", 0.0018);
      const span = 364 - doyAt(start);
      return { values, labels: ["Oct", "Nov", "Dec"], pos: [273, 304, 334].map(d => (d - doyAt(start)) / span), caption: "3 months",
        tip: i => dayToDate(doyAt(start) + i / (values.length - 1) * span) };
    },
    "1Y": () => ({ values: base, labels: MONTHS, pos: MONTHS.map((_, i) => i / 11.32), caption: "1 year",
      tip: i => dayToDate(doyAt(i)) }),
    "5Y": () => {
      const early = bridge(T + "-5y", 209, base[0] / P.five, base[0], 0.028);
      const weekly = base.filter((_, i) => i % 5 === 0);
      const values = early.concat(weekly.slice(1));
      const n = values.length;
      return { values, labels: ["2019", "2020", "2021", "2022", "2023"], pos: [0, 52, 104, 156, 208].map(i => i / (n - 1)), caption: "5 years",
        tip: i => { const yearF = 2019 + i / (n - 1) * 5; const y = Math.min(2023, Math.floor(yearF)); return dayToDate((yearF - y) * 364, y); } };
    }
  };

  /* ------------------------------------------------------------------
     Header + key stats
     ------------------------------------------------------------------ */
  const pct = `${P.change >= 0 ? "+" : "−"}${Math.abs(P.change).toFixed(2)}%`;
  const fields = {
    name: P.name, ticker: T, sector: P.sector, exchange: P.exchange, price: `$${P.price.toFixed(2)}`, change: pct,
    cap: P.cap, volume: P.volume, pe: P.pe, range: P.range, industry: P.industry
  };
  $$("[data-f]", main).forEach(el => {
    const key = el.dataset.f;
    if (key === "logo") { el.src = `assets/icons/${P.logo}.svg`; el.alt = `${P.short} logo`; return; }
    if (key === "website") {
      el.href = `https://${P.website}`;
      el.querySelector("span").textContent = P.website;
      el.setAttribute("aria-label", `${P.website} (opens in a new tab)`);
      return;
    }
    if (key in fields) el.textContent = fields[key];
  });
  const chgEl = $('[data-f="change"]', main);
  chgEl.classList.toggle("up", P.change >= 0);
  chgEl.classList.toggle("down", P.change < 0);
  chgEl.setAttribute("aria-label", `${P.change >= 0 ? "up" : "down"} ${Math.abs(P.change).toFixed(2)} percent today`);
  const priceEl = $('[data-f="price"]', main);
  priceEl.dataset.countFrom = (P.price * 0.84).toFixed(2);

  document.title = `${P.name} (${T}) — insidir.`;
  const desc = document.querySelector('meta[name="description"]');
  if (desc) desc.content = `Price chart, key statistics, insider activity, SEC filings, financials and ownership for ${P.name} (${T}), compiled from public records.`;

  $$(".co-stats dd", main).forEach(dd => dd.classList.toggle("is-long", dd.textContent.trim().length > 24));

  // stats rows enter one after another
  $$(".co-stats > div", main).forEach((row, i) => row.style.setProperty("--delay", (0.62 + i * 0.075).toFixed(3) + "s"));

  /* ------------------------------------------------------------------
     Price chart
     ------------------------------------------------------------------ */
  const host = $("#price-chart");
  const caption = $("[data-chart-caption]");
  const rangeGroup = $(".co-range", main);
  let currentRange = "1Y", chartDirty = false, lastWidth = 0;

  function drawChart(key, { animate = true, delay = 0 } = {}) {
    if (!host || !I.areaChart) return;
    if (host.offsetParent === null || !host.clientWidth) { chartDirty = true; return; }
    chartDirty = false;
    const r = RANGES[key]();
    const values = r.values;
    const min = Math.min(...values), max = Math.max(...values);
    const { ticks, decimals } = niceTicks(min, max);
    const green = values[values.length - 1] >= values[0];
    const color = green ? "var(--green-chart, var(--green))" : "var(--red-chart, var(--red))";

    // Instant redraws (resize) insert with transitions off; animated draws rely on
    // motion.js, which measures each path before it is first painted.
    if (!animate) host.classList.add("no-anim");
    host.style.setProperty("--delay", (delay / 1000).toFixed(2) + "s");
    const svg = I.areaChart(host, values, {
      labels: r.labels, ticks, color,
      format: (v, i) => `${r.tip(i)} · $${v.toFixed(2)}`
    });
    lastWidth = host.clientWidth;
    tuneAxes(svg, r, ticks, decimals);
    svg.setAttribute("aria-label", `${P.short} share price, ${r.caption}. From $${values[0].toFixed(2)} to $${values[values.length - 1].toFixed(2)}. Sample data.`);
    if (caption) caption.textContent = `Price history, ${r.caption}`;
    if (!animate) {
      svg.classList.add("is-in");
      svg.dataset.observed = "1";
      void svg.getBoundingClientRect();
      raf2(() => host.classList.remove("no-anim"));
    }
    return svg;
  }

  // Current value of the CSS design unit (--u) in px.
  function unit() {
    const probe = document.createElement("span");
    probe.style.cssText = "position:absolute;visibility:hidden;width:calc(100 * var(--u));height:0";
    main.appendChild(probe);
    const u = probe.getBoundingClientRect().width / 100 || 1;
    probe.remove();
    return u;
  }

  // Positions month/hour labels like the reference (period starts, right-hand
  // price scale set slightly away from the plot) and formats the tick text.
  function tuneAxes(svg, r, ticks, decimals) {
    const W = host.clientWidth, H = host.clientHeight;
    const padL = 8, padR = 46, padT = 14, plotW = W - padL - padR;
    const u = unit();
    const vlines = $$("line.grid--v", svg);
    const texts = $$("text.axis", svg);
    const xTexts = texts.filter(t => t.getAttribute("text-anchor") === "middle");
    const yTexts = texts.filter(t => t.getAttribute("text-anchor") !== "middle");
    let lastRight = -Infinity;
    xTexts.forEach((t, i) => {
      let x = padL + (r.pos[i] ?? i / (xTexts.length - 1)) * plotW;
      const tw = t.textContent && t.getComputedTextLength ? t.getComputedTextLength() : 0;
      // short month names straddle the frame edge like the reference; longer labels are nudged inside
      if (tw > 32) x = Math.max(x, padL + tw / 2 - 14);
      t.setAttribute("x", x.toFixed(1));
      t.setAttribute("y", (H - 8 + 20 * u).toFixed(1));
      if (vlines[i]) { vlines[i].setAttribute("x1", x.toFixed(1)); vlines[i].setAttribute("x2", x.toFixed(1)); }
      if (!t.textContent) return;
      const w = t.getComputedTextLength ? t.getComputedTextLength() : 30;
      if (x - w / 2 < lastRight + 10) t.textContent = "";
      else lastRight = x + w / 2;
    });
    yTexts.forEach((t, i) => {
      t.setAttribute("x", (W - padR + 12 + 28 * u).toFixed(1));
      t.setAttribute("y", (+t.getAttribute("y") + 2 * u).toFixed(1));
      if (ticks[i] != null) t.textContent = ticks[i].toFixed(decimals);
    });
    // frame: a top rule a little above the highest tick and a closing rule on the right
    const hl = $$("line.grid:not(.grid--v)", svg);
    const topTick = hl.length ? Math.min(...hl.map(l => +l.getAttribute("y1"))) : padT;
    const topY = Math.max(1, Math.min(padT, topTick - 18 * u)).toFixed(1);
    const bottomY = (H - 30).toFixed(1);
    vlines.forEach(l => l.setAttribute("y1", topY));
    const NS = "http://www.w3.org/2000/svg";
    const mk = (x1, x2, y1, y2, cls) => {
      const l = document.createElementNS(NS, "line");
      l.setAttribute("class", cls);
      l.setAttribute("x1", x1); l.setAttribute("x2", x2); l.setAttribute("y1", y1); l.setAttribute("y2", y2);
      return l;
    };
    const area = svg.querySelector(".area");
    const stops = svg.querySelectorAll("linearGradient stop");
    if (stops.length === 2) { stops[0].setAttribute("stop-opacity", ".34"); stops[1].setAttribute("stop-opacity", ".03"); }
    svg.insertBefore(mk(padL, W - padR, topY, topY, "grid"), area);
    svg.insertBefore(mk(W - padR, W - padR, topY, bottomY, "grid grid--v"), area);
  }

  drawChart(currentRange, { delay: reduce ? 0 : 560 });

  if (rangeGroup) {
    rangeGroup.addEventListener("segment-change", e => {
      $$("button", rangeGroup).forEach(b => { b.tabIndex = b === e.detail.button ? 0 : -1; });
      const key = e.detail && e.detail.value;
      if (!key || key === currentRange || !RANGES[key]) return;
      currentRange = key;
      drawChart(key, { delay: 0 });
    });
    // arrow keys move between range buttons
    rangeGroup.addEventListener("keydown", e => {
      const btns = $$("button", rangeGroup);
      const i = btns.indexOf(document.activeElement);
      if (i < 0) return;
      let j = null;
      if (e.key === "ArrowRight") j = (i + 1) % btns.length;
      else if (e.key === "ArrowLeft") j = (i - 1 + btns.length) % btns.length;
      else if (e.key === "Home") j = 0;
      else if (e.key === "End") j = btns.length - 1;
      if (j == null) return;
      e.preventDefault();
      btns[j].focus();
      btns[j].click();
    });
  }

  let resizeTimer;
  window.addEventListener("resize", () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => {
      if (host && host.clientWidth && Math.abs(host.clientWidth - lastWidth) > 2) drawChart(currentRange, { animate: false });
      placeIndicator(false);
    }, 140);
  });

  /* ------------------------------------------------------------------
     Watchlist toggle (localStorage + optional engine)
     ------------------------------------------------------------------ */
  const WL_KEY = "insidir.watchlist";
  const readList = () => { try { const v = JSON.parse(localStorage.getItem(WL_KEY) || "[]"); return Array.isArray(v) ? v : []; } catch (_) { return []; } };
  const writeList = list => { try { localStorage.setItem(WL_KEY, JSON.stringify(list)); } catch (_) { /* storage blocked */ } };
  const watchBtn = $("[data-watch]", main);
  function paintWatch(on) {
    if (!watchBtn) return;
    watchBtn.dataset.on = String(on);
    watchBtn.querySelector(".co-watch__label").textContent = on ? "On watchlist" : "Add to watchlist";
    watchBtn.title = on ? `Remove ${T} from your watchlist` : `Add ${T} to your watchlist`;
  }
  if (watchBtn) {
    paintWatch(readList().includes(T));
    watchBtn.addEventListener("click", () => {
      const list = readList();
      const on = !list.includes(T);
      writeList(on ? [...list, T] : list.filter(x => x !== T));
      paintWatch(on);
      watchBtn.classList.remove("is-popping");
      void watchBtn.offsetWidth;
      watchBtn.classList.add("is-popping");
      if (I.toast) I.toast(on ? `${T} added to your watchlist` : `${T} removed from your watchlist`);
      if (I.api) {
        const req = on ? I.api("/v1/me/watchlist", { method: "POST", body: { ticker: T } })
          : I.api(`/v1/me/watchlist/${encodeURIComponent(T)}`, { method: "DELETE" });
        req.catch(() => { /* engine not attached or signed out: local list is the source of truth */ });
      }
    });
  }

  /* ------------------------------------------------------------------
     Other sections
     ------------------------------------------------------------------ */
  const priceAt = date => /2024/.test(date) ? P.price : base[idxAt(dateToDoy(date))];

  function insiderRows() {
    const r = rng(T + "-ins");
    const rows = [];
    if (P.ceo) rows.push({ date: DATES[0], name: P.ceo[0], title: P.ceo[1], type: P.ceo[2], shares: P.ceo[3] });
    const offset = Math.floor(r() * NAMES.length);
    for (let i = rows.length, k = 0; rows.length < 6; i++, k++) {
      const name = NAMES[(offset + k * 5) % NAMES.length];
      const type = r() < 0.38 ? "Buy" : "Sell";
      const shares = Math.round((type === "Buy" ? 800 + r() * 4200 : 2500 + r() * 30000) / 10) * 10;
      rows.push({ date: DATES[i], name, title: TITLES[(offset + k) % TITLES.length], type, shares });
    }
    return rows.map(x => ({ ...x, price: priceAt(x.date), value: x.shares * priceAt(x.date) }));
  }

  function renderInsiders() {
    const rows = insiderRows();
    const buys = rows.filter(x => x.type === "Buy"), sells = rows.filter(x => x.type === "Sell");
    const sum = list => list.reduce((s, x) => s + x.value, 0);
    const net = sum(buys) - sum(sells);
    return `<div class="panel co-card">
      <div class="co-card__head">
        <div><h2 class="co-card__title">Insider activity</h2><p class="co-card__sub">Open-market transactions reported on Form 4 by ${esc(P.short)} officers and directors.</p></div>
        <span class="sample-note">Sample transactions</span>
      </div>
      <dl class="co-kpis">
        <div class="co-kpi row-in" style="--delay:.05s"><dt>Insider buys</dt><dd>${buys.length} · ${money(sum(buys))}</dd></div>
        <div class="co-kpi row-in" style="--delay:.11s"><dt>Insider sells</dt><dd>${sells.length} · ${money(sum(sells))}</dd></div>
        <div class="co-kpi row-in" style="--delay:.17s"><dt>Net activity</dt><dd class="${net >= 0 ? "pos" : "neg"}">${net >= 0 ? "+" : ""}${money(net)}</dd></div>
        <div class="co-kpi row-in" style="--delay:.23s"><dt>Latest filing</dt><dd>${esc(rows[0].date)}</dd></div>
      </dl>
      <div class="table-scroll"><table class="data-table co-table">
        <caption class="sr-only">Recent insider transactions in ${esc(T)} (sample data)</caption>
        <thead><tr><th scope="col">Date</th><th scope="col">Insider</th><th scope="col">Title</th><th scope="col">Transaction</th><th scope="col" class="num">Shares</th><th scope="col" class="num">Price</th><th scope="col" class="num">Value</th></tr></thead>
        <tbody>${rows.map((x, i) => `<tr class="row-in" style="--delay:${(0.2 + i * 0.07).toFixed(2)}s">
          <td class="muted">${esc(x.date)}</td>
          <td><span class="person">${I.monogram ? I.monogram(x.name) : ""}${esc(x.name)}</span></td>
          <td class="muted">${esc(x.title)}</td>
          <td><span class="co-tx ${x.type === "Buy" ? "buy" : "sell"}">${x.type}</span></td>
          <td class="num">${int(x.shares)}</td>
          <td class="num muted">$${x.price.toFixed(2)}</td>
          <td class="num">${money(x.value)}</td></tr>`).join("")}</tbody>
      </table></div>
      <p class="co-card__foot">Transactions are illustrative. Insider filings originate from SEC EDGAR; verify against the original Form 4 before acting.</p>
    </div>`;
  }

  function renderFilings() {
    const list = (FILINGS[T] || []).slice().sort((a, b) => new Date(b[1]) - new Date(a[1]));
    const edgar = form => `https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&CIK=${P.cik}&type=${encodeURIComponent(form)}&dateb=&owner=include&count=40`;
    return `<div class="panel co-card">
      <div class="co-card__head">
        <div><h2 class="co-card__title">SEC filings</h2><p class="co-card__sub">Recent ${esc(P.short)} filings with the U.S. Securities and Exchange Commission.</p></div>
        <span class="sample-note">Sample filing index</span>
      </div>
      <ul class="co-filings">${list.map(([form, date, title, detail], i) => {
        const internal = T === "AAPL" && form === "10-K";
        const href = internal ? "filing.html" : edgar(form);
        const attrs = internal ? "" : ' target="_blank" rel="noopener noreferrer"';
        const go = internal ? `Open filing ${ARROW}` : `View on EDGAR ${EXT}<span class="sr-only"> (opens in a new tab)</span>`;
        return `<li class="row-in" style="--delay:${(0.08 + i * 0.07).toFixed(2)}s"><a class="co-filing" href="${href}"${attrs}>
          <span class="co-form${/^(4|DEF 14A)$/.test(form) ? " co-form--light" : ""}">${esc(form)}</span>
          <span><span class="co-filing__title">${esc(title)}</span><span class="co-filing__desc">${esc(detail)}</span></span>
          <span class="co-filing__date">Filed ${esc(date)}</span>
          <span class="co-filing__go">${go}</span></a></li>`;
      }).join("")}</ul>
      <p class="co-card__foot">Dates are sample values. Full filing history is available on <a href="${edgar("")}" target="_blank" rel="noopener noreferrer">SEC EDGAR</a>.</p>
    </div>`;
  }

  function renderFinancials() {
    const f = FINANCIALS[T];
    const yoy = (a, b, pts) => {
      if (pts) { const d = b - a; return `<span class="co-yoy ${d >= 0 ? "pos" : "neg"}">${d >= 0 ? "+" : "−"}${Math.abs(d).toFixed(1)} pts</span>`; }
      if (a <= 0) return `<span class="co-yoy muted">n/m</span>`;
      const d = (b - a) / Math.abs(a) * 100;
      return `<span class="co-yoy ${d >= 0 ? "pos" : "neg"}">${d >= 0 ? "+" : "−"}${Math.abs(d).toFixed(1)}%</span>`;
    };
    const rows = [
      ["Revenue", f.rev, v => `$${v.toFixed(1)}B`],
      ["Net income", f.ni, v => v < 0 ? `−$${Math.abs(v).toFixed(2)}B` : `$${v.toFixed(1)}B`],
      ["EPS (diluted)", f.eps, v => v < 0 ? `−$${Math.abs(v).toFixed(2)}` : `$${v.toFixed(2)}`],
      ["Operating margin", f.om, v => `${v.toFixed(1)}%`, true]
    ];
    const bars = vals => {
      const max = Math.max(...vals.map(Math.abs)) || 1;
      return `<span class="co-bars${vals[2] < vals[1] ? " is-neg" : ""}" aria-hidden="true">${vals.map((v, i) =>
        `<i class="${v < 0 ? "neg" : ""}" style="--h:${Math.max(8, Math.abs(v) / max * 100).toFixed(0)}%;--delay:${(0.25 + i * 0.09).toFixed(2)}s"></i>`).join("")}</span>`;
    };
    return `<div class="panel co-card">
      <div class="co-card__head">
        <div><h2 class="co-card__title">Financials</h2><p class="co-card__sub">Annual results, fiscal years 2021–2023. ${esc(f.note)}</p></div>
        <span class="sample-note">Illustrative figures</span>
      </div>
      <div class="table-scroll"><table class="data-table co-table co-fin">
        <caption class="sr-only">${esc(P.name)} annual financial summary (illustrative)</caption>
        <thead><tr><th scope="col">Metric</th><th scope="col" class="num">FY2021</th><th scope="col" class="num">FY2022</th><th scope="col" class="num">FY2023</th><th scope="col" class="num">YoY</th><th scope="col" class="num">Trend</th></tr></thead>
        <tbody>${rows.map(([label, vals, fmt, pts], i) => `<tr class="row-in" style="--delay:${(0.1 + i * 0.08).toFixed(2)}s">
          <td>${label}</td>${vals.map(v => `<td class="num">${fmt(v)}</td>`).join("")}
          <td class="num">${yoy(vals[1], vals[2], pts)}</td><td class="num">${bars(vals)}</td></tr>`).join("")}</tbody>
      </table></div>
      <p class="co-card__foot">Figures are shown for illustration and rounded; confirm against the company’s annual reports on Form 10-K.</p>
    </div>`;
  }

  function renderOwnership() {
    const holders = HOLDERS[T];
    const out = parseCap(P.cap) / P.price;
    const max = Math.max(...holders.map(h => h[1]));
    const total = holders.reduce((s, h) => s + h[1], 0);
    return `<div class="panel co-card">
      <div class="co-card__head">
        <div><h2 class="co-card__title">Top institutional holders</h2><p class="co-card__sub">Largest reported positions, based on quarterly 13F holdings reports.</p></div>
        <div class="co-card__aside"><span>Shares outstanding <strong>${bigNum(out)}</strong></span><span>Top ${holders.length} combined <strong>${total.toFixed(1)}%</strong></span><span class="sample-note">Sample holdings</span></div>
      </div>
      <div class="table-scroll"><table class="data-table co-table co-own">
        <caption class="sr-only">Top institutional holders of ${esc(T)} (sample data)</caption>
        <thead><tr><th scope="col">Holder</th><th scope="col" class="num">Shares</th><th scope="col">% of shares outstanding</th><th scope="col" class="num">Value</th></tr></thead>
        <tbody>${holders.map(([name, p], i) => {
          const initials = name.replace(/\(.*?\)/g, "").split(/\s+/).filter(Boolean).slice(0, 2).map(w => w[0]).join("");
          return `<tr class="row-in" style="--delay:${(0.1 + i * 0.07).toFixed(2)}s">
          <td><span class="co-holder"><span class="co-holder__mark" aria-hidden="true">${esc(initials)}</span>${esc(name)}</span></td>
          <td class="num">${bigNum(out * p / 100)}</td>
          <td><span class="co-pct"><span class="co-pct__bar" aria-hidden="true"><i style="--v:${(p / max).toFixed(3)};--delay:${(0.3 + i * 0.08).toFixed(2)}s"></i></span><span class="co-pct__val">${p.toFixed(1)}%</span></span></td>
          <td class="num">${money(out * p / 100 * P.price)}</td></tr>`;
        }).join("")}</tbody>
      </table></div>
      <p class="co-card__foot">Positions are illustrative and valued at the last sample price of $${P.price.toFixed(2)}.</p>
    </div>`;
  }

  function renderNews() {
    const s = P.short;
    const stories = [
      ["Filings Digest", "2h ago", `${s} files a Form 8-K current report`, "A summary of the latest current report and what changed since the prior filing.", "#sec-filings", "SEC filings"],
      ["Insidir Desk", "6h ago", `Insider activity at ${s}: what the latest Form 4s show`, "Buys, sells and the size of each reported transaction over the past quarter.", "#insider-activity", "Insider activity"],
      ["Markets Brief", "1d ago", `${P.sector} shares lead as trading volume picks up`, `How ${T} traded against its sector over the session.`, "#overview", "Overview"],
      ["Filings Digest", "2d ago", `Inside ${s}’s annual report: segments, risks and outlook`, "Key sections of the most recent annual report, in plain language.", T === "AAPL" ? "filing.html" : "#sec-filings", T === "AAPL" ? "Read the 10-K" : "SEC filings"],
      ["Insidir Desk", "4d ago", `Who owns ${T}? The largest institutional positions`, "The biggest reported holders and how concentrated ownership is.", "#ownership", "Ownership"],
      ["Insidir Learn", "1w ago", "How to read a Form 4 filing in five minutes", "A field guide to transaction codes, ownership type and footnotes.", "#insider-activity", "Insider activity"]
    ];
    return `<div class="co-news">
      <div class="co-news__note"><h2>Latest coverage</h2><p><span class="sample-note">Sample headlines for illustration — not real news</span></p></div>
      ${stories.map(([src, when, title, dek, href, cta], i) => `<a class="co-story row-in" href="${href}" style="--delay:${(0.08 + i * 0.07).toFixed(2)}s">
        <span class="co-story__meta"><b>${esc(src)}</b><span aria-hidden="true">·</span><span>${esc(when)}</span></span>
        <span class="co-story__title">${esc(title)}</span>
        <span class="co-story__dek">${esc(dek)}</span>
        <span class="co-story__foot"><span class="co-story__tag">Sample headline</span><span class="co-story__go">${esc(cta)} ${ARROW}</span></span>
      </a>`).join("")}
    </div>`;
  }

  const RENDER = { "insider-activity": renderInsiders, "sec-filings": renderFilings, financials: renderFinancials, ownership: renderOwnership, news: renderNews };
  Object.entries(RENDER).forEach(([key, fn]) => { const panel = $(`#panel-${key}`); if (panel) panel.innerHTML = fn(); });

  /* ------------------------------------------------------------------
     Tabs (ARIA, keyboard, hash, sliding indicator, panel transition)
     ------------------------------------------------------------------ */
  const tablist = $(".co-tabs", main);
  const tabs = $$("[role=tab]", tablist);
  const indicator = $(".tabs__indicator", tablist);
  const panelOf = tab => $(`#${tab.getAttribute("aria-controls")}`);
  tabs.forEach(t => t.setAttribute("data-text", t.textContent.trim()));
  let activeTab = tabs.find(t => t.getAttribute("aria-selected") === "true") || tabs[0];

  function placeIndicator(animate = true, grow = false) {
    if (!indicator || !activeTab) return;
    if (!animate) indicator.style.transition = "none";
    indicator.style.transform = `translateX(${activeTab.offsetLeft}px)`;
    indicator.style.width = (grow ? 0 : activeTab.offsetWidth) + "px";
    if (!animate) { void indicator.offsetWidth; indicator.style.transition = ""; }
  }

  // Puts a panel back into its "not yet revealed" state while it is hidden,
  // so the next reveal replays its row stagger / chart draw from the start.
  function resetPanel(panel) {
    panel.classList.remove("is-in");
    $$(".co-chart__host svg, .co-stats", panel).forEach(el => el.classList.remove("is-in"));
  }

  function enterPanel(panel, animate) {
    resetPanel(panel);
    panel.hidden = false;
    const isOverview = panel.id === "panel-overview";
    const stats = panel.querySelector(".co-stats");
    if (stats) $$(":scope > div", stats).forEach((row, i) => row.style.setProperty("--delay", (0.08 + i * 0.06).toFixed(2) + "s"));
    if (isOverview && (chartDirty || (host && Math.abs(host.clientWidth - lastWidth) > 2))) drawChart(currentRange, { delay: 0 });
    else if (host) host.style.setProperty("--delay", "0s");
    if (animate && !reduce && panel.animate) {
      panel.animate([{ opacity: 0, transform: "translate3d(0,16px,0)" }, { opacity: 1, transform: "none" }],
        { duration: 620, easing: "cubic-bezier(.16,1,.3,1)" });
    }
    raf2(() => {
      panel.classList.add("is-in");
      $$(".co-chart__host svg, .co-stats", panel).forEach(el => el.classList.add("is-in"));
    });
  }

  function select(tab, { focus = false, animate = true, updateHash = true } = {}) {
    if (!tab) return;
    const changed = tab !== activeTab;
    tabs.forEach(t => {
      const on = t === tab;
      t.setAttribute("aria-selected", String(on));
      t.tabIndex = on ? 0 : -1;
    });
    if (changed) {
      const prev = panelOf(activeTab);
      if (prev) { prev.hidden = true; resetPanel(prev); }
    }
    activeTab = tab;
    placeIndicator(animate);
    if (tablist.scrollWidth > tablist.clientWidth) {
      const l = tab.offsetLeft - 16, rgt = tab.offsetLeft + tab.offsetWidth + 16;
      if (l < tablist.scrollLeft || rgt > tablist.scrollLeft + tablist.clientWidth) tablist.scrollTo({ left: l, behavior: reduce ? "auto" : "smooth" });
    }
    const panel = panelOf(tab);
    if (panel && (changed || panel.hidden)) enterPanel(panel, animate);
    if (focus) tab.focus();
    if (updateHash) {
      const hash = "#" + tab.dataset.tab;
      if (location.hash !== hash) history.replaceState(null, "", location.pathname + location.search + hash);
    }
  }

  tabs.forEach(tab => tab.addEventListener("click", () => select(tab)));
  tablist.addEventListener("keydown", e => {
    const i = tabs.indexOf(document.activeElement);
    if (i < 0) return;
    let j = null;
    if (e.key === "ArrowRight") j = (i + 1) % tabs.length;
    else if (e.key === "ArrowLeft") j = (i - 1 + tabs.length) % tabs.length;
    else if (e.key === "Home") j = 0;
    else if (e.key === "End") j = tabs.length - 1;
    if (j == null) return;
    e.preventDefault();
    select(tabs[j], { focus: true });
  });

  const tabFromHash = () => {
    const key = decodeURIComponent(location.hash.replace(/^#/, "")).toLowerCase();
    return tabs.find(t => t.dataset.tab === key);
  };
  window.addEventListener("hashchange", () => {
    const t = tabFromHash();
    if (!t) return;
    select(t, { updateHash: false });
    const top = tablist.getBoundingClientRect().top;
    if (top < 64 || top > innerHeight * 0.6) {
      const y = top + scrollY - 90;
      window.scrollTo({ top: Math.max(0, y), behavior: reduce ? "auto" : "smooth" });
    }
  });

  // initial state
  const fromHash = tabFromHash();
  if (fromHash && fromHash !== activeTab) {
    tabs.forEach(t => { const on = t === fromHash; t.setAttribute("aria-selected", String(on)); t.tabIndex = on ? 0 : -1; });
    const prev = panelOf(activeTab);
    if (prev) { prev.hidden = true; resetPanel(prev); }
    activeTab = fromHash;
    const panel = panelOf(fromHash);
    panel.hidden = false;
    setTimeout(() => panel.classList.add("is-in"), reduce ? 0 : 520);
  }
  // indicator grows in under the active tab once the tab row has revealed
  placeIndicator(false, !reduce);
  setTimeout(() => placeIndicator(true), reduce ? 0 : 720);
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => setTimeout(() => placeIndicator(false), reduce ? 0 : 1300));

  /* ------------------------------------------------------------------
     Unknown ticker
     ------------------------------------------------------------------ */
  function renderMissing() {
    const shown = rawTicker.trim().toUpperCase().slice(0, 12) || "this ticker";
    document.title = `${shown} not found — insidir.`;
    $$(".co-head, .co-tabs-wrap, .co-panel", main).forEach(el => { el.hidden = true; });
    const box = $("[data-missing]", main);
    if (!box) return;
    box.hidden = false;
    $("[data-missing-ticker]", box).textContent = shown;
    $("[data-missing-list]", box).innerHTML = Object.entries(PROFILES).map(([t, p]) =>
      `<li data-reveal="up"><a href="company.html?ticker=${t}">${brand(t, 22)}<span>${t}</span><small>${esc(p.short)}</small></a></li>`).join("");
  }
})();
