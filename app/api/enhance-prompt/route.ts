import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { jwtVerify, createRemoteJWKSet } from 'jose';
import OpenAI from 'openai';

const COGNITO_TOKEN_COOKIE_NAME = 'viral-videos-cognito-token';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

async function verifyCognitoToken(token: string): Promise<any | null> {
  try {
    const userPoolId = process.env.NEXT_PUBLIC_COGNITO_USER_POOL_ID;
    const clientId = process.env.NEXT_PUBLIC_COGNITO_CLIENT_ID;
    const region = process.env.NEXT_PUBLIC_COGNITO_REGION || 'us-east-1';

    if (!userPoolId || !clientId) {
      throw new Error('Cognito configuration missing');
    }

    const jwksUrl = `https://cognito-idp.${region}.amazonaws.com/${userPoolId}/.well-known/jwks.json`;
    const JWKS = createRemoteJWKSet(new URL(jwksUrl));

    const { payload } = await jwtVerify(token, JWKS, {
      issuer: `https://cognito-idp.${region}.amazonaws.com/${userPoolId}`,
      algorithms: ['RS256'],
    });

    const jwtPayload = payload as any;

    // Manual audience validation
    const tokenClientId = jwtPayload.client_id || jwtPayload.aud;
    if (tokenClientId !== clientId) {
      return null;
    }

    // Additional validation
    if (jwtPayload.token_use !== 'access') {
      return null;
    }

    // Check if token is expired
    const now = Math.floor(Date.now() / 1000);
    if (jwtPayload.exp < now) {
      return null;
    }

    return jwtPayload;
  } catch (error) {
    console.error('Token verification failed:', error);
    return null;
  }
}

export async function GET(request: NextRequest) {
  try {
    // Get the Cognito token from cookies
    const cookieStore = cookies();
    const cognitoToken = cookieStore.get(COGNITO_TOKEN_COOKIE_NAME);

    if (!cognitoToken) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Verify the Cognito token
    const decoded = await verifyCognitoToken(cognitoToken.value);
    if (!decoded) {
      return NextResponse.json({ error: 'Invalid token' }, { status: 401 });
    }

    // Get the prompt from query parameters
    const { searchParams } = new URL(request.url);
    const prompt = searchParams.get('prompt');
    const rawDuration = (searchParams.get('duration') || '30').toString();
    const durationSeconds = /60/.test(rawDuration) ? 60 : 30;
    const durationLabel = `${durationSeconds}s`;
    const wordLimit = 100;

    if (!prompt) {
      return NextResponse.json(
        { error: 'Prompt is required' },
        { status: 400 },
      );
    }

    // Create the system prompt for OpenAI
    const systemPrompt = `You are a video brief writer. Expand a rough idea into a concise, production-ready description for a 9:16 vertical short of ${durationSeconds} seconds.
  
Rules (follow strictly):
- Hard limit: ≤ ${wordLimit} words, one paragraph only.
- Prefer concrete nouns and verbs; avoid flowery/poetic language.
- Specify subject, key actions, visuals, lighting/time of day, and camera style (e.g., close-up, wide, slow push).
- Keep it safe and brand-neutral: no logos, text overlays, or trademarks.
- Maintain the user's intent and theme.
- No lists, no scene numbers, no hashtags or emojis.

Return only the final paragraph.`;

    // Create the user prompt
    const userPrompt = `Idea: ${prompt}\nTarget: 9:16 vertical, ${durationSeconds}s.\nWrite the final paragraph now (≤${wordLimit} words).`;

    // Call OpenAI
    const completion = await openai.chat.completions.create({
      model: 'gpt-3.5-turbo',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      max_tokens: 200,
      temperature: 0.7,
    });

    const rawText = completion.choices[0]?.message?.content?.trim() || '';
    const enhancedPrompt = rawText
      .split(/\s+/)
      .slice(0, wordLimit)
      .join(' ')
      .trim();

    if (!enhancedPrompt) {
      return NextResponse.json(
        { error: 'Failed to generate enhanced prompt' },
        { status: 500 },
      );
    }

    return NextResponse.json({
      enhancedPrompt,
      originalPrompt: prompt,
      duration: durationLabel,
      userId: decoded.sub,
      wordCount: enhancedPrompt.split(/\s+/).length,
    });
  } catch (error) {
    console.error('Error in enhance-prompt API:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 },
    );
  }
}
