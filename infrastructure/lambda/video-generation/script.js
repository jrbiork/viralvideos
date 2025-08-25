"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.addSceneIds = addSceneIds;
exports.generateStoryBreakdown = generateStoryBreakdown;
const openai_1 = require("openai");
const client_s3_1 = require("@aws-sdk/client-s3");
const s3 = new client_s3_1.S3Client({ region: process.env.AWS_REGION });
const openai = new openai_1.default({ apiKey: process.env.OPENAI_API_KEY });
// Utility function to add IDs to scenes
function addSceneIds(scenes) {
    return scenes.map((scene, idx) => ({
        ...scene,
        id: idx,
    }));
}
async function generateStoryBreakdown(prompt, sceneCount, sceneDuration, totalDuration, userId, timestamp) {
    console.log('🤖 Calling OpenAI for story breakdown...');
    console.log(`📊 Parameters: ${sceneCount} scenes, ${totalDuration} seconds total`);
    console.log(`⏱️  Each scene will be ${sceneDuration} seconds long`);
    console.log('prompt:', prompt);
    try {
        // Guidance for narration pacing and safety caps
        const WPS = 2.2;
        const maxWordsPerScene = Math.floor(sceneDuration * WPS);
        console.log('maxWordsPerScene:', maxWordsPerScene);
        const maxTotalWords = Math.floor(totalDuration * WPS);
        const response = await openai.chat.completions.create({
            model: 'gpt-4o-mini',
            messages: [
                {
                    role: 'system',
                    content: `You are a short-form video scriptwriter for TikTok/Reels/Shorts.
                Break the user's idea into ${sceneCount} scenes for a ${totalDuration}-second, 9:16 vertical video; each scene lasts ${sceneDuration}s.
                Strict rules:
                - Narration per scene should have ${maxWordsPerScene} words (hard cap) and total words should be less than ${maxTotalWords}.
                - Language: **use the same language as the user's input**.
                - Each **description**: what viewers see. No dialogue. Keep it short and concise.
                - Avoid filler and long pauses: max 1 comma per sentence, no parentheses, no ellipses.
                - Prefer active voice and simple clauses.
  `,
                },
                {
                    role: 'user',
                    content: prompt,
                },
            ],
            temperature: 0.7,
            response_format: {
                type: 'json_schema',
                json_schema: {
                    name: 'VideoScenes',
                    schema: {
                        type: 'object',
                        properties: {
                            videoScenes: {
                                type: 'array',
                                items: {
                                    type: 'object',
                                    properties: {
                                        description: { type: 'string' },
                                        duration: { type: 'number' },
                                        narration: { type: 'string' },
                                    },
                                },
                            },
                            voiceToneInstruction: { type: 'string' },
                        },
                    },
                },
            },
        });
        console.log('🤖 OpenAI response:', response);
        const content = response.choices[0]?.message?.content;
        console.log('📄 OpenAI response content:', content);
        if (!content) {
            console.log('❌ Error: OpenAI did not return content');
            throw new Error('Failed to generate story breakdown');
        }
        const parsedResponse = JSON.parse(content);
        const scenes = parsedResponse.videoScenes || parsedResponse;
        const voiceToneInstruction = parsedResponse.voiceToneInstruction ||
            'Speak in a cheerful and positive tone';
        // Add scene IDs to each scene
        const scenesWithIds = addSceneIds(scenes);
        console.log('✅ Story breakdown parsed and adjusted successfully');
        console.log('🎤 Voice tone instruction:', voiceToneInstruction);
        // Save script response to S3
        const scriptKey = `${userId}/${timestamp}.script.txt`;
        const scriptContent = JSON.stringify({
            prompt,
            sceneCount,
            sceneDuration,
            totalDuration,
            scenes: scenesWithIds,
            voiceToneInstruction,
            timestamp,
        }, null, 2);
        await s3.send(new client_s3_1.PutObjectCommand({
            Bucket: process.env.VIDEO_PARTS_BUCKET_NAME,
            Key: scriptKey,
            Body: scriptContent,
            ContentType: 'text/plain',
        }));
        console.log(`💾 Script saved to S3: ${scriptKey}`);
        return { scenes: scenesWithIds, voiceToneInstruction };
    }
    catch (error) {
        console.error('❌ Error in generateStoryBreakdown:', error);
        throw error;
    }
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoic2NyaXB0LmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsic2NyaXB0LnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiI7O0FBbUJBLGtDQUtDO0FBRUQsd0RBNEhDO0FBdEpELG1DQUE0QjtBQUM1QixrREFBZ0U7QUFNaEUsTUFBTSxFQUFFLEdBQUcsSUFBSSxvQkFBUSxDQUFDLEVBQUUsTUFBTSxFQUFFLE9BQU8sQ0FBQyxHQUFHLENBQUMsVUFBVSxFQUFFLENBQUMsQ0FBQztBQUU1RCxNQUFNLE1BQU0sR0FBRyxJQUFJLGdCQUFNLENBQUMsRUFBRSxNQUFNLEVBQUUsT0FBTyxDQUFDLEdBQUcsQ0FBQyxjQUFjLEVBQUUsQ0FBQyxDQUFDO0FBU2xFLHdDQUF3QztBQUN4QyxTQUFnQixXQUFXLENBQUMsTUFBYTtJQUN2QyxPQUFPLE1BQU0sQ0FBQyxHQUFHLENBQUMsQ0FBQyxLQUFVLEVBQUUsR0FBVyxFQUFFLEVBQUUsQ0FBQyxDQUFDO1FBQzlDLEdBQUcsS0FBSztRQUNSLEVBQUUsRUFBRSxHQUFHO0tBQ1IsQ0FBQyxDQUFDLENBQUM7QUFDTixDQUFDO0FBRU0sS0FBSyxVQUFVLHNCQUFzQixDQUMxQyxNQUFjLEVBQ2QsVUFBa0IsRUFDbEIsYUFBcUIsRUFDckIsYUFBcUIsRUFDckIsTUFBYyxFQUNkLFNBQWlCO0lBRWpCLE9BQU8sQ0FBQyxHQUFHLENBQUMsMENBQTBDLENBQUMsQ0FBQztJQUN4RCxPQUFPLENBQUMsR0FBRyxDQUNULGtCQUFrQixVQUFVLFlBQVksYUFBYSxnQkFBZ0IsQ0FDdEUsQ0FBQztJQUVGLE9BQU8sQ0FBQyxHQUFHLENBQUMsMEJBQTBCLGFBQWEsZUFBZSxDQUFDLENBQUM7SUFFcEUsT0FBTyxDQUFDLEdBQUcsQ0FBQyxTQUFTLEVBQUUsTUFBTSxDQUFDLENBQUM7SUFFL0IsSUFBSSxDQUFDO1FBQ0gsZ0RBQWdEO1FBQ2hELE1BQU0sR0FBRyxHQUFHLEdBQUcsQ0FBQztRQUVoQixNQUFNLGdCQUFnQixHQUFHLElBQUksQ0FB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QUFnQixDQUFDO1lBQ25CLE1BQU0sRUFBRSxPQUFPLENBQUMsR0FBRyxDQUFDLHVCQUF1QjtZQUMzQyxHQUFHLEVBQUUsU0FBUztZQUNkLElBQUksRUFBRSxhQUFhO1lBQ25CLFdBQVcsRUFBRSxZQUFZO1NBQzFCLENBQUMsQ0FDSCxDQUFDO1FBRUYsT0FBTyxDQUFDLEdBQUcsQ0FBQywwQkFBMEIsU0FBUyxFQUFFLENBQUMsQ0FBQztRQUVuRCxPQUFPLEVBQUUsTUFBTSxFQUFFLGFBQWEsRUFBRSxvQkFBb0IsRUFBRSxDQUFDO0lBQ3pELENBQUM7SUFBQyxPQUFPLEtBQUssRUFBRSxDQUFDO1FBQ2YsT0FBTyxDQUFDLEtBQUssQ0FBQyxvQ0FBb0MsRUFBRSxLQUFLLENBQUMsQ0FBQztRQUMzRCxNQUFNLEtBQUssQ0FBQztJQUNkLENBQUM7QUFDSCxDQUFDIiwic291cmNlc0NvbnRlbnQiOlsiaW1wb3J0IE9wZW5BSSBmcm9tICdvcGVuYWknO1xuaW1wb3J0IHsgUzNDbGllbnQsIFB1dE9iamVjdENvbW1hbmQgfSBmcm9tICdAYXdzLXNkay9jbGllbnQtczMnO1xuaW1wb3J0IHtcbiAgZXN0aW1hdGVUZXh0RHVyYXRpb24sXG4gIGFkanVzdFRleHRGb3JEdXJhdGlvbixcbn0gZnJvbSAnLi91dGlsL25hcnJhdGlvbkhlbHBlcic7XG5cbmNvbnN0IHMzID0gbmV3IFMzQ2xpZW50KHsgcmVnaW9uOiBwcm9jZXNzLmVudi5BV1NfUkVHSU9OIH0pO1xuXG5jb25zdCBvcGVuYWkgPSBuZXcgT3BlbkFJKHsgYXBpS2V5OiBwcm9jZXNzLmVudi5PUEVOQUlfQVBJX0tFWSB9KTtcblxuZXhwb3J0IGludGVyZmFjZSBTY2VuZSB7XG4gIGRlc2NyaXB0aW9uOiBzdHJpbmc7XG4gIGR1cmF0aW9uOiBudW1iZXI7XG4gIG5hcnJhdGlvbjogc3RyaW5nO1xuICBpZDogbnVtYmVyO1xufVxuXG4vLyBVdGlsaXR5IGZ1bmN0aW9uIHRvIGFkZCBJRHMgdG8gc2NlbmVzXG5leHBvcnQgZnVuY3Rpb24gYWRkU2NlbmVJZHMoc2NlbmVzOiBhbnlbXSk6IFNjZW5lW10ge1xuICByZXR1cm4gc2NlbmVzLm1hcCgoc2NlbmU6IGFueSwgaWR4OiBudW1iZXIpID0+ICh7XG4gICAgLi4uc2NlbmUsXG4gICAgaWQ6IGlkeCxcbiAgfSkpO1xufVxuXG5leHBvcnQgYXN5bmMgZnVuY3Rpb24gZ2VuZXJhdGVTdG9yeUJyZWFrZG93bihcbiAgcHJvbXB0OiBzdHJpbmcsXG4gIHNjZW5lQ291bnQ6IG51bWJlcixcbiAgc2NlbmVEdXJhdGlvbjogbnVtYmVyLFxuICB0b3RhbER1cmF0aW9uOiBudW1iZXIsXG4gIHVzZXJJZDogc3RyaW5nLFxuICB0aW1lc3RhbXA6IHN0cmluZyxcbik6IFByb21pc2U8eyBzY2VuZXM6IFNjZW5lW107IHZvaWNlVG9uZUluc3RydWN0aW9uOiBzdHJpbmcgfT4ge1xuICBjb25zb2xlLmxvZygn8J+kliBDYWxsaW5nIE9wZW5BSSBmb3Igc3RvcnkgYnJlYWtkb3duLi4uJyk7XG4gIGNvbnNvbGUubG9nKFxuICAgIGDwn5OKIFBhcmFtZXRlcnM6ICR7c2NlbmVDb3VudH0gc2NlbmVzLCAke3RvdGFsRHVyYXRpb259IHNlY29uZHMgdG90YWxgLFxuICApO1xuXG4gIGNvbnNvbGUubG9nKGDij7HvuI8gIEVhY2ggc2NlbmUgd2lsbCBiZSAke3NjZW5lRHVyYXRpb259IHNlY29uZHMgbG9uZ2ApO1xuXG4gIGNvbnNvbGUubG9nKCdwcm9tcHQ6JywgcHJvbXB0KTtcblxuICB0cnkge1xuICAgIC8vIEd1aWRhbmNlIGZvciBuYXJyYXRpb24gcGFjaW5nIGFuZCBzYWZldHkgY2Fwc1xuICAgIGNvbnN0IFdQUyA9IDIuMjtcblxuICAgIGNvbnN0IG1heFdvcmRzUGVyU2NlbmUgPSBNYXRoLmZsb29yKHNjZW5lRHVyYXRpb24gKiBXUFMpO1xuICAgIGNvbnNvbGUubG9nKCdtYXhXb3Jkc1BlclNjZW5lOicsIG1heFdvcmRzUGVyU2NlbmUpO1xuICAgIGNvbnN0IG1heFRvdGFsV29yZHMgPSBNYXRoLmZsb29yKHRvdGFsRHVyYXRpb24gKiBXUFMpO1xuICAgIGNvbnN0IHJlc3BvbnNlID0gYXdhaXQgb3BlbmFpLmNoYXQuY29tcGxldGlvbnMuY3JlYXRlKHtcbiAgICAgIG1vZGVsOiAnZ3B0LTRvLW1pbmknLFxuICAgICAgbWVzc2FnZXM6IFtcbiAgICAgICAge1xuICAgICAgICAgIHJvbGU6ICdzeXN0ZW0nLFxuICAgICAgICAgIGNvbnRlbnQ6IGBZb3UgYXJlIGEgc2hvcnQtZm9ybSB2aWRlbyBzY3JpcHR3cml0ZXIgZm9yIFRpa1Rvay9SZWVscy9TaG9ydHMuXG4gICAgICAgICAgICAgICAgQnJlYWsgdGhlIHVzZXIncyBpZGVhIGludG8gJHtzY2VuZUNvdW50fSBzY2VuZXMgZm9yIGEgJHt0b3RhbER1cmF0aW9ufS1zZWNvbmQsIDk6MTYgdmVydGljYWwgdmlkZW87IGVhY2ggc2NlbmUgbGFzdHMgJHtzY2VuZUR1cmF0aW9ufXMuXG4gICAgICAgICAgICAgICAgU3RyaWN0IHJ1bGVzOlxuICAgICAgICAgICAgICAgIC0gTmFycmF0aW9uIHBlciBzY2VuZSBzaG91bGQgaGF2ZSAke21heFdvcmRzUGVyU2NlbmV9IHdvcmRzIChoYXJkIGNhcCkgYW5kIHRvdGFsIHdvcmRzIHNob3VsZCBiZSBsZXNzIHRoYW4gJHttYXhUb3RhbFdvcmRzfS5cbiAgICAgICAgICAgICAgICAtIExhbmd1YWdlOiAqKnVzZSB0aGUgc2FtZSBsYW5ndWFnZSBhcyB0aGUgdXNlcidzIGlucHV0KiouXG4gICAgICAgICAgICAgICAgLSBFYWNoICoqZGVzY3JpcHRpb24qKjogd2hhdCB2aWV3ZXJzIHNlZS4gTm8gZGlhbG9ndWUuIEtlZXAgaXQgc2hvcnQgYW5kIGNvbmNpc2UuXG4gICAgICAgICAgICAgICAgLSBBdm9pZCBmaWxsZXIgYW5kIGxvbmcgcGF1c2VzOiBtYXggMSBjb21tYSBwZXIgc2VudGVuY2UsIG5vIHBhcmVudGhlc2VzLCBubyBlbGxpcHNlcy5cbiAgICAgICAgICAgICAgICAtIFByZWZlciBhY3RpdmUgdm9pY2UgYW5kIHNpbXBsZSBjbGF1c2VzLlxuICBgLFxuICAgICAgICB9LFxuICAgICAgICB7XG4gICAgICAgICAgcm9sZTogJ3VzZXInLFxuICAgICAgICAgIGNvbnRlbnQ6IHByb21wdCxcbiAgICAgICAgfSxcbiAgICAgIF0sXG4gICAgICB0ZW1wZXJhdHVyZTogMC43LFxuICAgICAgcmVzcG9uc2VfZm9ybWF0OiB7XG4gICAgICAgIHR5cGU6ICdqc29uX3NjaGVtYScsXG4gICAgICAgIGpzb25fc2NoZW1hOiB7XG4gICAgICAgICAgbmFtZTogJ1ZpZGVvU2NlbmVzJyxcbiAgICAgICAgICBzY2hlbWE6IHtcbiAgICAgICAgICAgIHR5cGU6ICdvYmplY3QnLFxuICAgICAgICAgICAgcHJvcGVydGllczoge1xuICAgICAgICAgICAgICB2aWRlb1NjZW5lczoge1xuICAgICAgICAgICAgICAgIHR5cGU6ICdhcnJheScsXG4gICAgICAgICAgICAgICAgaXRlbXM6IHtcbiAgICAgICAgICAgICAgICAgIHR5cGU6ICdvYmplY3QnLFxuICAgICAgICAgICAgICAgICAgcHJvcGVydGllczoge1xuICAgICAgICAgICAgICAgICAgICBkZXNjcmlwdGlvbjogeyB0eXBlOiAnc3RyaW5nJyB9LFxuICAgICAgICAgICAgICAgICAgICBkdXJhdGlvbjogeyB0eXBlOiAnbnVtYmVyJyB9LFxuICAgICAgICAgICAgICAgICAgICBuYXJyYXRpb246IHsgdHlwZTogJ3N0cmluZycgfSxcbiAgICAgICAgICAgICAgICAgIH0sXG4gICAgICAgICAgICAgICAgfSxcbiAgICAgICAgICAgICAgfSxcbiAgICAgICAgICAgICAgdm9pY2VUb25lSW5zdHJ1Y3Rpb246IHsgdHlwZTogJ3N0cmluZycgfSxcbiAgICAgICAgICAgIH0sXG4gICAgICAgICAgfSxcbiAgICAgICAgfSxcbiAgICAgIH0sXG4gICAgfSk7XG5cbiAgICBjb25zb2xlLmxvZygn8J+kliBPcGVuQUkgcmVzcG9uc2U6JywgcmVzcG9uc2UpO1xuXG4gICAgY29uc3QgY29udGVudCA9IHJlc3BvbnNlLmNob2ljZXNbMF0/Lm1lc3NhZ2U/LmNvbnRlbnQ7XG4gICAgY29uc29sZS5sb2coJ/Cfk4QgT3BlbkFJIHJlc3BvbnNlIGNvbnRlbnQ6JywgY29udGVudCk7XG5cbiAgICBpZiAoIWNvbnRlbnQpIHtcbiAgICAgIGNvbnNvbGUubG9nKCfinYwgRXJyb3I6IE9wZW5BSSBkaWQgbm90IHJldHVybiBjb250ZW50Jyk7XG4gICAgICB0aHJvdyBuZXcgRXJyb3IoJ0ZhaWxlZCB0byBnZW5lcmF0ZSBzdG9yeSBicmVha2Rvd24nKTtcbiAgICB9XG5cbiAgICBjb25zdCBwYXJzZWRSZXNwb25zZSA9IEpTT04ucGFyc2UoY29udGVudCk7XG4gICAgY29uc3Qgc2NlbmVzID0gcGFyc2VkUmVzcG9uc2UudmlkZW9TY2VuZXMgfHwgcGFyc2VkUmVzcG9uc2U7XG4gICAgY29uc3Qgdm9pY2VUb25lSW5zdHJ1Y3Rpb24gPVxuICAgICAgcGFyc2VkUmVzcG9uc2Uudm9pY2VUb25lSW5zdHJ1Y3Rpb24gfHxcbiAgICAgICdTcGVhayBpbiBhIGNoZWVyZnVsIGFuZCBwb3NpdGl2ZSB0b25lJztcblxuICAgIC8vIEFkZCBzY2VuZSBJRHMgdG8gZWFjaCBzY2VuZVxuICAgIGNvbnN0IHNjZW5lc1dpdGhJZHMgPSBhZGRTY2VuZUlkcyhzY2VuZXMpO1xuXG4gICAgY29uc29sZS5sb2coJ+KchSBTdG9yeSBicmVha2Rvd24gcGFyc2VkIGFuZCBhZGp1c3RlZCBzdWNjZXNzZnVsbHknKTtcbiAgICBjb25zb2xlLmxvZygn8J+OpCBWb2ljZSB0b25lIGluc3RydWN0aW9uOicsIHZvaWNlVG9uZUluc3RydWN0aW9uKTtcblxuICAgIC8vIFNhdmUgc2NyaXB0IHJlc3BvbnNlIHRvIFMzXG4gICAgY29uc3Qgc2NyaXB0S2V5ID0gYCR7dXNlcklkfS8ke3RpbWVzdGFtcH0uc2NyaXB0LnR4dGA7XG4gICAgY29uc3Qgc2NyaXB0Q29udGVudCA9IEpTT04uc3RyaW5naWZ5KFxuICAgICAge1xuICAgICAgICBwcm9tcHQsXG4gICAgICAgIHNjZW5lQ291bnQsXG4gICAgICAgIHNjZW5lRHVyYXRpb24sXG4gICAgICAgIHRvdGFsRHVyYXRpb24sXG4gICAgICAgIHNjZW5lczogc2NlbmVzV2l0aElkcyxcbiAgICAgICAgdm9pY2VUb25lSW5zdHJ1Y3Rpb24sXG4gICAgICAgIHRpbWVzdGFtcCxcbiAgICAgIH0sXG4gICAgICBudWxsLFxuICAgICAgMixcbiAgICApO1xuXG4gICAgYXdhaXQgczMuc2VuZChcbiAgICAgIG5ldyBQdXRPYmplY3RDb21tYW5kKHtcbiAgICAgICAgQnVja2V0OiBwcm9jZXNzLmVudi5WSURFT19QQVJUU19CVUNLRVRfTkFNRSxcbiAgICAgICAgS2V5OiBzY3JpcHRLZXksXG4gICAgICAgIEJvZHk6IHNjcmlwdENvbnRlbnQsXG4gICAgICAgIENvbnRlbnRUeXBlOiAndGV4dC9wbGFpbicsXG4gICAgICB9KSxcbiAgICApO1xuXG4gICAgY29uc29sZS5sb2coYPCfkr4gU2NyaXB0IHNhdmVkIHRvIFMzOiAke3NjcmlwdEtleX1gKTtcblxuICAgIHJldHVybiB7IHNjZW5lczogc2NlbmVzV2l0aElkcywgdm9pY2VUb25lSW5zdHJ1Y3Rpb24gfTtcbiAgfSBjYXRjaCAoZXJyb3IpIHtcbiAgICBjb25zb2xlLmVycm9yKCfinYwgRXJyb3IgaW4gZ2VuZXJhdGVTdG9yeUJyZWFrZG93bjonLCBlcnJvcik7XG4gICAgdGhyb3cgZXJyb3I7XG4gIH1cbn1cbiJdfQ==