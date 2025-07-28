"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.generateNarration = generateNarration;
exports.generateStoryBreakdown = generateStoryBreakdown;
const client_s3_1 = require("@aws-sdk/client-s3");
const openai_1 = require("openai");
const s3 = new client_s3_1.S3Client({ region: process.env.AWS_REGION });
const openai = new openai_1.default({ apiKey: process.env.OPENAI_API_KEY });
async function generateNarration(scenes, userId) {
    console.log('🎤 Generating narration from scenes...');
    try {
        const audioKeys = [];
        for (let i = 0; i < scenes.length; i++) {
            const scene = scenes[i];
            console.log(`🎤 Generating narration for scene ${i}:`, scene.narration);
            const response = await openai.audio.speech.create({
                model: 'tts-1',
                voice: 'alloy',
                input: scene.narration,
            });
            const audioBuffer = Buffer.from(await response.arrayBuffer());
            console.log(`✅ Generated audio for scene ${i}, size: ${audioBuffer.length} bytes`);
            // Save to S3 with consistent naming
            const audioKey = `${userId}/scene-${i}.mp3`;
            console.log(`☁️ Uploading audio to S3: ${process.env.VIDEO_PARTS_BUCKET_NAME}/${audioKey}`);
            await s3.send(new client_s3_1.PutObjectCommand({
                Bucket: process.env.VIDEO_PARTS_BUCKET_NAME,
                Key: audioKey,
                Body: audioBuffer,
                ContentType: 'audio/mpeg',
            }));
            console.log(`✅ Uploaded audio to S3: ${audioKey}`);
            audioKeys.push(audioKey);
        }
        return audioKeys;
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoibmFycmF0aW9uLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsibmFycmF0aW9uLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiI7O0FBWUEsOENBK0NDO0FBRUQsd0RBa0RDO0FBL0dELGtEQUFnRTtBQUNoRSxtQ0FBNEI7QUFFNUIsTUFBTSxFQUFFLEdBQUcsSUFBSSxvQkFBUSxDQUFDLEVBQUUsTUFBTSxFQUFFLE9BQU8sQ0FBQyxHQUFHLENBQUMsVUFBVSxFQUFFLENBQUMsQ0FBQztBQUM1RCxNQUFNLE1BQU0sR0FBRyxJQUFJLGdCQUFNLENBQUMsRUFBRSxNQUFNLEVBQUUsT0FBTyxDQUFDLEdBQUcsQ0FBQyxjQUFjLEVBQUUsQ0FBQyxDQUFDO0FBUTNELEtBQUssVUFBVSxpQkFBaUIsQ0FDckMsTUFBZSxFQUNmLE1BQWM7SUFFZCxPQUFPLENBQUMsR0FBRyxDQUFDLHdDQUF3QyxDQUFDLENBQUM7SUFDdEQsSUFBSSxDQUFDO1FBQ0gsTUFBTSxTQUFTLEdBQWEsRUFBRSxDQUFDO1FBRS9CLEtBQUssSUFBSSxDQUFDLEdBQUcsQ0FBQyxFQUFFLENBQUMsR0FBRyxNQUFNLENBQUMsTUFBTSxFQUFFLENBQUMsRUFBRSxFQUFFLENBQUM7WUFDdkMsTUFBTSxLQUFLLEdBQUcsTUFBTSxDQUFDLENBQUMsQ0FBQyxDQUFDO1lBQ3hCLE9BQU8sQ0FBQyxHQUFHLENBQUMscUNBQXFDLENBQUMsR0FBRyxFQUFFLEtBQUssQ0FBQyxTQUFTLENBQUMsQ0FBQztZQUV4RSxNQUFNLFFBQVEsR0FBRyxNQUFNLE1BQU0sQ0FBQyxLQUFLLENBQUMsTUFBTSxDQUFDLE1BQU0sQ0FBQztnQkFDaEQsS0FBSyxFQUFFLE9BQU87Z0JBQ2QsS0FBSyxFQUFFLE9BQU87Z0JBQ2QsS0FBSyxFQUFFLEtBQUssQ0FBQyxTQUFTO2FBQ3ZCLENBQUMsQ0FBQztZQUVILE1BQU0sV0FBVyxHQUFHLE1BQU0sQ0FBQyxJQUFJLENBQUMsTUFBTSxRQUFRLENBQUMsV0FBVyxFQUFFLENBQUMsQ0FBQztZQUM5RCxPQUFPLENBQUMsR0FBRyxDQUNULCtCQUErQixDQUFDLFdBQVcsV0FBVyxDQUFDLE1BQU0sUUFBUSxDQUN0RSxDQUFDO1lBRUYsb0NBQW9DO1lBQ3BDLE1BQU0sUUFBUSxHQUFHLEdBQUcsTUFBTSxVQUFVLENBQUMsTUFBTSxDQUFDO1lBQzVDLE9BQU8sQ0FBQyxHQUFHLENBQ1QsNkJBQTZCLE9BQU8sQ0FBQyxHQUFHLENBQUMsdUJBQXVCLElBQUksUUFBUSxFQUFFLENBQy9FLENBQUM7WUFFRixNQUFNLEVBQUUsQ0FBQyxJQUFJLENBQ1gsSUFBSSw0QkFBZ0IsQ0FBQztnQkFDbkIsTUFBTSxFQUFFLE9BQU8sQ0FBQyxHQUFHLENBQUMsdUJBQXVCO2dCQUMzQyxHQUFHLEVBQUUsUUFBUTtnQkFDYixJQUFJLEVBQUUsV0FBVztnQkFDakIsV0FBVyxFQUFFLFlBQVk7YUFDMUIsQ0FBQyxDQUNILENBQUM7WUFDRixPQUFPLENBQUMsR0FBRyxDQUFDLDJCQUEyQixRQUFRLEVBQUUsQ0FBQyxDQUFDO1lBRW5ELFNBQVMsQ0FBQyxJQUFJLENBQUMsUUFBUSxDQUFDLENBQUM7UUFDM0IsQ0FBQztRQUVELE9BQU8sU0FBUyxDQUFDO0lBQ25CLENBQUM7SUFBQyxPQUFPLEtBQUssRUFBRSxDQUFDO1FBQ2YsT0FBTyxDQUFDLEtBQUssQ0FBQywrQkFBK0IsRUFBRSxLQUFLLENBQUMsQ0FBQztRQUN0RCxNQUFNLEtBQUssQ0FBQztJQUNkLENBQUM7QUFDSCxDQUFDO0FBRU0sS0FBSyxVQUFVLHNCQUFzQixDQUMxQyxNQUFjLEVBQ2QsVUFBa0IsRUFDbEIsYUFBcUI7SUFFckIsT0FBTyxDQUFDLEdBQUcsQ0FBQywwQ0FBMEMsQ0FBQyxDQUFDO0lBQ3hELE9BQU8sQ0FBQyxHQUFHLENBQ1Qsa0JBQWtCLFVBQVUsWUFBWSxhQUFhLGdCQUFnQixDQUN0RSxDQUFDO0lBRUYsTUFBTSxhQUFhLEdBQUcsSUFBSSxDQUFDLEtBQUssQ0FBQyxhQUFhLEdBQUcsVUFBVSxDQUFDLENBQUM7SUFDN0QsT0FBTyxDQUFDLEdBQUcsQ0FBQywwQkFBMEIsYUFBYSxlQUFlLENBQUMsQ0FBQztJQUVwRSxJQUFJLENBQUM7UUFDSCxNQUFNLFFBQVEsR0FBRyxNQUFNLE1BQU0sQ0FBQyxJQUFJLENBQUMsV0FBVyxDQUFDLE1BQU0sQ0FBQztZQUNwRCxLQUFLLEVBQUUsT0FBTztZQUNkLFFBQVEsRUFBRTtnQkFDUjtvQkFDRSxJQUFJLEVBQUUsUUFBUTtvQkFDZCxPQUFPLEVBQUUsbUVBQW1FLFVBQVUsaUJBQWlCLGFBQWEsd0JBQXdCLGFBQWE7Ozt3QkFHM0ksYUFBYTs7OzZHQUd3RTtpQkFDcEc7Z0JBQ0Q7b0JBQ0UsSUFBSSxFQUFFLE1BQU07b0JBQ1osT0FBTyxFQUFFLE1BQU07aUJBQ2hCO2FBQ0Y7WUFDRCxXQUFXLEVBQUUsR0FBRztTQUNqQixDQUFDLENBQUM7UUFFSCxNQUFNLE9BQU8sR0FBRyxRQUFRLENBQUMsT0FBTyxDQUFDLENBQUMsQ0FBQyxFQUFFLE9BQU8sRUFBRSxPQUFPLENBQUM7UUFDdEQsT0FBTyxDQUFDLEdBQUcsQ0FBQyw2QkFBNkIsRUFBRSxPQUFPLENBQUMsQ0FBQztRQUVwRCxJQUFJLENBQUMsT0FBTyxFQUFFLENBQUM7WUFDYixPQUFPLENBQUMsR0FBRyxDQUFDLHdDQUF3QyxDQUFDLENBQUM7WUFDdEQsTUFBTSxJQUFJLEtBQUssQ0FBQyxvQ0FBb0MsQ0FBQyxDQUFDO1FBQ3hELENBQUM7UUFFRCxNQUFNLE1BQU0sR0FBRyxJQUFJLENBQUMsS0FBSyxDQUFDLE9BQU8sQ0FBQyxDQUFDO1FBQ25DLE9BQU8sQ0FBQyxHQUFHLENBQUMsdUNBQXVDLENBQUMsQ0FBQztRQUNyRCxPQUFPLE1BQU0sQ0FBQztJQUNoQixDQUFDO0lBQUMsT0FBTyxLQUFLLEVBQUUsQ0FBQztRQUNmLE9BQU8sQ0FBQyxLQUFLLENBQUMsb0NBQW9DLEVBQUUsS0FBSyxDQUFDLENBQUM7UUFDM0QsTUFBTSxLQUFLLENBQUM7SUFDZCxDQUFDO0FBQ0gsQ0FBQyIsInNvdXJjZXNDb250ZW50IjpbImltcG9ydCB7IFMzQ2xpZW50LCBQdXRPYmplY3RDb21tYW5kIH0gZnJvbSAnQGF3cy1zZGsvY2xpZW50LXMzJztcbmltcG9ydCBPcGVuQUkgZnJvbSAnb3BlbmFpJztcblxuY29uc3QgczMgPSBuZXcgUzNDbGllbnQoeyByZWdpb246IHByb2Nlc3MuZW52LkFXU19SRUdJT04gfSk7XG5jb25zdCBvcGVuYWkgPSBuZXcgT3BlbkFJKHsgYXBpS2V5OiBwcm9jZXNzLmVudi5PUEVOQUlfQVBJX0tFWSB9KTtcblxuZXhwb3J0IGludGVyZmFjZSBTY2VuZSB7XG4gIGRlc2NyaXB0aW9uOiBzdHJpbmc7XG4gIGR1cmF0aW9uOiBudW1iZXI7XG4gIG5hcnJhdGlvbjogc3RyaW5nO1xufVxuXG5leHBvcnQgYXN5bmMgZnVuY3Rpb24gZ2VuZXJhdGVOYXJyYXRpb24oXG4gIHNjZW5lczogU2NlbmVbXSxcbiAgdXNlcklkOiBzdHJpbmcsXG4pOiBQcm9taXNlPHN0cmluZ1tdPiB7XG4gIGNvbnNvbGUubG9nKCfwn46kIEdlbmVyYXRpbmcgbmFycmF0aW9uIGZyb20gc2NlbmVzLi4uJyk7XG4gIHRyeSB7XG4gICAgY29uc3QgYXVkaW9LZXlzOiBzdHJpbmdbXSA9IFtdO1xuXG4gICAgZm9yIChsZXQgaSA9IDA7IGkgPCBzY2VuZXMubGVuZ3RoOyBpKyspIHtcbiAgICAgIGNvbnN0IHNjZW5lID0gc2NlbmVzW2ldO1xuICAgICAgY29uc29sZS5sb2coYPCfjqQgR2VuZXJhdGluZyBuYXJyYXRpb24gZm9yIHNjZW5lICR7aX06YCwgc2NlbmUubmFycmF0aW9uKTtcblxuICAgICAgY29uc3QgcmVzcG9uc2UgPSBhd2FpdCBvcGVuYWkuYXVkaW8uc3BlZWNoLmNyZWF0ZSh7XG4gICAgICAgIG1vZGVsOiAndHRzLTEnLFxuICAgICAgICB2b2ljZTogJ2FsbG95JyxcbiAgICAgICAgaW5wdXQ6IHNjZW5lLm5hcnJhdGlvbixcbiAgICAgIH0pO1xuXG4gICAgICBjb25zdCBhdWRpb0J1ZmZlciA9IEJ1ZmZlci5mcm9tKGF3YWl0IHJlc3BvbnNlLmFycmF5QnVmZmVyKCkpO1xuICAgICAgY29uc29sZS5sb2coXG4gICAgICAgIGDinIUgR2VuZXJhdGVkIGF1ZGlvIGZvciBzY2VuZSAke2l9LCBzaXplOiAke2F1ZGlvQnVmZmVyLmxlbmd0aH0gYnl0ZXNgLFxuICAgICAgKTtcblxuICAgICAgLy8gU2F2ZSB0byBTMyB3aXRoIGNvbnNpc3RlbnQgbmFtaW5nXG4gICAgICBjb25zdCBhdWRpb0tleSA9IGAke3VzZXJJZH0vc2NlbmUtJHtpfS5tcDNgO1xuICAgICAgY29uc29sZS5sb2coXG4gICAgICAgIGDimIHvuI8gVXBsb2FkaW5nIGF1ZGlvIHRvIFMzOiAke3Byb2Nlc3MuZW52LlZJREVPX1BBUlRTX0JVQ0tFVF9OQU1FfS8ke2F1ZGlvS2V5fWAsXG4gICAgICApO1xuXG4gICAgICBhd2FpdCBzMy5zZW5kKFxuICAgICAgICBuZXcgUHV0T2JqZWN0Q29tbWFuZCh7XG4gICAgICAgICAgQnVja2V0OiBwcm9jZXNzLmVudi5WSURFT19QQVJUU19CVUNLRVRfTkFNRSxcbiAgICAgICAgICBLZXk6IGF1ZGlvS2V5LFxuICAgICAgICAgIEJvZHk6IGF1ZGlvQnVmZmVyLFxuICAgICAgICAgIENvbnRlbnRUeXBlOiAnYXVkaW8vbXBlZycsXG4gICAgICAgIH0pLFxuICAgICAgKTtcbiAgICAgIGNvbnNvbGUubG9nKGDinIUgVXBsb2FkZWQgYXVkaW8gdG8gUzM6ICR7YXVkaW9LZXl9YCk7XG5cbiAgICAgIGF1ZGlvS2V5cy5wdXNoKGF1ZGlvS2V5KTtcbiAgICB9XG5cbiAgICByZXR1cm4gYXVkaW9LZXlzO1xuICB9IGNhdGNoIChlcnJvcikge1xuICAgIGNvbnNvbGUuZXJyb3IoJ+KdjCBFcnJvciBpbiBnZW5lcmF0ZU5hcnJhdGlvbjonLCBlcnJvcik7XG4gICAgdGhyb3cgZXJyb3I7XG4gIH1cbn1cblxuZXhwb3J0IGFzeW5jIGZ1bmN0aW9uIGdlbmVyYXRlU3RvcnlCcmVha2Rvd24oXG4gIHByb21wdDogc3RyaW5nLFxuICBzY2VuZUNvdW50OiBudW1iZXIsXG4gIHRvdGFsRHVyYXRpb246IG51bWJlcixcbik6IFByb21pc2U8U2NlbmVbXT4ge1xuICBjb25zb2xlLmxvZygn8J+kliBDYWxsaW5nIE9wZW5BSSBmb3Igc3RvcnkgYnJlYWtkb3duLi4uJyk7XG4gIGNvbnNvbGUubG9nKFxuICAgIGDwn5OKIFBhcmFtZXRlcnM6ICR7c2NlbmVDb3VudH0gc2NlbmVzLCAke3RvdGFsRHVyYXRpb259IHNlY29uZHMgdG90YWxgLFxuICApO1xuXG4gIGNvbnN0IHNjZW5lRHVyYXRpb24gPSBNYXRoLmZsb29yKHRvdGFsRHVyYXRpb24gLyBzY2VuZUNvdW50KTtcbiAgY29uc29sZS5sb2coYOKPse+4jyAgRWFjaCBzY2VuZSB3aWxsIGJlICR7c2NlbmVEdXJhdGlvbn0gc2Vjb25kcyBsb25nYCk7XG5cbiAgdHJ5IHtcbiAgICBjb25zdCByZXNwb25zZSA9IGF3YWl0IG9wZW5haS5jaGF0LmNvbXBsZXRpb25zLmNyZWF0ZSh7XG4gICAgICBtb2RlbDogJ2dwdC00JyxcbiAgICAgIG1lc3NhZ2VzOiBbXG4gICAgICAgIHtcbiAgICAgICAgICByb2xlOiAnc3lzdGVtJyxcbiAgICAgICAgICBjb250ZW50OiBgWW91IGFyZSBhIHZpZGVvIHNjcmlwdCB3cml0ZXIuIEJyZWFrIGRvd24gdGhlIGdpdmVuIHByb21wdCBpbnRvICR7c2NlbmVDb3VudH0gc2NlbmVzLCBlYWNoICR7c2NlbmVEdXJhdGlvbn0gc2Vjb25kcyBsb25nLCBmb3IgYSAke3RvdGFsRHVyYXRpb259LXNlY29uZCB2ZXJ0aWNhbCB2aWRlby4gXG4gICAgICAgICAgRWFjaCBzY2VuZSBzaG91bGQgaGF2ZSBhIGNsZWFyIHZpc3VhbCBkZXNjcmlwdGlvbiBhbmQgbmFycmF0aW9uIHRleHQuIFJldHVybiBhcyBKU09OIGFycmF5IHdpdGggb2JqZWN0cyBjb250YWluaW5nOlxuICAgICAgICAgIC0gZGVzY3JpcHRpb246IHZpc3VhbCBzY2VuZSBkZXNjcmlwdGlvbiBmb3IgdmlkZW8gZ2VuZXJhdGlvblxuICAgICAgICAgIC0gZHVyYXRpb246ICR7c2NlbmVEdXJhdGlvbn0gKHNlY29uZHMpXG4gICAgICAgICAgLSBuYXJyYXRpb246IHRleHQgdG8gYmUgc3Bva2VuIGluIHRoaXMgc2NlbmVcbiAgICAgICAgICBcbiAgICAgICAgICBJZiBvbmx5IDEgc2NlbmUgaXMgcmVxdWVzdGVkLCBjcmVhdGUgYSBzaW5nbGUgY29tcHJlaGVuc2l2ZSBzY2VuZSB0aGF0IGNvdmVycyB0aGUgZW50aXJlIGR1cmF0aW9uLmAsXG4gICAgICAgIH0sXG4gICAgICAgIHtcbiAgICAgICAgICByb2xlOiAndXNlcicsXG4gICAgICAgICAgY29udGVudDogcHJvbXB0LFxuICAgICAgICB9LFxuICAgICAgXSxcbiAgICAgIHRlbXBlcmF0dXJlOiAwLjcsXG4gICAgfSk7XG5cbiAgICBjb25zdCBjb250ZW50ID0gcmVzcG9uc2UuY2hvaWNlc1swXT8ubWVzc2FnZT8uY29udGVudDtcbiAgICBjb25zb2xlLmxvZygn8J+ThCBPcGVuQUkgcmVzcG9uc2UgY29udGVudDonLCBjb250ZW50KTtcblxuICAgIGlmICghY29udGVudCkge1xuICAgICAgY29uc29sZS5sb2coJ+KdjCBFcnJvcjogT3BlbkFJIGRpZCBub3QgcmV0dXJuIGNvbnRlbnQnKTtcbiAgICAgIHRocm93IG5ldyBFcnJvcignRmFpbGVkIHRvIGdlbmVyYXRlIHN0b3J5IGJyZWFrZG93bicpO1xuICAgIH1cblxuICAgIGNvbnN0IHNjZW5lcyA9IEpTT04ucGFyc2UoY29udGVudCk7XG4gICAgY29uc29sZS5sb2coJ+KchSBTdG9yeSBicmVha2Rvd24gcGFyc2VkIHN1Y2Nlc3NmdWxseScpO1xuICAgIHJldHVybiBzY2VuZXM7XG4gIH0gY2F0Y2ggKGVycm9yKSB7XG4gICAgY29uc29sZS5lcnJvcign4p2MIEVycm9yIGluIGdlbmVyYXRlU3RvcnlCcmVha2Rvd246JywgZXJyb3IpO1xuICAgIHRocm93IGVycm9yO1xuICB9XG59XG4iXX0=