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
        let failedCount = 0;

        for (let i = 0; i < sortedArticles.length; i += batchSize) {
          const batch = sortedArticles.slice(i, i + batchSize);

          let analyzedBatch: AnalyzedArticle[] = [];
          let retryCount = 0;
          const maxRetries = 2;

          // Try to analyze with retry
          while (retryCount < maxRetries) {
            try {
              analyzedBatch = await analyzeBatch(batch, geminiApiKey);
              break; // Success, exit retry loop
            } catch (err) {
              retryCount++;
              console.error(`Batch analysis error (attempt ${retryCount}):`, err);
              if (retryCount < maxRetries) {
                await new Promise(resolve => setTimeout(resolve, 500)); // Wait before retry
              }
            }
          }

          // If all retries failed, create fallback analysis
          if (analyzedBatch.length === 0) {
            analyzedBatch = batch.map(article => createFallbackAnalysis(article, 'AI analysis unavailable'));
            failedCount += batch.length;
          }

          // Send each analyzed article
          for (const article of analyzedBatch) {
            analyzedCount++;
            send('analyzed', {
              article,
              progress: { current: analyzedCount, total: sortedArticles.length }
            });
          }

          // Small delay between batches to avoid rate limiting
          if (i + batchSize < sortedArticles.length) {
            await new Promise(resolve => setTimeout(resolve, 150));
          }
        }

        // Log failures
        if (failedCount > 0) {
          console.warn(`${failedCount} articles could not be analyzed`);
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
  apiKey: string
): Promise<AnalyzedArticle[]> {
  const prompt = `You are a senior financial analyst. Analyze these ${articles.length} news headlines for market impact.

Articles:
${articles.map((a, i) => `${i + 1}. "${a.title}" - ${a.source} [${a.category}]`).join('\n')}

IMPORTANT: You MUST provide analysis for ALL ${articles.length} articles. Return exactly ${articles.length} analyses in the same order.

Respond with ONLY valid JSON (no markdown):
{
  "analyses": [
    {
      "articleNum": 1,
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
    const errorText = await response.text();
    console.error('Gemini API error response:', errorText);
    throw new Error(`Gemini API error: ${response.status}`);
  }

  const data = await response.json();
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text || '';

  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    console.error('No JSON in Gemini response:', text.substring(0, 500));
    throw new Error('No JSON in response');
  }

  let parsed;
  try {
    parsed = JSON.parse(jsonMatch[0]);
  } catch (parseErr) {
    console.error('JSON parse error:', parseErr, 'Text:', jsonMatch[0].substring(0, 500));
    throw new Error('Failed to parse JSON response');
  }

  if (!parsed.analyses || !Array.isArray(parsed.analyses)) {
    console.error('Invalid response structure:', parsed);
    throw new Error('Invalid response structure');
  }

  // Map analyses back to articles by order (1-indexed articleNum)
  return articles.map((article, i) => {
    // Try to find by articleNum first, then fall back to array position
    const analysis = parsed.analyses.find((a: { articleNum?: number }) => a.articleNum === i + 1)
      || parsed.analyses[i];

    if (analysis && analysis.summary) {
      return {
        ...article,
        region: analysis.region || inferRegion(article.category),
        analysis: {
          summary: analysis.summary || '',
          sectors: Array.isArray(analysis.sectors) ? analysis.sectors : [],
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

    // If no analysis found for this article, create fallback
    return createFallbackAnalysis(article, 'Analysis incomplete');
  });
}

// Keyword-based fallback analysis when AI is unavailable
function createFallbackAnalysis(article: Article, reason: string): AnalyzedArticle {
  const title = article.title.toLowerCase();
  const description = (article.description || '').toLowerCase();
  const text = `${title} ${description}`;

  // Infer sentiment from keywords
  const bullishKeywords = ['surge', 'soar', 'rally', 'gain', 'rise', 'jump', 'boost', 'growth', 'profit', 'beat', 'record high', 'bullish', 'optimis'];
  const bearishKeywords = ['fall', 'drop', 'crash', 'plunge', 'decline', 'loss', 'cut', 'recession', 'crisis', 'fear', 'concern', 'warn', 'bearish', 'pessimis'];

  let sentiment: 'Bullish' | 'Bearish' | 'Mixed' | 'Neutral' = 'Neutral';
  const hasBullish = bullishKeywords.some(k => text.includes(k));
  const hasBearish = bearishKeywords.some(k => text.includes(k));

  if (hasBullish && hasBearish) sentiment = 'Mixed';
  else if (hasBullish) sentiment = 'Bullish';
  else if (hasBearish) sentiment = 'Bearish';

  // Infer sectors from keywords
  const sectors: SectorImpact[] = [];
  const sectorKeywords: Record<string, string[]> = {
    'Technology': ['tech', 'ai', 'software', 'chip', 'semiconductor', 'apple', 'google', 'microsoft', 'nvidia', 'meta'],
    'Financials': ['bank', 'fed', 'interest rate', 'loan', 'credit', 'jpmorgan', 'goldman', 'finance'],
    'Energy': ['oil', 'gas', 'energy', 'opec', 'crude', 'exxon', 'chevron', 'renewable', 'solar'],
    'Healthcare': ['health', 'drug', 'pharma', 'fda', 'medical', 'vaccine', 'pfizer', 'hospital'],
    'Defense': ['defense', 'military', 'pentagon', 'weapon', 'nato', 'lockheed', 'raytheon', 'war'],
    'Consumer': ['retail', 'consumer', 'walmart', 'amazon', 'spending', 'sales'],
    'Industrials': ['manufacturing', 'industrial', 'factory', 'boeing', 'caterpillar'],
    'Commodities': ['gold', 'silver', 'copper', 'metal', 'commodity', 'mining'],
  };

  for (const [sector, keywords] of Object.entries(sectorKeywords)) {
    if (keywords.some(k => text.includes(k))) {
      sectors.push({
        sector,
        impact: sentiment === 'Neutral' ? 'Uncertain' : sentiment === 'Mixed' ? 'Uncertain' : sentiment,
        reasoning: reason,
        tickers: [],
        timeframe: 'Short-term',
        confidence: 'Low',
      });
    }
  }

  // Default to at least one sector based on category
  if (sectors.length === 0) {
    const categoryMap: Record<string, string> = {
      'Economy': 'Financials',
      'Markets': 'Financials',
      'Policy': 'Industrials',
      'Politics': 'Defense',
    };
    sectors.push({
      sector: categoryMap[article.category] || 'Financials',
      impact: 'Uncertain',
      reasoning: reason,
      tickers: [],
      timeframe: 'Short-term',
      confidence: 'Low',
    });
  }

  return {
    ...article,
    region: inferRegion(article.category),
    analysis: {
      summary: reason,
      sectors,
      overallSentiment: sentiment,
      keyInsight: '',
    },
    implications: {
      gold: 'Neutral',
      silver: 'Neutral',
      rareMinerals: 'Neutral',
      stockMarkets: sentiment === 'Neutral' ? 'Neutral' : sentiment,
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
