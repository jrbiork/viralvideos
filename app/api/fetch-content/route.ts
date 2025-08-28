import { NextRequest, NextResponse } from 'next/server';

export async function POST(request: NextRequest) {
  try {
    const { url, type } = await request.json();

    if (!url) {
      return NextResponse.json({ error: 'URL is required' }, { status: 400 });
    }

    // Fetch content from the provided URL
    const response = await fetch(url);

    if (!response.ok) {
      return NextResponse.json(
        { error: `Failed to fetch content: ${response.status}` },
        { status: response.status },
      );
    }

    if (type === 'ass') {
      // For ASS files, return as text
      const content = await response.text();
      return NextResponse.json({ content });
    } else {
      // For subtitle files, return as JSON
      const content = await response.json();
      return NextResponse.json(content);
    }
  } catch (error) {
    console.error('Error in fetch-content API:', error);
    return NextResponse.json(
      {
        error: 'Internal server error',
        message: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 },
    );
  }
}
