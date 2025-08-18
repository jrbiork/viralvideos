const ffmpeg = require('fluent-ffmpeg');

/**
 * Adjusts audio duration to match target duration using FFmpeg
 * @param audioBuffer - Original audio buffer
 * @param targetDuration - Target duration in seconds
 * @returns Adjusted audio buffer
 */
export async function adjustAudioDuration(
  audioBuffer: Buffer,
  targetDuration: number,
): Promise<Buffer> {
  const fs = require('fs');
  const os = require('os');
  const path = require('path');

  // Write original audio to temp file
  const tempInputPath = path.join(
    os.tmpdir(),
    `original-audio-${Date.now()}.mp3`,
  );
  const tempOutputPath = path.join(
    os.tmpdir(),
    `adjusted-audio-${Date.now()}.mp3`,
  );

  fs.writeFileSync(tempInputPath, audioBuffer);

  try {
    // Get original audio duration
    const durationResult = await new Promise<number>((resolve, reject) => {
      ffmpeg.ffprobe(tempInputPath, (err: any, metadata: any) => {
        if (err) {
          console.error('❌ Error getting audio duration:', err);
          reject(err);
        } else {
          const duration = metadata.format.duration || 0;
          console.log(`📊 Original audio duration: ${duration}s`);
          resolve(duration);
        }
      });
    });

    console.log(
      `📊 Original audio duration: ${durationResult}s, Target: ${targetDuration}s`,
    );

    // If duration is very close to target, return original
    if (Math.abs(durationResult - targetDuration) < 0.1) {
      console.log(
        '✅ Audio duration is already close to target, no adjustment needed',
      );
      return audioBuffer;
    }

    // Calculate speed factor
    const speedFactor = durationResult / targetDuration;
    console.log(`⚡ Speed factor: ${speedFactor.toFixed(3)}`);

    // FFmpeg atempo filter has limits (0.5 to 2.0)
    // For extreme cases, we need to use multiple passes
    let finalSpeedFactor = Math.min(Math.max(speedFactor, 0.5), 2.0);
    let remainingFactor = speedFactor / finalSpeedFactor;
    let audioFilters: string[] = [];

    // Handle cases where speed factor is outside FFmpeg limits
    if (speedFactor < 0.5) {
      // Need to slow down - use multiple atempo filters
      let currentFactor = speedFactor;
      while (currentFactor < 0.5) {
        audioFilters.push('atempo=0.5');
        currentFactor = currentFactor / 0.5;
      }
      if (currentFactor > 1.0) {
        audioFilters.push(`atempo=${currentFactor}`);
      }
    } else if (speedFactor > 2.0) {
      // Need to speed up - use multiple atempo filters
      let currentFactor = speedFactor;
      while (currentFactor > 2.0) {
        audioFilters.push('atempo=2.0');
        currentFactor = currentFactor / 2.0;
      }
      if (currentFactor > 1.0) {
        audioFilters.push(`atempo=${currentFactor}`);
      }
    } else {
      // Within normal range
      audioFilters.push(`atempo=${speedFactor}`);
    }

    console.log(`🎵 Applying audio filters: ${audioFilters.join(',')}`);

    // Adjust audio speed using FFmpeg
    await new Promise<void>((resolve, reject) => {
      const ffmpegCommand = ffmpeg(tempInputPath);

      // Apply all audio filters
      audioFilters.forEach((filter) => {
        ffmpegCommand.audioFilters(filter);
      });

      ffmpegCommand
        .outputOptions(['-c:a', 'mp3', '-b:a', '128k'])
        .on('end', () => {
          console.log('✅ Audio speed adjustment completed');
          resolve();
        })
        .on('error', (err: any) => {
          console.error('❌ Audio speed adjustment error:', err);
          reject(err);
        })
        .save(tempOutputPath);
    });

    // Verify the adjusted duration
    const adjustedDuration = await new Promise<number>((resolve, reject) => {
      ffmpeg.ffprobe(tempOutputPath, (err: any, metadata: any) => {
        if (err) {
          reject(err);
        } else {
          resolve(metadata.format.duration || 0);
        }
      });
    });

    console.log(
      `✅ Adjusted audio duration: ${adjustedDuration}s (target: ${targetDuration}s)`,
    );

    // Read the adjusted audio
    const adjustedBuffer = fs.readFileSync(tempOutputPath);

    // If the adjustment didn't work well, fall back to original
    if (Math.abs(adjustedDuration - targetDuration) > 0.5) {
      console.warn(
        "⚠️ Audio adjustment didn't achieve target duration, using original",
      );
      return audioBuffer;
    }

    return adjustedBuffer;
  } catch (error) {
    console.error('❌ Error adjusting audio duration:', error);
    console.log('🔄 Falling back to original audio');
    return audioBuffer;
  } finally {
    // Clean up temp files
    try {
      if (fs.existsSync(tempInputPath)) fs.unlinkSync(tempInputPath);
      if (fs.existsSync(tempOutputPath)) fs.unlinkSync(tempOutputPath);
    } catch (error) {
      console.warn('⚠️ Could not clean up temp files:', error);
    }
  }
}

/**
 * Estimates the duration of text when spoken at natural pace
 * @param text - The text to estimate duration for
 * @returns Estimated duration in seconds
 */
export function estimateTextDuration(text: string): number {
  // Average speaking rate is about 150 words per minute (2.5 words per second)
  const words = text.split(' ').filter((word) => word.length > 0);
  const estimatedSeconds = words.length / 2.5;

  // Add some buffer for natural pauses and emphasis
  return Math.max(estimatedSeconds * 1.1, 1.0);
}

/**
 * Adjusts text to better fit target duration
 * @param text - Original text
 * @param targetDuration - Target duration in seconds
 * @returns Adjusted text that should fit better
 */
export function adjustTextForDuration(
  text: string,
  targetDuration: number,
): string {
  const currentDuration = estimateTextDuration(text);

  if (Math.abs(currentDuration - targetDuration) < 0.5) {
    return text; // Close enough
  }

  if (currentDuration > targetDuration) {
    // Text is too long, need to shorten
    const words = text.split(' ');
    const targetWordCount = Math.floor(targetDuration * 2.5 * 0.9); // 90% of target to be safe

    if (words.length <= targetWordCount) {
      return text; // Can't shorten further
    }

    // Remove words from the end while keeping meaning
    const shortenedWords = words.slice(0, targetWordCount);
    return shortenedWords.join(' ').replace(/[,.!?]+$/, '') + '.';
  } else {
    // Text is too short, could add more but keep it natural
    return text;
  }
}
