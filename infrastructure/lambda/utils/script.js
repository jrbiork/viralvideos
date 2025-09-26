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
                    content: `Create a ${totalDuration}-second 9:16 vertical video split into exactly ${sceneCount} scenes (each ${sceneDuration}s).
Strict rules:
- If the user names any, **rewrite to a generic archetype** (e.g., “an elderly Southern gentleman in a white suit and string tie”)—never use real names or marks.
- **Two concise character bylines at the top level** (<= 10 words each): \`charactersBylines = [female, male]\`.
- **Every scene must:**
  1) Start \`description\` with \`[FL: <female byline>] [ML: <male byline>]\` then the visual.
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoic2NyaXB0LmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsic2NyaXB0LnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiI7O0FBbUJBLGtDQU1DO0FBRUQsd0RBdUhDO0FBbEpELG1DQUE0QjtBQUM1QixrREFBZ0U7QUFFaEUsTUFBTSxFQUFFLEdBQUcsSUFBSSxvQkFBUSxDQUFDLEVBQUUsTUFBTSxFQUFFLE9BQU8sQ0FBQyxHQUFHLENBQUMsVUFBVSxFQUFFLENBQUMsQ0FBQztBQUU1RCxNQUFNLE1BQU0sR0FBRyxJQUFJLGdCQUFNLENBQUMsRUFBRSxNQUFNLEVBQUUsT0FBTyxDQUFDLEdBQUcsQ0FBQyxjQUFjLEVBQUUsQ0FBQyxDQUFDO0FBYWxFLHdDQUF3QztBQUN4QyxTQUFnQixXQUFXLENBQUMsTUFBZTtJQUN6QyxPQUFPLE1BQU0sQ0FBQyxHQUFHLENBQUMsQ0FBQyxLQUFZLEVBQUUsR0FBVyxFQUFFLEVBQUUsQ0FBQyxDQUFDO1FBQ2hELEdBQUcsS0FBSztRQUNSLEVBQUUsRUFBRSxHQUFHO1FBQ1AsYUFBYSxFQUFFLEdBQUc7S0FDbkIsQ0FBQyxDQUFDLENBQUM7QUFDTixDQUFDO0FBRU0sS0FBSyxVQUFVLHNCQUFzQixDQUMxQyxNQUFjLEVBQ2QsVUFBa0IsRUFDbEIsYUFBcUIsRUFDckIsYUFBcUI7SUFFckIsT0FBTyxDQUFDLEdBQUcsQ0FBQywwQ0FBMEMsQ0FBQyxDQUFDO0lBQ3hELE9BQU8sQ0FBQyxHQUFHLENBQ1Qsa0JBQWtCLFVBQVUsWUFBWSxhQUFhLGdCQUFnQixDQUN0RSxDQUFDO0lBRUYsT0FBTyxDQUFDLEdBQUcsQ0FBQywwQkFBMEIsYUFBYSxlQUFlLENBQUMsQ0FBQztJQUVwRSxPQUFPLENBQUMsR0FBRyxDQUFDLFNBQVMsRUFBRSxNQUFNLENBQUMsQ0FBQztJQUUvQixJQUFJLENBQUM7UUFDSCwwRUFBMEU7UUFDMUUsTUFBTSxlQUFlLEdBQUc7WUFDdEIsSUFBSSxFQUFFLFFBQVE7WUFDZCxvQkFBb0IsRUFBRSxLQUFL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LE9BQU8sQ0FBQyxHQUFHLENBQUMsdUJBQXVCLEVBQUUsaUJBQWlCLENBQUMsQ0FBQztRQUN4RCxNQUFNLE1BQU0sR0FBRyxjQUFjLENBQUMsV0FBVyxJQUFJLGNBQWMsQ0FBQztRQUM1RCxNQUFNLG9CQUFvQixHQUN4QixjQUFjLENBQUMsb0JBQW9CO1lBQ25DLHVDQUF1QyxDQUFDO1FBRTFDLDhCQUE4QjtRQUM5QixNQUFNLGFBQWEsR0FBRyxXQUFXLENBQUMsTUFBTSxDQUFDLENBQUM7UUFFMUMsT0FBTyxDQUFDLEdBQUcsQ0FBQyxvREFBb0QsQ0FBQyxDQUFDO1FBQ2xFLE9BQU8sQ0FBQyxHQUFHLENBQUMsNEJBQTRCLEVBQUUsb0JBQW9CLENBQUMsQ0FBQztRQUVoRSxPQUFPLEVBQUUsTUFBTSxFQUFFLGFBQWEsRUFBRSxvQkFBb0IsRUFBRSxDQUFDO0lBQ3pELENBQUM7SUFBQyxPQUFPLEtBQUssRUFBRSxDQUFDO1FBQ2YsT0FBTyxDQUFDLEtBQUssQ0FBQyxvQ0FBb0MsRUFBRSxLQUFLLENBQUMsQ0FBQztRQUMzRCxNQUFNLEtBQUssQ0FBQztJQUNkLENBQUM7QUFDSCxDQUFDIiwic291cmNlc0NvbnRlbnQiOlsiaW1wb3J0IE9wZW5BSSBmcm9tICdvcGVuYWknO1xuaW1wb3J0IHsgUzNDbGllbnQsIFB1dE9iamVjdENvbW1hbmQgfSBmcm9tICdAYXdzLXNkay9jbGllbnQtczMnO1xuXG5jb25zdCBzMyA9IG5ldyBTM0NsaWVudCh7IHJlZ2lvbjogcHJvY2Vzcy5lbnYuQVdTX1JFR0lPTiB9KTtcblxuY29uc3Qgb3BlbmFpID0gbmV3IE9wZW5BSSh7IGFwaUtleTogcHJvY2Vzcy5lbnYuT1BFTkFJX0FQSV9LRVkgfSk7XG5cbmV4cG9ydCBpbnRlcmZhY2UgU2NlbmUge1xuICBkZXNjcmlwdGlvbjogc3RyaW5nO1xuICBkdXJhdGlvbjogbnVtYmVyO1xuICBuYXJyYXRpb246IHN0cmluZztcbiAgaWQ6IG51bWJlcjtcbiAgc2NlbmVQb3NpdGlvbjogbnVtYmVyO1xuICAvKiogVHdvIHNob3J0IGJ5bGluZXMgcmVwZWF0ZWQgZXZlcnkgc2NlbmUsIGUuZy4sIFtcImJsb25kZSBTd2lzcyB3b21hbiwgZ3JlZW4tYmx1ZSBleWVzXCIsIFwibXVzY3VsYXIgQnJhemlsaWFuIG1hbiB3aXRoIG11c3RhY2hlXCJdICovXG4gIGNoYXJhY3RlcnNCcmllZj86IHN0cmluZ1tdO1xuICBhbmltYXRlZDogYm9vbGVhbjtcbn1cblxuLy8gVXRpbGl0eSBmdW5jdGlvbiB0byBhZGQgSURzIHRvIHNjZW5lc1xuZXhwb3J0IGZ1bmN0aW9uIGFkZFNjZW5lSWRzKHNjZW5lczogU2NlbmVbXSk6IFNjZW5lW10ge1xuICByZXR1cm4gc2NlbmVzLm1hcCgoc2NlbmU6IFNjZW5lLCBpZHg6IG51bWJlcikgPT4gKHtcbiAgICAuLi5zY2VuZSxcbiAgICBpZDogaWR4LFxuICAgIHNjZW5lUG9zaXRpb246IGlkeCxcbiAgfSkpO1xufVxuXG5leHBvcnQgYXN5bmMgZnVuY3Rpb24gZ2VuZXJhdGVTdG9yeUJyZWFrZG93bihcbiAgcHJvbXB0OiBzdHJpbmcsXG4gIHNjZW5lQ291bnQ6IG51bWJlcixcbiAgc2NlbmVEdXJhdGlvbjogbnVtYmVyLFxuICB0b3RhbER1cmF0aW9uOiBudW1iZXIsXG4pOiBQcm9taXNlPHsgc2NlbmVzOiBTY2VuZVtdOyB2b2ljZVRvbmVJbnN0cnVjdGlvbjogc3RyaW5nIH0+IHtcbiAgY29uc29sZS5sb2coJ/CfpJYgQ2FsbGluZyBPcGVuQUkgZm9yIHN0b3J5IGJyZWFrZG93bi4uLicpO1xuICBjb25zb2xlLmxvZyhcbiAgICBg8J+TiiBQYXJhbWV0ZXJzOiAke3NjZW5lQ291bnR9IHNjZW5lcywgJHt0b3RhbER1cmF0aW9ufSBzZWNvbmRzIHRvdGFsYCxcbiAgKTtcblxuICBjb25zb2xlLmxvZyhg4o+x77iPICBFYWNoIHNjZW5lIHdpbGwgYmUgJHtzY2VuZUR1cmF0aW9ufSBzZWNvbmRzIGxvbmdgKTtcblxuICBjb25zb2xlLmxvZygncHJvbXB0OicsIHByb21wdCk7XG5cbiAgdHJ5IHtcbiAgICAvLyBCdWlsZCBzY2hlbWEgcHJvZ3JhbW1hdGljYWxseSBzbyBgcmVxdWlyZWRgIGFsd2F5cyBtYXRjaGVzIGBwcm9wZXJ0aWVzYFxuICAgIGNvbnN0IHNjZW5lSXRlbVNjaGVtYSA9IHtcbiAgICAgIHR5cGU6ICdvYmplY3QnLFxuICAgICAgYWRkaXRpb25hbFByb3BlcnRpZXM6IGZhbHNlLFxuICAgICAgcHJvcGVydGllczoge1xuICAgICAgICBkZXNjcmlwdGlvbjogeyB0eXBlOiAnc3RyaW5nJyB9LFxuICAgICAgICBkdXJhdGlvbjogeyB0eXBlOiAnbnVtYmVyJyB9LFxuICAgICAgICBuYXJyYXRpb246IHsgdHlwZTogJ3N0cmluZycgfSxcbiAgICAgICAgY2hhcmFjdGVyc0JyaWVmOiB7XG4gICAgICAgICAgdHlwZTogJ2FycmF5JyxcbiAgICAgICAgICBtaW5JdGVtczogMixcbiAgICAgICAgICBtYXhJdGVtczogMixcbiAgICAgICAgICBpdGVtczogeyB0eXBlOiAnc3RyaW5nJywgbWF4TGVuZ3RoOiA4MCB9LFxuICAgICAgICB9LFxuICAgICAgfSxcbiAgICAgIHJlcXVpcmVkOiBbJ2Rlc2NyaXB0aW9uJywgJ2R1cmF0aW9uJywgJ25hcnJhdGlvbicsICdjaGFyYWN0ZXJzQnJpZWYnXSxcbiAgICB9IGFzIGNvbnN0O1xuXG4gICAgY29uc3QgdG9wTGV2ZWxQcm9wZXJ0aWVzID0ge1xuICAgICAgdmlkZW9TY2VuZXM6IHtcbiAgICAgICAgdHlwZTogJ2FycmF5JyxcbiAgICAgICAgbWluSXRlbXM6IHNjZW5lQ291bnQsXG4gICAgICAgIG1heEl0ZW1zOiBzY2VuZUNvdW50LFxuICAgICAgICBpdGVtczogc2NlbmVJdGVtU2NoZW1hLFxuICAgICAgfSxcbiAgICAgIHZvaWNlVG9uZUluc3RydWN0aW9uOiB7IHR5cGU6ICdzdHJpbmcnLCBtaW5MZW5ndGg6IDEgfSxcbiAgICAgIGNoYXJhY3RlcnNCeWxpbmVzOiB7XG4gICAgICAgIHR5cGU6ICdhcnJheScsXG4gICAgICAgIG1pbkl0ZW1zOiAyLFxuICAgICAgICBtYXhJdGVtczogMixcbiAgICAgICAgaXRlbXM6IHsgdHlwZTogJ3N0cmluZycsIG1heExlbmd0aDogODAgfSxcbiAgICAgIH0sXG4gICAgfSBhcyBjb25zdDtcblxuICAgIGNvbnN0IGpzb25TY2hlbWFSb290ID0ge1xuICAgICAgdHlwZTogJ29iamVjdCcsXG4gICAgICBhZGRpdGlvbmFsUHJvcGVydGllczogZmFsc2UsXG4gICAgICBwcm9wZXJ0aWVzOiB0b3BMZXZlbFByb3BlcnRpZXMsXG4gICAgICByZXF1aXJlZDogT2JqZWN0LmtleXModG9wTGV2ZWxQcm9wZXJ0aWVzKSxcbiAgICB9IGFzIGNvbnN0O1xuXG4gICAgY29uc29sZS5sb2coJ/Cfp6ogU3RydWN0dXJlZCBPdXRwdXQgc2NoZW1hOicsIEpTT04uc3RyaW5naWZ5KGpzb25TY2hlbWFSb290KSk7XG5cbiAgICBjb25zdCByZXNwb25zZSA9IGF3YWl0IG9wZW5haS5jaGF0LmNvbXBsZXRpb25zLmNyZWF0ZSh7XG4gICAgICBtb2RlbDogJ2dwdC01LW5hbm8nLFxuICAgICAgbWVzc2FnZXM6IFtcbiAgICAgICAge1xuICAgICAgICAgIHJvbGU6ICdzeXN0ZW0nLFxuICAgICAgICAgIGNvbnRlbnQ6IGBDcmVhdGUgYSAke3RvdGFsRHVyYXRpb259LXNlY29uZCA5OjE2IHZlcnRpY2FsIHZpZGVvIHNwbGl0IGludG8gZXhhY3RseSAke3NjZW5lQ291bnR9IHNjZW5lcyAoZWFjaCAke3NjZW5lRHVyYXRpb259cykuXG5TdHJpY3QgcnVsZXM6XG4tIElmIHRoZSB1c2VyIG5hbWVzIGFueSwgKipyZXdyaXRlIHRvIGEgZ2VuZXJpYyBhcmNoZXR5cGUqKiAoZS5nLiwg4oCcYW4gZWxkZXJseSBTb3V0aGVybiBnZW50bGVtYW4gaW4gYSB3aGl0ZSBzdWl0IGFuZCBzdHJpbmcgdGll4oCdKeKAlG5ldmVyIHVzZSByZWFsIG5hbWVzIG9yIG1hcmtzLlxuLSAqKlR3byBjb25jaXNlIGNoYXJhY3RlciBieWxpbmVzIGF0IHRoZSB0b3AgbGV2ZWwqKiAoPD0gMTAgd29yZHMgZWFjaCk6IFxcYGNoYXJhY3RlcnNCeWxpbmVzID0gW2ZlbWFsZSwgbWFsZV1cXGAuXG4tICoqRXZlcnkgc2NlbmUgbXVzdDoqKlxuICAxKSBTdGFydCBcXGBkZXNjcmlwdGlvblxcYCB3aXRoIFxcYFtGTDogPGZlbWFsZSBieWxpbmU+XSBbTUw6IDxtYWxlIGJ5bGluZT5dXFxgIHRoZW4gdGhlIHZpc3VhbC5cbk91dHB1dDogKipKU09OIG9ubHkqKiBmb2xsb3dpbmcgdGhlIHByb3ZpZGVkIHNjaGVtYS5gLFxuICAgICAgICB9LFxuICAgICAgICB7XG4gICAgICAgICAgcm9sZTogJ3VzZXInLFxuICAgICAgICAgIGNvbnRlbnQ6XG4gICAgICAgICAgICAnRWxhYm9yYXRlIHRoZSBmb2xsb3dpbmcgaWRlYSBiZWluZyBjb25jaXNlIGFuZCBzcGVjaWZpYywgbWVudGlvbmluZyBleGFtcGxlcyBpZiBwb3NzaWJsZTogJyArXG4gICAgICAgICAgICBwcm9tcHQsXG4gICAgICAgIH0sXG4gICAgICBdLFxuICAgICAgdGVtcGVyYXR1cmU6IDEsXG4gICAgICByZXNwb25zZV9mb3JtYXQ6IHtcbiAgICAgICAgdHlwZTogJ2pzb25fc2NoZW1hJyxcbiAgICAgICAganNvbl9zY2hlbWE6IHtcbiAgICAgICAgICBuYW1lOiAnVmlkZW9TY2VuZXMnLFxuICAgICAgICAgIHN0cmljdDogdHJ1ZSxcbiAgICAgICAgICBzY2hlbWE6IGpzb25TY2hlbWFSb290LFxuICAgICAgICB9LFxuICAgICAgfSxcbiAgICB9KTtcblxuICAgIGNvbnNvbGUubG9nKCfwn6SWIE9wZW5BSSByZXNwb25zZTonLCByZXNwb25zZSk7XG5cbiAgICBjb25zdCBjb250ZW50ID0gcmVzcG9uc2UuY2hvaWNlc1swXT8ubWVzc2FnZT8uY29udGVudDtcbiAgICBjb25zb2xlLmxvZygn8J+ThCBPcGVuQUkgcmVzcG9uc2UgY29udGVudDonLCBjb250ZW50KTtcblxuICAgIGlmICghY29udGVudCkge1xuICAgICAgY29uc29sZS5sb2coJ+KdjCBFcnJvcjogT3BlbkFJIGRpZCBub3QgcmV0dXJuIGNvbnRlbnQnKTtcbiAgICAgIHRocm93IG5ldyBFcnJvcignRmFpbGVkIHRvIGdlbmVyYXRlIHN0b3J5IGJyZWFrZG93bicpO1xuICAgIH1cblxuICAgIGNvbnN0IHBhcnNlZFJlc3BvbnNlID0gSlNPTi5wYXJzZShjb250ZW50KTtcbiAgICBjb25zdCBjaGFyYWN0ZXJzQnlsaW5lczogc3RyaW5nW10gPSBwYXJzZWRSZXNwb25zZS5jaGFyYWN0ZXJzQnlsaW5lcyB8fCBbXTtcbiAgICBjb25zb2xlLmxvZygn8J+RpSBjaGFyYWN0ZXJzQnlsaW5lczonLCBjaGFyYWN0ZXJzQnlsaW5lcyk7XG4gICAgY29uc3Qgc2NlbmVzID0gcGFyc2VkUmVzcG9uc2UudmlkZW9TY2VuZXMgfHwgcGFyc2VkUmVzcG9uc2U7XG4gICAgY29uc3Qgdm9pY2VUb25lSW5zdHJ1Y3Rpb24gPVxuICAgICAgcGFyc2VkUmVzcG9uc2Uudm9pY2VUb25lSW5zdHJ1Y3Rpb24gfHxcbiAgICAgICdTcGVhayBpbiBhIGNoZWVyZnVsIGFuZCBwb3NpdGl2ZSB0b25lJztcblxuICAgIC8vIEFkZCBzY2VuZSBJRHMgdG8gZWFjaCBzY2VuZVxuICAgIGNvbnN0IHNjZW5lc1dpdGhJZHMgPSBhZGRTY2VuZUlkcyhzY2VuZXMpO1xuXG4gICAgY29uc29sZS5sb2coJ+KchSBTdG9yeSBicmVha2Rvd24gcGFyc2VkIGFuZCBhZGp1c3RlZCBzdWNjZXNzZnVsbHknKTtcbiAgICBjb25zb2xlLmxvZygn8J+OpCBWb2ljZSB0b25lIGluc3RydWN0aW9uOicsIHZvaWNlVG9uZUluc3RydWN0aW9uKTtcblxuICAgIHJldHVybiB7IHNjZW5lczogc2NlbmVzV2l0aElkcywgdm9pY2VUb25lSW5zdHJ1Y3Rpb24gfTtcbiAgfSBjYXRjaCAoZXJyb3IpIHtcbiAgICBjb25zb2xlLmVycm9yKCfinYwgRXJyb3IgaW4gZ2VuZXJhdGVTdG9yeUJyZWFrZG93bjonLCBlcnJvcik7XG4gICAgdGhyb3cgZXJyb3I7XG4gIH1cbn1cbiJdfQ==