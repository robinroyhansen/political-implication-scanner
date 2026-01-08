'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { saveScan, saveWatchlist, getWatchlist } from '@/lib/supabase';

// Types
interface SectorImpact {
  sector: string;
  impact: 'Bullish' | 'Bearish' | 'Neutral' | 'Uncertain';
  reasoning: string;
  tickers: string[];
  timeframe: 'Short-term' | 'Medium-term' | 'Long-term';
  confidence: 'High' | 'Medium' | 'Low';
}

interface Analysis {
  summary: string;
  sectors: SectorImpact[];
  overallSentiment: 'Bullish' | 'Bearish' | 'Mixed' | 'Neutral';
  keyInsight: string;
}

interface Implications {
  gold: string;
  silver: string;
  rareMinerals: string;
  stockMarkets: string;
}

interface AnalyzedArticle {
  id?: string;
  title: string;
  source: string;
  url: string;
  publishedAt: string;
  region: string;
  category?: string;
  analysis?: Analysis;
  implications: Implications;
  pending?: boolean; // true when article is fetched but not yet analyzed
}

interface StockResult {
  symbol: string;
  name: string;
  exchange: string;
  type: string;
}

type GroupedArticles = Record<string, AnalyzedArticle[]>;

const REGIONS = ['All', 'Americas', 'Europe', 'Asia', 'Middle East', 'Africa'] as const;
type Region = typeof REGIONS[number];

const IMPACT_FILTERS = ['All', 'Bullish', 'Bearish', 'Neutral', 'Uncertain'] as const;
type ImpactFilter = typeof IMPACT_FILTERS[number];

// Utility: Check if article mentions watchlist tickers
const articleMentionsTicker = (article: AnalyzedArticle, watchlist: string[]): boolean => {
  if (!watchlist.length) return false;
  const text = `${article.title} ${article.analysis?.summary || ''}`.toUpperCase();
  const tickers = article.analysis?.sectors?.flatMap(s => s.tickers) || [];
  return watchlist.some(ticker =>
    text.includes(ticker.toUpperCase()) ||
    tickers.some(t => t.toUpperCase() === ticker.toUpperCase())
  );
};

// Calculate sentiment score from articles
const calculateSentiment = (articles: AnalyzedArticle[]): number => {
  let score = 0;
  articles.forEach(a => {
    const sentiment = a.analysis?.overallSentiment;
    if (sentiment === 'Bullish') score += 1;
    else if (sentiment === 'Bearish') score -= 1;
  });
  return articles.length ? Math.round((score / articles.length) * 100) : 0;
};

// Globe SVG Component
const GlobeIcon = ({ className }: { className?: string }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
    <circle cx="12" cy="12" r="10" />
    <ellipse cx="12" cy="12" rx="10" ry="4" />
    <path d="M12 2v20" />
    <path d="M2 12h20" />
  </svg>
);

// Loading Spinner
const LoadingSpinner = ({ size = 6 }: { size?: number }) => (
  <div className={`relative w-${size} h-${size}`} style={{ width: size * 4, height: size * 4 }}>
    <div className="absolute inset-0 border-2 border-amber-500/30 rounded-full"></div>
    <div className="absolute inset-0 border-2 border-transparent border-t-amber-500 rounded-full animate-spin"></div>
  </div>
);

// Tooltip Component
const Tooltip = ({ children, content, delay = 300 }: { children: React.ReactNode; content: React.ReactNode; delay?: number }) => {
  const [isVisible, setIsVisible] = useState(false);
  const [position, setPosition] = useState({ top: 0, left: 0 });
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);
  const triggerRef = useRef<HTMLDivElement>(null);

  const showTooltip = () => {
    timeoutRef.current = setTimeout(() => {
      if (triggerRef.current) {
        const rect = triggerRef.current.getBoundingClientRect();
        setPosition({ top: rect.top - 10, left: rect.left + rect.width / 2 });
      }
      setIsVisible(true);
    }, delay);
  };

  const hideTooltip = () => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    setIsVisible(false);
  };

  return (
    <div ref={triggerRef} className="relative inline-block" onMouseEnter={showTooltip} onMouseLeave={hideTooltip}>
      {children}
      {isVisible && (
        <div className="fixed z-50 transform -translate-x-1/2 -translate-y-full pointer-events-none animate-fade-in" style={{ top: position.top, left: position.left }}>
          <div className="bg-slate-900 border border-slate-700 rounded-lg shadow-xl p-4 max-w-sm">{content}</div>
          <div className="absolute left-1/2 -translate-x-1/2 -bottom-2 w-0 h-0 border-l-8 border-r-8 border-t-8 border-transparent border-t-slate-700"></div>
        </div>
      )}
    </div>
  );
};

// Sector Tooltip Content
const SectorTooltipContent = ({ sector }: { sector: SectorImpact }) => {
  const impactColors = { Bullish: 'text-emerald-400', Bearish: 'text-red-400', Neutral: 'text-slate-400', Uncertain: 'text-amber-400' };
  const confidenceColors = { High: 'bg-emerald-500/20 text-emerald-400', Medium: 'bg-amber-500/20 text-amber-400', Low: 'bg-slate-500/20 text-slate-400' };

  return (
    <div className="space-y-3 min-w-[280px]">
      <div className="flex items-center justify-between">
        <span className="font-semibold text-slate-100">{sector.sector}</span>
        <span className={`font-bold ${impactColors[sector.impact]}`}>
          {sector.impact === 'Bullish' ? '↑' : sector.impact === 'Bearish' ? '↓' : '→'} {sector.impact}
        </span>
      </div>
      <p className="text-sm text-slate-300 leading-relaxed">{sector.reasoning}</p>
      {sector.tickers?.length > 0 && (
        <div>
          <div className="text-xs text-slate-500 uppercase tracking-wider mb-1">Affected Tickers</div>
          <div className="flex flex-wrap gap-1">
            {sector.tickers.map(ticker => (
              <span key={ticker} className="px-2 py-0.5 bg-slate-800 text-slate-300 text-xs font-mono rounded">{ticker}</span>
            ))}
          </div>
        </div>
      )}
      <div className="flex items-center justify-between text-xs pt-2 border-t border-slate-700">
        <span className="text-slate-400">{sector.timeframe}</span>
        <span className={`px-2 py-0.5 rounded ${confidenceColors[sector.confidence]}`}>{sector.confidence} Confidence</span>
      </div>
    </div>
  );
};

// Impact Badge
const ImpactBadge = ({ sector }: { sector: SectorImpact }) => {
  const styles = {
    Bullish: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30 hover:bg-emerald-500/30',
    Bearish: 'bg-red-500/20 text-red-400 border-red-500/30 hover:bg-red-500/30',
    Neutral: 'bg-slate-500/20 text-slate-400 border-slate-500/30 hover:bg-slate-500/30',
    Uncertain: 'bg-amber-500/20 text-amber-400 border-amber-500/30 hover:bg-amber-500/30',
  };
  const icons = { Bullish: '↑', Bearish: '↓', Neutral: '→', Uncertain: '?' };

  return (
    <Tooltip content={<SectorTooltipContent sector={sector} />}>
      <span className={`inline-flex items-center gap-1 px-2 py-1 text-xs font-medium rounded border cursor-help transition-colors ${styles[sector.impact]}`}>
        <span>{icons[sector.impact]}</span>
        <span>{sector.sector}</span>
      </span>
    </Tooltip>
  );
};

// Stock Search Component
const StockSearch = ({ onSelect, watchlist }: { onSelect: (stock: StockResult) => void; watchlist: string[] }) => {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<StockResult[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [showResults, setShowResults] = useState(false);
  const debounceRef = useRef<NodeJS.Timeout | null>(null);

  const searchStocks = useCallback(async (q: string) => {
    if (!q || q.length < 1) {
      setResults([]);
      return;
    }
    setIsLoading(true);
    try {
      const res = await fetch(`/api/stocks?q=${encodeURIComponent(q)}`);
      const data = await res.json();
      setResults(data.results || []);
    } catch {
      setResults([]);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => searchStocks(query), 300);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [query, searchStocks]);

  return (
    <div className="relative">
      <input
        type="text"
        value={query}
        onChange={e => { setQuery(e.target.value); setShowResults(true); }}
        onFocus={() => setShowResults(true)}
        placeholder="Search ticker (e.g., AAPL, NVDA)..."
        className="w-full px-4 py-2 bg-slate-800/50 border border-slate-700/50 rounded-lg text-slate-200 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-amber-500/50"
      />
      {showResults && (query || results.length > 0) && (
        <div className="absolute z-40 w-full mt-1 bg-slate-800 border border-slate-700 rounded-lg shadow-xl max-h-60 overflow-y-auto">
          {isLoading ? (
            <div className="p-3 text-center text-slate-400"><LoadingSpinner size={4} /></div>
          ) : results.length > 0 ? (
            results.map(stock => (
              <button
                key={stock.symbol}
                onClick={() => {
                  if (!watchlist.includes(stock.symbol)) {
                    onSelect(stock);
                  }
                  setQuery('');
                  setShowResults(false);
                }}
                disabled={watchlist.includes(stock.symbol)}
                className={`w-full px-4 py-2 text-left hover:bg-slate-700/50 transition-colors ${watchlist.includes(stock.symbol) ? 'opacity-50' : ''}`}
              >
                <span className="font-mono text-amber-400">{stock.symbol}</span>
                <span className="text-slate-400 mx-2">-</span>
                <span className="text-slate-300 text-sm">{stock.name}</span>
                <span className="text-slate-500 text-xs ml-2">{stock.exchange}</span>
                {watchlist.includes(stock.symbol) && <span className="text-xs text-slate-500 ml-2">(in watchlist)</span>}
              </button>
            ))
          ) : query ? (
            <div className="p-3 text-center text-slate-500">No results found</div>
          ) : null}
        </div>
      )}
    </div>
  );
};

// Watchlist Component
const Watchlist = ({ watchlist, onRemove, onAdd }: { watchlist: string[]; onRemove: (ticker: string) => void; onAdd: (stock: StockResult) => void }) => (
  <div className="bg-slate-800/30 border border-slate-700/30 rounded-lg p-4">
    <h3 className="text-lg font-semibold text-slate-200 mb-3 flex items-center gap-2">
      <svg className="w-5 h-5 text-amber-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z" />
      </svg>
      My Watchlist
    </h3>
    <StockSearch onSelect={onAdd} watchlist={watchlist} />
    {watchlist.length > 0 ? (
      <div className="flex flex-wrap gap-2 mt-3">
        {watchlist.map(ticker => (
          <span key={ticker} className="inline-flex items-center gap-1 px-3 py-1 bg-amber-500/20 text-amber-400 rounded-full text-sm font-mono">
            {ticker}
            <button onClick={() => onRemove(ticker)} className="ml-1 hover:text-red-400 transition-colors">&times;</button>
          </span>
        ))}
      </div>
    ) : (
      <p className="text-sm text-slate-500 mt-3">Add tickers to track relevant news</p>
    )}
  </div>
);

// Sector data type
interface SectorData {
  name: string;
  bullish: number;
  neutral: number;
  bearish: number;
  total: number;
  netScore: number;
}

// Tracked sectors with display names
const TRACKED_SECTORS: Record<string, string> = {
  'Technology': 'Technology',
  'Financials': 'Finance/Banking',
  'Energy': 'Energy/Oil & Gas',
  'Healthcare': 'Healthcare/Pharma',
  'Defense': 'Defense/Aerospace',
  'Commodities': 'Commodities',
  'Real Estate': 'Real Estate',
  'Consumer': 'Consumer/Retail',
  'Industrials': 'Industrials',
  'Materials': 'Materials',
  'Communications': 'Communications',
  'Utilities': 'Utilities',
};

// Sector Heatmap Component
const SectorHeatmap = ({
  articles,
  selectedSector,
  onSectorClick,
}: {
  articles: AnalyzedArticle[];
  selectedSector: string | null;
  onSectorClick: (sector: string | null) => void;
}) => {
  const [showAll, setShowAll] = useState(false);

  // Aggregate sector data from articles
  const sectorData: SectorData[] = Object.entries(TRACKED_SECTORS).map(([key, displayName]) => {
    let bullish = 0, neutral = 0, bearish = 0;

    articles.forEach(article => {
      article.analysis?.sectors?.forEach(sector => {
        // Match sector name (flexible matching)
        const sectorName = sector.sector.toLowerCase();
        const keyLower = key.toLowerCase();
        if (sectorName.includes(keyLower) || keyLower.includes(sectorName)) {
          if (sector.impact === 'Bullish') bullish++;
          else if (sector.impact === 'Bearish') bearish++;
          else neutral++;
        }
      });
    });

    const total = bullish + neutral + bearish;
    const netScore = bullish - bearish;

    return { name: displayName, bullish, neutral, bearish, total, netScore };
  })
    .filter(s => s.total > 0) // Only show sectors with data
    .sort((a, b) => b.total - a.total); // Sort by most impacted

  const displayedSectors = showAll ? sectorData : sectorData.slice(0, 6);
  const hasMore = sectorData.length > 6;

  if (sectorData.length === 0) {
    return (
      <div className="bg-slate-800/30 border border-slate-700/30 rounded-lg p-6 text-center text-slate-500">
        <svg className="w-12 h-12 mx-auto mb-3 opacity-50" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
        </svg>
        <p>Run a scan to see sector impact</p>
      </div>
    );
  }

  const maxTotal = Math.max(...sectorData.map(s => s.total));

  return (
    <div className="bg-slate-800/30 border border-slate-700/30 rounded-lg p-4">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="text-lg font-semibold text-slate-200">Sector Impact Heatmap</h3>
          <p className="text-xs text-slate-500">Click a sector to filter news</p>
        </div>
        {selectedSector && (
          <button
            onClick={() => onSectorClick(null)}
            className="text-xs px-2 py-1 bg-amber-500/20 text-amber-400 rounded hover:bg-amber-500/30 transition-colors"
          >
            Clear filter
          </button>
        )}
      </div>

      <div className="space-y-2 overflow-x-auto">
        {/* Header */}
        <div className="grid grid-cols-[1fr,auto] gap-2 text-xs text-slate-500 uppercase tracking-wider pb-2 border-b border-slate-700/50 min-w-[300px]">
          <span>Sector</span>
          <span className="text-right w-16">Net</span>
        </div>

        {/* Rows */}
        {displayedSectors.map((sector) => {
          const isSelected = selectedSector === sector.name;
          const barWidth = (sector.total / maxTotal) * 100;
          const bullishWidth = sector.total > 0 ? (sector.bullish / sector.total) * 100 : 0;
          const neutralWidth = sector.total > 0 ? (sector.neutral / sector.total) * 100 : 0;
          const bearishWidth = sector.total > 0 ? (sector.bearish / sector.total) * 100 : 0;

          return (
            <div
              key={sector.name}
              onClick={() => onSectorClick(isSelected ? null : sector.name)}
              className={`group grid grid-cols-[1fr,auto] gap-2 items-center p-2 rounded-lg cursor-pointer transition-all min-w-[300px] ${
                isSelected
                  ? 'bg-amber-500/20 ring-1 ring-amber-500/50'
                  : 'hover:bg-slate-700/30'
              } ${
                sector.netScore > 0 ? 'hover:bg-emerald-500/10' : sector.netScore < 0 ? 'hover:bg-red-500/10' : ''
              }`}
              title={`${sector.name}: ${sector.bullish} bullish, ${sector.neutral} neutral, ${sector.bearish} bearish`}
            >
              {/* Sector name and bar */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <span className={`text-sm font-medium ${isSelected ? 'text-amber-400' : 'text-slate-200'}`}>
                    {sector.name}
                  </span>
                  <span className="text-xs text-slate-500 ml-2">{sector.total} articles</span>
                </div>

                {/* Stacked bar */}
                <div className="h-3 bg-slate-700/50 rounded-full overflow-hidden" style={{ width: `${Math.max(barWidth, 30)}%` }}>
                  <div className="h-full flex">
                    {bullishWidth > 0 && (
                      <div
                        className="h-full bg-gradient-to-r from-emerald-500 to-emerald-400 transition-all"
                        style={{ width: `${bullishWidth}%` }}
                      />
                    )}
                    {neutralWidth > 0 && (
                      <div
                        className="h-full bg-slate-500 transition-all"
                        style={{ width: `${neutralWidth}%` }}
                      />
                    )}
                    {bearishWidth > 0 && (
                      <div
                        className="h-full bg-gradient-to-r from-red-400 to-red-500 transition-all"
                        style={{ width: `${bearishWidth}%` }}
                      />
                    )}
                  </div>
                </div>

                {/* Legend on hover */}
                <div className="flex gap-3 text-xs opacity-0 group-hover:opacity-100 transition-opacity">
                  <span className="text-emerald-400">↑{sector.bullish}</span>
                  <span className="text-slate-400">→{sector.neutral}</span>
                  <span className="text-red-400">↓{sector.bearish}</span>
                </div>
              </div>

              {/* Net score */}
              <div className={`w-16 text-right font-mono font-bold text-lg ${
                sector.netScore > 0
                  ? 'text-emerald-400'
                  : sector.netScore < 0
                  ? 'text-red-400'
                  : 'text-slate-400'
              }`}>
                {sector.netScore > 0 ? '+' : ''}{sector.netScore}
              </div>
            </div>
          );
        })}

        {/* Show more/less */}
        {hasMore && (
          <button
            onClick={() => setShowAll(!showAll)}
            className="w-full py-2 text-sm text-slate-400 hover:text-slate-200 transition-colors"
          >
            {showAll ? '← Show less' : `Show all ${sectorData.length} sectors →`}
          </button>
        )}
      </div>

      {/* Legend */}
      <div className="flex items-center justify-center gap-4 mt-4 pt-3 border-t border-slate-700/50 text-xs text-slate-500">
        <span className="flex items-center gap-1">
          <span className="w-3 h-3 rounded bg-gradient-to-r from-emerald-500 to-emerald-400"></span>
          Bullish
        </span>
        <span className="flex items-center gap-1">
          <span className="w-3 h-3 rounded bg-slate-500"></span>
          Neutral
        </span>
        <span className="flex items-center gap-1">
          <span className="w-3 h-3 rounded bg-gradient-to-r from-red-400 to-red-500"></span>
          Bearish
        </span>
      </div>
    </div>
  );
};

// AI Summary Report Component
const SummaryReport = ({ summary, isLoading, onRegenerate, onCopy }: { summary: string; isLoading: boolean; onRegenerate: () => void; onCopy: () => void }) => {
  if (!summary && !isLoading) return null;

  const formatSummary = (text: string) => {
    return text.split('\n\n').map((paragraph, i) => {
      const boldMatch = paragraph.match(/^\*\*(.+?)\*\*/);
      if (boldMatch) {
        return (
          <div key={i} className="mb-4">
            <h4 className="text-amber-400 font-semibold mb-2">{boldMatch[1]}</h4>
            <p className="text-slate-300 leading-relaxed">{paragraph.replace(/^\*\*.+?\*\*\n?/, '')}</p>
          </div>
        );
      }
      return <p key={i} className="text-slate-300 leading-relaxed mb-4">{paragraph}</p>;
    });
  };

  return (
    <div className="bg-gradient-to-br from-slate-800/50 to-slate-900/50 border border-slate-700/50 rounded-lg p-6">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-xl font-serif font-semibold text-slate-100 flex items-center gap-2">
          <svg className="w-6 h-6 text-amber-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
          </svg>
          Daily Briefing
        </h3>
        <div className="flex gap-2">
          <button
            onClick={onCopy}
            disabled={isLoading}
            className="px-3 py-1.5 text-sm bg-slate-700/50 text-slate-300 rounded hover:bg-slate-600/50 transition-colors disabled:opacity-50"
          >
            Copy
          </button>
          <button
            onClick={onRegenerate}
            disabled={isLoading}
            className="px-3 py-1.5 text-sm bg-amber-500/20 text-amber-400 rounded hover:bg-amber-500/30 transition-colors disabled:opacity-50"
          >
            {isLoading ? 'Generating...' : 'Regenerate'}
          </button>
        </div>
      </div>
      {isLoading ? (
        <div className="flex items-center gap-3 py-8 justify-center">
          <LoadingSpinner size={5} />
          <span className="text-slate-400">Generating executive summary...</span>
        </div>
      ) : (
        <div className="prose prose-invert max-w-none">{formatSummary(summary)}</div>
      )}
    </div>
  );
};

// News Card Component
const NewsCard = ({ article, index, isWatchlisted, isExpanded, onToggleExpand }: {
  article: AnalyzedArticle;
  index: number;
  isWatchlisted: boolean;
  isExpanded?: boolean;
  onToggleExpand?: () => void;
}) => {
  const [localExpanded, setLocalExpanded] = useState(false);
  const expanded = isExpanded !== undefined ? isExpanded : localExpanded;
  const toggleExpand = onToggleExpand || (() => setLocalExpanded(prev => !prev));

  const timeAgo = (dateString: string) => {
    const diffMs = Date.now() - new Date(dateString).getTime();
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
    const diffDays = Math.floor(diffHours / 24);
    if (diffDays > 0) return `${diffDays}d ago`;
    if (diffHours > 0) return `${diffHours}h ago`;
    return 'Just now';
  };

  const sentiment = article.analysis?.overallSentiment;
  const sentimentStyle = {
    Bullish: { label: 'Bullish', color: 'text-emerald-400' },
    Bearish: { label: 'Bearish', color: 'text-red-400' },
    Mixed: { label: 'Mixed', color: 'text-amber-400' },
    Neutral: { label: 'Neutral', color: 'text-slate-400' },
  }[sentiment || 'Neutral'] || { label: 'Neutral', color: 'text-slate-400' };

  const hasMoreContent = (article.analysis?.summary && article.analysis.summary.length > 120) ||
    (article.analysis?.sectors && article.analysis.sectors.length > 2) ||
    article.analysis?.keyInsight;

  // Get all unique tickers from sectors
  const allTickers = article.analysis?.sectors?.flatMap(s => s.tickers || []).filter((v, i, a) => a.indexOf(v) === i) || [];

  return (
    <article
      className={`group border rounded-lg p-5 transition-all duration-300 animate-fade-in flex flex-col cursor-pointer ${
        expanded ? 'bg-slate-800/80 ring-1 ring-amber-500/30' : 'bg-slate-800/50 hover:bg-slate-800/70'
      } ${
        isWatchlisted ? 'border-amber-500/50 ring-1 ring-amber-500/20' : 'border-slate-700/50 hover:border-slate-600/50'
      }`}
      style={{ animationDelay: `${index * 30}ms` }}
      onClick={(e) => {
        // Don't toggle if clicking a link
        if ((e.target as HTMLElement).tagName !== 'A') {
          toggleExpand();
        }
      }}
    >
      <div className="flex-1">
        {/* Header */}
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2 text-xs text-slate-400 flex-wrap">
            {isWatchlisted && <span className="text-amber-400">★</span>}
            <span className="font-medium text-amber-500">{article.source}</span>
            <span>•</span>
            <span>{timeAgo(article.publishedAt)}</span>
            <span>•</span>
            <span className={sentimentStyle.color}>● {sentimentStyle.label}</span>
          </div>
          {hasMoreContent && (
            <svg
              className={`w-4 h-4 text-slate-500 transition-transform duration-300 ${expanded ? 'rotate-180' : ''}`}
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          )}
        </div>

        {/* Title */}
        <a
          href={article.url}
          target="_blank"
          rel="noopener noreferrer"
          className={`block font-serif text-lg font-semibold text-slate-100 hover:text-amber-400 transition-colors mb-2 ${expanded ? '' : 'line-clamp-2'}`}
          onClick={(e) => e.stopPropagation()}
        >
          {article.title}
        </a>

        {/* Summary - Expandable */}
        {article.analysis?.summary && (
          <div className="mb-3">
            <p className={`text-sm text-slate-400 transition-all duration-300 ${expanded ? '' : 'line-clamp-2'}`}>
              {article.analysis.summary}
            </p>
            {!expanded && article.analysis.summary.length > 120 && (
              <button
                className="text-xs text-amber-500 hover:text-amber-400 mt-1 font-medium"
                onClick={(e) => { e.stopPropagation(); toggleExpand(); }}
              >
                Read more →
              </button>
            )}
          </div>
        )}

        {/* Expanded Content */}
        <div className={`overflow-hidden transition-all duration-300 ease-in-out ${expanded ? 'max-h-[500px] opacity-100' : 'max-h-0 opacity-0'}`}>
          {/* Key Insight */}
          {article.analysis?.keyInsight && (
            <div className="text-xs bg-amber-500/10 border border-amber-500/20 rounded px-3 py-2 text-amber-300 mb-3">
              <span className="font-semibold">💡 Key Insight:</span> {article.analysis.keyInsight}
            </div>
          )}

          {/* All Tickers */}
          {allTickers.length > 0 && (
            <div className="mb-3">
              <div className="text-xs text-slate-500 uppercase tracking-wider mb-1">Affected Tickers</div>
              <div className="flex flex-wrap gap-1">
                {allTickers.map(ticker => (
                  <span key={ticker} className="px-2 py-0.5 bg-slate-700/50 text-slate-300 text-xs font-mono rounded">
                    {ticker}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Commodity Implications */}
          {article.implications && (
            <div className="grid grid-cols-2 gap-2 mb-3 text-xs">
              <div className="flex justify-between px-2 py-1 bg-slate-700/30 rounded">
                <span className="text-slate-500">Gold</span>
                <span className={article.implications.gold === 'Bullish' ? 'text-emerald-400' : article.implications.gold === 'Bearish' ? 'text-red-400' : 'text-slate-400'}>
                  {article.implications.gold}
                </span>
              </div>
              <div className="flex justify-between px-2 py-1 bg-slate-700/30 rounded">
                <span className="text-slate-500">Stocks</span>
                <span className={article.implications.stockMarkets === 'Bullish' ? 'text-emerald-400' : article.implications.stockMarkets === 'Bearish' ? 'text-red-400' : 'text-slate-400'}>
                  {article.implications.stockMarkets}
                </span>
              </div>
            </div>
          )}

          {/* Show less button */}
          <button
            className="text-xs text-slate-500 hover:text-slate-400 font-medium"
            onClick={(e) => { e.stopPropagation(); toggleExpand(); }}
          >
            ← Show less
          </button>
        </div>

        {/* Key Insight (collapsed view) */}
        {!expanded && article.analysis?.keyInsight && (
          <div className="text-xs bg-amber-500/10 border border-amber-500/20 rounded px-2 py-1 text-amber-300 mb-3 line-clamp-1">
            💡 {article.analysis.keyInsight}
          </div>
        )}
      </div>

      {/* Sectors Footer */}
      <div className="mt-auto pt-3 border-t border-slate-700/50">
        {article.analysis?.sectors?.length ? (
          <div className="flex flex-wrap gap-2">
            {(expanded ? article.analysis.sectors : article.analysis.sectors.slice(0, 3)).map((sector, idx) => (
              <ImpactBadge key={`${sector.sector}-${idx}`} sector={sector} />
            ))}
            {!expanded && article.analysis.sectors.length > 3 && (
              <span className="px-2 py-1 text-xs text-slate-500">+{article.analysis.sectors.length - 3} more</span>
            )}
          </div>
        ) : (
          <div className="flex flex-wrap gap-2">
            <span className={`px-2 py-1 text-xs rounded border ${article.implications.stockMarkets === 'Bullish' ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30' : article.implications.stockMarkets === 'Bearish' ? 'bg-red-500/20 text-red-400 border-red-500/30' : 'bg-slate-500/20 text-slate-400 border-slate-500/30'}`}>
              Stocks: {article.implications.stockMarkets}
            </span>
          </div>
        )}
      </div>
    </article>
  );
};

// Stats Card
const StatsCard = ({ label, value, icon }: { label: string; value: string | number; icon: React.ReactNode }) => (
  <div className="flex items-center gap-3 px-4 py-3 bg-slate-800/30 rounded-lg border border-slate-700/30">
    <div className="text-amber-500">{icon}</div>
    <div>
      <div className="text-xs text-slate-400 uppercase tracking-wider">{label}</div>
      <div className="text-lg font-semibold text-slate-100">{value}</div>
    </div>
  </div>
);

// Skeleton / Pending Card
const SkeletonCard = ({ article }: { article?: AnalyzedArticle }) => {
  if (article) {
    // Pending article - show title but with shimmer for analysis
    const timeAgo = (dateString: string) => {
      const diffMs = Date.now() - new Date(dateString).getTime();
      const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
      const diffDays = Math.floor(diffHours / 24);
      if (diffDays > 0) return `${diffDays}d ago`;
      if (diffHours > 0) return `${diffHours}h ago`;
      return 'Just now';
    };

    return (
      <article className="bg-slate-800/50 border border-slate-700/50 rounded-lg p-5 animate-fade-in">
        <div className="flex items-center gap-2 text-xs text-slate-400 mb-2">
          <span className="font-medium text-amber-500">{article.source}</span>
          <span>•</span>
          <span>{timeAgo(article.publishedAt)}</span>
          <span>•</span>
          <span className="text-slate-500 flex items-center gap-1">
            <span className="w-2 h-2 bg-slate-500 rounded-full animate-pulse"></span>
            Analyzing...
          </span>
        </div>
        <h3 className="font-serif text-lg font-semibold text-slate-100 line-clamp-2 mb-2">{article.title}</h3>
        <div className="h-4 w-full bg-slate-700 rounded shimmer mb-2"></div>
        <div className="h-4 w-2/3 bg-slate-700 rounded shimmer mb-4"></div>
        <div className="flex gap-2 pt-3 border-t border-slate-700/50">
          <div className="h-6 w-20 bg-slate-700 rounded shimmer"></div>
          <div className="h-6 w-20 bg-slate-700 rounded shimmer"></div>
        </div>
      </article>
    );
  }

  return (
    <div className="bg-slate-800/50 border border-slate-700/50 rounded-lg p-5">
      <div className="h-3 w-32 bg-slate-700 rounded shimmer mb-3"></div>
      <div className="h-5 w-full bg-slate-700 rounded shimmer mb-2"></div>
      <div className="h-5 w-3/4 bg-slate-700 rounded shimmer mb-4"></div>
      <div className="flex gap-2 pt-3 border-t border-slate-700/50">
        <div className="h-6 w-20 bg-slate-700 rounded shimmer"></div>
        <div className="h-6 w-20 bg-slate-700 rounded shimmer"></div>
      </div>
    </div>
  );
};

// Main Component
export default function Home() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<GroupedArticles | null>(null);
  const [allArticles, setAllArticles] = useState<AnalyzedArticle[]>([]);
  const [pendingArticles, setPendingArticles] = useState<AnalyzedArticle[]>([]);
  const [total, setTotal] = useState(0);
  const [lastScan, setLastScan] = useState<Date | null>(null);
  const [activeRegion, setActiveRegion] = useState<Region>('All');
  const [impactFilter, setImpactFilter] = useState<ImpactFilter>('All');
  const [watchlistOnly, setWatchlistOnly] = useState(false);
  const [watchlist, setWatchlist] = useState<string[]>([]);
  const [sectorFilter, setSectorFilter] = useState<string | null>(null);
  const [summary, setSummary] = useState('');
  const [summaryLoading, setSummaryLoading] = useState(false);
  const [progress, setProgress] = useState('');
  const [scanProgress, setScanProgress] = useState({ current: 0, total: 0 });
  const [expandedCards, setExpandedCards] = useState<Set<string>>(new Set());
  const [allExpanded, setAllExpanded] = useState(false);
  const eventSourceRef = useRef<EventSource | null>(null);

  // Load watchlist on mount
  useEffect(() => {
    const loadData = async () => {
      // Load from localStorage first
      const savedWatchlist = localStorage.getItem('watchlist');
      if (savedWatchlist) {
        setWatchlist(JSON.parse(savedWatchlist));
      }
      // Try to load from Supabase
      const supabaseWatchlist = await getWatchlist();
      if (supabaseWatchlist.length > 0) {
        setWatchlist(supabaseWatchlist);
        localStorage.setItem('watchlist', JSON.stringify(supabaseWatchlist));
      }
    };
    loadData();
  }, []);

  // Save watchlist
  const updateWatchlist = async (newWatchlist: string[]) => {
    setWatchlist(newWatchlist);
    localStorage.setItem('watchlist', JSON.stringify(newWatchlist));
    await saveWatchlist(newWatchlist);
  };

  const addToWatchlist = (stock: StockResult) => {
    if (!watchlist.includes(stock.symbol)) {
      updateWatchlist([...watchlist, stock.symbol]);
    }
  };

  const removeFromWatchlist = (ticker: string) => {
    updateWatchlist(watchlist.filter(t => t !== ticker));
  };

  // Generate summary
  const generateSummary = async (articles: AnalyzedArticle[]) => {
    setSummaryLoading(true);
    try {
      const res = await fetch('/api/summary', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ articles, watchlist }),
      });
      const data = await res.json();
      if (data.summary) setSummary(data.summary);
    } catch (err) {
      console.error('Summary generation failed:', err);
    } finally {
      setSummaryLoading(false);
    }
  };

  // Stop scan
  const stopScan = useCallback(() => {
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
      eventSourceRef.current = null;
    }
    setLoading(false);
    setProgress('Scan stopped');
    setTimeout(() => setProgress(''), 2000);
  }, []);

  // Scan news with SSE streaming
  const scanNews = useCallback(() => {
    // Clean up any existing connection
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
    }

    setLoading(true);
    setError(null);
    setProgress('Connecting...');
    setScanProgress({ current: 0, total: 0 });
    setPendingArticles([]);
    setAllArticles([]);
    setData(null);
    setSummary('');

    const analyzedArticlesMap = new Map<string, AnalyzedArticle>();

    const eventSource = new EventSource('/api/scan-stream');
    eventSourceRef.current = eventSource;

    eventSource.addEventListener('status', (e) => {
      const data = JSON.parse(e.data);
      setProgress(data.message);
      if (data.total) {
        setScanProgress(prev => ({ ...prev, total: data.total }));
      }
    });

    eventSource.addEventListener('articles', (e) => {
      const data = JSON.parse(e.data);
      // Mark all articles as pending initially
      const pending = data.articles.map((a: AnalyzedArticle) => ({
        ...a,
        pending: true,
        region: a.region || 'Americas',
        implications: a.implications || { gold: 'Neutral', silver: 'Neutral', rareMinerals: 'Neutral', stockMarkets: 'Neutral' },
      }));
      setPendingArticles(pending);
      setTotal(data.total);
      setScanProgress(prev => ({ ...prev, total: data.total }));
    });

    eventSource.addEventListener('analyzed', (e) => {
      const data = JSON.parse(e.data);
      const article = data.article as AnalyzedArticle;

      // Store in map for deduplication
      analyzedArticlesMap.set(article.id || article.url, { ...article, pending: false });

      // Update progress
      setScanProgress(data.progress);
      setProgress(`Analyzing: ${data.progress.current}/${data.progress.total}`);

      // Update pending articles - mark this one as analyzed
      setPendingArticles(prev =>
        prev.map(a => (a.id || a.url) === (article.id || article.url) ? { ...article, pending: false } : a)
      );

      // Update allArticles with analyzed ones
      setAllArticles(Array.from(analyzedArticlesMap.values()));

      // Group by region for display
      const articles = Array.from(analyzedArticlesMap.values());
      const grouped: GroupedArticles = {
        Americas: articles.filter(a => a.region === 'Americas'),
        Europe: articles.filter(a => a.region === 'Europe'),
        Asia: articles.filter(a => a.region === 'Asia'),
        'Middle East': articles.filter(a => a.region === 'Middle East'),
        Africa: articles.filter(a => a.region === 'Africa'),
      };
      setData(grouped);
    });

    eventSource.addEventListener('complete', async (e) => {
      const data = JSON.parse(e.data);
      eventSource.close();
      eventSourceRef.current = null;

      setLoading(false);
      setLastScan(new Date());
      setPendingArticles([]); // Clear pending, all done
      setProgress('Generating briefing...');

      // Final articles from map
      const finalArticles = Array.from(analyzedArticlesMap.values());
      setAllArticles(finalArticles);
      setTotal(data.total);

      // Calculate sentiments and save to Supabase
      const overallSentiment = calculateSentiment(finalArticles);
      const americasSentiment = calculateSentiment(finalArticles.filter(a => a.region === 'Americas'));
      const europeSentiment = calculateSentiment(finalArticles.filter(a => a.region === 'Europe'));
      const asiaSentiment = calculateSentiment(finalArticles.filter(a => ['Asia', 'Middle East', 'Africa'].includes(a.region)));

      await saveScan({
        total_articles: data.total,
        sentiment_score: overallSentiment,
        americas_sentiment: americasSentiment,
        europe_sentiment: europeSentiment,
        asia_sentiment: asiaSentiment,
      });

      // Generate summary
      await generateSummary(finalArticles);
      setProgress('');
    });

    eventSource.addEventListener('error', (e) => {
      const data = e instanceof MessageEvent ? JSON.parse(e.data) : null;
      eventSource.close();
      eventSourceRef.current = null;
      setLoading(false);
      setError(data?.message || 'Connection error');
      setProgress('');
    });

    eventSource.onerror = () => {
      if (eventSource.readyState === EventSource.CLOSED) {
        // Normal close, ignore
        return;
      }
      eventSource.close();
      eventSourceRef.current = null;
      setLoading(false);
      setError('Connection lost');
      setProgress('');
    };
  }, []);

  // Filter articles
  const getFilteredArticles = (): AnalyzedArticle[] => {
    if (!data) return [];
    let articles = activeRegion === 'All' ? Object.values(data).flat() : data[activeRegion] || [];

    if (impactFilter !== 'All') {
      articles = articles.filter(a =>
        a.analysis?.sectors?.some(s => s.impact === impactFilter) ||
        Object.values(a.implications).some(i => i === impactFilter)
      );
    }

    if (watchlistOnly && watchlist.length > 0) {
      articles = articles.filter(a => articleMentionsTicker(a, watchlist));
    }

    // Sector filter from heatmap
    if (sectorFilter) {
      articles = articles.filter(a =>
        a.analysis?.sectors?.some(s => {
          const sectorName = s.sector.toLowerCase();
          const filterLower = sectorFilter.toLowerCase();
          // Match display name or key
          return sectorName.includes(filterLower) ||
            filterLower.includes(sectorName) ||
            Object.entries(TRACKED_SECTORS).some(([key, display]) =>
              display === sectorFilter && sectorName.includes(key.toLowerCase())
            );
        })
      );
    }

    return articles;
  };

  const filteredArticles = getFilteredArticles();
  const watchlistCount = data ? Object.values(data).flat().filter(a => articleMentionsTicker(a, watchlist)).length : 0;

  const copyReport = () => {
    navigator.clipboard.writeText(summary.replace(/\*\*/g, ''));
  };

  return (
    <div className="min-h-screen bg-gradient-radial">
      {/* Header */}
      <header className="relative overflow-hidden border-b border-slate-700/50">
        <div className="absolute inset-0 overflow-hidden">
          <div className="absolute -top-1/2 -right-1/4 w-96 h-96 bg-amber-500/10 rounded-full blur-3xl"></div>
          <div className="absolute -bottom-1/2 -left-1/4 w-96 h-96 bg-blue-500/10 rounded-full blur-3xl"></div>
        </div>
        <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <div className="flex items-center gap-4 mb-6">
            <GlobeIcon className="w-10 h-10 text-amber-500 animate-spin-slow" />
            <div>
              <h1 className="font-serif text-2xl sm:text-3xl font-bold text-slate-100">Political Implication Scanner</h1>
              <p className="text-slate-400 text-sm">AI-Powered Market Intelligence</p>
            </div>
          </div>

          <div className="flex flex-col sm:flex-row items-start gap-4">
            <div className="flex items-center gap-3">
              <button
                onClick={scanNews}
                disabled={loading}
                className={`px-6 py-3 rounded-lg font-semibold transition-all ${loading ? 'bg-slate-700 text-slate-400 cursor-not-allowed' : 'bg-gradient-gold text-slate-900 hover:shadow-lg hover:shadow-amber-500/25'}`}
              >
                {loading ? (
                  <span className="flex items-center gap-2"><LoadingSpinner size={4} />Scanning...</span>
                ) : (
                  <span className="flex items-center gap-2">
                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
                    Scan News
                  </span>
                )}
              </button>

              {loading && (
                <button
                  onClick={stopScan}
                  className="px-4 py-3 rounded-lg font-semibold bg-red-500/20 text-red-400 border border-red-500/30 hover:bg-red-500/30 transition-all"
                >
                  Stop
                </button>
              )}
            </div>

            {/* Progress Bar */}
            {loading && scanProgress.total > 0 && (
              <div className="flex-1 max-w-md">
                <div className="flex items-center justify-between text-sm text-slate-400 mb-1">
                  <span>{progress}</span>
                  <span>{Math.round((scanProgress.current / scanProgress.total) * 100)}%</span>
                </div>
                <div className="h-2 bg-slate-700/50 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-gradient-to-r from-amber-500 to-amber-400 transition-all duration-300 ease-out"
                    style={{ width: `${(scanProgress.current / scanProgress.total) * 100}%` }}
                  ></div>
                </div>
              </div>
            )}

            {(lastScan || total > 0) && !loading && (
              <div className="flex flex-wrap gap-3">
                <StatsCard label="Articles" value={total} icon={<svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 20H5a2 2 0 01-2-2V6a2 2 0 012-2h10a2 2 0 012 2v1m2 13a2 2 0 01-2-2V7m2 13a2 2 0 002-2V9a2 2 0 00-2-2h-2m-4-3H9M7 16h6M7 8h6v4H7V8z" /></svg>} />
                {watchlist.length > 0 && <StatsCard label="Watchlist Hits" value={watchlistCount} icon={<svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z" /></svg>} />}
              </div>
            )}
          </div>
        </div>
      </header>

      {error && (
        <div className="max-w-7xl mx-auto px-4 py-4">
          <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-4 text-red-400">{error}</div>
        </div>
      )}

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6">
        {/* Watchlist and Sector Heatmap Row */}
        <div className="grid gap-6 lg:grid-cols-2">
          <Watchlist watchlist={watchlist} onAdd={addToWatchlist} onRemove={removeFromWatchlist} />
          <SectorHeatmap
            articles={allArticles}
            selectedSector={sectorFilter}
            onSectorClick={setSectorFilter}
          />
        </div>

        {/* Summary Report */}
        {(summary || summaryLoading) && (
          <SummaryReport summary={summary} isLoading={summaryLoading} onRegenerate={() => generateSummary(allArticles)} onCopy={copyReport} />
        )}

        {/* Loading State - Show pending articles during scan */}
        {loading && pendingArticles.length > 0 && (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {pendingArticles.map((article, idx) => {
              const cardId = article.id || article.url;
              return article.pending ? (
                <SkeletonCard key={cardId || idx} article={article} />
              ) : (
                <NewsCard
                  key={cardId || idx}
                  article={article}
                  index={idx}
                  isWatchlisted={articleMentionsTicker(article, watchlist)}
                  isExpanded={expandedCards.has(cardId)}
                  onToggleExpand={() => {
                    setExpandedCards(prev => {
                      const next = new Set(prev);
                      if (next.has(cardId)) {
                        next.delete(cardId);
                      } else {
                        next.add(cardId);
                      }
                      return next;
                    });
                  }}
                />
              );
            })}
          </div>
        )}

        {/* Initial loading skeleton */}
        {loading && pendingArticles.length === 0 && !data && (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {[...Array(6)].map((_, i) => <SkeletonCard key={i} />)}
          </div>
        )}

        {/* Results */}
        {data && !loading && (
          <>
            {/* Filters */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div className="flex flex-wrap gap-2">
                {REGIONS.map(region => (
                  <button
                    key={region}
                    onClick={() => setActiveRegion(region)}
                    className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${activeRegion === region ? 'bg-amber-500 text-slate-900' : 'bg-slate-800/50 text-slate-400 hover:bg-slate-700/50 border border-slate-700/50'}`}
                  >
                    {region} ({region === 'All' ? total : data[region]?.length || 0})
                  </button>
                ))}
              </div>
              <div className="flex items-center gap-3 flex-wrap">
                {/* Sector filter badge */}
                {sectorFilter && (
                  <span className="flex items-center gap-2 px-3 py-1.5 bg-amber-500/20 text-amber-400 rounded-lg text-sm border border-amber-500/30">
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                    </svg>
                    {sectorFilter}
                    <button onClick={() => setSectorFilter(null)} className="hover:text-amber-200">×</button>
                  </span>
                )}
                {/* Expand/Collapse All */}
                <button
                  onClick={() => {
                    if (allExpanded) {
                      setExpandedCards(new Set());
                      setAllExpanded(false);
                    } else {
                      const allIds = new Set(filteredArticles.map(a => a.id || a.url));
                      setExpandedCards(allIds);
                      setAllExpanded(true);
                    }
                  }}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-sm text-slate-400 hover:text-slate-200 bg-slate-800/50 border border-slate-700/50 rounded-lg transition-colors"
                >
                  <svg className={`w-4 h-4 transition-transform ${allExpanded ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                  {allExpanded ? 'Collapse All' : 'Expand All'}
                </button>
                {watchlist.length > 0 && (
                  <label className="flex items-center gap-2 text-sm text-slate-400 cursor-pointer">
                    <input type="checkbox" checked={watchlistOnly} onChange={e => setWatchlistOnly(e.target.checked)} className="rounded bg-slate-700 border-slate-600 text-amber-500 focus:ring-amber-500" />
                    Watchlist Only ({watchlistCount})
                  </label>
                )}
                <select value={impactFilter} onChange={e => setImpactFilter(e.target.value as ImpactFilter)} className="bg-slate-800/50 border border-slate-700/50 rounded-lg px-3 py-1.5 text-sm text-slate-200 focus:outline-none focus:ring-2 focus:ring-amber-500/50">
                  {IMPACT_FILTERS.map(f => <option key={f} value={f}>{f}</option>)}
                </select>
              </div>
            </div>

            {/* Articles */}
            {filteredArticles.length > 0 ? (
              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                {filteredArticles.map((article, idx) => {
                  const cardId = article.id || article.url;
                  return (
                    <NewsCard
                      key={`${cardId}-${idx}`}
                      article={article}
                      index={idx}
                      isWatchlisted={articleMentionsTicker(article, watchlist)}
                      isExpanded={expandedCards.has(cardId)}
                      onToggleExpand={() => {
                        setExpandedCards(prev => {
                          const next = new Set(prev);
                          if (next.has(cardId)) {
                            next.delete(cardId);
                          } else {
                            next.add(cardId);
                          }
                          return next;
                        });
                      }}
                    />
                  );
                })}
              </div>
            ) : (
              <div className="text-center py-12 text-slate-500">
                <p>No articles match your filters</p>
                <button onClick={() => { setActiveRegion('All'); setImpactFilter('All'); setWatchlistOnly(false); setSectorFilter(null); }} className="mt-2 text-amber-500 hover:text-amber-400">Clear filters</button>
              </div>
            )}
          </>
        )}

        {/* Empty State */}
        {!data && !loading && !error && (
          <div className="text-center py-16">
            <GlobeIcon className="w-20 h-20 text-slate-600 mx-auto mb-4 animate-float" />
            <h2 className="font-serif text-xl font-semibold text-slate-300 mb-2">Ready to Analyze Markets</h2>
            <p className="text-slate-500 max-w-md mx-auto">Click &quot;Scan News&quot; to fetch and analyze the latest political and economic news with AI-powered insights.</p>
          </div>
        )}
      </main>

      <footer className="border-t border-slate-700/50 mt-12">
        <div className="max-w-7xl mx-auto px-4 py-6 flex items-center justify-between text-sm text-slate-500">
          <span className="flex items-center gap-2"><GlobeIcon className="w-4 h-4 text-amber-500" />Political Implication Scanner</span>
          <span>Powered by Gemini AI</span>
        </div>
      </footer>
    </div>
  );
}
