import * as fs from 'fs';

function isExecutable(p: string): boolean {
  try {
    fs.accessSync(p, fs.constants.X_OK);
    return true;
  } catch {
    return false;
  }
}

export function resolveFfmpegPath(): string {
  const candidates = [
    process.env.FFMPEG_PATH,
    '/opt/bin/ffmpeg',
    '/opt/ffmpeg',
    '/usr/bin/ffmpeg',
    '/usr/local/bin/ffmpeg',
  ].filter(Boolean) as string[];

  for (const p of candidates) {
    if (fs.existsSync(p) && isExecutable(p)) return p;
  }

  throw new Error(
    'FFmpeg binary not found. Expected at one of: ' +
      candidates.join(', ') +
      '. Ensure your Lambda layer provides ffmpeg (common path: /opt/bin/ffmpeg) or set FFMPEG_PATH.',
  );
}
