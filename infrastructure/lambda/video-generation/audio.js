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
                sceneIndex: i,
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
        console.log(`✅ Generated narration for ${results.length} scenes in parallel`);
        return { audioKeys, subtitles };
    }
    catch (error) {
        console.error('❌ Error in generateNarration:', error);
        throw error;
    }
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiYXVkaW8uanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyJhdWRpby50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiOztBQWdDQSw4Q0F3SUM7QUF4S0Qsa0RBQWdFO0FBQ2hFLG1DQUE0QjtBQUk1QixNQUFNLEVBQUUsR0FBRyxJQUFJLG9CQUFRLENBQUMsRUFBRSxNQUFNLEVBQUUsT0FBTyxDQUFDLEdBQUcsQ0FBQyxVQUFVLEVBQUUsQ0FBQyxDQUFDO0FBQzVELE1BQU0sTUFBTSxHQUFHLElBQUksZ0JBQU0sQ0FBQyxFQUFFLE1BQU0sRUFBRSxPQUFPLENBQUMsR0FBRyxDQUFDLGNBQWMsRUFBRSxDQUFDLENBQUM7QUFtQmxFOzs7OztHQUtHO0FBRUksS0FBSyxVQUFVLGlCQUFpQixDQUNyQyxNQUFlLEVBQ2YsTUFBYyxFQUNkLFNBQWlCLEVBQ2pCLGVBQXVCLHVDQUF1QztJQUU5RCxPQUFPLENBQUMsR0FBRyxDQUNULG1FQUFtRSxDQUNwRSxDQUFDO0lBQ0YsSUFBSSxDQUFDO1FBQ0gsaUNBQWlDO1FBQ2pDLE1BQU0sYUFBYSxHQUFHLE1BQU0sQ0FBQyxHQUFHLENBQUMsS0FBSyxFQUFFLEtBQUssRUFBRSxDQUFDLEVBQUUsRUFBRTtZQUNsRCxPQUFPLENBQUMsR0FBRyxDQUFDLHFDQUFxQyxDQUFDLEdBQUcsRUFBRSxLQUFLLENBQUMsQ0FBQztZQUU5RCx1Q0FBdUM7WUFDdkMsTUFBTSxRQUFRLEdBQUcsTUFBTSxNQUFNLENBQUMsS0FBSyxDQUFDLE1BQU0sQ0FBQyxNQUFNLENBQUM7Z0JBQ2hELEtBQUssRUFBRSxPQUFPO2dCQUNkLEtBQUssRUFBRSxPQUFPO2dCQUNkLFlBQVksRUFBRSxzQ0FBc0MsS0FBSyxDQUFDLFFBQVEsZ0NBQWdDO2dCQUNsRyxLQUFLLEVBQUUsS0FBSyxDQUFDLFNBQVM7YUFDdkIsQ0FBQyxDQUFDO1lBRUgsTUFBTSxtQkFBbUIsR0FBRyxNQUFNLENBQUMsSUFBSSxDQUFDLE1BQU0sUUFBUSxDQUFDLFdBQVcsRUFBRSxD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Q0FBQyxNQUFNLHFCQUFxQixDQUNqRSxDQUFDO1FBQ0YsT0FBTyxFQUFFLFNBQVMsRUFBRSxTQUFTLEVBQUUsQ0FBQztJQUNsQyxDQUFDO0lBQUMsT0FBTyxLQUFLLEVBQUUsQ0FBQztRQUNmLE9BQU8sQ0FBQyxLQUFLLENBQUMsK0JBQStCLEVBQUUsS0FBSyxDQUFDLENBQUM7UUFDdEQsTUFBTSxLQUFLLENBQUM7SUFDZCxDQUFDO0FBQ0gsQ0FBQyIsInNvdXJjZXNDb250ZW50IjpbImltcG9ydCB7IFMzQ2xpZW50LCBQdXRPYmplY3RDb21tYW5kIH0gZnJvbSAnQGF3cy1zZGsvY2xpZW50LXMzJztcbmltcG9ydCBPcGVuQUkgZnJvbSAnb3BlbmFpJztcbmltcG9ydCB7IGFkanVzdEF1ZGlvRHVyYXRpb24gfSBmcm9tICcuL3V0aWwvbmFycmF0aW9uSGVscGVyJztcbmltcG9ydCB7IFNjZW5lIH0gZnJvbSAnLi9zY3JpcHQnO1xuXG5jb25zdCBzMyA9IG5ldyBTM0NsaWVudCh7IHJlZ2lvbjogcHJvY2Vzcy5lbnYuQVdTX1JFR0lPTiB9KTtcbmNvbnN0IG9wZW5haSA9IG5ldyBPcGVuQUkoeyBhcGlLZXk6IHByb2Nlc3MuZW52Lk9QRU5BSV9BUElfS0VZIH0pO1xuXG5leHBvcnQgaW50ZXJmYWNlIFN1YnRpdGxlV29yZCB7XG4gIHdvcmQ6IHN0cmluZztcbiAgc3RhcnQ6IG51bWJlcjtcbiAgZW5kOiBudW1iZXI7XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgU3VidGl0bGVEYXRhIHtcbiAgc2NlbmVJbmRleDogbnVtYmVyO1xuICB3b3JkczogU3VidGl0bGVXb3JkW107XG4gIGZ1bGxUZXh0OiBzdHJpbmc7XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgTmFycmF0aW9uUmVzdWx0IHtcbiAgYXVkaW9LZXlzOiBzdHJpbmdbXTtcbiAgc3VidGl0bGVzOiBTdWJ0aXRsZURhdGFbXTtcbn1cblxuLyoqXG4gKiBBZGp1c3RzIGF1ZGlvIGR1cmF0aW9uIHRvIG1hdGNoIHRhcmdldCBkdXJhdGlvbiB1c2luZyBGRm1wZWdcbiAqIEBwYXJhbSBhdWRpb0J1ZmZlciAtIFRoZSBvcmlnaW5hbCBhdWRpbyBidWZmZXJcbiAqIEBwYXJhbSB0YXJnZXREdXJhdGlvbiAtIFRoZSB0YXJnZXQgZHVyYXRpb24gaW4gc2Vjb25kc1xuICogQHJldHVybnMgUHJvbWlzZTxCdWZmZXI+IC0gVGhlIGFkanVzdGVkIGF1ZGlvIGJ1ZmZlclxuICovXG5cbmV4cG9ydCBhc3luYyBmdW5jdGlvbiBnZW5lcmF0ZU5hcnJhdGlvbihcbiAgc2NlbmVzOiBTY2VuZVtdLFxuICB1c2VySWQ6IHN0cmluZyxcbiAgdGltZXN0YW1wOiBzdHJpbmcsXG4gIGluc3RydWN0aW9uczogc3RyaW5nID0gJ1NwZWFrIGluIGEgY2hlZXJmdWwgYW5kIHBvc2l0aXZlIHRvbmUnLFxuKTogUHJvbWlzZTxOYXJyYXRpb25SZXN1bHQ+IHtcbiAgY29uc29sZS5sb2coXG4gICAgJ/CfjqQgR2VuZXJhdGluZyBuYXJyYXRpb24gZnJvbSBzY2VuZXMgd2l0aCB3b3JkLWxldmVsIHRpbWVzdGFtcHMuLi4nLFxuICApO1xuICB0cnkge1xuICAgIC8vIFByb2Nlc3MgYWxsIHNjZW5lcyBpbiBwYXJhbGxlbFxuICAgIGNvbnN0IHNjZW5lUHJvbWlzZXMgPSBzY2VuZXMubWFwKGFzeW5jIChzY2VuZSwgaSkgPT4ge1xuICAgICAgY29uc29sZS5sb2coYPCfjqQgR2VuZXJhdGluZyBuYXJyYXRpb24gZm9yIHNjZW5lICR7aX06YCwgc2NlbmUpO1xuXG4gICAgICAvLyBHZW5lcmF0ZSBzcGVlY2ggd2l0aCBzdGFuZGFyZCBmb3JtYXRcbiAgICAgIGNvbnN0IHJlc3BvbnNlID0gYXdhaXQgb3BlbmFpLmF1ZGlvLnNwZWVjaC5jcmVhdGUoe1xuICAgICAgICBtb2RlbDogJ3R0cy0xJyxcbiAgICAgICAgdm9pY2U6ICdmYWJsZScsXG4gICAgICAgIGluc3RydWN0aW9uczogYFNwZWFrIGNsZWFybHkgYW5kIGtlZXAgZHVyYXRpb24gaW4gJHtzY2VuZS5kdXJhdGlvbn1zIGhhcmQgY2FwLiBBdm9pZCBsb25nIHBhdXNlcy5gLFxuICAgICAgICBpbnB1dDogc2NlbmUubmFycmF0aW9uLFxuICAgICAgfSk7XG5cbiAgICAgIGNvbnN0IG9yaWdpbmFsQXVkaW9CdWZmZXIgPSBCdWZmZXIuZnJvbShhd2FpdCByZXNwb25zZS5hcnJheUJ1ZmZlcigpKTtcblxuICAgICAgLy8gU2F2ZSB0byBTMyB3aXRoIHRpbWVzdGFtcCBwcmVmaXggdXNpbmcgc2NlbmUuaWRcbiAgICAgIGNvbnN0IGF1ZGlvS2V5ID0gYCR7dXNlcklkfS8ke3RpbWVzdGFtcH0uc2NlbmUtJHtzY2VuZS5pZH0ubXAzYDtcblxuICAgICAgYXdhaXQgczMuc2VuZChcbiAgICAgICAgbmV3IFB1dE9iamVjdENvbW1hbmQoe1xuICAgICAgICAgIEJ1Y2tldDogcHJvY2Vzcy5lbnYuVklERU9fUEFSVFNfQlVDS0VUX05BTUUsXG4gICAgICAgICAgS2V5OiBhdWRpb0tleSxcbiAgICAgICAgICBCb2R5OiBvcmlnaW5hbEF1ZGlvQnVmZmVyLFxuICAgICAgICAgIENvbnRlbnRUeXBlOiAnYXVkaW8vbXBlZycsXG4gICAgICAgIH0pLFxuICAgICAgKTtcblxuICAgICAgLy8gR2V0IHdvcmQtbGV2ZWwgdGltZXN0YW1wcyB1c2luZyB0cmFuc2NyaXB0aW9uXG5cbiAgICAgIC8vIFdyaXRlIGFkanVzdGVkIGF1ZGlvIGJ1ZmZlciB0byB0ZW1wb3JhcnkgZmlsZSBmb3IgdHJhbnNjcmlwdGlvblxuICAgICAgY29uc3QgZnMgPSByZXF1aXJlKCdmcycpO1xuICAgICAgY29uc3Qgb3MgPSByZXF1aXJlKCdvcycpO1xuICAgICAgY29uc3QgcGF0aCA9IHJlcXVpcmUoJ3BhdGgnKTtcblxuICAgICAgY29uc3QgdGVtcEF1ZGlvUGF0aCA9IHBhdGguam9pbihcbiAgICAgICAgb3MudG1wZGlyKCksXG4gICAgICAgIGBzY2VuZS0ke2l9LSR7dGltZXN0YW1wfS5tcDNgLFxuICAgICAgKTtcbiAgICAgIGZzLndyaXRlRmlsZVN5bmModGVtcEF1ZGlvUGF0aCwgb3JpZ2luYWxBdWRpb0J1ZmZlcik7XG5cbiAgICAgIC8vIENyZWF0ZSBmaWxlIG9iamVjdCBmb3IgT3BlbkFJIEFQSVxuICAgICAgY29uc3QgYXVkaW9GaWxlID0gZnMuY3JlYXRlUmVhZFN0cmVhbSh0ZW1wQXVkaW9QYXRoKTtcblxuICAgICAgY29uc3QgdHJhbnNjcmlwdGlvbiA9IGF3YWl0IG9wZW5haS5hdWRpby50cmFuc2NyaXB0aW9ucy5jcmVhdGUoe1xuICAgICAgICBmaWxlOiBhdWRpb0ZpbGUsXG4gICAgICAgIG1vZGVsOiAnd2hpc3Blci0xJyxcbiAgICAgICAgcmVzcG9uc2VfZm9ybWF0OiAndmVyYm9zZV9qc29uJyxcbiAgICAgICAgdGltZXN0YW1wX2dyYW51bGFyaXRpZXM6IFsnd29yZCddLFxuICAgICAgICBsYW5ndWFnZTogJ2VuJyxcbiAgICAgIH0pO1xuXG4gICAgICAvLyBTYXZlIHRyYW5zY3JpcHRpb24gdG8gUzNcbiAgICAgIC8vIGNvbnN0IHRyYW5zY3JpcHRpb25LZXkgPSBgJHt1c2VySWR9LyR7dGltZXN0YW1wfS5zY2VuZS0ke3NjZW5lLmlkfS50cmFuc2NyaXB0aW9uLmpzb25gO1xuICAgICAgLy8gYXdhaXQgczMuc2VuZChcbiAgICAgIC8vICAgbmV3IFB1dE9iamVjdENvbW1hbmQoe1xuICAgICAgLy8gICAgIEJ1Y2tldDogcHJvY2Vzcy5lbnYuVklERU9fUEFSVFNfQlVDS0VUX05BTUUsXG4gICAgICAvLyAgICAgS2V5OiB0cmFuc2NyaXB0aW9uS2V5LFxuICAgICAgLy8gICAgIEJvZHk6IEpTT04uc3RyaW5naWZ5KHRyYW5zY3JpcHRpb24pLFxuICAgICAgLy8gICB9KSxcbiAgICAgIC8vICk7XG5cbiAgICAgIC8vIENsZWFuIHVwIHRlbXBvcmFyeSBmaWxlXG4gICAgICBmcy51bmxpbmtTeW5jKHRlbXBBdWRpb1BhdGgpO1xuXG4gICAgICBjb25zdCBzdWJ0aXRsZURhdGE6IFN1YnRpdGxlRGF0YSA9IHtcbiAgICAgICAgc2NlbmVJbmRleDogaSxcbiAgICAgICAgd29yZHM6IFtdLFxuICAgICAgICBmdWxsVGV4dDogc2NlbmUubmFycmF0aW9uLCAvLyBVc2Ugb3JpZ2luYWwgbmFycmF0aW9uIHRleHQgaW5zdGVhZCBvZiB0cmFuc2NyaWJlZCB0ZXh0XG4gICAgICB9O1xuXG4gICAgICAvLyBFeHRyYWN0IHdvcmQtbGV2ZWwgdGltZXN0YW1wcyBmcm9tIHRoZSB0cmFuc2NyaXB0aW9uIHJlc3BvbnNlXG4gICAgICBpZiAodHJhbnNjcmlwdGlvbi53b3JkcyAmJiBBcnJheS5pc0FycmF5KHRyYW5zY3JpcHRpb24ud29yZHMpKSB7XG4gICAgICAgIHN1YnRpdGxlRGF0YS53b3JkcyA9IHRyYW5zY3JpcHRpb24ud29yZHMubWFwKCh3b3JkOiBhbnkpID0+ICh7XG4gICAgICAgICAgd29yZDogd29yZC53b3JkLFxuICAgICAgICAgIHN0YXJ0OiB3b3JkLnN0YXJ0LFxuICAgICAgICAgIGVuZDogd29yZC5lbmQsXG4gICAgICAgIH0pKTtcbiAgICAgICAgY29uc29sZS5sb2coYPCflI0gU2NlbmUgJHtpfTogV29yZCB0aW1lc3RhbXBzIGV4dHJhY3RlZCBzdWNjZXNzZnVsbHlgKTtcbiAgICAgICAgLy8gV29yZCB0aW1lc3RhbXBzIGV4dHJhY3RlZCBzdWNjZXNzZnVsbHlcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIGNvbnNvbGUubG9nKGDwn5SNIFNjZW5lICR7aX06IE5vIHdvcmQgdGltZXN0YW1wcyBmb3VuZCwgdXNpbmcgZmFsbGJhY2tgKTtcbiAgICAgICAgLy8gVXNpbmcgZmFsbGJhY2sgd29yZCB0aW1lc3RhbXBzXG4gICAgICAgIC8vIEZhbGxiYWNrOiBjcmVhdGUgYSBzaW1wbGUgd29yZC1sZXZlbCBicmVha2Rvd24gd2l0aG91dCBwcmVjaXNlIHRpbWVzdGFtcHNcbiAgICAgICAgY29uc3Qgd29yZHMgPSBzY2VuZS5uYXJyYXRpb25cbiAgICAgICAgICAuc3BsaXQoJyAnKVxuICAgICAgICAgIC5maWx0ZXIoKHdvcmQpID0+IHdvcmQubGVuZ3RoID4gMCk7XG4gICAgICAgIGNvbnN0IGVzdGltYXRlZER1cmF0aW9uID0gc2NlbmUuZHVyYXRpb247XG4gICAgICAgIGNvbnN0IHRpbWVQZXJXb3JkID0gZXN0aW1hdGVkRHVyYXRpb24gLyB3b3Jkcy5sZW5ndGg7XG5cbiAgICAgICAgc3VidGl0bGVEYXRhLndvcmRzID0gd29yZHMubWFwKCh3b3JkLCBpbmRleCkgPT4gKHtcbiAgICAgICAgICB3b3JkLFxuICAgICAgICAgIHN0YXJ0OiBpbmRleCAqIHRpbWVQZXJXb3JkLFxuICAgICAgICAgIGVuZDogKGluZGV4ICsgMSkgKiB0aW1lUGVyV29yZCxcbiAgICAgICAgfSkpO1xuICAgICAgfVxuXG4gICAgICAvLyBTYXZlIGNvbXBsZXRlIHN1YnRpdGxlIGRhdGEgdG8gUzMgKGluY2x1ZGluZyBmdWxsVGV4dClcbiAgICAgIGNvbnN0IHN1YnRpdGxlS2V5ID0gYCR7dXNlcklkfS8ke3RpbWVzdGFtcH0uc2NlbmUtJHtzY2VuZS5pZH0uc3VidGl0bGUuanNvbmA7XG4gICAgICBhd2FpdCBzMy5zZW5kKFxuICAgICAgICBuZXcgUHV0T2JqZWN0Q29tbWFuZCh7XG4gICAgICAgICAgQnVja2V0OiBwcm9jZXNzLmVudi5WSURFT19QQVJUU19CVUNLRVRfTkFNRSxcbiAgICAgICAgICBLZXk6IHN1YnRpdGxlS2V5LFxuICAgICAgICAgIEJvZHk6IEpTT04uc3RyaW5naWZ5KHN1YnRpdGxlRGF0YSksXG4gICAgICAgIH0pLFxuICAgICAgKTtcblxuICAgICAgcmV0dXJuIHtcbiAgICAgICAgYXVkaW9LZXksXG4gICAgICAgIHN1YnRpdGxlRGF0YSxcbiAgICAgIH07XG4gICAgfSk7XG5cbiAgICAvLyBXYWl0IGZvciBhbGwgc2NlbmVzIHRvIGNvbXBsZXRlXG4gICAgY29uc3QgcmVzdWx0cyA9IGF3YWl0IFByb21pc2UuYWxsKHNjZW5lUHJvbWlzZXMpO1xuXG4gICAgLy8gRXh0cmFjdCByZXN1bHRzIGluIHRoZSBjb3JyZWN0IG9yZGVyXG4gICAgY29uc3QgYXVkaW9LZXlzID0gcmVzdWx0cy5tYXAoKHJlc3VsdCkgPT4gcmVzdWx0LmF1ZGlvS2V5KTtcbiAgICBjb25zdCBzdWJ0aXRsZXMgPSByZXN1bHRzLm1hcCgocmVzdWx0KSA9PiByZXN1bHQuc3VidGl0bGVEYXRhKTtcblxuICAgIGNvbnNvbGUubG9nKFxuICAgICAgYOKchSBHZW5lcmF0ZWQgbmFycmF0aW9uIGZvciAke3Jlc3VsdHMubGVuZ3RofSBzY2VuZXMgaW4gcGFyYWxsZWxgLFxuICAgICk7XG4gICAgcmV0dXJuIHsgYXVkaW9LZXlzLCBzdWJ0aXRsZXMgfTtcbiAgfSBjYXRjaCAoZXJyb3IpIHtcbiAgICBjb25zb2xlLmVycm9yKCfinYwgRXJyb3IgaW4gZ2VuZXJhdGVOYXJyYXRpb246JywgZXJyb3IpO1xuICAgIHRocm93IGVycm9yO1xuICB9XG59XG4iXX0=