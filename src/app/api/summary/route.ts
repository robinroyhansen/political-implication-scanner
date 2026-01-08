import { NextRequest, NextResponse } from 'next/server';

interface Article {
  title: string;
  source: string;
  region: string;
  analysis?: {
    summary?: string;
    overallSentiment?: string;
    sectors?: Array<{
      sector: string;
      impact: string;
      tickers?: string[];
    }>;
  };
}

export async function POST(request: NextRequest) {
  const apiKey = process.env.GEMINI_API_KEY;

  if (!apiKey) {
    return NextResponse.json({ error: 'GEMINI_API_KEY not configured' }, { status: 500 });
  }

  try {
    const { articles, watchlist } = await request.json() as {
      articles: Article[];
      watchlist?: string[];
    };

    if (!articles || !Array.isArray(articles) || articles.length === 0) {
      return NextResponse.json({ error: 'No articles provided' }, { status: 400 });
    }

    // Prepare article summaries for the prompt
    const topArticles = articles
      .filter(a => a.analysis?.overallSentiment === 'Bullish' || a.analysis?.overallSentiment === 'Bearish')
      .slice(0, 20);

    const articleSummaries = topArticles.map((a, i) =>
      `${i + 1}. "${a.title}" (${a.source}, ${a.region}) - ${a.analysis?.overallSentiment || 'Neutral'}${
        a.analysis?.sectors?.length ? ` - Sectors: ${a.analysis.sectors.map(s => `${s.sector}:${s.impact}`).join(', ')}` : ''
      }`
    ).join('\n');

    // Count sentiment
    const bullishCount = articles.filter(a => a.analysis?.overallSentiment === 'Bullish').length;
    const bearishCount = articles.filter(a => a.analysis?.overallSentiment === 'Bearish').length;
    const mixedCount = articles.filter(a => a.analysis?.overallSentiment === 'Mixed').length;

    // Get affected sectors
    const sectorCounts: Record<string, { bullish: number; bearish: number }> = {};
    articles.forEach(a => {
      a.analysis?.sectors?.forEach(s => {
        if (!sectorCounts[s.sector]) sectorCounts[s.sector] = { bullish: 0, bearish: 0 };
        if (s.impact === 'Bullish') sectorCounts[s.sector].bullish++;
        if (s.impact === 'Bearish') sectorCounts[s.sector].bearish++;
      });
    });

    const sectorSummary = Object.entries(sectorCounts)
      .map(([sector, counts]) => `${sector}: ${counts.bullish} bullish, ${counts.bearish} bearish`)
      .join('; ');

    // Watchlist info
    const watchlistInfo = watchlist && watchlist.length > 0
      ? `\n\nUser's Watchlist Tickers: ${watchlist.join(', ')}`
      : '';

    const prompt = `You are a senior financial analyst writing a daily market briefing. Based on today's political and economic news analysis, write a professional executive summary.

DATA:
- Total articles analyzed: ${articles.length}
- Bullish signals: ${bullishCount}
- Bearish signals: ${bearishCount}
- Mixed/Uncertain signals: ${mixedCount}
- Sector breakdown: ${sectorSummary}
${watchlistInfo}

TOP MARKET-MOVING HEADLINES:
${articleSummaries}

Write a 4-paragraph executive summary in this EXACT format:

**TOP STORIES**
[Paragraph 1: Highlight the 3 most significant market-moving stories and their immediate implications. Be specific about sectors and potential price impacts.]

**MARKET SENTIMENT**
[Paragraph 2: Analyze the overall market sentiment. Which sectors show the strongest signals? What's driving bullish vs bearish sentiment today?]

**RISKS & OPPORTUNITIES**
[Paragraph 3: Identify key risks to monitor and potential opportunities. Include specific sectors or asset classes to watch.]

${watchlist && watchlist.length > 0 ? `**WATCHLIST INSIGHTS**
[Paragraph 4: Provide specific insights for the user's watchlist tickers (${watchlist.join(', ')}). How might today's news affect these positions?]` : '**OUTLOOK**\n[Paragraph 4: Brief forward-looking statement about near-term market direction based on today\'s analysis.]'}

Keep paragraphs concise (2-3 sentences each). Use professional financial language. Be specific with sector names and potential impacts.`;

    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: {
            temperature: 0.4,
            maxOutputTokens: 1024,
          },
        }),
      }
    );

    if (!response.ok) {
      const error = await response.text();
      console.error('Gemini API error:', error);
      return NextResponse.json({ error: 'Failed to generate summary' }, { status: 500 });
    }

    const data = await response.json();
    const summary = data.candidates?.[0]?.content?.parts?.[0]?.text || '';

    return NextResponse.json({ summary });
  } catch (error) {
    console.error('Summary generation error:', error);
    return NextResponse.json({ error: 'Failed to generate summary' }, { status: 500 });
  }
}
