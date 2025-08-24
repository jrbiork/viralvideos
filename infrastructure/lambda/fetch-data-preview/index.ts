import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import {
  S3Client,
  ListObjectsV2Command,
  GetObjectCommand,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

const s3 = new S3Client({ region: process.env.AWS_REGION || 'us-east-1' });

/**
 * Extracts subtitle text content from ASS file content
 * @param assContent - The ASS file content as string
 * @returns Array of subtitle text lines
 */
function extractSubtitleContent(assContent: string): string[] {
  const lines = assContent.split('\n');
  const subtitleLines: string[] = [];

  for (const line of lines) {
    if (line.startsWith('Dialogue:')) {
      // ASS Dialogue format: Dialogue: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
      const parts = line.split(',');
      if (parts.length >= 10) {
        // Extract the text part (everything after the 9th comma)
        const textPart = parts.slice(9).join(','); // Rejoin in case text contains commas
        // Remove ASS formatting tags and clean up the text
        const cleanText = textPart
          .replace(/\\[^\\]*\\/g, '') // Remove ASS formatting tags like {\c&H00FFFF&}
          .replace(/^\s+|\s+$/g, '') // Trim whitespace
          .replace(/\\N/g, ' '); // Replace line breaks with spaces

        if (cleanText && cleanText.length > 0) {
          subtitleLines.push(cleanText);
        }
      }
    }
  }

  return subtitleLines;
}

interface FetchScriptRequest {
  userId: string;
  timestamp?: string;
}

interface FileData {
  assFiles: { [key: string]: string };
  mediaFiles: { [key: string]: string };
  subtitleFiles: { [key: string]: string }[];
  scenesCount?: number;
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
          assFiles: {},
          mediaFiles: {},
          subtitleFiles: [],
          message: 'No files found',
        }),
      };
    }

    const result: FileData = {
      assFiles: {},
      mediaFiles: {},
      subtitleFiles: [],
    };

    // Process each file
    for (const object of listResponse.Contents) {
      if (!object.Key) continue;

      const fileName = object.Key.split('/').pop() || '';
      console.log('📄 Processing file:', fileName);

      // Create GetObjectCommand once for this object
      const getObjectCommand = new GetObjectCommand({
        Bucket: process.env.VIDEO_PARTS_BUCKET_NAME,
        Key: object.Key,
      });

      // Get script file and parse it
      if (fileName.endsWith('.script.txt')) {
        const scriptObject = await s3.send(getObjectCommand);
        const scriptContent = await scriptObject.Body?.transformToString();
        if (scriptContent) {
          const scriptData = JSON.parse(scriptContent);
          result.scenesCount = scriptData.sceneCount || 0;
        }
      }

      if (fileName.endsWith('.subtitle.json')) {
        // Fetch subtitle JSON content
        console.log('📄 Fetching subtitle JSON content:', object.Key);
        const subtitleObject = await s3.send(getObjectCommand);
        const subtitleContent = await subtitleObject.Body?.transformToString();

        if (subtitleContent) {
          const subtitleData = JSON.parse(subtitleContent);
          result.subtitleFiles.push({ [fileName]: subtitleData.fullText });
          console.log('✅ Successfully fetched subtitle JSON file:', fileName);
        }
      } else if (fileName.endsWith('.ass')) {
        // Fetch ASS file content
        console.log('📄 Fetching ASS content:', object.Key);
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
        const signedUrl = await getSignedUrl(s3, getObjectCommand, {
          expiresIn: 3600,
        }); // 1 hour
        result.mediaFiles[fileName] = signedUrl;
        console.log('✅ Generated signed URL for:', fileName);
      }
    }

    console.log('✅ Successfully processed all files');
    console.log('📄 ASS files:', Object.keys(result.assFiles).length);
    console.log('📄 Media files:', Object.keys(result.mediaFiles).length);
    console.log('📄 Subtitle JSON files:', result.subtitleFiles.length);

    return {
      statusCode: 200,
      body: JSON.stringify({
        scenesCount: result.scenesCount,
        assFiles: result.assFiles,
        mediaFiles: result.mediaFiles,
        subtitleFiles: result.subtitleFiles,
        message: `Found ${Object.keys(result.assFiles).length} ASS files, ${
          Object.keys(result.mediaFiles).length
        } media files, and ${result.subtitleFiles.length} subtitle JSON files`,
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
