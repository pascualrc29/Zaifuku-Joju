const fetch = require('node-fetch');
const fs    = require('fs');
const path  = require('path');

const OUT_DIR  = path.join(__dirname, '..', 'public', 'data');
const OUT_FILE = path.join(OUT_DIR, 'pse-stocks.json');
const UA       = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36';

async function fetchFromTradingView() {
  const url  = 'https://scanner.tradingview.com/philippines/scan';
  const cols = ['name', 'description', 'close', 'change', 'volume', 'open', 'high', 'low', 'market_cap_basic'];

  console.log('Fetching ALL PSE stocks from TradingView Screener...');
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Origin':       'https://www.tradingview.com',
      'Referer':      'https://www.tradingview.com/markets/stocks-philippines/',
      'User-Agent':   UA,
    },
    body: JSON.stringify({
      filter:  [],
      options: { lang: 'en' },
      symbols: { query: { types: ['stock'] }, tickers: [] },
      columns: cols,
      sort:    { sortBy: 'name', sortOrder: 'asc' },
      range:   [0, 500],   // PSE has ~252 — 500 covers everything
    }),
  });

  console.log(`  HTTP ${res.status}`);
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`TradingView HTTP ${res.status}: ${body.substring(0, 300)}`);
  }

  const json = await res.json();
  if (!json.data) throw new Error('No data in TradingView response');
  console.log(`  Stocks returned: ${json.data.length}`);
  return json.data;
}

async function main() {
  console.log(`PSE Fetcher (TradingView) — ${new Date().toISOString()}\n`);

  const rows    = await fetchFromTradingView();
  const results = [];

  for (const row of rows) {
    // row.s = "PSE:SYMBOL"
    // row.d = [name, description, close, change%, volume, open, high, low, mktcap]
    const symbol = row.s.split(':')[1];
    const [, description, close, changePct, volume, , high, low, mktcap] = row.d;

    const price         = close    != null ? +close.toFixed(2)     : null;
    const changePercent = changePct != null ? +changePct.toFixed(2) : null;

    // previousClose = price / (1 + changePct/100)
    const previousClose = price != null && changePct != null && changePct !== 0
      ? +(price / (1 + changePct / 100)).toFixed(2)
      : price;

    const change = price != null && previousClose != null
      ? +(price - previousClose).toFixed(2) : null;

    const arrow = change > 0 ? '▲' : change < 0 ? '▼' : '—';
    console.log(`  ${symbol.padEnd(8)} ₱${String(price ?? '—').padStart(9)}  ${arrow} ${changePercent?.toFixed(2) ?? '—'}%  ${description ?? ''}`);

    results.push({
      symbol,
      name:         description || symbol,
      price,
      previousClose,
      change,
      changePercent,
      volume:    volume ?? null,
      dayHigh:   high   ?? null,
      dayLow:    low    ?? null,
      marketCap: mktcap ?? null,
      currency:  'PHP',
      exchange:  'PSE',
    });
  }

  console.log(`\nTotal saved: ${results.length} stocks`);
  if (results.length === 0) throw new Error('No stocks returned');

  fs.mkdirSync(OUT_DIR, { recursive: true });
  fs.writeFileSync(OUT_FILE, JSON.stringify({
    lastUpdated: new Date().toISOString(),
    source:      'TradingView Screener (scanner.tradingview.com)',
    fetchedBy:   'GitHub Actions',
    stocks:      results,
  }, null, 2));

  console.log(`Saved → ${OUT_FILE}`);
}

main().catch(err => { console.error('\nFatal:', err.message); process.exit(1); });
