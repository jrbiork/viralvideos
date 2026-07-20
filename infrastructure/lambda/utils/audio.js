"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.generateNarration = generateNarration;
const client_s3_1 = require("@aws-sdk/client-s3");
const child_process_1 = require("child_process");
const util_1 = require("util");
const openai_1 = require("openai");
const ffmpeg_1 = require("./ffmpeg");
const s3 = new client_s3_1.S3Client({ region: process.env.AWS_REGION });
const openai = new openai_1.default({ apiKey: process.env.OPENAI_API_KEY });
const execFileAsync = (0, util_1.promisify)(child_process_1.execFile);
/**
 * Adjusts audio duration to match target duration using FFmpeg
 * @param audioBuffer - The original audio buffer
 * @param targetDuration - The target duration in seconds
 * @returns Promise<Buffer> - The adjusted audio buffer
 */
async function generateNarration(scenes, userId, timestamp, instructions = 'Speak in a cheerful and positive tone', voice = 'alloy', language = 'en') {
    console.log('🎤 Generating narration from scenes with word-level timestamps...');
    try {
        // Process all scenes in parallel
        const scenePromises = scenes.map(async (scene, i) => {
            console.log(`🎤 Generating narration for scene ${i}:`, scene);
            // Generate speech with standard format
            const response = await openai.audio.speech.create({
                model: 'gpt-4o-mini-tts-2025-12-15',
                voice: voice,
                instructions: `${instructions} Speak like a warm, outgoing friend sharing this in person — natural rhythm, genuine energy, relaxed pacing with real breaths, not a scripted read. Keep duration in ${scene.duration}s hard cap. Avoid long pauses.`,
                input: scene.narration,
            });
            // Check if response has duration metadata
            console.log('Response audio data:', JSON.stringify(response, null, 2));
            const originalAudioBuffer = Buffer.from(await response.arrayBuffer());
            // Save to S3 with timestamp prefix using scene.id
            const audioKey = `${userId}/${timestamp}.scene-${scene.id}.mp3`;
            await s3.send(new client_s3_1.PutObjectCommand({
                Bucket: process.env.VIDEO_PARTS_BUCKET_NAME,
                Key: audioKey,
                Body: originalAudioBuffer,
                ContentType: 'audio/mpeg',
            }));
            // Get word-level timestamps using transcription
            // Write adjusted audio buffer to temporary file for transcription
            const fs = require('fs');
            const os = require('os');
            const path = require('path');
            const tempAudioPath = path.join(os.tmpdir(), `scene-${i}-${timestamp}.mp3`);
            fs.writeFileSync(tempAudioPath, originalAudioBuffer);
            // Create file object for OpenAI API
            const audioFile = fs.createReadStream(tempAudioPath);
            const transcription = (await openai.audio.transcriptions.create({
                file: audioFile,
                model: 'whisper-1',
                response_format: 'verbose_json',
                timestamp_granularities: ['word'],
                language: language,
            }));
            // Save transcription to S3
            // const transcriptionKey = `${userId}/${timestamp}.scene-${scene.id}.transcription.json`;
            // await s3.send(
            //   new PutObjectCommand({
            //     Bucket: process.env.VIDEO_PARTS_BUCKET_NAME,
            //     Key: transcriptionKey,
            //     Body: JSON.stringify(transcription),
            //   }),
            // );
            const subtitleData = {
                scenePosition: scene.id,
                words: [],
                fullText: scene.narration, // Use original narration text instead of transcribed text
            };
            // Extract word-level timestamps from the transcription response
            if (transcription.words && Array.isArray(transcription.words)) {
                subtitleData.words = transcription.words.map((word) => ({
                    word: word.word,
                    start: word.start,
                    end: word.end,
                }));
                subtitleData.duration = transcription.usage.seconds;
                console.log(`🔍 Scene ${i}: Word timestamps extracted successfully`);
                // Word timestamps extracted successfully
            }
            else {
                console.log(`🔍 Scene ${i}: No word timestamps found, using fallback`);
                // Using fallback word timestamps
                // Fallback: create a simple word-level breakdown without precise timestamps
                const words = scene.narration
                    .split(' ')
                    .filter((word) => word.length > 0);
                const estimatedDuration = scene.duration;
                const timePerWord = estimatedDuration / words.length;
                subtitleData.words = words.map((word, index) => ({
                    word,
                    start: index * timePerWord,
                    end: (index + 1) * timePerWord,
                }));
            }
            // Animated scenes have a fixed-length Runway video — if the TTS
            // narration came out longer than that, hard-trim the audio (the
            // "Speak clearly and keep duration..." instruction above is only a
            // soft hint to the TTS model, not an enforced cap) and drop any
            // subtitle words that fall past the cut.
            if (scene.hardCapSeconds !== undefined &&
                (subtitleData.duration || 0) > scene.hardCapSeconds) {
                const cap = scene.hardCapSeconds;
                console.log(`✂️ Scene ${i}: narration (${subtitleData.duration}s) exceeds the ${cap}s animated-scene cap, trimming audio`);
                const trimmedAudioPath = path.join(os.tmpdir(), `scene-${i}-${timestamp}-trimmed.mp3`);
                const ffmpegPath = (0, ffmpeg_1.resolveFfmpegPath)();
                await execFileAsync(ffmpegPath, [
                    '-i',
                    tempAudioPath,
                    '-t',
                    cap.toString(),
                    '-y',
                    trimmedAudioPath,
                ]);
                const trimmedAudioBuffer = fs.readFileSync(trimmedAudioPath);
                await s3.send(new client_s3_1.PutObjectCommand({
                    Bucket: process.env.VIDEO_PARTS_BUCKET_NAME,
                    Key: audioKey,
                    Body: trimmedAudioBuffer,
                    ContentType: 'audio/mpeg',
                }));
                fs.unlinkSync(trimmedAudioPath);
                subtitleData.words = subtitleData.words.filter((word) => word.start < cap);
                subtitleData.duration = cap;
            }
            // Clean up temporary file
            fs.unlinkSync(tempAudioPath);
            // Save complete subtitle data to S3 (including fullText)
            const subtitleKey = `${userId}/${timestamp}.scene-${scene.id}.subtitle.json`;
            await s3.send(new client_s3_1.PutObjectCommand({
                Bucket: process.env.VIDEO_PARTS_BUCKET_NAME,
                Key: subtitleKey,
                Body: JSON.stringify(subtitleData),
            }));
            return {
                audioKey,
                subtitleData,
            };
        });
        // Wait for all scenes to complete
        const results = await Promise.all(scenePromises);
        // Extract results in the correct order
        const audioKeys = results.map((result) => result.audioKey);
        const subtitles = results.map((result) => result.subtitleData);
        console.log(`✅ Generated narration for ${results.length} scenes in parallel`);
        return { subtitles };
    }
    catch (error) {
        console.error('❌ Error in generateNarration:', error);
        throw error;
    }
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiYXVkaW8uanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyJhdWRpby50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiOztBQWlEQSw4Q0EwTEM7QUEzT0Qsa0RBQWdFO0FBQ2hFLGlEQUF5QztBQUN6QywrQkFBaUM7QUFFakMsbUNBQTRCO0FBRzVCLHFDQUE2QztBQUU3QyxNQUFNLEVBQUUsR0FBRyxJQUFJLG9CQUFRLENBQUMsRUFBRSxNQUFNLEVBQUUsT0FBTyxDQUFDLEdBQUcsQ0FBQyxVQUFVLEVBQUUsQ0FBQyxDQUFDO0FBQzVELE1BQU0sTUFBTSxHQUFHLElBQUksZ0JBQU0sQ0FBQyxFQUFFLE1BQU0sRUFBRSxPQUFPLENBQUMsR0FBRyxDQUFDLGNBQWMsRUFBRSxDQUFDLENBQUM7QUFDbEUsTUFBTSxhQUFhLEdBQUcsSUFBQSxnQkFBUyxFQUFDLHdCQUFRLENBQUMsQ0FBQztBQStCMUM7Ozs7O0dBS0c7QUFFSSxLQUFLLFVBQVUsaUJBQWlCLENBQ3JDLE1BQWUsRUFDZixNQUFjLEVBQ2QsU0FBaUIsRUFDakIsZUFBdUIsdUNBQXVDLEVBQzlELFFBQWdCLE9BQU8sRUFDdkIsV0FBbUIsSUFBSTtJQUV2QixPQUFPLENBQUMsR0FBRyxDQUNULG1FQUFtRSxDQUNwRSxDQUFDO0lBQ0YsSUFBSSxDQUFDO1FBQ0gsaUNBQWlDO1FBQ2pDLE1BQU0sYUFBYSxHQUFHLE1BQU0sQ0FBQyxHQUFHLENBQUMsS0FBSyxFQUFFLEtBQUssRUFBRSxDQUFDLEVBQUUsRUFBRTtZQUNsRCxPQUFPLENBQUMsR0FBRyxDQUFDLHFDQUFxQyxDQUFDLEdBQUcsRUFBRSxLQUFLLENBQUMsQ0FBQztZQUU5RCx1Q0FBdUM7WUFDdkMsTUFBTSxRQUFRLEdBQUcsTUFBTSxNQUFNLENBQUMsS0FBSyxDQUFDLE1BQU0sQ0FBQyxNQUFNLENBQUM7Z0JBQ2hELEtBQUssRUFBRSw0QkFBNEI7Z0JBQ25DLEtBQUssRUFBRSxLQUFLO2dCQUNaLFlBQVksRUFBRSxHQUFHLFlBQVksd0tBQXdL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LHVCQUF1QjtnQkFDM0MsR0FBRyxFQUFFLFdBQVc7Z0JBQ2hCLElBQUksRUFBRSxJQUFJLENBQUMsU0FBUyxDQUFDLFlBQVksQ0FBQzthQUNuQyxDQUFDLENBQ0gsQ0FBQztZQUVGLE9BQU87Z0JBQ0wsUUFBUTtnQkFDUixZQUFZO2FBQ2IsQ0FBQztRQUNKLENBQUMsQ0FBQyxDQUFDO1FBRUgsa0NBQWtDO1FBQ2xDLE1BQU0sT0FBTyxHQUFHLE1BQU0sT0FBTyxDQUFDLEdBQUcsQ0FBQyxhQUFhLENBQUMsQ0FBQztRQUVqRCx1Q0FBdUM7UUFDdkMsTUFBTSxTQUFTLEdBQUcsT0FBTyxDQUFDLEdBQUcsQ0FBQyxDQUFDLE1BQU0sRUFBRSxFQUFFLENBQUMsTUFBTSxDQUFDLFFBQVEsQ0FBQyxDQUFDO1FBQzNELE1BQU0sU0FBUyxHQUFHLE9BQU8sQ0FBQyxHQUFHLENBQUMsQ0FBQyxNQUFNLEVBQUUsRUFBRSxDQUFDLE1BQU0sQ0FBQyxZQUFZLENBQUMsQ0FBQztRQUUvRCxPQUFPLENBQUMsR0FBRyxDQUNULDZCQUE2QixPQUFPLENBQUMsTUFBTSxxQkFBcUIsQ0FDakUsQ0FBQztRQUNGLE9BQU8sRUFBRSxTQUFTLEVBQUUsQ0FBQztJQUN2QixDQUFDO0lBQUMsT0FBTyxLQUFLLEVBQUUsQ0FBQztRQUNmLE9BQU8sQ0FBQyxLQUFLLENBQUMsK0JBQStCLEVBQUUsS0FBSyxDQUFDLENBQUM7UUFDdEQsTUFBTSxLQUFLLENBQUM7SUFDZCxDQUFDO0FBQ0gsQ0FBQyIsInNvdXJjZXNDb250ZW50IjpbImltcG9ydCB7IFMzQ2xpZW50LCBQdXRPYmplY3RDb21tYW5kIH0gZnJvbSAnQGF3cy1zZGsvY2xpZW50LXMzJztcbmltcG9ydCB7IGV4ZWNGaWxlIH0gZnJvbSAnY2hpbGRfcHJvY2Vzcyc7XG5pbXBvcnQgeyBwcm9taXNpZnkgfSBmcm9tICd1dGlsJztcblxuaW1wb3J0IE9wZW5BSSBmcm9tICdvcGVuYWknO1xuXG5pbXBvcnQgeyBTY2VuZSB9IGZyb20gJy4vc2NyaXB0JztcbmltcG9ydCB7IHJlc29sdmVGZm1wZWdQYXRoIH0gZnJvbSAnLi9mZm1wZWcnO1xuXG5jb25zdCBzMyA9IG5ldyBTM0NsaWVudCh7IHJlZ2lvbjogcHJvY2Vzcy5lbnYuQVdTX1JFR0lPTiB9KTtcbmNvbnN0IG9wZW5haSA9IG5ldyBPcGVuQUkoeyBhcGlLZXk6IHByb2Nlc3MuZW52Lk9QRU5BSV9BUElfS0VZIH0pO1xuY29uc3QgZXhlY0ZpbGVBc3luYyA9IHByb21pc2lmeShleGVjRmlsZSk7XG5cbmV4cG9ydCBpbnRlcmZhY2UgU3VidGl0bGVXb3JkIHtcbiAgd29yZDogc3RyaW5nO1xuICBzdGFydDogbnVtYmVyO1xuICBlbmQ6IG51bWJlcjtcbn1cblxuZXhwb3J0IGludGVyZmFjZSBTdWJ0aXRsZURhdGEge1xuICBzY2VuZVBvc2l0aW9uOiBudW1iZXI7XG4gIHdvcmRzOiBTdWJ0aXRsZVdvcmRbXTtcbiAgZnVsbFRleHQ6IHN0cmluZztcbiAgZHVyYXRpb24/OiBudW1iZXI7XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgTmFycmF0aW9uUmVzdWx0IHtcbiAgc3VidGl0bGVzOiBTdWJ0aXRsZURhdGFbXTtcbn1cblxuZXhwb3J0IGludGVyZmFjZSBUcmFuc2NyaXB0aW9uUmVzcG9uc2Uge1xuICB0YXNrOiBzdHJpbmc7XG4gIGxhbmd1YWdlOiBzdHJpbmc7XG4gIGR1cmF0aW9uOiBudW1iZXI7XG4gIHRleHQ6IHN0cmluZztcbiAgd29yZHM6IFN1YnRpdGxlV29yZFtdO1xuICB1c2FnZToge1xuICAgIHR5cGU6IHN0cmluZztcbiAgICBzZWNvbmRzOiBudW1iZXI7XG4gIH07XG59XG5cbi8qKlxuICogQWRqdXN0cyBhdWRpbyBkdXJhdGlvbiB0byBtYXRjaCB0YXJnZXQgZHVyYXRpb24gdXNpbmcgRkZtcGVnXG4gKiBAcGFyYW0gYXVkaW9CdWZmZXIgLSBUaGUgb3JpZ2luYWwgYXVkaW8gYnVmZmVyXG4gKiBAcGFyYW0gdGFyZ2V0RHVyYXRpb24gLSBUaGUgdGFyZ2V0IGR1cmF0aW9uIGluIHNlY29uZHNcbiAqIEByZXR1cm5zIFByb21pc2U8QnVmZmVyPiAtIFRoZSBhZGp1c3RlZCBhdWRpbyBidWZmZXJcbiAqL1xuXG5leHBvcnQgYXN5bmMgZnVuY3Rpb24gZ2VuZXJhdGVOYXJyYXRpb24oXG4gIHNjZW5lczogU2NlbmVbXSxcbiAgdXNlcklkOiBzdHJpbmcsXG4gIHRpbWVzdGFtcDogc3RyaW5nLFxuICBpbnN0cnVjdGlvbnM6IHN0cmluZyA9ICdTcGVhayBpbiBhIGNoZWVyZnVsIGFuZCBwb3NpdGl2ZSB0b25lJyxcbiAgdm9pY2U6IHN0cmluZyA9ICdhbGxveScsXG4gIGxhbmd1YWdlOiBzdHJpbmcgPSAnZW4nLFxuKTogUHJvbWlzZTxOYXJyYXRpb25SZXN1bHQ+IHtcbiAgY29uc29sZS5sb2coXG4gICAgJ/CfjqQgR2VuZXJhdGluZyBuYXJyYXRpb24gZnJvbSBzY2VuZXMgd2l0aCB3b3JkLWxldmVsIHRpbWVzdGFtcHMuLi4nLFxuICApO1xuICB0cnkge1xuICAgIC8vIFByb2Nlc3MgYWxsIHNjZW5lcyBpbiBwYXJhbGxlbFxuICAgIGNvbnN0IHNjZW5lUHJvbWlzZXMgPSBzY2VuZXMubWFwKGFzeW5jIChzY2VuZSwgaSkgPT4ge1xuICAgICAgY29uc29sZS5sb2coYPCfjqQgR2VuZXJhdGluZyBuYXJyYXRpb24gZm9yIHNjZW5lICR7aX06YCwgc2NlbmUpO1xuXG4gICAgICAvLyBHZW5lcmF0ZSBzcGVlY2ggd2l0aCBzdGFuZGFyZCBmb3JtYXRcbiAgICAgIGNvbnN0IHJlc3BvbnNlID0gYXdhaXQgb3BlbmFpLmF1ZGlvLnNwZWVjaC5jcmVhdGUoe1xuICAgICAgICBtb2RlbDogJ2dwdC00by1taW5pLXR0cy0yMDI1LTEyLTE1JyxcbiAgICAgICAgdm9pY2U6IHZvaWNlLFxuICAgICAgICBpbnN0cnVjdGlvbnM6IGAke2luc3RydWN0aW9uc30gU3BlYWsgbGlrZSBhIHdhcm0sIG91dGdvaW5nIGZyaWVuZCBzaGFyaW5nIHRoaXMgaW4gcGVyc29uIOKAlCBuYXR1cmFsIHJoeXRobSwgZ2VudWluZSBlbmVyZ3ksIHJlbGF4ZWQgcGFjaW5nIHdpdGggcmVhbCBicmVhdGhzLCBub3QgYSBzY3JpcHRlZCByZWFkLiBLZWVwIGR1cmF0aW9uIGluICR7c2NlbmUuZHVyYXRpb259cyBoYXJkIGNhcC4gQXZvaWQgbG9uZyBwYXVzZXMuYCxcbiAgICAgICAgaW5wdXQ6IHNjZW5lLm5hcnJhdGlvbixcbiAgICAgIH0pO1xuICAgICAgLy8gQ2hlY2sgaWYgcmVzcG9uc2UgaGFzIGR1cmF0aW9uIG1ldGFkYXRhXG4gICAgICBjb25zb2xlLmxvZygnUmVzcG9uc2UgYXVkaW8gZGF0YTonLCBKU09OLnN0cmluZ2lmeShyZXNwb25zZSwgbnVsbCwgMikpO1xuXG4gICAgICBjb25zdCBvcmlnaW5hbEF1ZGlvQnVmZmVyID0gQnVmZmVyLmZyb20oYXdhaXQgcmVzcG9uc2UuYXJyYXlCdWZmZXIoKSk7XG5cbiAgICAgIC8vIFNhdmUgdG8gUzMgd2l0aCB0aW1lc3RhbXAgcHJlZml4IHVzaW5nIHNjZW5lLmlkXG4gICAgICBjb25zdCBhdWRpb0tleSA9IGAke3VzZXJJZH0vJHt0aW1lc3RhbXB9LnNjZW5lLSR7c2NlbmUuaWR9Lm1wM2A7XG5cbiAgICAgIGF3YWl0IHMzLnNlbmQoXG4gICAgICAgIG5ldyBQdXRPYmplY3RDb21tYW5kKHtcbiAgICAgICAgICBCdWNrZXQ6IHByb2Nlc3MuZW52LlZJREVPX1BBUlRTX0JVQ0tFVF9OQU1FLFxuICAgICAgICAgIEtleTogYXVkaW9LZXksXG4gICAgICAgICAgQm9keTogb3JpZ2luYWxBdWRpb0J1ZmZlcixcbiAgICAgICAgICBDb250ZW50VHlwZTogJ2F1ZGlvL21wZWcnLFxuICAgICAgICB9KSxcbiAgICAgICk7XG5cbiAgICAgIC8vIEdldCB3b3JkLWxldmVsIHRpbWVzdGFtcHMgdXNpbmcgdHJhbnNjcmlwdGlvblxuXG4gICAgICAvLyBXcml0ZSBhZGp1c3RlZCBhdWRpbyBidWZmZXIgdG8gdGVtcG9yYXJ5IGZpbGUgZm9yIHRyYW5zY3JpcHRpb25cbiAgICAgIGNvbnN0IGZzID0gcmVxdWlyZSgnZnMnKTtcbiAgICAgIGNvbnN0IG9zID0gcmVxdWlyZSgnb3MnKTtcbiAgICAgIGNvbnN0IHBhdGggPSByZXF1aXJlKCdwYXRoJyk7XG5cbiAgICAgIGNvbnN0IHRlbXBBdWRpb1BhdGggPSBwYXRoLmpvaW4oXG4gICAgICAgIG9zLnRtcGRpcigpLFxuICAgICAgICBgc2NlbmUtJHtpfS0ke3RpbWVzdGFtcH0ubXAzYCxcbiAgICAgICk7XG4gICAgICBmcy53cml0ZUZpbGVTeW5jKHRlbXBBdWRpb1BhdGgsIG9yaWdpbmFsQXVkaW9CdWZmZXIpO1xuXG4gICAgICAvLyBDcmVhdGUgZmlsZSBvYmplY3QgZm9yIE9wZW5BSSBBUElcbiAgICAgIGNvbnN0IGF1ZGlvRmlsZSA9IGZzLmNyZWF0ZVJlYWRTdHJlYW0odGVtcEF1ZGlvUGF0aCk7XG5cbiAgICAgIGNvbnN0IHRyYW5zY3JpcHRpb24gPSAoYXdhaXQgb3BlbmFpLmF1ZGlvLnRyYW5zY3JpcHRpb25zLmNyZWF0ZSh7XG4gICAgICAgIGZpbGU6IGF1ZGlvRmlsZSxcbiAgICAgICAgbW9kZWw6ICd3aGlzcGVyLTEnLFxuICAgICAgICByZXNwb25zZV9mb3JtYXQ6ICd2ZXJib3NlX2pzb24nLFxuICAgICAgICB0aW1lc3RhbXBfZ3JhbnVsYXJpdGllczogWyd3b3JkJ10sXG4gICAgICAgIGxhbmd1YWdlOiBsYW5ndWFnZSxcbiAgICAgIH0pKSBhcyBUcmFuc2NyaXB0aW9uUmVzcG9uc2U7XG5cbiAgICAgIC8vIFNhdmUgdHJhbnNjcmlwdGlvbiB0byBTM1xuICAgICAgLy8gY29uc3QgdHJhbnNjcmlwdGlvbktleSA9IGAke3VzZXJJZH0vJHt0aW1lc3RhbXB9LnNjZW5lLSR7c2NlbmUuaWR9LnRyYW5zY3JpcHRpb24uanNvbmA7XG4gICAgICAvLyBhd2FpdCBzMy5zZW5kKFxuICAgICAgLy8gICBuZXcgUHV0T2JqZWN0Q29tbWFuZCh7XG4gICAgICAvLyAgICAgQnVja2V0OiBwcm9jZXNzLmVudi5WSURFT19QQVJUU19CVUNLRVRfTkFNRSxcbiAgICAgIC8vICAgICBLZXk6IHRyYW5zY3JpcHRpb25LZXksXG4gICAgICAvLyAgICAgQm9keTogSlNPTi5zdHJpbmdpZnkodHJhbnNjcmlwdGlvbiksXG4gICAgICAvLyAgIH0pLFxuICAgICAgLy8gKTtcblxuICAgICAgY29uc3Qgc3VidGl0bGVEYXRhOiBTdWJ0aXRsZURhdGEgPSB7XG4gICAgICAgIHNjZW5lUG9zaXRpb246IHNjZW5lLmlkLFxuICAgICAgICB3b3JkczogW10sXG4gICAgICAgIGZ1bGxUZXh0OiBzY2VuZS5uYXJyYXRpb24sIC8vIFVzZSBvcmlnaW5hbCBuYXJyYXRpb24gdGV4dCBpbnN0ZWFkIG9mIHRyYW5zY3JpYmVkIHRleHRcbiAgICAgIH07XG5cbiAgICAgIC8vIEV4dHJhY3Qgd29yZC1sZXZlbCB0aW1lc3RhbXBzIGZyb20gdGhlIHRyYW5zY3JpcHRpb24gcmVzcG9uc2VcbiAgICAgIGlmICh0cmFuc2NyaXB0aW9uLndvcmRzICYmIEFycmF5LmlzQXJyYXkodHJhbnNjcmlwdGlvbi53b3JkcykpIHtcbiAgICAgICAgc3VidGl0bGVEYXRhLndvcmRzID0gdHJhbnNjcmlwdGlvbi53b3Jkcy5tYXAoKHdvcmQ6IGFueSkgPT4gKHtcbiAgICAgICAgICB3b3JkOiB3b3JkLndvcmQsXG4gICAgICAgICAgc3RhcnQ6IHdvcmQuc3RhcnQsXG4gICAgICAgICAgZW5kOiB3b3JkLmVuZCxcbiAgICAgICAgfSkpO1xuICAgICAgICBzdWJ0aXRsZURhdGEuZHVyYXRpb24gPSB0cmFuc2NyaXB0aW9uLnVzYWdlLnNlY29uZHM7XG4gICAgICAgIGNvbnNvbGUubG9nKGDwn5SNIFNjZW5lICR7aX06IFdvcmQgdGltZXN0YW1wcyBleHRyYWN0ZWQgc3VjY2Vzc2Z1bGx5YCk7XG4gICAgICAgIC8vIFdvcmQgdGltZXN0YW1wcyBleHRyYWN0ZWQgc3VjY2Vzc2Z1bGx5XG4gICAgICB9IGVsc2Uge1xuICAgICAgICBjb25zb2xlLmxvZyhg8J+UjSBTY2VuZSAke2l9OiBObyB3b3JkIHRpbWVzdGFtcHMgZm91bmQsIHVzaW5nIGZhbGxiYWNrYCk7XG4gICAgICAgIC8vIFVzaW5nIGZhbGxiYWNrIHdvcmQgdGltZXN0YW1wc1xuICAgICAgICAvLyBGYWxsYmFjazogY3JlYXRlIGEgc2ltcGxlIHdvcmQtbGV2ZWwgYnJlYWtkb3duIHdpdGhvdXQgcHJlY2lzZSB0aW1lc3RhbXBzXG4gICAgICAgIGNvbnN0IHdvcmRzID0gc2NlbmUubmFycmF0aW9uXG4gICAgICAgICAgLnNwbGl0KCcgJylcbiAgICAgICAgICAuZmlsdGVyKCh3b3JkKSA9PiB3b3JkLmxlbmd0aCA+IDApO1xuICAgICAgICBjb25zdCBlc3RpbWF0ZWREdXJhdGlvbiA9IHNjZW5lLmR1cmF0aW9uO1xuICAgICAgICBjb25zdCB0aW1lUGVyV29yZCA9IGVzdGltYXRlZER1cmF0aW9uIC8gd29yZHMubGVuZ3RoO1xuXG4gICAgICAgIHN1YnRpdGxlRGF0YS53b3JkcyA9IHdvcmRzLm1hcCgod29yZCwgaW5kZXgpID0+ICh7XG4gICAgICAgICAgd29yZCxcbiAgICAgICAgICBzdGFydDogaW5kZXggKiB0aW1lUGVyV29yZCxcbiAgICAgICAgICBlbmQ6IChpbmRleCArIDEpICogdGltZVBlcldvcmQsXG4gICAgICAgIH0pKTtcbiAgICAgIH1cblxuICAgICAgLy8gQW5pbWF0ZWQgc2NlbmVzIGhhdmUgYSBmaXhlZC1sZW5ndGggUnVud2F5IHZpZGVvIOKAlCBpZiB0aGUgVFRTXG4gICAgICAvLyBuYXJyYXRpb24gY2FtZSBvdXQgbG9uZ2VyIHRoYW4gdGhhdCwgaGFyZC10cmltIHRoZSBhdWRpbyAodGhlXG4gICAgICAvLyBcIlNwZWFrIGNsZWFybHkgYW5kIGtlZXAgZHVyYXRpb24uLi5cIiBpbnN0cnVjdGlvbiBhYm92ZSBpcyBvbmx5IGFcbiAgICAgIC8vIHNvZnQgaGludCB0byB0aGUgVFRTIG1vZGVsLCBub3QgYW4gZW5mb3JjZWQgY2FwKSBhbmQgZHJvcCBhbnlcbiAgICAgIC8vIHN1YnRpdGxlIHdvcmRzIHRoYXQgZmFsbCBwYXN0IHRoZSBjdXQuXG4gICAgICBpZiAoXG4gICAgICAgIHNjZW5lLmhhcmRDYXBTZWNvbmRzICE9PSB1bmRlZmluZWQgJiZcbiAgICAgICAgKHN1YnRpdGxlRGF0YS5kdXJhdGlvbiB8fCAwKSA+IHNjZW5lLmhhcmRDYXBTZWNvbmRzXG4gICAgICApIHtcbiAgICAgICAgY29uc3QgY2FwID0gc2NlbmUuaGFyZENhcFNlY29uZHM7XG4gICAgICAgIGNvbnNvbGUubG9nKFxuICAgICAgICAgIGDinILvuI8gU2NlbmUgJHtpfTogbmFycmF0aW9uICgke3N1YnRpdGxlRGF0YS5kdXJhdGlvbn1zKSBleGNlZWRzIHRoZSAke2NhcH1zIGFuaW1hdGVkLXNjZW5lIGNhcCwgdHJpbW1pbmcgYXVkaW9gLFxuICAgICAgICApO1xuXG4gICAgICAgIGNvbnN0IHRyaW1tZWRBdWRpb1BhdGggPSBwYXRoLmpvaW4oXG4gICAgICAgICAgb3MudG1wZGlyKCksXG4gICAgICAgICAgYHNjZW5lLSR7aX0tJHt0aW1lc3RhbXB9LXRyaW1tZWQubXAzYCxcbiAgICAgICAgKTtcbiAgICAgICAgY29uc3QgZmZtcGVnUGF0aCA9IHJlc29sdmVGZm1wZWdQYXRoKCk7XG4gICAgICAgIGF3YWl0IGV4ZWNGaWxlQXN5bmMoZmZtcGVnUGF0aCwgW1xuICAgICAgICAgICctaScsXG4gICAgICAgICAgdGVtcEF1ZGlvUGF0aCxcbiAgICAgICAgICAnLXQnLFxuICAgICAgICAgIGNhcC50b1N0cmluZygpLFxuICAgICAgICAgICcteScsXG4gICAgICAgICAgdHJpbW1lZEF1ZGlvUGF0aCxcbiAgICAgICAgXSk7XG5cbiAgICAgICAgY29uc3QgdHJpbW1lZEF1ZGlvQnVmZmVyID0gZnMucmVhZEZpbGVTeW5jKHRyaW1tZWRBdWRpb1BhdGgpO1xuICAgICAgICBhd2FpdCBzMy5zZW5kKFxuICAgICAgICAgIG5ldyBQdXRPYmplY3RDb21tYW5kKHtcbiAgICAgICAgICAgIEJ1Y2tldDogcHJvY2Vzcy5lbnYuVklERU9fUEFSVFNfQlVDS0VUX05BTUUsXG4gICAgICAgICAgICBLZXk6IGF1ZGlvS2V5LFxuICAgICAgICAgICAgQm9keTogdHJpbW1lZEF1ZGlvQnVmZmVyLFxuICAgICAgICAgICAgQ29udGVudFR5cGU6ICdhdWRpby9tcGVnJyxcbiAgICAgICAgICB9KSxcbiAgICAgICAgKTtcbiAgICAgICAgZnMudW5saW5rU3luYyh0cmltbWVkQXVkaW9QYXRoKTtcblxuICAgICAgICBzdWJ0aXRsZURhdGEud29yZHMgPSBzdWJ0aXRsZURhdGEud29yZHMuZmlsdGVyKFxuICAgICAgICAgICh3b3JkKSA9PiB3b3JkLnN0YXJ0IDwgY2FwLFxuICAgICAgICApO1xuICAgICAgICBzdWJ0aXRsZURhdGEuZHVyYXRpb24gPSBjYXA7XG4gICAgICB9XG5cbiAgICAgIC8vIENsZWFuIHVwIHRlbXBvcmFyeSBmaWxlXG4gICAgICBmcy51bmxpbmtTeW5jKHRlbXBBdWRpb1BhdGgpO1xuXG4gICAgICAvLyBTYXZlIGNvbXBsZXRlIHN1YnRpdGxlIGRhdGEgdG8gUzMgKGluY2x1ZGluZyBmdWxsVGV4dClcbiAgICAgIGNvbnN0IHN1YnRpdGxlS2V5ID0gYCR7dXNlcklkfS8ke3RpbWVzdGFtcH0uc2NlbmUtJHtzY2VuZS5pZH0uc3VidGl0bGUuanNvbmA7XG4gICAgICBhd2FpdCBzMy5zZW5kKFxuICAgICAgICBuZXcgUHV0T2JqZWN0Q29tbWFuZCh7XG4gICAgICAgICAgQnVja2V0OiBwcm9jZXNzLmVudi5WSURFT19QQVJUU19CVUNLRVRfTkFNRSxcbiAgICAgICAgICBLZXk6IHN1YnRpdGxlS2V5LFxuICAgICAgICAgIEJvZHk6IEpTT04uc3RyaW5naWZ5KHN1YnRpdGxlRGF0YSksXG4gICAgICAgIH0pLFxuICAgICAgKTtcblxuICAgICAgcmV0dXJuIHtcbiAgICAgICAgYXVkaW9LZXksXG4gICAgICAgIHN1YnRpdGxlRGF0YSxcbiAgICAgIH07XG4gICAgfSk7XG5cbiAgICAvLyBXYWl0IGZvciBhbGwgc2NlbmVzIHRvIGNvbXBsZXRlXG4gICAgY29uc3QgcmVzdWx0cyA9IGF3YWl0IFByb21pc2UuYWxsKHNjZW5lUHJvbWlzZXMpO1xuXG4gICAgLy8gRXh0cmFjdCByZXN1bHRzIGluIHRoZSBjb3JyZWN0IG9yZGVyXG4gICAgY29uc3QgYXVkaW9LZXlzID0gcmVzdWx0cy5tYXAoKHJlc3VsdCkgPT4gcmVzdWx0LmF1ZGlvS2V5KTtcbiAgICBjb25zdCBzdWJ0aXRsZXMgPSByZXN1bHRzLm1hcCgocmVzdWx0KSA9PiByZXN1bHQuc3VidGl0bGVEYXRhKTtcblxuICAgIGNvbnNvbGUubG9nKFxuICAgICAgYOKchSBHZW5lcmF0ZWQgbmFycmF0aW9uIGZvciAke3Jlc3VsdHMubGVuZ3RofSBzY2VuZXMgaW4gcGFyYWxsZWxgLFxuICAgICk7XG4gICAgcmV0dXJuIHsgc3VidGl0bGVzIH07XG4gIH0gY2F0Y2ggKGVycm9yKSB7XG4gICAgY29uc29sZS5lcnJvcign4p2MIEVycm9yIGluIGdlbmVyYXRlTmFycmF0aW9uOicsIGVycm9yKTtcbiAgICB0aHJvdyBlcnJvcjtcbiAgfVxufVxuIl19