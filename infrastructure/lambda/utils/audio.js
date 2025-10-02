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
            // Clean up temporary file
            fs.unlinkSync(tempAudioPath);
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiYXVkaW8uanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyJhdWRpby50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiOztBQTZDQSw4Q0E2SUM7QUExTEQsa0RBQWdFO0FBRWhFLG1DQUE0QjtBQUk1QixNQUFNLEVBQUUsR0FBRyxJQUFJLG9CQUFRLENBQUMsRUFBRSxNQUFNLEVBQUUsT0FBTyxDQUFDLEdBQUcsQ0FBQyxVQUFVLEVBQUUsQ0FBQyxDQUFDO0FBQzVELE1BQU0sTUFBTSxHQUFHLElBQUksZ0JBQU0sQ0FBQyxFQUFFLE1BQU0sRUFBRSxPQUFPLENBQUMsR0FBRyxDQUFDLGNBQWMsRUFBRSxDQUFDLENBQUM7QUErQmxFOzs7OztHQUtHO0FBRUksS0FBSyxVQUFVLGlCQUFpQixDQUNyQyxNQUFlLEVBQ2YsTUFBYyxFQUNkLFNBQWlCLEVBQ2pCLGVBQXVCLHVDQUF1QyxFQUM5RCxRQUFnQixPQUFPLEVBQ3ZCLFdBQW1CLElBQUk7SUFFdkIsT0FBTyxDQUFDLEdBQUcsQ0FDVCxtRUFBbUUsQ0FDcEUsQ0FBQztJQUNGLElBQUksQ0FBQztRQUNILGlDQUFpQztRQUNqQyxNQUFNLGFBQWEsR0FBRyxNQUFNLENBQUMsR0FBRyxDQUFDLEtBQUssRUFBRSxLQUFLLEVBQUUsQ0FBQyxFQUFFLEVBQUU7WUFDbEQsT0FBTyxDQUFDLEdBQUcsQ0FBQyxxQ0FBcUMsQ0FBQyxHQUFHLEVBQUUsS0FBSyxDQUFDLENBQUM7WUFFOUQsdUNBQXVDO1lBQ3ZDLE1BQU0sUUFBUSxHQUFHLE1BQU0sTUFBTSxDQUFDLEtBQUssQ0FBQyxNQUFNLENBQUMsTUFBTSxDQUFDO2dCQUNoRCxLQUFLLEVBQUUsaUJBQWlCO2dCQUN4QixLQUFLLEVBQUUsS0FBSztnQkFDWixZQUFZLEVBQUUsc0NBQXNDLEtBQUssQ0FBQyxRQUFRLGdDQUFnQztnQkFDbEcsS0FBSyxFQUFFLEtBQUssQ0FBQyxTQUFTO2FBQ3ZCLENBQUMsQ0FBQztZQUNILDBDQUEwQztZQUMxQyxPQUFPLENBQUMsR0FB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RCx1Q0FBdUM7UUFDdkMsTUFBTSxTQUFTLEdBQUcsT0FBTyxDQUFDLEdBQUcsQ0FBQyxDQUFDLE1BQU0sRUFBRSxFQUFFLENBQUMsTUFBTSxDQUFDLFFBQVEsQ0FBQyxDQUFDO1FBQzNELE1BQU0sU0FBUyxHQUFHLE9BQU8sQ0FBQyxHQUFHLENBQUMsQ0FBQyxNQUFNLEVBQUUsRUFBRSxDQUFDLE1BQU0sQ0FBQyxZQUFZLENBQUMsQ0FBQztRQUUvRCxPQUFPLENBQUMsR0FBRyxDQUNULDZCQUE2QixPQUFPLENBQUMsTUFBTSxxQkFBcUIsQ0FDakUsQ0FBQztRQUNGLE9BQU8sRUFBRSxTQUFTLEVBQUUsQ0FBQztJQUN2QixDQUFDO0lBQUMsT0FBTyxLQUFLLEVBQUUsQ0FBQztRQUNmLE9BQU8sQ0FBQyxLQUFLLENBQUMsK0JBQStCLEVBQUUsS0FBSyxDQUFDLENBQUM7UUFDdEQsTUFBTSxLQUFLLENBQUM7SUFDZCxDQUFDO0FBQ0gsQ0FBQyIsInNvdXJjZXNDb250ZW50IjpbImltcG9ydCB7IFMzQ2xpZW50LCBQdXRPYmplY3RDb21tYW5kIH0gZnJvbSAnQGF3cy1zZGsvY2xpZW50LXMzJztcblxuaW1wb3J0IE9wZW5BSSBmcm9tICdvcGVuYWknO1xuXG5pbXBvcnQgeyBTY2VuZSB9IGZyb20gJy4vc2NyaXB0JztcblxuY29uc3QgczMgPSBuZXcgUzNDbGllbnQoeyByZWdpb246IHByb2Nlc3MuZW52LkFXU19SRUdJT04gfSk7XG5jb25zdCBvcGVuYWkgPSBuZXcgT3BlbkFJKHsgYXBpS2V5OiBwcm9jZXNzLmVudi5PUEVOQUlfQVBJX0tFWSB9KTtcblxuZXhwb3J0IGludGVyZmFjZSBTdWJ0aXRsZVdvcmQge1xuICB3b3JkOiBzdHJpbmc7XG4gIHN0YXJ0OiBudW1iZXI7XG4gIGVuZDogbnVtYmVyO1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIFN1YnRpdGxlRGF0YSB7XG4gIHNjZW5lUG9zaXRpb246IG51bWJlcjtcbiAgd29yZHM6IFN1YnRpdGxlV29yZFtdO1xuICBmdWxsVGV4dDogc3RyaW5nO1xuICBkdXJhdGlvbj86IG51bWJlcjtcbn1cblxuZXhwb3J0IGludGVyZmFjZSBOYXJyYXRpb25SZXN1bHQge1xuICBzdWJ0aXRsZXM6IFN1YnRpdGxlRGF0YVtdO1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIFRyYW5zY3JpcHRpb25SZXNwb25zZSB7XG4gIHRhc2s6IHN0cmluZztcbiAgbGFuZ3VhZ2U6IHN0cmluZztcbiAgZHVyYXRpb246IG51bWJlcjtcbiAgdGV4dDogc3RyaW5nO1xuICB3b3JkczogU3VidGl0bGVXb3JkW107XG4gIHVzYWdlOiB7XG4gICAgdHlwZTogc3RyaW5nO1xuICAgIHNlY29uZHM6IG51bWJlcjtcbiAgfTtcbn1cblxuLyoqXG4gKiBBZGp1c3RzIGF1ZGlvIGR1cmF0aW9uIHRvIG1hdGNoIHRhcmdldCBkdXJhdGlvbiB1c2luZyBGRm1wZWdcbiAqIEBwYXJhbSBhdWRpb0J1ZmZlciAtIFRoZSBvcmlnaW5hbCBhdWRpbyBidWZmZXJcbiAqIEBwYXJhbSB0YXJnZXREdXJhdGlvbiAtIFRoZSB0YXJnZXQgZHVyYXRpb24gaW4gc2Vjb25kc1xuICogQHJldHVybnMgUHJvbWlzZTxCdWZmZXI+IC0gVGhlIGFkanVzdGVkIGF1ZGlvIGJ1ZmZlclxuICovXG5cbmV4cG9ydCBhc3luYyBmdW5jdGlvbiBnZW5lcmF0ZU5hcnJhdGlvbihcbiAgc2NlbmVzOiBTY2VuZVtdLFxuICB1c2VySWQ6IHN0cmluZyxcbiAgdGltZXN0YW1wOiBzdHJpbmcsXG4gIGluc3RydWN0aW9uczogc3RyaW5nID0gJ1NwZWFrIGluIGEgY2hlZXJmdWwgYW5kIHBvc2l0aXZlIHRvbmUnLFxuICB2b2ljZTogc3RyaW5nID0gJ2FsbG95JyxcbiAgbGFuZ3VhZ2U6IHN0cmluZyA9ICdlbicsXG4pOiBQcm9taXNlPE5hcnJhdGlvblJlc3VsdD4ge1xuICBjb25zb2xlLmxvZyhcbiAgICAn8J+OpCBHZW5lcmF0aW5nIG5hcnJhdGlvbiBmcm9tIHNjZW5lcyB3aXRoIHdvcmQtbGV2ZWwgdGltZXN0YW1wcy4uLicsXG4gICk7XG4gIHRyeSB7XG4gICAgLy8gUHJvY2VzcyBhbGwgc2NlbmVzIGluIHBhcmFsbGVsXG4gICAgY29uc3Qgc2NlbmVQcm9taXNlcyA9IHNjZW5lcy5tYXAoYXN5bmMgKHNjZW5lLCBpKSA9PiB7XG4gICAgICBjb25zb2xlLmxvZyhg8J+OpCBHZW5lcmF0aW5nIG5hcnJhdGlvbiBmb3Igc2NlbmUgJHtpfTpgLCBzY2VuZSk7XG5cbiAgICAgIC8vIEdlbmVyYXRlIHNwZWVjaCB3aXRoIHN0YW5kYXJkIGZvcm1hdFxuICAgICAgY29uc3QgcmVzcG9uc2UgPSBhd2FpdCBvcGVuYWkuYXVkaW8uc3BlZWNoLmNyZWF0ZSh7XG4gICAgICAgIG1vZGVsOiAnZ3B0LTRvLW1pbmktdHRzJyxcbiAgICAgICAgdm9pY2U6IHZvaWNlLFxuICAgICAgICBpbnN0cnVjdGlvbnM6IGBTcGVhayBjbGVhcmx5IGFuZCBrZWVwIGR1cmF0aW9uIGluICR7c2NlbmUuZHVyYXRpb259cyBoYXJkIGNhcC4gQXZvaWQgbG9uZyBwYXVzZXMuYCxcbiAgICAgICAgaW5wdXQ6IHNjZW5lLm5hcnJhdGlvbixcbiAgICAgIH0pO1xuICAgICAgLy8gQ2hlY2sgaWYgcmVzcG9uc2UgaGFzIGR1cmF0aW9uIG1ldGFkYXRhXG4gICAgICBjb25zb2xlLmxvZygnUmVzcG9uc2UgYXVkaW8gZGF0YTonLCBKU09OLnN0cmluZ2lmeShyZXNwb25zZSwgbnVsbCwgMikpO1xuXG4gICAgICBjb25zdCBvcmlnaW5hbEF1ZGlvQnVmZmVyID0gQnVmZmVyLmZyb20oYXdhaXQgcmVzcG9uc2UuYXJyYXlCdWZmZXIoKSk7XG5cbiAgICAgIC8vIFNhdmUgdG8gUzMgd2l0aCB0aW1lc3RhbXAgcHJlZml4IHVzaW5nIHNjZW5lLmlkXG4gICAgICBjb25zdCBhdWRpb0tleSA9IGAke3VzZXJJZH0vJHt0aW1lc3RhbXB9LnNjZW5lLSR7c2NlbmUuaWR9Lm1wM2A7XG5cbiAgICAgIGF3YWl0IHMzLnNlbmQoXG4gICAgICAgIG5ldyBQdXRPYmplY3RDb21tYW5kKHtcbiAgICAgICAgICBCdWNrZXQ6IHByb2Nlc3MuZW52LlZJREVPX1BBUlRTX0JVQ0tFVF9OQU1FLFxuICAgICAgICAgIEtleTogYXVkaW9LZXksXG4gICAgICAgICAgQm9keTogb3JpZ2luYWxBdWRpb0J1ZmZlcixcbiAgICAgICAgICBDb250ZW50VHlwZTogJ2F1ZGlvL21wZWcnLFxuICAgICAgICB9KSxcbiAgICAgICk7XG5cbiAgICAgIC8vIEdldCB3b3JkLWxldmVsIHRpbWVzdGFtcHMgdXNpbmcgdHJhbnNjcmlwdGlvblxuXG4gICAgICAvLyBXcml0ZSBhZGp1c3RlZCBhdWRpbyBidWZmZXIgdG8gdGVtcG9yYXJ5IGZpbGUgZm9yIHRyYW5zY3JpcHRpb25cbiAgICAgIGNvbnN0IGZzID0gcmVxdWlyZSgnZnMnKTtcbiAgICAgIGNvbnN0IG9zID0gcmVxdWlyZSgnb3MnKTtcbiAgICAgIGNvbnN0IHBhdGggPSByZXF1aXJlKCdwYXRoJyk7XG5cbiAgICAgIGNvbnN0IHRlbXBBdWRpb1BhdGggPSBwYXRoLmpvaW4oXG4gICAgICAgIG9zLnRtcGRpcigpLFxuICAgICAgICBgc2NlbmUtJHtpfS0ke3RpbWVzdGFtcH0ubXAzYCxcbiAgICAgICk7XG4gICAgICBmcy53cml0ZUZpbGVTeW5jKHRlbXBBdWRpb1BhdGgsIG9yaWdpbmFsQXVkaW9CdWZmZXIpO1xuXG4gICAgICAvLyBDcmVhdGUgZmlsZSBvYmplY3QgZm9yIE9wZW5BSSBBUElcbiAgICAgIGNvbnN0IGF1ZGlvRmlsZSA9IGZzLmNyZWF0ZVJlYWRTdHJlYW0odGVtcEF1ZGlvUGF0aCk7XG5cbiAgICAgIGNvbnN0IHRyYW5zY3JpcHRpb24gPSAoYXdhaXQgb3BlbmFpLmF1ZGlvLnRyYW5zY3JpcHRpb25zLmNyZWF0ZSh7XG4gICAgICAgIGZpbGU6IGF1ZGlvRmlsZSxcbiAgICAgICAgbW9kZWw6ICd3aGlzcGVyLTEnLFxuICAgICAgICByZXNwb25zZV9mb3JtYXQ6ICd2ZXJib3NlX2pzb24nLFxuICAgICAgICB0aW1lc3RhbXBfZ3JhbnVsYXJpdGllczogWyd3b3JkJ10sXG4gICAgICAgIGxhbmd1YWdlOiBsYW5ndWFnZSxcbiAgICAgIH0pKSBhcyBUcmFuc2NyaXB0aW9uUmVzcG9uc2U7XG5cbiAgICAgIC8vIFNhdmUgdHJhbnNjcmlwdGlvbiB0byBTM1xuICAgICAgLy8gY29uc3QgdHJhbnNjcmlwdGlvbktleSA9IGAke3VzZXJJZH0vJHt0aW1lc3RhbXB9LnNjZW5lLSR7c2NlbmUuaWR9LnRyYW5zY3JpcHRpb24uanNvbmA7XG4gICAgICAvLyBhd2FpdCBzMy5zZW5kKFxuICAgICAgLy8gICBuZXcgUHV0T2JqZWN0Q29tbWFuZCh7XG4gICAgICAvLyAgICAgQnVja2V0OiBwcm9jZXNzLmVudi5WSURFT19QQVJUU19CVUNLRVRfTkFNRSxcbiAgICAgIC8vICAgICBLZXk6IHRyYW5zY3JpcHRpb25LZXksXG4gICAgICAvLyAgICAgQm9keTogSlNPTi5zdHJpbmdpZnkodHJhbnNjcmlwdGlvbiksXG4gICAgICAvLyAgIH0pLFxuICAgICAgLy8gKTtcblxuICAgICAgLy8gQ2xlYW4gdXAgdGVtcG9yYXJ5IGZpbGVcbiAgICAgIGZzLnVubGlua1N5bmModGVtcEF1ZGlvUGF0aCk7XG5cbiAgICAgIGNvbnN0IHN1YnRpdGxlRGF0YTogU3VidGl0bGVEYXRhID0ge1xuICAgICAgICBzY2VuZVBvc2l0aW9uOiBzY2VuZS5pZCxcbiAgICAgICAgd29yZHM6IFtdLFxuICAgICAgICBmdWxsVGV4dDogc2NlbmUubmFycmF0aW9uLCAvLyBVc2Ugb3JpZ2luYWwgbmFycmF0aW9uIHRleHQgaW5zdGVhZCBvZiB0cmFuc2NyaWJlZCB0ZXh0XG4gICAgICB9O1xuXG4gICAgICAvLyBFeHRyYWN0IHdvcmQtbGV2ZWwgdGltZXN0YW1wcyBmcm9tIHRoZSB0cmFuc2NyaXB0aW9uIHJlc3BvbnNlXG4gICAgICBpZiAodHJhbnNjcmlwdGlvbi53b3JkcyAmJiBBcnJheS5pc0FycmF5KHRyYW5zY3JpcHRpb24ud29yZHMpKSB7XG4gICAgICAgIHN1YnRpdGxlRGF0YS53b3JkcyA9IHRyYW5zY3JpcHRpb24ud29yZHMubWFwKCh3b3JkOiBhbnkpID0+ICh7XG4gICAgICAgICAgd29yZDogd29yZC53b3JkLFxuICAgICAgICAgIHN0YXJ0OiB3b3JkLnN0YXJ0LFxuICAgICAgICAgIGVuZDogd29yZC5lbmQsXG4gICAgICAgIH0pKTtcbiAgICAgICAgc3VidGl0bGVEYXRhLmR1cmF0aW9uID0gdHJhbnNjcmlwdGlvbi51c2FnZS5zZWNvbmRzO1xuICAgICAgICBjb25zb2xlLmxvZyhg8J+UjSBTY2VuZSAke2l9OiBXb3JkIHRpbWVzdGFtcHMgZXh0cmFjdGVkIHN1Y2Nlc3NmdWxseWApO1xuICAgICAgICAvLyBXb3JkIHRpbWVzdGFtcHMgZXh0cmFjdGVkIHN1Y2Nlc3NmdWxseVxuICAgICAgfSBlbHNlIHtcbiAgICAgICAgY29uc29sZS5sb2coYPCflI0gU2NlbmUgJHtpfTogTm8gd29yZCB0aW1lc3RhbXBzIGZvdW5kLCB1c2luZyBmYWxsYmFja2ApO1xuICAgICAgICAvLyBVc2luZyBmYWxsYmFjayB3b3JkIHRpbWVzdGFtcHNcbiAgICAgICAgLy8gRmFsbGJhY2s6IGNyZWF0ZSBhIHNpbXBsZSB3b3JkLWxldmVsIGJyZWFrZG93biB3aXRob3V0IHByZWNpc2UgdGltZXN0YW1wc1xuICAgICAgICBjb25zdCB3b3JkcyA9IHNjZW5lLm5hcnJhdGlvblxuICAgICAgICAgIC5zcGxpdCgnICcpXG4gICAgICAgICAgLmZpbHRlcigod29yZCkgPT4gd29yZC5sZW5ndGggPiAwKTtcbiAgICAgICAgY29uc3QgZXN0aW1hdGVkRHVyYXRpb24gPSBzY2VuZS5kdXJhdGlvbjtcbiAgICAgICAgY29uc3QgdGltZVBlcldvcmQgPSBlc3RpbWF0ZWREdXJhdGlvbiAvIHdvcmRzLmxlbmd0aDtcblxuICAgICAgICBzdWJ0aXRsZURhdGEud29yZHMgPSB3b3Jkcy5tYXAoKHdvcmQsIGluZGV4KSA9PiAoe1xuICAgICAgICAgIHdvcmQsXG4gICAgICAgICAgc3RhcnQ6IGluZGV4ICogdGltZVBlcldvcmQsXG4gICAgICAgICAgZW5kOiAoaW5kZXggKyAxKSAqIHRpbWVQZXJXb3JkLFxuICAgICAgICB9KSk7XG4gICAgICB9XG5cbiAgICAgIC8vIFNhdmUgY29tcGxldGUgc3VidGl0bGUgZGF0YSB0byBTMyAoaW5jbHVkaW5nIGZ1bGxUZXh0KVxuICAgICAgY29uc3Qgc3VidGl0bGVLZXkgPSBgJHt1c2VySWR9LyR7dGltZXN0YW1wfS5zY2VuZS0ke3NjZW5lLmlkfS5zdWJ0aXRsZS5qc29uYDtcbiAgICAgIGF3YWl0IHMzLnNlbmQoXG4gICAgICAgIG5ldyBQdXRPYmplY3RDb21tYW5kKHtcbiAgICAgICAgICBCdWNrZXQ6IHByb2Nlc3MuZW52LlZJREVPX1BBUlRTX0JVQ0tFVF9OQU1FLFxuICAgICAgICAgIEtleTogc3VidGl0bGVLZXksXG4gICAgICAgICAgQm9keTogSlNPTi5zdHJpbmdpZnkoc3VidGl0bGVEYXRhKSxcbiAgICAgICAgfSksXG4gICAgICApO1xuXG4gICAgICByZXR1cm4ge1xuICAgICAgICBhdWRpb0tleSxcbiAgICAgICAgc3VidGl0bGVEYXRhLFxuICAgICAgfTtcbiAgICB9KTtcblxuICAgIC8vIFdhaXQgZm9yIGFsbCBzY2VuZXMgdG8gY29tcGxldGVcbiAgICBjb25zdCByZXN1bHRzID0gYXdhaXQgUHJvbWlzZS5hbGwoc2NlbmVQcm9taXNlcyk7XG5cbiAgICAvLyBFeHRyYWN0IHJlc3VsdHMgaW4gdGhlIGNvcnJlY3Qgb3JkZXJcbiAgICBjb25zdCBhdWRpb0tleXMgPSByZXN1bHRzLm1hcCgocmVzdWx0KSA9PiByZXN1bHQuYXVkaW9LZXkpO1xuICAgIGNvbnN0IHN1YnRpdGxlcyA9IHJlc3VsdHMubWFwKChyZXN1bHQpID0+IHJlc3VsdC5zdWJ0aXRsZURhdGEpO1xuXG4gICAgY29uc29sZS5sb2coXG4gICAgICBg4pyFIEdlbmVyYXRlZCBuYXJyYXRpb24gZm9yICR7cmVzdWx0cy5sZW5ndGh9IHNjZW5lcyBpbiBwYXJhbGxlbGAsXG4gICAgKTtcbiAgICByZXR1cm4geyBzdWJ0aXRsZXMgfTtcbiAgfSBjYXRjaCAoZXJyb3IpIHtcbiAgICBjb25zb2xlLmVycm9yKCfinYwgRXJyb3IgaW4gZ2VuZXJhdGVOYXJyYXRpb246JywgZXJyb3IpO1xuICAgIHRocm93IGVycm9yO1xuICB9XG59XG4iXX0=