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
                    content: `Create a 9:16 vertical video split into exactly ${sceneCount} scenes. Each scene's narration should run **15 to 20 seconds when spoken aloud** (roughly 40-55 words) — set each scene's \`duration\` field to match how long its narration will actually take to say.
Strict rules:
- If the user names any, **rewrite to a generic archetype** (e.g., “an elderly Southern gentleman in a white suit and string tie”)—never use real names or marks.
- **Two concise character bylines at the top level** (<= 10 words each): \`charactersBylines = [female, male]\`.
- **Every scene must:**
  1) Start \`description\` with \`[FL: <female byline>] [ML: <male byline>]\` then the visual.
- **Narration tone:** write every \`narration\` like an outgoing, warm friend telling you this story in person because they're genuinely excited about it — casual, punchy, contractions welcome (e.g. "she's", "didn't"), short sentences, a little personality/humor where it fits. Talk *to* the listener, not *at* them — throw in the odd "you know", "honestly", "here's the thing", a rhetorical question, a reaction ("wild, right?"). Vary sentence rhythm like real speech, not uniform AI cadence. Avoid stock AI phrasing ("in a world where", "little did they know", "the truth is", "it turns out that", overused em-dashes). Not a formal documentary narrator, not stiff or literary. Keep it clear and tasteful — casual, not crude or meme-y.
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoic2NyaXB0LmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsic2NyaXB0LnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiI7O0FBc0JBLGtDQU1DO0FBRUQsd0RBd0hDO0FBdEpELG1DQUE0QjtBQUM1QixrREFBZ0U7QUFFaEUsTUFBTSxFQUFFLEdBQUcsSUFBSSxvQkFBUSxDQUFDLEVBQUUsTUFBTSxFQUFFLE9BQU8sQ0FBQyxHQUFHLENBQUMsVUFBVSxFQUFFLENBQUMsQ0FBQztBQUU1RCxNQUFNLE1BQU0sR0FBRyxJQUFJLGdCQUFNLENBQUMsRUFBRSxNQUFNLEVBQUUsT0FBTyxDQUFDLEdBQUcsQ0FBQyxjQUFjLEVBQUUsQ0FBQyxDQUFDO0FBZ0JsRSx3Q0FBd0M7QUFDeEMsU0FBZ0IsV0FBVyxDQUFDLE1BQWU7SUFDekMsT0FBTyxNQUFNLENBQUMsR0FBRyxDQUFDLENBQUMsS0FBWSxFQUFFLEdBQVcsRUFBRSxFQUFFLENBQUMsQ0FBQztRQUNoRCxHQUFHLEtBQUs7UUFDUixFQUFFLEVBQUUsR0FBRztRQUNQLGFBQWEsRUFBRSxHQUFHO0tBQ25CLENBQUMsQ0FBQyxDQUFDO0FBQ04sQ0FBQztBQUVNLEtBQUssVUFBVSxzQkFBc0IsQ0FDMUMsTUFBYyxFQUNkLFVBQWtCLEVBQ2xCLGFBQXFCLEVBQ3JCLGFBQXFCO0lBRXJCLE9BQU8sQ0FBQyxHQUFHLENBQUMsMENBQTBDLENBQUMsQ0FBQztJQUN4RCxPQUFPLENBQUMsR0FBRyxDQUNULGtCQUFrQixVQUFVLFlBQVksYUFBYSxnQkFBZ0IsQ0FDdEUsQ0FBQztJQUVGLE9BQU8sQ0FBQyxHQUFHLENBQUMsMEJBQTBCLGFBQWEsZUFBZSxDQUFDLENBQUM7SUFFcEUsT0FBTyxDQUFDLEdBQUcsQ0FBQyxTQUFTLEVBQUUsTUFBTSxDQUFDLENBQUM7SUFFL0IsSUFBSSxDQUFDO1FBQ0gsMEVBQTBFO1FBQzFFLE1BQU0sZUFBZSxHQUFHO1lBQ3RCLElBQUksRUFBRSxRQUFRO1lBQ2Qsb0JBQW9CLEVBQUUsS0FB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LHVCQUF1QixFQUFFLGlCQUFpQixDQUFDLENBQUM7UUFDeEQsTUFBTSxNQUFNLEdBQUcsY0FBYyxDQUFDLFdBQVcsSUFBSSxjQUFjLENBQUM7UUFDNUQsTUFBTSxvQkFBb0IsR0FDeEIsY0FBYyxDQUFDLG9CQUFvQjtZQUNuQyxrRkFBa0YsQ0FBQztRQUVyRiw4QkFBOEI7UUFDOUIsTUFBTSxhQUFhLEdBQUcsV0FBVyxDQUFDLE1BQU0sQ0FBQyxDQUFDO1FBRTFDLE9BQU8sQ0FBQyxHQUFHLENBQUMsb0RBQW9ELENBQUMsQ0FBQztRQUNsRSxPQUFPLENBQUMsR0FBRyxDQUFDLDRCQUE0QixFQUFFLG9CQUFvQixDQUFDLENBQUM7UUFFaEUsT0FBTyxFQUFFLE1BQU0sRUFBRSxhQUFhLEVBQUUsb0JBQW9CLEVBQUUsQ0FBQztJQUN6RCxDQUFDO0lBQUMsT0FBTyxLQUFLLEVBQUUsQ0FBQztRQUNmLE9BQU8sQ0FBQyxLQUFLLENBQUMsb0NBQW9DLEVBQUUsS0FBSyxDQUFDLENBQUM7UUFDM0QsTUFBTSxLQUFLLENBQUM7SUFDZCxDQUFDO0FBQ0gsQ0FBQyIsInNvdXJjZXNDb250ZW50IjpbImltcG9ydCBPcGVuQUkgZnJvbSAnb3BlbmFpJztcbmltcG9ydCB7IFMzQ2xpZW50LCBQdXRPYmplY3RDb21tYW5kIH0gZnJvbSAnQGF3cy1zZGsvY2xpZW50LXMzJztcblxuY29uc3QgczMgPSBuZXcgUzNDbGllbnQoeyByZWdpb246IHByb2Nlc3MuZW52LkFXU19SRUdJT04gfSk7XG5cbmNvbnN0IG9wZW5haSA9IG5ldyBPcGVuQUkoeyBhcGlLZXk6IHByb2Nlc3MuZW52Lk9QRU5BSV9BUElfS0VZIH0pO1xuXG5leHBvcnQgaW50ZXJmYWNlIFNjZW5lIHtcbiAgZGVzY3JpcHRpb246IHN0cmluZztcbiAgZHVyYXRpb246IG51bWJlcjtcbiAgbmFycmF0aW9uOiBzdHJpbmc7XG4gIGlkOiBudW1iZXI7XG4gIHNjZW5lUG9zaXRpb246IG51bWJlcjtcbiAgLyoqIFR3byBzaG9ydCBieWxpbmVzIHJlcGVhdGVkIGV2ZXJ5IHNjZW5lLCBlLmcuLCBbXCJibG9uZGUgU3dpc3Mgd29tYW4sIGdyZWVuLWJsdWUgZXllc1wiLCBcIm11c2N1bGFyIEJyYXppbGlhbiBtYW4gd2l0aCBtdXN0YWNoZVwiXSAqL1xuICBjaGFyYWN0ZXJzQnJpZWY/OiBzdHJpbmdbXTtcbiAgYW5pbWF0ZWQ6IGJvb2xlYW47XG4gIGFuaW1hdGlvblByb21wdD86IHN0cmluZztcbiAgLyoqIEhhcmQgZmZtcGVnLWVuZm9yY2VkIGF1ZGlvIGR1cmF0aW9uIGNhcCBpbiBzZWNvbmRzLCBmb3IgYW5pbWF0ZWQgc2NlbmVzIHdob3NlIFJ1bndheSB2aWRlbyBoYXMgYSBmaXhlZCBsZW5ndGguICovXG4gIGhhcmRDYXBTZWNvbmRzPzogbnVtYmVyO1xufVxuXG4vLyBVdGlsaXR5IGZ1bmN0aW9uIHRvIGFkZCBJRHMgdG8gc2NlbmVzXG5leHBvcnQgZnVuY3Rpb24gYWRkU2NlbmVJZHMoc2NlbmVzOiBTY2VuZVtdKTogU2NlbmVbXSB7XG4gIHJldHVybiBzY2VuZXMubWFwKChzY2VuZTogU2NlbmUsIGlkeDogbnVtYmVyKSA9PiAoe1xuICAgIC4uLnNjZW5lLFxuICAgIGlkOiBpZHgsXG4gICAgc2NlbmVQb3NpdGlvbjogaWR4LFxuICB9KSk7XG59XG5cbmV4cG9ydCBhc3luYyBmdW5jdGlvbiBnZW5lcmF0ZVN0b3J5QnJlYWtkb3duKFxuICBwcm9tcHQ6IHN0cmluZyxcbiAgc2NlbmVDb3VudDogbnVtYmVyLFxuICBzY2VuZUR1cmF0aW9uOiBudW1iZXIsXG4gIHRvdGFsRHVyYXRpb246IG51bWJlcixcbik6IFByb21pc2U8eyBzY2VuZXM6IFNjZW5lW107IHZvaWNlVG9uZUluc3RydWN0aW9uOiBzdHJpbmcgfT4ge1xuICBjb25zb2xlLmxvZygn8J+kliBDYWxsaW5nIE9wZW5BSSBmb3Igc3RvcnkgYnJlYWtkb3duLi4uJyk7XG4gIGNvbnNvbGUubG9nKFxuICAgIGDwn5OKIFBhcmFtZXRlcnM6ICR7c2NlbmVDb3VudH0gc2NlbmVzLCAke3RvdGFsRHVyYXRpb259IHNlY29uZHMgdG90YWxgLFxuICApO1xuXG4gIGNvbnNvbGUubG9nKGDij7HvuI8gIEVhY2ggc2NlbmUgd2lsbCBiZSAke3NjZW5lRHVyYXRpb259IHNlY29uZHMgbG9uZ2ApO1xuXG4gIGNvbnNvbGUubG9nKCdwcm9tcHQ6JywgcHJvbXB0KTtcblxuICB0cnkge1xuICAgIC8vIEJ1aWxkIHNjaGVtYSBwcm9ncmFtbWF0aWNhbGx5IHNvIGByZXF1aXJlZGAgYWx3YXlzIG1hdGNoZXMgYHByb3BlcnRpZXNgXG4gICAgY29uc3Qgc2NlbmVJdGVtU2NoZW1hID0ge1xuICAgICAgdHlwZTogJ29iamVjdCcsXG4gICAgICBhZGRpdGlvbmFsUHJvcGVydGllczogZmFsc2UsXG4gICAgICBwcm9wZXJ0aWVzOiB7XG4gICAgICAgIGRlc2NyaXB0aW9uOiB7IHR5cGU6ICdzdHJpbmcnIH0sXG4gICAgICAgIGR1cmF0aW9uOiB7IHR5cGU6ICdudW1iZXInIH0sXG4gICAgICAgIG5hcnJhdGlvbjogeyB0eXBlOiAnc3RyaW5nJyB9LFxuICAgICAgICBjaGFyYWN0ZXJzQnJpZWY6IHtcbiAgICAgICAgICB0eXBlOiAnYXJyYXknLFxuICAgICAgICAgIG1pbkl0ZW1zOiAyLFxuICAgICAgICAgIG1heEl0ZW1zOiAyLFxuICAgICAgICAgIGl0ZW1zOiB7IHR5cGU6ICdzdHJpbmcnLCBtYXhMZW5ndGg6IDgwIH0sXG4gICAgICAgIH0sXG4gICAgICB9LFxuICAgICAgcmVxdWlyZWQ6IFsnZGVzY3JpcHRpb24nLCAnZHVyYXRpb24nLCAnbmFycmF0aW9uJywgJ2NoYXJhY3RlcnNCcmllZiddLFxuICAgIH0gYXMgY29uc3Q7XG5cbiAgICBjb25zdCB0b3BMZXZlbFByb3BlcnRpZXMgPSB7XG4gICAgICB2aWRlb1NjZW5lczoge1xuICAgICAgICB0eXBlOiAnYXJyYXknLFxuICAgICAgICBtaW5JdGVtczogc2NlbmVDb3VudCxcbiAgICAgICAgbWF4SXRlbXM6IHNjZW5lQ291bnQsXG4gICAgICAgIGl0ZW1zOiBzY2VuZUl0ZW1TY2hlbWEsXG4gICAgICB9LFxuICAgICAgdm9pY2VUb25lSW5zdHJ1Y3Rpb246IHsgdHlwZTogJ3N0cmluZycsIG1pbkxlbmd0aDogMSB9LFxuICAgICAgY2hhcmFjdGVyc0J5bGluZXM6IHtcbiAgICAgICAgdHlwZTogJ2FycmF5JyxcbiAgICAgICAgbWluSXRlbXM6IDIsXG4gICAgICAgIG1heEl0ZW1zOiAyLFxuICAgICAgICBpdGVtczogeyB0eXBlOiAnc3RyaW5nJywgbWF4TGVuZ3RoOiA4MCB9LFxuICAgICAgfSxcbiAgICB9IGFzIGNvbnN0O1xuXG4gICAgY29uc3QganNvblNjaGVtYVJvb3QgPSB7XG4gICAgICB0eXBlOiAnb2JqZWN0JyxcbiAgICAgIGFkZGl0aW9uYWxQcm9wZXJ0aWVzOiBmYWxzZSxcbiAgICAgIHByb3BlcnRpZXM6IHRvcExldmVsUHJvcGVydGllcyxcbiAgICAgIHJlcXVpcmVkOiBPYmplY3Qua2V5cyh0b3BMZXZlbFByb3BlcnRpZXMpLFxuICAgIH0gYXMgY29uc3Q7XG5cbiAgICBjb25zb2xlLmxvZygn8J+nqiBTdHJ1Y3R1cmVkIE91dHB1dCBzY2hlbWE6JywgSlNPTi5zdHJpbmdpZnkoanNvblNjaGVtYVJvb3QpKTtcblxuICAgIGNvbnN0IHJlc3BvbnNlID0gYXdhaXQgb3BlbmFpLmNoYXQuY29tcGxldGlvbnMuY3JlYXRlKHtcbiAgICAgIG1vZGVsOiAnZ3B0LTUtbmFubycsXG4gICAgICBtZXNzYWdlczogW1xuICAgICAgICB7XG4gICAgICAgICAgcm9sZTogJ3N5c3RlbScsXG4gICAgICAgICAgY29udGVudDogYENyZWF0ZSBhIDk6MTYgdmVydGljYWwgdmlkZW8gc3BsaXQgaW50byBleGFjdGx5ICR7c2NlbmVDb3VudH0gc2NlbmVzLiBFYWNoIHNjZW5lJ3MgbmFycmF0aW9uIHNob3VsZCBydW4gKioxNSB0byAyMCBzZWNvbmRzIHdoZW4gc3Bva2VuIGFsb3VkKiogKHJvdWdobHkgNDAtNTUgd29yZHMpIOKAlCBzZXQgZWFjaCBzY2VuZSdzIFxcYGR1cmF0aW9uXFxgIGZpZWxkIHRvIG1hdGNoIGhvdyBsb25nIGl0cyBuYXJyYXRpb24gd2lsbCBhY3R1YWxseSB0YWtlIHRvIHNheS5cblN0cmljdCBydWxlczpcbi0gSWYgdGhlIHVzZXIgbmFtZXMgYW55LCAqKnJld3JpdGUgdG8gYSBnZW5lcmljIGFyY2hldHlwZSoqIChlLmcuLCDigJxhbiBlbGRlcmx5IFNvdXRoZXJuIGdlbnRsZW1hbiBpbiBhIHdoaXRlIHN1aXQgYW5kIHN0cmluZyB0aWXigJ0p4oCUbmV2ZXIgdXNlIHJlYWwgbmFtZXMgb3IgbWFya3MuXG4tICoqVHdvIGNvbmNpc2UgY2hhcmFjdGVyIGJ5bGluZXMgYXQgdGhlIHRvcCBsZXZlbCoqICg8PSAxMCB3b3JkcyBlYWNoKTogXFxgY2hhcmFjdGVyc0J5bGluZXMgPSBbZmVtYWxlLCBtYWxlXVxcYC5cbi0gKipFdmVyeSBzY2VuZSBtdXN0OioqXG4gIDEpIFN0YXJ0IFxcYGRlc2NyaXB0aW9uXFxgIHdpdGggXFxgW0ZMOiA8ZmVtYWxlIGJ5bGluZT5dIFtNTDogPG1hbGUgYnlsaW5lPl1cXGAgdGhlbiB0aGUgdmlzdWFsLlxuLSAqKk5hcnJhdGlvbiB0b25lOioqIHdyaXRlIGV2ZXJ5IFxcYG5hcnJhdGlvblxcYCBsaWtlIGFuIG91dGdvaW5nLCB3YXJtIGZyaWVuZCB0ZWxsaW5nIHlvdSB0aGlzIHN0b3J5IGluIHBlcnNvbiBiZWNhdXNlIHRoZXkncmUgZ2VudWluZWx5IGV4Y2l0ZWQgYWJvdXQgaXQg4oCUIGNhc3VhbCwgcHVuY2h5LCBjb250cmFjdGlvbnMgd2VsY29tZSAoZS5nLiBcInNoZSdzXCIsIFwiZGlkbid0XCIpLCBzaG9ydCBzZW50ZW5jZXMsIGEgbGl0dGxlIHBlcnNvbmFsaXR5L2h1bW9yIHdoZXJlIGl0IGZpdHMuIFRhbGsgKnRvKiB0aGUgbGlzdGVuZXIsIG5vdCAqYXQqIHRoZW0g4oCUIHRocm93IGluIHRoZSBvZGQgXCJ5b3Uga25vd1wiLCBcImhvbmVzdGx5XCIsIFwiaGVyZSdzIHRoZSB0aGluZ1wiLCBhIHJoZXRvcmljYWwgcXVlc3Rpb24sIGEgcmVhY3Rpb24gKFwid2lsZCwgcmlnaHQ/XCIpLiBWYXJ5IHNlbnRlbmNlIHJoeXRobSBsaWtlIHJlYWwgc3BlZWNoLCBub3QgdW5pZm9ybSBBSSBjYWRlbmNlLiBBdm9pZCBzdG9jayBBSSBwaHJhc2luZyAoXCJpbiBhIHdvcmxkIHdoZXJlXCIsIFwibGl0dGxlIGRpZCB0aGV5IGtub3dcIiwgXCJ0aGUgdHJ1dGggaXNcIiwgXCJpdCB0dXJucyBvdXQgdGhhdFwiLCBvdmVydXNlZCBlbS1kYXNoZXMpLiBOb3QgYSBmb3JtYWwgZG9jdW1lbnRhcnkgbmFycmF0b3IsIG5vdCBzdGlmZiBvciBsaXRlcmFyeS4gS2VlcCBpdCBjbGVhciBhbmQgdGFzdGVmdWwg4oCUIGNhc3VhbCwgbm90IGNydWRlIG9yIG1lbWUteS5cbk91dHB1dDogKipKU09OIG9ubHkqKiBmb2xsb3dpbmcgdGhlIHByb3ZpZGVkIHNjaGVtYS5gLFxuICAgICAgICB9LFxuICAgICAgICB7XG4gICAgICAgICAgcm9sZTogJ3VzZXInLFxuICAgICAgICAgIGNvbnRlbnQ6XG4gICAgICAgICAgICAnRWxhYm9yYXRlIHRoZSBmb2xsb3dpbmcgaWRlYSBiZWluZyBjb25jaXNlIGFuZCBzcGVjaWZpYywgbWVudGlvbmluZyBleGFtcGxlcyBpZiBwb3NzaWJsZTogJyArXG4gICAgICAgICAgICBwcm9tcHQsXG4gICAgICAgIH0sXG4gICAgICBdLFxuICAgICAgdGVtcGVyYXR1cmU6IDEsXG4gICAgICByZXNwb25zZV9mb3JtYXQ6IHtcbiAgICAgICAgdHlwZTogJ2pzb25fc2NoZW1hJyxcbiAgICAgICAganNvbl9zY2hlbWE6IHtcbiAgICAgICAgICBuYW1lOiAnVmlkZW9TY2VuZXMnLFxuICAgICAgICAgIHN0cmljdDogdHJ1ZSxcbiAgICAgICAgICBzY2hlbWE6IGpzb25TY2hlbWFSb290LFxuICAgICAgICB9LFxuICAgICAgfSxcbiAgICB9KTtcblxuICAgIGNvbnNvbGUubG9nKCfwn6SWIE9wZW5BSSByZXNwb25zZTonLCByZXNwb25zZSk7XG5cbiAgICBjb25zdCBjb250ZW50ID0gcmVzcG9uc2UuY2hvaWNlc1swXT8ubWVzc2FnZT8uY29udGVudDtcbiAgICBjb25zb2xlLmxvZygn8J+ThCBPcGVuQUkgcmVzcG9uc2UgY29udGVudDonLCBjb250ZW50KTtcblxuICAgIGlmICghY29udGVudCkge1xuICAgICAgY29uc29sZS5sb2coJ+KdjCBFcnJvcjogT3BlbkFJIGRpZCBub3QgcmV0dXJuIGNvbnRlbnQnKTtcbiAgICAgIHRocm93IG5ldyBFcnJvcignRmFpbGVkIHRvIGdlbmVyYXRlIHN0b3J5IGJyZWFrZG93bicpO1xuICAgIH1cblxuICAgIGNvbnN0IHBhcnNlZFJlc3BvbnNlID0gSlNPTi5wYXJzZShjb250ZW50KTtcbiAgICBjb25zdCBjaGFyYWN0ZXJzQnlsaW5lczogc3RyaW5nW10gPSBwYXJzZWRSZXNwb25zZS5jaGFyYWN0ZXJzQnlsaW5lcyB8fCBbXTtcbiAgICBjb25zb2xlLmxvZygn8J+RpSBjaGFyYWN0ZXJzQnlsaW5lczonLCBjaGFyYWN0ZXJzQnlsaW5lcyk7XG4gICAgY29uc3Qgc2NlbmVzID0gcGFyc2VkUmVzcG9uc2UudmlkZW9TY2VuZXMgfHwgcGFyc2VkUmVzcG9uc2U7XG4gICAgY29uc3Qgdm9pY2VUb25lSW5zdHJ1Y3Rpb24gPVxuICAgICAgcGFyc2VkUmVzcG9uc2Uudm9pY2VUb25lSW5zdHJ1Y3Rpb24gfHxcbiAgICAgICdTcGVhayBpbiBhIHdhcm0sIHVwYmVhdCwgY29udmVyc2F0aW9uYWwgdG9uZSDigJQgbGlrZSB0ZWxsaW5nIGEgZnJpZW5kIGEgZnVuIHN0b3J5JztcblxuICAgIC8vIEFkZCBzY2VuZSBJRHMgdG8gZWFjaCBzY2VuZVxuICAgIGNvbnN0IHNjZW5lc1dpdGhJZHMgPSBhZGRTY2VuZUlkcyhzY2VuZXMpO1xuXG4gICAgY29uc29sZS5sb2coJ+KchSBTdG9yeSBicmVha2Rvd24gcGFyc2VkIGFuZCBhZGp1c3RlZCBzdWNjZXNzZnVsbHknKTtcbiAgICBjb25zb2xlLmxvZygn8J+OpCBWb2ljZSB0b25lIGluc3RydWN0aW9uOicsIHZvaWNlVG9uZUluc3RydWN0aW9uKTtcblxuICAgIHJldHVybiB7IHNjZW5lczogc2NlbmVzV2l0aElkcywgdm9pY2VUb25lSW5zdHJ1Y3Rpb24gfTtcbiAgfSBjYXRjaCAoZXJyb3IpIHtcbiAgICBjb25zb2xlLmVycm9yKCfinYwgRXJyb3IgaW4gZ2VuZXJhdGVTdG9yeUJyZWFrZG93bjonLCBlcnJvcik7XG4gICAgdGhyb3cgZXJyb3I7XG4gIH1cbn1cbiJdfQ==