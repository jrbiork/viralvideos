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
        scenePosition: idx,
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
        // Build schema programmatically so `required` always matches `properties`
        const sceneItemSchema = {
            type: 'object',
            additionalProperties: false,
            properties: {
                description: { type: 'string' },
                duration: { type: 'number' },
                narration: { type: 'string' },
                charactersBrief: {
                    type: 'array',
                    minItems: 2,
                    maxItems: 2,
                    items: { type: 'string', maxLength: 80 },
                },
            },
            required: ['description', 'duration', 'narration', 'charactersBrief'],
        };
        const topLevelProperties = {
            videoScenes: {
                type: 'array',
                minItems: sceneCount,
                maxItems: sceneCount,
                items: sceneItemSchema,
            },
            voiceToneInstruction: { type: 'string', minLength: 1 },
            charactersBylines: {
                type: 'array',
                minItems: 2,
                maxItems: 2,
                items: { type: 'string', maxLength: 80 },
            },
        };
        const jsonSchemaRoot = {
            type: 'object',
            additionalProperties: false,
            properties: topLevelProperties,
            required: Object.keys(topLevelProperties),
        };
        console.log('🧪 Structured Output schema:', JSON.stringify(jsonSchemaRoot));
        const response = await openai.chat.completions.create({
            model: 'gpt-5-nano',
            messages: [
                {
                    role: 'system',
                    content: `You are a short-form video scriptwriter for TikTok/Reels/Shorts.
Create a ${totalDuration}-second 9:16 vertical video split into exactly ${sceneCount} scenes (each ${sceneDuration}s).

Strict rules:
- **No brands, logos, trademarks, public figures, mascots, or celebrity likenesses.** If the user names any, **rewrite to a generic archetype** (e.g., “an elderly Southern gentleman in a white suit and string tie”)—never use real names or marks.
- **Two concise character bylines at the top level** (<= 10 words each): \`charactersBylines = [female, male]\`.
- **Every scene must:**
  1) Start \`description\` with \`[FL: <female byline>] [ML: <male byline>]\` then the visual.
  2) Include \`charactersBrief\` exactly equal to \`charactersBylines\` (verbatim strings, no paraphrasing).
  3) Use **no dialogue**; keep descriptions visual, concrete, and concise.
- Narration word cap per scene: <= ${maxWordsPerScene}. Total narration words < ${maxTotalWords}.
- Use **active voice**; avoid filler and long pauses.
- **Language**: exactly mirror the user’s input language.
- Safe visual cues only; no watermarks, UI, or photographer/brand references.

Output: **JSON only** following the provided schema.`,
                },
                {
                    role: 'user',
                    content: prompt,
                },
            ],
            temperature: 1,
            response_format: {
                type: 'json_schema',
                json_schema: {
                    name: 'VideoScenes',
                    strict: true,
                    schema: jsonSchemaRoot,
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
        const charactersBylines = parsedResponse.charactersBylines || [];
        console.log('👥 charactersBylines:', charactersBylines);
        const scenes = parsedResponse.videoScenes || parsedResponse;
        const voiceToneInstruction = parsedResponse.voiceToneInstruction ||
            'Speak in a cheerful and positive tone';
        // Add scene IDs to each scene
        const scenesWithIds = addSceneIds(scenes);
        console.log('✅ Story breakdown parsed and adjusted successfully');
        console.log('🎤 Voice tone instruction:', voiceToneInstruction);
        return { scenes: scenesWithIds, voiceToneInstruction };
    }
    catch (error) {
        console.error('❌ Error in generateStoryBreakdown:', error);
        throw error;
    }
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoic2NyaXB0LmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsic2NyaXB0LnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiI7O0FBa0JBLGtDQU1DO0FBRUQsd0RBdUlDO0FBaktELG1DQUE0QjtBQUM1QixrREFBZ0U7QUFFaEUsTUFBTSxFQUFFLEdBQUcsSUFBSSxvQkFBUSxDQUFDLEVBQUUsTUFBTSxFQUFFLE9BQU8sQ0FBQyxHQUFHLENBQUMsVUFBVSxFQUFFLENBQUMsQ0FBQztBQUU1RCxNQUFNLE1BQU0sR0FBRyxJQUFJLGdCQUFNLENBQUMsRUFBRSxNQUFNLEVBQUUsT0FBTyxDQUFDLEdBQUcsQ0FBQyxjQUFjLEVBQUUsQ0FBQyxDQUFDO0FBWWxFLHdDQUF3QztBQUN4QyxTQUFnQixXQUFXLENBQUMsTUFBZTtJQUN6QyxPQUFPLE1BQU0sQ0FBQyxHQUFHLENBQUMsQ0FBQyxLQUFZLEVBQUUsR0FBVyxFQUFFLEVBQUUsQ0FBQyxDQUFDO1FBQ2hELEdBQUcsS0FBSztRQUNSLEVBQUUsRUFBRSxHQUFHO1FBQ1AsYUFBYSxFQUFFLEdBQUc7S0FDbkIsQ0FBQyxDQUFDLENBQUM7QUFDTixDQUFDO0FBRU0sS0FBSyxVQUFVLHNCQUFzQixDQUMxQyxNQUFjLEVBQ2QsVUFBa0IsRUFDbEIsYUFBcUIsRUFDckIsYUFBcUIsRUFDckIsTUFBYyxFQUNkLFNBQWlCO0lBRWpCLE9BQU8sQ0FBQyxHQUFHLENBQUMsMENBQTBDLENBQUMsQ0FBQztJQUN4RCxPQUFPLENBQUMsR0FBRyxDQUNULGtCQUFrQixVQUFVLFlBQVksYUFBYSxnQkFBZ0IsQ0FDdEUsQ0FBQztJQUVGLE9BQU8sQ0FBQyxHQUFHLENBQUMsMEJBQTBCLGFBQWEsZUFBZSxDQUFDLENBQUM7SUFFcEUsT0FBTyxDQUFDLEdBQUcsQ0FBQyxTQUFTLEVBQUUsTUFBTSxDQUFDLENBQUM7SUFFL0IsSUFBSSxDQUFDO1FBQ0gsZ0RBQWdEO1FBQ2hELE1BQU0sR0FBRyxHQUFHLEdBQUcsQ0FBQztRQUVoQixNQUFN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LENBQUMsNkJBQTZCLEVBQUUsT0FBTyxDQUFDLENBQUM7UUFFcEQsSUFBSSxDQUFDLE9BQU8sRUFBRSxDQUFDO1lBQ2IsT0FBTyxDQUFDLEdBQUcsQ0FBQyx3Q0FBd0MsQ0FBQyxDQUFDO1lBQ3RELE1BQU0sSUFBSSxLQUFLLENBQUMsb0NBQW9DLENBQUMsQ0FBQztRQUN4RCxDQUFDO1FBRUQsTUFBTSxjQUFjLEdBQUcsSUFBSSxDQUFDLEtBQUssQ0FBQyxPQUFPLENBQUMsQ0FBQztRQUMzQyxNQUFNLGlCQUFpQixHQUFhLGNBQWMsQ0FBQyxpQkFBaUIsSUFBSSxFQUFFLENBQUM7UUFDM0UsT0FBTyxDQUFDLEdBQUcsQ0FBQyx1QkFBdUIsRUFBRSxpQkFBaUIsQ0FBQyxDQUFDO1FBQ3hELE1BQU0sTUFBTSxHQUFHLGNBQWMsQ0FBQyxXQUFXLElBQUksY0FBYyxDQUFDO1FBQzVELE1BQU0sb0JBQW9CLEdBQ3hCLGNBQWMsQ0FBQyxvQkFBb0I7WUFDbkMsdUNBQXVDLENBQUM7UUFFMUMsOEJBQThCO1FBQzlCLE1BQU0sYUFBYSxHQUFHLFdBQVcsQ0FBQyxNQUFNLENBQUMsQ0FBQztRQUUxQyxPQUFPLENBQUMsR0FBRyxDQUFDLG9EQUFvRCxDQUFDLENBQUM7UUFDbEUsT0FBTyxDQUFDLEdBQUcsQ0FBQyw0QkFBNEIsRUFBRSxvQkFBb0IsQ0FBQyxDQUFDO1FBRWhFLE9BQU8sRUFBRSxNQUFNLEVBQUUsYUFBYSxFQUFFLG9CQUFvQixFQUFFLENBQUM7SUFDekQsQ0FBQztJQUFDLE9BQU8sS0FBSyxFQUFFLENBQUM7UUFDZixPQUFPLENBQUMsS0FBSyxDQUFDLG9DQUFvQyxFQUFFLEtBQUssQ0FBQyxDQUFDO1FBQzNELE1BQU0sS0FBSyxDQUFDO0lBQ2QsQ0FBQztBQUNILENBQUMiLCJzb3VyY2VzQ29udGVudCI6WyJpbXBvcnQgT3BlbkFJIGZyb20gJ29wZW5haSc7XG5pbXBvcnQgeyBTM0NsaWVudCwgUHV0T2JqZWN0Q29tbWFuZCB9IGZyb20gJ0Bhd3Mtc2RrL2NsaWVudC1zMyc7XG5cbmNvbnN0IHMzID0gbmV3IFMzQ2xpZW50KHsgcmVnaW9uOiBwcm9jZXNzLmVudi5BV1NfUkVHSU9OIH0pO1xuXG5jb25zdCBvcGVuYWkgPSBuZXcgT3BlbkFJKHsgYXBpS2V5OiBwcm9jZXNzLmVudi5PUEVOQUlfQVBJX0tFWSB9KTtcblxuZXhwb3J0IGludGVyZmFjZSBTY2VuZSB7XG4gIGRlc2NyaXB0aW9uOiBzdHJpbmc7XG4gIGR1cmF0aW9uOiBudW1iZXI7XG4gIG5hcnJhdGlvbjogc3RyaW5nO1xuICBpZDogbnVtYmVyO1xuICBzY2VuZVBvc2l0aW9uOiBudW1iZXI7XG4gIC8qKiBUd28gc2hvcnQgYnlsaW5lcyByZXBlYXRlZCBldmVyeSBzY2VuZSwgZS5nLiwgW1wiYmxvbmRlIFN3aXNzIHdvbWFuLCBncmVlbi1ibHVlIGV5ZXNcIiwgXCJtdXNjdWxhciBCcmF6aWxpYW4gbWFuIHdpdGggbXVzdGFjaGVcIl0gKi9cbiAgY2hhcmFjdGVyc0JyaWVmPzogc3RyaW5nW107XG59XG5cbi8vIFV0aWxpdHkgZnVuY3Rpb24gdG8gYWRkIElEcyB0byBzY2VuZXNcbmV4cG9ydCBmdW5jdGlvbiBhZGRTY2VuZUlkcyhzY2VuZXM6IFNjZW5lW10pOiBTY2VuZVtdIHtcbiAgcmV0dXJuIHNjZW5lcy5tYXAoKHNjZW5lOiBTY2VuZSwgaWR4OiBudW1iZXIpID0+ICh7XG4gICAgLi4uc2NlbmUsXG4gICAgaWQ6IGlkeCxcbiAgICBzY2VuZVBvc2l0aW9uOiBpZHgsXG4gIH0pKTtcbn1cblxuZXhwb3J0IGFzeW5jIGZ1bmN0aW9uIGdlbmVyYXRlU3RvcnlCcmVha2Rvd24oXG4gIHByb21wdDogc3RyaW5nLFxuICBzY2VuZUNvdW50OiBudW1iZXIsXG4gIHNjZW5lRHVyYXRpb246IG51bWJlcixcbiAgdG90YWxEdXJhdGlvbjogbnVtYmVyLFxuICB1c2VySWQ6IHN0cmluZyxcbiAgdGltZXN0YW1wOiBzdHJpbmcsXG4pOiBQcm9taXNlPHsgc2NlbmVzOiBTY2VuZVtdOyB2b2ljZVRvbmVJbnN0cnVjdGlvbjogc3RyaW5nIH0+IHtcbiAgY29uc29sZS5sb2coJ/CfpJYgQ2FsbGluZyBPcGVuQUkgZm9yIHN0b3J5IGJyZWFrZG93bi4uLicpO1xuICBjb25zb2xlLmxvZyhcbiAgICBg8J+TiiBQYXJhbWV0ZXJzOiAke3NjZW5lQ291bnR9IHNjZW5lcywgJHt0b3RhbER1cmF0aW9ufSBzZWNvbmRzIHRvdGFsYCxcbiAgKTtcblxuICBjb25zb2xlLmxvZyhg4o+x77iPICBFYWNoIHNjZW5lIHdpbGwgYmUgJHtzY2VuZUR1cmF0aW9ufSBzZWNvbmRzIGxvbmdgKTtcblxuICBjb25zb2xlLmxvZygncHJvbXB0OicsIHByb21wdCk7XG5cbiAgdHJ5IHtcbiAgICAvLyBHdWlkYW5jZSBmb3IgbmFycmF0aW9uIHBhY2luZyBhbmQgc2FmZXR5IGNhcHNcbiAgICBjb25zdCBXUFMgPSAyLjI7XG5cbiAgICBjb25zdCBtYXhXb3Jkc1BlclNjZW5lID0gTWF0aC5mbG9vcihzY2VuZUR1cmF0aW9uICogV1BTKTtcbiAgICBjb25zb2xlLmxvZygnbWF4V29yZHNQZXJTY2VuZTonLCBtYXhXb3Jkc1BlclNjZW5lKTtcbiAgICBjb25zdCBtYXhUb3RhbFdvcmRzID0gTWF0aC5mbG9vcih0b3RhbER1cmF0aW9uICogV1BTKTtcblxuICAgIC8vIEJ1aWxkIHNjaGVtYSBwcm9ncmFtbWF0aWNhbGx5IHNvIGByZXF1aXJlZGAgYWx3YXlzIG1hdGNoZXMgYHByb3BlcnRpZXNgXG4gICAgY29uc3Qgc2NlbmVJdGVtU2NoZW1hID0ge1xuICAgICAgdHlwZTogJ29iamVjdCcsXG4gICAgICBhZGRpdGlvbmFsUHJvcGVydGllczogZmFsc2UsXG4gICAgICBwcm9wZXJ0aWVzOiB7XG4gICAgICAgIGRlc2NyaXB0aW9uOiB7IHR5cGU6ICdzdHJpbmcnIH0sXG4gICAgICAgIGR1cmF0aW9uOiB7IHR5cGU6ICdudW1iZXInIH0sXG4gICAgICAgIG5hcnJhdGlvbjogeyB0eXBlOiAnc3RyaW5nJyB9LFxuICAgICAgICBjaGFyYWN0ZXJzQnJpZWY6IHtcbiAgICAgICAgICB0eXBlOiAnYXJyYXknLFxuICAgICAgICAgIG1pbkl0ZW1zOiAyLFxuICAgICAgICAgIG1heEl0ZW1zOiAyLFxuICAgICAgICAgIGl0ZW1zOiB7IHR5cGU6ICdzdHJpbmcnLCBtYXhMZW5ndGg6IDgwIH0sXG4gICAgICAgIH0sXG4gICAgICB9LFxuICAgICAgcmVxdWlyZWQ6IFsnZGVzY3JpcHRpb24nLCAnZHVyYXRpb24nLCAnbmFycmF0aW9uJywgJ2NoYXJhY3RlcnNCcmllZiddLFxuICAgIH0gYXMgY29uc3Q7XG5cbiAgICBjb25zdCB0b3BMZXZlbFByb3BlcnRpZXMgPSB7XG4gICAgICB2aWRlb1NjZW5lczoge1xuICAgICAgICB0eXBlOiAnYXJyYXknLFxuICAgICAgICBtaW5JdGVtczogc2NlbmVDb3VudCxcbiAgICAgICAgbWF4SXRlbXM6IHNjZW5lQ291bnQsXG4gICAgICAgIGl0ZW1zOiBzY2VuZUl0ZW1TY2hlbWEsXG4gICAgICB9LFxuICAgICAgdm9pY2VUb25lSW5zdHJ1Y3Rpb246IHsgdHlwZTogJ3N0cmluZycsIG1pbkxlbmd0aDogMSB9LFxuICAgICAgY2hhcmFjdGVyc0J5bGluZXM6IHtcbiAgICAgICAgdHlwZTogJ2FycmF5JyxcbiAgICAgICAgbWluSXRlbXM6IDIsXG4gICAgICAgIG1heEl0ZW1zOiAyLFxuICAgICAgICBpdGVtczogeyB0eXBlOiAnc3RyaW5nJywgbWF4TGVuZ3RoOiA4MCB9LFxuICAgICAgfSxcbiAgICB9IGFzIGNvbnN0O1xuXG4gICAgY29uc3QganNvblNjaGVtYVJvb3QgPSB7XG4gICAgICB0eXBlOiAnb2JqZWN0JyxcbiAgICAgIGFkZGl0aW9uYWxQcm9wZXJ0aWVzOiBmYWxzZSxcbiAgICAgIHByb3BlcnRpZXM6IHRvcExldmVsUHJvcGVydGllcyxcbiAgICAgIHJlcXVpcmVkOiBPYmplY3Qua2V5cyh0b3BMZXZlbFByb3BlcnRpZXMpLFxuICAgIH0gYXMgY29uc3Q7XG5cbiAgICBjb25zb2xlLmxvZygn8J+nqiBTdHJ1Y3R1cmVkIE91dHB1dCBzY2hlbWE6JywgSlNPTi5zdHJpbmdpZnkoanNvblNjaGVtYVJvb3QpKTtcblxuICAgIGNvbnN0IHJlc3BvbnNlID0gYXdhaXQgb3BlbmFpLmNoYXQuY29tcGxldGlvbnMuY3JlYXRlKHtcbiAgICAgIG1vZGVsOiAnZ3B0LTUtbmFubycsXG4gICAgICBtZXNzYWdlczogW1xuICAgICAgICB7XG4gICAgICAgICAgcm9sZTogJ3N5c3RlbScsXG4gICAgICAgICAgY29udGVudDogYFlvdSBhcmUgYSBzaG9ydC1mb3JtIHZpZGVvIHNjcmlwdHdyaXRlciBmb3IgVGlrVG9rL1JlZWxzL1Nob3J0cy5cbkNyZWF0ZSBhICR7dG90YWxEdXJhdGlvbn0tc2Vjb25kIDk6MTYgdmVydGljYWwgdmlkZW8gc3BsaXQgaW50byBleGFjdGx5ICR7c2NlbmVDb3VudH0gc2NlbmVzIChlYWNoICR7c2NlbmVEdXJhdGlvbn1zKS5cblxuU3RyaWN0IHJ1bGVzOlxuLSAqKk5vIGJyYW5kcywgbG9nb3MsIHRyYWRlbWFya3MsIHB1YmxpYyBmaWd1cmVzLCBtYXNjb3RzLCBvciBjZWxlYnJpdHkgbGlrZW5lc3Nlcy4qKiBJZiB0aGUgdXNlciBuYW1lcyBhbnksICoqcmV3cml0ZSB0byBhIGdlbmVyaWMgYXJjaGV0eXBlKiogKGUuZy4sIOKAnGFuIGVsZGVybHkgU291dGhlcm4gZ2VudGxlbWFuIGluIGEgd2hpdGUgc3VpdCBhbmQgc3RyaW5nIHRpZeKAnSnigJRuZXZlciB1c2UgcmVhbCBuYW1lcyBvciBtYXJrcy5cbi0gKipUd28gY29uY2lzZSBjaGFyYWN0ZXIgYnlsaW5lcyBhdCB0aGUgdG9wIGxldmVsKiogKDw9IDEwIHdvcmRzIGVhY2gpOiBcXGBjaGFyYWN0ZXJzQnlsaW5lcyA9IFtmZW1hbGUsIG1hbGVdXFxgLlxuLSAqKkV2ZXJ5IHNjZW5lIG11c3Q6KipcbiAgMSkgU3RhcnQgXFxgZGVzY3JpcHRpb25cXGAgd2l0aCBcXGBbRkw6IDxmZW1hbGUgYnlsaW5lPl0gW01MOiA8bWFsZSBieWxpbmU+XVxcYCB0aGVuIHRoZSB2aXN1YWwuXG4gIDIpIEluY2x1ZGUgXFxgY2hhcmFjdGVyc0JyaWVmXFxgIGV4YWN0bHkgZXF1YWwgdG8gXFxgY2hhcmFjdGVyc0J5bGluZXNcXGAgKHZlcmJhdGltIHN0cmluZ3MsIG5vIHBhcmFwaHJhc2luZykuXG4gIDMpIFVzZSAqKm5vIGRpYWxvZ3VlKio7IGtlZXAgZGVzY3JpcHRpb25zIHZpc3VhbCwgY29uY3JldGUsIGFuZCBjb25jaXNlLlxuLSBOYXJyYXRpb24gd29yZCBjYXAgcGVyIHNjZW5lOiA8PSAke21heFdvcmRzUGVyU2NlbmV9LiBUb3RhbCBuYXJyYXRpb24gd29yZHMgPCAke21heFRvdGFsV29yZHN9LlxuLSBVc2UgKiphY3RpdmUgdm9pY2UqKjsgYXZvaWQgZmlsbGVyIGFuZCBsb25nIHBhdXNlcy5cbi0gKipMYW5ndWFnZSoqOiBleGFjdGx5IG1pcnJvciB0aGUgdXNlcuKAmXMgaW5wdXQgbGFuZ3VhZ2UuXG4tIFNhZmUgdmlzdWFsIGN1ZXMgb25seTsgbm8gd2F0ZXJtYXJrcywgVUksIG9yIHBob3RvZ3JhcGhlci9icmFuZCByZWZlcmVuY2VzLlxuXG5PdXRwdXQ6ICoqSlNPTiBvbmx5KiogZm9sbG93aW5nIHRoZSBwcm92aWRlZCBzY2hlbWEuYCxcbiAgICAgICAgfSxcbiAgICAgICAge1xuICAgICAgICAgIHJvbGU6ICd1c2VyJyxcbiAgICAgICAgICBjb250ZW50OiBwcm9tcHQsXG4gICAgICAgIH0sXG4gICAgICBdLFxuICAgICAgdGVtcGVyYXR1cmU6IDEsXG4gICAgICByZXNwb25zZV9mb3JtYXQ6IHtcbiAgICAgICAgdHlwZTogJ2pzb25fc2NoZW1hJyxcbiAgICAgICAganNvbl9zY2hlbWE6IHtcbiAgICAgICAgICBuYW1lOiAnVmlkZW9TY2VuZXMnLFxuICAgICAgICAgIHN0cmljdDogdHJ1ZSxcbiAgICAgICAgICBzY2hlbWE6IGpzb25TY2hlbWFSb290LFxuICAgICAgICB9LFxuICAgICAgfSxcbiAgICB9KTtcblxuICAgIGNvbnNvbGUubG9nKCfwn6SWIE9wZW5BSSByZXNwb25zZTonLCByZXNwb25zZSk7XG5cbiAgICBjb25zdCBjb250ZW50ID0gcmVzcG9uc2UuY2hvaWNlc1swXT8ubWVzc2FnZT8uY29udGVudDtcbiAgICBjb25zb2xlLmxvZygn8J+ThCBPcGVuQUkgcmVzcG9uc2UgY29udGVudDonLCBjb250ZW50KTtcblxuICAgIGlmICghY29udGVudCkge1xuICAgICAgY29uc29sZS5sb2coJ+KdjCBFcnJvcjogT3BlbkFJIGRpZCBub3QgcmV0dXJuIGNvbnRlbnQnKTtcbiAgICAgIHRocm93IG5ldyBFcnJvcignRmFpbGVkIHRvIGdlbmVyYXRlIHN0b3J5IGJyZWFrZG93bicpO1xuICAgIH1cblxuICAgIGNvbnN0IHBhcnNlZFJlc3BvbnNlID0gSlNPTi5wYXJzZShjb250ZW50KTtcbiAgICBjb25zdCBjaGFyYWN0ZXJzQnlsaW5lczogc3RyaW5nW10gPSBwYXJzZWRSZXNwb25zZS5jaGFyYWN0ZXJzQnlsaW5lcyB8fCBbXTtcbiAgICBjb25zb2xlLmxvZygn8J+RpSBjaGFyYWN0ZXJzQnlsaW5lczonLCBjaGFyYWN0ZXJzQnlsaW5lcyk7XG4gICAgY29uc3Qgc2NlbmVzID0gcGFyc2VkUmVzcG9uc2UudmlkZW9TY2VuZXMgfHwgcGFyc2VkUmVzcG9uc2U7XG4gICAgY29uc3Qgdm9pY2VUb25lSW5zdHJ1Y3Rpb24gPVxuICAgICAgcGFyc2VkUmVzcG9uc2Uudm9pY2VUb25lSW5zdHJ1Y3Rpb24gfHxcbiAgICAgICdTcGVhayBpbiBhIGNoZWVyZnVsIGFuZCBwb3NpdGl2ZSB0b25lJztcblxuICAgIC8vIEFkZCBzY2VuZSBJRHMgdG8gZWFjaCBzY2VuZVxuICAgIGNvbnN0IHNjZW5lc1dpdGhJZHMgPSBhZGRTY2VuZUlkcyhzY2VuZXMpO1xuXG4gICAgY29uc29sZS5sb2coJ+KchSBTdG9yeSBicmVha2Rvd24gcGFyc2VkIGFuZCBhZGp1c3RlZCBzdWNjZXNzZnVsbHknKTtcbiAgICBjb25zb2xlLmxvZygn8J+OpCBWb2ljZSB0b25lIGluc3RydWN0aW9uOicsIHZvaWNlVG9uZUluc3RydWN0aW9uKTtcblxuICAgIHJldHVybiB7IHNjZW5lczogc2NlbmVzV2l0aElkcywgdm9pY2VUb25lSW5zdHJ1Y3Rpb24gfTtcbiAgfSBjYXRjaCAoZXJyb3IpIHtcbiAgICBjb25zb2xlLmVycm9yKCfinYwgRXJyb3IgaW4gZ2VuZXJhdGVTdG9yeUJyZWFrZG93bjonLCBlcnJvcik7XG4gICAgdGhyb3cgZXJyb3I7XG4gIH1cbn1cbiJdfQ==