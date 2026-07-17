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
- **Narration tone:** write every \`narration\` like a witty friend telling the story out loud — casual, punchy, contractions welcome (e.g. "she's", "didn't"), short sentences, a little personality/humor where it fits. Not a formal documentary narrator, not stiff or literary. Keep it clear and tasteful — casual, not crude or meme-y.
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoic2NyaXB0LmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsic2NyaXB0LnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiI7O0FBc0JBLGtDQU1DO0FBRUQsd0RBd0hDO0FBdEpELG1DQUE0QjtBQUM1QixrREFBZ0U7QUFFaEUsTUFBTSxFQUFFLEdBQUcsSUFBSSxvQkFBUSxDQUFDLEVBQUUsTUFBTSxFQUFFLE9BQU8sQ0FBQyxHQUFHLENBQUMsVUFBVSxFQUFFLENBQUMsQ0FBQztBQUU1RCxNQUFNLE1BQU0sR0FBRyxJQUFJLGdCQUFNLENBQUMsRUFBRSxNQUFNLEVBQUUsT0FBTyxDQUFDLEdBQUcsQ0FBQyxjQUFjLEVBQUUsQ0FBQyxDQUFDO0FBZ0JsRSx3Q0FBd0M7QUFDeEMsU0FBZ0IsV0FBVyxDQUFDLE1BQWU7SUFDekMsT0FBTyxNQUFNLENBQUMsR0FBRyxDQUFDLENBQUMsS0FBWSxFQUFFLEdBQVcsRUFBRSxFQUFFLENBQUMsQ0FBQztRQUNoRCxHQUFHLEtBQUs7UUFDUixFQUFFLEVBQUUsR0FBRztRQUNQLGFBQWEsRUFBRSxHQUFHO0tBQ25CLENBQUMsQ0FBQyxDQUFDO0FBQ04sQ0FBQztBQUVNLEtBQUssVUFBVSxzQkFBc0IsQ0FDMUMsTUFBYyxFQUNkLFVBQWtCLEVBQ2xCLGFBQXFCLEVBQ3JCLGFBQXFCO0lBRXJCLE9BQU8sQ0FBQyxHQUFHLENBQUMsMENBQTBDLENBQUMsQ0FBQztJQUN4RCxPQUFPLENBQUMsR0FBRyxDQUNULGtCQUFrQixVQUFVLFlBQVksYUFBYSxnQkFBZ0IsQ0FDdEUsQ0FBQztJQUVGLE9BQU8sQ0FBQyxHQUFHLENBQUMsMEJBQTBCLGFBQWEsZUFBZSxDQUFDLENBQUM7SUFFcEUsT0FBTyxDQUFDLEdBQUcsQ0FBQyxTQUFTLEVBQUUsTUFBTSxDQUFDLENBQUM7SUFFL0IsSUFBSSxDQUFDO1FBQ0gsMEVBQTBFO1FBQzFFLE1BQU0sZUFBZSxHQUFHO1lBQ3RCLElBQUksRUFBRSxRQUFRO1lBQ2Qsb0JBQW9CLEVBQUUsS0FB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M0UsT0FBTyxDQUFDLEdBQUcsQ0FBQyx1QkFBdUIsRUFBRSxpQkFBaUIsQ0FBQyxDQUFDO1FBQ3hELE1BQU0sTUFBTSxHQUFHLGNBQWMsQ0FBQyxXQUFXLElBQUksY0FBYyxDQUFDO1FBQzVELE1BQU0sb0JBQW9CLEdBQ3hCLGNBQWMsQ0FBQyxvQkFBb0I7WUFDbkMsa0ZBQWtGLENBQUM7UUFFckYsOEJBQThCO1FBQzlCLE1BQU0sYUFBYSxHQUFHLFdBQVcsQ0FBQyxNQUFNLENBQUMsQ0FBQztRQUUxQyxPQUFPLENBQUMsR0FBRyxDQUFDLG9EQUFvRCxDQUFDLENBQUM7UUFDbEUsT0FBTyxDQUFDLEdBQUcsQ0FBQyw0QkFBNEIsRUFBRSxvQkFBb0IsQ0FBQyxDQUFDO1FBRWhFLE9BQU8sRUFBRSxNQUFNLEVBQUUsYUFBYSxFQUFFLG9CQUFvQixFQUFFLENBQUM7SUFDekQsQ0FBQztJQUFDLE9BQU8sS0FBSyxFQUFFLENBQUM7UUFDZixPQUFPLENBQUMsS0FBSyxDQUFDLG9DQUFvQyxFQUFFLEtBQUssQ0FBQyxDQUFDO1FBQzNELE1BQU0sS0FBSyxDQUFDO0lBQ2QsQ0FBQztBQUNILENBQUMiLCJzb3VyY2VzQ29udGVudCI6WyJpbXBvcnQgT3BlbkFJIGZyb20gJ29wZW5haSc7XG5pbXBvcnQgeyBTM0NsaWVudCwgUHV0T2JqZWN0Q29tbWFuZCB9IGZyb20gJ0Bhd3Mtc2RrL2NsaWVudC1zMyc7XG5cbmNvbnN0IHMzID0gbmV3IFMzQ2xpZW50KHsgcmVnaW9uOiBwcm9jZXNzLmVudi5BV1NfUkVHSU9OIH0pO1xuXG5jb25zdCBvcGVuYWkgPSBuZXcgT3BlbkFJKHsgYXBpS2V5OiBwcm9jZXNzLmVudi5PUEVOQUlfQVBJX0tFWSB9KTtcblxuZXhwb3J0IGludGVyZmFjZSBTY2VuZSB7XG4gIGRlc2NyaXB0aW9uOiBzdHJpbmc7XG4gIGR1cmF0aW9uOiBudW1iZXI7XG4gIG5hcnJhdGlvbjogc3RyaW5nO1xuICBpZDogbnVtYmVyO1xuICBzY2VuZVBvc2l0aW9uOiBudW1iZXI7XG4gIC8qKiBUd28gc2hvcnQgYnlsaW5lcyByZXBlYXRlZCBldmVyeSBzY2VuZSwgZS5nLiwgW1wiYmxvbmRlIFN3aXNzIHdvbWFuLCBncmVlbi1ibHVlIGV5ZXNcIiwgXCJtdXNjdWxhciBCcmF6aWxpYW4gbWFuIHdpdGggbXVzdGFjaGVcIl0gKi9cbiAgY2hhcmFjdGVyc0JyaWVmPzogc3RyaW5nW107XG4gIGFuaW1hdGVkOiBib29sZWFuO1xuICBhbmltYXRpb25Qcm9tcHQ/OiBzdHJpbmc7XG4gIC8qKiBIYXJkIGZmbXBlZy1lbmZvcmNlZCBhdWRpbyBkdXJhdGlvbiBjYXAgaW4gc2Vjb25kcywgZm9yIGFuaW1hdGVkIHNjZW5lcyB3aG9zZSBSdW53YXkgdmlkZW8gaGFzIGEgZml4ZWQgbGVuZ3RoLiAqL1xuICBoYXJkQ2FwU2Vjb25kcz86IG51bWJlcjtcbn1cblxuLy8gVXRpbGl0eSBmdW5jdGlvbiB0byBhZGQgSURzIHRvIHNjZW5lc1xuZXhwb3J0IGZ1bmN0aW9uIGFkZFNjZW5lSWRzKHNjZW5lczogU2NlbmVbXSk6IFNjZW5lW10ge1xuICByZXR1cm4gc2NlbmVzLm1hcCgoc2NlbmU6IFNjZW5lLCBpZHg6IG51bWJlcikgPT4gKHtcbiAgICAuLi5zY2VuZSxcbiAgICBpZDogaWR4LFxuICAgIHNjZW5lUG9zaXRpb246IGlkeCxcbiAgfSkpO1xufVxuXG5leHBvcnQgYXN5bmMgZnVuY3Rpb24gZ2VuZXJhdGVTdG9yeUJyZWFrZG93bihcbiAgcHJvbXB0OiBzdHJpbmcsXG4gIHNjZW5lQ291bnQ6IG51bWJlcixcbiAgc2NlbmVEdXJhdGlvbjogbnVtYmVyLFxuICB0b3RhbER1cmF0aW9uOiBudW1iZXIsXG4pOiBQcm9taXNlPHsgc2NlbmVzOiBTY2VuZVtdOyB2b2ljZVRvbmVJbnN0cnVjdGlvbjogc3RyaW5nIH0+IHtcbiAgY29uc29sZS5sb2coJ/CfpJYgQ2FsbGluZyBPcGVuQUkgZm9yIHN0b3J5IGJyZWFrZG93bi4uLicpO1xuICBjb25zb2xlLmxvZyhcbiAgICBg8J+TiiBQYXJhbWV0ZXJzOiAke3NjZW5lQ291bnR9IHNjZW5lcywgJHt0b3RhbER1cmF0aW9ufSBzZWNvbmRzIHRvdGFsYCxcbiAgKTtcblxuICBjb25zb2xlLmxvZyhg4o+x77iPICBFYWNoIHNjZW5lIHdpbGwgYmUgJHtzY2VuZUR1cmF0aW9ufSBzZWNvbmRzIGxvbmdgKTtcblxuICBjb25zb2xlLmxvZygncHJvbXB0OicsIHByb21wdCk7XG5cbiAgdHJ5IHtcbiAgICAvLyBCdWlsZCBzY2hlbWEgcHJvZ3JhbW1hdGljYWxseSBzbyBgcmVxdWlyZWRgIGFsd2F5cyBtYXRjaGVzIGBwcm9wZXJ0aWVzYFxuICAgIGNvbnN0IHNjZW5lSXRlbVNjaGVtYSA9IHtcbiAgICAgIHR5cGU6ICdvYmplY3QnLFxuICAgICAgYWRkaXRpb25hbFByb3BlcnRpZXM6IGZhbHNlLFxuICAgICAgcHJvcGVydGllczoge1xuICAgICAgICBkZXNjcmlwdGlvbjogeyB0eXBlOiAnc3RyaW5nJyB9LFxuICAgICAgICBkdXJhdGlvbjogeyB0eXBlOiAnbnVtYmVyJyB9LFxuICAgICAgICBuYXJyYXRpb246IHsgdHlwZTogJ3N0cmluZycgfSxcbiAgICAgICAgY2hhcmFjdGVyc0JyaWVmOiB7XG4gICAgICAgICAgdHlwZTogJ2FycmF5JyxcbiAgICAgICAgICBtaW5JdGVtczogMixcbiAgICAgICAgICBtYXhJdGVtczogMixcbiAgICAgICAgICBpdGVtczogeyB0eXBlOiAnc3RyaW5nJywgbWF4TGVuZ3RoOiA4MCB9LFxuICAgICAgICB9LFxuICAgICAgfSxcbiAgICAgIHJlcXVpcmVkOiBbJ2Rlc2NyaXB0aW9uJywgJ2R1cmF0aW9uJywgJ25hcnJhdGlvbicsICdjaGFyYWN0ZXJzQnJpZWYnXSxcbiAgICB9IGFzIGNvbnN0O1xuXG4gICAgY29uc3QgdG9wTGV2ZWxQcm9wZXJ0aWVzID0ge1xuICAgICAgdmlkZW9TY2VuZXM6IHtcbiAgICAgICAgdHlwZTogJ2FycmF5JyxcbiAgICAgICAgbWluSXRlbXM6IHNjZW5lQ291bnQsXG4gICAgICAgIG1heEl0ZW1zOiBzY2VuZUNvdW50LFxuICAgICAgICBpdGVtczogc2NlbmVJdGVtU2NoZW1hLFxuICAgICAgfSxcbiAgICAgIHZvaWNlVG9uZUluc3RydWN0aW9uOiB7IHR5cGU6ICdzdHJpbmcnLCBtaW5MZW5ndGg6IDEgfSxcbiAgICAgIGNoYXJhY3RlcnNCeWxpbmVzOiB7XG4gICAgICAgIHR5cGU6ICdhcnJheScsXG4gICAgICAgIG1pbkl0ZW1zOiAyLFxuICAgICAgICBtYXhJdGVtczogMixcbiAgICAgICAgaXRlbXM6IHsgdHlwZTogJ3N0cmluZycsIG1heExlbmd0aDogODAgfSxcbiAgICAgIH0sXG4gICAgfSBhcyBjb25zdDtcblxuICAgIGNvbnN0IGpzb25TY2hlbWFSb290ID0ge1xuICAgICAgdHlwZTogJ29iamVjdCcsXG4gICAgICBhZGRpdGlvbmFsUHJvcGVydGllczogZmFsc2UsXG4gICAgICBwcm9wZXJ0aWVzOiB0b3BMZXZlbFByb3BlcnRpZXMsXG4gICAgICByZXF1aXJlZDogT2JqZWN0LmtleXModG9wTGV2ZWxQcm9wZXJ0aWVzKSxcbiAgICB9IGFzIGNvbnN0O1xuXG4gICAgY29uc29sZS5sb2coJ/Cfp6ogU3RydWN0dXJlZCBPdXRwdXQgc2NoZW1hOicsIEpTT04uc3RyaW5naWZ5KGpzb25TY2hlbWFSb290KSk7XG5cbiAgICBjb25zdCByZXNwb25zZSA9IGF3YWl0IG9wZW5haS5jaGF0LmNvbXBsZXRpb25zLmNyZWF0ZSh7XG4gICAgICBtb2RlbDogJ2dwdC01LW5hbm8nLFxuICAgICAgbWVzc2FnZXM6IFtcbiAgICAgICAge1xuICAgICAgICAgIHJvbGU6ICdzeXN0ZW0nLFxuICAgICAgICAgIGNvbnRlbnQ6IGBDcmVhdGUgYSAke3RvdGFsRHVyYXRpb259LXNlY29uZCA5OjE2IHZlcnRpY2FsIHZpZGVvIHNwbGl0IGludG8gZXhhY3RseSAke3NjZW5lQ291bnR9IHNjZW5lcyAoZWFjaCAke3NjZW5lRHVyYXRpb259cykuXG5TdHJpY3QgcnVsZXM6XG4tIElmIHRoZSB1c2VyIG5hbWVzIGFueSwgKipyZXdyaXRlIHRvIGEgZ2VuZXJpYyBhcmNoZXR5cGUqKiAoZS5nLiwg4oCcYW4gZWxkZXJseSBTb3V0aGVybiBnZW50bGVtYW4gaW4gYSB3aGl0ZSBzdWl0IGFuZCBzdHJpbmcgdGll4oCdKeKAlG5ldmVyIHVzZSByZWFsIG5hbWVzIG9yIG1hcmtzLlxuLSAqKlR3byBjb25jaXNlIGNoYXJhY3RlciBieWxpbmVzIGF0IHRoZSB0b3AgbGV2ZWwqKiAoPD0gMTAgd29yZHMgZWFjaCk6IFxcYGNoYXJhY3RlcnNCeWxpbmVzID0gW2ZlbWFsZSwgbWFsZV1cXGAuXG4tICoqRXZlcnkgc2NlbmUgbXVzdDoqKlxuICAxKSBTdGFydCBcXGBkZXNjcmlwdGlvblxcYCB3aXRoIFxcYFtGTDogPGZlbWFsZSBieWxpbmU+XSBbTUw6IDxtYWxlIGJ5bGluZT5dXFxgIHRoZW4gdGhlIHZpc3VhbC5cbi0gKipOYXJyYXRpb24gdG9uZToqKiB3cml0ZSBldmVyeSBcXGBuYXJyYXRpb25cXGAgbGlrZSBhIHdpdHR5IGZyaWVuZCB0ZWxsaW5nIHRoZSBzdG9yeSBvdXQgbG91ZCDigJQgY2FzdWFsLCBwdW5jaHksIGNvbnRyYWN0aW9ucyB3ZWxjb21lIChlLmcuIFwic2hlJ3NcIiwgXCJkaWRuJ3RcIiksIHNob3J0IHNlbnRlbmNlcywgYSBsaXR0bGUgcGVyc29uYWxpdHkvaHVtb3Igd2hlcmUgaXQgZml0cy4gTm90IGEgZm9ybWFsIGRvY3VtZW50YXJ5IG5hcnJhdG9yLCBub3Qgc3RpZmYgb3IgbGl0ZXJhcnkuIEtlZXAgaXQgY2xlYXIgYW5kIHRhc3RlZnVsIOKAlCBjYXN1YWwsIG5vdCBjcnVkZSBvciBtZW1lLXkuXG5PdXRwdXQ6ICoqSlNPTiBvbmx5KiogZm9sbG93aW5nIHRoZSBwcm92aWRlZCBzY2hlbWEuYCxcbiAgICAgICAgfSxcbiAgICAgICAge1xuICAgICAgICAgIHJvbGU6ICd1c2VyJyxcbiAgICAgICAgICBjb250ZW50OlxuICAgICAgICAgICAgJ0VsYWJvcmF0ZSB0aGUgZm9sbG93aW5nIGlkZWEgYmVpbmcgY29uY2lzZSBhbmQgc3BlY2lmaWMsIG1lbnRpb25pbmcgZXhhbXBsZXMgaWYgcG9zc2libGU6ICcgK1xuICAgICAgICAgICAgcHJvbXB0LFxuICAgICAgICB9LFxuICAgICAgXSxcbiAgICAgIHRlbXBlcmF0dXJlOiAxLFxuICAgICAgcmVzcG9uc2VfZm9ybWF0OiB7XG4gICAgICAgIHR5cGU6ICdqc29uX3NjaGVtYScsXG4gICAgICAgIGpzb25fc2NoZW1hOiB7XG4gICAgICAgICAgbmFtZTogJ1ZpZGVvU2NlbmVzJyxcbiAgICAgICAgICBzdHJpY3Q6IHRydWUsXG4gICAgICAgICAgc2NoZW1hOiBqc29uU2NoZW1hUm9vdCxcbiAgICAgICAgfSxcbiAgICAgIH0sXG4gICAgfSk7XG5cbiAgICBjb25zb2xlLmxvZygn8J+kliBPcGVuQUkgcmVzcG9uc2U6JywgcmVzcG9uc2UpO1xuXG4gICAgY29uc3QgY29udGVudCA9IHJlc3BvbnNlLmNob2ljZXNbMF0/Lm1lc3NhZ2U/LmNvbnRlbnQ7XG4gICAgY29uc29sZS5sb2coJ/Cfk4QgT3BlbkFJIHJlc3BvbnNlIGNvbnRlbnQ6JywgY29udGVudCk7XG5cbiAgICBpZiAoIWNvbnRlbnQpIHtcbiAgICAgIGNvbnNvbGUubG9nKCfinYwgRXJyb3I6IE9wZW5BSSBkaWQgbm90IHJldHVybiBjb250ZW50Jyk7XG4gICAgICB0aHJvdyBuZXcgRXJyb3IoJ0ZhaWxlZCB0byBnZW5lcmF0ZSBzdG9yeSBicmVha2Rvd24nKTtcbiAgICB9XG5cbiAgICBjb25zdCBwYXJzZWRSZXNwb25zZSA9IEpTT04ucGFyc2UoY29udGVudCk7XG4gICAgY29uc3QgY2hhcmFjdGVyc0J5bGluZXM6IHN0cmluZ1tdID0gcGFyc2VkUmVzcG9uc2UuY2hhcmFjdGVyc0J5bGluZXMgfHwgW107XG4gICAgY29uc29sZS5sb2coJ/CfkaUgY2hhcmFjdGVyc0J5bGluZXM6JywgY2hhcmFjdGVyc0J5bGluZXMpO1xuICAgIGNvbnN0IHNjZW5lcyA9IHBhcnNlZFJlc3BvbnNlLnZpZGVvU2NlbmVzIHx8IHBhcnNlZFJlc3BvbnNlO1xuICAgIGNvbnN0IHZvaWNlVG9uZUluc3RydWN0aW9uID1cbiAgICAgIHBhcnNlZFJlc3BvbnNlLnZvaWNlVG9uZUluc3RydWN0aW9uIHx8XG4gICAgICAnU3BlYWsgaW4gYSB3YXJtLCB1cGJlYXQsIGNvbnZlcnNhdGlvbmFsIHRvbmUg4oCUIGxpa2UgdGVsbGluZyBhIGZyaWVuZCBhIGZ1biBzdG9yeSc7XG5cbiAgICAvLyBBZGQgc2NlbmUgSURzIHRvIGVhY2ggc2NlbmVcbiAgICBjb25zdCBzY2VuZXNXaXRoSWRzID0gYWRkU2NlbmVJZHMoc2NlbmVzKTtcblxuICAgIGNvbnNvbGUubG9nKCfinIUgU3RvcnkgYnJlYWtkb3duIHBhcnNlZCBhbmQgYWRqdXN0ZWQgc3VjY2Vzc2Z1bGx5Jyk7XG4gICAgY29uc29sZS5sb2coJ/CfjqQgVm9pY2UgdG9uZSBpbnN0cnVjdGlvbjonLCB2b2ljZVRvbmVJbnN0cnVjdGlvbik7XG5cbiAgICByZXR1cm4geyBzY2VuZXM6IHNjZW5lc1dpdGhJZHMsIHZvaWNlVG9uZUluc3RydWN0aW9uIH07XG4gIH0gY2F0Y2ggKGVycm9yKSB7XG4gICAgY29uc29sZS5lcnJvcign4p2MIEVycm9yIGluIGdlbmVyYXRlU3RvcnlCcmVha2Rvd246JywgZXJyb3IpO1xuICAgIHRocm93IGVycm9yO1xuICB9XG59XG4iXX0=