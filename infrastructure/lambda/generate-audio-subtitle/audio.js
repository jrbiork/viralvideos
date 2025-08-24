"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.generateNarration = generateNarration;
const client_s3_1 = require("@aws-sdk/client-s3");
const openai_1 = require("openai");
const narrationHelper_1 = require("./util/narrationHelper");
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
        const audioKeys = [];
        const subtitles = [];
        for (let i = 0; i < scenes.length; i++) {
            const scene = scenes[i];
            console.log(`🎤 Generating narration for scene ${i}:`, scene.narration);
            // Generate speech with standard format
            const response = await openai.audio.speech.create({
                model: 'gpt-4o-mini-tts',
                voice: 'sage',
                instructions: instructions,
                input: scene.narration,
            });
            const originalAudioBuffer = Buffer.from(await response.arrayBuffer());
            // Adjust audio duration to match target duration
            const adjustedAudioBuffer = await (0, narrationHelper_1.adjustAudioDuration)(originalAudioBuffer, scene.duration);
            // Save to S3 with timestamp prefix using scene.id
            const audioKey = `${userId}/${timestamp}.scene-${scene.id}.mp3`;
            await s3.send(new client_s3_1.PutObjectCommand({
                Bucket: process.env.VIDEO_PARTS_BUCKET_NAME,
                Key: audioKey,
                Body: adjustedAudioBuffer,
                ContentType: 'audio/mpeg',
            }));
            audioKeys.push(audioKey);
            // Get word-level timestamps using transcription
            // Write adjusted audio buffer to temporary file for transcription
            const fs = require('fs');
            const os = require('os');
            const path = require('path');
            const tempAudioPath = path.join(os.tmpdir(), `scene-${i}.mp3`);
            fs.writeFileSync(tempAudioPath, adjustedAudioBuffer);
            // Create file object for OpenAI API
            const audioFile = fs.createReadStream(tempAudioPath);
            const transcription = await openai.audio.transcriptions.create({
                file: audioFile,
                model: 'whisper-1',
                response_format: 'verbose_json',
                timestamp_granularities: ['word'],
                language: 'en',
            });
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
                // Word timestamps extracted successfully
            }
            else {
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
            subtitles.push(subtitleData);
        }
        return { audioKeys, subtitles };
    }
    catch (error) {
        console.error('❌ Error in generateNarration:', error);
        throw error;
    }
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiYXVkaW8uanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyJhdWRpby50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiOztBQWdDQSw4Q0E2R0M7QUE3SUQsa0RBQWdFO0FBQ2hFLG1DQUE0QjtBQUM1Qiw0REFBNkQ7QUFHN0QsTUFBTSxFQUFFLEdBQUcsSUFBSSxvQkFBUSxDQUFDLEVBQUUsTUFBTSxFQUFFLE9BQU8sQ0FBQyxHQUFHLENBQUMsVUFBVSxFQUFFLENBQUMsQ0FBQztBQUM1RCxNQUFNLE1BQU0sR0FBRyxJQUFJLGdCQUFNLENBQUMsRUFBRSxNQUFNLEVBQUUsT0FBTyxDQUFDLEdBQUcsQ0FBQyxjQUFjLEVBQUUsQ0FBQyxDQUFDO0FBbUJsRTs7Ozs7R0FLRztBQUVJLEtBQUssVUFBVSxpQkFBaUIsQ0FDckMsTUFBZSxFQUNmLE1BQWMsRUFDZCxTQUFpQixFQUNqQixlQUF1Qix1Q0FBdUM7SUFFOUQsT0FBTyxDQUFDLEdBQUcsQ0FDVCxtRUFBbUUsQ0FDcEUsQ0FBQztJQUNGLElBQUksQ0FBQztRQUNILE1BQU0sU0FBUyxHQUFhLEVBQUUsQ0FBQztRQUMvQixNQUFNLFNBQVMsR0FBbUIsRUFBRSxDQUFDO1FBRXJDLEtBQUssSUFBSSxDQUFDLEdBQUcsQ0FBQyxFQUFFLENBQUMsR0FBRyxNQUFNLENBQUMsTUFBTSxFQUFFLENBQUMsRUFBRSxFQUFFLENBQUM7WUFDdkMsTUFBTSxLQUFLLEdBQUcsTUFBTSxDQUFDLENBQUMsQ0FBQyxDQUFDO1lBQ3hCLE9BQU8sQ0FBQyxHQUFHLENBQUMscUNBQXFDLENBQUMsR0FBRyxFQUFFLEtBQUssQ0FBQyxTQUFTLENBQUMsQ0FBQztZQUV4RSx1Q0FBdUM7WUFDdkMsTUFBTSxRQUFRLEdBQUcsTUFBTSxNQUFNLENBQUMsS0FBSyxDQUFDLE1BQU0sQ0FBQyxNQUFNLENBQUM7Z0JBQ2hELEtBQUssRUFBRSxpQkFBaUI7Z0JBQ3hCLEtBQUssRUFBRSxNQUFNO2dCQUNiLFlBQVksRUFBRSxZQUFZO2dCQUMxQixLQUFLLEVBQUUsS0FBSyxDQUFDLFNBQVM7YUFDdkIsQ0FBQyxDQUFDO1lBRUgsTUFBTSxtQkFBbUIsR0FBRyxNQUFNLENBQUMsSUFBSSxDQUFDLE1BQU0sUUFBUSxDQUFDLFdBQVcsRUFBRSxDQUFDLENBQUM7WUFFdEUsaURBQWlEO1lBQ2pELE1BQU0sbUJBQW1CLEdBQUcsTUFBTSxJQUFBLHFDQUFtQixFQUNuRCxtQkFBbUIsRUFDbkIsS0FBSyxDQUFDLFFBQVEsQ0FDZixDQUFDO1lBRUYsa0RBQWtEO1lBQ2xELE1BQU0sUUFBUSxHQUFHLEdBQUcsTUFBTSxJQUFJLFNBQVMsVUFBVSxLQUFLLENBQUMsRUFBRSxNQUFNLENBQUM7WUFFaEUsTUFBTSxFQUFFLENBQUMsSUFBSSxDQUNYLElBQUksNEJBQWdCLENBQUM7Z0JBQ25CLE1BQU0sRUFBRSxPQUFPLENBQUMsR0FBRyxDQUFDLHVCQUF1QjtnQkFDM0MsR0FBRyxFQUFFLFFBQVE7Z0JBQ2IsSUFBSSxFQUFFLG1CQUFtQjtnQkFDekIsV0FBVyxFQUFFLFlBQVk7YUFDMUIsQ0FBQyxDQUNILENBQUM7WUFFRixTQUFTLENBQUMsSUFBSSxDQUFDLFFBQVEsQ0FBQyxDQUFDO1lBRXpCLGdEQUFnRDtZQUVoRCxrRUFBa0U7WUFDbEUsTUFBTSxFQUFFLEdBQUcsT0FBTyxDQUFDLElBQUksQ0FBQyxDQUFDO1lBQ3pCLE1BQU0sRUFBRSxHQUFHLE9BQU8sQ0FBQyxJQUFJLENBQUMsQ0FBQztZQUN6QixNQUFNLElBQUksR0FBRyxPQUFPLENBQUMsTUFBTSxDQUFDLENBQUM7WUFFN0IsTUFBTSxhQUFhLEdBQUcsSUFBSSxDQUFDLElBQUksQ0FBQyxFQUFFLENBQUMsTUFBTSxFQUFFLEVBQUUsU0FBUyxDQUFDLE1BQU0sQ0FBQyxDQUFDO1lBQy9ELEVBQUUsQ0FBQyxhQUFhLENBQUMsYUFBYSxFQUFFLG1CQUFtQixDQUFDLENBQUM7WUFFckQsb0NBQW9DO1lBQ3BDLE1BQU0sU0FBUyxHQUFHLEVBQUUsQ0FBQyxnQkFBZ0IsQ0FBQyxhQUFhLENBQUMsQ0FBQztZQUVyRCxNQUFNLGFBQWEsR0FBRyxNQUFNLE1BQU0sQ0FBQyxLQUFLLENBQUMsY0FBYyxDQUFDLE1BQU0sQ0FBQztnQkFDN0QsSUFBSSxFQUFFLFNBQVM7Z0JBQ2YsS0FBSyxFQUFFLFdBQVc7Z0JBQ2xCLGVBQWUsRUFBRSxjQUFjO2dCQUMvQix1QkFBdUIsRUFBRSxDQUFDLE1BQU0sQ0FBQztnQkFDakMsUUFBUSxFQUFFLElBQUk7YUFDZixDQUFDLENBQUM7WUFFSCwwQkFBMEI7WUFDMUIsRUFBRSxDQUFDLFVBQVUsQ0FBQyxhQUFhLENBQUMsQ0FBQztZQUU3QixNQUFNLFlBQVksR0FBaUI7Z0JBQ2pDLFVBQVUsRUFBRSxDQUFDO2dCQUNiLEtBQUssRUFBRSxFQUFFO2dCQUNULFFBQVEsRUFBRSxLQUFLLENBQUMsU0FBUyxFQUFFLDBEQUEwRDthQUN0RixDQUFDO1lBRUYsZ0VBQWdFO1lBQ2hFLElBQUksYUFBYSxDQUFDLEtBQUssSUFBSSxLQUFLLENBQUMsT0FBTyxDQUFDLGFBQWEsQ0FBQyxLQUFLLENBQUMsRUFBRSxDQUFDO2dCQUM5RCxZQUFZLENBQUMsS0FBSyxHQUFHLGFBQWEsQ0FBQyxLQUFLLENBQUMsR0FBRyxDQUFDLENBQUMsSUFBUyxFQUFFLEVBQUUsQ0FBQyxDQUFDO29CQUMzRCxJQUFJLEVBQUUsSUFBSSxDQUFDLElBQUk7b0JBQ2YsS0FBSyxFQUFFLElBQUksQ0FBQyxLQUFLO29CQUNqQixHQUFHLEVBQUUsSUFBSSxDQUFDLEdBQUc7aUJBQ2QsQ0FBQyxDQUFDLENBQUM7Z0JBQ0oseUNBQXlDO1lBQzNDLENBQUM7aUJBQU0sQ0FBQztnQkFDTixpQ0FBaUM7Z0JBQ2pDLDRFQUE0RTtnQkFDNUUsTUFBTSxLQUFLLEdBQUcsS0FBSyxDQUFDLFNBQVM7cUJBQzFCLEtBQUssQ0FBQyxHQUFHLENBQUM7cUJBQ1YsTUFBTSxDQUFDLENBQUMsSUFBSSxFQUFFLEVBQUUsQ0FBQyxJQUFJLENBQUMsTUFBTSxHQUFHLENBQUMsQ0FBQyxDQUFDO2dCQUNyQyxNQUFNLGlCQUFpQixHQUFHLEtBQUssQ0FBQyxRQUFRLENBQUM7Z0JBQ3pDLE1BQU0sV0FBVyxHQUFHLGlCQUFpQixHQUFHLEtBQUssQ0FBQyxNQUFNLENBQUM7Z0JBRXJELFlBQVksQ0FBQyxLQUFLLEdBQUcsS0FBSyxDQUFDLEdBQUcsQ0FBQyxDQUFDLElBQUksRUFBRSxLQUFLLEVBQUUsRUFBRSxDQUFDLENBQUM7b0JBQy9DLElBQUk7b0JBQ0osS0FBSyxFQUFFLEtBQUssR0FBRyxXQUFXO29CQUMxQixHQUFHLEVBQUUsQ0FBQyxLQUFLLEdBQUcsQ0FBQyxDQUFDLEdBQUcsV0FBVztpQkFDL0IsQ0FBQyxDQUFDLENBQUM7WUFDTixDQUFDO1lBRUQsU0FBUyxDQUFDLElBQUksQ0FBQyxZQUFZLENBQUMsQ0FBQztRQUMvQixDQUFDO1FBRUQsT0FBTyxFQUFFLFNBQVMsRUFBRSxTQUFTLEVBQUUsQ0FBQztJQUNsQyxDQUFDO0lBQUMsT0FBTyxLQUFLLEVBQUUsQ0FBQztRQUNmLE9BQU8sQ0FBQyxLQUFLLENBQUMsK0JBQStCLEVBQUUsS0FBSyxDQUFDLENBQUM7UUFDdEQsTUFBTSxLQUFLLENBQUM7SUFDZCxDQUFDO0FBQ0gsQ0FBQyIsInNvdXJjZXNDb250ZW50IjpbImltcG9ydCB7IFMzQ2xpZW50LCBQdXRPYmplY3RDb21tYW5kIH0gZnJvbSAnQGF3cy1zZGsvY2xpZW50LXMzJztcbmltcG9ydCBPcGVuQUkgZnJvbSAnb3BlbmFpJztcbmltcG9ydCB7IGFkanVzdEF1ZGlvRHVyYXRpb24gfSBmcm9tICcuL3V0aWwvbmFycmF0aW9uSGVscGVyJztcbmltcG9ydCB7IFNjZW5lIH0gZnJvbSAnLi9zY3JpcHQnO1xuXG5jb25zdCBzMyA9IG5ldyBTM0NsaWVudCh7IHJlZ2lvbjogcHJvY2Vzcy5lbnYuQVdTX1JFR0lPTiB9KTtcbmNvbnN0IG9wZW5haSA9IG5ldyBPcGVuQUkoeyBhcGlLZXk6IHByb2Nlc3MuZW52Lk9QRU5BSV9BUElfS0VZIH0pO1xuXG5leHBvcnQgaW50ZXJmYWNlIFN1YnRpdGxlV29yZCB7XG4gIHdvcmQ6IHN0cmluZztcbiAgc3RhcnQ6IG51bWJlcjtcbiAgZW5kOiBudW1iZXI7XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgU3VidGl0bGVEYXRhIHtcbiAgc2NlbmVJbmRleDogbnVtYmVyO1xuICB3b3JkczogU3VidGl0bGVXb3JkW107XG4gIGZ1bGxUZXh0OiBzdHJpbmc7XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgTmFycmF0aW9uUmVzdWx0IHtcbiAgYXVkaW9LZXlzOiBzdHJpbmdbXTtcbiAgc3VidGl0bGVzOiBTdWJ0aXRsZURhdGFbXTtcbn1cblxuLyoqXG4gKiBBZGp1c3RzIGF1ZGlvIGR1cmF0aW9uIHRvIG1hdGNoIHRhcmdldCBkdXJhdGlvbiB1c2luZyBGRm1wZWdcbiAqIEBwYXJhbSBhdWRpb0J1ZmZlciAtIFRoZSBvcmlnaW5hbCBhdWRpbyBidWZmZXJcbiAqIEBwYXJhbSB0YXJnZXREdXJhdGlvbiAtIFRoZSB0YXJnZXQgZHVyYXRpb24gaW4gc2Vjb25kc1xuICogQHJldHVybnMgUHJvbWlzZTxCdWZmZXI+IC0gVGhlIGFkanVzdGVkIGF1ZGlvIGJ1ZmZlclxuICovXG5cbmV4cG9ydCBhc3luYyBmdW5jdGlvbiBnZW5lcmF0ZU5hcnJhdGlvbihcbiAgc2NlbmVzOiBTY2VuZVtdLFxuICB1c2VySWQ6IHN0cmluZyxcbiAgdGltZXN0YW1wOiBzdHJpbmcsXG4gIGluc3RydWN0aW9uczogc3RyaW5nID0gJ1NwZWFrIGluIGEgY2hlZXJmdWwgYW5kIHBvc2l0aXZlIHRvbmUnLFxuKTogUHJvbWlzZTxOYXJyYXRpb25SZXN1bHQ+IHtcbiAgY29uc29sZS5sb2coXG4gICAgJ/CfjqQgR2VuZXJhdGluZyBuYXJyYXRpb24gZnJvbSBzY2VuZXMgd2l0aCB3b3JkLWxldmVsIHRpbWVzdGFtcHMuLi4nLFxuICApO1xuICB0cnkge1xuICAgIGNvbnN0IGF1ZGlvS2V5czogc3RyaW5nW10gPSBbXTtcbiAgICBjb25zdCBzdWJ0aXRsZXM6IFN1YnRpdGxlRGF0YVtdID0gW107XG5cbiAgICBmb3IgKGxldCBpID0gMDsgaSA8IHNjZW5lcy5sZW5ndGg7IGkrKykge1xuICAgICAgY29uc3Qgc2NlbmUgPSBzY2VuZXNbaV07XG4gICAgICBjb25zb2xlLmxvZyhg8J+OpCBHZW5lcmF0aW5nIG5hcnJhdGlvbiBmb3Igc2NlbmUgJHtpfTpgLCBzY2VuZS5uYXJyYXRpb24pO1xuXG4gICAgICAvLyBHZW5lcmF0ZSBzcGVlY2ggd2l0aCBzdGFuZGFyZCBmb3JtYXRcbiAgICAgIGNvbnN0IHJlc3BvbnNlID0gYXdhaXQgb3BlbmFpLmF1ZGlvLnNwZWVjaC5jcmVhdGUoe1xuICAgICAgICBtb2RlbDogJ2dwdC00by1taW5pLXR0cycsXG4gICAgICAgIHZvaWNlOiAnc2FnZScsXG4gICAgICAgIGluc3RydWN0aW9uczogaW5zdHJ1Y3Rpb25zLFxuICAgICAgICBpbnB1dDogc2NlbmUubmFycmF0aW9uLFxuICAgICAgfSk7XG5cbiAgICAgIGNvbnN0IG9yaWdpbmFsQXVkaW9CdWZmZXIgPSBCdWZmZXIuZnJvbShhd2FpdCByZXNwb25zZS5hcnJheUJ1ZmZlcigpKTtcblxuICAgICAgLy8gQWRqdXN0IGF1ZGlvIGR1cmF0aW9uIHRvIG1hdGNoIHRhcmdldCBkdXJhdGlvblxuICAgICAgY29uc3QgYWRqdXN0ZWRBdWRpb0J1ZmZlciA9IGF3YWl0IGFkanVzdEF1ZGlvRHVyYXRpb24oXG4gICAgICAgIG9yaWdpbmFsQXVkaW9CdWZmZXIsXG4gICAgICAgIHNjZW5lLmR1cmF0aW9uLFxuICAgICAgKTtcblxuICAgICAgLy8gU2F2ZSB0byBTMyB3aXRoIHRpbWVzdGFtcCBwcmVmaXggdXNpbmcgc2NlbmUuaWRcbiAgICAgIGNvbnN0IGF1ZGlvS2V5ID0gYCR7dXNlcklkfS8ke3RpbWVzdGFtcH0uc2NlbmUtJHtzY2VuZS5pZH0ubXAzYDtcblxuICAgICAgYXdhaXQgczMuc2VuZChcbiAgICAgICAgbmV3IFB1dE9iamVjdENvbW1hbmQoe1xuICAgICAgICAgIEJ1Y2tldDogcHJvY2Vzcy5lbnYuVklERU9fUEFSVFNfQlVDS0VUX05BTUUsXG4gICAgICAgICAgS2V5OiBhdWRpb0tleSxcbiAgICAgICAgICBCb2R5OiBhZGp1c3RlZEF1ZGlvQnVmZmVyLFxuICAgICAgICAgIENvbnRlbnRUeXBlOiAnYXVkaW8vbXBlZycsXG4gICAgICAgIH0pLFxuICAgICAgKTtcblxuICAgICAgYXVkaW9LZXlzLnB1c2goYXVkaW9LZXkpO1xuXG4gICAgICAvLyBHZXQgd29yZC1sZXZlbCB0aW1lc3RhbXBzIHVzaW5nIHRyYW5zY3JpcHRpb25cblxuICAgICAgLy8gV3JpdGUgYWRqdXN0ZWQgYXVkaW8gYnVmZmVyIHRvIHRlbXBvcmFyeSBmaWxlIGZvciB0cmFuc2NyaXB0aW9uXG4gICAgICBjb25zdCBmcyA9IHJlcXVpcmUoJ2ZzJyk7XG4gICAgICBjb25zdCBvcyA9IHJlcXVpcmUoJ29zJyk7XG4gICAgICBjb25zdCBwYXRoID0gcmVxdWlyZSgncGF0aCcpO1xuXG4gICAgICBjb25zdCB0ZW1wQXVkaW9QYXRoID0gcGF0aC5qb2luKG9zLnRtcGRpcigpLCBgc2NlbmUtJHtpfS5tcDNgKTtcbiAgICAgIGZzLndyaXRlRmlsZVN5bmModGVtcEF1ZGlvUGF0aCwgYWRqdXN0ZWRBdWRpb0J1ZmZlcik7XG5cbiAgICAgIC8vIENyZWF0ZSBmaWxlIG9iamVjdCBmb3IgT3BlbkFJIEFQSVxuICAgICAgY29uc3QgYXVkaW9GaWxlID0gZnMuY3JlYXRlUmVhZFN0cmVhbSh0ZW1wQXVkaW9QYXRoKTtcblxuICAgICAgY29uc3QgdHJhbnNjcmlwdGlvbiA9IGF3YWl0IG9wZW5haS5hdWRpby50cmFuc2NyaXB0aW9ucy5jcmVhdGUoe1xuICAgICAgICBmaWxlOiBhdWRpb0ZpbGUsXG4gICAgICAgIG1vZGVsOiAnd2hpc3Blci0xJyxcbiAgICAgICAgcmVzcG9uc2VfZm9ybWF0OiAndmVyYm9zZV9qc29uJyxcbiAgICAgICAgdGltZXN0YW1wX2dyYW51bGFyaXRpZXM6IFsnd29yZCddLFxuICAgICAgICBsYW5ndWFnZTogJ2VuJyxcbiAgICAgIH0pO1xuXG4gICAgICAvLyBDbGVhbiB1cCB0ZW1wb3JhcnkgZmlsZVxuICAgICAgZnMudW5saW5rU3luYyh0ZW1wQXVkaW9QYXRoKTtcblxuICAgICAgY29uc3Qgc3VidGl0bGVEYXRhOiBTdWJ0aXRsZURhdGEgPSB7XG4gICAgICAgIHNjZW5lSW5kZXg6IGksXG4gICAgICAgIHdvcmRzOiBbXSxcbiAgICAgICAgZnVsbFRleHQ6IHNjZW5lLm5hcnJhdGlvbiwgLy8gVXNlIG9yaWdpbmFsIG5hcnJhdGlvbiB0ZXh0IGluc3RlYWQgb2YgdHJhbnNjcmliZWQgdGV4dFxuICAgICAgfTtcblxuICAgICAgLy8gRXh0cmFjdCB3b3JkLWxldmVsIHRpbWVzdGFtcHMgZnJvbSB0aGUgdHJhbnNjcmlwdGlvbiByZXNwb25zZVxuICAgICAgaWYgKHRyYW5zY3JpcHRpb24ud29yZHMgJiYgQXJyYXkuaXNBcnJheSh0cmFuc2NyaXB0aW9uLndvcmRzKSkge1xuICAgICAgICBzdWJ0aXRsZURhdGEud29yZHMgPSB0cmFuc2NyaXB0aW9uLndvcmRzLm1hcCgod29yZDogYW55KSA9PiAoe1xuICAgICAgICAgIHdvcmQ6IHdvcmQud29yZCxcbiAgICAgICAgICBzdGFydDogd29yZC5zdGFydCxcbiAgICAgICAgICBlbmQ6IHdvcmQuZW5kLFxuICAgICAgICB9KSk7XG4gICAgICAgIC8vIFdvcmQgdGltZXN0YW1wcyBleHRyYWN0ZWQgc3VjY2Vzc2Z1bGx5XG4gICAgICB9IGVsc2Uge1xuICAgICAgICAvLyBVc2luZyBmYWxsYmFjayB3b3JkIHRpbWVzdGFtcHNcbiAgICAgICAgLy8gRmFsbGJhY2s6IGNyZWF0ZSBhIHNpbXBsZSB3b3JkLWxldmVsIGJyZWFrZG93biB3aXRob3V0IHByZWNpc2UgdGltZXN0YW1wc1xuICAgICAgICBjb25zdCB3b3JkcyA9IHNjZW5lLm5hcnJhdGlvblxuICAgICAgICAgIC5zcGxpdCgnICcpXG4gICAgICAgICAgLmZpbHRlcigod29yZCkgPT4gd29yZC5sZW5ndGggPiAwKTtcbiAgICAgICAgY29uc3QgZXN0aW1hdGVkRHVyYXRpb24gPSBzY2VuZS5kdXJhdGlvbjtcbiAgICAgICAgY29uc3QgdGltZVBlcldvcmQgPSBlc3RpbWF0ZWREdXJhdGlvbiAvIHdvcmRzLmxlbmd0aDtcblxuICAgICAgICBzdWJ0aXRsZURhdGEud29yZHMgPSB3b3Jkcy5tYXAoKHdvcmQsIGluZGV4KSA9PiAoe1xuICAgICAgICAgIHdvcmQsXG4gICAgICAgICAgc3RhcnQ6IGluZGV4ICogdGltZVBlcldvcmQsXG4gICAgICAgICAgZW5kOiAoaW5kZXggKyAxKSAqIHRpbWVQZXJXb3JkLFxuICAgICAgICB9KSk7XG4gICAgICB9XG5cbiAgICAgIHN1YnRpdGxlcy5wdXNoKHN1YnRpdGxlRGF0YSk7XG4gICAgfVxuXG4gICAgcmV0dXJuIHsgYXVkaW9LZXlzLCBzdWJ0aXRsZXMgfTtcbiAgfSBjYXRjaCAoZXJyb3IpIHtcbiAgICBjb25zb2xlLmVycm9yKCfinYwgRXJyb3IgaW4gZ2VuZXJhdGVOYXJyYXRpb246JywgZXJyb3IpO1xuICAgIHRocm93IGVycm9yO1xuICB9XG59XG4iXX0=