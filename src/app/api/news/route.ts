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

// Simplified queries - fewer requests to avoid timeouts
const SEARCH_QUERIES = [
  // Financial/Economic (priority)
  { query: 'Federal Reserve ECB interest rates monetary policy', pageSize: 40, category: 'Economy' },
  { query: 'stock market earnings trade tariffs sanctions', pageSize: 35, category: 'Markets' },
  { query: 'tech regulation AI policy defense spending energy', pageSize: 35, category: 'Policy' },
  // Political
  { query: 'US Congress European Union China geopolitics', pageSize: 40, category: 'Politics' },
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

    // Sort by published date (newest first) and limit to 100
    const sortedArticles = allArticles
      .sort((a, b) => new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime())
      .slice(0, 100);

    return NextResponse.json({
      articles: sortedArticles,
      meta: {
        total: sortedArticles.length,
      }
    });
  } catch (error) {
    console.error('NewsAPI fetch error:', error);
    return NextResponse.json({ error: 'Failed to fetch news' }, { status: 500 });
  }
}
