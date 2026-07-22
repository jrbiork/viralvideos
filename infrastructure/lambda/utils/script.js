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
async function generateStoryBreakdown(prompt, sceneCount, sceneDuration, totalDuration) {
    console.log('🤖 Calling OpenAI for story breakdown...');
    console.log(`📊 Parameters: ${sceneCount} scenes, ${totalDuration} seconds total`);
    console.log(`⏱️  Each scene will be ${sceneDuration} seconds long`);
    console.log('prompt:', prompt);
    try {
        // Build schema programmatically so `required` always matches `properties`
        const sceneItemSchema = {
            type: 'object',
            additionalProperties: false,
            properties: {
                description: { type: 'string' },
                duration: { type: 'number' },
                narration: { type: 'string', maxLength: 210 },
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
                    content: `Create a 9:16 vertical video split into exactly ${sceneCount} scenes. Each scene's narration must run **no more than 15 seconds when spoken aloud, and no less than 12** — that's a hard ceiling of **32 words**, never more. Count the words before finalizing each scene and trim if it's over. Set each scene's \`duration\` field to match how long its narration will actually take to say (12-15).
Strict rules:
- If the user names any, **rewrite to a generic archetype** (e.g., “an elderly Southern gentleman in a white suit and string tie”)—never use real names or marks.
- **Two concise character bylines at the top level** (<= 10 words each): \`charactersBylines = [female, male]\`.
- **Every scene must:**
  1) Start \`description\` with \`[FL: <female byline>] [ML: <male byline>]\` then the visual.
- **Narration tone:** write every \`narration\` like an outgoing, warm friend telling you this story in person because they're genuinely excited about it, casual, punchy, contractions welcome (e.g. "she's", "didn't"), short sentences, a little personality/humor where it fits. Talk *to* the listener, not *at* them, throw in the odd "you know", "honestly", "here's the thing", a rhetorical question, a reaction ("wild, right?"). Vary sentence rhythm like real speech, not uniform AI cadence. Avoid stock AI phrasing ("in a world where", "little did they know", "the truth is", "it turns out that"). Not a formal documentary narrator, not stiff or literary. Keep it clear and tasteful, casual, not crude or meme-y.
- **Never use the em dash character (—) anywhere in the output.** Use a comma, period, or "and" instead.
Output: **JSON only** following the provided schema.`,
                },
                {
                    role: 'user',
                    content: 'Elaborate the following idea being concise and specific, mentioning examples if possible: ' +
                        prompt,
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
            'Speak in a warm, upbeat, conversational tone — like telling a friend a fun story';
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoic2NyaXB0LmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsic2NyaXB0LnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiI7O0FBb0JBLGtDQU1DO0FBRUQsd0RBeUhDO0FBckpELG1DQUE0QjtBQUM1QixrREFBZ0U7QUFFaEUsTUFBTSxFQUFFLEdBQUcsSUFBSSxvQkFBUSxDQUFDLEVBQUUsTUFBTSxFQUFFLE9BQU8sQ0FBQyxHQUFHLENBQUMsVUFBVSxFQUFFLENBQUMsQ0FBQztBQUU1RCxNQUFNLE1BQU0sR0FBRyxJQUFJLGdCQUFNLENBQUMsRUFBRSxNQUFNLEVBQUUsT0FBTyxDQUFDLEdBQUcsQ0FBQyxjQUFjLEVBQUUsQ0FBQyxDQUFDO0FBY2xFLHdDQUF3QztBQUN4QyxTQUFnQixXQUFXLENBQUMsTUFBZTtJQUN6QyxPQUFPLE1BQU0sQ0FBQyxHQUFHLENBQUMsQ0FBQyxLQUFZLEVBQUUsR0FBVyxFQUFFLEVBQUUsQ0FBQyxDQUFDO1FBQ2hELEdBQUcsS0FBSztRQUNSLEVBQUUsRUFBRSxHQUFHO1FBQ1AsYUFBYSxFQUFFLEdBQUc7S0FDbkIsQ0FBQyxDQUFDLENBQUM7QUFDTixDQUFDO0FBRU0sS0FBSyxVQUFVLHNCQUFzQixDQUMxQyxNQUFjLEVBQ2QsVUFBa0IsRUFDbEIsYUFBcUIsRUFDckIsYUFBcUI7SUFFckIsT0FBTyxDQUFDLEdBQUcsQ0FBQywwQ0FBMEMsQ0FBQyxDQUFDO0lBQ3hELE9BQU8sQ0FBQyxHQUFHLENBQ1Qsa0JBQWtCLFVBQVUsWUFBWSxhQUFhLGdCQUFnQixDQUN0RSxDQUFDO0lBRUYsT0FBTyxDQUFDLEdBQUcsQ0FBQywwQkFBMEIsYUFBYSxlQUFlLENBQUMsQ0FBQztJQUVwRSxPQUFPLENBQUMsR0FBRyxDQUFDLFNBQVMsRUFBRSxNQUFNLENBQUMsQ0FBQztJQUUvQixJQUFJLENBQUM7UUFDSCwwRUFBMEU7UUFDMUUsTUFBTSxlQUFlLEdBQUc7WUFDdEIsSUFBSSxFQUFFLFFBQVE7WUFDZCxvQkFBb0IsRUFBRSxLQUFL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LE9BQU8sQ0FBQyxHQUFHLENBQUMsdUJBQXVCLEVBQUUsaUJBQWlCLENBQUMsQ0FBQztRQUN4RCxNQUFNLE1BQU0sR0FBRyxjQUFjLENBQUMsV0FBVyxJQUFJLGNBQWMsQ0FBQztRQUM1RCxNQUFNLG9CQUFvQixHQUN4QixjQUFjLENBQUMsb0JBQW9CO1lBQ25DLGtGQUFrRixDQUFDO1FBRXJGLDhCQUE4QjtRQUM5QixNQUFNLGFBQWEsR0FBRyxXQUFXLENBQUMsTUFBTSxDQUFDLENBQUM7UUFFMUMsT0FBTyxDQUFDLEdBQUcsQ0FBQyxvREFBb0QsQ0FBQyxDQUFDO1FBQ2xFLE9BQU8sQ0FBQyxHQUFHLENBQUMsNEJBQTRCLEVBQUUsb0JBQW9CLENBQUMsQ0FBQztRQUVoRSxPQUFPLEVBQUUsTUFBTSxFQUFFLGFBQWEsRUFBRSxvQkFBb0IsRUFBRSxDQUFDO0lBQ3pELENBQUM7SUFBQyxPQUFPLEtBQUssRUFBRSxDQUFDO1FBQ2YsT0FBTyxDQUFDLEtBQUssQ0FBQyxvQ0FBb0MsRUFBRSxLQUFLLENBQUMsQ0FBQztRQUMzRCxNQUFNLEtBQUssQ0FBQztJQUNkLENBQUM7QUFDSCxDQUFDIiwic291cmNlc0NvbnRlbnQiOlsiaW1wb3J0IE9wZW5BSSBmcm9tICdvcGVuYWknO1xuaW1wb3J0IHsgUzNDbGllbnQsIFB1dE9iamVjdENvbW1hbmQgfSBmcm9tICdAYXdzLXNkay9jbGllbnQtczMnO1xuXG5jb25zdCBzMyA9IG5ldyBTM0NsaWVudCh7IHJlZ2lvbjogcHJvY2Vzcy5lbnYuQVdTX1JFR0lPTiB9KTtcblxuY29uc3Qgb3BlbmFpID0gbmV3IE9wZW5BSSh7IGFwaUtleTogcHJvY2Vzcy5lbnYuT1BFTkFJX0FQSV9LRVkgfSk7XG5cbmV4cG9ydCBpbnRlcmZhY2UgU2NlbmUge1xuICBkZXNjcmlwdGlvbjogc3RyaW5nO1xuICBkdXJhdGlvbjogbnVtYmVyO1xuICBuYXJyYXRpb246IHN0cmluZztcbiAgaWQ6IG51bWJlcjtcbiAgc2NlbmVQb3NpdGlvbjogbnVtYmVyO1xuICAvKiogVHdvIHNob3J0IGJ5bGluZXMgcmVwZWF0ZWQgZXZlcnkgc2NlbmUsIGUuZy4sIFtcImJsb25kZSBTd2lzcyB3b21hbiwgZ3JlZW4tYmx1ZSBleWVzXCIsIFwibXVzY3VsYXIgQnJhemlsaWFuIG1hbiB3aXRoIG11c3RhY2hlXCJdICovXG4gIGNoYXJhY3RlcnNCcmllZj86IHN0cmluZ1tdO1xuICBhbmltYXRlZDogYm9vbGVhbjtcbiAgYW5pbWF0aW9uUHJvbXB0Pzogc3RyaW5nO1xufVxuXG4vLyBVdGlsaXR5IGZ1bmN0aW9uIHRvIGFkZCBJRHMgdG8gc2NlbmVzXG5leHBvcnQgZnVuY3Rpb24gYWRkU2NlbmVJZHMoc2NlbmVzOiBTY2VuZVtdKTogU2NlbmVbXSB7XG4gIHJldHVybiBzY2VuZXMubWFwKChzY2VuZTogU2NlbmUsIGlkeDogbnVtYmVyKSA9PiAoe1xuICAgIC4uLnNjZW5lLFxuICAgIGlkOiBpZHgsXG4gICAgc2NlbmVQb3NpdGlvbjogaWR4LFxuICB9KSk7XG59XG5cbmV4cG9ydCBhc3luYyBmdW5jdGlvbiBnZW5lcmF0ZVN0b3J5QnJlYWtkb3duKFxuICBwcm9tcHQ6IHN0cmluZyxcbiAgc2NlbmVDb3VudDogbnVtYmVyLFxuICBzY2VuZUR1cmF0aW9uOiBudW1iZXIsXG4gIHRvdGFsRHVyYXRpb246IG51bWJlcixcbik6IFByb21pc2U8eyBzY2VuZXM6IFNjZW5lW107IHZvaWNlVG9uZUluc3RydWN0aW9uOiBzdHJpbmcgfT4ge1xuICBjb25zb2xlLmxvZygn8J+kliBDYWxsaW5nIE9wZW5BSSBmb3Igc3RvcnkgYnJlYWtkb3duLi4uJyk7XG4gIGNvbnNvbGUubG9nKFxuICAgIGDwn5OKIFBhcmFtZXRlcnM6ICR7c2NlbmVDb3VudH0gc2NlbmVzLCAke3RvdGFsRHVyYXRpb259IHNlY29uZHMgdG90YWxgLFxuICApO1xuXG4gIGNvbnNvbGUubG9nKGDij7HvuI8gIEVhY2ggc2NlbmUgd2lsbCBiZSAke3NjZW5lRHVyYXRpb259IHNlY29uZHMgbG9uZ2ApO1xuXG4gIGNvbnNvbGUubG9nKCdwcm9tcHQ6JywgcHJvbXB0KTtcblxuICB0cnkge1xuICAgIC8vIEJ1aWxkIHNjaGVtYSBwcm9ncmFtbWF0aWNhbGx5IHNvIGByZXF1aXJlZGAgYWx3YXlzIG1hdGNoZXMgYHByb3BlcnRpZXNgXG4gICAgY29uc3Qgc2NlbmVJdGVtU2NoZW1hID0ge1xuICAgICAgdHlwZTogJ29iamVjdCcsXG4gICAgICBhZGRpdGlvbmFsUHJvcGVydGllczogZmFsc2UsXG4gICAgICBwcm9wZXJ0aWVzOiB7XG4gICAgICAgIGRlc2NyaXB0aW9uOiB7IHR5cGU6ICdzdHJpbmcnIH0sXG4gICAgICAgIGR1cmF0aW9uOiB7IHR5cGU6ICdudW1iZXInIH0sXG4gICAgICAgIG5hcnJhdGlvbjogeyB0eXBlOiAnc3RyaW5nJywgbWF4TGVuZ3RoOiAyMTAgfSxcbiAgICAgICAgY2hhcmFjdGVyc0JyaWVmOiB7XG4gICAgICAgICAgdHlwZTogJ2FycmF5JyxcbiAgICAgICAgICBtaW5JdGVtczogMixcbiAgICAgICAgICBtYXhJdGVtczogMixcbiAgICAgICAgICBpdGVtczogeyB0eXBlOiAnc3RyaW5nJywgbWF4TGVuZ3RoOiA4MCB9LFxuICAgICAgICB9LFxuICAgICAgfSxcbiAgICAgIHJlcXVpcmVkOiBbJ2Rlc2NyaXB0aW9uJywgJ2R1cmF0aW9uJywgJ25hcnJhdGlvbicsICdjaGFyYWN0ZXJzQnJpZWYnXSxcbiAgICB9IGFzIGNvbnN0O1xuXG4gICAgY29uc3QgdG9wTGV2ZWxQcm9wZXJ0aWVzID0ge1xuICAgICAgdmlkZW9TY2VuZXM6IHtcbiAgICAgICAgdHlwZTogJ2FycmF5JyxcbiAgICAgICAgbWluSXRlbXM6IHNjZW5lQ291bnQsXG4gICAgICAgIG1heEl0ZW1zOiBzY2VuZUNvdW50LFxuICAgICAgICBpdGVtczogc2NlbmVJdGVtU2NoZW1hLFxuICAgICAgfSxcbiAgICAgIHZvaWNlVG9uZUluc3RydWN0aW9uOiB7IHR5cGU6ICdzdHJpbmcnLCBtaW5MZW5ndGg6IDEgfSxcbiAgICAgIGNoYXJhY3RlcnNCeWxpbmVzOiB7XG4gICAgICAgIHR5cGU6ICdhcnJheScsXG4gICAgICAgIG1pbkl0ZW1zOiAyLFxuICAgICAgICBtYXhJdGVtczogMixcbiAgICAgICAgaXRlbXM6IHsgdHlwZTogJ3N0cmluZycsIG1heExlbmd0aDogODAgfSxcbiAgICAgIH0sXG4gICAgfSBhcyBjb25zdDtcblxuICAgIGNvbnN0IGpzb25TY2hlbWFSb290ID0ge1xuICAgICAgdHlwZTogJ29iamVjdCcsXG4gICAgICBhZGRpdGlvbmFsUHJvcGVydGllczogZmFsc2UsXG4gICAgICBwcm9wZXJ0aWVzOiB0b3BMZXZlbFByb3BlcnRpZXMsXG4gICAgICByZXF1aXJlZDogT2JqZWN0LmtleXModG9wTGV2ZWxQcm9wZXJ0aWVzKSxcbiAgICB9IGFzIGNvbnN0O1xuXG4gICAgY29uc29sZS5sb2coJ/Cfp6ogU3RydWN0dXJlZCBPdXRwdXQgc2NoZW1hOicsIEpTT04uc3RyaW5naWZ5KGpzb25TY2hlbWFSb290KSk7XG5cbiAgICBjb25zdCByZXNwb25zZSA9IGF3YWl0IG9wZW5haS5jaGF0LmNvbXBsZXRpb25zLmNyZWF0ZSh7XG4gICAgICBtb2RlbDogJ2dwdC01LW5hbm8nLFxuICAgICAgbWVzc2FnZXM6IFtcbiAgICAgICAge1xuICAgICAgICAgIHJvbGU6ICdzeXN0ZW0nLFxuICAgICAgICAgIGNvbnRlbnQ6IGBDcmVhdGUgYSA5OjE2IHZlcnRpY2FsIHZpZGVvIHNwbGl0IGludG8gZXhhY3RseSAke3NjZW5lQ291bnR9IHNjZW5lcy4gRWFjaCBzY2VuZSdzIG5hcnJhdGlvbiBtdXN0IHJ1biAqKm5vIG1vcmUgdGhhbiAxNSBzZWNvbmRzIHdoZW4gc3Bva2VuIGFsb3VkLCBhbmQgbm8gbGVzcyB0aGFuIDEyKiog4oCUIHRoYXQncyBhIGhhcmQgY2VpbGluZyBvZiAqKjMyIHdvcmRzKiosIG5ldmVyIG1vcmUuIENvdW50IHRoZSB3b3JkcyBiZWZvcmUgZmluYWxpemluZyBlYWNoIHNjZW5lIGFuZCB0cmltIGlmIGl0J3Mgb3Zlci4gU2V0IGVhY2ggc2NlbmUncyBcXGBkdXJhdGlvblxcYCBmaWVsZCB0byBtYXRjaCBob3cgbG9uZyBpdHMgbmFycmF0aW9uIHdpbGwgYWN0dWFsbHkgdGFrZSB0byBzYXkgKDEyLTE1KS5cblN0cmljdCBydWxlczpcbi0gSWYgdGhlIHVzZXIgbmFtZXMgYW55LCAqKnJld3JpdGUgdG8gYSBnZW5lcmljIGFyY2hldHlwZSoqIChlLmcuLCDigJxhbiBlbGRlcmx5IFNvdXRoZXJuIGdlbnRsZW1hbiBpbiBhIHdoaXRlIHN1aXQgYW5kIHN0cmluZyB0aWXigJ0p4oCUbmV2ZXIgdXNlIHJlYWwgbmFtZXMgb3IgbWFya3MuXG4tICoqVHdvIGNvbmNpc2UgY2hhcmFjdGVyIGJ5bGluZXMgYXQgdGhlIHRvcCBsZXZlbCoqICg8PSAxMCB3b3JkcyBlYWNoKTogXFxgY2hhcmFjdGVyc0J5bGluZXMgPSBbZmVtYWxlLCBtYWxlXVxcYC5cbi0gKipFdmVyeSBzY2VuZSBtdXN0OioqXG4gIDEpIFN0YXJ0IFxcYGRlc2NyaXB0aW9uXFxgIHdpdGggXFxgW0ZMOiA8ZmVtYWxlIGJ5bGluZT5dIFtNTDogPG1hbGUgYnlsaW5lPl1cXGAgdGhlbiB0aGUgdmlzdWFsLlxuLSAqKk5hcnJhdGlvbiB0b25lOioqIHdyaXRlIGV2ZXJ5IFxcYG5hcnJhdGlvblxcYCBsaWtlIGFuIG91dGdvaW5nLCB3YXJtIGZyaWVuZCB0ZWxsaW5nIHlvdSB0aGlzIHN0b3J5IGluIHBlcnNvbiBiZWNhdXNlIHRoZXkncmUgZ2VudWluZWx5IGV4Y2l0ZWQgYWJvdXQgaXQsIGNhc3VhbCwgcHVuY2h5LCBjb250cmFjdGlvbnMgd2VsY29tZSAoZS5nLiBcInNoZSdzXCIsIFwiZGlkbid0XCIpLCBzaG9ydCBzZW50ZW5jZXMsIGEgbGl0dGxlIHBlcnNvbmFsaXR5L2h1bW9yIHdoZXJlIGl0IGZpdHMuIFRhbGsgKnRvKiB0aGUgbGlzdGVuZXIsIG5vdCAqYXQqIHRoZW0sIHRocm93IGluIHRoZSBvZGQgXCJ5b3Uga25vd1wiLCBcImhvbmVzdGx5XCIsIFwiaGVyZSdzIHRoZSB0aGluZ1wiLCBhIHJoZXRvcmljYWwgcXVlc3Rpb24sIGEgcmVhY3Rpb24gKFwid2lsZCwgcmlnaHQ/XCIpLiBWYXJ5IHNlbnRlbmNlIHJoeXRobSBsaWtlIHJlYWwgc3BlZWNoLCBub3QgdW5pZm9ybSBBSSBjYWRlbmNlLiBBdm9pZCBzdG9jayBBSSBwaHJhc2luZyAoXCJpbiBhIHdvcmxkIHdoZXJlXCIsIFwibGl0dGxlIGRpZCB0aGV5IGtub3dcIiwgXCJ0aGUgdHJ1dGggaXNcIiwgXCJpdCB0dXJucyBvdXQgdGhhdFwiKS4gTm90IGEgZm9ybWFsIGRvY3VtZW50YXJ5IG5hcnJhdG9yLCBub3Qgc3RpZmYgb3IgbGl0ZXJhcnkuIEtlZXAgaXQgY2xlYXIgYW5kIHRhc3RlZnVsLCBjYXN1YWwsIG5vdCBjcnVkZSBvciBtZW1lLXkuXG4tICoqTmV2ZXIgdXNlIHRoZSBlbSBkYXNoIGNoYXJhY3RlciAo4oCUKSBhbnl3aGVyZSBpbiB0aGUgb3V0cHV0LioqIFVzZSBhIGNvbW1hLCBwZXJpb2QsIG9yIFwiYW5kXCIgaW5zdGVhZC5cbk91dHB1dDogKipKU09OIG9ubHkqKiBmb2xsb3dpbmcgdGhlIHByb3ZpZGVkIHNjaGVtYS5gLFxuICAgICAgICB9LFxuICAgICAgICB7XG4gICAgICAgICAgcm9sZTogJ3VzZXInLFxuICAgICAgICAgIGNvbnRlbnQ6XG4gICAgICAgICAgICAnRWxhYm9yYXRlIHRoZSBmb2xsb3dpbmcgaWRlYSBiZWluZyBjb25jaXNlIGFuZCBzcGVjaWZpYywgbWVudGlvbmluZyBleGFtcGxlcyBpZiBwb3NzaWJsZTogJyArXG4gICAgICAgICAgICBwcm9tcHQsXG4gICAgICAgIH0sXG4gICAgICBdLFxuICAgICAgdGVtcGVyYXR1cmU6IDEsXG4gICAgICByZXNwb25zZV9mb3JtYXQ6IHtcbiAgICAgICAgdHlwZTogJ2pzb25fc2NoZW1hJyxcbiAgICAgICAganNvbl9zY2hlbWE6IHtcbiAgICAgICAgICBuYW1lOiAnVmlkZW9TY2VuZXMnLFxuICAgICAgICAgIHN0cmljdDogdHJ1ZSxcbiAgICAgICAgICBzY2hlbWE6IGpzb25TY2hlbWFSb290LFxuICAgICAgICB9LFxuICAgICAgfSxcbiAgICB9KTtcblxuICAgIGNvbnNvbGUubG9nKCfwn6SWIE9wZW5BSSByZXNwb25zZTonLCByZXNwb25zZSk7XG5cbiAgICBjb25zdCBjb250ZW50ID0gcmVzcG9uc2UuY2hvaWNlc1swXT8ubWVzc2FnZT8uY29udGVudDtcbiAgICBjb25zb2xlLmxvZygn8J+ThCBPcGVuQUkgcmVzcG9uc2UgY29udGVudDonLCBjb250ZW50KTtcblxuICAgIGlmICghY29udGVudCkge1xuICAgICAgY29uc29sZS5sb2coJ+KdjCBFcnJvcjogT3BlbkFJIGRpZCBub3QgcmV0dXJuIGNvbnRlbnQnKTtcbiAgICAgIHRocm93IG5ldyBFcnJvcignRmFpbGVkIHRvIGdlbmVyYXRlIHN0b3J5IGJyZWFrZG93bicpO1xuICAgIH1cblxuICAgIGNvbnN0IHBhcnNlZFJlc3BvbnNlID0gSlNPTi5wYXJzZShjb250ZW50KTtcbiAgICBjb25zdCBjaGFyYWN0ZXJzQnlsaW5lczogc3RyaW5nW10gPSBwYXJzZWRSZXNwb25zZS5jaGFyYWN0ZXJzQnlsaW5lcyB8fCBbXTtcbiAgICBjb25zb2xlLmxvZygn8J+RpSBjaGFyYWN0ZXJzQnlsaW5lczonLCBjaGFyYWN0ZXJzQnlsaW5lcyk7XG4gICAgY29uc3Qgc2NlbmVzID0gcGFyc2VkUmVzcG9uc2UudmlkZW9TY2VuZXMgfHwgcGFyc2VkUmVzcG9uc2U7XG4gICAgY29uc3Qgdm9pY2VUb25lSW5zdHJ1Y3Rpb24gPVxuICAgICAgcGFyc2VkUmVzcG9uc2Uudm9pY2VUb25lSW5zdHJ1Y3Rpb24gfHxcbiAgICAgICdTcGVhayBpbiBhIHdhcm0sIHVwYmVhdCwgY29udmVyc2F0aW9uYWwgdG9uZSDigJQgbGlrZSB0ZWxsaW5nIGEgZnJpZW5kIGEgZnVuIHN0b3J5JztcblxuICAgIC8vIEFkZCBzY2VuZSBJRHMgdG8gZWFjaCBzY2VuZVxuICAgIGNvbnN0IHNjZW5lc1dpdGhJZHMgPSBhZGRTY2VuZUlkcyhzY2VuZXMpO1xuXG4gICAgY29uc29sZS5sb2coJ+KchSBTdG9yeSBicmVha2Rvd24gcGFyc2VkIGFuZCBhZGp1c3RlZCBzdWNjZXNzZnVsbHknKTtcbiAgICBjb25zb2xlLmxvZygn8J+OpCBWb2ljZSB0b25lIGluc3RydWN0aW9uOicsIHZvaWNlVG9uZUluc3RydWN0aW9uKTtcblxuICAgIHJldHVybiB7IHNjZW5lczogc2NlbmVzV2l0aElkcywgdm9pY2VUb25lSW5zdHJ1Y3Rpb24gfTtcbiAgfSBjYXRjaCAoZXJyb3IpIHtcbiAgICBjb25zb2xlLmVycm9yKCfinYwgRXJyb3IgaW4gZ2VuZXJhdGVTdG9yeUJyZWFrZG93bjonLCBlcnJvcik7XG4gICAgdGhyb3cgZXJyb3I7XG4gIH1cbn1cbiJdfQ==