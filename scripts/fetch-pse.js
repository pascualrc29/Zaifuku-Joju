const yahooFinance = require('yahoo-finance2').default;
const fs           = require('fs');
const path         = require('path');

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
const delay    = ms => new Promise(r => setTimeout(r, ms));

async function fetchStock({ symbol, name }) {
  const quote = await yahooFinance.quote(`${symbol}.PS`);
  if (!quote) throw new Error('Empty response');

  const price         = quote.regularMarketPrice         ?? null;
  const previousClose = quote.regularMarketPreviousClose ?? null;
  const change        = (price != null && previousClose != null)
                          ? +(price - previousClose).toFixed(2) : null;
  const changePercent = (price != null && previousClose != null)
                          ? +(((price - previousClose) / previousClose) * 100).toFixed(2) : null;
  return {
    symbol,
    name,
    price,
    previousClose,
    change,
    changePercent,
    volume:           quote.regularMarketVolume    ?? null,
    dayHigh:          quote.regularMarketDayHigh   ?? null,
    dayLow:           quote.regularMarketDayLow    ?? null,
    fiftyTwoWeekHigh: quote.fiftyTwoWeekHigh        ?? null,
    fiftyTwoWeekLow:  quote.fiftyTwoWeekLow         ?? null,
    currency:         quote.currency               ?? 'PHP',
    exchange:         quote.exchange               ?? 'PSE',
    marketState:      quote.marketState            ?? null,
  };
}

async function main() {
  console.log(`PSE Fetcher — ${new Date().toISOString()}`);
  const results = [], failures = [];

  for (const stock of SYMBOLS) {
    try {
      const data = await fetchStock(stock);
      results.push(data);
      const arrow = data.change > 0 ? '▲' : data.change < 0 ? '▼' : '—';
      console.log(`✅  ${stock.symbol.padEnd(6)} ₱${String(data.price ?? '—').padStart(9)}  ${arrow} ${data.changePercent?.toFixed(2) ?? '—'}%`);
    } catch (err) {
      failures.push(stock.symbol);
      console.warn(`❌  ${stock.symbol.padEnd(6)} ${err.message}`);
    }
    await delay(600);
  }

  console.log(`\nDone — ${results.length} ok, ${failures.length} failed.`);
  if (failures.length) console.log(`Failed: ${failures.join(', ')}`);

  fs.mkdirSync(OUT_DIR, { recursive: true });
  fs.writeFileSync(OUT_FILE, JSON.stringify({
    lastUpdated: new Date().toISOString(),
    source:      'Yahoo Finance via yahoo-finance2',
    fetchedBy:   'GitHub Actions',
    stocks:      results,
  }, null, 2));

  console.log(`Saved → ${OUT_FILE}`);
  if (results.length === 0) process.exit(1);
}

main().catch(err => { console.error('Fatal:', err); process.exit(1); });
