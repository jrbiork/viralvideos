import { NextRequest, NextResponse } from 'next/server';
import { SESClient, SendEmailCommand } from '@aws-sdk/client-ses';

const sesClient = new SESClient({ region: process.env.AWS_REGION || 'us-east-1' });

export async function POST(request: NextRequest) {
  try {
    const { name, email, subject, message } = await request.json();

    if (!name || !message) {
      return NextResponse.json(
        { error: 'name and message are required' },
        { status: 400 },
      );
    }

    const toAddress = process.env.CONTACT_FORM_TO_EMAIL;
    const fromAddress = process.env.CONTACT_FORM_FROM_EMAIL;

    if (!toAddress || !fromAddress) {
      console.error('❌ CONTACT_FORM_TO_EMAIL or CONTACT_FORM_FROM_EMAIL not configured');
      return NextResponse.json(
        { error: 'Contact form is not configured' },
        { status: 500 },
      );
    }

    await sesClient.send(
      new SendEmailCommand({
        Source: fromAddress,
        Destination: { ToAddresses: [toAddress] },
        ReplyToAddresses: email ? [email] : undefined,
        Message: {
          Subject: {
            Data: `[StoryReel Contact] ${subject || 'No subject'} - ${name}`,
          },
          Body: {
            Text: {
              Data: `From: ${name}${email ? ` <${email}>` : ''}\nSubject: ${subject || 'No subject'}\n\n${message}`,
            },
          },
        },
      }),
    );

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('❌ Failed to send contact form email:', error);
    return NextResponse.json(
      { error: 'Failed to send message' },
      { status: 500 },
    );
  }
}
