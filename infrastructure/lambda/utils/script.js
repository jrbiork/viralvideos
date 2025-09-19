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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoic2NyaXB0LmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsic2NyaXB0LnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiI7O0FBbUJBLGtDQU1DO0FBRUQsd0RBZ0lDO0FBM0pELG1DQUE0QjtBQUM1QixrREFBZ0U7QUFFaEUsTUFBTSxFQUFFLEdBQUcsSUFBSSxvQkFBUSxDQUFDLEVBQUUsTUFBTSxFQUFFLE9BQU8sQ0FBQyxHQUFHLENBQUMsVUFBVSxFQUFFLENBQUMsQ0FBQztBQUU1RCxNQUFNLE1BQU0sR0FBRyxJQUFJLGdCQUFNLENBQUMsRUFBRSxNQUFNLEVBQUUsT0FBTyxDQUFDLEdBQUcsQ0FBQyxjQUFjLEVBQUUsQ0FBQyxDQUFDO0FBYWxFLHdDQUF3QztBQUN4QyxTQUFnQixXQUFXLENBQUMsTUFBZTtJQUN6QyxPQUFPLE1BQU0sQ0FBQyxHQUFHLENBQUMsQ0FBQyxLQUFZLEVBQUUsR0FBVyxFQUFFLEVBQUUsQ0FBQyxDQUFDO1FBQ2hELEdBQUcsS0FBSztRQUNSLEVBQUUsRUFBRSxHQUFHO1FBQ1AsYUFBYSxFQUFFLEdBQUc7S0FDbkIsQ0FBQyxDQUFDLENBQUM7QUFDTixDQUFDO0FBRU0sS0FBSyxVQUFVLHNCQUFzQixDQUMxQyxNQUFjLEVBQ2QsVUFBa0IsRUFDbEIsYUFBcUIsRUFDckIsYUFBcUIsRUFDckIsTUFBYyxFQUNkLFNBQWlCO0lBRWpCLE9BQU8sQ0FBQyxHQUFHLENBQUMsMENBQTBDLENBQUMsQ0FBQztJQUN4RCxPQUFPLENBQUMsR0FBRyxDQUNULGtCQUFrQixVQUFVLFlBQVksYUFBYSxnQkFBZ0IsQ0FDdEUsQ0FBQztJQUVGLE9BQU8sQ0FBQyxHQUFHLENBQUMsMEJBQTBCLGFBQWEsZUFBZSxDQUFDLENBQUM7SUFFcEUsT0FBTyxDQUFDLEdBQUcsQ0FBQyxTQUFTLEVBQUUsTUFBTSxDQUFDLENBQUM7SUFFL0IsSUFBSSxDQUFDO1FBQ0gsZ0RBQWdEO1FBQ2hELE1BQU0sR0FBRyxHQUFHLEdBQUcsQ0FBQztRQUVoQixNQUFN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O1FBRXBELElBQUksQ0FBQyxPQUFPLEVBQUUsQ0FBQztZQUNiLE9BQU8sQ0FBQyxHQUFHLENBQUMsd0NBQXdDLENBQUMsQ0FBQztZQUN0RCxNQUFNLElBQUksS0FBSyxDQUFDLG9DQUFvQyxDQUFDLENBQUM7UUFDeEQsQ0FBQztRQUVELE1BQU0sY0FBYyxHQUFHLElBQUksQ0FBQyxLQUFLLENBQUMsT0FBTyxDQUFDLENBQUM7UUFDM0MsTUFBTSxpQkFBaUIsR0FBYSxjQUFjLENBQUMsaUJBQWlCLElBQUksRUFBRSxDQUFDO1FBQzNFLE9BQU8sQ0FBQyxHQUFHLENBQUMsdUJBQXVCLEVBQUUsaUJBQWlCLENBQUMsQ0FBQztRQUN4RCxNQUFNLE1BQU0sR0FBRyxjQUFjLENBQUMsV0FBVyxJQUFJLGNBQWMsQ0FBQztRQUM1RCxNQUFNLG9CQUFvQixHQUN4QixjQUFjLENBQUMsb0JBQW9CO1lBQ25DLHVDQUF1QyxDQUFDO1FBRTFDLDhCQUE4QjtRQUM5QixNQUFNLGFBQWEsR0FBRyxXQUFXLENBQUMsTUFBTSxDQUFDLENBQUM7UUFFMUMsT0FBTyxDQUFDLEdBQUcsQ0FBQyxvREFBb0QsQ0FBQyxDQUFDO1FBQ2xFLE9BQU8sQ0FBQyxHQUFHLENBQUMsNEJBQTRCLEVBQUUsb0JBQW9CLENBQUMsQ0FBQztRQUVoRSxPQUFPLEVBQUUsTUFBTSxFQUFFLGFBQWEsRUFBRSxvQkFBb0IsRUFBRSxDQUFDO0lBQ3pELENBQUM7SUFBQyxPQUFPLEtBQUssRUFBRSxDQUFDO1FBQ2YsT0FBTyxDQUFDLEtBQUssQ0FBQyxvQ0FBb0MsRUFBRSxLQUFLLENBQUMsQ0FBQztRQUMzRCxNQUFNLEtBQUssQ0FBQztJQUNkLENBQUM7QUFDSCxDQUFDIiwic291cmNlc0NvbnRlbnQiOlsiaW1wb3J0IE9wZW5BSSBmcm9tICdvcGVuYWknO1xuaW1wb3J0IHsgUzNDbGllbnQsIFB1dE9iamVjdENvbW1hbmQgfSBmcm9tICdAYXdzLXNkay9jbGllbnQtczMnO1xuXG5jb25zdCBzMyA9IG5ldyBTM0NsaWVudCh7IHJlZ2lvbjogcHJvY2Vzcy5lbnYuQVdTX1JFR0lPTiB9KTtcblxuY29uc3Qgb3BlbmFpID0gbmV3IE9wZW5BSSh7IGFwaUtleTogcHJvY2Vzcy5lbnYuT1BFTkFJX0FQSV9LRVkgfSk7XG5cbmV4cG9ydCBpbnRlcmZhY2UgU2NlbmUge1xuICBkZXNjcmlwdGlvbjogc3RyaW5nO1xuICBkdXJhdGlvbjogbnVtYmVyO1xuICBuYXJyYXRpb246IHN0cmluZztcbiAgaWQ6IG51bWJlcjtcbiAgc2NlbmVQb3NpdGlvbjogbnVtYmVyO1xuICAvKiogVHdvIHNob3J0IGJ5bGluZXMgcmVwZWF0ZWQgZXZlcnkgc2NlbmUsIGUuZy4sIFtcImJsb25kZSBTd2lzcyB3b21hbiwgZ3JlZW4tYmx1ZSBleWVzXCIsIFwibXVzY3VsYXIgQnJhemlsaWFuIG1hbiB3aXRoIG11c3RhY2hlXCJdICovXG4gIGNoYXJhY3RlcnNCcmllZj86IHN0cmluZ1tdO1xuICBhbmltYXRlZDogYm9vbGVhbjtcbn1cblxuLy8gVXRpbGl0eSBmdW5jdGlvbiB0byBhZGQgSURzIHRvIHNjZW5lc1xuZXhwb3J0IGZ1bmN0aW9uIGFkZFNjZW5lSWRzKHNjZW5lczogU2NlbmVbXSk6IFNjZW5lW10ge1xuICByZXR1cm4gc2NlbmVzLm1hcCgoc2NlbmU6IFNjZW5lLCBpZHg6IG51bWJlcikgPT4gKHtcbiAgICAuLi5zY2VuZSxcbiAgICBpZDogaWR4LFxuICAgIHNjZW5lUG9zaXRpb246IGlkeCxcbiAgfSkpO1xufVxuXG5leHBvcnQgYXN5bmMgZnVuY3Rpb24gZ2VuZXJhdGVTdG9yeUJyZWFrZG93bihcbiAgcHJvbXB0OiBzdHJpbmcsXG4gIHNjZW5lQ291bnQ6IG51bWJlcixcbiAgc2NlbmVEdXJhdGlvbjogbnVtYmVyLFxuICB0b3RhbER1cmF0aW9uOiBudW1iZXIsXG4gIHVzZXJJZDogc3RyaW5nLFxuICB0aW1lc3RhbXA6IHN0cmluZyxcbik6IFByb21pc2U8eyBzY2VuZXM6IFNjZW5lW107IHZvaWNlVG9uZUluc3RydWN0aW9uOiBzdHJpbmcgfT4ge1xuICBjb25zb2xlLmxvZygn8J+kliBDYWxsaW5nIE9wZW5BSSBmb3Igc3RvcnkgYnJlYWtkb3duLi4uJyk7XG4gIGNvbnNvbGUubG9nKFxuICAgIGDwn5OKIFBhcmFtZXRlcnM6ICR7c2NlbmVDb3VudH0gc2NlbmVzLCAke3RvdGFsRHVyYXRpb259IHNlY29uZHMgdG90YWxgLFxuICApO1xuXG4gIGNvbnNvbGUubG9nKGDij7HvuI8gIEVhY2ggc2NlbmUgd2lsbCBiZSAke3NjZW5lRHVyYXRpb259IHNlY29uZHMgbG9uZ2ApO1xuXG4gIGNvbnNvbGUubG9nKCdwcm9tcHQ6JywgcHJvbXB0KTtcblxuICB0cnkge1xuICAgIC8vIEd1aWRhbmNlIGZvciBuYXJyYXRpb24gcGFjaW5nIGFuZCBzYWZldHkgY2Fwc1xuICAgIGNvbnN0IFdQUyA9IDIuMjtcblxuICAgIGNvbnN0IG1heFdvcmRzUGVyU2NlbmUgPSBNYXRoLmZsb29yKHNjZW5lRHVyYXRpb24gKiBXUFMpO1xuICAgIGNvbnNvbGUubG9nKCdtYXhXb3Jkc1BlclNjZW5lOicsIG1heFdvcmRzUGVyU2NlbmUpO1xuICAgIGNvbnN0IG1heFRvdGFsV29yZHMgPSBNYXRoLmZsb29yKHRvdGFsRHVyYXRpb24gKiBXUFMpO1xuXG4gICAgLy8gQnVpbGQgc2NoZW1hIHByb2dyYW1tYXRpY2FsbHkgc28gYHJlcXVpcmVkYCBhbHdheXMgbWF0Y2hlcyBgcHJvcGVydGllc2BcbiAgICBjb25zdCBzY2VuZUl0ZW1TY2hlbWEgPSB7XG4gICAgICB0eXBlOiAnb2JqZWN0JyxcbiAgICAgIGFkZGl0aW9uYWxQcm9wZXJ0aWVzOiBmYWxzZSxcbiAgICAgIHByb3BlcnRpZXM6IHtcbiAgICAgICAgZGVzY3JpcHRpb246IHsgdHlwZTogJ3N0cmluZycgfSxcbiAgICAgICAgZHVyYXRpb246IHsgdHlwZTogJ251bWJlcicgfSxcbiAgICAgICAgbmFycmF0aW9uOiB7IHR5cGU6ICdzdHJpbmcnIH0sXG4gICAgICAgIGNoYXJhY3RlcnNCcmllZjoge1xuICAgICAgICAgIHR5cGU6ICdhcnJheScsXG4gICAgICAgICAgbWluSXRlbXM6IDIsXG4gICAgICAgICAgbWF4SXRlbXM6IDIsXG4gICAgICAgICAgaXRlbXM6IHsgdHlwZTogJ3N0cmluZycsIG1heExlbmd0aDogODAgfSxcbiAgICAgICAgfSxcbiAgICAgIH0sXG4gICAgICByZXF1aXJlZDogWydkZXNjcmlwdGlvbicsICdkdXJhdGlvbicsICduYXJyYXRpb24nLCAnY2hhcmFjdGVyc0JyaWVmJ10sXG4gICAgfSBhcyBjb25zdDtcblxuICAgIGNvbnN0IHRvcExldmVsUHJvcGVydGllcyA9IHtcbiAgICAgIHZpZGVvU2NlbmVzOiB7XG4gICAgICAgIHR5cGU6ICdhcnJheScsXG4gICAgICAgIG1pbkl0ZW1zOiBzY2VuZUNvdW50LFxuICAgICAgICBtYXhJdGVtczogc2NlbmVDb3VudCxcbiAgICAgICAgaXRlbXM6IHNjZW5lSXRlbVNjaGVtYSxcbiAgICAgIH0sXG4gICAgICB2b2ljZVRvbmVJbnN0cnVjdGlvbjogeyB0eXBlOiAnc3RyaW5nJywgbWluTGVuZ3RoOiAxIH0sXG4gICAgICBjaGFyYWN0ZXJzQnlsaW5lczoge1xuICAgICAgICB0eXBlOiAnYXJyYXknLFxuICAgICAgICBtaW5JdGVtczogMixcbiAgICAgICAgbWF4SXRlbXM6IDIsXG4gICAgICAgIGl0ZW1zOiB7IHR5cGU6ICdzdHJpbmcnLCBtYXhMZW5ndGg6IDgwIH0sXG4gICAgICB9LFxuICAgIH0gYXMgY29uc3Q7XG5cbiAgICBjb25zdCBqc29uU2NoZW1hUm9vdCA9IHtcbiAgICAgIHR5cGU6ICdvYmplY3QnLFxuICAgICAgYWRkaXRpb25hbFByb3BlcnRpZXM6IGZhbHNlLFxuICAgICAgcHJvcGVydGllczogdG9wTGV2ZWxQcm9wZXJ0aWVzLFxuICAgICAgcmVxdWlyZWQ6IE9iamVjdC5rZXlzKHRvcExldmVsUHJvcGVydGllcyksXG4gICAgfSBhcyBjb25zdDtcblxuICAgIGNvbnNvbGUubG9nKCfwn6eqIFN0cnVjdHVyZWQgT3V0cHV0IHNjaGVtYTonLCBKU09OLnN0cmluZ2lmeShqc29uU2NoZW1hUm9vdCkpO1xuXG4gICAgY29uc3QgcmVzcG9uc2UgPSBhd2FpdCBvcGVuYWkuY2hhdC5jb21wbGV0aW9ucy5jcmVhdGUoe1xuICAgICAgbW9kZWw6ICdncHQtNS1uYW5vJyxcbiAgICAgIG1lc3NhZ2VzOiBbXG4gICAgICAgIHtcbiAgICAgICAgICByb2xlOiAnc3lzdGVtJyxcbiAgICAgICAgICBjb250ZW50OiBgWW91IGFyZSBhIHNob3J0LWZvcm0gdmlkZW8gc2NyaXB0d3JpdGVyIGZvciBUaWtUb2svUmVlbHMvU2hvcnRzLlxuQ3JlYXRlIGEgJHt0b3RhbER1cmF0aW9ufS1zZWNvbmQgOToxNiB2ZXJ0aWNhbCB2aWRlbyBzcGxpdCBpbnRvIGV4YWN0bHkgJHtzY2VuZUNvdW50fSBzY2VuZXMgKGVhY2ggJHtzY2VuZUR1cmF0aW9ufXMpLlxuXG5TdHJpY3QgcnVsZXM6XG4tICoqTm8gYnJhbmRzLCBsb2dvcywgdHJhZGVtYXJrcywgcHVibGljIGZpZ3VyZXMsIG1hc2NvdHMsIG9yIGNlbGVicml0eSBsaWtlbmVzc2VzLioqIElmIHRoZSB1c2VyIG5hbWVzIGFueSwgKipyZXdyaXRlIHRvIGEgZ2VuZXJpYyBhcmNoZXR5cGUqKiAoZS5nLiwg4oCcYW4gZWxkZXJseSBTb3V0aGVybiBnZW50bGVtYW4gaW4gYSB3aGl0ZSBzdWl0IGFuZCBzdHJpbmcgdGll4oCdKeKAlG5ldmVyIHVzZSByZWFsIG5hbWVzIG9yIG1hcmtzLlxuLSAqKlR3byBjb25jaXNlIGNoYXJhY3RlciBieWxpbmVzIGF0IHRoZSB0b3AgbGV2ZWwqKiAoPD0gMTAgd29yZHMgZWFjaCk6IFxcYGNoYXJhY3RlcnNCeWxpbmVzID0gW2ZlbWFsZSwgbWFsZV1cXGAuXG4tICoqRXZlcnkgc2NlbmUgbXVzdDoqKlxuICAxKSBTdGFydCBcXGBkZXNjcmlwdGlvblxcYCB3aXRoIFxcYFtGTDogPGZlbWFsZSBieWxpbmU+XSBbTUw6IDxtYWxlIGJ5bGluZT5dXFxgIHRoZW4gdGhlIHZpc3VhbC5cbk91dHB1dDogKipKU09OIG9ubHkqKiBmb2xsb3dpbmcgdGhlIHByb3ZpZGVkIHNjaGVtYS5gLFxuICAgICAgICB9LFxuICAgICAgICB7XG4gICAgICAgICAgcm9sZTogJ3VzZXInLFxuICAgICAgICAgIGNvbnRlbnQ6IHByb21wdCxcbiAgICAgICAgfSxcbiAgICAgIF0sXG4gICAgICB0ZW1wZXJhdHVyZTogMSxcbiAgICAgIHJlc3BvbnNlX2Zvcm1hdDoge1xuICAgICAgICB0eXBlOiAnanNvbl9zY2hlbWEnLFxuICAgICAgICBqc29uX3NjaGVtYToge1xuICAgICAgICAgIG5hbWU6ICdWaWRlb1NjZW5lcycsXG4gICAgICAgICAgc3RyaWN0OiB0cnVlLFxuICAgICAgICAgIHNjaGVtYToganNvblNjaGVtYVJvb3QsXG4gICAgICAgIH0sXG4gICAgICB9LFxuICAgIH0pO1xuXG4gICAgY29uc29sZS5sb2coJ/CfpJYgT3BlbkFJIHJlc3BvbnNlOicsIHJlc3BvbnNlKTtcblxuICAgIGNvbnN0IGNvbnRlbnQgPSByZXNwb25zZS5jaG9pY2VzWzBdPy5tZXNzYWdlPy5jb250ZW50O1xuICAgIGNvbnNvbGUubG9nKCfwn5OEIE9wZW5BSSByZXNwb25zZSBjb250ZW50OicsIGNvbnRlbnQpO1xuXG4gICAgaWYgKCFjb250ZW50KSB7XG4gICAgICBjb25zb2xlLmxvZygn4p2MIEVycm9yOiBPcGVuQUkgZGlkIG5vdCByZXR1cm4gY29udGVudCcpO1xuICAgICAgdGhyb3cgbmV3IEVycm9yKCdGYWlsZWQgdG8gZ2VuZXJhdGUgc3RvcnkgYnJlYWtkb3duJyk7XG4gICAgfVxuXG4gICAgY29uc3QgcGFyc2VkUmVzcG9uc2UgPSBKU09OLnBhcnNlKGNvbnRlbnQpO1xuICAgIGNvbnN0IGNoYXJhY3RlcnNCeWxpbmVzOiBzdHJpbmdbXSA9IHBhcnNlZFJlc3BvbnNlLmNoYXJhY3RlcnNCeWxpbmVzIHx8IFtdO1xuICAgIGNvbnNvbGUubG9nKCfwn5GlIGNoYXJhY3RlcnNCeWxpbmVzOicsIGNoYXJhY3RlcnNCeWxpbmVzKTtcbiAgICBjb25zdCBzY2VuZXMgPSBwYXJzZWRSZXNwb25zZS52aWRlb1NjZW5lcyB8fCBwYXJzZWRSZXNwb25zZTtcbiAgICBjb25zdCB2b2ljZVRvbmVJbnN0cnVjdGlvbiA9XG4gICAgICBwYXJzZWRSZXNwb25zZS52b2ljZVRvbmVJbnN0cnVjdGlvbiB8fFxuICAgICAgJ1NwZWFrIGluIGEgY2hlZXJmdWwgYW5kIHBvc2l0aXZlIHRvbmUnO1xuXG4gICAgLy8gQWRkIHNjZW5lIElEcyB0byBlYWNoIHNjZW5lXG4gICAgY29uc3Qgc2NlbmVzV2l0aElkcyA9IGFkZFNjZW5lSWRzKHNjZW5lcyk7XG5cbiAgICBjb25zb2xlLmxvZygn4pyFIFN0b3J5IGJyZWFrZG93biBwYXJzZWQgYW5kIGFkanVzdGVkIHN1Y2Nlc3NmdWxseScpO1xuICAgIGNvbnNvbGUubG9nKCfwn46kIFZvaWNlIHRvbmUgaW5zdHJ1Y3Rpb246Jywgdm9pY2VUb25lSW5zdHJ1Y3Rpb24pO1xuXG4gICAgcmV0dXJuIHsgc2NlbmVzOiBzY2VuZXNXaXRoSWRzLCB2b2ljZVRvbmVJbnN0cnVjdGlvbiB9O1xuICB9IGNhdGNoIChlcnJvcikge1xuICAgIGNvbnNvbGUuZXJyb3IoJ+KdjCBFcnJvciBpbiBnZW5lcmF0ZVN0b3J5QnJlYWtkb3duOicsIGVycm9yKTtcbiAgICB0aHJvdyBlcnJvcjtcbiAgfVxufVxuIl19