"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.adjustAudioDuration = adjustAudioDuration;
exports.estimateTextDuration = estimateTextDuration;
exports.adjustTextForDuration = adjustTextForDuration;
const ffmpeg = require('fluent-ffmpeg');
// Configure ffmpeg path for Lambda environment
if (process.env.AWS_LAMBDA_FUNCTION_NAME) {
    // In Lambda environment, ffmpeg is available in /opt/bin
    ffmpeg.setFfmpegPath('/opt/bin/ffmpeg');
    ffmpeg.setFfprobePath('/opt/bin/ffprobe');
}
/**
 * Adjusts audio duration to match target duration using FFmpeg
 * @param audioBuffer - Original audio buffer
 * @param targetDuration - Target duration in seconds
 * @returns Adjusted audio buffer
 */
async function adjustAudioDuration(audioBuffer, targetDuration) {
    const fs = require('fs');
    const os = require('os');
    const path = require('path');
    // Write original audio to temp file
    const tempInputPath = path.join(os.tmpdir(), `original-audio-${Date.now()}.mp3`);
    const tempOutputPath = path.join(os.tmpdir(), `adjusted-audio-${Date.now()}.mp3`);
    fs.writeFileSync(tempInputPath, audioBuffer);
    try {
        // Get original audio duration
        const durationResult = await new Promise((resolve, reject) => {
            ffmpeg.ffprobe(tempInputPath, (err, metadata) => {
                if (err) {
                    console.error('❌ Error getting audio duration:', err);
                    reject(err);
                }
                else {
                    const duration = metadata.format.duration || 0;
                    console.log(`📊 Original audio duration: ${duration}s`);
                    resolve(duration);
                }
            });
        });
        console.log(`📊 Original audio duration: ${durationResult}s, Target: ${targetDuration}s`);
        // If duration is very close to target, return original
        if (Math.abs(durationResult - targetDuration) < 0.1) {
            console.log('✅ Audio duration is already close to target, no adjustment needed');
            return audioBuffer;
        }
        // Calculate speed factor
        const speedFactor = durationResult / targetDuration;
        console.log(`⚡ Speed factor: ${speedFactor.toFixed(3)}`);
        // FFmpeg atempo filter has limits (0.5 to 2.0)
        // For extreme cases, we need to use multiple passes
        let finalSpeedFactor = Math.min(Math.max(speedFactor, 0.5), 2.0);
        let remainingFactor = speedFactor / finalSpeedFactor;
        let audioFilters = [];
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
        }
        else if (speedFactor > 2.0) {
            // Need to speed up - use multiple atempo filters
            let currentFactor = speedFactor;
            while (currentFactor > 2.0) {
                audioFilters.push('atempo=2.0');
                currentFactor = currentFactor / 2.0;
            }
            if (currentFactor > 1.0) {
                audioFilters.push(`atempo=${currentFactor}`);
            }
        }
        else {
            // Within normal range
            audioFilters.push(`atempo=${speedFactor}`);
        }
        console.log(`🎵 Applying audio filters: ${audioFilters.join(',')}`);
        // Adjust audio speed using FFmpeg
        await new Promise((resolve, reject) => {
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
                .on('error', (err) => {
                console.error('❌ Audio speed adjustment error:', err);
                reject(err);
            })
                .save(tempOutputPath);
        });
        // Verify the adjusted duration
        const adjustedDuration = await new Promise((resolve, reject) => {
            ffmpeg.ffprobe(tempOutputPath, (err, metadata) => {
                if (err) {
                    reject(err);
                }
                else {
                    resolve(metadata.format.duration || 0);
                }
            });
        });
        console.log(`✅ Adjusted audio duration: ${adjustedDuration}s (target: ${targetDuration}s)`);
        // Read the adjusted audio
        const adjustedBuffer = fs.readFileSync(tempOutputPath);
        // If the adjustment didn't work well, fall back to original
        if (Math.abs(adjustedDuration - targetDuration) > 0.5) {
            console.warn("⚠️ Audio adjustment didn't achieve target duration, using original");
            return audioBuffer;
        }
        return adjustedBuffer;
    }
    catch (error) {
        console.error('❌ Error adjusting audio duration:', error);
        console.log('🔄 Falling back to original audio');
        return audioBuffer;
    }
    finally {
        // Clean up temp files
        try {
            if (fs.existsSync(tempInputPath))
                fs.unlinkSync(tempInputPath);
            if (fs.existsSync(tempOutputPath))
                fs.unlinkSync(tempOutputPath);
        }
        catch (error) {
            console.warn('⚠️ Could not clean up temp files:', error);
        }
    }
}
/**
 * Estimates the duration of text when spoken at natural pace
 * @param text - The text to estimate duration for
 * @returns Estimated duration in seconds
 */
function estimateTextDuration(text) {
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
function adjustTextForDuration(text, targetDuration) {
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
    }
    else {
        // Text is too short, could add more but keep it natural
        return text;
    }
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoibmFycmF0aW9uSGVscGVyLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsibmFycmF0aW9uSGVscGVyLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiI7O0FBZUEsa0RBbUpDO0FBT0Qsb0RBT0M7QUFRRCxzREEwQkM7QUFsTkQsTUFBTSxNQUFNLEdBQUcsT0FBTyxDQUFDLGVBQWUsQ0FBQyxDQUFDO0FBRXhDLCtDQUErQztBQUMvQyxJQUFJLE9BQU8sQ0FBQyxHQUFHLENBQUMsd0JBQXdCLEVBQUUsQ0FBQztJQUN6Qyx5REFBeUQ7SUFDekQsTUFBTSxDQUFDLGFBQWEsQ0FBQyxpQkFBaUIsQ0FBQyxDQUFDO0lBQ3hDLE1BQU0sQ0FBQyxjQUFjLENBQUMsa0JBQWtCLENBQUMsQ0FBQztBQUM1QyxDQUFDO0FBRUQ7Ozs7O0dBS0c7QUFDSSxLQUFLLFVBQVUsbUJBQW1CLENBQ3ZDLFdBQW1CLEVBQ25CLGNBQXNCO0lBRXRCLE1BQU0sRUFBRSxHQUFHLE9BQU8sQ0FBQyxJQUFJLENBQUMsQ0FBQztJQUN6QixNQUFNLEVBQUUsR0FBRyxPQUFPLENBQUMsSUFBSSxDQUFDLENBQUM7SUFDekIsTUFBTSxJQUFJLEdBQUcsT0FBTyxDQUFDLE1BQU0sQ0FBQyxDQUFDO0lBRTdCLG9DQUFvQztJQUNwQyxNQUFNLGFBQWEsR0FBRyxJQUFJLENBQUMsSUFBSSxDQUM3QixFQUFFLENBQUMsTUFBTSxFQUFFLEVBQ1gsa0JBQWtCLElBQUksQ0FBQyxHQUFHLEVBQUUsTUFBTSxDQUNuQyxDQUFDO0lBQ0YsTUFBTSxjQUFjLEdBQUcsSUFBSSxDQUFDLElBQUksQ0FDOUIsRUFBRSxDQUFDLE1BQU0sRUFBRSxFQUNYLGtCQUFrQixJQUFJLENBQUMsR0FBRyxFQUFFLE1BQU0sQ0FDbkMsQ0FBQztJQUVGLEVBQUUsQ0FBQyxhQUFhLENBQUMsYUFBYSxFQUFFLFdBQVcsQ0FBQyxDQUFDO0lBRTdDLElBQUksQ0FBQztRQUNILDhCQUE4QjtRQUM5QixNQUFNLGNBQWMsR0FBRyxNQUFN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QyxHQUFHLENBQUMsQ0FBQyxPQUFPLENBQUMsVUFBVSxFQUFFLEVBQUUsQ0FBQyxHQUFHLEdBQUcsQ0FBQztJQUNoRSxDQUFDO1NBQU0sQ0FBQztRQUNOLHdEQUF3RDtRQUN4RCxPQUFPLElBQUksQ0FBQztJQUNkLENBQUM7QUFDSCxDQUFDIiwic291cmNlc0NvbnRlbnQiOlsiY29uc3QgZmZtcGVnID0gcmVxdWlyZSgnZmx1ZW50LWZmbXBlZycpO1xuXG4vLyBDb25maWd1cmUgZmZtcGVnIHBhdGggZm9yIExhbWJkYSBlbnZpcm9ubWVudFxuaWYgKHByb2Nlc3MuZW52LkFXU19MQU1CREFfRlVOQ1RJT05fTkFNRSkge1xuICAvLyBJbiBMYW1iZGEgZW52aXJvbm1lbnQsIGZmbXBlZyBpcyBhdmFpbGFibGUgaW4gL29wdC9iaW5cbiAgZmZtcGVnLnNldEZmbXBlZ1BhdGgoJy9vcHQvYmluL2ZmbXBlZycpO1xuICBmZm1wZWcuc2V0RmZwcm9iZVBhdGgoJy9vcHQvYmluL2ZmcHJvYmUnKTtcbn1cblxuLyoqXG4gKiBBZGp1c3RzIGF1ZGlvIGR1cmF0aW9uIHRvIG1hdGNoIHRhcmdldCBkdXJhdGlvbiB1c2luZyBGRm1wZWdcbiAqIEBwYXJhbSBhdWRpb0J1ZmZlciAtIE9yaWdpbmFsIGF1ZGlvIGJ1ZmZlclxuICogQHBhcmFtIHRhcmdldER1cmF0aW9uIC0gVGFyZ2V0IGR1cmF0aW9uIGluIHNlY29uZHNcbiAqIEByZXR1cm5zIEFkanVzdGVkIGF1ZGlvIGJ1ZmZlclxuICovXG5leHBvcnQgYXN5bmMgZnVuY3Rpb24gYWRqdXN0QXVkaW9EdXJhdGlvbihcbiAgYXVkaW9CdWZmZXI6IEJ1ZmZlcixcbiAgdGFyZ2V0RHVyYXRpb246IG51bWJlcixcbik6IFByb21pc2U8QnVmZmVyPiB7XG4gIGNvbnN0IGZzID0gcmVxdWlyZSgnZnMnKTtcbiAgY29uc3Qgb3MgPSByZXF1aXJlKCdvcycpO1xuICBjb25zdCBwYXRoID0gcmVxdWlyZSgncGF0aCcpO1xuXG4gIC8vIFdyaXRlIG9yaWdpbmFsIGF1ZGlvIHRvIHRlbXAgZmlsZVxuICBjb25zdCB0ZW1wSW5wdXRQYXRoID0gcGF0aC5qb2luKFxuICAgIG9zLnRtcGRpcigpLFxuICAgIGBvcmlnaW5hbC1hdWRpby0ke0RhdGUubm93KCl9Lm1wM2AsXG4gICk7XG4gIGNvbnN0IHRlbXBPdXRwdXRQYXRoID0gcGF0aC5qb2luKFxuICAgIG9zLnRtcGRpcigpLFxuICAgIGBhZGp1c3RlZC1hdWRpby0ke0RhdGUubm93KCl9Lm1wM2AsXG4gICk7XG5cbiAgZnMud3JpdGVGaWxlU3luYyh0ZW1wSW5wdXRQYXRoLCBhdWRpb0J1ZmZlcik7XG5cbiAgdHJ5IHtcbiAgICAvLyBHZXQgb3JpZ2luYWwgYXVkaW8gZHVyYXRpb25cbiAgICBjb25zdCBkdXJhdGlvblJlc3VsdCA9IGF3YWl0IG5ldyBQcm9taXNlPG51bWJlcj4oKHJlc29sdmUsIHJlamVjdCkgPT4ge1xuICAgICAgZmZtcGVnLmZmcHJvYmUodGVtcElucHV0UGF0aCwgKGVycjogYW55LCBtZXRhZGF0YTogYW55KSA9PiB7XG4gICAgICAgIGlmIChlcnIpIHtcbiAgICAgICAgICBjb25zb2xlLmVycm9yKCfinYwgRXJyb3IgZ2V0dGluZyBhdWRpbyBkdXJhdGlvbjonLCBlcnIpO1xuICAgICAgICAgIHJlamVjdChlcnIpO1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgIGNvbnN0IGR1cmF0aW9uID0gbWV0YWRhdGEuZm9ybWF0LmR1cmF0aW9uIHx8IDA7XG4gICAgICAgICAgY29uc29sZS5sb2coYPCfk4ogT3JpZ2luYWwgYXVkaW8gZHVyYXRpb246ICR7ZHVyYXRpb259c2ApO1xuICAgICAgICAgIHJlc29sdmUoZHVyYXRpb24pO1xuICAgICAgICB9XG4gICAgICB9KTtcbiAgICB9KTtcblxuICAgIGNvbnNvbGUubG9nKFxuICAgICAgYPCfk4ogT3JpZ2luYWwgYXVkaW8gZHVyYXRpb246ICR7ZHVyYXRpb25SZXN1bHR9cywgVGFyZ2V0OiAke3RhcmdldER1cmF0aW9ufXNgLFxuICAgICk7XG5cbiAgICAvLyBJZiBkdXJhdGlvbiBpcyB2ZXJ5IGNsb3NlIHRvIHRhcmdldCwgcmV0dXJuIG9yaWdpbmFsXG4gICAgaWYgKE1hdGguYWJzKGR1cmF0aW9uUmVzdWx0IC0gdGFyZ2V0RHVyYXRpb24pIDwgMC4xKSB7XG4gICAgICBjb25zb2xlLmxvZyhcbiAgICAgICAgJ+KchSBBdWRpbyBkdXJhdGlvbiBpcyBhbHJlYWR5IGNsb3NlIHRvIHRhcmdldCwgbm8gYWRqdXN0bWVudCBuZWVkZWQnLFxuICAgICAgKTtcbiAgICAgIHJldHVybiBhdWRpb0J1ZmZlcjtcbiAgICB9XG5cbiAgICAvLyBDYWxjdWxhdGUgc3BlZWQgZmFjdG9yXG4gICAgY29uc3Qgc3BlZWRGYWN0b3IgPSBkdXJhdGlvblJlc3VsdCAvIHRhcmdldER1cmF0aW9uO1xuICAgIGNvbnNvbGUubG9nKGDimqEgU3BlZWQgZmFjdG9yOiAke3NwZWVkRmFjdG9yLnRvRml4ZWQoMyl9YCk7XG5cbiAgICAvLyBGRm1wZWcgYXRlbXBvIGZpbHRlciBoYXMgbGltaXRzICgwLjUgdG8gMi4wKVxuICAgIC8vIEZvciBleHRyZW1lIGNhc2VzLCB3ZSBuZWVkIHRvIHVzZSBtdWx0aXBsZSBwYXNzZXNcbiAgICBsZXQgZmluYWxTcGVlZEZhY3RvciA9IE1hdGgubWluKE1hdGgubWF4KHNwZWVkRmFjdG9yLCAwLjUpLCAyLjApO1xuICAgIGxldCByZW1haW5pbmdGYWN0b3IgPSBzcGVlZEZhY3RvciAvIGZpbmFsU3BlZWRGYWN0b3I7XG4gICAgbGV0IGF1ZGlvRmlsdGVyczogc3RyaW5nW10gPSBbXTtcblxuICAgIC8vIEhhbmRsZSBjYXNlcyB3aGVyZSBzcGVlZCBmYWN0b3IgaXMgb3V0c2lkZSBGRm1wZWcgbGltaXRzXG4gICAgaWYgKHNwZWVkRmFjdG9yIDwgMC41KSB7XG4gICAgICAvLyBOZWVkIHRvIHNsb3cgZG93biAtIHVzZSBtdWx0aXBsZSBhdGVtcG8gZmlsdGVyc1xuICAgICAgbGV0IGN1cnJlbnRGYWN0b3IgPSBzcGVlZEZhY3RvcjtcbiAgICAgIHdoaWxlIChjdXJyZW50RmFjdG9yIDwgMC41KSB7XG4gICAgICAgIGF1ZGlvRmlsdGVycy5wdXNoKCdhdGVtcG89MC41Jyk7XG4gICAgICAgIGN1cnJlbnRGYWN0b3IgPSBjdXJyZW50RmFjdG9yIC8gMC41O1xuICAgICAgfVxuICAgICAgaWYgKGN1cnJlbnRGYWN0b3IgPiAxLjApIHtcbiAgICAgICAgYXVkaW9GaWx0ZXJzLnB1c2goYGF0ZW1wbz0ke2N1cnJlbnRGYWN0b3J9YCk7XG4gICAgICB9XG4gICAgfSBlbHNlIGlmIChzcGVlZEZhY3RvciA+IDIuMCkge1xuICAgICAgLy8gTmVlZCB0byBzcGVlZCB1cCAtIHVzZSBtdWx0aXBsZSBhdGVtcG8gZmlsdGVyc1xuICAgICAgbGV0IGN1cnJlbnRGYWN0b3IgPSBzcGVlZEZhY3RvcjtcbiAgICAgIHdoaWxlIChjdXJyZW50RmFjdG9yID4gMi4wKSB7XG4gICAgICAgIGF1ZGlvRmlsdGVycy5wdXNoKCdhdGVtcG89Mi4wJyk7XG4gICAgICAgIGN1cnJlbnRGYWN0b3IgPSBjdXJyZW50RmFjdG9yIC8gMi4wO1xuICAgICAgfVxuICAgICAgaWYgKGN1cnJlbnRGYWN0b3IgPiAxLjApIHtcbiAgICAgICAgYXVkaW9GaWx0ZXJzLnB1c2goYGF0ZW1wbz0ke2N1cnJlbnRGYWN0b3J9YCk7XG4gICAgICB9XG4gICAgfSBlbHNlIHtcbiAgICAgIC8vIFdpdGhpbiBub3JtYWwgcmFuZ2VcbiAgICAgIGF1ZGlvRmlsdGVycy5wdXNoKGBhdGVtcG89JHtzcGVlZEZhY3Rvcn1gKTtcbiAgICB9XG5cbiAgICBjb25zb2xlLmxvZyhg8J+OtSBBcHBseWluZyBhdWRpbyBmaWx0ZXJzOiAke2F1ZGlvRmlsdGVycy5qb2luKCcsJyl9YCk7XG5cbiAgICAvLyBBZGp1c3QgYXVkaW8gc3BlZWQgdXNpbmcgRkZtcGVnXG4gICAgYXdhaXQgbmV3IFByb21pc2U8dm9pZD4oKHJlc29sdmUsIHJlamVjdCkgPT4ge1xuICAgICAgY29uc3QgZmZtcGVnQ29tbWFuZCA9IGZmbXBlZyh0ZW1wSW5wdXRQYXRoKTtcblxuICAgICAgLy8gQXBwbHkgYWxsIGF1ZGlvIGZpbHRlcnNcbiAgICAgIGF1ZGlvRmlsdGVycy5mb3JFYWNoKChmaWx0ZXIpID0+IHtcbiAgICAgICAgZmZtcGVnQ29tbWFuZC5hdWRpb0ZpbHRlcnMoZmlsdGVyKTtcbiAgICAgIH0pO1xuXG4gICAgICBmZm1wZWdDb21tYW5kXG4gICAgICAgIC5vdXRwdXRPcHRpb25zKFsnLWM6YScsICdtcDMnLCAnLWI6YScsICcxMjhrJ10pXG4gICAgICAgIC5vbignZW5kJywgKCkgPT4ge1xuICAgICAgICAgIGNvbnNvbGUubG9nKCfinIUgQXVkaW8gc3BlZWQgYWRqdXN0bWVudCBjb21wbGV0ZWQnKTtcbiAgICAgICAgICByZXNvbHZlKCk7XG4gICAgICAgIH0pXG4gICAgICAgIC5vbignZXJyb3InLCAoZXJyOiBhbnkpID0+IHtcbiAgICAgICAgICBjb25zb2xlLmVycm9yKCfinYwgQXVkaW8gc3BlZWQgYWRqdXN0bWVudCBlcnJvcjonLCBlcnIpO1xuICAgICAgICAgIHJlamVjdChlcnIpO1xuICAgICAgICB9KVxuICAgICAgICAuc2F2ZSh0ZW1wT3V0cHV0UGF0aCk7XG4gICAgfSk7XG5cbiAgICAvLyBWZXJpZnkgdGhlIGFkanVzdGVkIGR1cmF0aW9uXG4gICAgY29uc3QgYWRqdXN0ZWREdXJhdGlvbiA9IGF3YWl0IG5ldyBQcm9taXNlPG51bWJlcj4oKHJlc29sdmUsIHJlamVjdCkgPT4ge1xuICAgICAgZmZtcGVnLmZmcHJvYmUodGVtcE91dHB1dFBhdGgsIChlcnI6IGFueSwgbWV0YWRhdGE6IGFueSkgPT4ge1xuICAgICAgICBpZiAoZXJyKSB7XG4gICAgICAgICAgcmVqZWN0KGVycik7XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgcmVzb2x2ZShtZXRhZGF0YS5mb3JtYXQuZHVyYXRpb24gfHwgMCk7XG4gICAgICAgIH1cbiAgICAgIH0pO1xuICAgIH0pO1xuXG4gICAgY29uc29sZS5sb2coXG4gICAgICBg4pyFIEFkanVzdGVkIGF1ZGlvIGR1cmF0aW9uOiAke2FkanVzdGVkRHVyYXRpb259cyAodGFyZ2V0OiAke3RhcmdldER1cmF0aW9ufXMpYCxcbiAgICApO1xuXG4gICAgLy8gUmVhZCB0aGUgYWRqdXN0ZWQgYXVkaW9cbiAgICBjb25zdCBhZGp1c3RlZEJ1ZmZlciA9IGZzLnJlYWRGaWxlU3luYyh0ZW1wT3V0cHV0UGF0aCk7XG5cbiAgICAvLyBJZiB0aGUgYWRqdXN0bWVudCBkaWRuJ3Qgd29yayB3ZWxsLCBmYWxsIGJhY2sgdG8gb3JpZ2luYWxcbiAgICBpZiAoTWF0aC5hYnMoYWRqdXN0ZWREdXJhdGlvbiAtIHRhcmdldER1cmF0aW9uKSA+IDAuNSkge1xuICAgICAgY29uc29sZS53YXJuKFxuICAgICAgICBcIuKaoO+4jyBBdWRpbyBhZGp1c3RtZW50IGRpZG4ndCBhY2hpZXZlIHRhcmdldCBkdXJhdGlvbiwgdXNpbmcgb3JpZ2luYWxcIixcbiAgICAgICk7XG4gICAgICByZXR1cm4gYXVkaW9CdWZmZXI7XG4gICAgfVxuXG4gICAgcmV0dXJuIGFkanVzdGVkQnVmZmVyO1xuICB9IGNhdGNoIChlcnJvcikge1xuICAgIGNvbnNvbGUuZXJyb3IoJ+KdjCBFcnJvciBhZGp1c3RpbmcgYXVkaW8gZHVyYXRpb246JywgZXJyb3IpO1xuICAgIGNvbnNvbGUubG9nKCfwn5SEIEZhbGxpbmcgYmFjayB0byBvcmlnaW5hbCBhdWRpbycpO1xuICAgIHJldHVybiBhdWRpb0J1ZmZlcjtcbiAgfSBmaW5hbGx5IHtcbiAgICAvLyBDbGVhbiB1cCB0ZW1wIGZpbGVzXG4gICAgdHJ5IHtcbiAgICAgIGlmIChmcy5leGlzdHNTeW5jKHRlbXBJbnB1dFBhdGgpKSBmcy51bmxpbmtTeW5jKHRlbXBJbnB1dFBhdGgpO1xuICAgICAgaWYgKGZzLmV4aXN0c1N5bmModGVtcE91dHB1dFBhdGgpKSBmcy51bmxpbmtTeW5jKHRlbXBPdXRwdXRQYXRoKTtcbiAgICB9IGNhdGNoIChlcnJvcikge1xuICAgICAgY29uc29sZS53YXJuKCfimqDvuI8gQ291bGQgbm90IGNsZWFuIHVwIHRlbXAgZmlsZXM6JywgZXJyb3IpO1xuICAgIH1cbiAgfVxufVxuXG4vKipcbiAqIEVzdGltYXRlcyB0aGUgZHVyYXRpb24gb2YgdGV4dCB3aGVuIHNwb2tlbiBhdCBuYXR1cmFsIHBhY2VcbiAqIEBwYXJhbSB0ZXh0IC0gVGhlIHRleHQgdG8gZXN0aW1hdGUgZHVyYXRpb24gZm9yXG4gKiBAcmV0dXJucyBFc3RpbWF0ZWQgZHVyYXRpb24gaW4gc2Vjb25kc1xuICovXG5leHBvcnQgZnVuY3Rpb24gZXN0aW1hdGVUZXh0RHVyYXRpb24odGV4dDogc3RyaW5nKTogbnVtYmVyIHtcbiAgLy8gQXZlcmFnZSBzcGVha2luZyByYXRlIGlzIGFib3V0IDE1MCB3b3JkcyBwZXIgbWludXRlICgyLjUgd29yZHMgcGVyIHNlY29uZClcbiAgY29uc3Qgd29yZHMgPSB0ZXh0LnNwbGl0KCcgJykuZmlsdGVyKCh3b3JkKSA9PiB3b3JkLmxlbmd0aCA+IDApO1xuICBjb25zdCBlc3RpbWF0ZWRTZWNvbmRzID0gd29yZHMubGVuZ3RoIC8gMi41O1xuXG4gIC8vIEFkZCBzb21lIGJ1ZmZlciBmb3IgbmF0dXJhbCBwYXVzZXMgYW5kIGVtcGhhc2lzXG4gIHJldHVybiBNYXRoLm1heChlc3RpbWF0ZWRTZWNvbmRzICogMS4xLCAxLjApO1xufVxuXG4vKipcbiAqIEFkanVzdHMgdGV4dCB0byBiZXR0ZXIgZml0IHRhcmdldCBkdXJhdGlvblxuICogQHBhcmFtIHRleHQgLSBPcmlnaW5hbCB0ZXh0XG4gKiBAcGFyYW0gdGFyZ2V0RHVyYXRpb24gLSBUYXJnZXQgZHVyYXRpb24gaW4gc2Vjb25kc1xuICogQHJldHVybnMgQWRqdXN0ZWQgdGV4dCB0aGF0IHNob3VsZCBmaXQgYmV0dGVyXG4gKi9cbmV4cG9ydCBmdW5jdGlvbiBhZGp1c3RUZXh0Rm9yRHVyYXRpb24oXG4gIHRleHQ6IHN0cmluZyxcbiAgdGFyZ2V0RHVyYXRpb246IG51bWJlcixcbik6IHN0cmluZyB7XG4gIGNvbnN0IGN1cnJlbnREdXJhdGlvbiA9IGVzdGltYXRlVGV4dER1cmF0aW9uKHRleHQpO1xuXG4gIGlmIChNYXRoLmFicyhjdXJyZW50RHVyYXRpb24gLSB0YXJnZXREdXJhdGlvbikgPCAwLjUpIHtcbiAgICByZXR1cm4gdGV4dDsgLy8gQ2xvc2UgZW5vdWdoXG4gIH1cblxuICBpZiAoY3VycmVudER1cmF0aW9uID4gdGFyZ2V0RHVyYXRpb24pIHtcbiAgICAvLyBUZXh0IGlzIHRvbyBsb25nLCBuZWVkIHRvIHNob3J0ZW5cbiAgICBjb25zdCB3b3JkcyA9IHRleHQuc3BsaXQoJyAnKTtcbiAgICBjb25zdCB0YXJnZXRXb3JkQ291bnQgPSBNYXRoLmZsb29yKHRhcmdldER1cmF0aW9uICogMi41ICogMC45KTsgLy8gOTAlIG9mIHRhcmdldCB0byBiZSBzYWZlXG5cbiAgICBpZiAod29yZHMubGVuZ3RoIDw9IHRhcmdldFdvcmRDb3VudCkge1xuICAgICAgcmV0dXJuIHRleHQ7IC8vIENhbid0IHNob3J0ZW4gZnVydGhlclxuICAgIH1cblxuICAgIC8vIFJlbW92ZSB3b3JkcyBmcm9tIHRoZSBlbmQgd2hpbGUga2VlcGluZyBtZWFuaW5nXG4gICAgY29uc3Qgc2hvcnRlbmVkV29yZHMgPSB3b3Jkcy5zbGljZSgwLCB0YXJnZXRXb3JkQ291bnQpO1xuICAgIHJldHVybiBzaG9ydGVuZWRXb3Jkcy5qb2luKCcgJykucmVwbGFjZSgvWywuIT9dKyQvLCAnJykgKyAnLic7XG4gIH0gZWxzZSB7XG4gICAgLy8gVGV4dCBpcyB0b28gc2hvcnQsIGNvdWxkIGFkZCBtb3JlIGJ1dCBrZWVwIGl0IG5hdHVyYWxcbiAgICByZXR1cm4gdGV4dDtcbiAgfVxufVxuIl19