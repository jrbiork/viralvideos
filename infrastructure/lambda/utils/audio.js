"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.generateNarration = generateNarration;
const client_s3_1 = require("@aws-sdk/client-s3");
const openai_1 = require("openai");
const s3 = new client_s3_1.S3Client({ region: process.env.AWS_REGION });
const openai = new openai_1.default({ apiKey: process.env.OPENAI_API_KEY });
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiYXVkaW8uanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyJhdWRpby50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiOztBQTZDQSw4Q0E2SUM7QUExTEQsa0RBQWdFO0FBRWhFLG1DQUE0QjtBQUk1QixNQUFNLEVBQUUsR0FBRyxJQUFJLG9CQUFRLENBQUMsRUFBRSxNQUFNLEVBQUUsT0FBTyxDQUFDLEdBQUcsQ0FBQyxVQUFVLEVBQUUsQ0FBQyxDQUFDO0FBQzVELE1BQU0sTUFBTSxHQUFHLElBQUksZ0JBQU0sQ0FBQyxFQUFFLE1BQU0sRUFBRSxPQUFPLENBQUMsR0FBRyxDQUFDLGNBQWMsRUFBRSxDQUFDLENBQUM7QUErQmxFOzs7OztHQUtHO0FBRUksS0FBSyxVQUFVLGlCQUFpQixDQUNyQyxNQUFlLEVBQ2YsTUFBYyxFQUNkLFNBQWlCLEVBQ2pCLGVBQXVCLHVDQUF1QyxFQUM5RCxRQUFnQixPQUFPLEVBQ3ZCLFdBQW1CLElBQUk7SUFFdkIsT0FBTyxDQUFDLEdBQUcsQ0FDVCxtRUFBbUUsQ0FDcEUsQ0FBQztJQUNGLElBQUksQ0FBQztRQUNILGlDQUFpQztRQUNqQyxNQUFNLGFBQWEsR0FBRyxNQUFNLENBQUMsR0FBRyxDQUFDLEtBQUssRUFBRSxLQUFLLEVBQUUsQ0FBQyxFQUFFLEVBQUU7WUFDbEQsT0FBTyxDQUFDLEdBQUcsQ0FBQyxxQ0FBcUMsQ0FBQyxHQUFHLEVBQUUsS0FBSyxDQUFDLENBQUM7WUFFOUQsdUNBQXVDO1lBQ3ZDLE1BQU0sUUFBUSxHQUFHLE1BQU0sTUFBTSxDQUFDLEtBQUssQ0FBQyxNQUFNLENBQUMsTUFBTSxDQUFDO2dCQUNoRCxLQUFLLEVBQUUsNEJBQTRCO2dCQUNuQyxLQUFLLEVBQUUsS0FBSztnQkFDWixZQUFZLEVBQUUsR0FBRyxZQUFZLHdLQUF3SyxLQUFLLENBQUMsUUFBUSxnQ0FBZ0M7Z0JBQ25QLEtBQUssRUFBRSxLQUFLLENBQUMsU0FBUzthQUN2QixDQUFDLENBQUM7WUFDSCwwQ0FBMEM7WUFDMUMsT0FB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LENBQUM7UUFFakQsdUNBQXVDO1FBQ3ZDLE1BQU0sU0FBUyxHQUFHLE9BQU8sQ0FBQyxHQUFHLENBQUMsQ0FBQyxNQUFNLEVBQUUsRUFBRSxDQUFDLE1BQU0sQ0FBQyxRQUFRLENBQUMsQ0FBQztRQUMzRCxNQUFNLFNBQVMsR0FBRyxPQUFPLENBQUMsR0FBRyxDQUFDLENBQUMsTUFBTSxFQUFFLEVBQUUsQ0FBQyxNQUFNLENBQUMsWUFBWSxDQUFDLENBQUM7UUFFL0QsT0FBTyxDQUFDLEdBQUcsQ0FDVCw2QkFBNkIsT0FBTyxDQUFDLE1BQU0scUJBQXFCLENBQ2pFLENBQUM7UUFDRixPQUFPLEVBQUUsU0FBUyxFQUFFLENBQUM7SUFDdkIsQ0FBQztJQUFDLE9BQU8sS0FBSyxFQUFFLENBQUM7UUFDZixPQUFPLENBQUMsS0FBSyxDQUFDLCtCQUErQixFQUFFLEtBQUssQ0FBQyxDQUFDO1FBQ3RELE1BQU0sS0FBSyxDQUFDO0lBQ2QsQ0FBQztBQUNILENBQUMiLCJzb3VyY2VzQ29udGVudCI6WyJpbXBvcnQgeyBTM0NsaWVudCwgUHV0T2JqZWN0Q29tbWFuZCB9IGZyb20gJ0Bhd3Mtc2RrL2NsaWVudC1zMyc7XG5cbmltcG9ydCBPcGVuQUkgZnJvbSAnb3BlbmFpJztcblxuaW1wb3J0IHsgU2NlbmUgfSBmcm9tICcuL3NjcmlwdCc7XG5cbmNvbnN0IHMzID0gbmV3IFMzQ2xpZW50KHsgcmVnaW9uOiBwcm9jZXNzLmVudi5BV1NfUkVHSU9OIH0pO1xuY29uc3Qgb3BlbmFpID0gbmV3IE9wZW5BSSh7IGFwaUtleTogcHJvY2Vzcy5lbnYuT1BFTkFJX0FQSV9LRVkgfSk7XG5cbmV4cG9ydCBpbnRlcmZhY2UgU3VidGl0bGVXb3JkIHtcbiAgd29yZDogc3RyaW5nO1xuICBzdGFydDogbnVtYmVyO1xuICBlbmQ6IG51bWJlcjtcbn1cblxuZXhwb3J0IGludGVyZmFjZSBTdWJ0aXRsZURhdGEge1xuICBzY2VuZVBvc2l0aW9uOiBudW1iZXI7XG4gIHdvcmRzOiBTdWJ0aXRsZVdvcmRbXTtcbiAgZnVsbFRleHQ6IHN0cmluZztcbiAgZHVyYXRpb24/OiBudW1iZXI7XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgTmFycmF0aW9uUmVzdWx0IHtcbiAgc3VidGl0bGVzOiBTdWJ0aXRsZURhdGFbXTtcbn1cblxuZXhwb3J0IGludGVyZmFjZSBUcmFuc2NyaXB0aW9uUmVzcG9uc2Uge1xuICB0YXNrOiBzdHJpbmc7XG4gIGxhbmd1YWdlOiBzdHJpbmc7XG4gIGR1cmF0aW9uOiBudW1iZXI7XG4gIHRleHQ6IHN0cmluZztcbiAgd29yZHM6IFN1YnRpdGxlV29yZFtdO1xuICB1c2FnZToge1xuICAgIHR5cGU6IHN0cmluZztcbiAgICBzZWNvbmRzOiBudW1iZXI7XG4gIH07XG59XG5cbi8qKlxuICogQWRqdXN0cyBhdWRpbyBkdXJhdGlvbiB0byBtYXRjaCB0YXJnZXQgZHVyYXRpb24gdXNpbmcgRkZtcGVnXG4gKiBAcGFyYW0gYXVkaW9CdWZmZXIgLSBUaGUgb3JpZ2luYWwgYXVkaW8gYnVmZmVyXG4gKiBAcGFyYW0gdGFyZ2V0RHVyYXRpb24gLSBUaGUgdGFyZ2V0IGR1cmF0aW9uIGluIHNlY29uZHNcbiAqIEByZXR1cm5zIFByb21pc2U8QnVmZmVyPiAtIFRoZSBhZGp1c3RlZCBhdWRpbyBidWZmZXJcbiAqL1xuXG5leHBvcnQgYXN5bmMgZnVuY3Rpb24gZ2VuZXJhdGVOYXJyYXRpb24oXG4gIHNjZW5lczogU2NlbmVbXSxcbiAgdXNlcklkOiBzdHJpbmcsXG4gIHRpbWVzdGFtcDogc3RyaW5nLFxuICBpbnN0cnVjdGlvbnM6IHN0cmluZyA9ICdTcGVhayBpbiBhIGNoZWVyZnVsIGFuZCBwb3NpdGl2ZSB0b25lJyxcbiAgdm9pY2U6IHN0cmluZyA9ICdhbGxveScsXG4gIGxhbmd1YWdlOiBzdHJpbmcgPSAnZW4nLFxuKTogUHJvbWlzZTxOYXJyYXRpb25SZXN1bHQ+IHtcbiAgY29uc29sZS5sb2coXG4gICAgJ/CfjqQgR2VuZXJhdGluZyBuYXJyYXRpb24gZnJvbSBzY2VuZXMgd2l0aCB3b3JkLWxldmVsIHRpbWVzdGFtcHMuLi4nLFxuICApO1xuICB0cnkge1xuICAgIC8vIFByb2Nlc3MgYWxsIHNjZW5lcyBpbiBwYXJhbGxlbFxuICAgIGNvbnN0IHNjZW5lUHJvbWlzZXMgPSBzY2VuZXMubWFwKGFzeW5jIChzY2VuZSwgaSkgPT4ge1xuICAgICAgY29uc29sZS5sb2coYPCfjqQgR2VuZXJhdGluZyBuYXJyYXRpb24gZm9yIHNjZW5lICR7aX06YCwgc2NlbmUpO1xuXG4gICAgICAvLyBHZW5lcmF0ZSBzcGVlY2ggd2l0aCBzdGFuZGFyZCBmb3JtYXRcbiAgICAgIGNvbnN0IHJlc3BvbnNlID0gYXdhaXQgb3BlbmFpLmF1ZGlvLnNwZWVjaC5jcmVhdGUoe1xuICAgICAgICBtb2RlbDogJ2dwdC00by1taW5pLXR0cy0yMDI1LTEyLTE1JyxcbiAgICAgICAgdm9pY2U6IHZvaWNlLFxuICAgICAgICBpbnN0cnVjdGlvbnM6IGAke2luc3RydWN0aW9uc30gU3BlYWsgbGlrZSBhIHdhcm0sIG91dGdvaW5nIGZyaWVuZCBzaGFyaW5nIHRoaXMgaW4gcGVyc29uIOKAlCBuYXR1cmFsIHJoeXRobSwgZ2VudWluZSBlbmVyZ3ksIHJlbGF4ZWQgcGFjaW5nIHdpdGggcmVhbCBicmVhdGhzLCBub3QgYSBzY3JpcHRlZCByZWFkLiBLZWVwIGR1cmF0aW9uIGluICR7c2NlbmUuZHVyYXRpb259cyBoYXJkIGNhcC4gQXZvaWQgbG9uZyBwYXVzZXMuYCxcbiAgICAgICAgaW5wdXQ6IHNjZW5lLm5hcnJhdGlvbixcbiAgICAgIH0pO1xuICAgICAgLy8gQ2hlY2sgaWYgcmVzcG9uc2UgaGFzIGR1cmF0aW9uIG1ldGFkYXRhXG4gICAgICBjb25zb2xlLmxvZygnUmVzcG9uc2UgYXVkaW8gZGF0YTonLCBKU09OLnN0cmluZ2lmeShyZXNwb25zZSwgbnVsbCwgMikpO1xuXG4gICAgICBjb25zdCBvcmlnaW5hbEF1ZGlvQnVmZmVyID0gQnVmZmVyLmZyb20oYXdhaXQgcmVzcG9uc2UuYXJyYXlCdWZmZXIoKSk7XG5cbiAgICAgIC8vIFNhdmUgdG8gUzMgd2l0aCB0aW1lc3RhbXAgcHJlZml4IHVzaW5nIHNjZW5lLmlkXG4gICAgICBjb25zdCBhdWRpb0tleSA9IGAke3VzZXJJZH0vJHt0aW1lc3RhbXB9LnNjZW5lLSR7c2NlbmUuaWR9Lm1wM2A7XG5cbiAgICAgIGF3YWl0IHMzLnNlbmQoXG4gICAgICAgIG5ldyBQdXRPYmplY3RDb21tYW5kKHtcbiAgICAgICAgICBCdWNrZXQ6IHByb2Nlc3MuZW52LlZJREVPX1BBUlRTX0JVQ0tFVF9OQU1FLFxuICAgICAgICAgIEtleTogYXVkaW9LZXksXG4gICAgICAgICAgQm9keTogb3JpZ2luYWxBdWRpb0J1ZmZlcixcbiAgICAgICAgICBDb250ZW50VHlwZTogJ2F1ZGlvL21wZWcnLFxuICAgICAgICB9KSxcbiAgICAgICk7XG5cbiAgICAgIC8vIEdldCB3b3JkLWxldmVsIHRpbWVzdGFtcHMgdXNpbmcgdHJhbnNjcmlwdGlvblxuXG4gICAgICAvLyBXcml0ZSBhZGp1c3RlZCBhdWRpbyBidWZmZXIgdG8gdGVtcG9yYXJ5IGZpbGUgZm9yIHRyYW5zY3JpcHRpb25cbiAgICAgIGNvbnN0IGZzID0gcmVxdWlyZSgnZnMnKTtcbiAgICAgIGNvbnN0IG9zID0gcmVxdWlyZSgnb3MnKTtcbiAgICAgIGNvbnN0IHBhdGggPSByZXF1aXJlKCdwYXRoJyk7XG5cbiAgICAgIGNvbnN0IHRlbXBBdWRpb1BhdGggPSBwYXRoLmpvaW4oXG4gICAgICAgIG9zLnRtcGRpcigpLFxuICAgICAgICBgc2NlbmUtJHtpfS0ke3RpbWVzdGFtcH0ubXAzYCxcbiAgICAgICk7XG4gICAgICBmcy53cml0ZUZpbGVTeW5jKHRlbXBBdWRpb1BhdGgsIG9yaWdpbmFsQXVkaW9CdWZmZXIpO1xuXG4gICAgICAvLyBDcmVhdGUgZmlsZSBvYmplY3QgZm9yIE9wZW5BSSBBUElcbiAgICAgIGNvbnN0IGF1ZGlvRmlsZSA9IGZzLmNyZWF0ZVJlYWRTdHJlYW0odGVtcEF1ZGlvUGF0aCk7XG5cbiAgICAgIGNvbnN0IHRyYW5zY3JpcHRpb24gPSAoYXdhaXQgb3BlbmFpLmF1ZGlvLnRyYW5zY3JpcHRpb25zLmNyZWF0ZSh7XG4gICAgICAgIGZpbGU6IGF1ZGlvRmlsZSxcbiAgICAgICAgbW9kZWw6ICd3aGlzcGVyLTEnLFxuICAgICAgICByZXNwb25zZV9mb3JtYXQ6ICd2ZXJib3NlX2pzb24nLFxuICAgICAgICB0aW1lc3RhbXBfZ3JhbnVsYXJpdGllczogWyd3b3JkJ10sXG4gICAgICAgIGxhbmd1YWdlOiBsYW5ndWFnZSxcbiAgICAgIH0pKSBhcyBUcmFuc2NyaXB0aW9uUmVzcG9uc2U7XG5cbiAgICAgIC8vIFNhdmUgdHJhbnNjcmlwdGlvbiB0byBTM1xuICAgICAgLy8gY29uc3QgdHJhbnNjcmlwdGlvbktleSA9IGAke3VzZXJJZH0vJHt0aW1lc3RhbXB9LnNjZW5lLSR7c2NlbmUuaWR9LnRyYW5zY3JpcHRpb24uanNvbmA7XG4gICAgICAvLyBhd2FpdCBzMy5zZW5kKFxuICAgICAgLy8gICBuZXcgUHV0T2JqZWN0Q29tbWFuZCh7XG4gICAgICAvLyAgICAgQnVja2V0OiBwcm9jZXNzLmVudi5WSURFT19QQVJUU19CVUNLRVRfTkFNRSxcbiAgICAgIC8vICAgICBLZXk6IHRyYW5zY3JpcHRpb25LZXksXG4gICAgICAvLyAgICAgQm9keTogSlNPTi5zdHJpbmdpZnkodHJhbnNjcmlwdGlvbiksXG4gICAgICAvLyAgIH0pLFxuICAgICAgLy8gKTtcblxuICAgICAgY29uc3Qgc3VidGl0bGVEYXRhOiBTdWJ0aXRsZURhdGEgPSB7XG4gICAgICAgIHNjZW5lUG9zaXRpb246IHNjZW5lLmlkLFxuICAgICAgICB3b3JkczogW10sXG4gICAgICAgIGZ1bGxUZXh0OiBzY2VuZS5uYXJyYXRpb24sIC8vIFVzZSBvcmlnaW5hbCBuYXJyYXRpb24gdGV4dCBpbnN0ZWFkIG9mIHRyYW5zY3JpYmVkIHRleHRcbiAgICAgIH07XG5cbiAgICAgIC8vIEV4dHJhY3Qgd29yZC1sZXZlbCB0aW1lc3RhbXBzIGZyb20gdGhlIHRyYW5zY3JpcHRpb24gcmVzcG9uc2VcbiAgICAgIGlmICh0cmFuc2NyaXB0aW9uLndvcmRzICYmIEFycmF5LmlzQXJyYXkodHJhbnNjcmlwdGlvbi53b3JkcykpIHtcbiAgICAgICAgc3VidGl0bGVEYXRhLndvcmRzID0gdHJhbnNjcmlwdGlvbi53b3Jkcy5tYXAoKHdvcmQ6IGFueSkgPT4gKHtcbiAgICAgICAgICB3b3JkOiB3b3JkLndvcmQsXG4gICAgICAgICAgc3RhcnQ6IHdvcmQuc3RhcnQsXG4gICAgICAgICAgZW5kOiB3b3JkLmVuZCxcbiAgICAgICAgfSkpO1xuICAgICAgICBzdWJ0aXRsZURhdGEuZHVyYXRpb24gPSB0cmFuc2NyaXB0aW9uLnVzYWdlLnNlY29uZHM7XG4gICAgICAgIGNvbnNvbGUubG9nKGDwn5SNIFNjZW5lICR7aX06IFdvcmQgdGltZXN0YW1wcyBleHRyYWN0ZWQgc3VjY2Vzc2Z1bGx5YCk7XG4gICAgICAgIC8vIFdvcmQgdGltZXN0YW1wcyBleHRyYWN0ZWQgc3VjY2Vzc2Z1bGx5XG4gICAgICB9IGVsc2Uge1xuICAgICAgICBjb25zb2xlLmxvZyhg8J+UjSBTY2VuZSAke2l9OiBObyB3b3JkIHRpbWVzdGFtcHMgZm91bmQsIHVzaW5nIGZhbGxiYWNrYCk7XG4gICAgICAgIC8vIFVzaW5nIGZhbGxiYWNrIHdvcmQgdGltZXN0YW1wc1xuICAgICAgICAvLyBGYWxsYmFjazogY3JlYXRlIGEgc2ltcGxlIHdvcmQtbGV2ZWwgYnJlYWtkb3duIHdpdGhvdXQgcHJlY2lzZSB0aW1lc3RhbXBzXG4gICAgICAgIGNvbnN0IHdvcmRzID0gc2NlbmUubmFycmF0aW9uXG4gICAgICAgICAgLnNwbGl0KCcgJylcbiAgICAgICAgICAuZmlsdGVyKCh3b3JkKSA9PiB3b3JkLmxlbmd0aCA+IDApO1xuICAgICAgICBjb25zdCBlc3RpbWF0ZWREdXJhdGlvbiA9IHNjZW5lLmR1cmF0aW9uO1xuICAgICAgICBjb25zdCB0aW1lUGVyV29yZCA9IGVzdGltYXRlZER1cmF0aW9uIC8gd29yZHMubGVuZ3RoO1xuXG4gICAgICAgIHN1YnRpdGxlRGF0YS53b3JkcyA9IHdvcmRzLm1hcCgod29yZCwgaW5kZXgpID0+ICh7XG4gICAgICAgICAgd29yZCxcbiAgICAgICAgICBzdGFydDogaW5kZXggKiB0aW1lUGVyV29yZCxcbiAgICAgICAgICBlbmQ6IChpbmRleCArIDEpICogdGltZVBlcldvcmQsXG4gICAgICAgIH0pKTtcbiAgICAgIH1cblxuICAgICAgLy8gQ2xlYW4gdXAgdGVtcG9yYXJ5IGZpbGVcbiAgICAgIGZzLnVubGlua1N5bmModGVtcEF1ZGlvUGF0aCk7XG5cbiAgICAgIC8vIFNhdmUgY29tcGxldGUgc3VidGl0bGUgZGF0YSB0byBTMyAoaW5jbHVkaW5nIGZ1bGxUZXh0KVxuICAgICAgY29uc3Qgc3VidGl0bGVLZXkgPSBgJHt1c2VySWR9LyR7dGltZXN0YW1wfS5zY2VuZS0ke3NjZW5lLmlkfS5zdWJ0aXRsZS5qc29uYDtcbiAgICAgIGF3YWl0IHMzLnNlbmQoXG4gICAgICAgIG5ldyBQdXRPYmplY3RDb21tYW5kKHtcbiAgICAgICAgICBCdWNrZXQ6IHByb2Nlc3MuZW52LlZJREVPX1BBUlRTX0JVQ0tFVF9OQU1FLFxuICAgICAgICAgIEtleTogc3VidGl0bGVLZXksXG4gICAgICAgICAgQm9keTogSlNPTi5zdHJpbmdpZnkoc3VidGl0bGVEYXRhKSxcbiAgICAgICAgfSksXG4gICAgICApO1xuXG4gICAgICByZXR1cm4ge1xuICAgICAgICBhdWRpb0tleSxcbiAgICAgICAgc3VidGl0bGVEYXRhLFxuICAgICAgfTtcbiAgICB9KTtcblxuICAgIC8vIFdhaXQgZm9yIGFsbCBzY2VuZXMgdG8gY29tcGxldGVcbiAgICBjb25zdCByZXN1bHRzID0gYXdhaXQgUHJvbWlzZS5hbGwoc2NlbmVQcm9taXNlcyk7XG5cbiAgICAvLyBFeHRyYWN0IHJlc3VsdHMgaW4gdGhlIGNvcnJlY3Qgb3JkZXJcbiAgICBjb25zdCBhdWRpb0tleXMgPSByZXN1bHRzLm1hcCgocmVzdWx0KSA9PiByZXN1bHQuYXVkaW9LZXkpO1xuICAgIGNvbnN0IHN1YnRpdGxlcyA9IHJlc3VsdHMubWFwKChyZXN1bHQpID0+IHJlc3VsdC5zdWJ0aXRsZURhdGEpO1xuXG4gICAgY29uc29sZS5sb2coXG4gICAgICBg4pyFIEdlbmVyYXRlZCBuYXJyYXRpb24gZm9yICR7cmVzdWx0cy5sZW5ndGh9IHNjZW5lcyBpbiBwYXJhbGxlbGAsXG4gICAgKTtcbiAgICByZXR1cm4geyBzdWJ0aXRsZXMgfTtcbiAgfSBjYXRjaCAoZXJyb3IpIHtcbiAgICBjb25zb2xlLmVycm9yKCfinYwgRXJyb3IgaW4gZ2VuZXJhdGVOYXJyYXRpb246JywgZXJyb3IpO1xuICAgIHRocm93IGVycm9yO1xuICB9XG59XG4iXX0=