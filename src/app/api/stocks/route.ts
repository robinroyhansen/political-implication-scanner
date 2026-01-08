import { NextRequest, NextResponse } from 'next/server';

interface YahooSearchResult {
  symbol: string;
  shortname?: string;
  longname?: string;
  exchDisp?: string;
  typeDisp?: string;
}

interface StockResult {
  symbol: string;
  name: string;
  exchange: string;
  type: string;
}

// Fallback list of popular stocks for offline search
const POPULAR_STOCKS: StockResult[] = [
  // US Tech
  { symbol: 'AAPL', name: 'Apple Inc.', exchange: 'NASDAQ', type: 'Equity' },
  { symbol: 'MSFT', name: 'Microsoft Corporation', exchange: 'NASDAQ', type: 'Equity' },
  { symbol: 'GOOGL', name: 'Alphabet Inc.', exchange: 'NASDAQ', type: 'Equity' },
  { symbol: 'AMZN', name: 'Amazon.com Inc.', exchange: 'NASDAQ', type: 'Equity' },
  { symbol: 'NVDA', name: 'NVIDIA Corporation', exchange: 'NASDAQ', type: 'Equity' },
  { symbol: 'META', name: 'Meta Platforms Inc.', exchange: 'NASDAQ', type: 'Equity' },
  { symbol: 'TSLA', name: 'Tesla Inc.', exchange: 'NASDAQ', type: 'Equity' },
  { symbol: 'AMD', name: 'Advanced Micro Devices', exchange: 'NASDAQ', type: 'Equity' },
  { symbol: 'INTC', name: 'Intel Corporation', exchange: 'NASDAQ', type: 'Equity' },
  { symbol: 'CRM', name: 'Salesforce Inc.', exchange: 'NYSE', type: 'Equity' },
  { symbol: 'ORCL', name: 'Oracle Corporation', exchange: 'NYSE', type: 'Equity' },
  { symbol: 'ADBE', name: 'Adobe Inc.', exchange: 'NASDAQ', type: 'Equity' },
  { symbol: 'NFLX', name: 'Netflix Inc.', exchange: 'NASDAQ', type: 'Equity' },
  // US Finance
  { symbol: 'JPM', name: 'JPMorgan Chase & Co.', exchange: 'NYSE', type: 'Equity' },
  { symbol: 'BAC', name: 'Bank of America Corp.', exchange: 'NYSE', type: 'Equity' },
  { symbol: 'WFC', name: 'Wells Fargo & Company', exchange: 'NYSE', type: 'Equity' },
  { symbol: 'GS', name: 'Goldman Sachs Group', exchange: 'NYSE', type: 'Equity' },
  { symbol: 'MS', name: 'Morgan Stanley', exchange: 'NYSE', type: 'Equity' },
  { symbol: 'V', name: 'Visa Inc.', exchange: 'NYSE', type: 'Equity' },
  { symbol: 'MA', name: 'Mastercard Inc.', exchange: 'NYSE', type: 'Equity' },
  { symbol: 'BRK.B', name: 'Berkshire Hathaway', exchange: 'NYSE', type: 'Equity' },
  // US Healthcare
  { symbol: 'JNJ', name: 'Johnson & Johnson', exchange: 'NYSE', type: 'Equity' },
  { symbol: 'UNH', name: 'UnitedHealth Group', exchange: 'NYSE', type: 'Equity' },
  { symbol: 'PFE', name: 'Pfizer Inc.', exchange: 'NYSE', type: 'Equity' },
  { symbol: 'ABBV', name: 'AbbVie Inc.', exchange: 'NYSE', type: 'Equity' },
  { symbol: 'MRK', name: 'Merck & Co.', exchange: 'NYSE', type: 'Equity' },
  { symbol: 'LLY', name: 'Eli Lilly and Company', exchange: 'NYSE', type: 'Equity' },
  // US Energy
  { symbol: 'XOM', name: 'Exxon Mobil Corporation', exchange: 'NYSE', type: 'Equity' },
  { symbol: 'CVX', name: 'Chevron Corporation', exchange: 'NYSE', type: 'Equity' },
  { symbol: 'COP', name: 'ConocoPhillips', exchange: 'NYSE', type: 'Equity' },
  { symbol: 'SLB', name: 'Schlumberger Limited', exchange: 'NYSE', type: 'Equity' },
  // US Defense
  { symbol: 'LMT', name: 'Lockheed Martin Corp.', exchange: 'NYSE', type: 'Equity' },
  { symbol: 'RTX', name: 'RTX Corporation', exchange: 'NYSE', type: 'Equity' },
  { symbol: 'NOC', name: 'Northrop Grumman', exchange: 'NYSE', type: 'Equity' },
  { symbol: 'GD', name: 'General Dynamics', exchange: 'NYSE', type: 'Equity' },
  { symbol: 'BA', name: 'Boeing Company', exchange: 'NYSE', type: 'Equity' },
  // US Consumer
  { symbol: 'WMT', name: 'Walmart Inc.', exchange: 'NYSE', type: 'Equity' },
  { symbol: 'COST', name: 'Costco Wholesale Corp.', exchange: 'NASDAQ', type: 'Equity' },
  { symbol: 'HD', name: 'Home Depot Inc.', exchange: 'NYSE', type: 'Equity' },
  { symbol: 'MCD', name: 'McDonald\'s Corporation', exchange: 'NYSE', type: 'Equity' },
  { symbol: 'KO', name: 'Coca-Cola Company', exchange: 'NYSE', type: 'Equity' },
  { symbol: 'PEP', name: 'PepsiCo Inc.', exchange: 'NASDAQ', type: 'Equity' },
  { symbol: 'NKE', name: 'Nike Inc.', exchange: 'NYSE', type: 'Equity' },
  { symbol: 'DIS', name: 'Walt Disney Company', exchange: 'NYSE', type: 'Equity' },
  // US Industrial
  { symbol: 'CAT', name: 'Caterpillar Inc.', exchange: 'NYSE', type: 'Equity' },
  { symbol: 'DE', name: 'Deere & Company', exchange: 'NYSE', type: 'Equity' },
  { symbol: 'UPS', name: 'United Parcel Service', exchange: 'NYSE', type: 'Equity' },
  { symbol: 'FDX', name: 'FedEx Corporation', exchange: 'NYSE', type: 'Equity' },
  // European Stocks
  { symbol: 'ASML', name: 'ASML Holding N.V.', exchange: 'NASDAQ', type: 'Equity' },
  { symbol: 'SAP', name: 'SAP SE', exchange: 'NYSE', type: 'Equity' },
  { symbol: 'NVO', name: 'Novo Nordisk A/S', exchange: 'NYSE', type: 'Equity' },
  { symbol: 'TM', name: 'Toyota Motor Corp.', exchange: 'NYSE', type: 'Equity' },
  { symbol: 'SHEL', name: 'Shell plc', exchange: 'NYSE', type: 'Equity' },
  { symbol: 'BP', name: 'BP p.l.c.', exchange: 'NYSE', type: 'Equity' },
  { symbol: 'UL', name: 'Unilever PLC', exchange: 'NYSE', type: 'Equity' },
  { symbol: 'HSBC', name: 'HSBC Holdings plc', exchange: 'NYSE', type: 'Equity' },
  // ETFs
  { symbol: 'SPY', name: 'SPDR S&P 500 ETF Trust', exchange: 'NYSE', type: 'ETF' },
  { symbol: 'QQQ', name: 'Invesco QQQ Trust', exchange: 'NASDAQ', type: 'ETF' },
  { symbol: 'IWM', name: 'iShares Russell 2000 ETF', exchange: 'NYSE', type: 'ETF' },
  { symbol: 'DIA', name: 'SPDR Dow Jones ETF', exchange: 'NYSE', type: 'ETF' },
  { symbol: 'XLF', name: 'Financial Select Sector SPDR', exchange: 'NYSE', type: 'ETF' },
  { symbol: 'XLE', name: 'Energy Select Sector SPDR', exchange: 'NYSE', type: 'ETF' },
  { symbol: 'XLK', name: 'Technology Select Sector SPDR', exchange: 'NYSE', type: 'ETF' },
  { symbol: 'XLV', name: 'Health Care Select Sector SPDR', exchange: 'NYSE', type: 'ETF' },
  { symbol: 'XLI', name: 'Industrial Select Sector SPDR', exchange: 'NYSE', type: 'ETF' },
  { symbol: 'GLD', name: 'SPDR Gold Shares', exchange: 'NYSE', type: 'ETF' },
  { symbol: 'SLV', name: 'iShares Silver Trust', exchange: 'NYSE', type: 'ETF' },
  { symbol: 'USO', name: 'United States Oil Fund', exchange: 'NYSE', type: 'ETF' },
  { symbol: 'VTI', name: 'Vanguard Total Stock Market ETF', exchange: 'NYSE', type: 'ETF' },
  { symbol: 'VEA', name: 'Vanguard FTSE Developed Markets ETF', exchange: 'NYSE', type: 'ETF' },
  { symbol: 'VWO', name: 'Vanguard FTSE Emerging Markets ETF', exchange: 'NYSE', type: 'ETF' },
  { symbol: 'EFA', name: 'iShares MSCI EAFE ETF', exchange: 'NYSE', type: 'ETF' },
  { symbol: 'EEM', name: 'iShares MSCI Emerging Markets ETF', exchange: 'NYSE', type: 'ETF' },
  { symbol: 'SMH', name: 'VanEck Semiconductor ETF', exchange: 'NASDAQ', type: 'ETF' },
  { symbol: 'ARKK', name: 'ARK Innovation ETF', exchange: 'NYSE', type: 'ETF' },
  { symbol: 'ITA', name: 'iShares U.S. Aerospace & Defense ETF', exchange: 'BATS', type: 'ETF' },
  // Indices
  { symbol: '^GSPC', name: 'S&P 500', exchange: 'INDEX', type: 'Index' },
  { symbol: '^DJI', name: 'Dow Jones Industrial Average', exchange: 'INDEX', type: 'Index' },
  { symbol: '^IXIC', name: 'NASDAQ Composite', exchange: 'INDEX', type: 'Index' },
  { symbol: '^RUT', name: 'Russell 2000', exchange: 'INDEX', type: 'Index' },
  { symbol: '^VIX', name: 'CBOE Volatility Index', exchange: 'INDEX', type: 'Index' },
  // Commodities
  { symbol: 'GC=F', name: 'Gold Futures', exchange: 'COMEX', type: 'Futures' },
  { symbol: 'SI=F', name: 'Silver Futures', exchange: 'COMEX', type: 'Futures' },
  { symbol: 'CL=F', name: 'Crude Oil Futures', exchange: 'NYMEX', type: 'Futures' },
  { symbol: 'NG=F', name: 'Natural Gas Futures', exchange: 'NYMEX', type: 'Futures' },
];

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const query = searchParams.get('q')?.toUpperCase() || '';

  if (!query || query.length < 1) {
    return NextResponse.json({ results: [] });
  }

  // First try Yahoo Finance API
  try {
    const yahooResponse = await fetch(
      `https://query1.finance.yahoo.com/v1/finance/search?q=${encodeURIComponent(query)}&quotesCount=10&newsCount=0`,
      {
        headers: {
          'User-Agent': 'Mozilla/5.0',
        },
        next: { revalidate: 3600 }, // Cache for 1 hour
      }
    );

    if (yahooResponse.ok) {
      const data = await yahooResponse.json();
      const results: StockResult[] = (data.quotes || [])
        .filter((q: YahooSearchResult) => q.symbol && (q.typeDisp === 'Equity' || q.typeDisp === 'ETF'))
        .slice(0, 10)
        .map((q: YahooSearchResult) => ({
          symbol: q.symbol,
          name: q.longname || q.shortname || q.symbol,
          exchange: q.exchDisp || 'Unknown',
          type: q.typeDisp || 'Equity',
        }));

      if (results.length > 0) {
        return NextResponse.json({ results });
      }
    }
  } catch (error) {
    console.error('Yahoo Finance API error:', error);
  }

  // Fallback to local search
  const localResults = POPULAR_STOCKS.filter(
    stock =>
      stock.symbol.includes(query) ||
      stock.name.toUpperCase().includes(query)
  ).slice(0, 10);

  return NextResponse.json({ results: localResults });
}
