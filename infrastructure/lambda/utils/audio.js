"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.generateNarration = generateNarration;
const client_s3_1 = require("@aws-sdk/client-s3");
const s3_request_presigner_1 = require("@aws-sdk/s3-request-presigner");
const openai_1 = require("openai");
const s3 = new client_s3_1.S3Client({ region: process.env.AWS_REGION });
const openai = new openai_1.default({ apiKey: process.env.OPENAI_API_KEY });
/**
 * Adjusts audio duration to match target duration using FFmpeg
 * @param audioBuffer - The original audio buffer
 * @param targetDuration - The target duration in seconds
 * @returns Promise<Buffer> - The adjusted audio buffer
 */
async function generateNarration(scenes, userId, timestamp, instructions = 'Speak in a cheerful and positive tone', voice = 'alloy') {
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
            const transcription = await openai.audio.transcriptions.create({
                file: audioFile,
                model: 'whisper-1',
                response_format: 'verbose_json',
                timestamp_granularities: ['word'],
                language: 'en',
            });
            // Save transcription to S3
            // const transcriptionKey = `${userId}/${timestamp}.scene-${scene.id}.transcription.json`;
            // await s3.send(
            //   new PutObjectCommand({
            //     Bucket: process.env.VIDEO_PARTS_BUCKET_NAME,
            //     Key: transcriptionKey,
            //     Body: JSON.stringify(transcription),
            //   }),
            // );
            // Clean up temporary file
            fs.unlinkSync(tempAudioPath);
            const subtitleData = {
                sceneIndex: scene.id,
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
        // Generate signed URLs for all audio files with filename mapping
        const narrationUrls = await Promise.all(audioKeys.map(async (audioKey) => {
            const signedUrl = await (0, s3_request_presigner_1.getSignedUrl)(s3, new client_s3_1.GetObjectCommand({
                Bucket: process.env.VIDEO_PARTS_BUCKET_NAME,
                Key: audioKey,
            }), { expiresIn: 36000 });
            // Extract filename without user prefix (e.g., "1004.scene-1.mp3")
            const filename = audioKey.replace(`${userId}/`, '');
            return { [filename]: signedUrl };
        }));
        console.log(`✅ Generated narration for ${results.length} scenes in parallel`);
        return { subtitles, narrationUrls };
    }
    catch (error) {
        console.error('❌ Error in generateNarration:', error);
        throw error;
    }
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiYXVkaW8uanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyJhdWRpby50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiOztBQXFDQSw4Q0E0SkM7QUFqTUQsa0RBSTRCO0FBQzVCLHdFQUE2RDtBQUM3RCxtQ0FBNEI7QUFJNUIsTUFBTSxFQUFFLEdBQUcsSUFBSSxvQkFBUSxDQUFDLEVBQUUsTUFBTSxFQUFFLE9BQU8sQ0FBQyxHQUFHLENBQUMsVUFBVSxFQUFFLENBQUMsQ0FBQztBQUM1RCxNQUFNLE1BQU0sR0FBRyxJQUFJLGdCQUFNLENBQUMsRUFBRSxNQUFNLEVBQUUsT0FBTyxDQUFDLEdBQUcsQ0FBQyxjQUFjLEVBQUUsQ0FBQyxDQUFDO0FBbUJsRTs7Ozs7R0FLRztBQUVJLEtBQUssVUFBVSxpQkFBaUIsQ0FDckMsTUFBZSxFQUNmLE1BQWMsRUFDZCxTQUFpQixFQUNqQixlQUF1Qix1Q0FBdUMsRUFDOUQsUUFBZ0IsT0FBTztJQUV2QixPQUFPLENBQUMsR0FBRyxDQUNULG1FQUFtRSxDQUNwRSxDQUFDO0lBQ0YsSUFBSSxDQUFDO1FBQ0gsaUNBQWlDO1FBQ2pDLE1BQU0sYUFBYSxHQUFHLE1BQU0sQ0FBQyxHQUFHLENBQUMsS0FBSyxFQUFFLEtBQUssRUFBRSxDQUFDLEVBQUUsRUFBRTtZQUNsRCxPQUFPLENBQUMsR0FBRyxDQUFDLHFDQUFxQyxDQUFDLEdBQUcsRUFBRSxLQUFLLENBQUMsQ0FBQztZQUU5RCx1Q0FBdUM7WUFDdkMsTUFBTSxRQUFRLEdBQUcsTUFBTSxNQUFNLENBQUMsS0FBSyxDQUFDLE1BQU0sQ0FBQyxNQUFNLENBQUM7Z0JBQ2hELEtBQUssRUFBRSxpQkFBaUI7Z0JBQ3hCLEtBQUssRUFBRSxLQUFLO2dCQUNaLFlBQVksRUFBRSxzQ0FBc0MsS0FBSyxDQUFDLFFBQVEsZ0NBQWdDO2dCQUNsRyxLQUFLLEVBQUUsS0FBSyxDQUFDLFNBQVM7YUFDdkIsQ0FBQyxDQUFDO1lBRUgsTUFBTSxtQkFBbUIsR0FBRyxNQUFNLENBQUMsSUFB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LENBQUM7UUFFL0QsaUVBQWlFO1FBQ2pFLE1BQU0sYUFBYSxHQUFHLE1BQU0sT0FBTyxDQUFDLEdBQUcsQ0FDckMsU0FBUyxDQUFDLEdBQUcsQ0FBQyxLQUFLLEVBQUUsUUFBUSxFQUFFLEVBQUU7WUFDL0IsTUFBTSxTQUFTLEdBQUcsTUFBTSxJQUFBLG1DQUFZLEVBQ2xDLEVBQUUsRUFDRixJQUFJLDRCQUFnQixDQUFDO2dCQUNuQixNQUFNLEVBQUUsT0FBTyxDQUFDLEdBQUcsQ0FBQyx1QkFBdUI7Z0JBQzNDLEdBQUcsRUFBRSxRQUFRO2FBQ2QsQ0FBQyxFQUNGLEVBQUUsU0FBUyxFQUFFLEtBQUssRUFBRSxDQUNyQixDQUFDO1lBRUYsa0VBQWtFO1lBQ2xFLE1BQU0sUUFBUSxHQUFHLFFBQVEsQ0FBQyxPQUFPLENBQUMsR0FBRyxNQUFNLEdBQUcsRUFBRSxFQUFFLENBQUMsQ0FBQztZQUVwRCxPQUFPLEVBQUUsQ0FBQyxRQUFRLENBQUMsRUFBRSxTQUFTLEVBQUUsQ0FBQztRQUNuQyxDQUFDLENBQUMsQ0FDSCxDQUFDO1FBRUYsT0FBTyxDQUFDLEdBQUcsQ0FDVCw2QkFBNkIsT0FBTyxDQUFDLE1BQU0scUJBQXFCLENBQ2pFLENBQUM7UUFDRixPQUFPLEVBQUUsU0FBUyxFQUFFLGFBQWEsRUFBRSxDQUFDO0lBQ3RDLENBQUM7SUFBQyxPQUFPLEtBQUssRUFBRSxDQUFDO1FBQ2YsT0FBTyxDQUFDLEtBQUssQ0FBQywrQkFBK0IsRUFBRSxLQUFLLENBQUMsQ0FBQztRQUN0RCxNQUFNLEtBQUssQ0FBQztJQUNkLENBQUM7QUFDSCxDQUFDIiwic291cmNlc0NvbnRlbnQiOlsiaW1wb3J0IHtcbiAgUzNDbGllbnQsXG4gIFB1dE9iamVjdENvbW1hbmQsXG4gIEdldE9iamVjdENvbW1hbmQsXG59IGZyb20gJ0Bhd3Mtc2RrL2NsaWVudC1zMyc7XG5pbXBvcnQgeyBnZXRTaWduZWRVcmwgfSBmcm9tICdAYXdzLXNkay9zMy1yZXF1ZXN0LXByZXNpZ25lcic7XG5pbXBvcnQgT3BlbkFJIGZyb20gJ29wZW5haSc7XG5cbmltcG9ydCB7IFNjZW5lIH0gZnJvbSAnLi4vdmlkZW8tZ2VuZXJhdGlvbi9zY3JpcHQnO1xuXG5jb25zdCBzMyA9IG5ldyBTM0NsaWVudCh7IHJlZ2lvbjogcHJvY2Vzcy5lbnYuQVdTX1JFR0lPTiB9KTtcbmNvbnN0IG9wZW5haSA9IG5ldyBPcGVuQUkoeyBhcGlLZXk6IHByb2Nlc3MuZW52Lk9QRU5BSV9BUElfS0VZIH0pO1xuXG5leHBvcnQgaW50ZXJmYWNlIFN1YnRpdGxlV29yZCB7XG4gIHdvcmQ6IHN0cmluZztcbiAgc3RhcnQ6IG51bWJlcjtcbiAgZW5kOiBudW1iZXI7XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgU3VidGl0bGVEYXRhIHtcbiAgc2NlbmVJbmRleDogbnVtYmVyO1xuICB3b3JkczogU3VidGl0bGVXb3JkW107XG4gIGZ1bGxUZXh0OiBzdHJpbmc7XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgTmFycmF0aW9uUmVzdWx0IHtcbiAgc3VidGl0bGVzOiBTdWJ0aXRsZURhdGFbXTtcbiAgbmFycmF0aW9uVXJsczogQXJyYXk8eyBba2V5OiBzdHJpbmddOiBzdHJpbmcgfT47IC8vIEZvcm1hdDogW3sgXCJ0aW1lc3RhbXAuc2NlbmUtaWQubXAzXCI6IFwic2lnbmVkLXVybFwiIH1dXG59XG5cbi8qKlxuICogQWRqdXN0cyBhdWRpbyBkdXJhdGlvbiB0byBtYXRjaCB0YXJnZXQgZHVyYXRpb24gdXNpbmcgRkZtcGVnXG4gKiBAcGFyYW0gYXVkaW9CdWZmZXIgLSBUaGUgb3JpZ2luYWwgYXVkaW8gYnVmZmVyXG4gKiBAcGFyYW0gdGFyZ2V0RHVyYXRpb24gLSBUaGUgdGFyZ2V0IGR1cmF0aW9uIGluIHNlY29uZHNcbiAqIEByZXR1cm5zIFByb21pc2U8QnVmZmVyPiAtIFRoZSBhZGp1c3RlZCBhdWRpbyBidWZmZXJcbiAqL1xuXG5leHBvcnQgYXN5bmMgZnVuY3Rpb24gZ2VuZXJhdGVOYXJyYXRpb24oXG4gIHNjZW5lczogU2NlbmVbXSxcbiAgdXNlcklkOiBzdHJpbmcsXG4gIHRpbWVzdGFtcDogc3RyaW5nLFxuICBpbnN0cnVjdGlvbnM6IHN0cmluZyA9ICdTcGVhayBpbiBhIGNoZWVyZnVsIGFuZCBwb3NpdGl2ZSB0b25lJyxcbiAgdm9pY2U6IHN0cmluZyA9ICdhbGxveScsXG4pOiBQcm9taXNlPE5hcnJhdGlvblJlc3VsdD4ge1xuICBjb25zb2xlLmxvZyhcbiAgICAn8J+OpCBHZW5lcmF0aW5nIG5hcnJhdGlvbiBmcm9tIHNjZW5lcyB3aXRoIHdvcmQtbGV2ZWwgdGltZXN0YW1wcy4uLicsXG4gICk7XG4gIHRyeSB7XG4gICAgLy8gUHJvY2VzcyBhbGwgc2NlbmVzIGluIHBhcmFsbGVsXG4gICAgY29uc3Qgc2NlbmVQcm9taXNlcyA9IHNjZW5lcy5tYXAoYXN5bmMgKHNjZW5lLCBpKSA9PiB7XG4gICAgICBjb25zb2xlLmxvZyhg8J+OpCBHZW5lcmF0aW5nIG5hcnJhdGlvbiBmb3Igc2NlbmUgJHtpfTpgLCBzY2VuZSk7XG5cbiAgICAgIC8vIEdlbmVyYXRlIHNwZWVjaCB3aXRoIHN0YW5kYXJkIGZvcm1hdFxuICAgICAgY29uc3QgcmVzcG9uc2UgPSBhd2FpdCBvcGVuYWkuYXVkaW8uc3BlZWNoLmNyZWF0ZSh7XG4gICAgICAgIG1vZGVsOiAnZ3B0LTRvLW1pbmktdHRzJyxcbiAgICAgICAgdm9pY2U6IHZvaWNlLFxuICAgICAgICBpbnN0cnVjdGlvbnM6IGBTcGVhayBjbGVhcmx5IGFuZCBrZWVwIGR1cmF0aW9uIGluICR7c2NlbmUuZHVyYXRpb259cyBoYXJkIGNhcC4gQXZvaWQgbG9uZyBwYXVzZXMuYCxcbiAgICAgICAgaW5wdXQ6IHNjZW5lLm5hcnJhdGlvbixcbiAgICAgIH0pO1xuXG4gICAgICBjb25zdCBvcmlnaW5hbEF1ZGlvQnVmZmVyID0gQnVmZmVyLmZyb20oYXdhaXQgcmVzcG9uc2UuYXJyYXlCdWZmZXIoKSk7XG5cbiAgICAgIC8vIFNhdmUgdG8gUzMgd2l0aCB0aW1lc3RhbXAgcHJlZml4IHVzaW5nIHNjZW5lLmlkXG4gICAgICBjb25zdCBhdWRpb0tleSA9IGAke3VzZXJJZH0vJHt0aW1lc3RhbXB9LnNjZW5lLSR7c2NlbmUuaWR9Lm1wM2A7XG5cbiAgICAgIGF3YWl0IHMzLnNlbmQoXG4gICAgICAgIG5ldyBQdXRPYmplY3RDb21tYW5kKHtcbiAgICAgICAgICBCdWNrZXQ6IHByb2Nlc3MuZW52LlZJREVPX1BBUlRTX0JVQ0tFVF9OQU1FLFxuICAgICAgICAgIEtleTogYXVkaW9LZXksXG4gICAgICAgICAgQm9keTogb3JpZ2luYWxBdWRpb0J1ZmZlcixcbiAgICAgICAgICBDb250ZW50VHlwZTogJ2F1ZGlvL21wZWcnLFxuICAgICAgICB9KSxcbiAgICAgICk7XG5cbiAgICAgIC8vIEdldCB3b3JkLWxldmVsIHRpbWVzdGFtcHMgdXNpbmcgdHJhbnNjcmlwdGlvblxuXG4gICAgICAvLyBXcml0ZSBhZGp1c3RlZCBhdWRpbyBidWZmZXIgdG8gdGVtcG9yYXJ5IGZpbGUgZm9yIHRyYW5zY3JpcHRpb25cbiAgICAgIGNvbnN0IGZzID0gcmVxdWlyZSgnZnMnKTtcbiAgICAgIGNvbnN0IG9zID0gcmVxdWlyZSgnb3MnKTtcbiAgICAgIGNvbnN0IHBhdGggPSByZXF1aXJlKCdwYXRoJyk7XG5cbiAgICAgIGNvbnN0IHRlbXBBdWRpb1BhdGggPSBwYXRoLmpvaW4oXG4gICAgICAgIG9zLnRtcGRpcigpLFxuICAgICAgICBgc2NlbmUtJHtpfS0ke3RpbWVzdGFtcH0ubXAzYCxcbiAgICAgICk7XG4gICAgICBmcy53cml0ZUZpbGVTeW5jKHRlbXBBdWRpb1BhdGgsIG9yaWdpbmFsQXVkaW9CdWZmZXIpO1xuXG4gICAgICAvLyBDcmVhdGUgZmlsZSBvYmplY3QgZm9yIE9wZW5BSSBBUElcbiAgICAgIGNvbnN0IGF1ZGlvRmlsZSA9IGZzLmNyZWF0ZVJlYWRTdHJlYW0odGVtcEF1ZGlvUGF0aCk7XG5cbiAgICAgIGNvbnN0IHRyYW5zY3JpcHRpb24gPSBhd2FpdCBvcGVuYWkuYXVkaW8udHJhbnNjcmlwdGlvbnMuY3JlYXRlKHtcbiAgICAgICAgZmlsZTogYXVkaW9GaWxlLFxuICAgICAgICBtb2RlbDogJ3doaXNwZXItMScsXG4gICAgICAgIHJlc3BvbnNlX2Zvcm1hdDogJ3ZlcmJvc2VfanNvbicsXG4gICAgICAgIHRpbWVzdGFtcF9ncmFudWxhcml0aWVzOiBbJ3dvcmQnXSxcbiAgICAgICAgbGFuZ3VhZ2U6ICdlbicsXG4gICAgICB9KTtcblxuICAgICAgLy8gU2F2ZSB0cmFuc2NyaXB0aW9uIHRvIFMzXG4gICAgICAvLyBjb25zdCB0cmFuc2NyaXB0aW9uS2V5ID0gYCR7dXNlcklkfS8ke3RpbWVzdGFtcH0uc2NlbmUtJHtzY2VuZS5pZH0udHJhbnNjcmlwdGlvbi5qc29uYDtcbiAgICAgIC8vIGF3YWl0IHMzLnNlbmQoXG4gICAgICAvLyAgIG5ldyBQdXRPYmplY3RDb21tYW5kKHtcbiAgICAgIC8vICAgICBCdWNrZXQ6IHByb2Nlc3MuZW52LlZJREVPX1BBUlRTX0JVQ0tFVF9OQU1FLFxuICAgICAgLy8gICAgIEtleTogdHJhbnNjcmlwdGlvbktleSxcbiAgICAgIC8vICAgICBCb2R5OiBKU09OLnN0cmluZ2lmeSh0cmFuc2NyaXB0aW9uKSxcbiAgICAgIC8vICAgfSksXG4gICAgICAvLyApO1xuXG4gICAgICAvLyBDbGVhbiB1cCB0ZW1wb3JhcnkgZmlsZVxuICAgICAgZnMudW5saW5rU3luYyh0ZW1wQXVkaW9QYXRoKTtcblxuICAgICAgY29uc3Qgc3VidGl0bGVEYXRhOiBTdWJ0aXRsZURhdGEgPSB7XG4gICAgICAgIHNjZW5lSW5kZXg6IHNjZW5lLmlkLFxuICAgICAgICB3b3JkczogW10sXG4gICAgICAgIGZ1bGxUZXh0OiBzY2VuZS5uYXJyYXRpb24sIC8vIFVzZSBvcmlnaW5hbCBuYXJyYXRpb24gdGV4dCBpbnN0ZWFkIG9mIHRyYW5zY3JpYmVkIHRleHRcbiAgICAgIH07XG5cbiAgICAgIC8vIEV4dHJhY3Qgd29yZC1sZXZlbCB0aW1lc3RhbXBzIGZyb20gdGhlIHRyYW5zY3JpcHRpb24gcmVzcG9uc2VcbiAgICAgIGlmICh0cmFuc2NyaXB0aW9uLndvcmRzICYmIEFycmF5LmlzQXJyYXkodHJhbnNjcmlwdGlvbi53b3JkcykpIHtcbiAgICAgICAgc3VidGl0bGVEYXRhLndvcmRzID0gdHJhbnNjcmlwdGlvbi53b3Jkcy5tYXAoKHdvcmQ6IGFueSkgPT4gKHtcbiAgICAgICAgICB3b3JkOiB3b3JkLndvcmQsXG4gICAgICAgICAgc3RhcnQ6IHdvcmQuc3RhcnQsXG4gICAgICAgICAgZW5kOiB3b3JkLmVuZCxcbiAgICAgICAgfSkpO1xuICAgICAgICBjb25zb2xlLmxvZyhg8J+UjSBTY2VuZSAke2l9OiBXb3JkIHRpbWVzdGFtcHMgZXh0cmFjdGVkIHN1Y2Nlc3NmdWxseWApO1xuICAgICAgICAvLyBXb3JkIHRpbWVzdGFtcHMgZXh0cmFjdGVkIHN1Y2Nlc3NmdWxseVxuICAgICAgfSBlbHNlIHtcbiAgICAgICAgY29uc29sZS5sb2coYPCflI0gU2NlbmUgJHtpfTogTm8gd29yZCB0aW1lc3RhbXBzIGZvdW5kLCB1c2luZyBmYWxsYmFja2ApO1xuICAgICAgICAvLyBVc2luZyBmYWxsYmFjayB3b3JkIHRpbWVzdGFtcHNcbiAgICAgICAgLy8gRmFsbGJhY2s6IGNyZWF0ZSBhIHNpbXBsZSB3b3JkLWxldmVsIGJyZWFrZG93biB3aXRob3V0IHByZWNpc2UgdGltZXN0YW1wc1xuICAgICAgICBjb25zdCB3b3JkcyA9IHNjZW5lLm5hcnJhdGlvblxuICAgICAgICAgIC5zcGxpdCgnICcpXG4gICAgICAgICAgLmZpbHRlcigod29yZCkgPT4gd29yZC5sZW5ndGggPiAwKTtcbiAgICAgICAgY29uc3QgZXN0aW1hdGVkRHVyYXRpb24gPSBzY2VuZS5kdXJhdGlvbjtcbiAgICAgICAgY29uc3QgdGltZVBlcldvcmQgPSBlc3RpbWF0ZWREdXJhdGlvbiAvIHdvcmRzLmxlbmd0aDtcblxuICAgICAgICBzdWJ0aXRsZURhdGEud29yZHMgPSB3b3Jkcy5tYXAoKHdvcmQsIGluZGV4KSA9PiAoe1xuICAgICAgICAgIHdvcmQsXG4gICAgICAgICAgc3RhcnQ6IGluZGV4ICogdGltZVBlcldvcmQsXG4gICAgICAgICAgZW5kOiAoaW5kZXggKyAxKSAqIHRpbWVQZXJXb3JkLFxuICAgICAgICB9KSk7XG4gICAgICB9XG5cbiAgICAgIC8vIFNhdmUgY29tcGxldGUgc3VidGl0bGUgZGF0YSB0byBTMyAoaW5jbHVkaW5nIGZ1bGxUZXh0KVxuICAgICAgY29uc3Qgc3VidGl0bGVLZXkgPSBgJHt1c2VySWR9LyR7dGltZXN0YW1wfS5zY2VuZS0ke3NjZW5lLmlkfS5zdWJ0aXRsZS5qc29uYDtcbiAgICAgIGF3YWl0IHMzLnNlbmQoXG4gICAgICAgIG5ldyBQdXRPYmplY3RDb21tYW5kKHtcbiAgICAgICAgICBCdWNrZXQ6IHByb2Nlc3MuZW52LlZJREVPX1BBUlRTX0JVQ0tFVF9OQU1FLFxuICAgICAgICAgIEtleTogc3VidGl0bGVLZXksXG4gICAgICAgICAgQm9keTogSlNPTi5zdHJpbmdpZnkoc3VidGl0bGVEYXRhKSxcbiAgICAgICAgfSksXG4gICAgICApO1xuXG4gICAgICByZXR1cm4ge1xuICAgICAgICBhdWRpb0tleSxcbiAgICAgICAgc3VidGl0bGVEYXRhLFxuICAgICAgfTtcbiAgICB9KTtcblxuICAgIC8vIFdhaXQgZm9yIGFsbCBzY2VuZXMgdG8gY29tcGxldGVcbiAgICBjb25zdCByZXN1bHRzID0gYXdhaXQgUHJvbWlzZS5hbGwoc2NlbmVQcm9taXNlcyk7XG5cbiAgICAvLyBFeHRyYWN0IHJlc3VsdHMgaW4gdGhlIGNvcnJlY3Qgb3JkZXJcbiAgICBjb25zdCBhdWRpb0tleXMgPSByZXN1bHRzLm1hcCgocmVzdWx0KSA9PiByZXN1bHQuYXVkaW9LZXkpO1xuICAgIGNvbnN0IHN1YnRpdGxlcyA9IHJlc3VsdHMubWFwKChyZXN1bHQpID0+IHJlc3VsdC5zdWJ0aXRsZURhdGEpO1xuXG4gICAgLy8gR2VuZXJhdGUgc2lnbmVkIFVSTHMgZm9yIGFsbCBhdWRpbyBmaWxlcyB3aXRoIGZpbGVuYW1lIG1hcHBpbmdcbiAgICBjb25zdCBuYXJyYXRpb25VcmxzID0gYXdhaXQgUHJvbWlzZS5hbGwoXG4gICAgICBhdWRpb0tleXMubWFwKGFzeW5jIChhdWRpb0tleSkgPT4ge1xuICAgICAgICBjb25zdCBzaWduZWRVcmwgPSBhd2FpdCBnZXRTaWduZWRVcmwoXG4gICAgICAgICAgczMsXG4gICAgICAgICAgbmV3IEdldE9iamVjdENvbW1hbmQoe1xuICAgICAgICAgICAgQnVja2V0OiBwcm9jZXNzLmVudi5WSURFT19QQVJUU19CVUNLRVRfTkFNRSxcbiAgICAgICAgICAgIEtleTogYXVkaW9LZXksXG4gICAgICAgICAgfSksXG4gICAgICAgICAgeyBleHBpcmVzSW46IDM2MDAwIH0sIC8vIDEwIGhvdXJzIGV4cGlyYXRpb25cbiAgICAgICAgKTtcblxuICAgICAgICAvLyBFeHRyYWN0IGZpbGVuYW1lIHdpdGhvdXQgdXNlciBwcmVmaXggKGUuZy4sIFwiMTAwNC5zY2VuZS0xLm1wM1wiKVxuICAgICAgICBjb25zdCBmaWxlbmFtZSA9IGF1ZGlvS2V5LnJlcGxhY2UoYCR7dXNlcklkfS9gLCAnJyk7XG5cbiAgICAgICAgcmV0dXJuIHsgW2ZpbGVuYW1lXTogc2lnbmVkVXJsIH07XG4gICAgICB9KSxcbiAgICApO1xuXG4gICAgY29uc29sZS5sb2coXG4gICAgICBg4pyFIEdlbmVyYXRlZCBuYXJyYXRpb24gZm9yICR7cmVzdWx0cy5sZW5ndGh9IHNjZW5lcyBpbiBwYXJhbGxlbGAsXG4gICAgKTtcbiAgICByZXR1cm4geyBzdWJ0aXRsZXMsIG5hcnJhdGlvblVybHMgfTtcbiAgfSBjYXRjaCAoZXJyb3IpIHtcbiAgICBjb25zb2xlLmVycm9yKCfinYwgRXJyb3IgaW4gZ2VuZXJhdGVOYXJyYXRpb246JywgZXJyb3IpO1xuICAgIHRocm93IGVycm9yO1xuICB9XG59XG4iXX0=