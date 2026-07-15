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
                model: 'gpt-4o-mini-tts',
                voice: voice,
                instructions: `Speak clearly and keep duration in ${scene.duration}s hard cap. Avoid long pauses.`,
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiYXVkaW8uanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyJhdWRpby50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiOztBQWlEQSw4Q0EwTEM7QUEzT0Qsa0RBQWdFO0FBQ2hFLGlEQUF5QztBQUN6QywrQkFBaUM7QUFFakMsbUNBQTRCO0FBRzVCLHFDQUE2QztBQUU3QyxNQUFNLEVBQUUsR0FBRyxJQUFJLG9CQUFRLENBQUMsRUFBRSxNQUFNLEVBQUUsT0FBTyxDQUFDLEdBQUcsQ0FBQyxVQUFVLEVBQUUsQ0FBQyxDQUFDO0FBQzVELE1BQU0sTUFBTSxHQUFHLElBQUksZ0JBQU0sQ0FBQyxFQUFFLE1BQU0sRUFBRSxPQUFPLENBQUMsR0FBRyxDQUFDLGNBQWMsRUFBRSxDQUFDLENBQUM7QUFDbEUsTUFBTSxhQUFhLEdBQUcsSUFBQSxnQkFBUyxFQUFDLHdCQUFRLENBQUMsQ0FBQztBQStCMUM7Ozs7O0dBS0c7QUFFSSxLQUFLLFVBQVUsaUJBQWlCLENBQ3JDLE1BQWUsRUFDZixNQUFjLEVBQ2QsU0FBaUIsRUFDakIsZUFBdUIsdUNBQXVDLEVBQzlELFFBQWdCLE9BQU8sRUFDdkIsV0FBbUIsSUFBSTtJQUV2QixPQUFPLENBQUMsR0FBRyxDQUNULG1FQUFtRSxDQUNwRSxDQUFDO0lBQ0YsSUFBSSxDQUFDO1FBQ0gsaUNBQWlDO1FBQ2pDLE1BQU0sYUFBYSxHQUFHLE1BQU0sQ0FBQyxHQUFHLENBQUMsS0FBSyxFQUFFLEtBQUssRUFBRSxDQUFDLEVBQUUsRUFBRTtZQUNsRCxPQUFPLENBQUMsR0FBRyxDQUFDLHFDQUFxQyxDQUFDLEdBQUcsRUFBRSxLQUFLLENBQUMsQ0FBQztZQUU5RCx1Q0FBdUM7WUFDdkMsTUFBTSxRQUFRLEdBQUcsTUFBTSxNQUFNLENBQUMsS0FBSyxDQUFDLE1BQU0sQ0FBQyxNQUFNLENBQUM7Z0JBQ2hELEtBQUssRUFBRSxpQkFBaUI7Z0JBQ3hCLEtBQUssRUFBRSxLQUFLO2dCQUNaLFlBQVksRUFBRSxzQ0FBc0MsS0FBSyxDQUFD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QUMzQyxHQUFHLEVBQUUsV0FBVztnQkFDaEIsSUFBSSxFQUFFLElBQUksQ0FBQyxTQUFTLENBQUMsWUFBWSxDQUFDO2FBQ25DLENBQUMsQ0FDSCxDQUFDO1lBRUYsT0FBTztnQkFDTCxRQUFRO2dCQUNSLFlBQVk7YUFDYixDQUFDO1FBQ0osQ0FBQyxDQUFDLENBQUM7UUFFSCxrQ0FBa0M7UUFDbEMsTUFBTSxPQUFPLEdBQUcsTUFBTSxPQUFPLENBQUMsR0FBRyxDQUFDLGFBQWEsQ0FBQyxDQUFDO1FBRWpELHVDQUF1QztRQUN2QyxNQUFNLFNBQVMsR0FBRyxPQUFPLENBQUMsR0FBRyxDQUFDLENBQUMsTUFBTSxFQUFFLEVBQUUsQ0FBQyxNQUFNLENBQUMsUUFBUSxDQUFDLENBQUM7UUFDM0QsTUFBTSxTQUFTLEdBQUcsT0FBTyxDQUFDLEdBQUcsQ0FBQyxDQUFDLE1BQU0sRUFBRSxFQUFFLENBQUMsTUFBTSxDQUFDLFlBQVksQ0FBQyxDQUFDO1FBRS9ELE9BQU8sQ0FBQyxHQUFHLENBQ1QsNkJBQTZCLE9BQU8sQ0FBQyxNQUFNLHFCQUFxQixDQUNqRSxDQUFDO1FBQ0YsT0FBTyxFQUFFLFNBQVMsRUFBRSxDQUFDO0lBQ3ZCLENBQUM7SUFBQyxPQUFPLEtBQUssRUFBRSxDQUFDO1FBQ2YsT0FBTyxDQUFDLEtBQUssQ0FBQywrQkFBK0IsRUFBRSxLQUFLLENBQUMsQ0FBQztRQUN0RCxNQUFNLEtBQUssQ0FBQztJQUNkLENBQUM7QUFDSCxDQUFDIiwic291cmNlc0NvbnRlbnQiOlsiaW1wb3J0IHsgUzNDbGllbnQsIFB1dE9iamVjdENvbW1hbmQgfSBmcm9tICdAYXdzLXNkay9jbGllbnQtczMnO1xuaW1wb3J0IHsgZXhlY0ZpbGUgfSBmcm9tICdjaGlsZF9wcm9jZXNzJztcbmltcG9ydCB7IHByb21pc2lmeSB9IGZyb20gJ3V0aWwnO1xuXG5pbXBvcnQgT3BlbkFJIGZyb20gJ29wZW5haSc7XG5cbmltcG9ydCB7IFNjZW5lIH0gZnJvbSAnLi9zY3JpcHQnO1xuaW1wb3J0IHsgcmVzb2x2ZUZmbXBlZ1BhdGggfSBmcm9tICcuL2ZmbXBlZyc7XG5cbmNvbnN0IHMzID0gbmV3IFMzQ2xpZW50KHsgcmVnaW9uOiBwcm9jZXNzLmVudi5BV1NfUkVHSU9OIH0pO1xuY29uc3Qgb3BlbmFpID0gbmV3IE9wZW5BSSh7IGFwaUtleTogcHJvY2Vzcy5lbnYuT1BFTkFJX0FQSV9LRVkgfSk7XG5jb25zdCBleGVjRmlsZUFzeW5jID0gcHJvbWlzaWZ5KGV4ZWNGaWxlKTtcblxuZXhwb3J0IGludGVyZmFjZSBTdWJ0aXRsZVdvcmQge1xuICB3b3JkOiBzdHJpbmc7XG4gIHN0YXJ0OiBudW1iZXI7XG4gIGVuZDogbnVtYmVyO1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIFN1YnRpdGxlRGF0YSB7XG4gIHNjZW5lUG9zaXRpb246IG51bWJlcjtcbiAgd29yZHM6IFN1YnRpdGxlV29yZFtdO1xuICBmdWxsVGV4dDogc3RyaW5nO1xuICBkdXJhdGlvbj86IG51bWJlcjtcbn1cblxuZXhwb3J0IGludGVyZmFjZSBOYXJyYXRpb25SZXN1bHQge1xuICBzdWJ0aXRsZXM6IFN1YnRpdGxlRGF0YVtdO1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIFRyYW5zY3JpcHRpb25SZXNwb25zZSB7XG4gIHRhc2s6IHN0cmluZztcbiAgbGFuZ3VhZ2U6IHN0cmluZztcbiAgZHVyYXRpb246IG51bWJlcjtcbiAgdGV4dDogc3RyaW5nO1xuICB3b3JkczogU3VidGl0bGVXb3JkW107XG4gIHVzYWdlOiB7XG4gICAgdHlwZTogc3RyaW5nO1xuICAgIHNlY29uZHM6IG51bWJlcjtcbiAgfTtcbn1cblxuLyoqXG4gKiBBZGp1c3RzIGF1ZGlvIGR1cmF0aW9uIHRvIG1hdGNoIHRhcmdldCBkdXJhdGlvbiB1c2luZyBGRm1wZWdcbiAqIEBwYXJhbSBhdWRpb0J1ZmZlciAtIFRoZSBvcmlnaW5hbCBhdWRpbyBidWZmZXJcbiAqIEBwYXJhbSB0YXJnZXREdXJhdGlvbiAtIFRoZSB0YXJnZXQgZHVyYXRpb24gaW4gc2Vjb25kc1xuICogQHJldHVybnMgUHJvbWlzZTxCdWZmZXI+IC0gVGhlIGFkanVzdGVkIGF1ZGlvIGJ1ZmZlclxuICovXG5cbmV4cG9ydCBhc3luYyBmdW5jdGlvbiBnZW5lcmF0ZU5hcnJhdGlvbihcbiAgc2NlbmVzOiBTY2VuZVtdLFxuICB1c2VySWQ6IHN0cmluZyxcbiAgdGltZXN0YW1wOiBzdHJpbmcsXG4gIGluc3RydWN0aW9uczogc3RyaW5nID0gJ1NwZWFrIGluIGEgY2hlZXJmdWwgYW5kIHBvc2l0aXZlIHRvbmUnLFxuICB2b2ljZTogc3RyaW5nID0gJ2FsbG95JyxcbiAgbGFuZ3VhZ2U6IHN0cmluZyA9ICdlbicsXG4pOiBQcm9taXNlPE5hcnJhdGlvblJlc3VsdD4ge1xuICBjb25zb2xlLmxvZyhcbiAgICAn8J+OpCBHZW5lcmF0aW5nIG5hcnJhdGlvbiBmcm9tIHNjZW5lcyB3aXRoIHdvcmQtbGV2ZWwgdGltZXN0YW1wcy4uLicsXG4gICk7XG4gIHRyeSB7XG4gICAgLy8gUHJvY2VzcyBhbGwgc2NlbmVzIGluIHBhcmFsbGVsXG4gICAgY29uc3Qgc2NlbmVQcm9taXNlcyA9IHNjZW5lcy5tYXAoYXN5bmMgKHNjZW5lLCBpKSA9PiB7XG4gICAgICBjb25zb2xlLmxvZyhg8J+OpCBHZW5lcmF0aW5nIG5hcnJhdGlvbiBmb3Igc2NlbmUgJHtpfTpgLCBzY2VuZSk7XG5cbiAgICAgIC8vIEdlbmVyYXRlIHNwZWVjaCB3aXRoIHN0YW5kYXJkIGZvcm1hdFxuICAgICAgY29uc3QgcmVzcG9uc2UgPSBhd2FpdCBvcGVuYWkuYXVkaW8uc3BlZWNoLmNyZWF0ZSh7XG4gICAgICAgIG1vZGVsOiAnZ3B0LTRvLW1pbmktdHRzJyxcbiAgICAgICAgdm9pY2U6IHZvaWNlLFxuICAgICAgICBpbnN0cnVjdGlvbnM6IGBTcGVhayBjbGVhcmx5IGFuZCBrZWVwIGR1cmF0aW9uIGluICR7c2NlbmUuZHVyYXRpb259cyBoYXJkIGNhcC4gQXZvaWQgbG9uZyBwYXVzZXMuYCxcbiAgICAgICAgaW5wdXQ6IHNjZW5lLm5hcnJhdGlvbixcbiAgICAgIH0pO1xuICAgICAgLy8gQ2hlY2sgaWYgcmVzcG9uc2UgaGFzIGR1cmF0aW9uIG1ldGFkYXRhXG4gICAgICBjb25zb2xlLmxvZygnUmVzcG9uc2UgYXVkaW8gZGF0YTonLCBKU09OLnN0cmluZ2lmeShyZXNwb25zZSwgbnVsbCwgMikpO1xuXG4gICAgICBjb25zdCBvcmlnaW5hbEF1ZGlvQnVmZmVyID0gQnVmZmVyLmZyb20oYXdhaXQgcmVzcG9uc2UuYXJyYXlCdWZmZXIoKSk7XG5cbiAgICAgIC8vIFNhdmUgdG8gUzMgd2l0aCB0aW1lc3RhbXAgcHJlZml4IHVzaW5nIHNjZW5lLmlkXG4gICAgICBjb25zdCBhdWRpb0tleSA9IGAke3VzZXJJZH0vJHt0aW1lc3RhbXB9LnNjZW5lLSR7c2NlbmUuaWR9Lm1wM2A7XG5cbiAgICAgIGF3YWl0IHMzLnNlbmQoXG4gICAgICAgIG5ldyBQdXRPYmplY3RDb21tYW5kKHtcbiAgICAgICAgICBCdWNrZXQ6IHByb2Nlc3MuZW52LlZJREVPX1BBUlRTX0JVQ0tFVF9OQU1FLFxuICAgICAgICAgIEtleTogYXVkaW9LZXksXG4gICAgICAgICAgQm9keTogb3JpZ2luYWxBdWRpb0J1ZmZlcixcbiAgICAgICAgICBDb250ZW50VHlwZTogJ2F1ZGlvL21wZWcnLFxuICAgICAgICB9KSxcbiAgICAgICk7XG5cbiAgICAgIC8vIEdldCB3b3JkLWxldmVsIHRpbWVzdGFtcHMgdXNpbmcgdHJhbnNjcmlwdGlvblxuXG4gICAgICAvLyBXcml0ZSBhZGp1c3RlZCBhdWRpbyBidWZmZXIgdG8gdGVtcG9yYXJ5IGZpbGUgZm9yIHRyYW5zY3JpcHRpb25cbiAgICAgIGNvbnN0IGZzID0gcmVxdWlyZSgnZnMnKTtcbiAgICAgIGNvbnN0IG9zID0gcmVxdWlyZSgnb3MnKTtcbiAgICAgIGNvbnN0IHBhdGggPSByZXF1aXJlKCdwYXRoJyk7XG5cbiAgICAgIGNvbnN0IHRlbXBBdWRpb1BhdGggPSBwYXRoLmpvaW4oXG4gICAgICAgIG9zLnRtcGRpcigpLFxuICAgICAgICBgc2NlbmUtJHtpfS0ke3RpbWVzdGFtcH0ubXAzYCxcbiAgICAgICk7XG4gICAgICBmcy53cml0ZUZpbGVTeW5jKHRlbXBBdWRpb1BhdGgsIG9yaWdpbmFsQXVkaW9CdWZmZXIpO1xuXG4gICAgICAvLyBDcmVhdGUgZmlsZSBvYmplY3QgZm9yIE9wZW5BSSBBUElcbiAgICAgIGNvbnN0IGF1ZGlvRmlsZSA9IGZzLmNyZWF0ZVJlYWRTdHJlYW0odGVtcEF1ZGlvUGF0aCk7XG5cbiAgICAgIGNvbnN0IHRyYW5zY3JpcHRpb24gPSAoYXdhaXQgb3BlbmFpLmF1ZGlvLnRyYW5zY3JpcHRpb25zLmNyZWF0ZSh7XG4gICAgICAgIGZpbGU6IGF1ZGlvRmlsZSxcbiAgICAgICAgbW9kZWw6ICd3aGlzcGVyLTEnLFxuICAgICAgICByZXNwb25zZV9mb3JtYXQ6ICd2ZXJib3NlX2pzb24nLFxuICAgICAgICB0aW1lc3RhbXBfZ3JhbnVsYXJpdGllczogWyd3b3JkJ10sXG4gICAgICAgIGxhbmd1YWdlOiBsYW5ndWFnZSxcbiAgICAgIH0pKSBhcyBUcmFuc2NyaXB0aW9uUmVzcG9uc2U7XG5cbiAgICAgIC8vIFNhdmUgdHJhbnNjcmlwdGlvbiB0byBTM1xuICAgICAgLy8gY29uc3QgdHJhbnNjcmlwdGlvbktleSA9IGAke3VzZXJJZH0vJHt0aW1lc3RhbXB9LnNjZW5lLSR7c2NlbmUuaWR9LnRyYW5zY3JpcHRpb24uanNvbmA7XG4gICAgICAvLyBhd2FpdCBzMy5zZW5kKFxuICAgICAgLy8gICBuZXcgUHV0T2JqZWN0Q29tbWFuZCh7XG4gICAgICAvLyAgICAgQnVja2V0OiBwcm9jZXNzLmVudi5WSURFT19QQVJUU19CVUNLRVRfTkFNRSxcbiAgICAgIC8vICAgICBLZXk6IHRyYW5zY3JpcHRpb25LZXksXG4gICAgICAvLyAgICAgQm9keTogSlNPTi5zdHJpbmdpZnkodHJhbnNjcmlwdGlvbiksXG4gICAgICAvLyAgIH0pLFxuICAgICAgLy8gKTtcblxuICAgICAgY29uc3Qgc3VidGl0bGVEYXRhOiBTdWJ0aXRsZURhdGEgPSB7XG4gICAgICAgIHNjZW5lUG9zaXRpb246IHNjZW5lLmlkLFxuICAgICAgICB3b3JkczogW10sXG4gICAgICAgIGZ1bGxUZXh0OiBzY2VuZS5uYXJyYXRpb24sIC8vIFVzZSBvcmlnaW5hbCBuYXJyYXRpb24gdGV4dCBpbnN0ZWFkIG9mIHRyYW5zY3JpYmVkIHRleHRcbiAgICAgIH07XG5cbiAgICAgIC8vIEV4dHJhY3Qgd29yZC1sZXZlbCB0aW1lc3RhbXBzIGZyb20gdGhlIHRyYW5zY3JpcHRpb24gcmVzcG9uc2VcbiAgICAgIGlmICh0cmFuc2NyaXB0aW9uLndvcmRzICYmIEFycmF5LmlzQXJyYXkodHJhbnNjcmlwdGlvbi53b3JkcykpIHtcbiAgICAgICAgc3VidGl0bGVEYXRhLndvcmRzID0gdHJhbnNjcmlwdGlvbi53b3Jkcy5tYXAoKHdvcmQ6IGFueSkgPT4gKHtcbiAgICAgICAgICB3b3JkOiB3b3JkLndvcmQsXG4gICAgICAgICAgc3RhcnQ6IHdvcmQuc3RhcnQsXG4gICAgICAgICAgZW5kOiB3b3JkLmVuZCxcbiAgICAgICAgfSkpO1xuICAgICAgICBzdWJ0aXRsZURhdGEuZHVyYXRpb24gPSB0cmFuc2NyaXB0aW9uLnVzYWdlLnNlY29uZHM7XG4gICAgICAgIGNvbnNvbGUubG9nKGDwn5SNIFNjZW5lICR7aX06IFdvcmQgdGltZXN0YW1wcyBleHRyYWN0ZWQgc3VjY2Vzc2Z1bGx5YCk7XG4gICAgICAgIC8vIFdvcmQgdGltZXN0YW1wcyBleHRyYWN0ZWQgc3VjY2Vzc2Z1bGx5XG4gICAgICB9IGVsc2Uge1xuICAgICAgICBjb25zb2xlLmxvZyhg8J+UjSBTY2VuZSAke2l9OiBObyB3b3JkIHRpbWVzdGFtcHMgZm91bmQsIHVzaW5nIGZhbGxiYWNrYCk7XG4gICAgICAgIC8vIFVzaW5nIGZhbGxiYWNrIHdvcmQgdGltZXN0YW1wc1xuICAgICAgICAvLyBGYWxsYmFjazogY3JlYXRlIGEgc2ltcGxlIHdvcmQtbGV2ZWwgYnJlYWtkb3duIHdpdGhvdXQgcHJlY2lzZSB0aW1lc3RhbXBzXG4gICAgICAgIGNvbnN0IHdvcmRzID0gc2NlbmUubmFycmF0aW9uXG4gICAgICAgICAgLnNwbGl0KCcgJylcbiAgICAgICAgICAuZmlsdGVyKCh3b3JkKSA9PiB3b3JkLmxlbmd0aCA+IDApO1xuICAgICAgICBjb25zdCBlc3RpbWF0ZWREdXJhdGlvbiA9IHNjZW5lLmR1cmF0aW9uO1xuICAgICAgICBjb25zdCB0aW1lUGVyV29yZCA9IGVzdGltYXRlZER1cmF0aW9uIC8gd29yZHMubGVuZ3RoO1xuXG4gICAgICAgIHN1YnRpdGxlRGF0YS53b3JkcyA9IHdvcmRzLm1hcCgod29yZCwgaW5kZXgpID0+ICh7XG4gICAgICAgICAgd29yZCxcbiAgICAgICAgICBzdGFydDogaW5kZXggKiB0aW1lUGVyV29yZCxcbiAgICAgICAgICBlbmQ6IChpbmRleCArIDEpICogdGltZVBlcldvcmQsXG4gICAgICAgIH0pKTtcbiAgICAgIH1cblxuICAgICAgLy8gQW5pbWF0ZWQgc2NlbmVzIGhhdmUgYSBmaXhlZC1sZW5ndGggUnVud2F5IHZpZGVvIOKAlCBpZiB0aGUgVFRTXG4gICAgICAvLyBuYXJyYXRpb24gY2FtZSBvdXQgbG9uZ2VyIHRoYW4gdGhhdCwgaGFyZC10cmltIHRoZSBhdWRpbyAodGhlXG4gICAgICAvLyBcIlNwZWFrIGNsZWFybHkgYW5kIGtlZXAgZHVyYXRpb24uLi5cIiBpbnN0cnVjdGlvbiBhYm92ZSBpcyBvbmx5IGFcbiAgICAgIC8vIHNvZnQgaGludCB0byB0aGUgVFRTIG1vZGVsLCBub3QgYW4gZW5mb3JjZWQgY2FwKSBhbmQgZHJvcCBhbnlcbiAgICAgIC8vIHN1YnRpdGxlIHdvcmRzIHRoYXQgZmFsbCBwYXN0IHRoZSBjdXQuXG4gICAgICBpZiAoXG4gICAgICAgIHNjZW5lLmhhcmRDYXBTZWNvbmRzICE9PSB1bmRlZmluZWQgJiZcbiAgICAgICAgKHN1YnRpdGxlRGF0YS5kdXJhdGlvbiB8fCAwKSA+IHNjZW5lLmhhcmRDYXBTZWNvbmRzXG4gICAgICApIHtcbiAgICAgICAgY29uc3QgY2FwID0gc2NlbmUuaGFyZENhcFNlY29uZHM7XG4gICAgICAgIGNvbnNvbGUubG9nKFxuICAgICAgICAgIGDinILvuI8gU2NlbmUgJHtpfTogbmFycmF0aW9uICgke3N1YnRpdGxlRGF0YS5kdXJhdGlvbn1zKSBleGNlZWRzIHRoZSAke2NhcH1zIGFuaW1hdGVkLXNjZW5lIGNhcCwgdHJpbW1pbmcgYXVkaW9gLFxuICAgICAgICApO1xuXG4gICAgICAgIGNvbnN0IHRyaW1tZWRBdWRpb1BhdGggPSBwYXRoLmpvaW4oXG4gICAgICAgICAgb3MudG1wZGlyKCksXG4gICAgICAgICAgYHNjZW5lLSR7aX0tJHt0aW1lc3RhbXB9LXRyaW1tZWQubXAzYCxcbiAgICAgICAgKTtcbiAgICAgICAgY29uc3QgZmZtcGVnUGF0aCA9IHJlc29sdmVGZm1wZWdQYXRoKCk7XG4gICAgICAgIGF3YWl0IGV4ZWNGaWxlQXN5bmMoZmZtcGVnUGF0aCwgW1xuICAgICAgICAgICctaScsXG4gICAgICAgICAgdGVtcEF1ZGlvUGF0aCxcbiAgICAgICAgICAnLXQnLFxuICAgICAgICAgIGNhcC50b1N0cmluZygpLFxuICAgICAgICAgICcteScsXG4gICAgICAgICAgdHJpbW1lZEF1ZGlvUGF0aCxcbiAgICAgICAgXSk7XG5cbiAgICAgICAgY29uc3QgdHJpbW1lZEF1ZGlvQnVmZmVyID0gZnMucmVhZEZpbGVTeW5jKHRyaW1tZWRBdWRpb1BhdGgpO1xuICAgICAgICBhd2FpdCBzMy5zZW5kKFxuICAgICAgICAgIG5ldyBQdXRPYmplY3RDb21tYW5kKHtcbiAgICAgICAgICAgIEJ1Y2tldDogcHJvY2Vzcy5lbnYuVklERU9fUEFSVFNfQlVDS0VUX05BTUUsXG4gICAgICAgICAgICBLZXk6IGF1ZGlvS2V5LFxuICAgICAgICAgICAgQm9keTogdHJpbW1lZEF1ZGlvQnVmZmVyLFxuICAgICAgICAgICAgQ29udGVudFR5cGU6ICdhdWRpby9tcGVnJyxcbiAgICAgICAgICB9KSxcbiAgICAgICAgKTtcbiAgICAgICAgZnMudW5saW5rU3luYyh0cmltbWVkQXVkaW9QYXRoKTtcblxuICAgICAgICBzdWJ0aXRsZURhdGEud29yZHMgPSBzdWJ0aXRsZURhdGEud29yZHMuZmlsdGVyKFxuICAgICAgICAgICh3b3JkKSA9PiB3b3JkLnN0YXJ0IDwgY2FwLFxuICAgICAgICApO1xuICAgICAgICBzdWJ0aXRsZURhdGEuZHVyYXRpb24gPSBjYXA7XG4gICAgICB9XG5cbiAgICAgIC8vIENsZWFuIHVwIHRlbXBvcmFyeSBmaWxlXG4gICAgICBmcy51bmxpbmtTeW5jKHRlbXBBdWRpb1BhdGgpO1xuXG4gICAgICAvLyBTYXZlIGNvbXBsZXRlIHN1YnRpdGxlIGRhdGEgdG8gUzMgKGluY2x1ZGluZyBmdWxsVGV4dClcbiAgICAgIGNvbnN0IHN1YnRpdGxlS2V5ID0gYCR7dXNlcklkfS8ke3RpbWVzdGFtcH0uc2NlbmUtJHtzY2VuZS5pZH0uc3VidGl0bGUuanNvbmA7XG4gICAgICBhd2FpdCBzMy5zZW5kKFxuICAgICAgICBuZXcgUHV0T2JqZWN0Q29tbWFuZCh7XG4gICAgICAgICAgQnVja2V0OiBwcm9jZXNzLmVudi5WSURFT19QQVJUU19CVUNLRVRfTkFNRSxcbiAgICAgICAgICBLZXk6IHN1YnRpdGxlS2V5LFxuICAgICAgICAgIEJvZHk6IEpTT04uc3RyaW5naWZ5KHN1YnRpdGxlRGF0YSksXG4gICAgICAgIH0pLFxuICAgICAgKTtcblxuICAgICAgcmV0dXJuIHtcbiAgICAgICAgYXVkaW9LZXksXG4gICAgICAgIHN1YnRpdGxlRGF0YSxcbiAgICAgIH07XG4gICAgfSk7XG5cbiAgICAvLyBXYWl0IGZvciBhbGwgc2NlbmVzIHRvIGNvbXBsZXRlXG4gICAgY29uc3QgcmVzdWx0cyA9IGF3YWl0IFByb21pc2UuYWxsKHNjZW5lUHJvbWlzZXMpO1xuXG4gICAgLy8gRXh0cmFjdCByZXN1bHRzIGluIHRoZSBjb3JyZWN0IG9yZGVyXG4gICAgY29uc3QgYXVkaW9LZXlzID0gcmVzdWx0cy5tYXAoKHJlc3VsdCkgPT4gcmVzdWx0LmF1ZGlvS2V5KTtcbiAgICBjb25zdCBzdWJ0aXRsZXMgPSByZXN1bHRzLm1hcCgocmVzdWx0KSA9PiByZXN1bHQuc3VidGl0bGVEYXRhKTtcblxuICAgIGNvbnNvbGUubG9nKFxuICAgICAgYOKchSBHZW5lcmF0ZWQgbmFycmF0aW9uIGZvciAke3Jlc3VsdHMubGVuZ3RofSBzY2VuZXMgaW4gcGFyYWxsZWxgLFxuICAgICk7XG4gICAgcmV0dXJuIHsgc3VidGl0bGVzIH07XG4gIH0gY2F0Y2ggKGVycm9yKSB7XG4gICAgY29uc29sZS5lcnJvcign4p2MIEVycm9yIGluIGdlbmVyYXRlTmFycmF0aW9uOicsIGVycm9yKTtcbiAgICB0aHJvdyBlcnJvcjtcbiAgfVxufVxuIl19