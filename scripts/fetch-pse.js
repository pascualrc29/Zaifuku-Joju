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

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36';

async function getSession() {
  console.log('Step 1: Getting Yahoo Finance cookies...');
  const r1 = await fetch('https://finance.yahoo.com/', {
    headers: { 'User-Agent': UA, 'Accept': 'text/html' },
  });
  const rawCookies = r1.headers.raw()['set-cookie'] || [];
  const cookie = rawCookies.map(c => c.split(';')[0]).join('; ');
  console.log(`  Got ${rawCookies.length} cookies.`);

  console.log('Step 2: Getting crumb...');
  const r2 = await fetch('https://query1.finance.yahoo.com/v1/test/getcrumb', {
    headers: { 'User-Agent': UA, 'Cookie': cookie },
  });
  const crumb = await r2.text();
  console.log(`  Crumb: ${crumb}`);

  if (!crumb || crumb.length < 3 || crumb.includes('<')) {
    throw new Error('Could not get valid crumb. Yahoo may be blocking this IP.');
  }
  return { cookie, crumb };
}

async function fetchAllQuotes(cookie, crumb) {
  const tickers = SYMBOLS.map(s => `${s.symbol}.PS`).join(',');
  const url = `https://query1.finance.yahoo.com/v7/finance/quote?symbols=${encodeURIComponent(tickers)}&crumb=${encodeURIComponent(crumb)}`;

  console.log('Step 3: Fetching all stock quotes in one request...');
  const res = await fetch(url, {
    headers: {
      'User-Agent': UA,
      'Cookie': cookie,
      'Accept': 'application/json',
    },
  });

  console.log(`  HTTP status: ${res.status}`);
  if (!res.ok) throw new Error(`Yahoo Finance returned HTTP ${res.status}`);

  const data = await res.json();
  const quotes = data?.quoteResponse?.result;
  if (!quotes || quotes.length === 0) {
    console.log('  Raw response:', JSON.stringify(data).substring(0, 300));
    throw new Error('No quotes in response');
  }
  return quotes;
}

async function main() {
  console.log(`PSE Fetcher — ${new Date().toISOString()}\n`);

  const { cookie, crumb } = await getSession();
  const quotes = await fetchAllQuotes(cookie, crumb);

  const nameMap = Object.fromEntries(SYMBOLS.map(s => [s.symbol, s.name]));

  const results = quotes.map(q => {
    const symbol        = q.symbol.replace('.PS', '');
    const price         = q.regularMarketPrice         ?? null;
    const previousClose = q.regularMarketPreviousClose ?? null;
    const change        = q.regularMarketChange        != null ? +q.regularMarketChange.toFixed(2)        : null;
    const changePercent = q.regularMarketChangePercent != null ? +q.regularMarketChangePercent.toFixed(2) : null;

    const arrow = change > 0 ? '▲' : change < 0 ? '▼' : '—';
    console.log(`✅  ${symbol.padEnd(6)} ₱${String(price ?? '—').padStart(9)}  ${arrow} ${changePercent?.toFixed(2) ?? '—'}%`);

    return {
      symbol,
      name:             nameMap[symbol] || symbol,
      price,
      previousClose,
      change,
      changePercent,
      volume:           q.regularMarketVolume   ?? null,
      dayHigh:          q.regularMarketDayHigh  ?? null,
      dayLow:           q.regularMarketDayLow   ?? null,
      fiftyTwoWeekHigh: q.fiftyTwoWeekHigh       ?? null,
      fiftyTwoWeekLow:  q.fiftyTwoWeekLow        ?? null,
      currency:         q.currency              ?? 'PHP',
      exchange:         q.exchange              ?? 'PSE',
      marketState:      q.marketState           ?? null,
    };
  });

  fs.mkdirSync(OUT_DIR, { recursive: true });
  fs.writeFileSync(OUT_FILE, JSON.stringify({
    lastUpdated: new Date().toISOString(),
    source:      'Yahoo Finance',
    fetchedBy:   'GitHub Actions',
    stocks:      results,
  }, null, 2));

  console.log(`\nSaved ${results.length} stocks → ${OUT_FILE}`);
  if (results.length === 0) process.exit(1);
}

main().catch(err => {
  console.error('\nFatal error:', err.message);
  process.exit(1);
});
