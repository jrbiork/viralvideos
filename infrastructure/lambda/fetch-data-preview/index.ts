import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import {
  S3Client,
  ListObjectsV2Command,
  GetObjectCommand,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

const s3 = new S3Client({ region: process.env.AWS_REGION || 'us-east-1' });

interface FetchScriptRequest {
  userId: string;
  timestamp?: string;
}

interface FileData {
  script?: any;
  assFiles: { [key: string]: string };
  mediaFiles: { [key: string]: string };
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
    const timestamp = event.queryStringParameters?.timestamp || null;

    console.log('🔍 Fetching files for user:', userId, 'timestamp:', timestamp);

    if (!process.env.VIDEO_PARTS_BUCKET_NAME) {
      console.log('❌ Error: VIDEO_PARTS_BUCKET_NAME is not set');
      return {
        statusCode: 500,
        body: JSON.stringify({ error: 'S3 bucket name not configured' }),
      };
    }

    if (!timestamp) {
      console.log('❌ Error: Timestamp is required');
      return {
        statusCode: 400,
        body: JSON.stringify({ error: 'Timestamp parameter is required' }),
      };
    }

    // List objects in the S3 bucket for this user and timestamp
    console.log('📋 Listing files for user:', userId, 'timestamp:', timestamp);
    const prefix = `${userId}/${timestamp}`;
    console.log('🔍 Using prefix:', prefix);

    const listCommand = new ListObjectsV2Command({
      Bucket: process.env.VIDEO_PARTS_BUCKET_NAME,
      Prefix: prefix,
    });

    const listResponse = await s3.send(listCommand);
    console.log('✅ Listed objects:', listResponse.Contents?.length || 0);

    if (!listResponse.Contents || listResponse.Contents.length === 0) {
      console.log(
        '📭 No files found for user:',
        userId,
        'timestamp:',
        timestamp,
      );
      return {
        statusCode: 200,
        body: JSON.stringify({
          script: null,
          assFiles: {},
          mediaFiles: {},
          message: 'No files found',
        }),
      };
    }

    const result: FileData = {
      assFiles: {},
      mediaFiles: {},
    };

    // Process each file
    for (const object of listResponse.Contents) {
      if (!object.Key) continue;

      const fileName = object.Key.split('/').pop() || '';
      console.log('📄 Processing file:', fileName);

      if (fileName.endsWith('.script.txt')) {
        // Fetch script content
        console.log('📄 Fetching script content:', object.Key);
        const getObjectCommand = new GetObjectCommand({
          Bucket: process.env.VIDEO_PARTS_BUCKET_NAME,
          Key: object.Key,
        });

        const scriptObject = await s3.send(getObjectCommand);
        const scriptContent = await scriptObject.Body?.transformToString();

        if (scriptContent) {
          result.script = JSON.parse(scriptContent);
          console.log(
            '✅ Successfully fetched script with',
            result.script.scenes?.length || 0,
            'scenes',
          );
        }
      } else if (fileName.endsWith('.ass')) {
        // Fetch ASS file content
        console.log('📄 Fetching ASS content:', object.Key);
        const getObjectCommand = new GetObjectCommand({
          Bucket: process.env.VIDEO_PARTS_BUCKET_NAME,
          Key: object.Key,
        });

        const assObject = await s3.send(getObjectCommand);
        const assContent = await assObject.Body?.transformToString();

        if (assContent) {
          result.assFiles[fileName] = assContent;
          console.log('✅ Successfully fetched ASS file:', fileName);
        }
      } else if (
        fileName.endsWith('.jpg') ||
        fileName.endsWith('.mp3') ||
        fileName.endsWith('.mp4')
      ) {
        // Generate signed URL for media files
        console.log('🔗 Generating signed URL for:', object.Key);
        const getObjectCommand = new GetObjectCommand({
          Bucket: process.env.VIDEO_PARTS_BUCKET_NAME,
          Key: object.Key,
        });

        const signedUrl = await getSignedUrl(s3, getObjectCommand, {
          expiresIn: 3600,
        }); // 1 hour
        result.mediaFiles[fileName] = signedUrl;
        console.log('✅ Generated signed URL for:', fileName);
      }
    }

    console.log('✅ Successfully processed all files');
    console.log('📄 Script files:', result.script ? 1 : 0);
    console.log('📄 ASS files:', Object.keys(result.assFiles).length);
    console.log('📄 Media files:', Object.keys(result.mediaFiles).length);

    return {
      statusCode: 200,
      body: JSON.stringify({
        script: result.script,
        assFiles: result.assFiles,
        mediaFiles: result.mediaFiles,
        message: `Found ${result.script ? 1 : 0} script, ${
          Object.keys(result.assFiles).length
        } ASS files, and ${Object.keys(result.mediaFiles).length} media files`,
        timestamp: timestamp,
      }),
    };
  } catch (error) {
    console.error('💥 Error in fetch data preview:', error);
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
        error: 'Failed to fetch data preview',
        details: error instanceof Error ? error.message : 'Unknown error',
      }),
    };
  }
};
