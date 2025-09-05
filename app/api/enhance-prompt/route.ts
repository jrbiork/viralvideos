import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import {
  verifyCognitoTokenPayload,
  type CognitoUserPayload,
} from '../../../lib/auth-utils';
import OpenAI from 'openai';
import { DEFAULT_LANGUAGE } from '../../../lib/constants';

const COGNITO_TOKEN_COOKIE_NAME = 'viral-videos-cognito-token';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export async function GET(request: NextRequest) {
  try {
    // Get the Cognito token from cookies
    const cookieStore = cookies();
    const cognitoToken = cookieStore.get(COGNITO_TOKEN_COOKIE_NAME);

    if (!cognitoToken) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Verify the Cognito token
    const decoded = await verifyCognitoTokenPayload(cognitoToken.value);
    if (!decoded) {
      return NextResponse.json({ error: 'Invalid token' }, { status: 401 });
    }

    // Get the prompt from query parameters
    const { searchParams } = new URL(request.url);
    const prompt = searchParams.get('prompt');
    const rawDuration = (searchParams.get('duration') || '30').toString();
    const language = searchParams.get('language') || DEFAULT_LANGUAGE;
    const durationLabel = `${rawDuration}s`;
    const wordLimit = 100;

    if (!prompt) {
      return NextResponse.json(
        { error: 'Prompt is required' },
        { status: 400 },
      );
    }

    // Create language-specific instructions
    const languageInstructions = {
      en: 'Write in English',
      es: 'Escribe en español',
      fr: 'Écris en français',
      de: 'Schreibe auf Deutsch',
      it: 'Scrivi in italiano',
      pt: 'Escreva em português',
      'pt-BR': 'Escreva em português brasileiro',
    };

    const langInstruction =
      languageInstructions[language as keyof typeof languageInstructions] ||
      'Write in English';

    // Create the system prompt for OpenAI
    const systemPrompt = `Elaborate on a objective idea, precise and concise description for a short video of ${rawDuration} seconds.
                      ${langInstruction}. 
                      Rules (follow strictly):
                      - Do not exceed ≤ ${wordLimit} words.
                      - Keep the language simple and concise; no flowery/poetic language.
                      - Maintain the user's intent and theme.
                      - No lists, no scene numbers, no hashtags or emojis.

                      Return only the final paragraph.`;

    // Create the user prompt
    const userPrompt = `Idea: ${prompt}\nTarget: 9:16 vertical, ${rawDuration}s.\nWrite the final paragraph now (≤${wordLimit} words).`;

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
