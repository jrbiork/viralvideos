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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoic2NyaXB0LmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsic2NyaXB0LnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiI7O0FBc0JBLGtDQU1DO0FBRUQsd0RBd0hDO0FBdEpELG1DQUE0QjtBQUM1QixrREFBZ0U7QUFFaEUsTUFBTSxFQUFFLEdBQUcsSUFBSSxvQkFBUSxDQUFDLEVBQUUsTUFBTSxFQUFFLE9BQU8sQ0FBQyxHQUFHLENBQUMsVUFBVSxFQUFFLENBQUMsQ0FBQztBQUU1RCxNQUFNLE1BQU0sR0FBRyxJQUFJLGdCQUFNLENBQUMsRUFBRSxNQUFNLEVBQUUsT0FBTyxDQUFDLEdBQUcsQ0FBQyxjQUFjLEVBQUUsQ0FBQyxDQUFDO0FBZ0JsRSx3Q0FBd0M7QUFDeEMsU0FBZ0IsV0FBVyxDQUFDLE1BQWU7SUFDekMsT0FBTyxNQUFNLENBQUMsR0FBRyxDQUFDLENBQUMsS0FBWSxFQUFFLEdBQVcsRUFBRSxFQUFFLENBQUMsQ0FBQztRQUNoRCxHQUFHLEtBQUs7UUFDUixFQUFFLEVBQUUsR0FBRztRQUNQLGFBQWEsRUFBRSxHQUFHO0tBQ25CLENBQUMsQ0FBQyxDQUFDO0FBQ04sQ0FBQztBQUVNLEtBQUssVUFBVSxzQkFBc0IsQ0FDMUMsTUFBYyxFQUNkLFVBQWtCLEVBQ2xCLGFBQXFCLEVBQ3JCLGFBQXFCO0lBRXJCLE9BQU8sQ0FBQyxHQUFHLENBQUMsMENBQTBDLENBQUMsQ0FBQztJQUN4RCxPQUFPLENBQUMsR0FBRyxDQUNULGtCQUFrQixVQUFVLFlBQVksYUFBYSxnQkFBZ0IsQ0FDdEUsQ0FBQztJQUVGLE9BQU8sQ0FBQyxHQUFHLENBQUMsMEJBQTBCLGFBQWEsZUFBZSxDQUFDLENBQUM7SUFFcEUsT0FBTyxDQUFDLEdBQUcsQ0FBQyxTQUFTLEVBQUUsTUFBTSxDQUFDLENBQUM7SUFFL0IsSUFBSSxDQUFDO1FBQ0gsMEVBQTBFO1FBQzFFLE1BQU0sZUFBZSxHQUFHO1lBQ3RCLElBQUksRUFBRSxRQUFRO1lBQ2Qsb0JBQW9CLEVBQUUsS0FB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LE9BQU8sQ0FBQyxHQUFHLENBQUMsdUJBQXVCLEVBQUUsaUJBQWlCLENBQUMsQ0FBQztRQUN4RCxNQUFNLE1BQU0sR0FBRyxjQUFjLENBQUMsV0FBVyxJQUFJLGNBQWMsQ0FBQztRQUM1RCxNQUFNLG9CQUFvQixHQUN4QixjQUFjLENBQUMsb0JBQW9CO1lBQ25DLGtGQUFrRixDQUFDO1FBRXJGLDhCQUE4QjtRQUM5QixNQUFNLGFBQWEsR0FBRyxXQUFXLENBQUMsTUFBTSxDQUFDLENBQUM7UUFFMUMsT0FBTyxDQUFDLEdBQUcsQ0FBQyxvREFBb0QsQ0FBQyxDQUFDO1FBQ2xFLE9BQU8sQ0FBQyxHQUFHLENBQUMsNEJBQTRCLEVBQUUsb0JBQW9CLENBQUMsQ0FBQztRQUVoRSxPQUFPLEVBQUUsTUFBTSxFQUFFLGFBQWEsRUFBRSxvQkFBb0IsRUFBRSxDQUFDO0lBQ3pELENBQUM7SUFBQyxPQUFPLEtBQUssRUFBRSxDQUFDO1FBQ2YsT0FBTyxDQUFDLEtBQUssQ0FBQyxvQ0FBb0MsRUFBRSxLQUFLLENBQUMsQ0FBQztRQUMzRCxNQUFNLEtBQUssQ0FBQztJQUNkLENBQUM7QUFDSCxDQUFDIiwic291cmNlc0NvbnRlbnQiOlsiaW1wb3J0IE9wZW5BSSBmcm9tICdvcGVuYWknO1xuaW1wb3J0IHsgUzNDbGllbnQsIFB1dE9iamVjdENvbW1hbmQgfSBmcm9tICdAYXdzLXNkay9jbGllbnQtczMnO1xuXG5jb25zdCBzMyA9IG5ldyBTM0NsaWVudCh7IHJlZ2lvbjogcHJvY2Vzcy5lbnYuQVdTX1JFR0lPTiB9KTtcblxuY29uc3Qgb3BlbmFpID0gbmV3IE9wZW5BSSh7IGFwaUtleTogcHJvY2Vzcy5lbnYuT1BFTkFJX0FQSV9LRVkgfSk7XG5cbmV4cG9ydCBpbnRlcmZhY2UgU2NlbmUge1xuICBkZXNjcmlwdGlvbjogc3RyaW5nO1xuICBkdXJhdGlvbjogbnVtYmVyO1xuICBuYXJyYXRpb246IHN0cmluZztcbiAgaWQ6IG51bWJlcjtcbiAgc2NlbmVQb3NpdGlvbjogbnVtYmVyO1xuICAvKiogVHdvIHNob3J0IGJ5bGluZXMgcmVwZWF0ZWQgZXZlcnkgc2NlbmUsIGUuZy4sIFtcImJsb25kZSBTd2lzcyB3b21hbiwgZ3JlZW4tYmx1ZSBleWVzXCIsIFwibXVzY3VsYXIgQnJhemlsaWFuIG1hbiB3aXRoIG11c3RhY2hlXCJdICovXG4gIGNoYXJhY3RlcnNCcmllZj86IHN0cmluZ1tdO1xuICBhbmltYXRlZDogYm9vbGVhbjtcbiAgYW5pbWF0aW9uUHJvbXB0Pzogc3RyaW5nO1xuICAvKiogSGFyZCBmZm1wZWctZW5mb3JjZWQgYXVkaW8gZHVyYXRpb24gY2FwIGluIHNlY29uZHMsIGZvciBhbmltYXRlZCBzY2VuZXMgd2hvc2UgUnVud2F5IHZpZGVvIGhhcyBhIGZpeGVkIGxlbmd0aC4gKi9cbiAgaGFyZENhcFNlY29uZHM/OiBudW1iZXI7XG59XG5cbi8vIFV0aWxpdHkgZnVuY3Rpb24gdG8gYWRkIElEcyB0byBzY2VuZXNcbmV4cG9ydCBmdW5jdGlvbiBhZGRTY2VuZUlkcyhzY2VuZXM6IFNjZW5lW10pOiBTY2VuZVtdIHtcbiAgcmV0dXJuIHNjZW5lcy5tYXAoKHNjZW5lOiBTY2VuZSwgaWR4OiBudW1iZXIpID0+ICh7XG4gICAgLi4uc2NlbmUsXG4gICAgaWQ6IGlkeCxcbiAgICBzY2VuZVBvc2l0aW9uOiBpZHgsXG4gIH0pKTtcbn1cblxuZXhwb3J0IGFzeW5jIGZ1bmN0aW9uIGdlbmVyYXRlU3RvcnlCcmVha2Rvd24oXG4gIHByb21wdDogc3RyaW5nLFxuICBzY2VuZUNvdW50OiBudW1iZXIsXG4gIHNjZW5lRHVyYXRpb246IG51bWJlcixcbiAgdG90YWxEdXJhdGlvbjogbnVtYmVyLFxuKTogUHJvbWlzZTx7IHNjZW5lczogU2NlbmVbXTsgdm9pY2VUb25lSW5zdHJ1Y3Rpb246IHN0cmluZyB9PiB7XG4gIGNvbnNvbGUubG9nKCfwn6SWIENhbGxpbmcgT3BlbkFJIGZvciBzdG9yeSBicmVha2Rvd24uLi4nKTtcbiAgY29uc29sZS5sb2coXG4gICAgYPCfk4ogUGFyYW1ldGVyczogJHtzY2VuZUNvdW50fSBzY2VuZXMsICR7dG90YWxEdXJhdGlvbn0gc2Vjb25kcyB0b3RhbGAsXG4gICk7XG5cbiAgY29uc29sZS5sb2coYOKPse+4jyAgRWFjaCBzY2VuZSB3aWxsIGJlICR7c2NlbmVEdXJhdGlvbn0gc2Vjb25kcyBsb25nYCk7XG5cbiAgY29uc29sZS5sb2coJ3Byb21wdDonLCBwcm9tcHQpO1xuXG4gIHRyeSB7XG4gICAgLy8gQnVpbGQgc2NoZW1hIHByb2dyYW1tYXRpY2FsbHkgc28gYHJlcXVpcmVkYCBhbHdheXMgbWF0Y2hlcyBgcHJvcGVydGllc2BcbiAgICBjb25zdCBzY2VuZUl0ZW1TY2hlbWEgPSB7XG4gICAgICB0eXBlOiAnb2JqZWN0JyxcbiAgICAgIGFkZGl0aW9uYWxQcm9wZXJ0aWVzOiBmYWxzZSxcbiAgICAgIHByb3BlcnRpZXM6IHtcbiAgICAgICAgZGVzY3JpcHRpb246IHsgdHlwZTogJ3N0cmluZycgfSxcbiAgICAgICAgZHVyYXRpb246IHsgdHlwZTogJ251bWJlcicgfSxcbiAgICAgICAgbmFycmF0aW9uOiB7IHR5cGU6ICdzdHJpbmcnLCBtYXhMZW5ndGg6IDIxMCB9LFxuICAgICAgICBjaGFyYWN0ZXJzQnJpZWY6IHtcbiAgICAgICAgICB0eXBlOiAnYXJyYXknLFxuICAgICAgICAgIG1pbkl0ZW1zOiAyLFxuICAgICAgICAgIG1heEl0ZW1zOiAyLFxuICAgICAgICAgIGl0ZW1zOiB7IHR5cGU6ICdzdHJpbmcnLCBtYXhMZW5ndGg6IDgwIH0sXG4gICAgICAgIH0sXG4gICAgICB9LFxuICAgICAgcmVxdWlyZWQ6IFsnZGVzY3JpcHRpb24nLCAnZHVyYXRpb24nLCAnbmFycmF0aW9uJywgJ2NoYXJhY3RlcnNCcmllZiddLFxuICAgIH0gYXMgY29uc3Q7XG5cbiAgICBjb25zdCB0b3BMZXZlbFByb3BlcnRpZXMgPSB7XG4gICAgICB2aWRlb1NjZW5lczoge1xuICAgICAgICB0eXBlOiAnYXJyYXknLFxuICAgICAgICBtaW5JdGVtczogc2NlbmVDb3VudCxcbiAgICAgICAgbWF4SXRlbXM6IHNjZW5lQ291bnQsXG4gICAgICAgIGl0ZW1zOiBzY2VuZUl0ZW1TY2hlbWEsXG4gICAgICB9LFxuICAgICAgdm9pY2VUb25lSW5zdHJ1Y3Rpb246IHsgdHlwZTogJ3N0cmluZycsIG1pbkxlbmd0aDogMSB9LFxuICAgICAgY2hhcmFjdGVyc0J5bGluZXM6IHtcbiAgICAgICAgdHlwZTogJ2FycmF5JyxcbiAgICAgICAgbWluSXRlbXM6IDIsXG4gICAgICAgIG1heEl0ZW1zOiAyLFxuICAgICAgICBpdGVtczogeyB0eXBlOiAnc3RyaW5nJywgbWF4TGVuZ3RoOiA4MCB9LFxuICAgICAgfSxcbiAgICB9IGFzIGNvbnN0O1xuXG4gICAgY29uc3QganNvblNjaGVtYVJvb3QgPSB7XG4gICAgICB0eXBlOiAnb2JqZWN0JyxcbiAgICAgIGFkZGl0aW9uYWxQcm9wZXJ0aWVzOiBmYWxzZSxcbiAgICAgIHByb3BlcnRpZXM6IHRvcExldmVsUHJvcGVydGllcyxcbiAgICAgIHJlcXVpcmVkOiBPYmplY3Qua2V5cyh0b3BMZXZlbFByb3BlcnRpZXMpLFxuICAgIH0gYXMgY29uc3Q7XG5cbiAgICBjb25zb2xlLmxvZygn8J+nqiBTdHJ1Y3R1cmVkIE91dHB1dCBzY2hlbWE6JywgSlNPTi5zdHJpbmdpZnkoanNvblNjaGVtYVJvb3QpKTtcblxuICAgIGNvbnN0IHJlc3BvbnNlID0gYXdhaXQgb3BlbmFpLmNoYXQuY29tcGxldGlvbnMuY3JlYXRlKHtcbiAgICAgIG1vZGVsOiAnZ3B0LTUtbmFubycsXG4gICAgICBtZXNzYWdlczogW1xuICAgICAgICB7XG4gICAgICAgICAgcm9sZTogJ3N5c3RlbScsXG4gICAgICAgICAgY29udGVudDogYENyZWF0ZSBhIDk6MTYgdmVydGljYWwgdmlkZW8gc3BsaXQgaW50byBleGFjdGx5ICR7c2NlbmVDb3VudH0gc2NlbmVzLiBFYWNoIHNjZW5lJ3MgbmFycmF0aW9uIG11c3QgcnVuICoqbm8gbW9yZSB0aGFuIDE1IHNlY29uZHMgd2hlbiBzcG9rZW4gYWxvdWQsIGFuZCBubyBsZXNzIHRoYW4gMTIqKiDigJQgdGhhdCdzIGEgaGFyZCBjZWlsaW5nIG9mICoqMzIgd29yZHMqKiwgbmV2ZXIgbW9yZS4gQ291bnQgdGhlIHdvcmRzIGJlZm9yZSBmaW5hbGl6aW5nIGVhY2ggc2NlbmUgYW5kIHRyaW0gaWYgaXQncyBvdmVyLiBTZXQgZWFjaCBzY2VuZSdzIFxcYGR1cmF0aW9uXFxgIGZpZWxkIHRvIG1hdGNoIGhvdyBsb25nIGl0cyBuYXJyYXRpb24gd2lsbCBhY3R1YWxseSB0YWtlIHRvIHNheSAoMTItMTUpLlxuU3RyaWN0IHJ1bGVzOlxuLSBJZiB0aGUgdXNlciBuYW1lcyBhbnksICoqcmV3cml0ZSB0byBhIGdlbmVyaWMgYXJjaGV0eXBlKiogKGUuZy4sIOKAnGFuIGVsZGVybHkgU291dGhlcm4gZ2VudGxlbWFuIGluIGEgd2hpdGUgc3VpdCBhbmQgc3RyaW5nIHRpZeKAnSnigJRuZXZlciB1c2UgcmVhbCBuYW1lcyBvciBtYXJrcy5cbi0gKipUd28gY29uY2lzZSBjaGFyYWN0ZXIgYnlsaW5lcyBhdCB0aGUgdG9wIGxldmVsKiogKDw9IDEwIHdvcmRzIGVhY2gpOiBcXGBjaGFyYWN0ZXJzQnlsaW5lcyA9IFtmZW1hbGUsIG1hbGVdXFxgLlxuLSAqKkV2ZXJ5IHNjZW5lIG11c3Q6KipcbiAgMSkgU3RhcnQgXFxgZGVzY3JpcHRpb25cXGAgd2l0aCBcXGBbRkw6IDxmZW1hbGUgYnlsaW5lPl0gW01MOiA8bWFsZSBieWxpbmU+XVxcYCB0aGVuIHRoZSB2aXN1YWwuXG4tICoqTmFycmF0aW9uIHRvbmU6Kiogd3JpdGUgZXZlcnkgXFxgbmFycmF0aW9uXFxgIGxpa2UgYW4gb3V0Z29pbmcsIHdhcm0gZnJpZW5kIHRlbGxpbmcgeW91IHRoaXMgc3RvcnkgaW4gcGVyc29uIGJlY2F1c2UgdGhleSdyZSBnZW51aW5lbHkgZXhjaXRlZCBhYm91dCBpdCDigJQgY2FzdWFsLCBwdW5jaHksIGNvbnRyYWN0aW9ucyB3ZWxjb21lIChlLmcuIFwic2hlJ3NcIiwgXCJkaWRuJ3RcIiksIHNob3J0IHNlbnRlbmNlcywgYSBsaXR0bGUgcGVyc29uYWxpdHkvaHVtb3Igd2hlcmUgaXQgZml0cy4gVGFsayAqdG8qIHRoZSBsaXN0ZW5lciwgbm90ICphdCogdGhlbSDigJQgdGhyb3cgaW4gdGhlIG9kZCBcInlvdSBrbm93XCIsIFwiaG9uZXN0bHlcIiwgXCJoZXJlJ3MgdGhlIHRoaW5nXCIsIGEgcmhldG9yaWNhbCBxdWVzdGlvbiwgYSByZWFjdGlvbiAoXCJ3aWxkLCByaWdodD9cIikuIFZhcnkgc2VudGVuY2Ugcmh5dGhtIGxpa2UgcmVhbCBzcGVlY2gsIG5vdCB1bmlmb3JtIEFJIGNhZGVuY2UuIEF2b2lkIHN0b2NrIEFJIHBocmFzaW5nIChcImluIGEgd29ybGQgd2hlcmVcIiwgXCJsaXR0bGUgZGlkIHRoZXkga25vd1wiLCBcInRoZSB0cnV0aCBpc1wiLCBcIml0IHR1cm5zIG91dCB0aGF0XCIsIG92ZXJ1c2VkIGVtLWRhc2hlcykuIE5vdCBhIGZvcm1hbCBkb2N1bWVudGFyeSBuYXJyYXRvciwgbm90IHN0aWZmIG9yIGxpdGVyYXJ5LiBLZWVwIGl0IGNsZWFyIGFuZCB0YXN0ZWZ1bCDigJQgY2FzdWFsLCBub3QgY3J1ZGUgb3IgbWVtZS15LlxuT3V0cHV0OiAqKkpTT04gb25seSoqIGZvbGxvd2luZyB0aGUgcHJvdmlkZWQgc2NoZW1hLmAsXG4gICAgICAgIH0sXG4gICAgICAgIHtcbiAgICAgICAgICByb2xlOiAndXNlcicsXG4gICAgICAgICAgY29udGVudDpcbiAgICAgICAgICAgICdFbGFib3JhdGUgdGhlIGZvbGxvd2luZyBpZGVhIGJlaW5nIGNvbmNpc2UgYW5kIHNwZWNpZmljLCBtZW50aW9uaW5nIGV4YW1wbGVzIGlmIHBvc3NpYmxlOiAnICtcbiAgICAgICAgICAgIHByb21wdCxcbiAgICAgICAgfSxcbiAgICAgIF0sXG4gICAgICB0ZW1wZXJhdHVyZTogMSxcbiAgICAgIHJlc3BvbnNlX2Zvcm1hdDoge1xuICAgICAgICB0eXBlOiAnanNvbl9zY2hlbWEnLFxuICAgICAgICBqc29uX3NjaGVtYToge1xuICAgICAgICAgIG5hbWU6ICdWaWRlb1NjZW5lcycsXG4gICAgICAgICAgc3RyaWN0OiB0cnVlLFxuICAgICAgICAgIHNjaGVtYToganNvblNjaGVtYVJvb3QsXG4gICAgICAgIH0sXG4gICAgICB9LFxuICAgIH0pO1xuXG4gICAgY29uc29sZS5sb2coJ/CfpJYgT3BlbkFJIHJlc3BvbnNlOicsIHJlc3BvbnNlKTtcblxuICAgIGNvbnN0IGNvbnRlbnQgPSByZXNwb25zZS5jaG9pY2VzWzBdPy5tZXNzYWdlPy5jb250ZW50O1xuICAgIGNvbnNvbGUubG9nKCfwn5OEIE9wZW5BSSByZXNwb25zZSBjb250ZW50OicsIGNvbnRlbnQpO1xuXG4gICAgaWYgKCFjb250ZW50KSB7XG4gICAgICBjb25zb2xlLmxvZygn4p2MIEVycm9yOiBPcGVuQUkgZGlkIG5vdCByZXR1cm4gY29udGVudCcpO1xuICAgICAgdGhyb3cgbmV3IEVycm9yKCdGYWlsZWQgdG8gZ2VuZXJhdGUgc3RvcnkgYnJlYWtkb3duJyk7XG4gICAgfVxuXG4gICAgY29uc3QgcGFyc2VkUmVzcG9uc2UgPSBKU09OLnBhcnNlKGNvbnRlbnQpO1xuICAgIGNvbnN0IGNoYXJhY3RlcnNCeWxpbmVzOiBzdHJpbmdbXSA9IHBhcnNlZFJlc3BvbnNlLmNoYXJhY3RlcnNCeWxpbmVzIHx8IFtdO1xuICAgIGNvbnNvbGUubG9nKCfwn5GlIGNoYXJhY3RlcnNCeWxpbmVzOicsIGNoYXJhY3RlcnNCeWxpbmVzKTtcbiAgICBjb25zdCBzY2VuZXMgPSBwYXJzZWRSZXNwb25zZS52aWRlb1NjZW5lcyB8fCBwYXJzZWRSZXNwb25zZTtcbiAgICBjb25zdCB2b2ljZVRvbmVJbnN0cnVjdGlvbiA9XG4gICAgICBwYXJzZWRSZXNwb25zZS52b2ljZVRvbmVJbnN0cnVjdGlvbiB8fFxuICAgICAgJ1NwZWFrIGluIGEgd2FybSwgdXBiZWF0LCBjb252ZXJzYXRpb25hbCB0b25lIOKAlCBsaWtlIHRlbGxpbmcgYSBmcmllbmQgYSBmdW4gc3RvcnknO1xuXG4gICAgLy8gQWRkIHNjZW5lIElEcyB0byBlYWNoIHNjZW5lXG4gICAgY29uc3Qgc2NlbmVzV2l0aElkcyA9IGFkZFNjZW5lSWRzKHNjZW5lcyk7XG5cbiAgICBjb25zb2xlLmxvZygn4pyFIFN0b3J5IGJyZWFrZG93biBwYXJzZWQgYW5kIGFkanVzdGVkIHN1Y2Nlc3NmdWxseScpO1xuICAgIGNvbnNvbGUubG9nKCfwn46kIFZvaWNlIHRvbmUgaW5zdHJ1Y3Rpb246Jywgdm9pY2VUb25lSW5zdHJ1Y3Rpb24pO1xuXG4gICAgcmV0dXJuIHsgc2NlbmVzOiBzY2VuZXNXaXRoSWRzLCB2b2ljZVRvbmVJbnN0cnVjdGlvbiB9O1xuICB9IGNhdGNoIChlcnJvcikge1xuICAgIGNvbnNvbGUuZXJyb3IoJ+KdjCBFcnJvciBpbiBnZW5lcmF0ZVN0b3J5QnJlYWtkb3duOicsIGVycm9yKTtcbiAgICB0aHJvdyBlcnJvcjtcbiAgfVxufVxuIl19