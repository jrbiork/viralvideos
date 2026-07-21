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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoic2NyaXB0LmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsic2NyaXB0LnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiI7O0FBb0JBLGtDQU1DO0FBRUQsd0RBd0hDO0FBcEpELG1DQUE0QjtBQUM1QixrREFBZ0U7QUFFaEUsTUFBTSxFQUFFLEdBQUcsSUFBSSxvQkFBUSxDQUFDLEVBQUUsTUFBTSxFQUFFLE9BQU8sQ0FBQyxHQUFHLENBQUMsVUFBVSxFQUFFLENBQUMsQ0FBQztBQUU1RCxNQUFNLE1BQU0sR0FBRyxJQUFJLGdCQUFNLENBQUMsRUFBRSxNQUFNLEVBQUUsT0FBTyxDQUFDLEdBQUcsQ0FBQyxjQUFjLEVBQUUsQ0FBQyxDQUFDO0FBY2xFLHdDQUF3QztBQUN4QyxTQUFnQixXQUFXLENBQUMsTUFBZTtJQUN6QyxPQUFPLE1BQU0sQ0FBQyxHQUFHLENBQUMsQ0FBQyxLQUFZLEVBQUUsR0FBVyxFQUFFLEVBQUUsQ0FBQyxDQUFDO1FBQ2hELEdBQUcsS0FBSztRQUNSLEVBQUUsRUFBRSxHQUFHO1FBQ1AsYUFBYSxFQUFFLEdBQUc7S0FDbkIsQ0FBQyxDQUFDLENBQUM7QUFDTixDQUFDO0FBRU0sS0FBSyxVQUFVLHNCQUFzQixDQUMxQyxNQUFjLEVBQ2QsVUFBa0IsRUFDbEIsYUFBcUIsRUFDckIsYUFBcUI7SUFFckIsT0FBTyxDQUFDLEdBQUcsQ0FBQywwQ0FBMEMsQ0FBQyxDQUFDO0lBQ3hELE9BQU8sQ0FBQyxHQUFHLENBQ1Qsa0JBQWtCLFVBQVUsWUFBWSxhQUFhLGdCQUFnQixDQUN0RSxDQUFDO0lBRUYsT0FBTyxDQUFDLEdBQUcsQ0FBQywwQkFBMEIsYUFBYSxlQUFlLENBQUMsQ0FBQztJQUVwRSxPQUFPLENBQUMsR0FBRyxDQUFDLFNBQVMsRUFBRSxNQUFNLENBQUMsQ0FBQztJQUUvQixJQUFJLENBQUM7UUFDSCwwRUFBMEU7UUFDMUUsTUFBTSxlQUFlLEdBQUc7WUFDdEIsSUFBSSxFQUFFLFFBQVE7WUFDZCxvQkFBb0IsRUFBRSxLQUFL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T0FBTyxDQUFDLEdBQUcsQ0FBQyx1QkFBdUIsRUFBRSxpQkFBaUIsQ0FBQyxDQUFDO1FBQ3hELE1BQU0sTUFBTSxHQUFHLGNBQWMsQ0FBQyxXQUFXLElBQUksY0FBYyxDQUFDO1FBQzVELE1BQU0sb0JBQW9CLEdBQ3hCLGNBQWMsQ0FBQyxvQkFBb0I7WUFDbkMsa0ZBQWtGLENBQUM7UUFFckYsOEJBQThCO1FBQzlCLE1BQU0sYUFBYSxHQUFHLFdBQVcsQ0FBQyxNQUFNLENBQUMsQ0FBQztRQUUxQyxPQUFPLENBQUMsR0FBRyxDQUFDLG9EQUFvRCxDQUFDLENBQUM7UUFDbEUsT0FBTyxDQUFDLEdBQUcsQ0FBQyw0QkFBNEIsRUFBRSxvQkFBb0IsQ0FBQyxDQUFDO1FBRWhFLE9BQU8sRUFBRSxNQUFNLEVBQUUsYUFBYSxFQUFFLG9CQUFvQixFQUFFLENBQUM7SUFDekQsQ0FBQztJQUFDLE9BQU8sS0FBSyxFQUFFLENBQUM7UUFDZixPQUFPLENBQUMsS0FBSyxDQUFDLG9DQUFvQyxFQUFFLEtBQUssQ0FBQyxDQUFDO1FBQzNELE1BQU0sS0FBSyxDQUFDO0lBQ2QsQ0FBQztBQUNILENBQUMiLCJzb3VyY2VzQ29udGVudCI6WyJpbXBvcnQgT3BlbkFJIGZyb20gJ29wZW5haSc7XG5pbXBvcnQgeyBTM0NsaWVudCwgUHV0T2JqZWN0Q29tbWFuZCB9IGZyb20gJ0Bhd3Mtc2RrL2NsaWVudC1zMyc7XG5cbmNvbnN0IHMzID0gbmV3IFMzQ2xpZW50KHsgcmVnaW9uOiBwcm9jZXNzLmVudi5BV1NfUkVHSU9OIH0pO1xuXG5jb25zdCBvcGVuYWkgPSBuZXcgT3BlbkFJKHsgYXBpS2V5OiBwcm9jZXNzLmVudi5PUEVOQUlfQVBJX0tFWSB9KTtcblxuZXhwb3J0IGludGVyZmFjZSBTY2VuZSB7XG4gIGRlc2NyaXB0aW9uOiBzdHJpbmc7XG4gIGR1cmF0aW9uOiBudW1iZXI7XG4gIG5hcnJhdGlvbjogc3RyaW5nO1xuICBpZDogbnVtYmVyO1xuICBzY2VuZVBvc2l0aW9uOiBudW1iZXI7XG4gIC8qKiBUd28gc2hvcnQgYnlsaW5lcyByZXBlYXRlZCBldmVyeSBzY2VuZSwgZS5nLiwgW1wiYmxvbmRlIFN3aXNzIHdvbWFuLCBncmVlbi1ibHVlIGV5ZXNcIiwgXCJtdXNjdWxhciBCcmF6aWxpYW4gbWFuIHdpdGggbXVzdGFjaGVcIl0gKi9cbiAgY2hhcmFjdGVyc0JyaWVmPzogc3RyaW5nW107XG4gIGFuaW1hdGVkOiBib29sZWFuO1xuICBhbmltYXRpb25Qcm9tcHQ/OiBzdHJpbmc7XG59XG5cbi8vIFV0aWxpdHkgZnVuY3Rpb24gdG8gYWRkIElEcyB0byBzY2VuZXNcbmV4cG9ydCBmdW5jdGlvbiBhZGRTY2VuZUlkcyhzY2VuZXM6IFNjZW5lW10pOiBTY2VuZVtdIHtcbiAgcmV0dXJuIHNjZW5lcy5tYXAoKHNjZW5lOiBTY2VuZSwgaWR4OiBudW1iZXIpID0+ICh7XG4gICAgLi4uc2NlbmUsXG4gICAgaWQ6IGlkeCxcbiAgICBzY2VuZVBvc2l0aW9uOiBpZHgsXG4gIH0pKTtcbn1cblxuZXhwb3J0IGFzeW5jIGZ1bmN0aW9uIGdlbmVyYXRlU3RvcnlCcmVha2Rvd24oXG4gIHByb21wdDogc3RyaW5nLFxuICBzY2VuZUNvdW50OiBudW1iZXIsXG4gIHNjZW5lRHVyYXRpb246IG51bWJlcixcbiAgdG90YWxEdXJhdGlvbjogbnVtYmVyLFxuKTogUHJvbWlzZTx7IHNjZW5lczogU2NlbmVbXTsgdm9pY2VUb25lSW5zdHJ1Y3Rpb246IHN0cmluZyB9PiB7XG4gIGNvbnNvbGUubG9nKCfwn6SWIENhbGxpbmcgT3BlbkFJIGZvciBzdG9yeSBicmVha2Rvd24uLi4nKTtcbiAgY29uc29sZS5sb2coXG4gICAgYPCfk4ogUGFyYW1ldGVyczogJHtzY2VuZUNvdW50fSBzY2VuZXMsICR7dG90YWxEdXJhdGlvbn0gc2Vjb25kcyB0b3RhbGAsXG4gICk7XG5cbiAgY29uc29sZS5sb2coYOKPse+4jyAgRWFjaCBzY2VuZSB3aWxsIGJlICR7c2NlbmVEdXJhdGlvbn0gc2Vjb25kcyBsb25nYCk7XG5cbiAgY29uc29sZS5sb2coJ3Byb21wdDonLCBwcm9tcHQpO1xuXG4gIHRyeSB7XG4gICAgLy8gQnVpbGQgc2NoZW1hIHByb2dyYW1tYXRpY2FsbHkgc28gYHJlcXVpcmVkYCBhbHdheXMgbWF0Y2hlcyBgcHJvcGVydGllc2BcbiAgICBjb25zdCBzY2VuZUl0ZW1TY2hlbWEgPSB7XG4gICAgICB0eXBlOiAnb2JqZWN0JyxcbiAgICAgIGFkZGl0aW9uYWxQcm9wZXJ0aWVzOiBmYWxzZSxcbiAgICAgIHByb3BlcnRpZXM6IHtcbiAgICAgICAgZGVzY3JpcHRpb246IHsgdHlwZTogJ3N0cmluZycgfSxcbiAgICAgICAgZHVyYXRpb246IHsgdHlwZTogJ251bWJlcicgfSxcbiAgICAgICAgbmFycmF0aW9uOiB7IHR5cGU6ICdzdHJpbmcnLCBtYXhMZW5ndGg6IDIxMCB9LFxuICAgICAgICBjaGFyYWN0ZXJzQnJpZWY6IHtcbiAgICAgICAgICB0eXBlOiAnYXJyYXknLFxuICAgICAgICAgIG1pbkl0ZW1zOiAyLFxuICAgICAgICAgIG1heEl0ZW1zOiAyLFxuICAgICAgICAgIGl0ZW1zOiB7IHR5cGU6ICdzdHJpbmcnLCBtYXhMZW5ndGg6IDgwIH0sXG4gICAgICAgIH0sXG4gICAgICB9LFxuICAgICAgcmVxdWlyZWQ6IFsnZGVzY3JpcHRpb24nLCAnZHVyYXRpb24nLCAnbmFycmF0aW9uJywgJ2NoYXJhY3RlcnNCcmllZiddLFxuICAgIH0gYXMgY29uc3Q7XG5cbiAgICBjb25zdCB0b3BMZXZlbFByb3BlcnRpZXMgPSB7XG4gICAgICB2aWRlb1NjZW5lczoge1xuICAgICAgICB0eXBlOiAnYXJyYXknLFxuICAgICAgICBtaW5JdGVtczogc2NlbmVDb3VudCxcbiAgICAgICAgbWF4SXRlbXM6IHNjZW5lQ291bnQsXG4gICAgICAgIGl0ZW1zOiBzY2VuZUl0ZW1TY2hlbWEsXG4gICAgICB9LFxuICAgICAgdm9pY2VUb25lSW5zdHJ1Y3Rpb246IHsgdHlwZTogJ3N0cmluZycsIG1pbkxlbmd0aDogMSB9LFxuICAgICAgY2hhcmFjdGVyc0J5bGluZXM6IHtcbiAgICAgICAgdHlwZTogJ2FycmF5JyxcbiAgICAgICAgbWluSXRlbXM6IDIsXG4gICAgICAgIG1heEl0ZW1zOiAyLFxuICAgICAgICBpdGVtczogeyB0eXBlOiAnc3RyaW5nJywgbWF4TGVuZ3RoOiA4MCB9LFxuICAgICAgfSxcbiAgICB9IGFzIGNvbnN0O1xuXG4gICAgY29uc3QganNvblNjaGVtYVJvb3QgPSB7XG4gICAgICB0eXBlOiAnb2JqZWN0JyxcbiAgICAgIGFkZGl0aW9uYWxQcm9wZXJ0aWVzOiBmYWxzZSxcbiAgICAgIHByb3BlcnRpZXM6IHRvcExldmVsUHJvcGVydGllcyxcbiAgICAgIHJlcXVpcmVkOiBPYmplY3Qua2V5cyh0b3BMZXZlbFByb3BlcnRpZXMpLFxuICAgIH0gYXMgY29uc3Q7XG5cbiAgICBjb25zb2xlLmxvZygn8J+nqiBTdHJ1Y3R1cmVkIE91dHB1dCBzY2hlbWE6JywgSlNPTi5zdHJpbmdpZnkoanNvblNjaGVtYVJvb3QpKTtcblxuICAgIGNvbnN0IHJlc3BvbnNlID0gYXdhaXQgb3BlbmFpLmNoYXQuY29tcGxldGlvbnMuY3JlYXRlKHtcbiAgICAgIG1vZGVsOiAnZ3B0LTUtbmFubycsXG4gICAgICBtZXNzYWdlczogW1xuICAgICAgICB7XG4gICAgICAgICAgcm9sZTogJ3N5c3RlbScsXG4gICAgICAgICAgY29udGVudDogYENyZWF0ZSBhIDk6MTYgdmVydGljYWwgdmlkZW8gc3BsaXQgaW50byBleGFjdGx5ICR7c2NlbmVDb3VudH0gc2NlbmVzLiBFYWNoIHNjZW5lJ3MgbmFycmF0aW9uIG11c3QgcnVuICoqbm8gbW9yZSB0aGFuIDE1IHNlY29uZHMgd2hlbiBzcG9rZW4gYWxvdWQsIGFuZCBubyBsZXNzIHRoYW4gMTIqKiDigJQgdGhhdCdzIGEgaGFyZCBjZWlsaW5nIG9mICoqMzIgd29yZHMqKiwgbmV2ZXIgbW9yZS4gQ291bnQgdGhlIHdvcmRzIGJlZm9yZSBmaW5hbGl6aW5nIGVhY2ggc2NlbmUgYW5kIHRyaW0gaWYgaXQncyBvdmVyLiBTZXQgZWFjaCBzY2VuZSdzIFxcYGR1cmF0aW9uXFxgIGZpZWxkIHRvIG1hdGNoIGhvdyBsb25nIGl0cyBuYXJyYXRpb24gd2lsbCBhY3R1YWxseSB0YWtlIHRvIHNheSAoMTItMTUpLlxuU3RyaWN0IHJ1bGVzOlxuLSBJZiB0aGUgdXNlciBuYW1lcyBhbnksICoqcmV3cml0ZSB0byBhIGdlbmVyaWMgYXJjaGV0eXBlKiogKGUuZy4sIOKAnGFuIGVsZGVybHkgU291dGhlcm4gZ2VudGxlbWFuIGluIGEgd2hpdGUgc3VpdCBhbmQgc3RyaW5nIHRpZeKAnSnigJRuZXZlciB1c2UgcmVhbCBuYW1lcyBvciBtYXJrcy5cbi0gKipUd28gY29uY2lzZSBjaGFyYWN0ZXIgYnlsaW5lcyBhdCB0aGUgdG9wIGxldmVsKiogKDw9IDEwIHdvcmRzIGVhY2gpOiBcXGBjaGFyYWN0ZXJzQnlsaW5lcyA9IFtmZW1hbGUsIG1hbGVdXFxgLlxuLSAqKkV2ZXJ5IHNjZW5lIG11c3Q6KipcbiAgMSkgU3RhcnQgXFxgZGVzY3JpcHRpb25cXGAgd2l0aCBcXGBbRkw6IDxmZW1hbGUgYnlsaW5lPl0gW01MOiA8bWFsZSBieWxpbmU+XVxcYCB0aGVuIHRoZSB2aXN1YWwuXG4tICoqTmFycmF0aW9uIHRvbmU6Kiogd3JpdGUgZXZlcnkgXFxgbmFycmF0aW9uXFxgIGxpa2UgYW4gb3V0Z29pbmcsIHdhcm0gZnJpZW5kIHRlbGxpbmcgeW91IHRoaXMgc3RvcnkgaW4gcGVyc29uIGJlY2F1c2UgdGhleSdyZSBnZW51aW5lbHkgZXhjaXRlZCBhYm91dCBpdCDigJQgY2FzdWFsLCBwdW5jaHksIGNvbnRyYWN0aW9ucyB3ZWxjb21lIChlLmcuIFwic2hlJ3NcIiwgXCJkaWRuJ3RcIiksIHNob3J0IHNlbnRlbmNlcywgYSBsaXR0bGUgcGVyc29uYWxpdHkvaHVtb3Igd2hlcmUgaXQgZml0cy4gVGFsayAqdG8qIHRoZSBsaXN0ZW5lciwgbm90ICphdCogdGhlbSDigJQgdGhyb3cgaW4gdGhlIG9kZCBcInlvdSBrbm93XCIsIFwiaG9uZXN0bHlcIiwgXCJoZXJlJ3MgdGhlIHRoaW5nXCIsIGEgcmhldG9yaWNhbCBxdWVzdGlvbiwgYSByZWFjdGlvbiAoXCJ3aWxkLCByaWdodD9cIikuIFZhcnkgc2VudGVuY2Ugcmh5dGhtIGxpa2UgcmVhbCBzcGVlY2gsIG5vdCB1bmlmb3JtIEFJIGNhZGVuY2UuIEF2b2lkIHN0b2NrIEFJIHBocmFzaW5nIChcImluIGEgd29ybGQgd2hlcmVcIiwgXCJsaXR0bGUgZGlkIHRoZXkga25vd1wiLCBcInRoZSB0cnV0aCBpc1wiLCBcIml0IHR1cm5zIG91dCB0aGF0XCIsIG92ZXJ1c2VkIGVtLWRhc2hlcykuIE5vdCBhIGZvcm1hbCBkb2N1bWVudGFyeSBuYXJyYXRvciwgbm90IHN0aWZmIG9yIGxpdGVyYXJ5LiBLZWVwIGl0IGNsZWFyIGFuZCB0YXN0ZWZ1bCDigJQgY2FzdWFsLCBub3QgY3J1ZGUgb3IgbWVtZS15LlxuT3V0cHV0OiAqKkpTT04gb25seSoqIGZvbGxvd2luZyB0aGUgcHJvdmlkZWQgc2NoZW1hLmAsXG4gICAgICAgIH0sXG4gICAgICAgIHtcbiAgICAgICAgICByb2xlOiAndXNlcicsXG4gICAgICAgICAgY29udGVudDpcbiAgICAgICAgICAgICdFbGFib3JhdGUgdGhlIGZvbGxvd2luZyBpZGVhIGJlaW5nIGNvbmNpc2UgYW5kIHNwZWNpZmljLCBtZW50aW9uaW5nIGV4YW1wbGVzIGlmIHBvc3NpYmxlOiAnICtcbiAgICAgICAgICAgIHByb21wdCxcbiAgICAgICAgfSxcbiAgICAgIF0sXG4gICAgICB0ZW1wZXJhdHVyZTogMSxcbiAgICAgIHJlc3BvbnNlX2Zvcm1hdDoge1xuICAgICAgICB0eXBlOiAnanNvbl9zY2hlbWEnLFxuICAgICAgICBqc29uX3NjaGVtYToge1xuICAgICAgICAgIG5hbWU6ICdWaWRlb1NjZW5lcycsXG4gICAgICAgICAgc3RyaWN0OiB0cnVlLFxuICAgICAgICAgIHNjaGVtYToganNvblNjaGVtYVJvb3QsXG4gICAgICAgIH0sXG4gICAgICB9LFxuICAgIH0pO1xuXG4gICAgY29uc29sZS5sb2coJ/CfpJYgT3BlbkFJIHJlc3BvbnNlOicsIHJlc3BvbnNlKTtcblxuICAgIGNvbnN0IGNvbnRlbnQgPSByZXNwb25zZS5jaG9pY2VzWzBdPy5tZXNzYWdlPy5jb250ZW50O1xuICAgIGNvbnNvbGUubG9nKCfwn5OEIE9wZW5BSSByZXNwb25zZSBjb250ZW50OicsIGNvbnRlbnQpO1xuXG4gICAgaWYgKCFjb250ZW50KSB7XG4gICAgICBjb25zb2xlLmxvZygn4p2MIEVycm9yOiBPcGVuQUkgZGlkIG5vdCByZXR1cm4gY29udGVudCcpO1xuICAgICAgdGhyb3cgbmV3IEVycm9yKCdGYWlsZWQgdG8gZ2VuZXJhdGUgc3RvcnkgYnJlYWtkb3duJyk7XG4gICAgfVxuXG4gICAgY29uc3QgcGFyc2VkUmVzcG9uc2UgPSBKU09OLnBhcnNlKGNvbnRlbnQpO1xuICAgIGNvbnN0IGNoYXJhY3RlcnNCeWxpbmVzOiBzdHJpbmdbXSA9IHBhcnNlZFJlc3BvbnNlLmNoYXJhY3RlcnNCeWxpbmVzIHx8IFtdO1xuICAgIGNvbnNvbGUubG9nKCfwn5GlIGNoYXJhY3RlcnNCeWxpbmVzOicsIGNoYXJhY3RlcnNCeWxpbmVzKTtcbiAgICBjb25zdCBzY2VuZXMgPSBwYXJzZWRSZXNwb25zZS52aWRlb1NjZW5lcyB8fCBwYXJzZWRSZXNwb25zZTtcbiAgICBjb25zdCB2b2ljZVRvbmVJbnN0cnVjdGlvbiA9XG4gICAgICBwYXJzZWRSZXNwb25zZS52b2ljZVRvbmVJbnN0cnVjdGlvbiB8fFxuICAgICAgJ1NwZWFrIGluIGEgd2FybSwgdXBiZWF0LCBjb252ZXJzYXRpb25hbCB0b25lIOKAlCBsaWtlIHRlbGxpbmcgYSBmcmllbmQgYSBmdW4gc3RvcnknO1xuXG4gICAgLy8gQWRkIHNjZW5lIElEcyB0byBlYWNoIHNjZW5lXG4gICAgY29uc3Qgc2NlbmVzV2l0aElkcyA9IGFkZFNjZW5lSWRzKHNjZW5lcyk7XG5cbiAgICBjb25zb2xlLmxvZygn4pyFIFN0b3J5IGJyZWFrZG93biBwYXJzZWQgYW5kIGFkanVzdGVkIHN1Y2Nlc3NmdWxseScpO1xuICAgIGNvbnNvbGUubG9nKCfwn46kIFZvaWNlIHRvbmUgaW5zdHJ1Y3Rpb246Jywgdm9pY2VUb25lSW5zdHJ1Y3Rpb24pO1xuXG4gICAgcmV0dXJuIHsgc2NlbmVzOiBzY2VuZXNXaXRoSWRzLCB2b2ljZVRvbmVJbnN0cnVjdGlvbiB9O1xuICB9IGNhdGNoIChlcnJvcikge1xuICAgIGNvbnNvbGUuZXJyb3IoJ+KdjCBFcnJvciBpbiBnZW5lcmF0ZVN0b3J5QnJlYWtkb3duOicsIGVycm9yKTtcbiAgICB0aHJvdyBlcnJvcjtcbiAgfVxufVxuIl19