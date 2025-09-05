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
                language: language,
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiYXVkaW8uanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyJhdWRpby50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiOztBQXFDQSw4Q0E2SkM7QUFsTUQsa0RBSTRCO0FBQzVCLHdFQUE2RDtBQUM3RCxtQ0FBNEI7QUFJNUIsTUFBTSxFQUFFLEdBQUcsSUFBSSxvQkFBUSxDQUFDLEVBQUUsTUFBTSxFQUFFLE9BQU8sQ0FBQyxHQUFHLENBQUMsVUFBVSxFQUFFLENBQUMsQ0FBQztBQUM1RCxNQUFNLE1BQU0sR0FBRyxJQUFJLGdCQUFNLENBQUMsRUFBRSxNQUFNLEVBQUUsT0FBTyxDQUFDLEdBQUcsQ0FBQyxjQUFjLEVBQUUsQ0FBQyxDQUFDO0FBbUJsRTs7Ozs7R0FLRztBQUVJLEtBQUssVUFBVSxpQkFBaUIsQ0FDckMsTUFBZSxFQUNmLE1BQWMsRUFDZCxTQUFpQixFQUNqQixlQUF1Qix1Q0FBdUMsRUFDOUQsUUFBZ0IsT0FBTyxFQUN2QixXQUFtQixJQUFJO0lBRXZCLE9BQU8sQ0FBQyxHQUFHLENBQ1QsbUVBQW1FLENBQ3BFLENBQUM7SUFDRixJQUFJLENBQUM7UUFDSCxpQ0FBaUM7UUFDakMsTUFBTSxhQUFhLEdBQUcsTUFBTSxDQUFDLEdBQUcsQ0FBQyxLQUFLLEVBQUUsS0FBSyxFQUFFLENBQUMsRUFBRSxFQUFFO1lBQ2xELE9BQU8sQ0FBQyxHQUFHLENBQUMscUNBQXFDLENBQUMsR0FBRyxFQUFFLEtBQUssQ0FBQyxDQUFDO1lBRTlELHVDQUF1QztZQUN2QyxNQUFNLFFBQVEsR0FBRyxNQUFNLE1BQU0sQ0FBQyxLQUFLLENBQUMsTUFBTSxDQUFDLE1BQU0sQ0FBQztnQkFDaEQsS0FBSyxFQUFFLGlCQUFpQjtnQkFDeEIsS0FBSyxFQUFFLEtBQUs7Z0JBQ1osWUFBWSxFQUFFLHNDQUFzQyxLQUFLLENBQUMsUUFBUSxnQ0FBZ0M7Z0JBQ2xHLEtBQUssRUFBRSxLQUFLLENBQUMsU0FBUzthQUN2QixDQUFDLENBQUM7WUFFSCxNQUFNLG1CQUFtQixHQUFHLE1BQU0sQ0FBQyxJQUFJLENBQUMsTUFBTSxRQUFRLENBQUMsV0FBVyxFQUFFLENBQUMsQ0FBQztZQUV0RSxrREFBa0Q7WUFDbEQsTUFBTSxRQUFRLEdBQUcsR0FBRyxNQUFNLElBQUksU0FBUyxVQUFVLEtBQUssQ0FBQyxFQUFFLE1BQU0sQ0FBQztZQUVoRSxNQUFNLEVBQUUsQ0FBQyxJQUFJLENBQ1gsSUFBSSw0QkFBZ0IsQ0FBQztnQkFDbkIsTUFBTSxFQUFFLE9BQU8sQ0FBQyxHQUFHLENBQUMsdUJBQXVCO2dCQUMzQyxHQUFHLEVBQUUsUUFBUTtnQkFDYixJQUFJLEVBQUUsbUJBQW1CO2dCQUN6QixXQUFXLEVBQUUsWUFBWTthQUMxQixDQUFDLENBQ0gsQ0FBQztZQUVGLGdEQUFnRDtZQUVoRCxrRUFBa0U7WUFDbEUsTUFBTSxFQUFFLEdBQUcsT0FBTyxDQUFDLElBQUksQ0FBQyxDQUFDO1lBQ3pCLE1BQU0sRUFBRSxHQUFHLE9BQU8sQ0FBQyxJQUFJLENBQUMsQ0FBQztZQUN6QixNQUFNLElBQUksR0FBRyxPQUFPLENBQUMsTUFBTSxDQUFDLENBQUM7WUFFN0IsTUFBTSxhQUFhLEdBQUcsSUFBSSxDQUFDLElBQUksQ0FDN0IsRUFBRSxDQUFDLE1BQU0sRUFBRSxFQUNYLFNBQVMsQ0FBQyxJQUFJLFNBQVMsTUFBTSxDQUM5QixDQUFDO1lBQ0YsRUFBRSxDQUFDLGFBQWEsQ0FBQyxhQUFhLEVBQUUsbUJBQW1CLENBQUMsQ0FBQztZQUVyRCxvQ0FBb0M7WUFDcEMsTUFBTSxTQUFTLEdBQUcsRUFBRSxDQUFDLGdCQUFnQixDQUFDLGFBQWEsQ0FBQyxDQUFDO1lBRXJELE1BQU0sYUFBYSxHQUFHLE1BQU0sTUFBTSxDQUFDLEtBQUssQ0FBQyxjQUFjLENBQUMsTUFBTSxDQUFDO2dCQUM3RCxJQUFJLEVBQUUsU0FBUztnQkFDZixLQUFLLEVBQUUsV0FBVztnQkFDbEIsZUFBZSxFQUFFLGNBQWM7Z0JBQy9CLHVCQUF1QixFQUFFLENBQUMsTUFBTSxDQUFDO2dCQUNqQyxRQUFRLEVBQUUsUUFBUTthQUNuQixDQUFDLENBQUM7WUFFSCwyQkFBMkI7WUFDM0IsMEZBQTBGO1lBQzFGLGlCQUFpQjtZQUNqQiwyQkFBMkI7WUFDM0IsbURBQW1EO1lBQ25ELDZCQUE2QjtZQUM3QiwyQ0FBMkM7WUFDM0MsUUFBUTtZQUNSLEtBQUs7WUFFTCwwQkFBMEI7WUFDMUIsRUFBRSxDQUFDLFVBQVUsQ0FBQyxhQUFhLENBQUMsQ0FBQztZQUU3QixNQUFNLFlBQVksR0FBaUI7Z0JBQ2pDLFVBQVUsRUFBRSxLQUFLLENBQUMsRUFBRTtnQkFDcEIsS0FBSyxFQUFFLEVBQUU7Z0JBQ1QsUUFBUSxFQUFFLEtBQUssQ0FBQyxTQUFTLEVBQUUsMERBQTBEO2FBQ3RGLENBQUM7WUFFRixnRUFBZ0U7WUFDaEUsSUFBSSxhQUFhLENBQUMsS0FBSyxJQUFJLEtBQUssQ0FBQyxPQUFPLENBQUMsYUFBYSxDQUFDLEtBQUssQ0FBQyxFQUFFLENBQUM7Z0JBQzlELFlBQVksQ0FBQyxLQUFLLEdBQUcsYUFBYSxDQUFDLEtBQUssQ0FBQyxHQUFHLENBQUMsQ0FBQyxJQUFTLEVBQUUsRUFBRSxDQUFDLENBQUM7b0JBQzNELElBQUksRUFBRSxJQUFJLENBQUMsSUFBSTtvQkFDZixLQUFLLEVBQUUsSUFBSSxDQUFDLEtBQUs7b0JBQ2pCLEdBQUcsRUFBRSxJQUFJLENBQUMsR0FBRztpQkFDZCxDQUFDLENBQUMsQ0FBQztnQkFDSixPQUFPLENBQUMsR0FBRyxDQUFDLFlBQVksQ0FBQywwQ0FBMEMsQ0FBQyxDQUFDO2dCQUNyRSx5Q0FBeUM7WUFDM0MsQ0FBQztpQkFBTSxDQUFDO2dCQUNOLE9BQU8sQ0FBQyxHQUFHLENBQUMsWUFBWSxDQUFDLDRDQUE0QyxDQUFDLENBQUM7Z0JBQ3ZFLGlDQUFpQztnQkFDakMsNEVBQTRFO2dCQUM1RSxNQUFNLEtBQUssR0FBRyxLQUFLLENBQUMsU0FBUztxQkFDMUIsS0FBSyxDQUFDLEdBQUcsQ0FBQztxQkFDVixNQUFNLENBQUMsQ0FBQyxJQUFJLEVBQUUsRUFBRSxDQUFDLElBQUksQ0FBQyxNQUFNLEdBQUcsQ0FBQyxDQUFDLENBQUM7Z0JBQ3JDLE1BQU0saUJBQWlCLEdBQUcsS0FBSyxDQUFDLFFBQVEsQ0FBQztnQkFDekMsTUFBTSxXQUFXLEdBQUcsaUJBQWlCLEdBQUcsS0FBSyxDQUFDLE1BQU0sQ0FBQztnQkFFckQsWUFBWSxDQUFDLEtBQUssR0FBRyxLQUFLLENBQUMsR0FBRyxDQUFDLENBQUMsSUFBSSxFQUFFLEtBQUssRUFBRSxFQUFFLENBQUMsQ0FBQztvQkFDL0MsSUFBSTtvQkFDSixLQUFLLEVBQUUsS0FBSyxHQUFHLFdBQVc7b0JBQzFCLEdBQUcsRUFBRSxDQUFDLEtBQUssR0FBRyxDQUFDLENBQUMsR0FBRyxXQUFXO2lCQUMvQixDQUFDLENBQUMsQ0FBQztZQUNOLENBQUM7WUFFRCx5REFBeUQ7WUFDekQsTUFBTSxXQUFXLEdBQUcsR0FBRyxNQUFNLElBQUksU0FBUyxVQUFVLEtBQUssQ0FBQyxFQUFFLGdCQUFnQixDQUFDO1lBQzdFLE1BQU0sRUFBRSxDQUFDLElBQUksQ0FDWCxJQUFJLDRCQUFnQixDQUFDO2dCQUNuQixNQUFNLEVBQUUsT0FBTyxDQUFDLEdBQUcsQ0FBQyx1QkFBdUI7Z0JBQzNDLEdBQUcsRUFBRSxXQUFXO2dCQUNoQixJQUFJLEVBQUUsSUFBSSxDQUFDLFNBQVMsQ0FBQyxZQUFZLENBQUM7YUFDbkMsQ0FBQyxDQUNILENBQUM7WUFFRixPQUFPO2dCQUNMLFFBQVE7Z0JBQ1IsWUFBWTthQUNiLENBQUM7UUFDSixDQUFDLENBQUMsQ0FBQztRQUVILGtDQUFrQztRQUNsQyxNQUFNLE9BQU8sR0FBRyxNQUFNLE9BQU8sQ0FBQyxHQUFHLENBQUMsYUFBYSxDQUFDLENBQUM7UUFFakQsdUNBQXVDO1FBQ3ZDLE1BQU0sU0FBUyxHQUFHLE9BQU8sQ0FBQyxHQUFHLENBQUMsQ0FBQyxNQUFNLEVBQUUsRUFBRSxDQUFDLE1BQU0sQ0FBQyxRQUFRLENBQUMsQ0FBQztRQUMzRCxNQUFNLFNBQVMsR0FBRyxPQUFPLENBQUMsR0FBRyxDQUFDLENBQUMsTUFBTSxFQUFFLEVBQUUsQ0FBQyxNQUFNLENBQUMsWUFBWSxDQUFDLENBQUM7UUFFL0QsaUVBQWlFO1FBQ2pFLE1BQU0sYUFBYSxHQUFHLE1BQU0sT0FBTyxDQUFDLEdBQUcsQ0FDckMsU0FBUyxDQUFDLEdBQUcsQ0FBQyxLQUFLLEVBQUUsUUFBUSxFQUFFLEVBQUU7WUFDL0IsTUFBTSxTQUFTLEdBQUcsTUFBTSxJQUFBLG1DQUFZLEVBQ2xDLEVBQUUsRUFDRixJQUFJLDRCQUFnQixDQUFDO2dCQUNuQixNQUFNLEVBQUUsT0FBTyxDQUFDLEdBQUcsQ0FBQyx1QkFBdUI7Z0JBQzNDLEdBQUcsRUFBRSxRQUFRO2FBQ2QsQ0FBQyxFQUNGLEVBQUUsU0FBUyxFQUFFLEtBQUssRUFBRSxDQUNyQixDQUFDO1lBRUYsa0VBQWtFO1lBQ2xFLE1BQU0sUUFBUSxHQUFHLFFBQVEsQ0FBQyxPQUFPLENBQUMsR0FBRyxNQUFNLEdBQUcsRUFBRSxFQUFFLENBQUMsQ0FBQztZQUVwRCxPQUFPLEVBQUUsQ0FBQyxRQUFRLENBQUMsRUFBRSxTQUFTLEVBQUUsQ0FBQztRQUNuQyxDQUFDLENBQUMsQ0FDSCxDQUFDO1FBRUYsT0FBTyxDQUFDLEdBQUcsQ0FDVCw2QkFBNkIsT0FBTyxDQUFDLE1BQU0scUJBQXFCLENBQ2pFLENBQUM7UUFDRixPQUFPLEVBQUUsU0FBUyxFQUFFLGFBQWEsRUFBRSxDQUFDO0lBQ3RDLENBQUM7SUFBQyxPQUFPLEtBQUssRUFBRSxDQUFDO1FBQ2YsT0FBTyxDQUFDLEtBQUssQ0FBQywrQkFBK0IsRUFBRSxLQUFLLENBQUMsQ0FBQztRQUN0RCxNQUFNLEtBQUssQ0FBQztJQUNkLENBQUM7QUFDSCxDQUFDIiwic291cmNlc0NvbnRlbnQiOlsiaW1wb3J0IHtcbiAgUzNDbGllbnQsXG4gIFB1dE9iamVjdENvbW1hbmQsXG4gIEdldE9iamVjdENvbW1hbmQsXG59IGZyb20gJ0Bhd3Mtc2RrL2NsaWVudC1zMyc7XG5pbXBvcnQgeyBnZXRTaWduZWRVcmwgfSBmcm9tICdAYXdzLXNkay9zMy1yZXF1ZXN0LXByZXNpZ25lcic7XG5pbXBvcnQgT3BlbkFJIGZyb20gJ29wZW5haSc7XG5cbmltcG9ydCB7IFNjZW5lIH0gZnJvbSAnLi4vdmlkZW8tZ2VuZXJhdGlvbi9zY3JpcHQnO1xuXG5jb25zdCBzMyA9IG5ldyBTM0NsaWVudCh7IHJlZ2lvbjogcHJvY2Vzcy5lbnYuQVdTX1JFR0lPTiB9KTtcbmNvbnN0IG9wZW5haSA9IG5ldyBPcGVuQUkoeyBhcGlLZXk6IHByb2Nlc3MuZW52Lk9QRU5BSV9BUElfS0VZIH0pO1xuXG5leHBvcnQgaW50ZXJmYWNlIFN1YnRpdGxlV29yZCB7XG4gIHdvcmQ6IHN0cmluZztcbiAgc3RhcnQ6IG51bWJlcjtcbiAgZW5kOiBudW1iZXI7XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgU3VidGl0bGVEYXRhIHtcbiAgc2NlbmVJbmRleDogbnVtYmVyO1xuICB3b3JkczogU3VidGl0bGVXb3JkW107XG4gIGZ1bGxUZXh0OiBzdHJpbmc7XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgTmFycmF0aW9uUmVzdWx0IHtcbiAgc3VidGl0bGVzOiBTdWJ0aXRsZURhdGFbXTtcbiAgbmFycmF0aW9uVXJsczogQXJyYXk8eyBba2V5OiBzdHJpbmddOiBzdHJpbmcgfT47IC8vIEZvcm1hdDogW3sgXCJ0aW1lc3RhbXAuc2NlbmUtaWQubXAzXCI6IFwic2lnbmVkLXVybFwiIH1dXG59XG5cbi8qKlxuICogQWRqdXN0cyBhdWRpbyBkdXJhdGlvbiB0byBtYXRjaCB0YXJnZXQgZHVyYXRpb24gdXNpbmcgRkZtcGVnXG4gKiBAcGFyYW0gYXVkaW9CdWZmZXIgLSBUaGUgb3JpZ2luYWwgYXVkaW8gYnVmZmVyXG4gKiBAcGFyYW0gdGFyZ2V0RHVyYXRpb24gLSBUaGUgdGFyZ2V0IGR1cmF0aW9uIGluIHNlY29uZHNcbiAqIEByZXR1cm5zIFByb21pc2U8QnVmZmVyPiAtIFRoZSBhZGp1c3RlZCBhdWRpbyBidWZmZXJcbiAqL1xuXG5leHBvcnQgYXN5bmMgZnVuY3Rpb24gZ2VuZXJhdGVOYXJyYXRpb24oXG4gIHNjZW5lczogU2NlbmVbXSxcbiAgdXNlcklkOiBzdHJpbmcsXG4gIHRpbWVzdGFtcDogc3RyaW5nLFxuICBpbnN0cnVjdGlvbnM6IHN0cmluZyA9ICdTcGVhayBpbiBhIGNoZWVyZnVsIGFuZCBwb3NpdGl2ZSB0b25lJyxcbiAgdm9pY2U6IHN0cmluZyA9ICdhbGxveScsXG4gIGxhbmd1YWdlOiBzdHJpbmcgPSAnZW4nLFxuKTogUHJvbWlzZTxOYXJyYXRpb25SZXN1bHQ+IHtcbiAgY29uc29sZS5sb2coXG4gICAgJ/CfjqQgR2VuZXJhdGluZyBuYXJyYXRpb24gZnJvbSBzY2VuZXMgd2l0aCB3b3JkLWxldmVsIHRpbWVzdGFtcHMuLi4nLFxuICApO1xuICB0cnkge1xuICAgIC8vIFByb2Nlc3MgYWxsIHNjZW5lcyBpbiBwYXJhbGxlbFxuICAgIGNvbnN0IHNjZW5lUHJvbWlzZXMgPSBzY2VuZXMubWFwKGFzeW5jIChzY2VuZSwgaSkgPT4ge1xuICAgICAgY29uc29sZS5sb2coYPCfjqQgR2VuZXJhdGluZyBuYXJyYXRpb24gZm9yIHNjZW5lICR7aX06YCwgc2NlbmUpO1xuXG4gICAgICAvLyBHZW5lcmF0ZSBzcGVlY2ggd2l0aCBzdGFuZGFyZCBmb3JtYXRcbiAgICAgIGNvbnN0IHJlc3BvbnNlID0gYXdhaXQgb3BlbmFpLmF1ZGlvLnNwZWVjaC5jcmVhdGUoe1xuICAgICAgICBtb2RlbDogJ2dwdC00by1taW5pLXR0cycsXG4gICAgICAgIHZvaWNlOiB2b2ljZSxcbiAgICAgICAgaW5zdHJ1Y3Rpb25zOiBgU3BlYWsgY2xlYXJseSBhbmQga2VlcCBkdXJhdGlvbiBpbiAke3NjZW5lLmR1cmF0aW9ufXMgaGFyZCBjYXAuIEF2b2lkIGxvbmcgcGF1c2VzLmAsXG4gICAgICAgIGlucHV0OiBzY2VuZS5uYXJyYXRpb24sXG4gICAgICB9KTtcblxuICAgICAgY29uc3Qgb3JpZ2luYWxBdWRpb0J1ZmZlciA9IEJ1ZmZlci5mcm9tKGF3YWl0IHJlc3BvbnNlLmFycmF5QnVmZmVyKCkpO1xuXG4gICAgICAvLyBTYXZlIHRvIFMzIHdpdGggdGltZXN0YW1wIHByZWZpeCB1c2luZyBzY2VuZS5pZFxuICAgICAgY29uc3QgYXVkaW9LZXkgPSBgJHt1c2VySWR9LyR7dGltZXN0YW1wfS5zY2VuZS0ke3NjZW5lLmlkfS5tcDNgO1xuXG4gICAgICBhd2FpdCBzMy5zZW5kKFxuICAgICAgICBuZXcgUHV0T2JqZWN0Q29tbWFuZCh7XG4gICAgICAgICAgQnVja2V0OiBwcm9jZXNzLmVudi5WSURFT19QQVJUU19CVUNLRVRfTkFNRSxcbiAgICAgICAgICBLZXk6IGF1ZGlvS2V5LFxuICAgICAgICAgIEJvZHk6IG9yaWdpbmFsQXVkaW9CdWZmZXIsXG4gICAgICAgICAgQ29udGVudFR5cGU6ICdhdWRpby9tcGVnJyxcbiAgICAgICAgfSksXG4gICAgICApO1xuXG4gICAgICAvLyBHZXQgd29yZC1sZXZlbCB0aW1lc3RhbXBzIHVzaW5nIHRyYW5zY3JpcHRpb25cblxuICAgICAgLy8gV3JpdGUgYWRqdXN0ZWQgYXVkaW8gYnVmZmVyIHRvIHRlbXBvcmFyeSBmaWxlIGZvciB0cmFuc2NyaXB0aW9uXG4gICAgICBjb25zdCBmcyA9IHJlcXVpcmUoJ2ZzJyk7XG4gICAgICBjb25zdCBvcyA9IHJlcXVpcmUoJ29zJyk7XG4gICAgICBjb25zdCBwYXRoID0gcmVxdWlyZSgncGF0aCcpO1xuXG4gICAgICBjb25zdCB0ZW1wQXVkaW9QYXRoID0gcGF0aC5qb2luKFxuICAgICAgICBvcy50bXBkaXIoKSxcbiAgICAgICAgYHNjZW5lLSR7aX0tJHt0aW1lc3RhbXB9Lm1wM2AsXG4gICAgICApO1xuICAgICAgZnMud3JpdGVGaWxlU3luYyh0ZW1wQXVkaW9QYXRoLCBvcmlnaW5hbEF1ZGlvQnVmZmVyKTtcblxuICAgICAgLy8gQ3JlYXRlIGZpbGUgb2JqZWN0IGZvciBPcGVuQUkgQVBJXG4gICAgICBjb25zdCBhdWRpb0ZpbGUgPSBmcy5jcmVhdGVSZWFkU3RyZWFtKHRlbXBBdWRpb1BhdGgpO1xuXG4gICAgICBjb25zdCB0cmFuc2NyaXB0aW9uID0gYXdhaXQgb3BlbmFpLmF1ZGlvLnRyYW5zY3JpcHRpb25zLmNyZWF0ZSh7XG4gICAgICAgIGZpbGU6IGF1ZGlvRmlsZSxcbiAgICAgICAgbW9kZWw6ICd3aGlzcGVyLTEnLFxuICAgICAgICByZXNwb25zZV9mb3JtYXQ6ICd2ZXJib3NlX2pzb24nLFxuICAgICAgICB0aW1lc3RhbXBfZ3JhbnVsYXJpdGllczogWyd3b3JkJ10sXG4gICAgICAgIGxhbmd1YWdlOiBsYW5ndWFnZSxcbiAgICAgIH0pO1xuXG4gICAgICAvLyBTYXZlIHRyYW5zY3JpcHRpb24gdG8gUzNcbiAgICAgIC8vIGNvbnN0IHRyYW5zY3JpcHRpb25LZXkgPSBgJHt1c2VySWR9LyR7dGltZXN0YW1wfS5zY2VuZS0ke3NjZW5lLmlkfS50cmFuc2NyaXB0aW9uLmpzb25gO1xuICAgICAgLy8gYXdhaXQgczMuc2VuZChcbiAgICAgIC8vICAgbmV3IFB1dE9iamVjdENvbW1hbmQoe1xuICAgICAgLy8gICAgIEJ1Y2tldDogcHJvY2Vzcy5lbnYuVklERU9fUEFSVFNfQlVDS0VUX05BTUUsXG4gICAgICAvLyAgICAgS2V5OiB0cmFuc2NyaXB0aW9uS2V5LFxuICAgICAgLy8gICAgIEJvZHk6IEpTT04uc3RyaW5naWZ5KHRyYW5zY3JpcHRpb24pLFxuICAgICAgLy8gICB9KSxcbiAgICAgIC8vICk7XG5cbiAgICAgIC8vIENsZWFuIHVwIHRlbXBvcmFyeSBmaWxlXG4gICAgICBmcy51bmxpbmtTeW5jKHRlbXBBdWRpb1BhdGgpO1xuXG4gICAgICBjb25zdCBzdWJ0aXRsZURhdGE6IFN1YnRpdGxlRGF0YSA9IHtcbiAgICAgICAgc2NlbmVJbmRleDogc2NlbmUuaWQsXG4gICAgICAgIHdvcmRzOiBbXSxcbiAgICAgICAgZnVsbFRleHQ6IHNjZW5lLm5hcnJhdGlvbiwgLy8gVXNlIG9yaWdpbmFsIG5hcnJhdGlvbiB0ZXh0IGluc3RlYWQgb2YgdHJhbnNjcmliZWQgdGV4dFxuICAgICAgfTtcblxuICAgICAgLy8gRXh0cmFjdCB3b3JkLWxldmVsIHRpbWVzdGFtcHMgZnJvbSB0aGUgdHJhbnNjcmlwdGlvbiByZXNwb25zZVxuICAgICAgaWYgKHRyYW5zY3JpcHRpb24ud29yZHMgJiYgQXJyYXkuaXNBcnJheSh0cmFuc2NyaXB0aW9uLndvcmRzKSkge1xuICAgICAgICBzdWJ0aXRsZURhdGEud29yZHMgPSB0cmFuc2NyaXB0aW9uLndvcmRzLm1hcCgod29yZDogYW55KSA9PiAoe1xuICAgICAgICAgIHdvcmQ6IHdvcmQud29yZCxcbiAgICAgICAgICBzdGFydDogd29yZC5zdGFydCxcbiAgICAgICAgICBlbmQ6IHdvcmQuZW5kLFxuICAgICAgICB9KSk7XG4gICAgICAgIGNvbnNvbGUubG9nKGDwn5SNIFNjZW5lICR7aX06IFdvcmQgdGltZXN0YW1wcyBleHRyYWN0ZWQgc3VjY2Vzc2Z1bGx5YCk7XG4gICAgICAgIC8vIFdvcmQgdGltZXN0YW1wcyBleHRyYWN0ZWQgc3VjY2Vzc2Z1bGx5XG4gICAgICB9IGVsc2Uge1xuICAgICAgICBjb25zb2xlLmxvZyhg8J+UjSBTY2VuZSAke2l9OiBObyB3b3JkIHRpbWVzdGFtcHMgZm91bmQsIHVzaW5nIGZhbGxiYWNrYCk7XG4gICAgICAgIC8vIFVzaW5nIGZhbGxiYWNrIHdvcmQgdGltZXN0YW1wc1xuICAgICAgICAvLyBGYWxsYmFjazogY3JlYXRlIGEgc2ltcGxlIHdvcmQtbGV2ZWwgYnJlYWtkb3duIHdpdGhvdXQgcHJlY2lzZSB0aW1lc3RhbXBzXG4gICAgICAgIGNvbnN0IHdvcmRzID0gc2NlbmUubmFycmF0aW9uXG4gICAgICAgICAgLnNwbGl0KCcgJylcbiAgICAgICAgICAuZmlsdGVyKCh3b3JkKSA9PiB3b3JkLmxlbmd0aCA+IDApO1xuICAgICAgICBjb25zdCBlc3RpbWF0ZWREdXJhdGlvbiA9IHNjZW5lLmR1cmF0aW9uO1xuICAgICAgICBjb25zdCB0aW1lUGVyV29yZCA9IGVzdGltYXRlZER1cmF0aW9uIC8gd29yZHMubGVuZ3RoO1xuXG4gICAgICAgIHN1YnRpdGxlRGF0YS53b3JkcyA9IHdvcmRzLm1hcCgod29yZCwgaW5kZXgpID0+ICh7XG4gICAgICAgICAgd29yZCxcbiAgICAgICAgICBzdGFydDogaW5kZXggKiB0aW1lUGVyV29yZCxcbiAgICAgICAgICBlbmQ6IChpbmRleCArIDEpICogdGltZVBlcldvcmQsXG4gICAgICAgIH0pKTtcbiAgICAgIH1cblxuICAgICAgLy8gU2F2ZSBjb21wbGV0ZSBzdWJ0aXRsZSBkYXRhIHRvIFMzIChpbmNsdWRpbmcgZnVsbFRleHQpXG4gICAgICBjb25zdCBzdWJ0aXRsZUtleSA9IGAke3VzZXJJZH0vJHt0aW1lc3RhbXB9LnNjZW5lLSR7c2NlbmUuaWR9LnN1YnRpdGxlLmpzb25gO1xuICAgICAgYXdhaXQgczMuc2VuZChcbiAgICAgICAgbmV3IFB1dE9iamVjdENvbW1hbmQoe1xuICAgICAgICAgIEJ1Y2tldDogcHJvY2Vzcy5lbnYuVklERU9fUEFSVFNfQlVDS0VUX05BTUUsXG4gICAgICAgICAgS2V5OiBzdWJ0aXRsZUtleSxcbiAgICAgICAgICBCb2R5OiBKU09OLnN0cmluZ2lmeShzdWJ0aXRsZURhdGEpLFxuICAgICAgICB9KSxcbiAgICAgICk7XG5cbiAgICAgIHJldHVybiB7XG4gICAgICAgIGF1ZGlvS2V5LFxuICAgICAgICBzdWJ0aXRsZURhdGEsXG4gICAgICB9O1xuICAgIH0pO1xuXG4gICAgLy8gV2FpdCBmb3IgYWxsIHNjZW5lcyB0byBjb21wbGV0ZVxuICAgIGNvbnN0IHJlc3VsdHMgPSBhd2FpdCBQcm9taXNlLmFsbChzY2VuZVByb21pc2VzKTtcblxuICAgIC8vIEV4dHJhY3QgcmVzdWx0cyBpbiB0aGUgY29ycmVjdCBvcmRlclxuICAgIGNvbnN0IGF1ZGlvS2V5cyA9IHJlc3VsdHMubWFwKChyZXN1bHQpID0+IHJlc3VsdC5hdWRpb0tleSk7XG4gICAgY29uc3Qgc3VidGl0bGVzID0gcmVzdWx0cy5tYXAoKHJlc3VsdCkgPT4gcmVzdWx0LnN1YnRpdGxlRGF0YSk7XG5cbiAgICAvLyBHZW5lcmF0ZSBzaWduZWQgVVJMcyBmb3IgYWxsIGF1ZGlvIGZpbGVzIHdpdGggZmlsZW5hbWUgbWFwcGluZ1xuICAgIGNvbnN0IG5hcnJhdGlvblVybHMgPSBhd2FpdCBQcm9taXNlLmFsbChcbiAgICAgIGF1ZGlvS2V5cy5tYXAoYXN5bmMgKGF1ZGlvS2V5KSA9PiB7XG4gICAgICAgIGNvbnN0IHNpZ25lZFVybCA9IGF3YWl0IGdldFNpZ25lZFVybChcbiAgICAgICAgICBzMyxcbiAgICAgICAgICBuZXcgR2V0T2JqZWN0Q29tbWFuZCh7XG4gICAgICAgICAgICBCdWNrZXQ6IHByb2Nlc3MuZW52LlZJREVPX1BBUlRTX0JVQ0tFVF9OQU1FLFxuICAgICAgICAgICAgS2V5OiBhdWRpb0tleSxcbiAgICAgICAgICB9KSxcbiAgICAgICAgICB7IGV4cGlyZXNJbjogMzYwMDAgfSwgLy8gMTAgaG91cnMgZXhwaXJhdGlvblxuICAgICAgICApO1xuXG4gICAgICAgIC8vIEV4dHJhY3QgZmlsZW5hbWUgd2l0aG91dCB1c2VyIHByZWZpeCAoZS5nLiwgXCIxMDA0LnNjZW5lLTEubXAzXCIpXG4gICAgICAgIGNvbnN0IGZpbGVuYW1lID0gYXVkaW9LZXkucmVwbGFjZShgJHt1c2VySWR9L2AsICcnKTtcblxuICAgICAgICByZXR1cm4geyBbZmlsZW5hbWVdOiBzaWduZWRVcmwgfTtcbiAgICAgIH0pLFxuICAgICk7XG5cbiAgICBjb25zb2xlLmxvZyhcbiAgICAgIGDinIUgR2VuZXJhdGVkIG5hcnJhdGlvbiBmb3IgJHtyZXN1bHRzLmxlbmd0aH0gc2NlbmVzIGluIHBhcmFsbGVsYCxcbiAgICApO1xuICAgIHJldHVybiB7IHN1YnRpdGxlcywgbmFycmF0aW9uVXJscyB9O1xuICB9IGNhdGNoIChlcnJvcikge1xuICAgIGNvbnNvbGUuZXJyb3IoJ+KdjCBFcnJvciBpbiBnZW5lcmF0ZU5hcnJhdGlvbjonLCBlcnJvcik7XG4gICAgdGhyb3cgZXJyb3I7XG4gIH1cbn1cbiJdfQ==