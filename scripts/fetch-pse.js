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

const DELAY_MS = 800;
const OUT_DIR  = path.join(__dirname, '..', 'public', 'data');
const OUT_FILE = path.join(OUT_DIR, 'pse-stocks.json');
const delay    = ms => new Promise(r => setTimeout(r, ms));

async function fetchStock({ symbol, name }) {
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${symbol}.PS?interval=1d&range=1d`;
  const res  = await fetch(url, {
    headers: { 'User-Agent': 'Mozilla/5.0 (compatible; PSEWatcher/1.0)', 'Accept': 'application/json' },
    timeout: 10000,
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const data = await res.json();
  const meta = data?.chart?.result?.[0]?.meta;
  if (!meta)  throw new Error('No chart data returned');
  const price         = meta.regularMarketPrice;
  const previousClose = meta.chartPreviousClose ?? meta.previousClose;
  const change        = price != null && previousClose != null ? +(price - previousClose).toFixed(2) : null;
  const changePercent = price != null && previousClose != null ? +(((price - previousClose) / previousClose) * 100).toFixed(2) : null;
  return {
    symbol, name, price, previousClose, change, changePercent,
    volume:           meta.regularMarketVolume   ?? null,
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
  console.log(`PSE Stock Fetcher — ${new Date().toISOString()}`);
  const results = [], failures = [];
  for (const stock of SYMBOLS) {
    try {
      const data = await fetchStock(stock);
      results.push(data);
      const dir = data.change > 0 ? '▲' : data.change < 0 ? '▼' : '—';
      console.log(`✅  ${stock.symbol.padEnd(6)} ₱${String(data.price ?? '—').padStart(9)}  ${dir} ${data.changePercent?.toFixed(2) ?? '—'}%`);
    } catch (err) {
      failures.push(stock.symbol);
      console.warn(`❌  ${stock.symbol.padEnd(6)} Error: ${err.message}`);
    }
    await delay(DELAY_MS);
  }
  console.log(`Done — ${results.length} fetched, ${failures.length} failed.`);
  if (failures.length) console.log(`Failed: ${failures.join(', ')}`);
  fs.mkdirSync(OUT_DIR, { recursive: true });
  fs.writeFileSync(OUT_FILE, JSON.stringify({
    lastUpdated: new Date().toISOString(),
    source:      'Yahoo Finance (.PS tickers)',
    fetchedBy:   'GitHub Actions',
    stocks:      results,
  }, null, 2));
  console.log(`Saved → ${OUT_FILE}`);
  if (results.length === 0) process.exit(1);
}

main().catch(err => { console.error('Fatal:', err); process.exit(1); });
