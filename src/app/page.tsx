'use client';

import { useState } from 'react';

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
  region: string;
  implications: Implications;
}

type GroupedArticles = Record<string, AnalyzedArticle[]>;

const REGIONS = ['Americas', 'Europe', 'Asia', 'Middle East', 'Africa'];

const impactColor = (impact: string) => {
  switch (impact) {
    case 'Bullish': return 'text-green-600 bg-green-50';
    case 'Bearish': return 'text-red-600 bg-red-50';
    case 'Neutral': return 'text-gray-600 bg-gray-50';
    default: return 'text-yellow-600 bg-yellow-50';
  }
};

export default function Home() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<GroupedArticles | null>(null);
  const [total, setTotal] = useState(0);

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
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-zinc-900 p-8">
      <div className="max-w-7xl mx-auto">
        <header className="mb-8">
          <h1 className="text-3xl font-bold text-zinc-900 dark:text-white mb-2">
            Political Implication Scanner
          </h1>
          <p className="text-zinc-600 dark:text-zinc-400">
            Analyze global political news for macroeconomic implications
          </p>
        </header>

        <div className="mb-8">
          <button
            onClick={scanNews}
            disabled={loading}
            className="px-6 py-3 bg-blue-600 text-white font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {loading ? 'Scanning...' : 'Scan News'}
          </button>
        </div>

        {error && (
          <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg text-red-700">
            {error}
          </div>
        )}

        {loading && (
          <div className="text-center py-12">
            <div className="inline-block animate-spin rounded-full h-8 w-8 border-4 border-blue-600 border-t-transparent"></div>
            <p className="mt-4 text-zinc-600 dark:text-zinc-400">
              Fetching and analyzing {total || 100} articles...
            </p>
          </div>
        )}

        {data && !loading && (
          <div className="space-y-8">
            <p className="text-sm text-zinc-600 dark:text-zinc-400">
              Analyzed {total} articles
            </p>

            {REGIONS.map(region => {
              const articles = data[region] || [];
              if (articles.length === 0) return null;

              return (
                <section key={region} className="bg-white dark:bg-zinc-800 rounded-lg shadow overflow-hidden">
                  <div className="px-6 py-4 bg-zinc-100 dark:bg-zinc-700 border-b border-zinc-200 dark:border-zinc-600">
                    <h2 className="text-xl font-semibold text-zinc-900 dark:text-white">
                      {region} ({articles.length})
                    </h2>
                  </div>

                  <div className="overflow-x-auto">
                    <table className="w-full">
                      <thead>
                        <tr className="border-b border-zinc-200 dark:border-zinc-600 text-left text-sm text-zinc-600 dark:text-zinc-400">
                          <th className="px-6 py-3 font-medium">Headline</th>
                          <th className="px-6 py-3 font-medium">Source</th>
                          <th className="px-6 py-3 font-medium text-center">Gold</th>
                          <th className="px-6 py-3 font-medium text-center">Silver</th>
                          <th className="px-6 py-3 font-medium text-center">Rare Minerals</th>
                          <th className="px-6 py-3 font-medium text-center">Stocks</th>
                        </tr>
                      </thead>
                      <tbody>
                        {articles.map((article, idx) => (
                          <tr
                            key={idx}
                            className="border-b border-zinc-100 dark:border-zinc-700 hover:bg-zinc-50 dark:hover:bg-zinc-700/50"
                          >
                            <td className="px-6 py-4">
                              <a
                                href={article.url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-sm text-zinc-900 dark:text-white hover:text-blue-600 dark:hover:text-blue-400 line-clamp-2"
                              >
                                {article.title}
                              </a>
                            </td>
                            <td className="px-6 py-4 text-sm text-zinc-600 dark:text-zinc-400 whitespace-nowrap">
                              {article.source}
                            </td>
                            <td className="px-6 py-4 text-center">
                              <span className={`text-xs font-medium px-2 py-1 rounded ${impactColor(article.implications.gold)}`}>
                                {article.implications.gold}
                              </span>
                            </td>
                            <td className="px-6 py-4 text-center">
                              <span className={`text-xs font-medium px-2 py-1 rounded ${impactColor(article.implications.silver)}`}>
                                {article.implications.silver}
                              </span>
                            </td>
                            <td className="px-6 py-4 text-center">
                              <span className={`text-xs font-medium px-2 py-1 rounded ${impactColor(article.implications.rareMinerals)}`}>
                                {article.implications.rareMinerals}
                              </span>
                            </td>
                            <td className="px-6 py-4 text-center">
                              <span className={`text-xs font-medium px-2 py-1 rounded ${impactColor(article.implications.stockMarkets)}`}>
                                {article.implications.stockMarkets}
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </section>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
