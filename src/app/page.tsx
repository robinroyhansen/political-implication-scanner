'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, Legend, ResponsiveContainer } from 'recharts';
import { saveScan, getRecentScans, saveWatchlist, getWatchlist, ScanRecord } from '@/lib/supabase';

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
  title: string;
  source: string;
  url: string;
  publishedAt: string;
  region: string;
  category?: string;
  analysis?: Analysis;
  implications: Implications;
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

// Sentiment Chart Component
const SentimentChart = ({ data }: { data: ScanRecord[] }) => {
  if (!data || data.length < 2) {
    return (
      <div className="bg-slate-800/30 border border-slate-700/30 rounded-lg p-6 text-center text-slate-500">
        <p>Need at least 2 scans to show trend chart</p>
      </div>
    );
  }

  const chartData = [...data].reverse().map(scan => ({
    time: new Date(scan.created_at!).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    date: new Date(scan.created_at!).toLocaleDateString(),
    overall: scan.sentiment_score,
    americas: scan.americas_sentiment,
    europe: scan.europe_sentiment,
    asia: scan.asia_sentiment,
    articles: scan.total_articles,
  }));

  return (
    <div className="bg-slate-800/30 border border-slate-700/30 rounded-lg p-4">
      <h3 className="text-lg font-semibold text-slate-200 mb-4">Sentiment Trend</h3>
      <div className="h-64 w-full overflow-x-auto">
        <ResponsiveContainer width="100%" height="100%" minWidth={400}>
          <LineChart data={chartData} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
            <XAxis dataKey="time" stroke="#64748b" fontSize={12} />
            <YAxis stroke="#64748b" fontSize={12} domain={[-100, 100]} />
            <RechartsTooltip
              contentStyle={{ backgroundColor: '#1e293b', border: '1px solid #334155', borderRadius: '8px' }}
              labelStyle={{ color: '#f1f5f9' }}
              formatter={(value, name) => [`${value ?? 0}`, String(name).charAt(0).toUpperCase() + String(name).slice(1)]}
              labelFormatter={(label, payload) => payload?.[0]?.payload?.date ? `${payload[0].payload.date} ${label}` : label}
            />
            <Legend />
            <Line type="monotone" dataKey="overall" name="Overall" stroke="#f59e0b" strokeWidth={2} dot={{ fill: '#f59e0b' }} />
            <Line type="monotone" dataKey="americas" name="Americas" stroke="#3b82f6" strokeWidth={1.5} dot={false} />
            <Line type="monotone" dataKey="europe" name="Europe" stroke="#8b5cf6" strokeWidth={1.5} dot={false} />
            <Line type="monotone" dataKey="asia" name="Asia" stroke="#10b981" strokeWidth={1.5} dot={false} />
          </LineChart>
        </ResponsiveContainer>
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
const NewsCard = ({ article, index, isWatchlisted }: { article: AnalyzedArticle; index: number; isWatchlisted: boolean }) => {
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

  return (
    <article
      className={`group bg-slate-800/50 border rounded-lg p-5 hover:bg-slate-800/80 transition-all duration-300 animate-fade-in flex flex-col ${
        isWatchlisted ? 'border-amber-500/50 ring-1 ring-amber-500/20' : 'border-slate-700/50 hover:border-slate-600/50'
      }`}
      style={{ animationDelay: `${index * 30}ms` }}
    >
      <div className="flex-1">
        <div className="flex items-center gap-2 text-xs text-slate-400 mb-2 flex-wrap">
          {isWatchlisted && <span className="text-amber-400">★</span>}
          <span className="font-medium text-amber-500">{article.source}</span>
          <span>•</span>
          <span>{timeAgo(article.publishedAt)}</span>
          <span>•</span>
          <span className={sentimentStyle.color}>● {sentimentStyle.label}</span>
        </div>
        <a href={article.url} target="_blank" rel="noopener noreferrer" className="block font-serif text-lg font-semibold text-slate-100 group-hover:text-amber-400 transition-colors line-clamp-2 mb-2">
          {article.title}
        </a>
        {article.analysis?.summary && <p className="text-sm text-slate-400 mb-3 line-clamp-2">{article.analysis.summary}</p>}
        {article.analysis?.keyInsight && (
          <div className="text-xs bg-amber-500/10 border border-amber-500/20 rounded px-2 py-1 text-amber-300 mb-3">
            💡 {article.analysis.keyInsight}
          </div>
        )}
      </div>
      <div className="mt-auto pt-3 border-t border-slate-700/50">
        {article.analysis?.sectors?.length ? (
          <div className="flex flex-wrap gap-2">
            {article.analysis.sectors.slice(0, 4).map((sector, idx) => (
              <ImpactBadge key={`${sector.sector}-${idx}`} sector={sector} />
            ))}
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

// Skeleton
const SkeletonCard = () => (
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

// Main Component
export default function Home() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<GroupedArticles | null>(null);
  const [allArticles, setAllArticles] = useState<AnalyzedArticle[]>([]);
  const [total, setTotal] = useState(0);
  const [lastScan, setLastScan] = useState<Date | null>(null);
  const [activeRegion, setActiveRegion] = useState<Region>('All');
  const [impactFilter, setImpactFilter] = useState<ImpactFilter>('All');
  const [watchlistOnly, setWatchlistOnly] = useState(false);
  const [watchlist, setWatchlist] = useState<string[]>([]);
  const [scanHistory, setScanHistory] = useState<ScanRecord[]>([]);
  const [summary, setSummary] = useState('');
  const [summaryLoading, setSummaryLoading] = useState(false);
  const [progress, setProgress] = useState('');

  // Load watchlist and scan history on mount
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
      // Load scan history
      const history = await getRecentScans(20);
      setScanHistory(history);
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

  // Scan news
  const scanNews = async () => {
    setLoading(true);
    setError(null);
    setProgress('Fetching news...');

    try {
      const newsRes = await fetch('/api/news');
      if (!newsRes.ok) throw new Error('Failed to fetch news');
      const { articles } = await newsRes.json();

      setProgress(`Analyzing ${articles.length} articles...`);

      const analyzeRes = await fetch('/api/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ articles }),
      });
      if (!analyzeRes.ok) throw new Error('Analysis failed');

      const result = await analyzeRes.json();
      setData(result.grouped);
      setTotal(result.total);
      setLastScan(new Date());

      // Flatten articles for summary
      const flatArticles = Object.values(result.grouped as GroupedArticles).flat();
      setAllArticles(flatArticles);

      // Calculate sentiments
      const overallSentiment = calculateSentiment(flatArticles);
      const americasSentiment = calculateSentiment(flatArticles.filter(a => a.region === 'Americas'));
      const europeSentiment = calculateSentiment(flatArticles.filter(a => a.region === 'Europe'));
      const asiaSentiment = calculateSentiment(flatArticles.filter(a => ['Asia', 'Middle East', 'Africa'].includes(a.region)));

      // Save scan to Supabase
      const savedScan = await saveScan({
        total_articles: result.total,
        sentiment_score: overallSentiment,
        americas_sentiment: americasSentiment,
        europe_sentiment: europeSentiment,
        asia_sentiment: asiaSentiment,
      });

      if (savedScan) {
        setScanHistory(prev => [savedScan, ...prev].slice(0, 20));
      }

      // Generate summary
      setProgress('Generating briefing...');
      await generateSummary(flatArticles);
      setProgress('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
      setProgress('');
    } finally {
      setLoading(false);
    }
  };

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
            <button
              onClick={scanNews}
              disabled={loading}
              className={`px-6 py-3 rounded-lg font-semibold transition-all ${loading ? 'bg-slate-700 text-slate-400 cursor-not-allowed' : 'bg-gradient-gold text-slate-900 hover:shadow-lg hover:shadow-amber-500/25'}`}
            >
              {loading ? (
                <span className="flex items-center gap-2"><LoadingSpinner size={4} />{progress}</span>
              ) : (
                <span className="flex items-center gap-2">
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
                  Scan News
                </span>
              )}
            </button>

            {lastScan && (
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
        {/* Watchlist and Chart Row */}
        <div className="grid gap-6 lg:grid-cols-2">
          <Watchlist watchlist={watchlist} onAdd={addToWatchlist} onRemove={removeFromWatchlist} />
          <SentimentChart data={scanHistory} />
        </div>

        {/* Summary Report */}
        {(summary || summaryLoading) && (
          <SummaryReport summary={summary} isLoading={summaryLoading} onRegenerate={() => generateSummary(allArticles)} onCopy={copyReport} />
        )}

        {/* Loading State */}
        {loading && !data && (
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
              <div className="flex items-center gap-3">
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
                {filteredArticles.map((article, idx) => (
                  <NewsCard key={`${article.url}-${idx}`} article={article} index={idx} isWatchlisted={articleMentionsTicker(article, watchlist)} />
                ))}
              </div>
            ) : (
              <div className="text-center py-12 text-slate-500">
                <p>No articles match your filters</p>
                <button onClick={() => { setActiveRegion('All'); setImpactFilter('All'); setWatchlistOnly(false); }} className="mt-2 text-amber-500 hover:text-amber-400">Clear filters</button>
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
