import { NextResponse } from 'next/server';

export async function GET() {
  const apiKey = process.env.NEWS_API_KEY;

  if (!apiKey) {
    return NextResponse.json({ error: 'NEWS_API_KEY not configured' }, { status: 500 });
  }

  try {
    const response = await fetch(
      `https://newsapi.org/v2/top-headlines?category=politics&pageSize=100&language=en&apiKey=${apiKey}`,
      { next: { revalidate: 300 } }
    );

    if (!response.ok) {
      const error = await response.text();
      return NextResponse.json({ error: `NewsAPI error: ${error}` }, { status: response.status });
    }

    const data = await response.json();

    const articles = data.articles?.map((article: {
      title: string;
      source: { name: string };
      url: string;
      publishedAt: string;
      description: string;
    }) => ({
      title: article.title,
      source: article.source?.name || 'Unknown',
      url: article.url,
      publishedAt: article.publishedAt,
      description: article.description || '',
    })) || [];

    return NextResponse.json({ articles });
  } catch (error) {
    console.error('NewsAPI fetch error:', error);
    return NextResponse.json({ error: 'Failed to fetch news' }, { status: 500 });
  }
}
