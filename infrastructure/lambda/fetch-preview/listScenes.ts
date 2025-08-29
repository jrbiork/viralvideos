import {
  ListObjectsV2Command,
  GetObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

const REQUIRED = ['mp3', 'mp4', 'jpg', 'subtitle.json', 'ass'] as const;
type Ext = (typeof REQUIRED)[number];

function extOf(key: string): Ext | null {
  if (key.endsWith('.mp3')) return 'mp3';
  if (key.endsWith('.mp4')) return 'mp4';
  if (key.endsWith('.jpg')) return 'jpg';
  if (key.endsWith('.subtitle.json')) return 'subtitle.json';
  if (key.endsWith('.ass')) return 'ass';
  return null;
}

export async function listScenes(
  s3: S3Client,
  Bucket: string,
  userId: string,
  timestamp: string,
  expiresIn = 3600,
) {
  const Prefix = `${userId}/${timestamp}.scene-`;
  let ContinuationToken: string | undefined;
  const keys: string[] = [];

  do {
    const resp = await s3.send(
      new ListObjectsV2Command({ Bucket, Prefix, ContinuationToken }),
    );
    (resp.Contents || []).forEach((o) => o.Key && keys.push(o.Key));
    ContinuationToken = resp.IsTruncated
      ? resp.NextContinuationToken
      : undefined;
  } while (ContinuationToken);

  // Group files by scene ID and collect all files for each scene
  const sceneFiles = new Map<number, { [key: string]: string }>();
  const re = new RegExp(`^${userId}/${timestamp}\\.scene-(\\d+)\\.`);

  for (const key of keys) {
    const m = key.match(re);
    if (!m) continue;
    const sceneId = Number(m[1]);
    const ext = extOf(key);
    if (!ext) continue;

    if (!sceneFiles.has(sceneId)) {
      sceneFiles.set(sceneId, {});
    }
    sceneFiles.get(sceneId)![ext] = key;
  }

  // Get all scene IDs and sort them
  const sceneIds = Array.from(sceneFiles.keys()).sort((a, b) => a - b);

  // Process each scene in parallel
  const result: any = {};
  await Promise.all(
    sceneIds.map(async (sceneId) => {
      const files = sceneFiles.get(sceneId)!;

      // Check if scene has all required files
      if (!REQUIRED.every((ext) => files[ext])) {
        return; // Skip incomplete scenes
      }

      const [audioUrl, videoUrl, imageUrl] = await Promise.all([
        getSignedUrl(s3, new GetObjectCommand({ Bucket, Key: files['mp3'] }), {
          expiresIn,
        }),
        getSignedUrl(s3, new GetObjectCommand({ Bucket, Key: files['mp4'] }), {
          expiresIn,
        }),
        getSignedUrl(s3, new GetObjectCommand({ Bucket, Key: files['jpg'] }), {
          expiresIn,
        }),
      ]);

      // Fetch inline subtitle.json content
      const subtitleObj = await s3.send(
        new GetObjectCommand({ Bucket, Key: files['subtitle.json'] }),
      );
      const subtitleText = await subtitleObj.Body?.transformToString();
      let subtitleContent: any = null;
      try {
        subtitleContent = subtitleText ? JSON.parse(subtitleText) : null;
      } catch {
        subtitleContent = null;
      }

      // Fetch inline .ass content
      const assObj = await s3.send(
        new GetObjectCommand({ Bucket, Key: files['ass'] }),
      );
      const assContent = await assObj.Body?.transformToString();

      result[`${timestamp}.scene-${sceneId}`] = {
        audioUrl,
        videoUrl,
        imageUrl,
        subtitleContent, // JSON object
        assContent, // string
      };
    }),
  );

  return { scenes: result, sceneCount: Object.keys(result).length };
}
