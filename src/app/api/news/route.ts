import { NextResponse } from 'next/server';

interface RawArticle {
  title: string;
  source: { name: string };
  url: string;
  publishedAt: string;
  description: string;
}

interface Article {
  title: string;
  source: string;
  url: string;
  publishedAt: string;
  description: string;
  category: string;
}

// Weighted search queries - 70% US/EU financial, 30% global political
const SEARCH_QUERIES = [
  // US/EU Financial & Economic (70% weight - ~105 articles)
  { query: 'Federal Reserve interest rates economy', pageSize: 20, category: 'US Economy' },
  { query: 'ECB European Central Bank monetary policy', pageSize: 15, category: 'EU Economy' },
  { query: 'stock market earnings quarterly results', pageSize: 15, category: 'Earnings' },
  { query: 'trade policy tariffs sanctions', pageSize: 15, category: 'Trade Policy' },
  { query: 'oil gas energy prices OPEC', pageSize: 12, category: 'Energy' },
  { query: 'tech regulation AI policy antitrust', pageSize: 12, category: 'Tech Policy' },
  { query: 'defense spending military budget NATO', pageSize: 10, category: 'Defense' },
  { query: 'banking regulation financial policy', pageSize: 6, category: 'Financial Regulation' },

  // Global Political (30% weight - ~45 articles)
  { query: 'US politics Congress legislation', pageSize: 15, category: 'US Politics' },
  { query: 'European Union policy Brussels', pageSize: 10, category: 'EU Politics' },
  { query: 'China economy trade technology', pageSize: 10, category: 'China' },
  { query: 'Middle East conflict oil geopolitics', pageSize: 5, category: 'Middle East' },
  { query: 'emerging markets Brazil India economy', pageSize: 5, category: 'Emerging Markets' },
];

export async function GET() {
  const apiKey = process.env.NEWS_API_KEY;

  if (!apiKey) {
    return NextResponse.json({ error: 'NEWS_API_KEY not configured' }, { status: 500 });
  }

  try {
    // Fetch articles from multiple queries in parallel
    const fetchPromises = SEARCH_QUERIES.map(async ({ query, pageSize, category }) => {
      try {
        const response = await fetch(
          `https://newsapi.org/v2/everything?q=${encodeURIComponent(query)}&pageSize=${pageSize}&language=en&sortBy=publishedAt&apiKey=${apiKey}`,
          { next: { revalidate: 300 } }
        );

        if (!response.ok) {
          console.error(`NewsAPI error for query "${query}": ${response.status}`);
          return [];
        }

        const data = await response.json();
        return (data.articles || []).map((article: RawArticle) => ({
          title: article.title,
          source: article.source?.name || 'Unknown',
          url: article.url,
          publishedAt: article.publishedAt,
          description: article.description || '',
          category,
        }));
      } catch (err) {
        console.error(`Error fetching query "${query}":`, err);
        return [];
      }
    });

    const results = await Promise.all(fetchPromises);

    // Flatten and deduplicate by URL
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

    // Sort by published date (newest first) and limit to 150
    const sortedArticles = allArticles
      .sort((a, b) => new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime())
      .slice(0, 150);

    // Apply region weighting by reordering
    // Americas: 40%, Europe: 40%, Asia/ME/Africa: 20%
    const americas = sortedArticles.filter(a =>
      ['US Economy', 'US Politics', 'Earnings', 'Trade Policy', 'Defense', 'Tech Policy'].includes(a.category)
    );
    const europe = sortedArticles.filter(a =>
      ['EU Economy', 'EU Politics', 'Financial Regulation'].includes(a.category)
    );
    const other = sortedArticles.filter(a =>
      ['China', 'Middle East', 'Emerging Markets', 'Energy'].includes(a.category)
    );

    // Interleave to maintain balance
    const weighted: Article[] = [];
    const maxLen = Math.max(americas.length, europe.length, other.length);

    for (let i = 0; i < maxLen; i++) {
      // Add 2 Americas, 2 Europe, 1 Other per cycle (40/40/20 ratio)
      if (americas[i * 2]) weighted.push(americas[i * 2]);
      if (americas[i * 2 + 1]) weighted.push(americas[i * 2 + 1]);
      if (europe[i * 2]) weighted.push(europe[i * 2]);
      if (europe[i * 2 + 1]) weighted.push(europe[i * 2 + 1]);
      if (other[i]) weighted.push(other[i]);
    }

    // Fill remaining with any leftover articles
    const weightedUrls = new Set(weighted.map(a => a.url));
    for (const article of sortedArticles) {
      if (!weightedUrls.has(article.url) && weighted.length < 150) {
        weighted.push(article);
      }
    }

    return NextResponse.json({
      articles: weighted.slice(0, 150),
      meta: {
        total: weighted.length,
        americas: americas.length,
        europe: europe.length,
        other: other.length,
      }
    });
  } catch (error) {
    console.error('NewsAPI fetch error:', error);
    return NextResponse.json({ error: 'Failed to fetch news' }, { status: 500 });
  }
}
