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

  // Group by scene index
  const scenes = new Map<number, Record<Ext, string>>();
  const re = new RegExp(`^${userId}/${timestamp}\\.scene-(\\d+)\\.`); // capture index
  for (const key of keys) {
    const m = key.match(re);
    const ext = extOf(key);
    if (!m || !ext) continue;
    const idx = Number(m[1]);
    const rec = scenes.get(idx) ?? ({} as Record<Ext, string>);
    rec[ext] = key;
    scenes.set(idx, rec);
  }

  // Keep only complete scenes (all required files present)
  const complete = [...scenes.entries()]
    .filter(([, rec]) => REQUIRED.every((r) => rec[r]))
    .sort(([a], [b]) => a - b);

  // Presign in parallel
  const result: any = {};
  await Promise.all(
    complete.map(async ([idx, rec]) => {
      const [audioUrl, videoUrl, imageUrl, subtitleUrl, assUrl] =
        await Promise.all([
          getSignedUrl(s3, new GetObjectCommand({ Bucket, Key: rec['mp3'] }), {
            expiresIn,
          }),
          getSignedUrl(s3, new GetObjectCommand({ Bucket, Key: rec['mp4'] }), {
            expiresIn,
          }),
          getSignedUrl(s3, new GetObjectCommand({ Bucket, Key: rec['jpg'] }), {
            expiresIn,
          }),
          getSignedUrl(
            s3,
            new GetObjectCommand({ Bucket, Key: rec['subtitle.json'] }),
            { expiresIn },
          ),
          getSignedUrl(s3, new GetObjectCommand({ Bucket, Key: rec['ass'] }), {
            expiresIn,
          }),
        ]);
      result[`${timestamp}.scene-${idx}`] = {
        audioUrl,
        videoUrl,
        imageUrl,
        subtitleUrl,
        assUrl,
      };
    }),
  );

  return { scenes: result, sceneCount: Object.keys(result).length };
}
