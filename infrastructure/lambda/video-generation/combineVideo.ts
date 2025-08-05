import {
  S3Client,
  GetObjectCommand,
  PutObjectCommand,
  ListObjectsV2Command,
} from '@aws-sdk/client-s3';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
const ffmpeg = require('fluent-ffmpeg');

const s3 = new S3Client({ region: process.env.AWS_REGION });

// Configure FFmpeg paths for Lambda environment
const ffmpegPath = '/opt/bin/ffmpeg';
const ffprobePath = '/opt/bin/ffprobe';

// Set FFmpeg paths
ffmpeg.setFfmpegPath(ffmpegPath);
ffmpeg.setFfprobePath(ffprobePath);

export interface Scene {
  description: string;
  duration: number;
  narration: string;
}

export async function combineVideoAndAudio(
  userId: string,
  timestamp: string,
  scenes?: Scene[],
): Promise<string> {
  console.log('🎬 Combining video, audio, and subtitles for user:', userId);
  console.log('🕐 Using timestamp prefix:', timestamp);

  try {
    // List all video files for the user with timestamp prefix
    console.log('📋 Listing video files from S3...');
    const videoListResponse = await s3.send(
      new ListObjectsV2Command({
        Bucket: process.env.VIDEO_PARTS_BUCKET_NAME,
        Prefix: `${userId}/${timestamp}.scene-`,
        MaxKeys: 10,
      }),
    );

    // List all audio files for the user with timestamp prefix
    console.log('📋 Listing audio files from S3...');
    const audioListResponse = await s3.send(
      new ListObjectsV2Command({
        Bucket: process.env.VIDEO_PARTS_BUCKET_NAME,
        Prefix: `${userId}/${timestamp}.scene-`,
        MaxKeys: 10,
      }),
    );

    // List all subtitle files for the user with timestamp prefix
    console.log('📋 Listing subtitle files from S3...');
    const subtitleListResponse = await s3.send(
      new ListObjectsV2Command({
        Bucket: process.env.VIDEO_PARTS_BUCKET_NAME,
        Prefix: `${userId}/${timestamp}.scene-`,
        MaxKeys: 10,
      }),
    );

    // Filter and sort video files
    const videoFiles =
      videoListResponse.Contents?.filter((obj) =>
        obj.Key?.endsWith('.mp4'),
      )?.sort((a, b) => {
        const aIndex = parseInt(a.Key?.match(/scene-(\d+)\.mp4/)?.[1] || '0');
        const bIndex = parseInt(b.Key?.match(/scene-(\d+)\.mp4/)?.[1] || '0');
        return aIndex - bIndex;
      }) || [];

    // Filter and sort audio files
    const audioFiles =
      audioListResponse.Contents?.filter((obj) =>
        obj.Key?.endsWith('.mp3'),
      )?.sort((a, b) => {
        const aIndex = parseInt(a.Key?.match(/scene-(\d+)\.mp3/)?.[1] || '0');
        const bIndex = parseInt(b.Key?.match(/scene-(\d+)\.mp3/)?.[1] || '0');
        return aIndex - bIndex;
      }) || [];

    // Filter and sort subtitle files
    const subtitleFiles =
      subtitleListResponse.Contents?.filter((obj) =>
        obj.Key?.endsWith('.ass'),
      )?.sort((a, b) => {
        const aIndex = parseInt(a.Key?.match(/scene-(\d+)\.ass/)?.[1] || '0');
        const bIndex = parseInt(b.Key?.match(/scene-(\d+)\.ass/)?.[1] || '0');
        return aIndex - bIndex;
      }) || [];

    console.log(
      `📹 Found ${videoFiles.length} video files:`,
      videoFiles.map((f) => f.Key),
    );
    console.log(
      `🎵 Found ${audioFiles.length} audio files:`,
      audioFiles.map((f) => f.Key),
    );
    console.log(
      `📝 Found ${subtitleFiles.length} subtitle files:`,
      subtitleFiles.map((f) => f.Key),
    );

    if (videoFiles.length === 0) {
      throw new Error('No video files found for user');
    }

    // Download all video clips from S3
    console.log('📥 Downloading video clips from S3...');
    const videoPaths: string[] = [];
    for (let i = 0; i < videoFiles.length; i++) {
      const videoFile = videoFiles[i];
      if (!videoFile.Key) continue;

      const videoPath = path.join(os.tmpdir(), `video-${i}.mp4`);

      console.log(`📥 Downloading ${videoFile.Key} to ${videoPath}`);
      const videoObject = await s3.send(
        new GetObjectCommand({
          Bucket: process.env.VIDEO_PARTS_BUCKET_NAME,
          Key: videoFile.Key,
        }),
      );

      const videoBuffer = Buffer.from(
        await videoObject.Body!.transformToByteArray(),
      );
      fs.writeFileSync(videoPath, videoBuffer);
      videoPaths.push(videoPath);
      console.log(`✅ Downloaded video ${i + 1}/${videoFiles.length}`);
    }

    // Download all audio files from S3
    console.log('📥 Downloading audio files from S3...');
    const audioPaths: string[] = [];
    for (let i = 0; i < audioFiles.length; i++) {
      const audioFile = audioFiles[i];
      if (!audioFile.Key) continue;

      const audioPath = path.join(os.tmpdir(), `audio-${i}.mp3`);

      console.log(`📥 Downloading ${audioFile.Key} to ${audioPath}`);
      const audioObject = await s3.send(
        new GetObjectCommand({
          Bucket: process.env.VIDEO_PARTS_BUCKET_NAME,
          Key: audioFile.Key,
        }),
      );

      const audioBuffer = Buffer.from(
        await audioObject.Body!.transformToByteArray(),
      );
      fs.writeFileSync(audioPath, audioBuffer);
      audioPaths.push(audioPath);
      console.log(`✅ Downloaded audio ${i + 1}/${audioFiles.length}`);
    }

    // Download all subtitle files from S3
    console.log('📥 Downloading subtitle files from S3...');
    const subtitlePaths: string[] = [];
    for (let i = 0; i < subtitleFiles.length; i++) {
      const subtitleFile = subtitleFiles[i];
      if (!subtitleFile.Key) continue;

      const subtitlePath = path.join(os.tmpdir(), `subtitle-${i}.ass`);

      console.log(`📥 Downloading ${subtitleFile.Key} to ${subtitlePath}`);
      const subtitleObject = await s3.send(
        new GetObjectCommand({
          Bucket: process.env.VIDEO_PARTS_BUCKET_NAME,
          Key: subtitleFile.Key,
        }),
      );

      const subtitleBuffer = Buffer.from(
        await subtitleObject.Body!.transformToByteArray(),
      );
      fs.writeFileSync(subtitlePath, subtitleBuffer);
      subtitlePaths.push(subtitlePath);
      console.log(`✅ Downloaded subtitle ${i + 1}/${subtitleFiles.length}`);
    }

    // Create a file list for FFmpeg concatenation
    const fileListPath = path.join(os.tmpdir(), 'filelist.txt');
    const fileListContent = videoPaths
      .map((videoPath) => `file '${videoPath}'`)
      .join('\n');
    fs.writeFileSync(fileListPath, fileListContent);
    console.log('📄 Created file list for concatenation');

    // Create concatenated audio file
    const concatenatedAudioPath = path.join(
      os.tmpdir(),
      'concatenated-audio.mp3',
    );
    console.log('🎵 Concatenating audio files...');

    const audioConcatCommand = ffmpeg();
    audioPaths.forEach((audioPath) => {
      audioConcatCommand.input(audioPath);
    });

    await new Promise<void>((resolve, reject) => {
      audioConcatCommand
        .on('end', () => {
          console.log('✅ Audio concatenation completed');
          resolve();
        })
        .on('error', (err: any) => {
          console.error('❌ Audio concatenation error:', err);
          reject(err);
        })
        .mergeToFile(concatenatedAudioPath, os.tmpdir());
    });

    // Create concatenated subtitle file
    const concatenatedSubtitlePath = path.join(
      os.tmpdir(),
      'concatenated-subtitles.ass',
    );
    console.log('📝 Concatenating ASS subtitle files...');

    if (subtitlePaths.length > 0) {
      console.log(
        '🔍 DEBUG: Starting subtitle concatenation for',
        subtitlePaths.length,
        'files',
      );

      let concatenatedSubtitleContent = createASSStyleHeader();
      let currentTime = 0;

      // Process each subtitle file and adjust timestamps
      for (let i = 0; i < subtitlePaths.length; i++) {
        const subtitleContent = fs.readFileSync(subtitlePaths[i], 'utf-8');
        const subtitleLines = subtitleContent.split('\n');

        // Find the Events section in ASS file
        let inEventsSection = false;
        for (const line of subtitleLines) {
          if (line.trim() === '[Events]') {
            inEventsSection = true;
            continue;
          }

          if (inEventsSection && line.startsWith('Dialogue:')) {
            // Parse ASS dialogue line
            const dialogueMatch = line.match(
              /Dialogue: (\d+),(\d+:\d+:\d+\.\d+),(\d+:\d+:\d+\.\d+),([^,]*),([^,]*),(\d+),(\d+),(\d+),([^,]*),(.*)/,
            );
            if (dialogueMatch) {
              const startTime = dialogueMatch[2];
              const endTime = dialogueMatch[3];
              const text = dialogueMatch[10];

              // The subtitle timing in each ASS file is already absolute (not relative to the scene)
              // So we don't need to add currentTime to it
              const startSeconds = parseASSTime(startTime);
              const endSeconds = parseASSTime(endTime);

              const adjustedStart = formatASSTime(startSeconds);
              const adjustedEnd = formatASSTime(endSeconds);

              concatenatedSubtitleContent += `Dialogue: 0,${adjustedStart},${adjustedEnd},Default,,0,0,0,,${text}\n`;
            }
          }
        }

        // Use scene duration instead of subtitle duration for timing
        const sceneDuration = scenes && scenes[i] ? scenes[i].duration : 5;
        currentTime += sceneDuration;
        console.log(
          `📝 Scene ${i} scene duration: ${sceneDuration}s, current time: ${currentTime}s`,
        );
      }

      fs.writeFileSync(concatenatedSubtitlePath, concatenatedSubtitleContent);
      console.log('✅ ASS subtitle concatenation completed');

      // Debug: Log the ASS file content for verification
      console.log('🔍 ASS file content preview:');
      console.log(concatenatedSubtitleContent.substring(0, 1000));
      console.log(
        '🔍 ASS file size:',
        fs.statSync(concatenatedSubtitlePath).size,
        'bytes',
      );
      console.log(
        '🔍 DEBUG: File written successfully to:',
        concatenatedSubtitlePath,
      );
      console.log(
        '🔍 DEBUG: File exists after write:',
        fs.existsSync(concatenatedSubtitlePath),
      );
      console.log(
        '📄 Concatenated ASS subtitle content preview:',
        concatenatedSubtitleContent.substring(0, 500),
      );
      console.log(
        '📁 Concatenated subtitle file path:',
        concatenatedSubtitlePath,
      );
      console.log(
        '📊 Concatenated subtitle file size:',
        fs.statSync(concatenatedSubtitlePath).size,
        'bytes',
      );

      // Debug: Check if the file is readable and has valid content
      try {
        const fileContent = fs.readFileSync(concatenatedSubtitlePath, 'utf-8');
        console.log('🔍 Full ASS file content:', fileContent);
        console.log(
          '🔍 File contains subtitle entries:',
          fileContent.includes('Dialogue:'),
        );
        console.log(
          '🔍 Number of Dialogue entries:',
          (fileContent.match(/Dialogue:/g) || []).length,
        );
      } catch (error) {
        console.error('❌ Error reading ASS file:', error);
      }
    }

    // Combine video, audio, and subtitles using FFmpeg
    const outputPath = path.join(os.tmpdir(), 'final-video.mp4');
    console.log('🎬 Combining video, audio, and subtitles with FFmpeg...');

    // Prepare video filter - no drawtext, will use subtitle file directly
    let videoFilter = ''; // No filter needed when using subtitle file

    // Log subtitle file information for debugging
    console.log('🔍 DEBUG: subtitlePaths.length:', subtitlePaths.length);
    console.log('🔍 DEBUG: subtitlePaths:', subtitlePaths);
    console.log(
      '🔍 DEBUG: concatenatedSubtitlePath:',
      concatenatedSubtitlePath,
    );
    console.log(
      '🔍 DEBUG: concatenatedSubtitlePath exists:',
      fs.existsSync(concatenatedSubtitlePath),
    );

    // Debug: Check if subtitle files exist individually
    if (subtitlePaths.length > 0) {
      console.log('🔍 DEBUG: Checking individual subtitle files:');
      subtitlePaths.forEach((path, index) => {
        console.log(
          `  Subtitle ${index}: ${path} - exists: ${fs.existsSync(path)}`,
        );
      });
    }

    if (subtitlePaths.length > 0 && fs.existsSync(concatenatedSubtitlePath)) {
      console.log('📝 Using .ass subtitle file directly');

      console.log(
        '📄 ASS subtitle content preview:',
        fs.readFileSync(concatenatedSubtitlePath, 'utf-8').substring(0, 500),
      );

      console.log('📝 Will use ASS subtitle file as input to FFmpeg');
    }

    const ffmpegCommand = ffmpeg()
      .input(fileListPath)
      .inputOptions(['-f', 'concat', '-safe', '0'])
      .input(concatenatedAudioPath);

    // Note: For ASS subtitles, we don't add them as input files
    // They are handled through the subtitle filter only
    if (subtitlePaths.length > 0 && fs.existsSync(concatenatedSubtitlePath)) {
      console.log('📝 ASS subtitle file available for overlay filter');
    }

    // Prepare output options
    const outputOptions = [
      '-c:v',
      'libx264', // Video codec
      '-pix_fmt',
      'yuv420p', // Pixel format for compatibility
      '-c:a',
      'aac', // Audio codec
      '-b:a',
      '128k', // Audio bitrate
      '-shortest', // End when shortest input ends
    ];

    // Add subtitle overlay if subtitle file is available
    if (subtitlePaths.length > 0 && fs.existsSync(concatenatedSubtitlePath)) {
      // Try different ASS filter approaches for debugging
      console.log('🔍 Debugging ASS subtitle embedding...');
      console.log('📁 ASS file path:', concatenatedSubtitlePath);
      console.log(
        '📄 ASS file exists:',
        fs.existsSync(concatenatedSubtitlePath),
      );
      console.log(
        '📏 ASS file size:',
        fs.statSync(concatenatedSubtitlePath).size,
        'bytes',
      );

      // Read and log the ASS file content for debugging
      try {
        const assContent = fs.readFileSync(concatenatedSubtitlePath, 'utf-8');
        console.log(
          '📄 ASS file content preview:',
          assContent.substring(0, 500),
        );
        console.log(
          '🔍 ASS file contains Dialogue entries:',
          (assContent.match(/Dialogue:/g) || []).length,
        );
      } catch (error) {
        console.error('❌ Error reading ASS file:', error);
      }

      // Try with ass filter and fontsdir parameter
      const subtitleFilter = `scale=1080:1920,ass=${concatenatedSubtitlePath}:fontsdir=/opt/fonts`;
      outputOptions.push('-vf', subtitleFilter);
      console.log(
        '📝 Added scale and ASS subtitle embedding filter with fontsdir:',
        subtitleFilter,
      );

      // Also try alternative approach with subtitles filter as fallback
      console.log(
        '🔄 Alternative: Will also try subtitles filter if ass fails',
      );
      const alternativeFilter = `scale=1080:1920,subtitles='${concatenatedSubtitlePath}'`;
      console.log('🔄 Alternative filter:', alternativeFilter);

      // Try both approaches - comment out one to test the other
      console.log(
        '🧪 Testing ASS filter with fontsdir, checking FFmpeg logs for errors',
      );

      // Add more verbose FFmpeg logging
      outputOptions.push('-loglevel', 'debug');
      console.log('🔍 Added debug logging to FFmpeg command');
    } else if (videoFilter) {
      outputOptions.push('-vf', videoFilter);
    }

    ffmpegCommand.outputOptions(outputOptions);

    console.log('🎬 FFmpeg command prepared');
    console.log('📝 Subtitle paths found:', subtitlePaths.length);
    console.log(
      '📁 Concatenated subtitle exists:',
      fs.existsSync(concatenatedSubtitlePath),
    );

    // Log the complete FFmpeg command for debugging
    console.log('🔧 Complete FFmpeg command structure:');
    const inputFiles = [fileListPath, concatenatedAudioPath];
    console.log('  Input files:', inputFiles);
    console.log('  Output file:', outputPath);
    console.log(
      '  Using subtitle overlay:',
      subtitlePaths.length > 0 && fs.existsSync(concatenatedSubtitlePath),
    );

    await new Promise<void>((resolve, reject) => {
      ffmpegCommand
        .output(outputPath)
        .on('start', (commandLine: string) => {
          console.log('🔧 FFmpeg command being executed:', commandLine);
        })
        .on('end', () => {
          console.log('✅ Video processing completed');
          resolve();
        })
        .on('error', (err: any) => {
          console.error('❌ Video processing error:', err);
          reject(err);
        })

        .run();
    });

    // Clean up temporary files
    console.log('🧹 Cleaning up temporary files...');
    videoPaths.forEach((videoPath) => {
      if (fs.existsSync(videoPath)) fs.unlinkSync(videoPath);
    });
    audioPaths.forEach((audioPath) => {
      if (fs.existsSync(audioPath)) fs.unlinkSync(audioPath);
    });
    subtitlePaths.forEach((subtitlePath) => {
      if (fs.existsSync(subtitlePath)) fs.unlinkSync(subtitlePath);
    });
    if (fs.existsSync(fileListPath)) fs.unlinkSync(fileListPath);
    if (fs.existsSync(concatenatedAudioPath))
      fs.unlinkSync(concatenatedAudioPath);
    if (fs.existsSync(concatenatedSubtitlePath))
      fs.unlinkSync(concatenatedSubtitlePath);
    console.log('✅ Cleanup completed');

    return outputPath;
  } catch (error) {
    console.error('❌ Error in combineVideoAndAudio:', error);
    throw error;
  }
}

function parseASSTime(assTime: string): number {
  const match = assTime.match(/^(\d+):(\d{2}):(\d{2})\.(\d{2,3})$/);
  if (!match) return 0;
  const hours = parseInt(match[1]);
  const minutes = parseInt(match[2]);
  const seconds = parseInt(match[3]);
  let fraction = match[4];
  let ms = 0;
  if (fraction.length === 2) {
    ms = parseInt(fraction) * 10; // centiseconds to ms
  } else {
    ms = parseInt(fraction); // already milliseconds
  }
  return hours * 3600 + minutes * 60 + seconds + ms / 1000;
}

function formatASSTime(seconds: number): string {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);
  const centis = Math.round((seconds % 1) * 100);
  return `${hours}:${minutes.toString().padStart(2, '0')}:${secs
    .toString()
    .padStart(2, '0')}.${centis.toString().padStart(2, '0')}`;
}

function createASSStyleHeader(): string {
  let header = '[Script Info]\n';
  header += 'Title: Test\n';
  header += 'ScriptType: v4.00+\n';
  header += 'WrapStyle: 1\n';
  header += 'ScaledBorderAndShadow: yes\n';
  header += 'YCbCr Matrix: None\n';
  header += 'PlayResX: 1080\n';
  header += 'PlayResY: 1920\n\n';

  header += '[V4+ Styles]\n';
  header +=
    'Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding\n';

  // Style with LiberationSans font, simple white text, positioned at bottom center
  header +=
    'Style: Default,LiberationSans,72,&H00FFFFFF,&H00FFFFFF,&H00000000,&H00000000,0,0,0,0,100,100,0,0,1,0,0,2,10,10,10,1\n\n';

  header += '[Events]\n';
  header +=
    'Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text\n';

  return header;
}

export async function uploadToS3(
  filePath: string,
  userId: string,
  timestamp: string,
): Promise<string> {
  try {
    console.log(`📁 Reading file: ${filePath}`);
    const fileBuffer = fs.readFileSync(filePath);
    console.log(`📊 File size: ${fileBuffer.length} bytes`);

    const videoKey = `${userId}/${timestamp}-final-video.mp4`;

    console.log(
      `☁️ Uploading to S3: ${process.env.VIDEO_BUCKET_NAME}/${videoKey}`,
    );
    await s3.send(
      new PutObjectCommand({
        Bucket: process.env.VIDEO_BUCKET_NAME,
        Key: videoKey,
        Body: fileBuffer,
        ContentType: 'video/mp4',
      }),
    );
    console.log('✅ Upload successful');

    return videoKey;
  } catch (error) {
    console.error('❌ Error uploading to S3:', error);
    throw error;
  }
}
