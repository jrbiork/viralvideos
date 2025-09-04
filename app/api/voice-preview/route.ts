import { NextRequest, NextResponse } from 'next/server';
import { verifySession } from '../../../lib/session-utils';
import OpenAI from 'openai';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export async function POST(request: NextRequest) {
  try {
    // Verify session
    const session = await verifySession();

    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { voiceId, text } = await request.json();

    if (!voiceId || !text) {
      return NextResponse.json(
        { error: 'voiceId and text are required' },
        { status: 400 },
      );
    }

    // Validate voice ID is one of the supported OpenAI voices
    const supportedVoices = [
      'alloy',
      'echo',
      'fable',
      'nova',
      'onyx',
      'shimmer',
    ];
    if (!supportedVoices.includes(voiceId)) {
      return NextResponse.json({ error: 'Invalid voice ID' }, { status: 400 });
    }

    // Generate speech with OpenAI TTS
    const response = await openai.audio.speech.create({
      model: 'tts-1',
      voice: voiceId as any,
      input: text.substring(0, 500), // Limit text length for preview
      speed: 1.0,
    });

    const audioBuffer = Buffer.from(await response.arrayBuffer());

    // Return the audio as a blob
    return new NextResponse(audioBuffer, {
      status: 200,
      headers: {
        'Content-Type': 'audio/mpeg',
        'Content-Length': audioBuffer.length.toString(),
        'Cache-Control': 'no-cache',
      },
    });
  } catch (error) {
    console.error('Error generating voice preview:', error);
    return NextResponse.json(
      {
        error: 'Failed to generate voice preview',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 },
    );
  }
}
