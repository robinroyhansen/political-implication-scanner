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
}

interface AnalyzedArticle extends Article {
  region: string;
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

    const prompt = `Analyze these political news headlines and provide macroeconomic implications.

For each article, determine:
1. Region (one of: Americas, Europe, Asia, Middle East, Africa)
2. Impact implications for: Gold, Silver, Rare Minerals, Stock Markets

Use these impact levels: "Bullish", "Bearish", "Neutral", or "Uncertain"

Articles:
${articles.map((a, i) => `${i + 1}. "${a.title}" - ${a.source}`).join('\n')}

Respond with ONLY valid JSON in this exact format, no markdown:
{
  "analyses": [
    {
      "index": 0,
      "region": "Americas",
      "gold": "Bullish",
      "silver": "Neutral",
      "rareMinerals": "Bearish",
      "stockMarkets": "Uncertain"
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
      return NextResponse.json({ error: 'Gemini API error' }, { status: response.status });
    }

    const data = await response.json();
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text || '';

    let analyses: { index: number; region: string; gold: string; silver: string; rareMinerals: string; stockMarkets: string }[] = [];

    try {
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        analyses = parsed.analyses || [];
      }
    } catch {
      console.error('Failed to parse Gemini response:', text);
    }

    const analyzedArticles: AnalyzedArticle[] = articles.map((article, index) => {
      const analysis = analyses.find(a => a.index === index) || {
        region: REGIONS[Math.floor(Math.random() * REGIONS.length)],
        gold: 'Uncertain',
        silver: 'Uncertain',
        rareMinerals: 'Uncertain',
        stockMarkets: 'Uncertain',
      };

      return {
        ...article,
        region: analysis.region || 'Americas',
        implications: {
          gold: analysis.gold || 'Uncertain',
          silver: analysis.silver || 'Uncertain',
          rareMinerals: analysis.rareMinerals || 'Uncertain',
          stockMarkets: analysis.stockMarkets || 'Uncertain',
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
