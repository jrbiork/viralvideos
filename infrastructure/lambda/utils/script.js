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
        // const scriptKey = `${userId}/${timestamp}.script.txt`;
        // const scriptContent = JSON.stringify(
        //   {
        //     prompt,
        //     sceneCount,
        //     sceneDuration,
        //     totalDuration,
        //     scenes: scenesWithIds,
        //     voiceToneInstruction,
        //     timestamp,
        //   },
        //   null,
        //   2,
        // );
        // await s3.send(
        //   new PutObjectCommand({
        //     Bucket: process.env.VIDEO_PARTS_BUCKET_NAME,
        //     Key: scriptKey,
        //     Body: scriptContent,
        //     ContentType: 'text/plain',
        //   }),
        // );
        // console.log(`💾 Script saved to S3: ${scriptKey}`);
        return { scenes: scenesWithIds, voiceToneInstruction };
    }
    catch (error) {
        console.error('❌ Error in generateStoryBreakdown:', error);
        throw error;
    }
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoic2NyaXB0LmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsic2NyaXB0LnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiI7O0FBZUEsa0NBS0M7QUFFRCx3REE0SEM7QUFsSkQsbUNBQTRCO0FBQzVCLGtEQUFnRTtBQUVoRSxNQUFNLEVBQUUsR0FBRyxJQUFJLG9CQUFRLENBQUMsRUFBRSxNQUFNLEVBQUUsT0FBTyxDQUFDLEdBQUcsQ0FBQyxVQUFVLEVBQUUsQ0FBQyxDQUFDO0FBRTVELE1BQU0sTUFBTSxHQUFHLElBQUksZ0JBQU0sQ0FBQyxFQUFFLE1BQU0sRUFBRSxPQUFPLENBQUMsR0FBRyxDQUFDLGNBQWMsRUFBRSxDQUFDLENBQUM7QUFTbEUsd0NBQXdDO0FBQ3hDLFNBQWdCLFdBQVcsQ0FBQyxNQUFlO0lBQ3pDLE9BQU8sTUFBTSxDQUFDLEdBQUcsQ0FBQyxDQUFDLEtBQVksRUFBRSxHQUFXLEVBQUUsRUFBRSxDQUFDLENBQUM7UUFDaEQsR0FBRyxLQUFLO1FBQ1IsRUFBRSxFQUFFLEdBQUc7S0FDUixDQUFDLENBQUMsQ0FBQztBQUNOLENBQUM7QUFFTSxLQUFLLFVBQVUsc0JBQXNCLENBQzFDLE1BQWMsRUFDZCxVQUFrQixFQUNsQixhQUFxQixFQUNyQixhQUFxQixFQUNyQixNQUFjLEVBQ2QsU0FBaUI7SUFFakIsT0FBTyxDQUFDLEdBQUcsQ0FBQywwQ0FBMEMsQ0FBQyxDQUFDO0lBQ3hELE9BQU8sQ0FBQyxHQUFHLENBQ1Qsa0JBQWtCLFVBQVUsWUFBWSxhQUFhLGdCQUFnQixDQUN0RSxDQUFDO0lBRUYsT0FBTyxDQUFDLEdBQUcsQ0FBQywwQkFBMEIsYUFBYSxlQUFlLENBQUMsQ0FBQztJQUVwRSxPQUFPLENBQUMsR0FBRyxDQUFDLFNBQVMsRUFBRSxNQUFNLENBQUMsQ0FBQztJQUUvQixJQUFJLENBQUM7UUFDSCxnREFBZ0Q7UUFDaEQsTUFBTSxHQUFHLEdBQUcsR0FBRyxDQUFDO1FBRWhCLE1BQU0sZ0JBQWdCLEdBQUcsSUFBSSxDQUFDLEtBQUssQ0FBQyxhQUFhLEdBQUcsR0FBRyxDQUFDLENBQUM7UUFDekQsT0FBTyxDQUFDLEdBQUcsQ0FBQyxtQkFBbUIsRUFBRSxnQkFBZ0IsQ0FBQyxDQUFDO1FBQ25ELE1BQU0sYUFBYSxHQUFHLElBQUksQ0FBQyxLQUFLLENBQUMsYUFBYSxHQUFHLEdBQUcsQ0FBQyxDQUFDO1FBQ3RELE1BQU0sUUFBUSxHQUFHLE1BQU0sTUFBTSxDQUFDLElBQUksQ0FBQyxXQUFXLENBQUMsTUFBTSxDQUFDO1lBQ3BELEtBQUssRUFBRSxhQUFhO1lBQ3BCLFFBQVEsRUFBRTtnQkFDUjtvQkFDRSxJQUFJLEVBQUUsUUFBUTtvQkFDZCxPQUFPLEVBQUU7NkNBQzBCLFVBQVUsaUJBQWlCLGFBQWEsa0RBQWtELGFBQWE7O29EQUVoRyxnQkFBZ0IseURBQXlELGFBQWE7Ozs7O0dBS3ZJO2lCQUNNO2dCQUNEO29CQUNFLElBQUksRUFBRSxNQUFNO29CQUNaLE9BQU8sRUFBRSxNQUFNO2lCQUNoQjthQUNGO1lBQ0QsV0FBVyxFQUFFLEdBQUc7WUFDaEIsZUFBZSxFQUFFO2dCQUNmLElBQUksRUFBRSxhQUFhO2dCQUNuQixXQUFXLEVBQUU7b0JBQ1gsSUFBSSxFQUFFLGFBQWE7b0JBQ25CLE1BQU0sRUFBRTt3QkFDTixJQUFJLEVBQUUsUUFBUTt3QkFDZCxVQUFVLEVBQUU7NEJBQ1YsV0FBVyxFQUFFO2dDQUNYLElBQUksRUFBRSxPQUFPO2dDQUNiLEtBQUssRUFBRTtvQ0FDTCxJQUFJLEVBQUUsUUFBUTtvQ0FDZCxVQUFVLEVBQUU7d0NBQ1YsV0FBVyxFQUFFLEVBQUUsSUFBSSxFQUFFLFFBQVEsRUFBRTt3Q0FDL0IsUUFBUSxFQUFFLEVBQUUsSUFBSSxFQUFFLFFBQVEsRUFBRTt3Q0FDNUIsU0FBUyxFQUFFLEVBQUUsSUFBSSxFQUFFLFFBQVEsRUFBRTtxQ0FDOUI7aUNBQ0Y7NkJBQ0Y7NEJBQ0Qsb0JBQW9CLEVBQUUsRUFBRSxJQUFJLEVBQUUsUUFBUSxFQUFFO3lCQUN6QztxQkFDRjtpQkFDRjthQUNGO1NBQ0YsQ0FBQyxDQUFDO1FBRUgsT0FBTyxDQUFDLEdBQUcsQ0FBQyxxQkFBcUIsRUFBRSxRQUFRLENBQUMsQ0FBQztRQUU3QyxNQUFNLE9BQU8sR0FBRyxRQUFRLENBQUMsT0FBTyxDQUFDLENBQUMsQ0FBQyxFQUFFLE9BQU8sRUFBRSxPQUFPLENBQUM7UUFDdEQsT0FBTyxDQUFDLEdBQUcsQ0FBQyw2QkFBNkIsRUFBRSxPQUFPLENBQUMsQ0FBQztRQUVwRCxJQUFJLENBQUMsT0FBTyxFQUFFLENBQUM7WUFDYixPQUFPLENBQUMsR0FBRyxDQUFDLHdDQUF3QyxDQUFDLENBQUM7WUFDdEQsTUFBTSxJQUFJLEtBQUssQ0FBQyxvQ0FBb0MsQ0FBQyxDQUFDO1FBQ3hELENBQUM7UUFFRCxNQUFNLGNBQWMsR0FBRyxJQUFJLENBQUMsS0FBSyxDQUFDLE9BQU8sQ0FBQyxDQUFDO1FBQzNDLE1BQU0sTUFBTSxHQUFHLGNBQWMsQ0FBQyxXQUFXLElBQUksY0FBYyxDQUFDO1FBQzVELE1BQU0sb0JBQW9CLEdBQ3hCLGNBQWMsQ0FBQyxvQkFBb0I7WUFDbkMsdUNBQXVDLENBQUM7UUFFMUMsOEJBQThCO1FBQzlCLE1BQU0sYUFBYSxHQUFHLFdBQVcsQ0FBQyxNQUFNLENBQUMsQ0FBQztRQUUxQyxPQUFPLENBQUMsR0FBRyxDQUFDLG9EQUFvRCxDQUFDLENBQUM7UUFDbEUsT0FBTyxDQUFDLEdBQUcsQ0FBQyw0QkFBNEIsRUFBRSxvQkFBb0IsQ0FBQyxDQUFDO1FBRWhFLDZCQUE2QjtRQUM3Qix5REFBeUQ7UUFDekQsd0NBQXdDO1FBQ3hDLE1BQU07UUFDTixjQUFjO1FBQ2Qsa0JBQWtCO1FBQ2xCLHFCQUFxQjtRQUNyQixxQkFBcUI7UUFDckIsNkJBQTZCO1FBQzdCLDRCQUE0QjtRQUM1QixpQkFBaUI7UUFDakIsT0FBTztRQUNQLFVBQVU7UUFDVixPQUFPO1FBQ1AsS0FBSztRQUVMLGlCQUFpQjtRQUNqQiwyQkFBMkI7UUFDM0IsbURBQW1EO1FBQ25ELHNCQUFzQjtRQUN0QiwyQkFBMkI7UUFDM0IsaUNBQWlDO1FBQ2pDLFFBQVE7UUFDUixLQUFLO1FBRUwsc0RBQXNEO1FBRXRELE9BQU8sRUFBRSxNQUFNLEVBQUUsYUFBYSxFQUFFLG9CQUFvQixFQUFFLENBQUM7SUFDekQsQ0FBQztJQUFDLE9BQU8sS0FBSyxFQUFFLENBQUM7UUFDZixPQUFPLENBQUMsS0FBSyxDQUFDLG9DQUFvQyxFQUFFLEtBQUssQ0FBQyxDQUFDO1FBQzNELE1BQU0sS0FBSyxDQUFDO0lBQ2QsQ0FBQztBQUNILENBQUMiLCJzb3VyY2VzQ29udGVudCI6WyJpbXBvcnQgT3BlbkFJIGZyb20gJ29wZW5haSc7XG5pbXBvcnQgeyBTM0NsaWVudCwgUHV0T2JqZWN0Q29tbWFuZCB9IGZyb20gJ0Bhd3Mtc2RrL2NsaWVudC1zMyc7XG5cbmNvbnN0IHMzID0gbmV3IFMzQ2xpZW50KHsgcmVnaW9uOiBwcm9jZXNzLmVudi5BV1NfUkVHSU9OIH0pO1xuXG5jb25zdCBvcGVuYWkgPSBuZXcgT3BlbkFJKHsgYXBpS2V5OiBwcm9jZXNzLmVudi5PUEVOQUlfQVBJX0tFWSB9KTtcblxuZXhwb3J0IGludGVyZmFjZSBTY2VuZSB7XG4gIGRlc2NyaXB0aW9uOiBzdHJpbmc7XG4gIGR1cmF0aW9uOiBudW1iZXI7XG4gIG5hcnJhdGlvbjogc3RyaW5nO1xuICBpZDogbnVtYmVyO1xufVxuXG4vLyBVdGlsaXR5IGZ1bmN0aW9uIHRvIGFkZCBJRHMgdG8gc2NlbmVzXG5leHBvcnQgZnVuY3Rpb24gYWRkU2NlbmVJZHMoc2NlbmVzOiBTY2VuZVtdKTogU2NlbmVbXSB7XG4gIHJldHVybiBzY2VuZXMubWFwKChzY2VuZTogU2NlbmUsIGlkeDogbnVtYmVyKSA9PiAoe1xuICAgIC4uLnNjZW5lLFxuICAgIGlkOiBpZHgsXG4gIH0pKTtcbn1cblxuZXhwb3J0IGFzeW5jIGZ1bmN0aW9uIGdlbmVyYXRlU3RvcnlCcmVha2Rvd24oXG4gIHByb21wdDogc3RyaW5nLFxuICBzY2VuZUNvdW50OiBudW1iZXIsXG4gIHNjZW5lRHVyYXRpb246IG51bWJlcixcbiAgdG90YWxEdXJhdGlvbjogbnVtYmVyLFxuICB1c2VySWQ6IHN0cmluZyxcbiAgdGltZXN0YW1wOiBzdHJpbmcsXG4pOiBQcm9taXNlPHsgc2NlbmVzOiBTY2VuZVtdOyB2b2ljZVRvbmVJbnN0cnVjdGlvbjogc3RyaW5nIH0+IHtcbiAgY29uc29sZS5sb2coJ/CfpJYgQ2FsbGluZyBPcGVuQUkgZm9yIHN0b3J5IGJyZWFrZG93bi4uLicpO1xuICBjb25zb2xlLmxvZyhcbiAgICBg8J+TiiBQYXJhbWV0ZXJzOiAke3NjZW5lQ291bnR9IHNjZW5lcywgJHt0b3RhbER1cmF0aW9ufSBzZWNvbmRzIHRvdGFsYCxcbiAgKTtcblxuICBjb25zb2xlLmxvZyhg4o+x77iPICBFYWNoIHNjZW5lIHdpbGwgYmUgJHtzY2VuZUR1cmF0aW9ufSBzZWNvbmRzIGxvbmdgKTtcblxuICBjb25zb2xlLmxvZygncHJvbXB0OicsIHByb21wdCk7XG5cbiAgdHJ5IHtcbiAgICAvLyBHdWlkYW5jZSBmb3IgbmFycmF0aW9uIHBhY2luZyBhbmQgc2FmZXR5IGNhcHNcbiAgICBjb25zdCBXUFMgPSAyLjI7XG5cbiAgICBjb25zdCBtYXhXb3Jkc1BlclNjZW5lID0gTWF0aC5mbG9vcihzY2VuZUR1cmF0aW9uICogV1BTKTtcbiAgICBjb25zb2xlLmxvZygnbWF4V29yZHNQZXJTY2VuZTonLCBtYXhXb3Jkc1BlclNjZW5lKTtcbiAgICBjb25zdCBtYXhUb3RhbFdvcmRzID0gTWF0aC5mbG9vcih0b3RhbER1cmF0aW9uICogV1BTKTtcbiAgICBjb25zdCByZXNwb25zZSA9IGF3YWl0IG9wZW5haS5jaGF0LmNvbXBsZXRpb25zLmNyZWF0ZSh7XG4gICAgICBtb2RlbDogJ2dwdC00by1taW5pJyxcbiAgICAgIG1lc3NhZ2VzOiBbXG4gICAgICAgIHtcbiAgICAgICAgICByb2xlOiAnc3lzdGVtJyxcbiAgICAgICAgICBjb250ZW50OiBgWW91IGFyZSBhIHNob3J0LWZvcm0gdmlkZW8gc2NyaXB0d3JpdGVyIGZvciBUaWtUb2svUmVlbHMvU2hvcnRzLlxuICAgICAgICAgICAgICAgIEJyZWFrIHRoZSB1c2VyJ3MgaWRlYSBpbnRvICR7c2NlbmVDb3VudH0gc2NlbmVzIGZvciBhICR7dG90YWxEdXJhdGlvbn0tc2Vjb25kLCA5OjE2IHZlcnRpY2FsIHZpZGVvOyBlYWNoIHNjZW5lIGxhc3RzICR7c2NlbmVEdXJhdGlvbn1zLlxuICAgICAgICAgICAgICAgIFN0cmljdCBydWxlczpcbiAgICAgICAgICAgICAgICAtIE5hcnJhdGlvbiBwZXIgc2NlbmUgc2hvdWxkIGhhdmUgJHttYXhXb3Jkc1BlclNjZW5lfSB3b3JkcyAoaGFyZCBjYXApIGFuZCB0b3RhbCB3b3JkcyBzaG91bGQgYmUgbGVzcyB0aGFuICR7bWF4VG90YWxXb3Jkc30uXG4gICAgICAgICAgICAgICAgLSBMYW5ndWFnZTogKip1c2UgdGhlIHNhbWUgbGFuZ3VhZ2UgYXMgdGhlIHVzZXIncyBpbnB1dCoqLlxuICAgICAgICAgICAgICAgIC0gRWFjaCAqKmRlc2NyaXB0aW9uKio6IHdoYXQgdmlld2VycyBzZWUuIE5vIGRpYWxvZ3VlLiBLZWVwIGl0IHNob3J0IGFuZCBjb25jaXNlLlxuICAgICAgICAgICAgICAgIC0gQXZvaWQgZmlsbGVyIGFuZCBsb25nIHBhdXNlczogbWF4IDEgY29tbWEgcGVyIHNlbnRlbmNlLCBubyBwYXJlbnRoZXNlcywgbm8gZWxsaXBzZXMuXG4gICAgICAgICAgICAgICAgLSBQcmVmZXIgYWN0aXZlIHZvaWNlIGFuZCBzaW1wbGUgY2xhdXNlcy5cbiAgYCxcbiAgICAgICAgfSxcbiAgICAgICAge1xuICAgICAgICAgIHJvbGU6ICd1c2VyJyxcbiAgICAgICAgICBjb250ZW50OiBwcm9tcHQsXG4gICAgICAgIH0sXG4gICAgICBdLFxuICAgICAgdGVtcGVyYXR1cmU6IDAuNyxcbiAgICAgIHJlc3BvbnNlX2Zvcm1hdDoge1xuICAgICAgICB0eXBlOiAnanNvbl9zY2hlbWEnLFxuICAgICAgICBqc29uX3NjaGVtYToge1xuICAgICAgICAgIG5hbWU6ICdWaWRlb1NjZW5lcycsXG4gICAgICAgICAgc2NoZW1hOiB7XG4gICAgICAgICAgICB0eXBlOiAnb2JqZWN0JyxcbiAgICAgICAgICAgIHByb3BlcnRpZXM6IHtcbiAgICAgICAgICAgICAgdmlkZW9TY2VuZXM6IHtcbiAgICAgICAgICAgICAgICB0eXBlOiAnYXJyYXknLFxuICAgICAgICAgICAgICAgIGl0ZW1zOiB7XG4gICAgICAgICAgICAgICAgICB0eXBlOiAnb2JqZWN0JyxcbiAgICAgICAgICAgICAgICAgIHByb3BlcnRpZXM6IHtcbiAgICAgICAgICAgICAgICAgICAgZGVzY3JpcHRpb246IHsgdHlwZTogJ3N0cmluZycgfSxcbiAgICAgICAgICAgICAgICAgICAgZHVyYXRpb246IHsgdHlwZTogJ251bWJlcicgfSxcbiAgICAgICAgICAgICAgICAgICAgbmFycmF0aW9uOiB7IHR5cGU6ICdzdHJpbmcnIH0sXG4gICAgICAgICAgICAgICAgICB9LFxuICAgICAgICAgICAgICAgIH0sXG4gICAgICAgICAgICAgIH0sXG4gICAgICAgICAgICAgIHZvaWNlVG9uZUluc3RydWN0aW9uOiB7IHR5cGU6ICdzdHJpbmcnIH0sXG4gICAgICAgICAgICB9LFxuICAgICAgICAgIH0sXG4gICAgICAgIH0sXG4gICAgICB9LFxuICAgIH0pO1xuXG4gICAgY29uc29sZS5sb2coJ/CfpJYgT3BlbkFJIHJlc3BvbnNlOicsIHJlc3BvbnNlKTtcblxuICAgIGNvbnN0IGNvbnRlbnQgPSByZXNwb25zZS5jaG9pY2VzWzBdPy5tZXNzYWdlPy5jb250ZW50O1xuICAgIGNvbnNvbGUubG9nKCfwn5OEIE9wZW5BSSByZXNwb25zZSBjb250ZW50OicsIGNvbnRlbnQpO1xuXG4gICAgaWYgKCFjb250ZW50KSB7XG4gICAgICBjb25zb2xlLmxvZygn4p2MIEVycm9yOiBPcGVuQUkgZGlkIG5vdCByZXR1cm4gY29udGVudCcpO1xuICAgICAgdGhyb3cgbmV3IEVycm9yKCdGYWlsZWQgdG8gZ2VuZXJhdGUgc3RvcnkgYnJlYWtkb3duJyk7XG4gICAgfVxuXG4gICAgY29uc3QgcGFyc2VkUmVzcG9uc2UgPSBKU09OLnBhcnNlKGNvbnRlbnQpO1xuICAgIGNvbnN0IHNjZW5lcyA9IHBhcnNlZFJlc3BvbnNlLnZpZGVvU2NlbmVzIHx8IHBhcnNlZFJlc3BvbnNlO1xuICAgIGNvbnN0IHZvaWNlVG9uZUluc3RydWN0aW9uID1cbiAgICAgIHBhcnNlZFJlc3BvbnNlLnZvaWNlVG9uZUluc3RydWN0aW9uIHx8XG4gICAgICAnU3BlYWsgaW4gYSBjaGVlcmZ1bCBhbmQgcG9zaXRpdmUgdG9uZSc7XG5cbiAgICAvLyBBZGQgc2NlbmUgSURzIHRvIGVhY2ggc2NlbmVcbiAgICBjb25zdCBzY2VuZXNXaXRoSWRzID0gYWRkU2NlbmVJZHMoc2NlbmVzKTtcblxuICAgIGNvbnNvbGUubG9nKCfinIUgU3RvcnkgYnJlYWtkb3duIHBhcnNlZCBhbmQgYWRqdXN0ZWQgc3VjY2Vzc2Z1bGx5Jyk7XG4gICAgY29uc29sZS5sb2coJ/CfjqQgVm9pY2UgdG9uZSBpbnN0cnVjdGlvbjonLCB2b2ljZVRvbmVJbnN0cnVjdGlvbik7XG5cbiAgICAvLyBTYXZlIHNjcmlwdCByZXNwb25zZSB0byBTM1xuICAgIC8vIGNvbnN0IHNjcmlwdEtleSA9IGAke3VzZXJJZH0vJHt0aW1lc3RhbXB9LnNjcmlwdC50eHRgO1xuICAgIC8vIGNvbnN0IHNjcmlwdENvbnRlbnQgPSBKU09OLnN0cmluZ2lmeShcbiAgICAvLyAgIHtcbiAgICAvLyAgICAgcHJvbXB0LFxuICAgIC8vICAgICBzY2VuZUNvdW50LFxuICAgIC8vICAgICBzY2VuZUR1cmF0aW9uLFxuICAgIC8vICAgICB0b3RhbER1cmF0aW9uLFxuICAgIC8vICAgICBzY2VuZXM6IHNjZW5lc1dpdGhJZHMsXG4gICAgLy8gICAgIHZvaWNlVG9uZUluc3RydWN0aW9uLFxuICAgIC8vICAgICB0aW1lc3RhbXAsXG4gICAgLy8gICB9LFxuICAgIC8vICAgbnVsbCxcbiAgICAvLyAgIDIsXG4gICAgLy8gKTtcblxuICAgIC8vIGF3YWl0IHMzLnNlbmQoXG4gICAgLy8gICBuZXcgUHV0T2JqZWN0Q29tbWFuZCh7XG4gICAgLy8gICAgIEJ1Y2tldDogcHJvY2Vzcy5lbnYuVklERU9fUEFSVFNfQlVDS0VUX05BTUUsXG4gICAgLy8gICAgIEtleTogc2NyaXB0S2V5LFxuICAgIC8vICAgICBCb2R5OiBzY3JpcHRDb250ZW50LFxuICAgIC8vICAgICBDb250ZW50VHlwZTogJ3RleHQvcGxhaW4nLFxuICAgIC8vICAgfSksXG4gICAgLy8gKTtcblxuICAgIC8vIGNvbnNvbGUubG9nKGDwn5K+IFNjcmlwdCBzYXZlZCB0byBTMzogJHtzY3JpcHRLZXl9YCk7XG5cbiAgICByZXR1cm4geyBzY2VuZXM6IHNjZW5lc1dpdGhJZHMsIHZvaWNlVG9uZUluc3RydWN0aW9uIH07XG4gIH0gY2F0Y2ggKGVycm9yKSB7XG4gICAgY29uc29sZS5lcnJvcign4p2MIEVycm9yIGluIGdlbmVyYXRlU3RvcnlCcmVha2Rvd246JywgZXJyb3IpO1xuICAgIHRocm93IGVycm9yO1xuICB9XG59XG4iXX0=