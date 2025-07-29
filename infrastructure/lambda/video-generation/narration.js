"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.generateNarration = generateNarration;
exports.generateStoryBreakdown = generateStoryBreakdown;
const client_s3_1 = require("@aws-sdk/client-s3");
const openai_1 = require("openai");
const s3 = new client_s3_1.S3Client({ region: process.env.AWS_REGION });
const openai = new openai_1.default({ apiKey: process.env.OPENAI_API_KEY });
async function generateNarration(scenes, userId, timestamp) {
    console.log('🎤 Generating narration from scenes with word-level timestamps...');
    try {
        const audioKeys = [];
        const subtitles = [];
        for (let i = 0; i < scenes.length; i++) {
            const scene = scenes[i];
            console.log(`🎤 Generating narration for scene ${i}:`, scene.narration);
            // Generate speech with standard format
            const response = await openai.audio.speech.create({
                model: 'tts-1',
                voice: 'alloy',
                input: scene.narration,
            });
            const audioBuffer = Buffer.from(await response.arrayBuffer());
            console.log(`✅ Generated audio for scene ${i}, size: ${audioBuffer.length} bytes`);
            // Save to S3 with timestamp prefix
            const audioKey = `${userId}/${timestamp}.scene-${i}.mp3`;
            console.log(`☁️ Uploading audio to S3: ${process.env.VIDEO_PARTS_BUCKET_NAME}/${audioKey}`);
            await s3.send(new client_s3_1.PutObjectCommand({
                Bucket: process.env.VIDEO_PARTS_BUCKET_NAME,
                Key: audioKey,
                Body: audioBuffer,
                ContentType: 'audio/mpeg',
            }));
            console.log(`✅ Uploaded audio to S3: ${audioKey}`);
            audioKeys.push(audioKey);
            // Get word-level timestamps using transcription
            console.log(`🎤 Transcribing audio for scene ${i} to get word timestamps...`);
            // Write audio buffer to temporary file for transcription
            const fs = require('fs');
            const os = require('os');
            const path = require('path');
            const tempAudioPath = path.join(os.tmpdir(), `scene-${i}.mp3`);
            fs.writeFileSync(tempAudioPath, audioBuffer);
            // Create file object for OpenAI API
            const audioFile = fs.createReadStream(tempAudioPath);
            const transcription = await openai.audio.transcriptions.create({
                file: audioFile,
                model: 'whisper-1',
                response_format: 'verbose_json',
                timestamp_granularities: ['word'],
            });
            // Clean up temporary file
            fs.unlinkSync(tempAudioPath);
            const subtitleData = {
                sceneIndex: i,
                words: [],
                fullText: transcription.text,
            };
            // Extract word-level timestamps from the transcription response
            if (transcription.words && Array.isArray(transcription.words)) {
                subtitleData.words = transcription.words.map((word) => ({
                    word: word.word,
                    start: word.start,
                    end: word.end,
                }));
                console.log(`📝 Extracted ${subtitleData.words.length} word timestamps for scene ${i}`);
            }
            else {
                console.log(`⚠️ No word timestamps available for scene ${i}, using fallback`);
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
            subtitles.push(subtitleData);
        }
        return { audioKeys, subtitles };
    }
    catch (error) {
        console.error('❌ Error in generateNarration:', error);
        throw error;
    }
}
async function generateStoryBreakdown(prompt, sceneCount, totalDuration) {
    console.log('🤖 Calling OpenAI for story breakdown...');
    console.log(`📊 Parameters: ${sceneCount} scenes, ${totalDuration} seconds total`);
    const sceneDuration = Math.floor(totalDuration / sceneCount);
    console.log(`⏱️  Each scene will be ${sceneDuration} seconds long`);
    try {
        const response = await openai.chat.completions.create({
            model: 'gpt-4',
            messages: [
                {
                    role: 'system',
                    content: `You are a video script writer. Break down the given prompt into ${sceneCount} scenes, each ${sceneDuration} seconds long, for a ${totalDuration}-second vertical video. 
          Each scene should have a clear visual description and narration text. Return as JSON array with objects containing:
          - description: visual scene description for video generation
          - duration: ${sceneDuration} (seconds)
          - narration: text to be spoken in this scene
          
          If only 1 scene is requested, create a single comprehensive scene that covers the entire duration.`,
                },
                {
                    role: 'user',
                    content: prompt,
                },
            ],
            temperature: 0.7,
        });
        const content = response.choices[0]?.message?.content;
        console.log('📄 OpenAI response content:', content);
        if (!content) {
            console.log('❌ Error: OpenAI did not return content');
            throw new Error('Failed to generate story breakdown');
        }
        const scenes = JSON.parse(content);
        console.log('✅ Story breakdown parsed successfully');
        return scenes;
    }
    catch (error) {
        console.error('❌ Error in generateStoryBreakdown:', error);
        throw error;
    }
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoibmFycmF0aW9uLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsibmFycmF0aW9uLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiI7O0FBaUNBLDhDQWtIQztBQUVELHdEQWtEQztBQXZNRCxrREFJNEI7QUFDNUIsbUNBQTRCO0FBRTVCLE1BQU0sRUFBRSxHQUFHLElBQUksb0JBQVEsQ0FBQyxFQUFFLE1BQU0sRUFBRSxPQUFPLENBQUMsR0FBRyxDQUFDLFVBQVUsRUFBRSxDQUFDLENBQUM7QUFDNUQsTUFBTSxNQUFNLEdBQUcsSUFBSSxnQkFBTSxDQUFDLEVBQUUsTUFBTSxFQUFFLE9BQU8sQ0FBQyxHQUFHLENBQUMsY0FBYyxFQUFFLENBQUMsQ0FBQztBQXlCM0QsS0FBSyxVQUFVLGlCQUFpQixDQUNyQyxNQUFlLEVBQ2YsTUFBYyxFQUNkLFNBQWlCO0lBRWpCLE9BQU8sQ0FBQyxHQUFHLENBQ1QsbUVBQW1FLENBQ3BFLENBQUM7SUFDRixJQUFJLENBQUM7UUFDSCxNQUFNLFNBQVMsR0FBYSxFQUFFLENBQUM7UUFDL0IsTUFBTSxTQUFTLEdBQW1CLEVBQUUsQ0FBQztRQUVyQyxLQUFLLElBQUksQ0FBQyxHQUFHLENBQUMsRUFBRSxDQUFDLEdBQUcsTUFBTSxDQUFDLE1BQU0sRUFBRSxDQUFDLEVBQUUsRUFBRSxDQUFDO1lBQ3ZDLE1BQU0sS0FBSyxHQUFHLE1BQU0sQ0FBQyxDQUFDLENBQUMsQ0FBQztZQUN4QixPQUFPLENBQUMsR0FBRyxDQUFDLHFDQUFxQyxDQUFDLEdBQUcsRUFBRSxLQUFLLENBQUMsU0FBUyxDQUFDLENBQUM7WUFFeEUsdUNBQXVDO1lBQ3ZDLE1BQU0sUUFBUSxHQUFHLE1BQU0sTUFBTSxDQUFDLEtBQUssQ0FBQyxNQUFNLENBQUMsTUFBTSxDQUFDO2dCQUNoRCxLQUFLLEVBQUUsT0FBTztnQkFDZCxLQUFLLEVBQUUsT0FBTztnQkFDZCxLQUFLLEVBQUUsS0FBSyxDQUFDLFNBQVM7YUFDdkIsQ0FBQyxDQUFDO1lBRUgsTUFBTSxX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c0NvbnRlbnQiOlsiaW1wb3J0IHtcbiAgUzNDbGllbnQsXG4gIFB1dE9iamVjdENvbW1hbmQsXG4gIEdldE9iamVjdENvbW1hbmQsXG59IGZyb20gJ0Bhd3Mtc2RrL2NsaWVudC1zMyc7XG5pbXBvcnQgT3BlbkFJIGZyb20gJ29wZW5haSc7XG5cbmNvbnN0IHMzID0gbmV3IFMzQ2xpZW50KHsgcmVnaW9uOiBwcm9jZXNzLmVudi5BV1NfUkVHSU9OIH0pO1xuY29uc3Qgb3BlbmFpID0gbmV3IE9wZW5BSSh7IGFwaUtleTogcHJvY2Vzcy5lbnYuT1BFTkFJX0FQSV9LRVkgfSk7XG5cbmV4cG9ydCBpbnRlcmZhY2UgU2NlbmUge1xuICBkZXNjcmlwdGlvbjogc3RyaW5nO1xuICBkdXJhdGlvbjogbnVtYmVyO1xuICBuYXJyYXRpb246IHN0cmluZztcbn1cblxuZXhwb3J0IGludGVyZmFjZSBTdWJ0aXRsZVdvcmQge1xuICB3b3JkOiBzdHJpbmc7XG4gIHN0YXJ0OiBudW1iZXI7XG4gIGVuZDogbnVtYmVyO1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIFN1YnRpdGxlRGF0YSB7XG4gIHNjZW5lSW5kZXg6IG51bWJlcjtcbiAgd29yZHM6IFN1YnRpdGxlV29yZFtdO1xuICBmdWxsVGV4dDogc3RyaW5nO1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIE5hcnJhdGlvblJlc3VsdCB7XG4gIGF1ZGlvS2V5czogc3RyaW5nW107XG4gIHN1YnRpdGxlczogU3VidGl0bGVEYXRhW107XG59XG5cbmV4cG9ydCBhc3luYyBmdW5jdGlvbiBnZW5lcmF0ZU5hcnJhdGlvbihcbiAgc2NlbmVzOiBTY2VuZVtdLFxuICB1c2VySWQ6IHN0cmluZyxcbiAgdGltZXN0YW1wOiBzdHJpbmcsXG4pOiBQcm9taXNlPE5hcnJhdGlvblJlc3VsdD4ge1xuICBjb25zb2xlLmxvZyhcbiAgICAn8J+OpCBHZW5lcmF0aW5nIG5hcnJhdGlvbiBmcm9tIHNjZW5lcyB3aXRoIHdvcmQtbGV2ZWwgdGltZXN0YW1wcy4uLicsXG4gICk7XG4gIHRyeSB7XG4gICAgY29uc3QgYXVkaW9LZXlzOiBzdHJpbmdbXSA9IFtdO1xuICAgIGNvbnN0IHN1YnRpdGxlczogU3VidGl0bGVEYXRhW10gPSBbXTtcblxuICAgIGZvciAobGV0IGkgPSAwOyBpIDwgc2NlbmVzLmxlbmd0aDsgaSsrKSB7XG4gICAgICBjb25zdCBzY2VuZSA9IHNjZW5lc1tpXTtcbiAgICAgIGNvbnNvbGUubG9nKGDwn46kIEdlbmVyYXRpbmcgbmFycmF0aW9uIGZvciBzY2VuZSAke2l9OmAsIHNjZW5lLm5hcnJhdGlvbik7XG5cbiAgICAgIC8vIEdlbmVyYXRlIHNwZWVjaCB3aXRoIHN0YW5kYXJkIGZvcm1hdFxuICAgICAgY29uc3QgcmVzcG9uc2UgPSBhd2FpdCBvcGVuYWkuYXVkaW8uc3BlZWNoLmNyZWF0ZSh7XG4gICAgICAgIG1vZGVsOiAndHRzLTEnLFxuICAgICAgICB2b2ljZTogJ2FsbG95JyxcbiAgICAgICAgaW5wdXQ6IHNjZW5lLm5hcnJhdGlvbixcbiAgICAgIH0pO1xuXG4gICAgICBjb25zdCBhdWRpb0J1ZmZlciA9IEJ1ZmZlci5mcm9tKGF3YWl0IHJlc3BvbnNlLmFycmF5QnVmZmVyKCkpO1xuICAgICAgY29uc29sZS5sb2coXG4gICAgICAgIGDinIUgR2VuZXJhdGVkIGF1ZGlvIGZvciBzY2VuZSAke2l9LCBzaXplOiAke2F1ZGlvQnVmZmVyLmxlbmd0aH0gYnl0ZXNgLFxuICAgICAgKTtcblxuICAgICAgLy8gU2F2ZSB0byBTMyB3aXRoIHRpbWVzdGFtcCBwcmVmaXhcbiAgICAgIGNvbnN0IGF1ZGlvS2V5ID0gYCR7dXNlcklkfS8ke3RpbWVzdGFtcH0uc2NlbmUtJHtpfS5tcDNgO1xuICAgICAgY29uc29sZS5sb2coXG4gICAgICAgIGDimIHvuI8gVXBsb2FkaW5nIGF1ZGlvIHRvIFMzOiAke3Byb2Nlc3MuZW52LlZJREVPX1BBUlRTX0JVQ0tFVF9OQU1FfS8ke2F1ZGlvS2V5fWAsXG4gICAgICApO1xuXG4gICAgICBhd2FpdCBzMy5zZW5kKFxuICAgICAgICBuZXcgUHV0T2JqZWN0Q29tbWFuZCh7XG4gICAgICAgICAgQnVja2V0OiBwcm9jZXNzLmVudi5WSURFT19QQVJUU19CVUNLRVRfTkFNRSxcbiAgICAgICAgICBLZXk6IGF1ZGlvS2V5LFxuICAgICAgICAgIEJvZHk6IGF1ZGlvQnVmZmVyLFxuICAgICAgICAgIENvbnRlbnRUeXBlOiAnYXVkaW8vbXBlZycsXG4gICAgICAgIH0pLFxuICAgICAgKTtcbiAgICAgIGNvbnNvbGUubG9nKGDinIUgVXBsb2FkZWQgYXVkaW8gdG8gUzM6ICR7YXVkaW9LZXl9YCk7XG5cbiAgICAgIGF1ZGlvS2V5cy5wdXNoKGF1ZGlvS2V5KTtcblxuICAgICAgLy8gR2V0IHdvcmQtbGV2ZWwgdGltZXN0YW1wcyB1c2luZyB0cmFuc2NyaXB0aW9uXG4gICAgICBjb25zb2xlLmxvZyhcbiAgICAgICAgYPCfjqQgVHJhbnNjcmliaW5nIGF1ZGlvIGZvciBzY2VuZSAke2l9IHRvIGdldCB3b3JkIHRpbWVzdGFtcHMuLi5gLFxuICAgICAgKTtcblxuICAgICAgLy8gV3JpdGUgYXVkaW8gYnVmZmVyIHRvIHRlbXBvcmFyeSBmaWxlIGZvciB0cmFuc2NyaXB0aW9uXG4gICAgICBjb25zdCBmcyA9IHJlcXVpcmUoJ2ZzJyk7XG4gICAgICBjb25zdCBvcyA9IHJlcXVpcmUoJ29zJyk7XG4gICAgICBjb25zdCBwYXRoID0gcmVxdWlyZSgncGF0aCcpO1xuXG4gICAgICBjb25zdCB0ZW1wQXVkaW9QYXRoID0gcGF0aC5qb2luKG9zLnRtcGRpcigpLCBgc2NlbmUtJHtpfS5tcDNgKTtcbiAgICAgIGZzLndyaXRlRmlsZVN5bmModGVtcEF1ZGlvUGF0aCwgYXVkaW9CdWZmZXIpO1xuXG4gICAgICAvLyBDcmVhdGUgZmlsZSBvYmplY3QgZm9yIE9wZW5BSSBBUElcbiAgICAgIGNvbnN0IGF1ZGlvRmlsZSA9IGZzLmNyZWF0ZVJlYWRTdHJlYW0odGVtcEF1ZGlvUGF0aCk7XG5cbiAgICAgIGNvbnN0IHRyYW5zY3JpcHRpb24gPSBhd2FpdCBvcGVuYWkuYXVkaW8udHJhbnNjcmlwdGlvbnMuY3JlYXRlKHtcbiAgICAgICAgZmlsZTogYXVkaW9GaWxlLFxuICAgICAgICBtb2RlbDogJ3doaXNwZXItMScsXG4gICAgICAgIHJlc3BvbnNlX2Zvcm1hdDogJ3ZlcmJvc2VfanNvbicsXG4gICAgICAgIHRpbWVzdGFtcF9ncmFudWxhcml0aWVzOiBbJ3dvcmQnXSxcbiAgICAgIH0pO1xuXG4gICAgICAvLyBDbGVhbiB1cCB0ZW1wb3JhcnkgZmlsZVxuICAgICAgZnMudW5saW5rU3luYyh0ZW1wQXVkaW9QYXRoKTtcblxuICAgICAgY29uc3Qgc3VidGl0bGVEYXRhOiBTdWJ0aXRsZURhdGEgPSB7XG4gICAgICAgIHNjZW5lSW5kZXg6IGksXG4gICAgICAgIHdvcmRzOiBbXSxcbiAgICAgICAgZnVsbFRleHQ6IHRyYW5zY3JpcHRpb24udGV4dCxcbiAgICAgIH07XG5cbiAgICAgIC8vIEV4dHJhY3Qgd29yZC1sZXZlbCB0aW1lc3RhbXBzIGZyb20gdGhlIHRyYW5zY3JpcHRpb24gcmVzcG9uc2VcbiAgICAgIGlmICh0cmFuc2NyaXB0aW9uLndvcmRzICYmIEFycmF5LmlzQXJyYXkodHJhbnNjcmlwdGlvbi53b3JkcykpIHtcbiAgICAgICAgc3VidGl0bGVEYXRhLndvcmRzID0gdHJhbnNjcmlwdGlvbi53b3Jkcy5tYXAoKHdvcmQ6IGFueSkgPT4gKHtcbiAgICAgICAgICB3b3JkOiB3b3JkLndvcmQsXG4gICAgICAgICAgc3RhcnQ6IHdvcmQuc3RhcnQsXG4gICAgICAgICAgZW5kOiB3b3JkLmVuZCxcbiAgICAgICAgfSkpO1xuICAgICAgICBjb25zb2xlLmxvZyhcbiAgICAgICAgICBg8J+TnSBFeHRyYWN0ZWQgJHtzdWJ0aXRsZURhdGEud29yZHMubGVuZ3RofSB3b3JkIHRpbWVzdGFtcHMgZm9yIHNjZW5lICR7aX1gLFxuICAgICAgICApO1xuICAgICAgfSBlbHNlIHtcbiAgICAgICAgY29uc29sZS5sb2coXG4gICAgICAgICAgYOKaoO+4jyBObyB3b3JkIHRpbWVzdGFtcHMgYXZhaWxhYmxlIGZvciBzY2VuZSAke2l9LCB1c2luZyBmYWxsYmFja2AsXG4gICAgICAgICk7XG4gICAgICAgIC8vIEZhbGxiYWNrOiBjcmVhdGUgYSBzaW1wbGUgd29yZC1sZXZlbCBicmVha2Rvd24gd2l0aG91dCBwcmVjaXNlIHRpbWVzdGFtcHNcbiAgICAgICAgY29uc3Qgd29yZHMgPSBzY2VuZS5uYXJyYXRpb25cbiAgICAgICAgICAuc3BsaXQoJyAnKVxuICAgICAgICAgIC5maWx0ZXIoKHdvcmQpID0+IHdvcmQubGVuZ3RoID4gMCk7XG4gICAgICAgIGNvbnN0IGVzdGltYXRlZER1cmF0aW9uID0gc2NlbmUuZHVyYXRpb247XG4gICAgICAgIGNvbnN0IHRpbWVQZXJXb3JkID0gZXN0aW1hdGVkRHVyYXRpb24gLyB3b3Jkcy5sZW5ndGg7XG5cbiAgICAgICAgc3VidGl0bGVEYXRhLndvcmRzID0gd29yZHMubWFwKCh3b3JkLCBpbmRleCkgPT4gKHtcbiAgICAgICAgICB3b3JkLFxuICAgICAgICAgIHN0YXJ0OiBpbmRleCAqIHRpbWVQZXJXb3JkLFxuICAgICAgICAgIGVuZDogKGluZGV4ICsgMSkgKiB0aW1lUGVyV29yZCxcbiAgICAgICAgfSkpO1xuICAgICAgfVxuXG4gICAgICBzdWJ0aXRsZXMucHVzaChzdWJ0aXRsZURhdGEpO1xuICAgIH1cblxuICAgIHJldHVybiB7IGF1ZGlvS2V5cywgc3VidGl0bGVzIH07XG4gIH0gY2F0Y2ggKGVycm9yKSB7XG4gICAgY29uc29sZS5lcnJvcign4p2MIEVycm9yIGluIGdlbmVyYXRlTmFycmF0aW9uOicsIGVycm9yKTtcbiAgICB0aHJvdyBlcnJvcjtcbiAgfVxufVxuXG5leHBvcnQgYXN5bmMgZnVuY3Rpb24gZ2VuZXJhdGVTdG9yeUJyZWFrZG93bihcbiAgcHJvbXB0OiBzdHJpbmcsXG4gIHNjZW5lQ291bnQ6IG51bWJlcixcbiAgdG90YWxEdXJhdGlvbjogbnVtYmVyLFxuKTogUHJvbWlzZTxTY2VuZVtdPiB7XG4gIGNvbnNvbGUubG9nKCfwn6SWIENhbGxpbmcgT3BlbkFJIGZvciBzdG9yeSBicmVha2Rvd24uLi4nKTtcbiAgY29uc29sZS5sb2coXG4gICAgYPCfk4ogUGFyYW1ldGVyczogJHtzY2VuZUNvdW50fSBzY2VuZXMsICR7dG90YWxEdXJhdGlvbn0gc2Vjb25kcyB0b3RhbGAsXG4gICk7XG5cbiAgY29uc3Qgc2NlbmVEdXJhdGlvbiA9IE1hdGguZmxvb3IodG90YWxEdXJhdGlvbiAvIHNjZW5lQ291bnQpO1xuICBjb25zb2xlLmxvZyhg4o+x77iPICBFYWNoIHNjZW5lIHdpbGwgYmUgJHtzY2VuZUR1cmF0aW9ufSBzZWNvbmRzIGxvbmdgKTtcblxuICB0cnkge1xuICAgIGNvbnN0IHJlc3BvbnNlID0gYXdhaXQgb3BlbmFpLmNoYXQuY29tcGxldGlvbnMuY3JlYXRlKHtcbiAgICAgIG1vZGVsOiAnZ3B0LTQnLFxuICAgICAgbWVzc2FnZXM6IFtcbiAgICAgICAge1xuICAgICAgICAgIHJvbGU6ICdzeXN0ZW0nLFxuICAgICAgICAgIGNvbnRlbnQ6IGBZb3UgYXJlIGEgdmlkZW8gc2NyaXB0IHdyaXRlci4gQnJlYWsgZG93biB0aGUgZ2l2ZW4gcHJvbXB0IGludG8gJHtzY2VuZUNvdW50fSBzY2VuZXMsIGVhY2ggJHtzY2VuZUR1cmF0aW9ufSBzZWNvbmRzIGxvbmcsIGZvciBhICR7dG90YWxEdXJhdGlvbn0tc2Vjb25kIHZlcnRpY2FsIHZpZGVvLiBcbiAgICAgICAgICBFYWNoIHNjZW5lIHNob3VsZCBoYXZlIGEgY2xlYXIgdmlzdWFsIGRlc2NyaXB0aW9uIGFuZCBuYXJyYXRpb24gdGV4dC4gUmV0dXJuIGFzIEpTT04gYXJyYXkgd2l0aCBvYmplY3RzIGNvbnRhaW5pbmc6XG4gICAgICAgICAgLSBkZXNjcmlwdGlvbjogdmlzdWFsIHNjZW5lIGRlc2NyaXB0aW9uIGZvciB2aWRlbyBnZW5lcmF0aW9uXG4gICAgICAgICAgLSBkdXJhdGlvbjogJHtzY2VuZUR1cmF0aW9ufSAoc2Vjb25kcylcbiAgICAgICAgICAtIG5hcnJhdGlvbjogdGV4dCB0byBiZSBzcG9rZW4gaW4gdGhpcyBzY2VuZVxuICAgICAgICAgIFxuICAgICAgICAgIElmIG9ubHkgMSBzY2VuZSBpcyByZXF1ZXN0ZWQsIGNyZWF0ZSBhIHNpbmdsZSBjb21wcmVoZW5zaXZlIHNjZW5lIHRoYXQgY292ZXJzIHRoZSBlbnRpcmUgZHVyYXRpb24uYCxcbiAgICAgICAgfSxcbiAgICAgICAge1xuICAgICAgICAgIHJvbGU6ICd1c2VyJyxcbiAgICAgICAgICBjb250ZW50OiBwcm9tcHQsXG4gICAgICAgIH0sXG4gICAgICBdLFxuICAgICAgdGVtcGVyYXR1cmU6IDAuNyxcbiAgICB9KTtcblxuICAgIGNvbnN0IGNvbnRlbnQgPSByZXNwb25zZS5jaG9pY2VzWzBdPy5tZXNzYWdlPy5jb250ZW50O1xuICAgIGNvbnNvbGUubG9nKCfwn5OEIE9wZW5BSSByZXNwb25zZSBjb250ZW50OicsIGNvbnRlbnQpO1xuXG4gICAgaWYgKCFjb250ZW50KSB7XG4gICAgICBjb25zb2xlLmxvZygn4p2MIEVycm9yOiBPcGVuQUkgZGlkIG5vdCByZXR1cm4gY29udGVudCcpO1xuICAgICAgdGhyb3cgbmV3IEVycm9yKCdGYWlsZWQgdG8gZ2VuZXJhdGUgc3RvcnkgYnJlYWtkb3duJyk7XG4gICAgfVxuXG4gICAgY29uc3Qgc2NlbmVzID0gSlNPTi5wYXJzZShjb250ZW50KTtcbiAgICBjb25zb2xlLmxvZygn4pyFIFN0b3J5IGJyZWFrZG93biBwYXJzZWQgc3VjY2Vzc2Z1bGx5Jyk7XG4gICAgcmV0dXJuIHNjZW5lcztcbiAgfSBjYXRjaCAoZXJyb3IpIHtcbiAgICBjb25zb2xlLmVycm9yKCfinYwgRXJyb3IgaW4gZ2VuZXJhdGVTdG9yeUJyZWFrZG93bjonLCBlcnJvcik7XG4gICAgdGhyb3cgZXJyb3I7XG4gIH1cbn1cbiJdfQ==