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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoic2NyaXB0LmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsic2NyaXB0LnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiI7O0FBa0JBLGtDQU1DO0FBRUQsd0RBZ0lDO0FBMUpELG1DQUE0QjtBQUM1QixrREFBZ0U7QUFFaEUsTUFBTSxFQUFFLEdBQUcsSUFBSSxvQkFBUSxDQUFDLEVBQUUsTUFBTSxFQUFFLE9BQU8sQ0FBQyxHQUFHLENBQUMsVUFBVSxFQUFFLENBQUMsQ0FBQztBQUU1RCxNQUFNLE1BQU0sR0FBRyxJQUFJLGdCQUFNLENBQUMsRUFBRSxNQUFNLEVBQUUsT0FBTyxDQUFDLEdBQUcsQ0FBQyxjQUFjLEVBQUUsQ0FBQyxDQUFDO0FBWWxFLHdDQUF3QztBQUN4QyxTQUFnQixXQUFXLENBQUMsTUFBZTtJQUN6QyxPQUFPLE1BQU0sQ0FBQyxHQUFHLENBQUMsQ0FBQyxLQUFZLEVBQUUsR0FBVyxFQUFFLEVBQUUsQ0FBQyxDQUFDO1FBQ2hELEdBQUcsS0FBSztRQUNSLEVBQUUsRUFBRSxHQUFHO1FBQ1AsYUFBYSxFQUFFLEdBQUc7S0FDbkIsQ0FBQyxDQUFDLENBQUM7QUFDTixDQUFDO0FBRU0sS0FBSyxVQUFVLHNCQUFzQixDQUMxQyxNQUFjLEVBQ2QsVUFBa0IsRUFDbEIsYUFBcUIsRUFDckIsYUFBcUIsRUFDckIsTUFBYyxFQUNkLFNBQWlCO0lBRWpCLE9BQU8sQ0FBQyxHQUFHLENBQUMsMENBQTBDLENBQUMsQ0FBQztJQUN4RCxPQUFPLENBQUMsR0FBRyxDQUNULGtCQUFrQixVQUFVLFlBQVksYUFBYSxnQkFBZ0IsQ0FDdEUsQ0FBQztJQUVGLE9BQU8sQ0FBQyxHQUFHLENBQUMsMEJBQTBCLGFBQWEsZUFBZSxDQUFDLENBQUM7SUFFcEUsT0FBTyxDQUFDLEdBQUcsQ0FBQyxTQUFTLEVBQUUsTUFBTSxDQUFDLENBQUM7SUFFL0IsSUFBSSxDQUFDO1FBQ0gsZ0RBQWdEO1FBQ2hELE1BQU0sR0FBRyxHQUFHLEdBQUcsQ0FBQztRQUVoQixNQUFN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O1FBRXBELElBQUksQ0FBQyxPQUFPLEVBQUUsQ0FBQztZQUNiLE9BQU8sQ0FBQyxHQUFHLENBQUMsd0NBQXdDLENBQUMsQ0FBQztZQUN0RCxNQUFNLElBQUksS0FBSyxDQUFDLG9DQUFvQyxDQUFDLENBQUM7UUFDeEQsQ0FBQztRQUVELE1BQU0sY0FBYyxHQUFHLElBQUksQ0FBQyxLQUFLLENBQUMsT0FBTyxDQUFDLENBQUM7UUFDM0MsTUFBTSxpQkFBaUIsR0FBYSxjQUFjLENBQUMsaUJBQWlCLElBQUksRUFBRSxDQUFDO1FBQzNFLE9BQU8sQ0FBQyxHQUFHLENBQUMsdUJBQXVCLEVBQUUsaUJBQWlCLENBQUMsQ0FBQztRQUN4RCxNQUFNLE1BQU0sR0FBRyxjQUFjLENBQUMsV0FBVyxJQUFJLGNBQWMsQ0FBQztRQUM1RCxNQUFNLG9CQUFvQixHQUN4QixjQUFjLENBQUMsb0JBQW9CO1lBQ25DLHVDQUF1QyxDQUFDO1FBRTFDLDhCQUE4QjtRQUM5QixNQUFNLGFBQWEsR0FBRyxXQUFXLENBQUMsTUFBTSxDQUFDLENBQUM7UUFFMUMsT0FBTyxDQUFDLEdBQUcsQ0FBQyxvREFBb0QsQ0FBQyxDQUFDO1FBQ2xFLE9BQU8sQ0FBQyxHQUFHLENBQUMsNEJBQTRCLEVBQUUsb0JBQW9CLENBQUMsQ0FBQztRQUVoRSxPQUFPLEVBQUUsTUFBTSxFQUFFLGFBQWEsRUFBRSxvQkFBb0IsRUFBRSxDQUFDO0lBQ3pELENBQUM7SUFBQyxPQUFPLEtBQUssRUFBRSxDQUFDO1FBQ2YsT0FBTyxDQUFDLEtBQUssQ0FBQyxvQ0FBb0MsRUFBRSxLQUFLLENBQUMsQ0FBQztRQUMzRCxNQUFNLEtBQUssQ0FBQztJQUNkLENBQUM7QUFDSCxDQUFDIiwic291cmNlc0NvbnRlbnQiOlsiaW1wb3J0IE9wZW5BSSBmcm9tICdvcGVuYWknO1xuaW1wb3J0IHsgUzNDbGllbnQsIFB1dE9iamVjdENvbW1hbmQgfSBmcm9tICdAYXdzLXNkay9jbGllbnQtczMnO1xuXG5jb25zdCBzMyA9IG5ldyBTM0NsaWVudCh7IHJlZ2lvbjogcHJvY2Vzcy5lbnYuQVdTX1JFR0lPTiB9KTtcblxuY29uc3Qgb3BlbmFpID0gbmV3IE9wZW5BSSh7IGFwaUtleTogcHJvY2Vzcy5lbnYuT1BFTkFJX0FQSV9LRVkgfSk7XG5cbmV4cG9ydCBpbnRlcmZhY2UgU2NlbmUge1xuICBkZXNjcmlwdGlvbjogc3RyaW5nO1xuICBkdXJhdGlvbjogbnVtYmVyO1xuICBuYXJyYXRpb246IHN0cmluZztcbiAgaWQ6IG51bWJlcjtcbiAgc2NlbmVQb3NpdGlvbjogbnVtYmVyO1xuICAvKiogVHdvIHNob3J0IGJ5bGluZXMgcmVwZWF0ZWQgZXZlcnkgc2NlbmUsIGUuZy4sIFtcImJsb25kZSBTd2lzcyB3b21hbiwgZ3JlZW4tYmx1ZSBleWVzXCIsIFwibXVzY3VsYXIgQnJhemlsaWFuIG1hbiB3aXRoIG11c3RhY2hlXCJdICovXG4gIGNoYXJhY3RlcnNCcmllZj86IHN0cmluZ1tdO1xufVxuXG4vLyBVdGlsaXR5IGZ1bmN0aW9uIHRvIGFkZCBJRHMgdG8gc2NlbmVzXG5leHBvcnQgZnVuY3Rpb24gYWRkU2NlbmVJZHMoc2NlbmVzOiBTY2VuZVtdKTogU2NlbmVbXSB7XG4gIHJldHVybiBzY2VuZXMubWFwKChzY2VuZTogU2NlbmUsIGlkeDogbnVtYmVyKSA9PiAoe1xuICAgIC4uLnNjZW5lLFxuICAgIGlkOiBpZHgsXG4gICAgc2NlbmVQb3NpdGlvbjogaWR4LFxuICB9KSk7XG59XG5cbmV4cG9ydCBhc3luYyBmdW5jdGlvbiBnZW5lcmF0ZVN0b3J5QnJlYWtkb3duKFxuICBwcm9tcHQ6IHN0cmluZyxcbiAgc2NlbmVDb3VudDogbnVtYmVyLFxuICBzY2VuZUR1cmF0aW9uOiBudW1iZXIsXG4gIHRvdGFsRHVyYXRpb246IG51bWJlcixcbiAgdXNlcklkOiBzdHJpbmcsXG4gIHRpbWVzdGFtcDogc3RyaW5nLFxuKTogUHJvbWlzZTx7IHNjZW5lczogU2NlbmVbXTsgdm9pY2VUb25lSW5zdHJ1Y3Rpb246IHN0cmluZyB9PiB7XG4gIGNvbnNvbGUubG9nKCfwn6SWIENhbGxpbmcgT3BlbkFJIGZvciBzdG9yeSBicmVha2Rvd24uLi4nKTtcbiAgY29uc29sZS5sb2coXG4gICAgYPCfk4ogUGFyYW1ldGVyczogJHtzY2VuZUNvdW50fSBzY2VuZXMsICR7dG90YWxEdXJhdGlvbn0gc2Vjb25kcyB0b3RhbGAsXG4gICk7XG5cbiAgY29uc29sZS5sb2coYOKPse+4jyAgRWFjaCBzY2VuZSB3aWxsIGJlICR7c2NlbmVEdXJhdGlvbn0gc2Vjb25kcyBsb25nYCk7XG5cbiAgY29uc29sZS5sb2coJ3Byb21wdDonLCBwcm9tcHQpO1xuXG4gIHRyeSB7XG4gICAgLy8gR3VpZGFuY2UgZm9yIG5hcnJhdGlvbiBwYWNpbmcgYW5kIHNhZmV0eSBjYXBzXG4gICAgY29uc3QgV1BTID0gMi4yO1xuXG4gICAgY29uc3QgbWF4V29yZHNQZXJTY2VuZSA9IE1hdGguZmxvb3Ioc2NlbmVEdXJhdGlvbiAqIFdQUyk7XG4gICAgY29uc29sZS5sb2coJ21heFdvcmRzUGVyU2NlbmU6JywgbWF4V29yZHNQZXJTY2VuZSk7XG4gICAgY29uc3QgbWF4VG90YWxXb3JkcyA9IE1hdGguZmxvb3IodG90YWxEdXJhdGlvbiAqIFdQUyk7XG5cbiAgICAvLyBCdWlsZCBzY2hlbWEgcHJvZ3JhbW1hdGljYWxseSBzbyBgcmVxdWlyZWRgIGFsd2F5cyBtYXRjaGVzIGBwcm9wZXJ0aWVzYFxuICAgIGNvbnN0IHNjZW5lSXRlbVNjaGVtYSA9IHtcbiAgICAgIHR5cGU6ICdvYmplY3QnLFxuICAgICAgYWRkaXRpb25hbFByb3BlcnRpZXM6IGZhbHNlLFxuICAgICAgcHJvcGVydGllczoge1xuICAgICAgICBkZXNjcmlwdGlvbjogeyB0eXBlOiAnc3RyaW5nJyB9LFxuICAgICAgICBkdXJhdGlvbjogeyB0eXBlOiAnbnVtYmVyJyB9LFxuICAgICAgICBuYXJyYXRpb246IHsgdHlwZTogJ3N0cmluZycgfSxcbiAgICAgICAgY2hhcmFjdGVyc0JyaWVmOiB7XG4gICAgICAgICAgdHlwZTogJ2FycmF5JyxcbiAgICAgICAgICBtaW5JdGVtczogMixcbiAgICAgICAgICBtYXhJdGVtczogMixcbiAgICAgICAgICBpdGVtczogeyB0eXBlOiAnc3RyaW5nJywgbWF4TGVuZ3RoOiA4MCB9LFxuICAgICAgICB9LFxuICAgICAgfSxcbiAgICAgIHJlcXVpcmVkOiBbJ2Rlc2NyaXB0aW9uJywgJ2R1cmF0aW9uJywgJ25hcnJhdGlvbicsICdjaGFyYWN0ZXJzQnJpZWYnXSxcbiAgICB9IGFzIGNvbnN0O1xuXG4gICAgY29uc3QgdG9wTGV2ZWxQcm9wZXJ0aWVzID0ge1xuICAgICAgdmlkZW9TY2VuZXM6IHtcbiAgICAgICAgdHlwZTogJ2FycmF5JyxcbiAgICAgICAgbWluSXRlbXM6IHNjZW5lQ291bnQsXG4gICAgICAgIG1heEl0ZW1zOiBzY2VuZUNvdW50LFxuICAgICAgICBpdGVtczogc2NlbmVJdGVtU2NoZW1hLFxuICAgICAgfSxcbiAgICAgIHZvaWNlVG9uZUluc3RydWN0aW9uOiB7IHR5cGU6ICdzdHJpbmcnLCBtaW5MZW5ndGg6IDEgfSxcbiAgICAgIGNoYXJhY3RlcnNCeWxpbmVzOiB7XG4gICAgICAgIHR5cGU6ICdhcnJheScsXG4gICAgICAgIG1pbkl0ZW1zOiAyLFxuICAgICAgICBtYXhJdGVtczogMixcbiAgICAgICAgaXRlbXM6IHsgdHlwZTogJ3N0cmluZycsIG1heExlbmd0aDogODAgfSxcbiAgICAgIH0sXG4gICAgfSBhcyBjb25zdDtcblxuICAgIGNvbnN0IGpzb25TY2hlbWFSb290ID0ge1xuICAgICAgdHlwZTogJ29iamVjdCcsXG4gICAgICBhZGRpdGlvbmFsUHJvcGVydGllczogZmFsc2UsXG4gICAgICBwcm9wZXJ0aWVzOiB0b3BMZXZlbFByb3BlcnRpZXMsXG4gICAgICByZXF1aXJlZDogT2JqZWN0LmtleXModG9wTGV2ZWxQcm9wZXJ0aWVzKSxcbiAgICB9IGFzIGNvbnN0O1xuXG4gICAgY29uc29sZS5sb2coJ/Cfp6ogU3RydWN0dXJlZCBPdXRwdXQgc2NoZW1hOicsIEpTT04uc3RyaW5naWZ5KGpzb25TY2hlbWFSb290KSk7XG5cbiAgICBjb25zdCByZXNwb25zZSA9IGF3YWl0IG9wZW5haS5jaGF0LmNvbXBsZXRpb25zLmNyZWF0ZSh7XG4gICAgICBtb2RlbDogJ2dwdC01LW5hbm8nLFxuICAgICAgbWVzc2FnZXM6IFtcbiAgICAgICAge1xuICAgICAgICAgIHJvbGU6ICdzeXN0ZW0nLFxuICAgICAgICAgIGNvbnRlbnQ6IGBZb3UgYXJlIGEgc2hvcnQtZm9ybSB2aWRlbyBzY3JpcHR3cml0ZXIgZm9yIFRpa1Rvay9SZWVscy9TaG9ydHMuXG5DcmVhdGUgYSAke3RvdGFsRHVyYXRpb259LXNlY29uZCA5OjE2IHZlcnRpY2FsIHZpZGVvIHNwbGl0IGludG8gZXhhY3RseSAke3NjZW5lQ291bnR9IHNjZW5lcyAoZWFjaCAke3NjZW5lRHVyYXRpb259cykuXG5cblN0cmljdCBydWxlczpcbi0gKipObyBicmFuZHMsIGxvZ29zLCB0cmFkZW1hcmtzLCBwdWJsaWMgZmlndXJlcywgbWFzY290cywgb3IgY2VsZWJyaXR5IGxpa2VuZXNzZXMuKiogSWYgdGhlIHVzZXIgbmFtZXMgYW55LCAqKnJld3JpdGUgdG8gYSBnZW5lcmljIGFyY2hldHlwZSoqIChlLmcuLCDigJxhbiBlbGRlcmx5IFNvdXRoZXJuIGdlbnRsZW1hbiBpbiBhIHdoaXRlIHN1aXQgYW5kIHN0cmluZyB0aWXigJ0p4oCUbmV2ZXIgdXNlIHJlYWwgbmFtZXMgb3IgbWFya3MuXG4tICoqVHdvIGNvbmNpc2UgY2hhcmFjdGVyIGJ5bGluZXMgYXQgdGhlIHRvcCBsZXZlbCoqICg8PSAxMCB3b3JkcyBlYWNoKTogXFxgY2hhcmFjdGVyc0J5bGluZXMgPSBbZmVtYWxlLCBtYWxlXVxcYC5cbi0gKipFdmVyeSBzY2VuZSBtdXN0OioqXG4gIDEpIFN0YXJ0IFxcYGRlc2NyaXB0aW9uXFxgIHdpdGggXFxgW0ZMOiA8ZmVtYWxlIGJ5bGluZT5dIFtNTDogPG1hbGUgYnlsaW5lPl1cXGAgdGhlbiB0aGUgdmlzdWFsLlxuT3V0cHV0OiAqKkpTT04gb25seSoqIGZvbGxvd2luZyB0aGUgcHJvdmlkZWQgc2NoZW1hLmAsXG4gICAgICAgIH0sXG4gICAgICAgIHtcbiAgICAgICAgICByb2xlOiAndXNlcicsXG4gICAgICAgICAgY29udGVudDogcHJvbXB0LFxuICAgICAgICB9LFxuICAgICAgXSxcbiAgICAgIHRlbXBlcmF0dXJlOiAxLFxuICAgICAgcmVzcG9uc2VfZm9ybWF0OiB7XG4gICAgICAgIHR5cGU6ICdqc29uX3NjaGVtYScsXG4gICAgICAgIGpzb25fc2NoZW1hOiB7XG4gICAgICAgICAgbmFtZTogJ1ZpZGVvU2NlbmVzJyxcbiAgICAgICAgICBzdHJpY3Q6IHRydWUsXG4gICAgICAgICAgc2NoZW1hOiBqc29uU2NoZW1hUm9vdCxcbiAgICAgICAgfSxcbiAgICAgIH0sXG4gICAgfSk7XG5cbiAgICBjb25zb2xlLmxvZygn8J+kliBPcGVuQUkgcmVzcG9uc2U6JywgcmVzcG9uc2UpO1xuXG4gICAgY29uc3QgY29udGVudCA9IHJlc3BvbnNlLmNob2ljZXNbMF0/Lm1lc3NhZ2U/LmNvbnRlbnQ7XG4gICAgY29uc29sZS5sb2coJ/Cfk4QgT3BlbkFJIHJlc3BvbnNlIGNvbnRlbnQ6JywgY29udGVudCk7XG5cbiAgICBpZiAoIWNvbnRlbnQpIHtcbiAgICAgIGNvbnNvbGUubG9nKCfinYwgRXJyb3I6IE9wZW5BSSBkaWQgbm90IHJldHVybiBjb250ZW50Jyk7XG4gICAgICB0aHJvdyBuZXcgRXJyb3IoJ0ZhaWxlZCB0byBnZW5lcmF0ZSBzdG9yeSBicmVha2Rvd24nKTtcbiAgICB9XG5cbiAgICBjb25zdCBwYXJzZWRSZXNwb25zZSA9IEpTT04ucGFyc2UoY29udGVudCk7XG4gICAgY29uc3QgY2hhcmFjdGVyc0J5bGluZXM6IHN0cmluZ1tdID0gcGFyc2VkUmVzcG9uc2UuY2hhcmFjdGVyc0J5bGluZXMgfHwgW107XG4gICAgY29uc29sZS5sb2coJ/CfkaUgY2hhcmFjdGVyc0J5bGluZXM6JywgY2hhcmFjdGVyc0J5bGluZXMpO1xuICAgIGNvbnN0IHNjZW5lcyA9IHBhcnNlZFJlc3BvbnNlLnZpZGVvU2NlbmVzIHx8IHBhcnNlZFJlc3BvbnNlO1xuICAgIGNvbnN0IHZvaWNlVG9uZUluc3RydWN0aW9uID1cbiAgICAgIHBhcnNlZFJlc3BvbnNlLnZvaWNlVG9uZUluc3RydWN0aW9uIHx8XG4gICAgICAnU3BlYWsgaW4gYSBjaGVlcmZ1bCBhbmQgcG9zaXRpdmUgdG9uZSc7XG5cbiAgICAvLyBBZGQgc2NlbmUgSURzIHRvIGVhY2ggc2NlbmVcbiAgICBjb25zdCBzY2VuZXNXaXRoSWRzID0gYWRkU2NlbmVJZHMoc2NlbmVzKTtcblxuICAgIGNvbnNvbGUubG9nKCfinIUgU3RvcnkgYnJlYWtkb3duIHBhcnNlZCBhbmQgYWRqdXN0ZWQgc3VjY2Vzc2Z1bGx5Jyk7XG4gICAgY29uc29sZS5sb2coJ/CfjqQgVm9pY2UgdG9uZSBpbnN0cnVjdGlvbjonLCB2b2ljZVRvbmVJbnN0cnVjdGlvbik7XG5cbiAgICByZXR1cm4geyBzY2VuZXM6IHNjZW5lc1dpdGhJZHMsIHZvaWNlVG9uZUluc3RydWN0aW9uIH07XG4gIH0gY2F0Y2ggKGVycm9yKSB7XG4gICAgY29uc29sZS5lcnJvcign4p2MIEVycm9yIGluIGdlbmVyYXRlU3RvcnlCcmVha2Rvd246JywgZXJyb3IpO1xuICAgIHRocm93IGVycm9yO1xuICB9XG59XG4iXX0=