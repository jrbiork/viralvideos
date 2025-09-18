import { NextRequest, NextResponse } from 'next/server';
import { verifySession } from '@/lib/session-utils';

function toBase64Url(input: string): string {
  return Buffer.from(input, 'utf8')
    .toString('base64')
    .replaceAll('+', '-')
    .replaceAll('/', '_')
    .replaceAll('=', '');
}

export async function POST(request: NextRequest) {
  try {
    const session = await verifySession();
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { timestamp } = await request.json();
    if (!timestamp) {
      return NextResponse.json(
        { error: 'timestamp is required' },
        { status: 400 },
      );
    }

    const userId = session.sub;
    const token = toBase64Url(`${userId}:${timestamp}`);

    const url = new URL(request.url);
    const base = `${url.protocol}//${url.host}`;
    const shortUrl = `${base}/api/s/${token}`;

    return NextResponse.json({ url: shortUrl });
  } catch (error) {
    console.error('Error creating share link:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 },
    );
  }
}
