import { NextRequest } from 'next/server';

interface RawArticle {
  title: string;
  source: { name: string };
  url: string;
  publishedAt: string;
  description: string;
}

interface Article {
  id: string;
  title: string;
  source: string;
  url: string;
  publishedAt: string;
  description: string;
  category: string;
}

interface SectorImpact {
  sector: string;
  impact: 'Bullish' | 'Bearish' | 'Neutral' | 'Uncertain';
  reasoning: string;
  tickers: string[];
  timeframe: 'Short-term' | 'Medium-term' | 'Long-term';
  confidence: 'High' | 'Medium' | 'Low';
}

interface AnalyzedArticle extends Article {
  region: string;
  analysis: {
    summary: string;
    sectors: SectorImpact[];
    overallSentiment: 'Bullish' | 'Bearish' | 'Mixed' | 'Neutral';
    keyInsight: string;
  };
  implications: {
    gold: string;
    silver: string;
    rareMinerals: string;
    stockMarkets: string;
  };
}

const SEARCH_QUERIES = [
  { query: 'Federal Reserve ECB interest rates monetary policy', pageSize: 40, category: 'Economy' },
  { query: 'stock market earnings trade tariffs sanctions', pageSize: 35, category: 'Markets' },
  { query: 'tech regulation AI policy defense spending energy', pageSize: 35, category: 'Policy' },
  { query: 'US Congress European Union China geopolitics', pageSize: 40, category: 'Politics' },
];

export async function GET(request: NextRequest) {
  const newsApiKey = process.env.NEWS_API_KEY;
  const geminiApiKey = process.env.GEMINI_API_KEY;

  if (!newsApiKey || !geminiApiKey) {
    return new Response(
      JSON.stringify({ error: 'API keys not configured' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }

  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      const send = (event: string, data: unknown) => {
        controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
      };

      try {
        // Phase 1: Fetch all articles
        send('status', { phase: 'fetching', message: 'Fetching news articles...' });

        const fetchPromises = SEARCH_QUERIES.map(async ({ query, pageSize, category }) => {
          try {
            const response = await fetch(
              `https://newsapi.org/v2/everything?q=${encodeURIComponent(query)}&pageSize=${pageSize}&language=en&sortBy=publishedAt&apiKey=${newsApiKey}`,
              { cache: 'no-store' }
            );

            if (!response.ok) return [];

            const data = await response.json();
            return (data.articles || []).map((article: RawArticle, idx: number) => ({
              id: `${category}-${idx}-${Date.now()}`,
              title: article.title,
              source: article.source?.name || 'Unknown',
              url: article.url,
              publishedAt: article.publishedAt,
              description: article.description || '',
              category,
            }));
          } catch {
            return [];
          }
        });

        const results = await Promise.all(fetchPromises);

        // Deduplicate and prepare articles
        const seenUrls = new Set<string>();
        const allArticles: Article[] = [];

        for (const articles of results) {
          for (const article of articles) {
            if (!seenUrls.has(article.url) && article.title && article.title !== '[Removed]') {
              seenUrls.add(article.url);
              allArticles.push(article);
            }
          }
        }

        // Sort by date and limit
        const sortedArticles = allArticles
          .sort((a, b) => new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime())
          .slice(0, 100);

        // Send all articles as pending
        send('articles', {
          articles: sortedArticles,
          total: sortedArticles.length,
          status: 'pending'
        });

        // Phase 2: Analyze in small batches
        send('status', { phase: 'analyzing', message: 'Analyzing articles...', total: sortedArticles.length });

        const batchSize = 5; // Small batches for faster streaming
        let analyzedCount = 0;

        for (let i = 0; i < sortedArticles.length; i += batchSize) {
          const batch = sortedArticles.slice(i, i + batchSize);
          const batchIndices = batch.map((_, idx) => i + idx);

          try {
            const analyzedBatch = await analyzeBatch(batch, batchIndices, geminiApiKey);

            // Send each analyzed article
            for (const article of analyzedBatch) {
              analyzedCount++;
              send('analyzed', {
                article,
                progress: { current: analyzedCount, total: sortedArticles.length }
              });
            }
          } catch (err) {
            console.error('Batch analysis error:', err);
            // Send articles with default analysis on error
            for (const article of batch) {
              analyzedCount++;
              send('analyzed', {
                article: createDefaultAnalysis(article),
                progress: { current: analyzedCount, total: sortedArticles.length }
              });
            }
          }

          // Small delay between batches
          if (i + batchSize < sortedArticles.length) {
            await new Promise(resolve => setTimeout(resolve, 100));
          }
        }

        // Phase 3: Complete
        send('complete', {
          message: 'Scan complete',
          total: sortedArticles.length
        });

      } catch (error) {
        send('error', { message: error instanceof Error ? error.message : 'Scan failed' });
      } finally {
        controller.close();
      }
    }
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    },
  });
}

async function analyzeBatch(
  articles: Article[],
  indices: number[],
  apiKey: string
): Promise<AnalyzedArticle[]> {
  const prompt = `You are a senior financial analyst. Analyze these news headlines for market impact.

Articles:
${articles.map((a, i) => `${indices[i]}. "${a.title}" - ${a.source} [${a.category}]`).join('\n')}

Respond with ONLY valid JSON:
{
  "analyses": [
    {
      "index": ${indices[0]},
      "region": "Americas|Europe|Asia|Middle East|Africa",
      "summary": "Brief market impact (1 sentence)",
      "overallSentiment": "Bullish|Bearish|Mixed|Neutral",
      "keyInsight": "Key trading insight",
      "sectors": [
        {
          "sector": "Technology|Financials|Healthcare|Energy|Defense|Industrials|Consumer|Materials|Commodities",
          "impact": "Bullish|Bearish|Neutral|Uncertain",
          "reasoning": "Why this sector is affected",
          "tickers": ["AAPL", "XLK"],
          "timeframe": "Short-term|Medium-term|Long-term",
          "confidence": "High|Medium|Low"
        }
      ],
      "gold": "Bullish|Bearish|Neutral",
      "silver": "Neutral",
      "rareMinerals": "Neutral",
      "stockMarkets": "Mixed"
    }
  ]
}`;

  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.3, maxOutputTokens: 4096 },
      }),
    }
  );

  if (!response.ok) {
    throw new Error(`Gemini API error: ${response.status}`);
  }

  const data = await response.json();
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text || '';

  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    throw new Error('No JSON in response');
  }

  const parsed = JSON.parse(jsonMatch[0]);

  return articles.map((article, i) => {
    const analysis = parsed.analyses?.find((a: { index: number }) => a.index === indices[i]);

    if (analysis) {
      return {
        ...article,
        region: analysis.region || inferRegion(article.category),
        analysis: {
          summary: analysis.summary || '',
          sectors: analysis.sectors || [],
          overallSentiment: analysis.overallSentiment || 'Neutral',
          keyInsight: analysis.keyInsight || '',
        },
        implications: {
          gold: analysis.gold || 'Neutral',
          silver: analysis.silver || 'Neutral',
          rareMinerals: analysis.rareMinerals || 'Neutral',
          stockMarkets: analysis.stockMarkets || 'Neutral',
        },
      };
    }

    return createDefaultAnalysis(article);
  });
}

function createDefaultAnalysis(article: Article): AnalyzedArticle {
  return {
    ...article,
    region: inferRegion(article.category),
    analysis: {
      summary: 'Analysis pending',
      sectors: [],
      overallSentiment: 'Neutral',
      keyInsight: '',
    },
    implications: {
      gold: 'Neutral',
      silver: 'Neutral',
      rareMinerals: 'Neutral',
      stockMarkets: 'Neutral',
    },
  };
}

function inferRegion(category?: string): string {
  const regionMap: Record<string, string> = {
    'Economy': 'Americas',
    'Markets': 'Americas',
    'Policy': 'Americas',
    'Politics': 'Europe',
  };
  return regionMap[category || ''] || 'Americas';
}
