import { NextRequest, NextResponse } from 'next/server';

export async function GET(
  request: NextRequest,
  context: { params: { token: string } },
) {
  try {
    const token = context.params.token;
    if (!token) {
      return NextResponse.json({ error: 'Missing token' }, { status: 400 });
    }

    if (!process.env.API_GATEWAY_URL) {
      return NextResponse.json(
        { error: 'API Gateway URL not configured' },
        { status: 500 },
      );
    }

    const resolveUrl = `${process.env.API_GATEWAY_URL}s/${encodeURIComponent(
      token,
    )}`;
    return NextResponse.redirect(resolveUrl, 302);
  } catch (error) {
    console.error('Error proxying share link:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 },
    );
  }
}
