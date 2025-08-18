import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import {
  S3Client,
  ListObjectsV2Command,
  GetObjectCommand,
} from '@aws-sdk/client-s3';

const s3 = new S3Client({ region: process.env.AWS_REGION || 'us-east-1' });

interface FetchScriptRequest {
  userId: string;
  timestamp?: string;
}

export const handler = async (
  event: APIGatewayProxyEvent,
): Promise<APIGatewayProxyResult> => {
  try {
    let request: FetchScriptRequest;

    // Handle different event formats
    if (event.body) {
      // API Gateway format - body is a JSON string
      if (typeof event.body === 'string') {
        request = JSON.parse(event.body);
      } else {
        // Direct Lambda invocation - body is already an object
        request = event.body as FetchScriptRequest;
      }
    } else {
      // Direct Lambda invocation - payload is the entire event
      request = event as any;
    }

    // Extract user information from JWT authorizer context or request
    const userId =
      event.requestContext?.authorizer?.userId ||
      request.userId ||
      event.queryStringParameters?.userId ||
      'demo-user';

    // Extract timestamp from query parameters
    const timestamp =
      request.timestamp || event.queryStringParameters?.timestamp || null;

    console.log(
      '🔍 Fetching script for user:',
      userId,
      'timestamp:',
      timestamp,
    );

    if (!process.env.VIDEO_PARTS_BUCKET_NAME) {
      console.log('❌ Error: VIDEO_PARTS_BUCKET_NAME is not set');
      return {
        statusCode: 500,
        body: JSON.stringify({ error: 'S3 bucket name not configured' }),
      };
    }

    // List objects in the S3 bucket for this user
    console.log('📋 Listing script files for user:', userId);
    const listCommand = new ListObjectsV2Command({
      Bucket: process.env.VIDEO_PARTS_BUCKET_NAME,
      Prefix: `${userId}/`,
    });

    const listResponse = await s3.send(listCommand);
    console.log('✅ Listed objects:', listResponse.Contents?.length || 0);

    if (!listResponse.Contents || listResponse.Contents.length === 0) {
      console.log('📭 No script files found for user:', userId);
      return {
        statusCode: 200,
        body: JSON.stringify({
          script: null,
          message: 'No script files found',
        }),
      };
    }

    let targetScript = null;

    // If timestamp is provided, look for specific script file
    if (timestamp) {
      const specificScriptKey = `${userId}/${timestamp}.script.txt`;
      console.log('🔍 Looking for specific script:', specificScriptKey);

      targetScript = listResponse.Contents.find(
        (object) => object.Key === specificScriptKey,
      );

      if (!targetScript?.Key) {
        console.log('📭 Specific script not found:', specificScriptKey);
        return {
          statusCode: 200,
          body: JSON.stringify({
            script: null,
            message: 'Specific script not found',
          }),
        };
      }

      console.log('📄 Found specific script:', targetScript.Key);
    } else {
      // Fallback: Get the latest script if no timestamp specified
      const scriptFiles = listResponse.Contents.filter((object) =>
        object.Key?.endsWith('.script.txt'),
      );

      console.log('scriptFiles:', scriptFiles);

      if (scriptFiles.length === 0) {
        console.log('📭 No script files found for user:', userId);
        return {
          statusCode: 200,
          body: JSON.stringify({
            script: null,
            message: 'No script files found',
          }),
        };
      }

      targetScript = scriptFiles.sort((a, b) => {
        const aTime = a.LastModified?.getTime() || 0;
        const bTime = b.LastModified?.getTime() || 0;
        return bTime - aTime;
      })[0];

      if (!targetScript?.Key) {
        console.log('📭 No valid script file found for user:', userId);
        return {
          statusCode: 200,
          body: JSON.stringify({
            script: null,
            message: 'No valid script file found',
          }),
        };
      }

      console.log('📄 Found latest script:', targetScript.Key);
    }

    console.log('📄 Fetching script:', targetScript.Key);

    // Get the script content
    const getObjectCommand = new GetObjectCommand({
      Bucket: process.env.VIDEO_PARTS_BUCKET_NAME,
      Key: targetScript.Key,
    });

    const scriptObject = await s3.send(getObjectCommand);
    const scriptContent = await scriptObject.Body?.transformToString();

    if (!scriptContent) {
      console.log('❌ Error: Could not read script content');
      return {
        statusCode: 500,
        body: JSON.stringify({ error: 'Could not read script content' }),
      };
    }

    // Parse the script content
    const scriptData = JSON.parse(scriptContent);
    console.log(
      '✅ Successfully fetched script with',
      scriptData.scenes?.length || 0,
      'scenes',
    );

    return {
      statusCode: 200,
      body: JSON.stringify({
        script: scriptData,
        message: `Found script with ${scriptData.scenes?.length || 0} scenes`,
        timestamp: targetScript.Key.split('/').pop()?.split('.')[0] || '',
      }),
    };
  } catch (error) {
    console.error('💥 Error in fetch script:', error);
    console.error(
      'Error stack:',
      error instanceof Error ? error.stack : 'No stack trace',
    );
    console.error(
      'Error message:',
      error instanceof Error ? error.message : 'Unknown error',
    );

    return {
      statusCode: 500,
      body: JSON.stringify({
        error: 'Failed to fetch script',
        details: error instanceof Error ? error.message : 'Unknown error',
      }),
    };
  }
};
