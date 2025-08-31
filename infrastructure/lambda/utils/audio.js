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
async function generateNarration(scenes, userId, timestamp, instructions = 'Speak in a cheerful and positive tone') {
    console.log('🎤 Generating narration from scenes with word-level timestamps...');
    try {
        // Process all scenes in parallel
        const scenePromises = scenes.map(async (scene, i) => {
            console.log(`🎤 Generating narration for scene ${i}:`, scene);
            // Generate speech with standard format
            const response = await openai.audio.speech.create({
                model: 'tts-1',
                voice: 'fable',
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiYXVkaW8uanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyJhdWRpby50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiOztBQXFDQSw4Q0EySkM7QUFoTUQsa0RBSTRCO0FBQzVCLHdFQUE2RDtBQUM3RCxtQ0FBNEI7QUFJNUIsTUFBTSxFQUFFLEdBQUcsSUFBSSxvQkFBUSxDQUFDLEVBQUUsTUFBTSxFQUFFLE9BQU8sQ0FBQyxHQUFHLENBQUMsVUFBVSxFQUFFLENBQUMsQ0FBQztBQUM1RCxNQUFNLE1BQU0sR0FBRyxJQUFJLGdCQUFNLENBQUMsRUFBRSxNQUFNLEVBQUUsT0FBTyxDQUFDLEdBQUcsQ0FBQyxjQUFjLEVBQUUsQ0FBQyxDQUFDO0FBbUJsRTs7Ozs7R0FLRztBQUVJLEtBQUssVUFBVSxpQkFBaUIsQ0FDckMsTUFBZSxFQUNmLE1BQWMsRUFDZCxTQUFpQixFQUNqQixlQUF1Qix1Q0FBdUM7SUFFOUQsT0FBTyxDQUFDLEdBQUcsQ0FDVCxtRUFBbUUsQ0FDcEUsQ0FBQztJQUNGLElBQUksQ0FBQztRQUNILGlDQUFpQztRQUNqQyxNQUFNLGFBQWEsR0FBRyxNQUFNLENBQUMsR0FBRyxDQUFDLEtBQUssRUFBRSxLQUFLLEVBQUUsQ0FBQyxFQUFFLEVBQUU7WUFDbEQsT0FBTyxDQUFDLEdBQUcsQ0FBQyxxQ0FBcUMsQ0FBQyxHQUFHLEVBQUUsS0FBSyxDQUFDLENBQUM7WUFFOUQsdUNBQXVDO1lBQ3ZDLE1BQU0sUUFBUSxHQUFHLE1BQU0sTUFBTSxDQUFDLEtBQUssQ0FBQyxNQUFNLENBQUMsTUFBTSxDQUFDO2dCQUNoRCxLQUFLLEVBQUUsT0FBTztnQkFDZCxLQUFLLEVBQUUsT0FBTztnQkFDZCxZQUFZLEVBQUUsc0NBQXNDLEtBQUssQ0FBQyxRQUFRLGdDQUFnQztnQkFDbEcsS0FBSyxFQUFFLEtBQUssQ0FBQyxTQUFTO2FBQ3ZCLENBQUMsQ0FBQztZQUVILE1BQU0sbUJBQW1CLEdBQUcsTUFBTSxDQUFDLElBQUksQ0FBQyxNQUFNLFFBQVEsQ0FB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QUNqRSxNQUFNLGFBQWEsR0FBRyxNQUFNLE9BQU8sQ0FBQyxHQUFHLENBQ3JDLFNBQVMsQ0FBQyxHQUFHLENBQUMsS0FBSyxFQUFFLFFBQVEsRUFBRSxFQUFFO1lBQy9CLE1BQU0sU0FBUyxHQUFHLE1BQU0sSUFBQSxtQ0FBWSxFQUNsQyxFQUFFLEVBQ0YsSUFBSSw0QkFBZ0IsQ0FBQztnQkFDbkIsTUFBTSxFQUFFLE9BQU8sQ0FBQyxHQUFHLENBQUMsdUJBQXVCO2dCQUMzQyxHQUFHLEVBQUUsUUFBUTthQUNkLENBQUMsRUFDRixFQUFFLFNBQVMsRUFBRSxLQUFLLEVBQUUsQ0FDckIsQ0FBQztZQUVGLGtFQUFrRTtZQUNsRSxNQUFNLFFBQVEsR0FBRyxRQUFRLENBQUMsT0FBTyxDQUFDLEdBQUcsTUFBTSxHQUFHLEVBQUUsRUFBRSxDQUFDLENBQUM7WUFFcEQsT0FBTyxFQUFFLENBQUMsUUFBUSxDQUFDLEVBQUUsU0FBUyxFQUFFLENBQUM7UUFDbkMsQ0FBQyxDQUFDLENBQ0gsQ0FBQztRQUVGLE9BQU8sQ0FBQyxHQUFHLENBQ1QsNkJBQTZCLE9BQU8sQ0FBQyxNQUFNLHFCQUFxQixDQUNqRSxDQUFDO1FBQ0YsT0FBTyxFQUFFLFNBQVMsRUFBRSxhQUFhLEVBQUUsQ0FBQztJQUN0QyxDQUFDO0lBQUMsT0FBTyxLQUFLLEVBQUUsQ0FBQztRQUNmLE9BQU8sQ0FBQyxLQUFLLENBQUMsK0JBQStCLEVBQUUsS0FBSyxDQUFDLENBQUM7UUFDdEQsTUFBTSxLQUFLLENBQUM7SUFDZCxDQUFDO0FBQ0gsQ0FBQyIsInNvdXJjZXNDb250ZW50IjpbImltcG9ydCB7XG4gIFMzQ2xpZW50LFxuICBQdXRPYmplY3RDb21tYW5kLFxuICBHZXRPYmplY3RDb21tYW5kLFxufSBmcm9tICdAYXdzLXNkay9jbGllbnQtczMnO1xuaW1wb3J0IHsgZ2V0U2lnbmVkVXJsIH0gZnJvbSAnQGF3cy1zZGsvczMtcmVxdWVzdC1wcmVzaWduZXInO1xuaW1wb3J0IE9wZW5BSSBmcm9tICdvcGVuYWknO1xuXG5pbXBvcnQgeyBTY2VuZSB9IGZyb20gJy4uL3ZpZGVvLWdlbmVyYXRpb24vc2NyaXB0JztcblxuY29uc3QgczMgPSBuZXcgUzNDbGllbnQoeyByZWdpb246IHByb2Nlc3MuZW52LkFXU19SRUdJT04gfSk7XG5jb25zdCBvcGVuYWkgPSBuZXcgT3BlbkFJKHsgYXBpS2V5OiBwcm9jZXNzLmVudi5PUEVOQUlfQVBJX0tFWSB9KTtcblxuZXhwb3J0IGludGVyZmFjZSBTdWJ0aXRsZVdvcmQge1xuICB3b3JkOiBzdHJpbmc7XG4gIHN0YXJ0OiBudW1iZXI7XG4gIGVuZDogbnVtYmVyO1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIFN1YnRpdGxlRGF0YSB7XG4gIHNjZW5lSW5kZXg6IG51bWJlcjtcbiAgd29yZHM6IFN1YnRpdGxlV29yZFtdO1xuICBmdWxsVGV4dDogc3RyaW5nO1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIE5hcnJhdGlvblJlc3VsdCB7XG4gIHN1YnRpdGxlczogU3VidGl0bGVEYXRhW107XG4gIG5hcnJhdGlvblVybHM6IEFycmF5PHsgW2tleTogc3RyaW5nXTogc3RyaW5nIH0+OyAvLyBGb3JtYXQ6IFt7IFwidGltZXN0YW1wLnNjZW5lLWlkLm1wM1wiOiBcInNpZ25lZC11cmxcIiB9XVxufVxuXG4vKipcbiAqIEFkanVzdHMgYXVkaW8gZHVyYXRpb24gdG8gbWF0Y2ggdGFyZ2V0IGR1cmF0aW9uIHVzaW5nIEZGbXBlZ1xuICogQHBhcmFtIGF1ZGlvQnVmZmVyIC0gVGhlIG9yaWdpbmFsIGF1ZGlvIGJ1ZmZlclxuICogQHBhcmFtIHRhcmdldER1cmF0aW9uIC0gVGhlIHRhcmdldCBkdXJhdGlvbiBpbiBzZWNvbmRzXG4gKiBAcmV0dXJucyBQcm9taXNlPEJ1ZmZlcj4gLSBUaGUgYWRqdXN0ZWQgYXVkaW8gYnVmZmVyXG4gKi9cblxuZXhwb3J0IGFzeW5jIGZ1bmN0aW9uIGdlbmVyYXRlTmFycmF0aW9uKFxuICBzY2VuZXM6IFNjZW5lW10sXG4gIHVzZXJJZDogc3RyaW5nLFxuICB0aW1lc3RhbXA6IHN0cmluZyxcbiAgaW5zdHJ1Y3Rpb25zOiBzdHJpbmcgPSAnU3BlYWsgaW4gYSBjaGVlcmZ1bCBhbmQgcG9zaXRpdmUgdG9uZScsXG4pOiBQcm9taXNlPE5hcnJhdGlvblJlc3VsdD4ge1xuICBjb25zb2xlLmxvZyhcbiAgICAn8J+OpCBHZW5lcmF0aW5nIG5hcnJhdGlvbiBmcm9tIHNjZW5lcyB3aXRoIHdvcmQtbGV2ZWwgdGltZXN0YW1wcy4uLicsXG4gICk7XG4gIHRyeSB7XG4gICAgLy8gUHJvY2VzcyBhbGwgc2NlbmVzIGluIHBhcmFsbGVsXG4gICAgY29uc3Qgc2NlbmVQcm9taXNlcyA9IHNjZW5lcy5tYXAoYXN5bmMgKHNjZW5lLCBpKSA9PiB7XG4gICAgICBjb25zb2xlLmxvZyhg8J+OpCBHZW5lcmF0aW5nIG5hcnJhdGlvbiBmb3Igc2NlbmUgJHtpfTpgLCBzY2VuZSk7XG5cbiAgICAgIC8vIEdlbmVyYXRlIHNwZWVjaCB3aXRoIHN0YW5kYXJkIGZvcm1hdFxuICAgICAgY29uc3QgcmVzcG9uc2UgPSBhd2FpdCBvcGVuYWkuYXVkaW8uc3BlZWNoLmNyZWF0ZSh7XG4gICAgICAgIG1vZGVsOiAndHRzLTEnLFxuICAgICAgICB2b2ljZTogJ2ZhYmxlJyxcbiAgICAgICAgaW5zdHJ1Y3Rpb25zOiBgU3BlYWsgY2xlYXJseSBhbmQga2VlcCBkdXJhdGlvbiBpbiAke3NjZW5lLmR1cmF0aW9ufXMgaGFyZCBjYXAuIEF2b2lkIGxvbmcgcGF1c2VzLmAsXG4gICAgICAgIGlucHV0OiBzY2VuZS5uYXJyYXRpb24sXG4gICAgICB9KTtcblxuICAgICAgY29uc3Qgb3JpZ2luYWxBdWRpb0J1ZmZlciA9IEJ1ZmZlci5mcm9tKGF3YWl0IHJlc3BvbnNlLmFycmF5QnVmZmVyKCkpO1xuXG4gICAgICAvLyBTYXZlIHRvIFMzIHdpdGggdGltZXN0YW1wIHByZWZpeCB1c2luZyBzY2VuZS5pZFxuICAgICAgY29uc3QgYXVkaW9LZXkgPSBgJHt1c2VySWR9LyR7dGltZXN0YW1wfS5zY2VuZS0ke3NjZW5lLmlkfS5tcDNgO1xuXG4gICAgICBhd2FpdCBzMy5zZW5kKFxuICAgICAgICBuZXcgUHV0T2JqZWN0Q29tbWFuZCh7XG4gICAgICAgICAgQnVja2V0OiBwcm9jZXNzLmVudi5WSURFT19QQVJUU19CVUNLRVRfTkFNRSxcbiAgICAgICAgICBLZXk6IGF1ZGlvS2V5LFxuICAgICAgICAgIEJvZHk6IG9yaWdpbmFsQXVkaW9CdWZmZXIsXG4gICAgICAgICAgQ29udGVudFR5cGU6ICdhdWRpby9tcGVnJyxcbiAgICAgICAgfSksXG4gICAgICApO1xuXG4gICAgICAvLyBHZXQgd29yZC1sZXZlbCB0aW1lc3RhbXBzIHVzaW5nIHRyYW5zY3JpcHRpb25cblxuICAgICAgLy8gV3JpdGUgYWRqdXN0ZWQgYXVkaW8gYnVmZmVyIHRvIHRlbXBvcmFyeSBmaWxlIGZvciB0cmFuc2NyaXB0aW9uXG4gICAgICBjb25zdCBmcyA9IHJlcXVpcmUoJ2ZzJyk7XG4gICAgICBjb25zdCBvcyA9IHJlcXVpcmUoJ29zJyk7XG4gICAgICBjb25zdCBwYXRoID0gcmVxdWlyZSgncGF0aCcpO1xuXG4gICAgICBjb25zdCB0ZW1wQXVkaW9QYXRoID0gcGF0aC5qb2luKFxuICAgICAgICBvcy50bXBkaXIoKSxcbiAgICAgICAgYHNjZW5lLSR7aX0tJHt0aW1lc3RhbXB9Lm1wM2AsXG4gICAgICApO1xuICAgICAgZnMud3JpdGVGaWxlU3luYyh0ZW1wQXVkaW9QYXRoLCBvcmlnaW5hbEF1ZGlvQnVmZmVyKTtcblxuICAgICAgLy8gQ3JlYXRlIGZpbGUgb2JqZWN0IGZvciBPcGVuQUkgQVBJXG4gICAgICBjb25zdCBhdWRpb0ZpbGUgPSBmcy5jcmVhdGVSZWFkU3RyZWFtKHRlbXBBdWRpb1BhdGgpO1xuXG4gICAgICBjb25zdCB0cmFuc2NyaXB0aW9uID0gYXdhaXQgb3BlbmFpLmF1ZGlvLnRyYW5zY3JpcHRpb25zLmNyZWF0ZSh7XG4gICAgICAgIGZpbGU6IGF1ZGlvRmlsZSxcbiAgICAgICAgbW9kZWw6ICd3aGlzcGVyLTEnLFxuICAgICAgICByZXNwb25zZV9mb3JtYXQ6ICd2ZXJib3NlX2pzb24nLFxuICAgICAgICB0aW1lc3RhbXBfZ3JhbnVsYXJpdGllczogWyd3b3JkJ10sXG4gICAgICAgIGxhbmd1YWdlOiAnZW4nLFxuICAgICAgfSk7XG5cbiAgICAgIC8vIFNhdmUgdHJhbnNjcmlwdGlvbiB0byBTM1xuICAgICAgLy8gY29uc3QgdHJhbnNjcmlwdGlvbktleSA9IGAke3VzZXJJZH0vJHt0aW1lc3RhbXB9LnNjZW5lLSR7c2NlbmUuaWR9LnRyYW5zY3JpcHRpb24uanNvbmA7XG4gICAgICAvLyBhd2FpdCBzMy5zZW5kKFxuICAgICAgLy8gICBuZXcgUHV0T2JqZWN0Q29tbWFuZCh7XG4gICAgICAvLyAgICAgQnVja2V0OiBwcm9jZXNzLmVudi5WSURFT19QQVJUU19CVUNLRVRfTkFNRSxcbiAgICAgIC8vICAgICBLZXk6IHRyYW5zY3JpcHRpb25LZXksXG4gICAgICAvLyAgICAgQm9keTogSlNPTi5zdHJpbmdpZnkodHJhbnNjcmlwdGlvbiksXG4gICAgICAvLyAgIH0pLFxuICAgICAgLy8gKTtcblxuICAgICAgLy8gQ2xlYW4gdXAgdGVtcG9yYXJ5IGZpbGVcbiAgICAgIGZzLnVubGlua1N5bmModGVtcEF1ZGlvUGF0aCk7XG5cbiAgICAgIGNvbnN0IHN1YnRpdGxlRGF0YTogU3VidGl0bGVEYXRhID0ge1xuICAgICAgICBzY2VuZUluZGV4OiBzY2VuZS5pZCxcbiAgICAgICAgd29yZHM6IFtdLFxuICAgICAgICBmdWxsVGV4dDogc2NlbmUubmFycmF0aW9uLCAvLyBVc2Ugb3JpZ2luYWwgbmFycmF0aW9uIHRleHQgaW5zdGVhZCBvZiB0cmFuc2NyaWJlZCB0ZXh0XG4gICAgICB9O1xuXG4gICAgICAvLyBFeHRyYWN0IHdvcmQtbGV2ZWwgdGltZXN0YW1wcyBmcm9tIHRoZSB0cmFuc2NyaXB0aW9uIHJlc3BvbnNlXG4gICAgICBpZiAodHJhbnNjcmlwdGlvbi53b3JkcyAmJiBBcnJheS5pc0FycmF5KHRyYW5zY3JpcHRpb24ud29yZHMpKSB7XG4gICAgICAgIHN1YnRpdGxlRGF0YS53b3JkcyA9IHRyYW5zY3JpcHRpb24ud29yZHMubWFwKCh3b3JkOiBhbnkpID0+ICh7XG4gICAgICAgICAgd29yZDogd29yZC53b3JkLFxuICAgICAgICAgIHN0YXJ0OiB3b3JkLnN0YXJ0LFxuICAgICAgICAgIGVuZDogd29yZC5lbmQsXG4gICAgICAgIH0pKTtcbiAgICAgICAgY29uc29sZS5sb2coYPCflI0gU2NlbmUgJHtpfTogV29yZCB0aW1lc3RhbXBzIGV4dHJhY3RlZCBzdWNjZXNzZnVsbHlgKTtcbiAgICAgICAgLy8gV29yZCB0aW1lc3RhbXBzIGV4dHJhY3RlZCBzdWNjZXNzZnVsbHlcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIGNvbnNvbGUubG9nKGDwn5SNIFNjZW5lICR7aX06IE5vIHdvcmQgdGltZXN0YW1wcyBmb3VuZCwgdXNpbmcgZmFsbGJhY2tgKTtcbiAgICAgICAgLy8gVXNpbmcgZmFsbGJhY2sgd29yZCB0aW1lc3RhbXBzXG4gICAgICAgIC8vIEZhbGxiYWNrOiBjcmVhdGUgYSBzaW1wbGUgd29yZC1sZXZlbCBicmVha2Rvd24gd2l0aG91dCBwcmVjaXNlIHRpbWVzdGFtcHNcbiAgICAgICAgY29uc3Qgd29yZHMgPSBzY2VuZS5uYXJyYXRpb25cbiAgICAgICAgICAuc3BsaXQoJyAnKVxuICAgICAgICAgIC5maWx0ZXIoKHdvcmQpID0+IHdvcmQubGVuZ3RoID4gMCk7XG4gICAgICAgIGNvbnN0IGVzdGltYXRlZER1cmF0aW9uID0gc2NlbmUuZHVyYXRpb247XG4gICAgICAgIGNvbnN0IHRpbWVQZXJXb3JkID0gZXN0aW1hdGVkRHVyYXRpb24gLyB3b3Jkcy5sZW5ndGg7XG5cbiAgICAgICAgc3VidGl0bGVEYXRhLndvcmRzID0gd29yZHMubWFwKCh3b3JkLCBpbmRleCkgPT4gKHtcbiAgICAgICAgICB3b3JkLFxuICAgICAgICAgIHN0YXJ0OiBpbmRleCAqIHRpbWVQZXJXb3JkLFxuICAgICAgICAgIGVuZDogKGluZGV4ICsgMSkgKiB0aW1lUGVyV29yZCxcbiAgICAgICAgfSkpO1xuICAgICAgfVxuXG4gICAgICAvLyBTYXZlIGNvbXBsZXRlIHN1YnRpdGxlIGRhdGEgdG8gUzMgKGluY2x1ZGluZyBmdWxsVGV4dClcbiAgICAgIGNvbnN0IHN1YnRpdGxlS2V5ID0gYCR7dXNlcklkfS8ke3RpbWVzdGFtcH0uc2NlbmUtJHtzY2VuZS5pZH0uc3VidGl0bGUuanNvbmA7XG4gICAgICBhd2FpdCBzMy5zZW5kKFxuICAgICAgICBuZXcgUHV0T2JqZWN0Q29tbWFuZCh7XG4gICAgICAgICAgQnVja2V0OiBwcm9jZXNzLmVudi5WSURFT19QQVJUU19CVUNLRVRfTkFNRSxcbiAgICAgICAgICBLZXk6IHN1YnRpdGxlS2V5LFxuICAgICAgICAgIEJvZHk6IEpTT04uc3RyaW5naWZ5KHN1YnRpdGxlRGF0YSksXG4gICAgICAgIH0pLFxuICAgICAgKTtcblxuICAgICAgcmV0dXJuIHtcbiAgICAgICAgYXVkaW9LZXksXG4gICAgICAgIHN1YnRpdGxlRGF0YSxcbiAgICAgIH07XG4gICAgfSk7XG5cbiAgICAvLyBXYWl0IGZvciBhbGwgc2NlbmVzIHRvIGNvbXBsZXRlXG4gICAgY29uc3QgcmVzdWx0cyA9IGF3YWl0IFByb21pc2UuYWxsKHNjZW5lUHJvbWlzZXMpO1xuXG4gICAgLy8gRXh0cmFjdCByZXN1bHRzIGluIHRoZSBjb3JyZWN0IG9yZGVyXG4gICAgY29uc3QgYXVkaW9LZXlzID0gcmVzdWx0cy5tYXAoKHJlc3VsdCkgPT4gcmVzdWx0LmF1ZGlvS2V5KTtcbiAgICBjb25zdCBzdWJ0aXRsZXMgPSByZXN1bHRzLm1hcCgocmVzdWx0KSA9PiByZXN1bHQuc3VidGl0bGVEYXRhKTtcblxuICAgIC8vIEdlbmVyYXRlIHNpZ25lZCBVUkxzIGZvciBhbGwgYXVkaW8gZmlsZXMgd2l0aCBmaWxlbmFtZSBtYXBwaW5nXG4gICAgY29uc3QgbmFycmF0aW9uVXJscyA9IGF3YWl0IFByb21pc2UuYWxsKFxuICAgICAgYXVkaW9LZXlzLm1hcChhc3luYyAoYXVkaW9LZXkpID0+IHtcbiAgICAgICAgY29uc3Qgc2lnbmVkVXJsID0gYXdhaXQgZ2V0U2lnbmVkVXJsKFxuICAgICAgICAgIHMzLFxuICAgICAgICAgIG5ldyBHZXRPYmplY3RDb21tYW5kKHtcbiAgICAgICAgICAgIEJ1Y2tldDogcHJvY2Vzcy5lbnYuVklERU9fUEFSVFNfQlVDS0VUX05BTUUsXG4gICAgICAgICAgICBLZXk6IGF1ZGlvS2V5LFxuICAgICAgICAgIH0pLFxuICAgICAgICAgIHsgZXhwaXJlc0luOiAzNjAwMCB9LCAvLyAxMCBob3VycyBleHBpcmF0aW9uXG4gICAgICAgICk7XG5cbiAgICAgICAgLy8gRXh0cmFjdCBmaWxlbmFtZSB3aXRob3V0IHVzZXIgcHJlZml4IChlLmcuLCBcIjEwMDQuc2NlbmUtMS5tcDNcIilcbiAgICAgICAgY29uc3QgZmlsZW5hbWUgPSBhdWRpb0tleS5yZXBsYWNlKGAke3VzZXJJZH0vYCwgJycpO1xuXG4gICAgICAgIHJldHVybiB7IFtmaWxlbmFtZV06IHNpZ25lZFVybCB9O1xuICAgICAgfSksXG4gICAgKTtcblxuICAgIGNvbnNvbGUubG9nKFxuICAgICAgYOKchSBHZW5lcmF0ZWQgbmFycmF0aW9uIGZvciAke3Jlc3VsdHMubGVuZ3RofSBzY2VuZXMgaW4gcGFyYWxsZWxgLFxuICAgICk7XG4gICAgcmV0dXJuIHsgc3VidGl0bGVzLCBuYXJyYXRpb25VcmxzIH07XG4gIH0gY2F0Y2ggKGVycm9yKSB7XG4gICAgY29uc29sZS5lcnJvcign4p2MIEVycm9yIGluIGdlbmVyYXRlTmFycmF0aW9uOicsIGVycm9yKTtcbiAgICB0aHJvdyBlcnJvcjtcbiAgfVxufVxuIl19