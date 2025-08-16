import { NextRequest, NextResponse } from 'next/server';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import {
  DynamoDBDocumentClient,
  PutCommand,
  GetCommand,
  UpdateCommand,
} from '@aws-sdk/lib-dynamodb';

const client = new DynamoDBClient({
  region: process.env.AWS_REGION || 'us-east-1',
});

const docClient = DynamoDBDocumentClient.from(client);

const USERS_TABLE_NAME = process.env.USERS_TABLE_NAME || 'viral-videos-users';

interface UserData {
  userId: string;
  email: string;
  name?: string;
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    console.log('User management API received:', body);

    const { userId, email, name }: UserData = body;

    if (!userId || !email) {
      console.error('Missing required fields:', {
        userId,
        email,
        receivedBody: body,
      });
      return NextResponse.json(
        { error: 'userId and email are required' },
        { status: 400 },
      );
    }

    const now = new Date().toISOString();

    // Check if user already exists
    const getCommand = new GetCommand({
      TableName: USERS_TABLE_NAME,
      Key: {
        userId: userId,
        email: email,
      },
    });

    const existingUser = await docClient.send(getCommand);

    if (existingUser.Item) {
      // User exists, update lastLoginAt
      const updateCommand = new UpdateCommand({
        TableName: USERS_TABLE_NAME,
        Key: {
          userId: userId,
          email: email,
        },
        UpdateExpression: 'SET lastLoginAt = :lastLoginAt',
        ExpressionAttributeValues: {
          ':lastLoginAt': now,
        },
        ReturnValues: 'ALL_NEW',
      });

      const result = await docClient.send(updateCommand);

      console.log('User updated in DynamoDB:', {
        userId,
        email,
        lastLoginAt: now,
        creditsAvailable: result.Attributes?.creditsAvailable,
      });

      return NextResponse.json({
        success: true,
        user: result.Attributes,
        action: 'updated',
      });
    } else {
      // User doesn't exist, create new user
      const putCommand = new PutCommand({
        TableName: USERS_TABLE_NAME,
        Item: {
          userId: userId,
          email: email,
          createdAt: now,
          lastLoginAt: now,
          creditsAvailable: 10,
        },
      });

      await docClient.send(putCommand);

      console.log('New user created in DynamoDB:', {
        userId,
        email,
        createdAt: now,
        lastLoginAt: now,
        creditsAvailable: 10,
      });

      return NextResponse.json({
        success: true,
        user: {
          userId: userId,
          email: email,
          createdAt: now,
          lastLoginAt: now,
          creditsAvailable: 10,
        },
        action: 'created',
      });
    }
  } catch (error) {
    console.error('User management error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 },
    );
  }
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const userId = searchParams.get('userId');
    const email = searchParams.get('email');

    if (!userId || !email) {
      return NextResponse.json(
        { error: 'userId and email are required' },
        { status: 400 },
      );
    }

    const getCommand = new GetCommand({
      TableName: USERS_TABLE_NAME,
      Key: {
        userId: userId,
        email: email,
      },
    });

    const result = await docClient.send(getCommand);

    if (!result.Item) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    return NextResponse.json({
      success: true,
      user: result.Item,
    });
  } catch (error) {
    console.error('User fetch error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 },
    );
  }
}
