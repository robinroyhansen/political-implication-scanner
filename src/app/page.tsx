'use client';

import { useState, useEffect } from 'react';

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
  implications: Implications;
}

type GroupedArticles = Record<string, AnalyzedArticle[]>;

const REGIONS = ['All', 'Americas', 'Europe', 'Asia', 'Middle East', 'Africa'] as const;
type Region = typeof REGIONS[number];

const IMPACT_FILTERS = ['All', 'Bullish', 'Bearish', 'Neutral', 'Uncertain'] as const;
type ImpactFilter = typeof IMPACT_FILTERS[number];

// Globe SVG Component
const GlobeIcon = ({ className }: { className?: string }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
    <circle cx="12" cy="12" r="10" />
    <ellipse cx="12" cy="12" rx="10" ry="4" />
    <path d="M12 2v20" />
    <path d="M2 12h20" />
    <path d="M4.93 4.93c4.08 2.4 10.06 2.4 14.14 0" />
    <path d="M4.93 19.07c4.08-2.4 10.06-2.4 14.14 0" />
  </svg>
);

// Loading Spinner
const LoadingSpinner = () => (
  <div className="relative w-6 h-6">
    <div className="absolute inset-0 border-2 border-amber-500/30 rounded-full"></div>
    <div className="absolute inset-0 border-2 border-transparent border-t-amber-500 rounded-full animate-spin"></div>
  </div>
);

// Impact Badge Component
const ImpactBadge = ({ impact, asset }: { impact: string; asset: string }) => {
  const getImpactStyle = () => {
    switch (impact) {
      case 'Bullish':
        return 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30';
      case 'Bearish':
        return 'bg-red-500/20 text-red-400 border-red-500/30';
      case 'Neutral':
        return 'bg-slate-500/20 text-slate-400 border-slate-500/30';
      default:
        return 'bg-amber-500/20 text-amber-400 border-amber-500/30';
    }
  };

  const getImpactIcon = () => {
    switch (impact) {
      case 'Bullish':
        return '↑';
      case 'Bearish':
        return '↓';
      case 'Neutral':
        return '→';
      default:
        return '?';
    }
  };

  return (
    <span className={`inline-flex items-center gap-1 px-2 py-1 text-xs font-medium rounded border ${getImpactStyle()}`}>
      <span>{getImpactIcon()}</span>
      <span>{asset}</span>
    </span>
  );
};

// News Card Component
const NewsCard = ({ article, index }: { article: AnalyzedArticle; index: number }) => {
  const timeAgo = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
    const diffDays = Math.floor(diffHours / 24);

    if (diffDays > 0) return `${diffDays}d ago`;
    if (diffHours > 0) return `${diffHours}h ago`;
    return 'Just now';
  };

  const getOverallSentiment = () => {
    const impacts = Object.values(article.implications);
    const bullish = impacts.filter(i => i === 'Bullish').length;
    const bearish = impacts.filter(i => i === 'Bearish').length;

    if (bullish > bearish) return { label: 'Positive Outlook', color: 'text-emerald-400', icon: '●' };
    if (bearish > bullish) return { label: 'Negative Outlook', color: 'text-red-400', icon: '●' };
    return { label: 'Mixed Signals', color: 'text-amber-400', icon: '●' };
  };

  const sentiment = getOverallSentiment();

  return (
    <article
      className="group bg-slate-800/50 border border-slate-700/50 rounded-lg p-5 hover:bg-slate-800/80 hover:border-slate-600/50 transition-all duration-300 animate-fade-in"
      style={{ animationDelay: `${index * 50}ms` }}
    >
      <div className="flex items-start justify-between gap-4 mb-3">
        <div className="flex-1">
          <div className="flex items-center gap-2 text-xs text-slate-400 mb-2">
            <span className="font-medium text-amber-500">{article.source}</span>
            <span>•</span>
            <span>{timeAgo(article.publishedAt)}</span>
            <span>•</span>
            <span className={sentiment.color}>
              {sentiment.icon} {sentiment.label}
            </span>
          </div>
          <a
            href={article.url}
            target="_blank"
            rel="noopener noreferrer"
            className="block font-serif text-lg font-semibold text-slate-100 group-hover:text-amber-400 transition-colors line-clamp-2"
          >
            {article.title}
          </a>
        </div>
      </div>

      <div className="flex flex-wrap gap-2 mt-4">
        <ImpactBadge impact={article.implications.gold} asset="Gold" />
        <ImpactBadge impact={article.implications.silver} asset="Silver" />
        <ImpactBadge impact={article.implications.rareMinerals} asset="Minerals" />
        <ImpactBadge impact={article.implications.stockMarkets} asset="Stocks" />
      </div>
    </article>
  );
};

// Stats Card Component
const StatsCard = ({ label, value, icon }: { label: string; value: string | number; icon: React.ReactNode }) => (
  <div className="flex items-center gap-3 px-4 py-3 bg-slate-800/30 rounded-lg border border-slate-700/30">
    <div className="text-amber-500">{icon}</div>
    <div>
      <div className="text-xs text-slate-400 uppercase tracking-wider">{label}</div>
      <div className="text-lg font-semibold text-slate-100">{value}</div>
    </div>
  </div>
);

// Skeleton Loader
const SkeletonCard = () => (
  <div className="bg-slate-800/50 border border-slate-700/50 rounded-lg p-5">
    <div className="flex items-center gap-2 mb-3">
      <div className="h-3 w-20 bg-slate-700 rounded shimmer"></div>
      <div className="h-3 w-16 bg-slate-700 rounded shimmer"></div>
    </div>
    <div className="h-5 w-full bg-slate-700 rounded mb-2 shimmer"></div>
    <div className="h-5 w-3/4 bg-slate-700 rounded mb-4 shimmer"></div>
    <div className="flex gap-2">
      <div className="h-6 w-16 bg-slate-700 rounded shimmer"></div>
      <div className="h-6 w-16 bg-slate-700 rounded shimmer"></div>
      <div className="h-6 w-16 bg-slate-700 rounded shimmer"></div>
    </div>
  </div>
);

export default function Home() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<GroupedArticles | null>(null);
  const [total, setTotal] = useState(0);
  const [lastScan, setLastScan] = useState<Date | null>(null);
  const [activeRegion, setActiveRegion] = useState<Region>('All');
  const [impactFilter, setImpactFilter] = useState<ImpactFilter>('All');
  const [darkMode, setDarkMode] = useState(true);

  useEffect(() => {
    if (darkMode) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, [darkMode]);

  const scanNews = async () => {
    setLoading(true);
    setError(null);

    try {
      const newsRes = await fetch('/api/news');
      if (!newsRes.ok) throw new Error('Failed to fetch news');
      const { articles } = await newsRes.json();

      const analyzeRes = await fetch('/api/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ articles }),
      });
      if (!analyzeRes.ok) throw new Error('Failed to analyze articles');

      const result = await analyzeRes.json();
      setData(result.grouped);
      setTotal(result.total);
      setLastScan(new Date());
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setLoading(false);
    }
  };

  const getFilteredArticles = (): AnalyzedArticle[] => {
    if (!data) return [];

    let articles: AnalyzedArticle[] = [];

    if (activeRegion === 'All') {
      articles = Object.values(data).flat();
    } else {
      articles = data[activeRegion] || [];
    }

    if (impactFilter !== 'All') {
      articles = articles.filter(article =>
        Object.values(article.implications).some(impact => impact === impactFilter)
      );
    }

    return articles;
  };

  const getRegionCount = (region: Region): number => {
    if (!data) return 0;
    if (region === 'All') return total;
    return data[region]?.length || 0;
  };

  const filteredArticles = getFilteredArticles();

  return (
    <div className={`min-h-screen ${darkMode ? 'bg-gradient-radial' : 'bg-slate-100'}`}>
      {/* Hero Section */}
      <header className="relative overflow-hidden border-b border-slate-700/50">
        <div className="absolute inset-0 overflow-hidden">
          <div className="absolute -top-1/2 -right-1/4 w-96 h-96 bg-amber-500/10 rounded-full blur-3xl"></div>
          <div className="absolute -bottom-1/2 -left-1/4 w-96 h-96 bg-blue-500/10 rounded-full blur-3xl"></div>
        </div>

        <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
          <div className="flex items-center justify-between mb-8">
            <div className="flex items-center gap-4">
              <div className="relative">
                <GlobeIcon className="w-12 h-12 text-amber-500 animate-spin-slow" />
                <div className="absolute inset-0 w-12 h-12 bg-amber-500/20 rounded-full blur-xl"></div>
              </div>
              <div>
                <h1 className="font-serif text-3xl sm:text-4xl font-bold text-slate-100">
                  Political Implication Scanner
                </h1>
                <p className="text-slate-400 mt-1">
                  AI-Powered Global Market Intelligence
                </p>
              </div>
            </div>

            {/* Dark/Light Mode Toggle */}
            <button
              onClick={() => setDarkMode(!darkMode)}
              className="p-2 rounded-lg bg-slate-800/50 border border-slate-700/50 hover:bg-slate-700/50 transition-colors"
              aria-label="Toggle dark mode"
            >
              {darkMode ? (
                <svg className="w-5 h-5 text-amber-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z" />
                </svg>
              ) : (
                <svg className="w-5 h-5 text-slate-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" />
                </svg>
              )}
            </button>
          </div>

          {/* Scan Button */}
          <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4">
            <button
              onClick={scanNews}
              disabled={loading}
              className={`
                group relative px-8 py-4 rounded-lg font-semibold text-lg
                transition-all duration-300 transform hover:scale-105
                ${loading
                  ? 'bg-slate-700 text-slate-400 cursor-not-allowed'
                  : 'bg-gradient-gold text-slate-900 hover:shadow-lg hover:shadow-amber-500/25 animate-pulse-gold'
                }
              `}
            >
              <span className="flex items-center gap-3">
                {loading ? (
                  <>
                    <LoadingSpinner />
                    <span>Analyzing Global News...</span>
                  </>
                ) : (
                  <>
                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                    </svg>
                    <span>Scan Global News</span>
                  </>
                )}
              </span>
            </button>

            {/* Stats Bar */}
            {lastScan && (
              <div className="flex flex-wrap gap-3 animate-fade-in">
                <StatsCard
                  label="Last Scan"
                  value={lastScan.toLocaleTimeString()}
                  icon={<svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>}
                />
                <StatsCard
                  label="Articles"
                  value={total}
                  icon={<svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 20H5a2 2 0 01-2-2V6a2 2 0 012-2h10a2 2 0 012 2v1m2 13a2 2 0 01-2-2V7m2 13a2 2 0 002-2V9a2 2 0 00-2-2h-2m-4-3H9M7 16h6M7 8h6v4H7V8z" /></svg>}
                />
                <StatsCard
                  label="Regions"
                  value={5}
                  icon={<svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3.055 11H5a2 2 0 012 2v1a2 2 0 002 2 2 2 0 012 2v2.945M8 3.935V5.5A2.5 2.5 0 0010.5 8h.5a2 2 0 012 2 2 2 0 104 0 2 2 0 012-2h1.064M15 20.488V18a2 2 0 012-2h3.064M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>}
                />
              </div>
            )}
          </div>
        </div>
      </header>

      {/* Error Message */}
      {error && (
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-4 flex items-center gap-3 animate-fade-in">
            <svg className="w-5 h-5 text-red-400 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <p className="text-red-400">{error}</p>
          </div>
        </div>
      )}

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Loading State */}
        {loading && !data && (
          <div className="space-y-4">
            <div className="flex items-center gap-3 mb-6">
              <LoadingSpinner />
              <span className="text-slate-400">Fetching and analyzing global news...</span>
            </div>
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {[...Array(6)].map((_, i) => (
                <SkeletonCard key={i} />
              ))}
            </div>
          </div>
        )}

        {/* Results */}
        {data && !loading && (
          <div className="space-y-6 animate-fade-in">
            {/* Region Tabs */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div className="flex flex-wrap gap-2">
                {REGIONS.map((region) => (
                  <button
                    key={region}
                    onClick={() => setActiveRegion(region)}
                    className={`
                      px-4 py-2 rounded-lg text-sm font-medium transition-all duration-200
                      ${activeRegion === region
                        ? 'bg-amber-500 text-slate-900'
                        : 'bg-slate-800/50 text-slate-400 hover:bg-slate-700/50 hover:text-slate-200 border border-slate-700/50'
                      }
                    `}
                  >
                    {region}
                    <span className={`ml-2 ${activeRegion === region ? 'text-slate-800' : 'text-slate-500'}`}>
                      ({getRegionCount(region)})
                    </span>
                  </button>
                ))}
              </div>

              {/* Impact Filter */}
              <div className="flex items-center gap-2">
                <span className="text-sm text-slate-400">Filter:</span>
                <select
                  value={impactFilter}
                  onChange={(e) => setImpactFilter(e.target.value as ImpactFilter)}
                  className="bg-slate-800/50 border border-slate-700/50 rounded-lg px-3 py-2 text-sm text-slate-200 focus:outline-none focus:ring-2 focus:ring-amber-500/50"
                >
                  {IMPACT_FILTERS.map((filter) => (
                    <option key={filter} value={filter}>{filter}</option>
                  ))}
                </select>
              </div>
            </div>

            {/* Articles Grid */}
            {filteredArticles.length > 0 ? (
              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                {filteredArticles.map((article, idx) => (
                  <NewsCard key={`${article.url}-${idx}`} article={article} index={idx} />
                ))}
              </div>
            ) : (
              <div className="text-center py-12">
                <div className="text-slate-500 text-lg">No articles found for the selected filters</div>
                <button
                  onClick={() => {
                    setActiveRegion('All');
                    setImpactFilter('All');
                  }}
                  className="mt-4 text-amber-500 hover:text-amber-400 transition-colors"
                >
                  Clear filters
                </button>
              </div>
            )}
          </div>
        )}

        {/* Empty State */}
        {!data && !loading && !error && (
          <div className="text-center py-20">
            <div className="relative inline-block mb-6">
              <GlobeIcon className="w-24 h-24 text-slate-600 animate-float" />
              <div className="absolute inset-0 bg-amber-500/10 rounded-full blur-2xl"></div>
            </div>
            <h2 className="font-serif text-2xl font-semibold text-slate-300 mb-3">
              Ready to Analyze Global Markets
            </h2>
            <p className="text-slate-500 max-w-md mx-auto mb-8">
              Click &quot;Scan Global News&quot; to fetch the latest political news and analyze their
              potential impact on commodities and stock markets.
            </p>
            <div className="flex flex-wrap justify-center gap-4 text-sm text-slate-500">
              <div className="flex items-center gap-2">
                <span className="w-2 h-2 bg-emerald-500 rounded-full"></span>
                <span>Bullish Signals</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="w-2 h-2 bg-red-500 rounded-full"></span>
                <span>Bearish Signals</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="w-2 h-2 bg-amber-500 rounded-full"></span>
                <span>Uncertain</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="w-2 h-2 bg-slate-500 rounded-full"></span>
                <span>Neutral</span>
              </div>
            </div>
          </div>
        )}
      </main>

      {/* Footer */}
      <footer className="border-t border-slate-700/50 mt-12">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <div className="flex flex-col sm:flex-row items-center justify-between gap-4 text-sm text-slate-500">
            <div className="flex items-center gap-2">
              <GlobeIcon className="w-4 h-4 text-amber-500" />
              <span>Political Implication Scanner</span>
            </div>
            <div className="flex items-center gap-4">
              <span>Powered by AI</span>
              <span>•</span>
              <span>Data from NewsAPI</span>
              <span>•</span>
              <span>Analysis by Gemini</span>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
