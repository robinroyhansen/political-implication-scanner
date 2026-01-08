import { NextRequest, NextResponse } from 'next/server';

export async function GET() {
  return NextResponse.json(
    { error: 'Method not allowed. Use POST with articles array.' },
    { status: 405 }
  );
}

interface Article {
  title: string;
  source: string;
  url: string;
  publishedAt: string;
  description: string;
  category?: string;
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
  // Legacy fields for backward compatibility
  implications: {
    gold: string;
    silver: string;
    rareMinerals: string;
    stockMarkets: string;
  };
}

const REGIONS = ['Americas', 'Europe', 'Asia', 'Middle East', 'Africa'] as const;

export async function POST(request: NextRequest) {
  const apiKey = process.env.GEMINI_API_KEY;

  if (!apiKey) {
    return NextResponse.json({ error: 'GEMINI_API_KEY not configured' }, { status: 500 });
  }

  try {
    const { articles } = await request.json() as { articles: Article[] };

    if (!articles || !Array.isArray(articles)) {
      return NextResponse.json({ error: 'Invalid articles data' }, { status: 400 });
    }

    // Process in batches to avoid token limits
    const batchSize = 15;
    const batches: Article[][] = [];
    for (let i = 0; i < articles.length; i += batchSize) {
      batches.push(articles.slice(i, i + batchSize));
    }

    const allAnalyses: Array<{
      index: number;
      region: string;
      summary: string;
      sectors: SectorImpact[];
      overallSentiment: string;
      keyInsight: string;
      gold: string;
      silver: string;
      rareMinerals: string;
      stockMarkets: string;
    }> = [];

    for (let batchIndex = 0; batchIndex < batches.length; batchIndex++) {
      const batch = batches[batchIndex];
      const startIndex = batchIndex * batchSize;

      const prompt = `You are a senior financial analyst specializing in macroeconomic and geopolitical analysis. Analyze these political/economic news headlines and provide detailed market impact assessments.

For each article, provide:
1. Region classification (Americas, Europe, Asia, Middle East, or Africa)
2. A brief summary of market implications (1-2 sentences)
3. Affected market sectors with detailed analysis
4. Overall market sentiment

IMPORTANT: Be specific about which sectors, companies, and indices could be affected. Think through the reasoning chain: Political Event → Economic Impact → Market Impact.

Articles to analyze:
${batch.map((a, i) => `${startIndex + i}. "${a.title}" - ${a.source}${a.category ? ` [Category: ${a.category}]` : ''}`).join('\n')}

Respond with ONLY valid JSON (no markdown, no code blocks), in this exact format:
{
  "analyses": [
    {
      "index": ${startIndex},
      "region": "Americas",
      "summary": "Brief market impact summary",
      "overallSentiment": "Bullish",
      "keyInsight": "Key trading insight or action point",
      "sectors": [
        {
          "sector": "Technology",
          "impact": "Bearish",
          "reasoning": "New regulations increase compliance costs for AI companies",
          "tickers": ["NVDA", "AMD", "GOOGL", "MSFT", "SMH"],
          "timeframe": "Medium-term",
          "confidence": "High"
        },
        {
          "sector": "Defense",
          "impact": "Bullish",
          "reasoning": "Increased defense spending benefits contractors",
          "tickers": ["LMT", "RTX", "NOC", "GD", "ITA"],
          "timeframe": "Long-term",
          "confidence": "Medium"
        }
      ],
      "gold": "Bullish",
      "silver": "Neutral",
      "rareMinerals": "Bearish",
      "stockMarkets": "Mixed"
    }
  ]
}

Sector options: Technology, Financials, Healthcare, Energy, Defense, Industrials, Consumer, Real Estate, Utilities, Materials, Communications, Commodities
Impact options: Bullish, Bearish, Neutral, Uncertain
Timeframe options: Short-term (days-weeks), Medium-term (weeks-months), Long-term (months-years)
Confidence options: High, Medium, Low

Include relevant ETFs alongside individual tickers (e.g., XLF for financials, XLE for energy, QQQ for tech).`;

      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{ parts: [{ text: prompt }] }],
            generationConfig: {
              temperature: 0.3,
              maxOutputTokens: 8192,
            },
          }),
        }
      );

      if (!response.ok) {
        const error = await response.text();
        console.error('Gemini API error:', error);
        continue; // Skip this batch but continue with others
      }

      const data = await response.json();
      const text = data.candidates?.[0]?.content?.parts?.[0]?.text || '';

      try {
        const jsonMatch = text.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          const parsed = JSON.parse(jsonMatch[0]);
          if (parsed.analyses) {
            allAnalyses.push(...parsed.analyses);
          }
        }
      } catch (parseError) {
        console.error('Failed to parse Gemini response:', text);
      }

      // Small delay between batches to avoid rate limiting
      if (batchIndex < batches.length - 1) {
        await new Promise(resolve => setTimeout(resolve, 200));
      }
    }

    const analyzedArticles: AnalyzedArticle[] = articles.map((article, index) => {
      const analysis = allAnalyses.find(a => a.index === index);

      if (analysis) {
        return {
          ...article,
          region: analysis.region || 'Americas',
          analysis: {
            summary: analysis.summary || '',
            sectors: analysis.sectors || [],
            overallSentiment: (analysis.overallSentiment as 'Bullish' | 'Bearish' | 'Mixed' | 'Neutral') || 'Neutral',
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

      // Default analysis for articles that weren't processed
      return {
        ...article,
        region: inferRegion(article.category),
        analysis: {
          summary: 'Analysis pending',
          sectors: [],
          overallSentiment: 'Neutral' as const,
          keyInsight: '',
        },
        implications: {
          gold: 'Neutral',
          silver: 'Neutral',
          rareMinerals: 'Neutral',
          stockMarkets: 'Neutral',
        },
      };
    });

    const grouped = REGIONS.reduce((acc, region) => {
      acc[region] = analyzedArticles.filter(a => a.region === region);
      return acc;
    }, {} as Record<string, AnalyzedArticle[]>);

    return NextResponse.json({ grouped, total: analyzedArticles.length });
  } catch (error) {
    console.error('Analysis error:', error);
    return NextResponse.json({ error: 'Failed to analyze articles' }, { status: 500 });
  }
}

function inferRegion(category?: string): string {
  if (!category) return 'Americas';

  const regionMap: Record<string, string> = {
    'US Economy': 'Americas',
    'US Politics': 'Americas',
    'Earnings': 'Americas',
    'Trade Policy': 'Americas',
    'Defense': 'Americas',
    'Tech Policy': 'Americas',
    'EU Economy': 'Europe',
    'EU Politics': 'Europe',
    'Financial Regulation': 'Europe',
    'China': 'Asia',
    'Middle East': 'Middle East',
    'Emerging Markets': 'Asia',
    'Energy': 'Middle East',
  };

  return regionMap[category] || 'Americas';
}
