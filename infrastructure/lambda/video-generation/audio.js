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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiYXVkaW8uanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyJhdWRpby50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiOztBQXFDQSw4Q0EySkM7QUFoTUQsa0RBSTRCO0FBQzVCLHdFQUE2RDtBQUM3RCxtQ0FBNEI7QUFJNUIsTUFBTSxFQUFFLEdBQUcsSUFBSSxvQkFBUSxDQUFDLEVBQUUsTUFBTSxFQUFFLE9BQU8sQ0FBQyxHQUFHLENBQUMsVUFBVSxFQUFFLENBQUMsQ0FBQztBQUM1RCxNQUFNLE1BQU0sR0FBRyxJQUFJLGdCQUFNLENBQUMsRUFBRSxNQUFNLEVBQUUsT0FBTyxDQUFDLEdBQUcsQ0FBQyxjQUFjLEVBQUUsQ0FBQyxDQUFDO0FBbUJsRTs7Ozs7R0FLRztBQUVJLEtBQUssVUFBVSxpQkFBaUIsQ0FDckMsTUFBZSxFQUNmLE1BQWMsRUFDZCxTQUFpQixFQUNqQixlQUF1Qix1Q0FBdUM7SUFFOUQsT0FBTyxDQUFDLEdBQUcsQ0FDVCxtRUFBbUUsQ0FDcEUsQ0FBQztJQUNGLElBQUksQ0FBQztRQUNILGlDQUFpQztRQUNqQyxNQUFNLGFBQWEsR0FBRyxNQUFNLENBQUMsR0FBRyxDQUFDLEtBQUssRUFBRSxLQUFLLEVBQUUsQ0FBQyxFQUFFLEVBQUU7WUFDbEQsT0FBTyxDQUFDLEdBQUcsQ0FBQyxxQ0FBcUMsQ0FBQyxHQUFHLEVBQUUsS0FBSyxDQUFDLENBQUM7WUFFOUQsdUNBQXVDO1lBQ3ZDLE1BQU0sUUFBUSxHQUFHLE1BQU0sTUFBTSxDQUFDLEtBQUssQ0FBQyxNQUFNLENBQUMsTUFBTSxDQUFDO2dCQUNoRCxLQUFLLEVBQUUsT0FBTztnQkFDZCxLQUFLLEVBQUUsT0FBTztnQkFDZCxZQUFZLEVBQUUsc0NBQXNDLEtBQUssQ0FBQyxRQUFRLGdDQUFnQztnQkFDbEcsS0FBSyxFQUFFLEtBQUssQ0FBQyxTQUFTO2FBQ3ZCLENBQUMsQ0FBQztZQUVILE1BQU0sbUJBQW1CLEdBQUcsTUFBTSxDQUFDLElBQUksQ0FBQyxNQUFNLFFBQVEsQ0FB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QUNqRSxNQUFNLGFBQWEsR0FBRyxNQUFNLE9BQU8sQ0FBQyxHQUFHLENBQ3JDLFNBQVMsQ0FBQyxHQUFHLENBQUMsS0FBSyxFQUFFLFFBQVEsRUFBRSxFQUFFO1lBQy9CLE1BQU0sU0FBUyxHQUFHLE1BQU0sSUFBQSxtQ0FBWSxFQUNsQyxFQUFFLEVBQ0YsSUFBSSw0QkFBZ0IsQ0FBQztnQkFDbkIsTUFBTSxFQUFFLE9BQU8sQ0FBQyxHQUFHLENBQUMsdUJBQXVCO2dCQUMzQyxHQUFHLEVBQUUsUUFBUTthQUNkLENBQUMsRUFDRixFQUFFLFNBQVMsRUFBRSxLQUFLLEVBQUUsQ0FDckIsQ0FBQztZQUVGLGtFQUFrRTtZQUNsRSxNQUFNLFFBQVEsR0FBRyxRQUFRLENBQUMsT0FBTyxDQUFDLEdBQUcsTUFBTSxHQUFHLEVBQUUsRUFBRSxDQUFDLENBQUM7WUFFcEQsT0FBTyxFQUFFLENBQUMsUUFBUSxDQUFDLEVBQUUsU0FBUyxFQUFFLENBQUM7UUFDbkMsQ0FBQyxDQUFDLENBQ0gsQ0FBQztRQUVGLE9BQU8sQ0FBQyxHQUFHLENBQ1QsNkJBQTZCLE9BQU8sQ0FBQyxNQUFNLHFCQUFxQixDQUNqRSxDQUFDO1FBQ0YsT0FBTyxFQUFFLFNBQVMsRUFBRSxhQUFhLEVBQUUsQ0FBQztJQUN0QyxDQUFDO0lBQUMsT0FBTyxLQUFLLEVBQUUsQ0FBQztRQUNmLE9BQU8sQ0FBQyxLQUFLLENBQUMsK0JBQStCLEVBQUUsS0FBSyxDQUFDLENBQUM7UUFDdEQsTUFBTSxLQUFLLENBQUM7SUFDZCxDQUFDO0FBQ0gsQ0FBQyIsInNvdXJjZXNDb250ZW50IjpbImltcG9ydCB7XG4gIFMzQ2xpZW50LFxuICBQdXRPYmplY3RDb21tYW5kLFxuICBHZXRPYmplY3RDb21tYW5kLFxufSBmcm9tICdAYXdzLXNkay9jbGllbnQtczMnO1xuaW1wb3J0IHsgZ2V0U2lnbmVkVXJsIH0gZnJvbSAnQGF3cy1zZGsvczMtcmVxdWVzdC1wcmVzaWduZXInO1xuaW1wb3J0IE9wZW5BSSBmcm9tICdvcGVuYWknO1xuaW1wb3J0IHsgYWRqdXN0QXVkaW9EdXJhdGlvbiB9IGZyb20gJy4vdXRpbC9uYXJyYXRpb25IZWxwZXInO1xuaW1wb3J0IHsgU2NlbmUgfSBmcm9tICcuL3NjcmlwdCc7XG5cbmNvbnN0IHMzID0gbmV3IFMzQ2xpZW50KHsgcmVnaW9uOiBwcm9jZXNzLmVudi5BV1NfUkVHSU9OIH0pO1xuY29uc3Qgb3BlbmFpID0gbmV3IE9wZW5BSSh7IGFwaUtleTogcHJvY2Vzcy5lbnYuT1BFTkFJX0FQSV9LRVkgfSk7XG5cbmV4cG9ydCBpbnRlcmZhY2UgU3VidGl0bGVXb3JkIHtcbiAgd29yZDogc3RyaW5nO1xuICBzdGFydDogbnVtYmVyO1xuICBlbmQ6IG51bWJlcjtcbn1cblxuZXhwb3J0IGludGVyZmFjZSBTdWJ0aXRsZURhdGEge1xuICBzY2VuZUluZGV4OiBudW1iZXI7XG4gIHdvcmRzOiBTdWJ0aXRsZVdvcmRbXTtcbiAgZnVsbFRleHQ6IHN0cmluZztcbn1cblxuZXhwb3J0IGludGVyZmFjZSBOYXJyYXRpb25SZXN1bHQge1xuICBzdWJ0aXRsZXM6IFN1YnRpdGxlRGF0YVtdO1xuICBuYXJyYXRpb25VcmxzOiBBcnJheTx7IFtrZXk6IHN0cmluZ106IHN0cmluZyB9PjsgLy8gRm9ybWF0OiBbeyBcInRpbWVzdGFtcC5zY2VuZS1pZC5tcDNcIjogXCJzaWduZWQtdXJsXCIgfV1cbn1cblxuLyoqXG4gKiBBZGp1c3RzIGF1ZGlvIGR1cmF0aW9uIHRvIG1hdGNoIHRhcmdldCBkdXJhdGlvbiB1c2luZyBGRm1wZWdcbiAqIEBwYXJhbSBhdWRpb0J1ZmZlciAtIFRoZSBvcmlnaW5hbCBhdWRpbyBidWZmZXJcbiAqIEBwYXJhbSB0YXJnZXREdXJhdGlvbiAtIFRoZSB0YXJnZXQgZHVyYXRpb24gaW4gc2Vjb25kc1xuICogQHJldHVybnMgUHJvbWlzZTxCdWZmZXI+IC0gVGhlIGFkanVzdGVkIGF1ZGlvIGJ1ZmZlclxuICovXG5cbmV4cG9ydCBhc3luYyBmdW5jdGlvbiBnZW5lcmF0ZU5hcnJhdGlvbihcbiAgc2NlbmVzOiBTY2VuZVtdLFxuICB1c2VySWQ6IHN0cmluZyxcbiAgdGltZXN0YW1wOiBzdHJpbmcsXG4gIGluc3RydWN0aW9uczogc3RyaW5nID0gJ1NwZWFrIGluIGEgY2hlZXJmdWwgYW5kIHBvc2l0aXZlIHRvbmUnLFxuKTogUHJvbWlzZTxOYXJyYXRpb25SZXN1bHQ+IHtcbiAgY29uc29sZS5sb2coXG4gICAgJ/CfjqQgR2VuZXJhdGluZyBuYXJyYXRpb24gZnJvbSBzY2VuZXMgd2l0aCB3b3JkLWxldmVsIHRpbWVzdGFtcHMuLi4nLFxuICApO1xuICB0cnkge1xuICAgIC8vIFByb2Nlc3MgYWxsIHNjZW5lcyBpbiBwYXJhbGxlbFxuICAgIGNvbnN0IHNjZW5lUHJvbWlzZXMgPSBzY2VuZXMubWFwKGFzeW5jIChzY2VuZSwgaSkgPT4ge1xuICAgICAgY29uc29sZS5sb2coYPCfjqQgR2VuZXJhdGluZyBuYXJyYXRpb24gZm9yIHNjZW5lICR7aX06YCwgc2NlbmUpO1xuXG4gICAgICAvLyBHZW5lcmF0ZSBzcGVlY2ggd2l0aCBzdGFuZGFyZCBmb3JtYXRcbiAgICAgIGNvbnN0IHJlc3BvbnNlID0gYXdhaXQgb3BlbmFpLmF1ZGlvLnNwZWVjaC5jcmVhdGUoe1xuICAgICAgICBtb2RlbDogJ3R0cy0xJyxcbiAgICAgICAgdm9pY2U6ICdmYWJsZScsXG4gICAgICAgIGluc3RydWN0aW9uczogYFNwZWFrIGNsZWFybHkgYW5kIGtlZXAgZHVyYXRpb24gaW4gJHtzY2VuZS5kdXJhdGlvbn1zIGhhcmQgY2FwLiBBdm9pZCBsb25nIHBhdXNlcy5gLFxuICAgICAgICBpbnB1dDogc2NlbmUubmFycmF0aW9uLFxuICAgICAgfSk7XG5cbiAgICAgIGNvbnN0IG9yaWdpbmFsQXVkaW9CdWZmZXIgPSBCdWZmZXIuZnJvbShhd2FpdCByZXNwb25zZS5hcnJheUJ1ZmZlcigpKTtcblxuICAgICAgLy8gU2F2ZSB0byBTMyB3aXRoIHRpbWVzdGFtcCBwcmVmaXggdXNpbmcgc2NlbmUuaWRcbiAgICAgIGNvbnN0IGF1ZGlvS2V5ID0gYCR7dXNlcklkfS8ke3RpbWVzdGFtcH0uc2NlbmUtJHtzY2VuZS5pZH0ubXAzYDtcblxuICAgICAgYXdhaXQgczMuc2VuZChcbiAgICAgICAgbmV3IFB1dE9iamVjdENvbW1hbmQoe1xuICAgICAgICAgIEJ1Y2tldDogcHJvY2Vzcy5lbnYuVklERU9fUEFSVFNfQlVDS0VUX05BTUUsXG4gICAgICAgICAgS2V5OiBhdWRpb0tleSxcbiAgICAgICAgICBCb2R5OiBvcmlnaW5hbEF1ZGlvQnVmZmVyLFxuICAgICAgICAgIENvbnRlbnRUeXBlOiAnYXVkaW8vbXBlZycsXG4gICAgICAgIH0pLFxuICAgICAgKTtcblxuICAgICAgLy8gR2V0IHdvcmQtbGV2ZWwgdGltZXN0YW1wcyB1c2luZyB0cmFuc2NyaXB0aW9uXG5cbiAgICAgIC8vIFdyaXRlIGFkanVzdGVkIGF1ZGlvIGJ1ZmZlciB0byB0ZW1wb3JhcnkgZmlsZSBmb3IgdHJhbnNjcmlwdGlvblxuICAgICAgY29uc3QgZnMgPSByZXF1aXJlKCdmcycpO1xuICAgICAgY29uc3Qgb3MgPSByZXF1aXJlKCdvcycpO1xuICAgICAgY29uc3QgcGF0aCA9IHJlcXVpcmUoJ3BhdGgnKTtcblxuICAgICAgY29uc3QgdGVtcEF1ZGlvUGF0aCA9IHBhdGguam9pbihcbiAgICAgICAgb3MudG1wZGlyKCksXG4gICAgICAgIGBzY2VuZS0ke2l9LSR7dGltZXN0YW1wfS5tcDNgLFxuICAgICAgKTtcbiAgICAgIGZzLndyaXRlRmlsZVN5bmModGVtcEF1ZGlvUGF0aCwgb3JpZ2luYWxBdWRpb0J1ZmZlcik7XG5cbiAgICAgIC8vIENyZWF0ZSBmaWxlIG9iamVjdCBmb3IgT3BlbkFJIEFQSVxuICAgICAgY29uc3QgYXVkaW9GaWxlID0gZnMuY3JlYXRlUmVhZFN0cmVhbSh0ZW1wQXVkaW9QYXRoKTtcblxuICAgICAgY29uc3QgdHJhbnNjcmlwdGlvbiA9IGF3YWl0IG9wZW5haS5hdWRpby50cmFuc2NyaXB0aW9ucy5jcmVhdGUoe1xuICAgICAgICBmaWxlOiBhdWRpb0ZpbGUsXG4gICAgICAgIG1vZGVsOiAnd2hpc3Blci0xJyxcbiAgICAgICAgcmVzcG9uc2VfZm9ybWF0OiAndmVyYm9zZV9qc29uJyxcbiAgICAgICAgdGltZXN0YW1wX2dyYW51bGFyaXRpZXM6IFsnd29yZCddLFxuICAgICAgICBsYW5ndWFnZTogJ2VuJyxcbiAgICAgIH0pO1xuXG4gICAgICAvLyBTYXZlIHRyYW5zY3JpcHRpb24gdG8gUzNcbiAgICAgIC8vIGNvbnN0IHRyYW5zY3JpcHRpb25LZXkgPSBgJHt1c2VySWR9LyR7dGltZXN0YW1wfS5zY2VuZS0ke3NjZW5lLmlkfS50cmFuc2NyaXB0aW9uLmpzb25gO1xuICAgICAgLy8gYXdhaXQgczMuc2VuZChcbiAgICAgIC8vICAgbmV3IFB1dE9iamVjdENvbW1hbmQoe1xuICAgICAgLy8gICAgIEJ1Y2tldDogcHJvY2Vzcy5lbnYuVklERU9fUEFSVFNfQlVDS0VUX05BTUUsXG4gICAgICAvLyAgICAgS2V5OiB0cmFuc2NyaXB0aW9uS2V5LFxuICAgICAgLy8gICAgIEJvZHk6IEpTT04uc3RyaW5naWZ5KHRyYW5zY3JpcHRpb24pLFxuICAgICAgLy8gICB9KSxcbiAgICAgIC8vICk7XG5cbiAgICAgIC8vIENsZWFuIHVwIHRlbXBvcmFyeSBmaWxlXG4gICAgICBmcy51bmxpbmtTeW5jKHRlbXBBdWRpb1BhdGgpO1xuXG4gICAgICBjb25zdCBzdWJ0aXRsZURhdGE6IFN1YnRpdGxlRGF0YSA9IHtcbiAgICAgICAgc2NlbmVJbmRleDogc2NlbmUuaWQsXG4gICAgICAgIHdvcmRzOiBbXSxcbiAgICAgICAgZnVsbFRleHQ6IHNjZW5lLm5hcnJhdGlvbiwgLy8gVXNlIG9yaWdpbmFsIG5hcnJhdGlvbiB0ZXh0IGluc3RlYWQgb2YgdHJhbnNjcmliZWQgdGV4dFxuICAgICAgfTtcblxuICAgICAgLy8gRXh0cmFjdCB3b3JkLWxldmVsIHRpbWVzdGFtcHMgZnJvbSB0aGUgdHJhbnNjcmlwdGlvbiByZXNwb25zZVxuICAgICAgaWYgKHRyYW5zY3JpcHRpb24ud29yZHMgJiYgQXJyYXkuaXNBcnJheSh0cmFuc2NyaXB0aW9uLndvcmRzKSkge1xuICAgICAgICBzdWJ0aXRsZURhdGEud29yZHMgPSB0cmFuc2NyaXB0aW9uLndvcmRzLm1hcCgod29yZDogYW55KSA9PiAoe1xuICAgICAgICAgIHdvcmQ6IHdvcmQud29yZCxcbiAgICAgICAgICBzdGFydDogd29yZC5zdGFydCxcbiAgICAgICAgICBlbmQ6IHdvcmQuZW5kLFxuICAgICAgICB9KSk7XG4gICAgICAgIGNvbnNvbGUubG9nKGDwn5SNIFNjZW5lICR7aX06IFdvcmQgdGltZXN0YW1wcyBleHRyYWN0ZWQgc3VjY2Vzc2Z1bGx5YCk7XG4gICAgICAgIC8vIFdvcmQgdGltZXN0YW1wcyBleHRyYWN0ZWQgc3VjY2Vzc2Z1bGx5XG4gICAgICB9IGVsc2Uge1xuICAgICAgICBjb25zb2xlLmxvZyhg8J+UjSBTY2VuZSAke2l9OiBObyB3b3JkIHRpbWVzdGFtcHMgZm91bmQsIHVzaW5nIGZhbGxiYWNrYCk7XG4gICAgICAgIC8vIFVzaW5nIGZhbGxiYWNrIHdvcmQgdGltZXN0YW1wc1xuICAgICAgICAvLyBGYWxsYmFjazogY3JlYXRlIGEgc2ltcGxlIHdvcmQtbGV2ZWwgYnJlYWtkb3duIHdpdGhvdXQgcHJlY2lzZSB0aW1lc3RhbXBzXG4gICAgICAgIGNvbnN0IHdvcmRzID0gc2NlbmUubmFycmF0aW9uXG4gICAgICAgICAgLnNwbGl0KCcgJylcbiAgICAgICAgICAuZmlsdGVyKCh3b3JkKSA9PiB3b3JkLmxlbmd0aCA+IDApO1xuICAgICAgICBjb25zdCBlc3RpbWF0ZWREdXJhdGlvbiA9IHNjZW5lLmR1cmF0aW9uO1xuICAgICAgICBjb25zdCB0aW1lUGVyV29yZCA9IGVzdGltYXRlZER1cmF0aW9uIC8gd29yZHMubGVuZ3RoO1xuXG4gICAgICAgIHN1YnRpdGxlRGF0YS53b3JkcyA9IHdvcmRzLm1hcCgod29yZCwgaW5kZXgpID0+ICh7XG4gICAgICAgICAgd29yZCxcbiAgICAgICAgICBzdGFydDogaW5kZXggKiB0aW1lUGVyV29yZCxcbiAgICAgICAgICBlbmQ6IChpbmRleCArIDEpICogdGltZVBlcldvcmQsXG4gICAgICAgIH0pKTtcbiAgICAgIH1cblxuICAgICAgLy8gU2F2ZSBjb21wbGV0ZSBzdWJ0aXRsZSBkYXRhIHRvIFMzIChpbmNsdWRpbmcgZnVsbFRleHQpXG4gICAgICBjb25zdCBzdWJ0aXRsZUtleSA9IGAke3VzZXJJZH0vJHt0aW1lc3RhbXB9LnNjZW5lLSR7c2NlbmUuaWR9LnN1YnRpdGxlLmpzb25gO1xuICAgICAgYXdhaXQgczMuc2VuZChcbiAgICAgICAgbmV3IFB1dE9iamVjdENvbW1hbmQoe1xuICAgICAgICAgIEJ1Y2tldDogcHJvY2Vzcy5lbnYuVklERU9fUEFSVFNfQlVDS0VUX05BTUUsXG4gICAgICAgICAgS2V5OiBzdWJ0aXRsZUtleSxcbiAgICAgICAgICBCb2R5OiBKU09OLnN0cmluZ2lmeShzdWJ0aXRsZURhdGEpLFxuICAgICAgICB9KSxcbiAgICAgICk7XG5cbiAgICAgIHJldHVybiB7XG4gICAgICAgIGF1ZGlvS2V5LFxuICAgICAgICBzdWJ0aXRsZURhdGEsXG4gICAgICB9O1xuICAgIH0pO1xuXG4gICAgLy8gV2FpdCBmb3IgYWxsIHNjZW5lcyB0byBjb21wbGV0ZVxuICAgIGNvbnN0IHJlc3VsdHMgPSBhd2FpdCBQcm9taXNlLmFsbChzY2VuZVByb21pc2VzKTtcblxuICAgIC8vIEV4dHJhY3QgcmVzdWx0cyBpbiB0aGUgY29ycmVjdCBvcmRlclxuICAgIGNvbnN0IGF1ZGlvS2V5cyA9IHJlc3VsdHMubWFwKChyZXN1bHQpID0+IHJlc3VsdC5hdWRpb0tleSk7XG4gICAgY29uc3Qgc3VidGl0bGVzID0gcmVzdWx0cy5tYXAoKHJlc3VsdCkgPT4gcmVzdWx0LnN1YnRpdGxlRGF0YSk7XG5cbiAgICAvLyBHZW5lcmF0ZSBzaWduZWQgVVJMcyBmb3IgYWxsIGF1ZGlvIGZpbGVzIHdpdGggZmlsZW5hbWUgbWFwcGluZ1xuICAgIGNvbnN0IG5hcnJhdGlvblVybHMgPSBhd2FpdCBQcm9taXNlLmFsbChcbiAgICAgIGF1ZGlvS2V5cy5tYXAoYXN5bmMgKGF1ZGlvS2V5KSA9PiB7XG4gICAgICAgIGNvbnN0IHNpZ25lZFVybCA9IGF3YWl0IGdldFNpZ25lZFVybChcbiAgICAgICAgICBzMyxcbiAgICAgICAgICBuZXcgR2V0T2JqZWN0Q29tbWFuZCh7XG4gICAgICAgICAgICBCdWNrZXQ6IHByb2Nlc3MuZW52LlZJREVPX1BBUlRTX0JVQ0tFVF9OQU1FLFxuICAgICAgICAgICAgS2V5OiBhdWRpb0tleSxcbiAgICAgICAgICB9KSxcbiAgICAgICAgICB7IGV4cGlyZXNJbjogMzYwMDAgfSwgLy8gMTAgaG91cnMgZXhwaXJhdGlvblxuICAgICAgICApO1xuXG4gICAgICAgIC8vIEV4dHJhY3QgZmlsZW5hbWUgd2l0aG91dCB1c2VyIHByZWZpeCAoZS5nLiwgXCIxMDA0LnNjZW5lLTEubXAzXCIpXG4gICAgICAgIGNvbnN0IGZpbGVuYW1lID0gYXVkaW9LZXkucmVwbGFjZShgJHt1c2VySWR9L2AsICcnKTtcblxuICAgICAgICByZXR1cm4geyBbZmlsZW5hbWVdOiBzaWduZWRVcmwgfTtcbiAgICAgIH0pLFxuICAgICk7XG5cbiAgICBjb25zb2xlLmxvZyhcbiAgICAgIGDinIUgR2VuZXJhdGVkIG5hcnJhdGlvbiBmb3IgJHtyZXN1bHRzLmxlbmd0aH0gc2NlbmVzIGluIHBhcmFsbGVsYCxcbiAgICApO1xuICAgIHJldHVybiB7IHN1YnRpdGxlcywgbmFycmF0aW9uVXJscyB9O1xuICB9IGNhdGNoIChlcnJvcikge1xuICAgIGNvbnNvbGUuZXJyb3IoJ+KdjCBFcnJvciBpbiBnZW5lcmF0ZU5hcnJhdGlvbjonLCBlcnJvcik7XG4gICAgdGhyb3cgZXJyb3I7XG4gIH1cbn1cbiJdfQ==