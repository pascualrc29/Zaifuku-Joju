const fetch = require('node-fetch');
const fs    = require('fs');
const path  = require('path');

const SYMBOLS = [
  { symbol:'SM',    name:'SM Investments Corp.'            },
  { symbol:'ALI',   name:'Ayala Land, Inc.'                },
  { symbol:'BDO',   name:'BDO Unibank, Inc.'               },
  { symbol:'JFC',   name:'Jollibee Foods Corp.'            },
  { symbol:'AC',    name:'Ayala Corporation'               },
  { symbol:'TEL',   name:'PLDT Inc.'                       },
  { symbol:'GLO',   name:'Globe Telecom, Inc.'             },
  { symbol:'BPI',   name:'Bank of the Philippine Islands'  },
  { symbol:'SMPH',  name:'SM Prime Holdings, Inc.'         },
  { symbol:'MER',   name:'Manila Electric Company'         },
  { symbol:'ICT',   name:"Int'l Container Terminal Svcs."  },
  { symbol:'AGI',   name:'Alliance Global Group'           },
  { symbol:'MONDE', name:'Monde Nissin Corporation'        },
  { symbol:'BLOOM', name:'Bloomberry Resorts Corp.'        },
  { symbol:'GTCAP', name:'GT Capital Holdings, Inc.'       },
  { symbol:'MEG',   name:'Megaworld Corporation'           },
];

const OUT_DIR  = path.join(__dirname, '..', 'public', 'data');
const OUT_FILE = path.join(OUT_DIR, 'pse-stocks.json');
const UA       = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36';
const delay    = ms => new Promise(r => setTimeout(r, ms));

async function getSession() {
  // Try crumb without cookies first
  try {
    const r     = await fetch('https://query2.finance.yahoo.com/v1/test/getcrumb', { headers:{ 'User-Agent': UA } });
    const crumb = await r.text();
    if (crumb && crumb.length > 2 && !crumb.includes('<') && !crumb.includes('{')) {
      console.log('Session: crumb obtained without cookies');
      return { cookie: '', crumb };
    }
  } catch(e) { /* fall through */ }

  // Fallback: get cookies from Yahoo homepage
  console.log('Session: fetching cookies from Yahoo homepage...');
  const r1         = await fetch('https://finance.yahoo.com/', { headers:{ 'User-Agent': UA } });
  const rawCookies = r1.headers.raw()['set-cookie'] || [];
  const cookie     = rawCookies.map(c => c.split(';')[0]).join('; ');
  const r2         = await fetch('https://query1.finance.yahoo.com/v1/test/getcrumb', { headers:{ 'User-Agent': UA, 'Cookie': cookie } });
  const crumb      = await r2.text();
  if (!crumb || crumb.length < 2 || crumb.includes('<')) throw new Error('Could not get crumb');
  console.log(`Session: got crumb via cookies`);
  return { cookie, crumb };
}

async function fetchStock(symbol, cookie, crumb) {
  // v8 CHART API — returns historical closing prices even for YHD/PSE stocks
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${symbol}.PS?interval=1d&range=5d&crumb=${encodeURIComponent(crumb)}`;
  const res = await fetch(url, {
    headers: { 'User-Agent': UA, 'Cookie': cookie, 'Accept': 'application/json' }
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);

  const data   = await res.json();
  const result = data?.chart?.result?.[0];
  if (!result)  throw new Error('No chart data in response');

  const meta   = result.meta   || {};
  const quotes = result.indicators?.quote?.[0] || {};
  const closes = (quotes.close  || []).filter(c => c != null);
  const vols   = (quotes.volume || []).filter(v => v != null);

  // Price: prefer regularMarketPrice, fall back to most recent close in chart data
  let price         = meta.regularMarketPrice  ?? null;
  let previousClose = meta.chartPreviousClose  ?? meta.previousClose ?? null;

  if (price == null && closes.length > 0) {
    price = +closes[closes.length - 1].toFixed(2);
  }
  if (previousClose == null && closes.length > 1) {
    previousClose = +closes[closes.length - 2].toFixed(2);
  }

  const change        = price != null && previousClose != null ? +(price - previousClose).toFixed(2) : null;
  const changePercent = price != null && previousClose != null
    ? +(((price - previousClose) / previousClose) * 100).toFixed(2) : null;

  return {
    price,
    previousClose,
    change,
    changePercent,
    volume:           vols.length   > 0 ? vols[vols.length - 1]       : null,
    dayHigh:          meta.regularMarketDayHigh  ?? null,
    dayLow:           meta.regularMarketDayLow   ?? null,
    fiftyTwoWeekHigh: meta.fiftyTwoWeekHigh       ?? null,
    fiftyTwoWeekLow:  meta.fiftyTwoWeekLow        ?? null,
    currency:         meta.currency              ?? 'PHP',
    exchange:         meta.exchangeName          ?? 'PSE',
    marketState:      meta.marketState           ?? null,
  };
}

async function main() {
  console.log(`PSE Fetcher — ${new Date().toISOString()}\n`);
  const { cookie, crumb } = await getSession();

  const results  = [];
  const failures = [];

  for (const { symbol, name } of SYMBOLS) {
    try {
      const d     = await fetchStock(symbol, cookie, crumb);
      const arrow = d.change > 0 ? '▲' : d.change < 0 ? '▼' : '—';
      console.log(`✅  ${symbol.padEnd(6)} ₱${String(d.price ?? '—').padStart(9)}  ${arrow} ${d.changePercent?.toFixed(2) ?? '—'}%`);
      results.push({ symbol, name, ...d });
    } catch (err) {
      failures.push(symbol);
      console.warn(`❌  ${symbol.padEnd(6)} ${err.message}`);
    }
    await delay(500);
  }

  console.log(`\nDone — ${results.length} fetched, ${failures.length} failed`);
  if (failures.length) console.log(`Failed: ${failures.join(', ')}`);

  fs.mkdirSync(OUT_DIR, { recursive: true });
  fs.writeFileSync(OUT_FILE, JSON.stringify({
    lastUpdated: new Date().toISOString(),
    source:      'Yahoo Finance v8 chart API',
    fetchedBy:   'GitHub Actions',
    stocks:      results,
  }, null, 2));

  console.log(`Saved → ${OUT_FILE}`);
  if (results.length === 0) process.exit(1);
}

main().catch(err => { console.error('\nFatal:', err.message); process.exit(1); });
