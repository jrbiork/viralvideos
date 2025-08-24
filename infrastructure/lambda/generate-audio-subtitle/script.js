"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.generateStoryBreakdown = generateStoryBreakdown;
const openai_1 = require("openai");
const narrationHelper_1 = require("./util/narrationHelper");
const openai = new openai_1.default({ apiKey: process.env.OPENAI_API_KEY });
async function generateStoryBreakdown(prompt, sceneCount, sceneDuration, totalDuration) {
    console.log('🤖 Calling OpenAI for story breakdown...');
    console.log(`📊 Parameters: ${sceneCount} scenes, ${totalDuration} seconds total`);
    console.log(`⏱️  Each scene will be ${sceneDuration} seconds long`);
    try {
        // Guidance for narration pacing and safety caps
        const wordsPerSecond = 2.2; // ~132 wpm, natural VO pace
        const wordsPerMinute = Math.round(wordsPerSecond * 60);
        const maxWordsPerScene = Math.max(8, Math.round(sceneDuration * wordsPerSecond));
        const maxTotalWords = Math.round(totalDuration * wordsPerSecond);
        const response = await openai.chat.completions.create({
            model: 'gpt-4o-mini',
            messages: [
                {
                    role: 'system',
                    content: `You are a short-form video scriptwriter for TikTok/Reels/Shorts.
Break the user's idea into ${sceneCount} scenes for a ${totalDuration}-second, 9:16 vertical video; each scene lasts ${sceneDuration}s.

Strict rules:
- Output **JSON only** matching the provided schema; no prose, no backticks.
- Language: **use the same language as the user's input**.
- **Scene 1 must include a strong curiosity hook** in the narration (one sentence).
- Each **description**: what viewers see (subject, action, framing/camera, motion, lighting). No dialogue.
- Each **narration**: spoken VO, conversational, **no hashtags, emojis, or scene labels**.
- **Timing**: narration per scene ≤ ${maxWordsPerScene} words; total narration must fit ${totalDuration}s at ~${wordsPerMinute} wpm.
- Tone: energetic and clear; keep actions **safe and realistic**; brand-neutral (no logos, trademarks, or celebrity names).
- End with a satisfying visual beat (rest, reveal, or resolution), not a hard sales CTA unless implied by the idea.
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
        // Post-process scenes to ensure text fits duration
        const adjustedScenes = scenes.map((scene, idx) => {
            const adjustedNarration = (0, narrationHelper_1.adjustTextForDuration)(scene.narration, scene.duration);
            const originalDuration = (0, narrationHelper_1.estimateTextDuration)(scene.narration);
            const adjustedDuration = (0, narrationHelper_1.estimateTextDuration)(adjustedNarration);
            console.log(`📝 Scene ${scene.description.substring(0, 50)}...`);
            console.log(`   Original: ${originalDuration.toFixed(1)}s, Adjusted: ${adjustedDuration.toFixed(1)}s, Target: ${scene.duration}s`);
            return {
                ...scene,
                narration: adjustedNarration,
                id: idx,
            };
        });
        console.log('✅ Story breakdown parsed and adjusted successfully');
        console.log('🎤 Voice tone instruction:', voiceToneInstruction);
        return { scenes: adjustedScenes, voiceToneInstruction };
    }
    catch (error) {
        console.error('❌ Error in generateStoryBreakdown:', error);
        throw error;
    }
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoic2NyaXB0LmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsic2NyaXB0LnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiI7O0FBZUEsd0RBd0hDO0FBdklELG1DQUE0QjtBQUM1Qiw0REFHZ0M7QUFFaEMsTUFBTSxNQUFNLEdBQUcsSUFBSSxnQkFBTSxDQUFDLEVBQUUsTUFBTSxFQUFFLE9BQU8sQ0FBQyxHQUFHLENBQUMsY0FBYyxFQUFFLENBQUMsQ0FBQztBQVMzRCxLQUFLLFVBQVUsc0JBQXNCLENBQzFDLE1BQWMsRUFDZCxVQUFrQixFQUNsQixhQUFxQixFQUNyQixhQUFxQjtJQUVyQixPQUFPLENBQUMsR0FBRyxDQUFDLDBDQUEwQyxDQUFDLENBQUM7SUFDeEQsT0FBTyxDQUFDLEdBQUcsQ0FDVCxrQkFBa0IsVUFBVSxZQUFZLGFBQWEsZ0JBQWdCLENBQ3RFLENBQUM7SUFFRixPQUFPLENBQUMsR0FBRyxDQUFDLDBCQUEwQixhQUFhLGVBQWUsQ0FBQyxDQUFDO0lBRXBFLElBQUksQ0FBQztRQUNILGdEQUFnRDtRQUNoRCxNQUFNLGNBQWMsR0FBRyxHQUFHLENBQUMsQ0FBQyw0QkFBNEI7UUFDeEQsTUFBTSxjQUFjLEdBQUcsSUFBSSxDQUFDLEtBQUssQ0FBQyxjQUFjLEdBQUcsRUFBRSxDQUFDLENBQUM7UUFDdkQsTUFBTSxnQkFBZ0IsR0FBRyxJQUFJLENBQUMsR0FBRyxDQUMvQixDQUFDLEVBQ0QsSUFBSSxDQUFDLEtBQUssQ0FBQyxhQUFhLEdBQUcsY0FBYyxDQUFDLENBQzNDLENBQUM7UUFDRixNQUFNLGFBQWEsR0FBRyxJQUFJLENBQUMsS0FBSyxDQUFDLGFBQWEsR0FBRyxjQUFjLENBQUMsQ0FBQztRQUNqRSxNQUFNLFFBQVEsR0FBRyxNQUFNLE1BQU0sQ0FBQyxJQUFJLENBQUMsV0FBVyxDQUFDLE1BQU0sQ0FBQztZQUNwRCxLQUFLLEVBQUUsYUFBYTtZQUNwQixRQUFRLEVBQUU7Z0JBQ1I7b0JBQ0UsSUFBSSxFQUFFLFFBQVE7b0JBQ2Qs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QTRCLEVBQUUsb0JBQW9CLENBQUMsQ0FBQztRQUNoRSxPQUFPLEVBQUUsTUFBTSxFQUFFLGNBQWMsRUFBRSxvQkFBb0IsRUFBRSxDQUFDO0lBQzFELENBQUM7SUFBQyxPQUFPLEtBQUssRUFBRSxDQUFDO1FBQ2YsT0FBTyxDQUFDLEtBQUssQ0FBQyxvQ0FBb0MsRUFBRSxLQUFLLENBQUMsQ0FBQztRQUMzRCxNQUFNLEtBQUssQ0FBQztJQUNkLENBQUM7QUFDSCxDQUFDIiwic291cmNlc0NvbnRlbnQiOlsiaW1wb3J0IE9wZW5BSSBmcm9tICdvcGVuYWknO1xuaW1wb3J0IHtcbiAgZXN0aW1hdGVUZXh0RHVyYXRpb24sXG4gIGFkanVzdFRleHRGb3JEdXJhdGlvbixcbn0gZnJvbSAnLi91dGlsL25hcnJhdGlvbkhlbHBlcic7XG5cbmNvbnN0IG9wZW5haSA9IG5ldyBPcGVuQUkoeyBhcGlLZXk6IHByb2Nlc3MuZW52Lk9QRU5BSV9BUElfS0VZIH0pO1xuXG5leHBvcnQgaW50ZXJmYWNlIFNjZW5lIHtcbiAgZGVzY3JpcHRpb246IHN0cmluZztcbiAgZHVyYXRpb246IG51bWJlcjtcbiAgbmFycmF0aW9uOiBzdHJpbmc7XG4gIGlkOiBudW1iZXI7XG59XG5cbmV4cG9ydCBhc3luYyBmdW5jdGlvbiBnZW5lcmF0ZVN0b3J5QnJlYWtkb3duKFxuICBwcm9tcHQ6IHN0cmluZyxcbiAgc2NlbmVDb3VudDogbnVtYmVyLFxuICBzY2VuZUR1cmF0aW9uOiBudW1iZXIsXG4gIHRvdGFsRHVyYXRpb246IG51bWJlcixcbik6IFByb21pc2U8eyBzY2VuZXM6IFNjZW5lW107IHZvaWNlVG9uZUluc3RydWN0aW9uOiBzdHJpbmcgfT4ge1xuICBjb25zb2xlLmxvZygn8J+kliBDYWxsaW5nIE9wZW5BSSBmb3Igc3RvcnkgYnJlYWtkb3duLi4uJyk7XG4gIGNvbnNvbGUubG9nKFxuICAgIGDwn5OKIFBhcmFtZXRlcnM6ICR7c2NlbmVDb3VudH0gc2NlbmVzLCAke3RvdGFsRHVyYXRpb259IHNlY29uZHMgdG90YWxgLFxuICApO1xuXG4gIGNvbnNvbGUubG9nKGDij7HvuI8gIEVhY2ggc2NlbmUgd2lsbCBiZSAke3NjZW5lRHVyYXRpb259IHNlY29uZHMgbG9uZ2ApO1xuXG4gIHRyeSB7XG4gICAgLy8gR3VpZGFuY2UgZm9yIG5hcnJhdGlvbiBwYWNpbmcgYW5kIHNhZmV0eSBjYXBzXG4gICAgY29uc3Qgd29yZHNQZXJTZWNvbmQgPSAyLjI7IC8vIH4xMzIgd3BtLCBuYXR1cmFsIFZPIHBhY2VcbiAgICBjb25zdCB3b3Jkc1Blck1pbnV0ZSA9IE1hdGgucm91bmQod29yZHNQZXJTZWNvbmQgKiA2MCk7XG4gICAgY29uc3QgbWF4V29yZHNQZXJTY2VuZSA9IE1hdGgubWF4KFxuICAgICAgOCxcbiAgICAgIE1hdGgucm91bmQoc2NlbmVEdXJhdGlvbiAqIHdvcmRzUGVyU2Vjb25kKSxcbiAgICApO1xuICAgIGNvbnN0IG1heFRvdGFsV29yZHMgPSBNYXRoLnJvdW5kKHRvdGFsRHVyYXRpb24gKiB3b3Jkc1BlclNlY29uZCk7XG4gICAgY29uc3QgcmVzcG9uc2UgPSBhd2FpdCBvcGVuYWkuY2hhdC5jb21wbGV0aW9ucy5jcmVhdGUoe1xuICAgICAgbW9kZWw6ICdncHQtNG8tbWluaScsXG4gICAgICBtZXNzYWdlczogW1xuICAgICAgICB7XG4gICAgICAgICAgcm9sZTogJ3N5c3RlbScsXG4gICAgICAgICAgY29udGVudDogYFlvdSBhcmUgYSBzaG9ydC1mb3JtIHZpZGVvIHNjcmlwdHdyaXRlciBmb3IgVGlrVG9rL1JlZWxzL1Nob3J0cy5cbkJyZWFrIHRoZSB1c2VyJ3MgaWRlYSBpbnRvICR7c2NlbmVDb3VudH0gc2NlbmVzIGZvciBhICR7dG90YWxEdXJhdGlvbn0tc2Vjb25kLCA5OjE2IHZlcnRpY2FsIHZpZGVvOyBlYWNoIHNjZW5lIGxhc3RzICR7c2NlbmVEdXJhdGlvbn1zLlxuXG5TdHJpY3QgcnVsZXM6XG4tIE91dHB1dCAqKkpTT04gb25seSoqIG1hdGNoaW5nIHRoZSBwcm92aWRlZCBzY2hlbWE7IG5vIHByb3NlLCBubyBiYWNrdGlja3MuXG4tIExhbmd1YWdlOiAqKnVzZSB0aGUgc2FtZSBsYW5ndWFnZSBhcyB0aGUgdXNlcidzIGlucHV0KiouXG4tICoqU2NlbmUgMSBtdXN0IGluY2x1ZGUgYSBzdHJvbmcgY3VyaW9zaXR5IGhvb2sqKiBpbiB0aGUgbmFycmF0aW9uIChvbmUgc2VudGVuY2UpLlxuLSBFYWNoICoqZGVzY3JpcHRpb24qKjogd2hhdCB2aWV3ZXJzIHNlZSAoc3ViamVjdCwgYWN0aW9uLCBmcmFtaW5nL2NhbWVyYSwgbW90aW9uLCBsaWdodGluZykuIE5vIGRpYWxvZ3VlLlxuLSBFYWNoICoqbmFycmF0aW9uKio6IHNwb2tlbiBWTywgY29udmVyc2F0aW9uYWwsICoqbm8gaGFzaHRhZ3MsIGVtb2ppcywgb3Igc2NlbmUgbGFiZWxzKiouXG4tICoqVGltaW5nKio6IG5hcnJhdGlvbiBwZXIgc2NlbmUg4omkICR7bWF4V29yZHNQZXJTY2VuZX0gd29yZHM7IHRvdGFsIG5hcnJhdGlvbiBtdXN0IGZpdCAke3RvdGFsRHVyYXRpb259cyBhdCB+JHt3b3Jkc1Blck1pbnV0ZX0gd3BtLlxuLSBUb25lOiBlbmVyZ2V0aWMgYW5kIGNsZWFyOyBrZWVwIGFjdGlvbnMgKipzYWZlIGFuZCByZWFsaXN0aWMqKjsgYnJhbmQtbmV1dHJhbCAobm8gbG9nb3MsIHRyYWRlbWFya3MsIG9yIGNlbGVicml0eSBuYW1lcykuXG4tIEVuZCB3aXRoIGEgc2F0aXNmeWluZyB2aXN1YWwgYmVhdCAocmVzdCwgcmV2ZWFsLCBvciByZXNvbHV0aW9uKSwgbm90IGEgaGFyZCBzYWxlcyBDVEEgdW5sZXNzIGltcGxpZWQgYnkgdGhlIGlkZWEuXG4gIGAsXG4gICAgICAgIH0sXG4gICAgICAgIHtcbiAgICAgICAgICByb2xlOiAndXNlcicsXG4gICAgICAgICAgY29udGVudDogcHJvbXB0LFxuICAgICAgICB9LFxuICAgICAgXSxcbiAgICAgIHRlbXBlcmF0dXJlOiAwLjcsXG4gICAgICByZXNwb25zZV9mb3JtYXQ6IHtcbiAgICAgICAgdHlwZTogJ2pzb25fc2NoZW1hJyxcbiAgICAgICAganNvbl9zY2hlbWE6IHtcbiAgICAgICAgICBuYW1lOiAnVmlkZW9TY2VuZXMnLFxuICAgICAgICAgIHNjaGVtYToge1xuICAgICAgICAgICAgdHlwZTogJ29iamVjdCcsXG4gICAgICAgICAgICBwcm9wZXJ0aWVzOiB7XG4gICAgICAgICAgICAgIHZpZGVvU2NlbmVzOiB7XG4gICAgICAgICAgICAgICAgdHlwZTogJ2FycmF5JyxcbiAgICAgICAgICAgICAgICBpdGVtczoge1xuICAgICAgICAgICAgICAgICAgdHlwZTogJ29iamVjdCcsXG4gICAgICAgICAgICAgICAgICBwcm9wZXJ0aWVzOiB7XG4gICAgICAgICAgICAgICAgICAgIGRlc2NyaXB0aW9uOiB7IHR5cGU6ICdzdHJpbmcnIH0sXG4gICAgICAgICAgICAgICAgICAgIGR1cmF0aW9uOiB7IHR5cGU6ICdudW1iZXInIH0sXG4gICAgICAgICAgICAgICAgICAgIG5hcnJhdGlvbjogeyB0eXBlOiAnc3RyaW5nJyB9LFxuICAgICAgICAgICAgICAgICAgfSxcbiAgICAgICAgICAgICAgICB9LFxuICAgICAgICAgICAgICB9LFxuICAgICAgICAgICAgICB2b2ljZVRvbmVJbnN0cnVjdGlvbjogeyB0eXBlOiAnc3RyaW5nJyB9LFxuICAgICAgICAgICAgfSxcbiAgICAgICAgICB9LFxuICAgICAgICB9LFxuICAgICAgfSxcbiAgICB9KTtcblxuICAgIGNvbnNvbGUubG9nKCfwn6SWIE9wZW5BSSByZXNwb25zZTonLCByZXNwb25zZSk7XG5cbiAgICBjb25zdCBjb250ZW50ID0gcmVzcG9uc2UuY2hvaWNlc1swXT8ubWVzc2FnZT8uY29udGVudDtcbiAgICBjb25zb2xlLmxvZygn8J+ThCBPcGVuQUkgcmVzcG9uc2UgY29udGVudDonLCBjb250ZW50KTtcblxuICAgIGlmICghY29udGVudCkge1xuICAgICAgY29uc29sZS5sb2coJ+KdjCBFcnJvcjogT3BlbkFJIGRpZCBub3QgcmV0dXJuIGNvbnRlbnQnKTtcbiAgICAgIHRocm93IG5ldyBFcnJvcignRmFpbGVkIHRvIGdlbmVyYXRlIHN0b3J5IGJyZWFrZG93bicpO1xuICAgIH1cblxuICAgIGNvbnN0IHBhcnNlZFJlc3BvbnNlID0gSlNPTi5wYXJzZShjb250ZW50KTtcbiAgICBjb25zdCBzY2VuZXMgPSBwYXJzZWRSZXNwb25zZS52aWRlb1NjZW5lcyB8fCBwYXJzZWRSZXNwb25zZTtcbiAgICBjb25zdCB2b2ljZVRvbmVJbnN0cnVjdGlvbiA9XG4gICAgICBwYXJzZWRSZXNwb25zZS52b2ljZVRvbmVJbnN0cnVjdGlvbiB8fFxuICAgICAgJ1NwZWFrIGluIGEgY2hlZXJmdWwgYW5kIHBvc2l0aXZlIHRvbmUnO1xuXG4gICAgLy8gUG9zdC1wcm9jZXNzIHNjZW5lcyB0byBlbnN1cmUgdGV4dCBmaXRzIGR1cmF0aW9uXG4gICAgY29uc3QgYWRqdXN0ZWRTY2VuZXMgPSBzY2VuZXMubWFwKChzY2VuZTogU2NlbmUsIGlkeDogbnVtYmVyKSA9PiB7XG4gICAgICBjb25zdCBhZGp1c3RlZE5hcnJhdGlvbiA9IGFkanVzdFRleHRGb3JEdXJhdGlvbihcbiAgICAgICAgc2NlbmUubmFycmF0aW9uLFxuICAgICAgICBzY2VuZS5kdXJhdGlvbixcbiAgICAgICk7XG4gICAgICBjb25zdCBvcmlnaW5hbER1cmF0aW9uID0gZXN0aW1hdGVUZXh0RHVyYXRpb24oc2NlbmUubmFycmF0aW9uKTtcbiAgICAgIGNvbnN0IGFkanVzdGVkRHVyYXRpb24gPSBlc3RpbWF0ZVRleHREdXJhdGlvbihhZGp1c3RlZE5hcnJhdGlvbik7XG5cbiAgICAgIGNvbnNvbGUubG9nKGDwn5OdIFNjZW5lICR7c2NlbmUuZGVzY3JpcHRpb24uc3Vic3RyaW5nKDAsIDUwKX0uLi5gKTtcbiAgICAgIGNvbnNvbGUubG9nKFxuICAgICAgICBgICAgT3JpZ2luYWw6ICR7b3JpZ2luYWxEdXJhdGlvbi50b0ZpeGVkKFxuICAgICAgICAgIDEsXG4gICAgICAgICl9cywgQWRqdXN0ZWQ6ICR7YWRqdXN0ZWREdXJhdGlvbi50b0ZpeGVkKDEpfXMsIFRhcmdldDogJHtcbiAgICAgICAgICBzY2VuZS5kdXJhdGlvblxuICAgICAgICB9c2AsXG4gICAgICApO1xuXG4gICAgICByZXR1cm4ge1xuICAgICAgICAuLi5zY2VuZSxcbiAgICAgICAgbmFycmF0aW9uOiBhZGp1c3RlZE5hcnJhdGlvbixcbiAgICAgICAgaWQ6IGlkeCxcbiAgICAgIH07XG4gICAgfSk7XG5cbiAgICBjb25zb2xlLmxvZygn4pyFIFN0b3J5IGJyZWFrZG93biBwYXJzZWQgYW5kIGFkanVzdGVkIHN1Y2Nlc3NmdWxseScpO1xuICAgIGNvbnNvbGUubG9nKCfwn46kIFZvaWNlIHRvbmUgaW5zdHJ1Y3Rpb246Jywgdm9pY2VUb25lSW5zdHJ1Y3Rpb24pO1xuICAgIHJldHVybiB7IHNjZW5lczogYWRqdXN0ZWRTY2VuZXMsIHZvaWNlVG9uZUluc3RydWN0aW9uIH07XG4gIH0gY2F0Y2ggKGVycm9yKSB7XG4gICAgY29uc29sZS5lcnJvcign4p2MIEVycm9yIGluIGdlbmVyYXRlU3RvcnlCcmVha2Rvd246JywgZXJyb3IpO1xuICAgIHRocm93IGVycm9yO1xuICB9XG59XG4iXX0=