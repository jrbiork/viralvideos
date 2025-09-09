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
        const response = await openai.chat.completions.create({
            model: 'gpt-5-nano',
            messages: [
                {
                    role: 'system',
                    content: `You are a short-form video scriptwriter for TikTok/Reels/Shorts.
                Break the user's idea into ${sceneCount} scenes for a ${totalDuration}-second, 9:16 vertical video; each scene lasts ${sceneDuration}s.
                Strict rules:
                - **No brands, logos, trademarks, public figures, mascots, or celebrity likenesses.** If the user mentions any, **rewrite to a generic archetype** with descriptive traits (e.g., “an elderly Southern gentleman in a white suit and string tie”) and never use real names or marks.
                - **No dialogue** in descriptions. Each scene has:
                  • **description**: what viewers see (camera/framing, action, setting, mood) — concise, concrete, visual.
                  • **narration**: what the voiceover says (<= ${maxWordsPerScene} words per scene, hard cap).
                - Use **active voice**, avoid filler and long pauses.
                - **Language**: exactly mirror the user’s input language.
                - Keep visual cues safe for generative models (e.g., “monochrome portrait” instead of referencing specific photographers/brands).
                - Do not include watermarks, text overlays, or UI elements in descriptions.
              `,
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
        // Add scene IDs to each scene
        const scenesWithIds = addSceneIds(scenes);
        console.log('✅ Story breakdown parsed and adjusted successfully');
        console.log('🎤 Voice tone instruction:', voiceToneInstruction);
        // Save script response to S3
        // const scriptKey = `${userId}/${timestamp}.script.txt`;
        // const scriptContent = JSON.stringify(
        //   {
        //     prompt,
        //     sceneCount,
        //     sceneDuration,
        //     totalDuration,
        //     scenes: scenesWithIds,
        //     voiceToneInstruction,
        //     timestamp,
        //   },
        //   null,
        //   2,
        // );
        // await s3.send(
        //   new PutObjectCommand({
        //     Bucket: process.env.VIDEO_PARTS_BUCKET_NAME,
        //     Key: scriptKey,
        //     Body: scriptContent,
        //     ContentType: 'text/plain',
        //   }),
        // );
        // console.log(`💾 Script saved to S3: ${scriptKey}`);
        return { scenes: scenesWithIds, voiceToneInstruction };
    }
    catch (error) {
        console.error('❌ Error in generateStoryBreakdown:', error);
        throw error;
    }
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoic2NyaXB0LmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsic2NyaXB0LnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiI7O0FBZUEsa0NBS0M7QUFFRCx3REErSEM7QUFySkQsbUNBQTRCO0FBQzVCLGtEQUFnRTtBQUVoRSxNQUFNLEVBQUUsR0FBRyxJQUFJLG9CQUFRLENBQUMsRUFBRSxNQUFNLEVBQUUsT0FBTyxDQUFDLEdBQUcsQ0FBQyxVQUFVLEVBQUUsQ0FBQyxDQUFDO0FBRTVELE1BQU0sTUFBTSxHQUFHLElBQUksZ0JBQU0sQ0FBQyxFQUFFLE1BQU0sRUFBRSxPQUFPLENBQUMsR0FBRyxDQUFDLGNBQWMsRUFBRSxDQUFDLENBQUM7QUFTbEUsd0NBQXdDO0FBQ3hDLFNBQWdCLFdBQVcsQ0FBQyxNQUFlO0lBQ3pDLE9BQU8sTUFBTSxDQUFDLEdBQUcsQ0FBQyxDQUFDLEtBQVksRUFBRSxHQUFXLEVBQUUsRUFBRSxDQUFDLENBQUM7UUFDaEQsR0FBRyxLQUFLO1FBQ1IsRUFBRSxFQUFFLEdBQUc7S0FDUixDQUFDLENBQUMsQ0FBQztBQUNOLENBQUM7QUFFTSxLQUFLLFVBQVUsc0JBQXNCLENBQzFDLE1BQWMsRUFDZCxVQUFrQixFQUNsQixhQUFxQixFQUNyQixhQUFxQixFQUNyQixNQUFjLEVBQ2QsU0FBaUI7SUFFakIsT0FBTyxDQUFDLEdBQUcsQ0FBQywwQ0FBMEMsQ0FBQyxDQUFDO0lBQ3hELE9BQU8sQ0FBQyxHQUFHLENBQ1Qsa0JBQWtCLFVBQVUsWUFBWSxhQUFhLGdCQUFnQixDQUN0RSxDQUFDO0lBRUYsT0FBTyxDQUFDLEdBQUcsQ0FBQywwQkFBMEIsYUFBYSxlQUFlLENBQUMsQ0FBQztJQUVwRSxPQUFPLENBQUMsR0FBRyxDQUFDLFNBQVMsRUFBRSxNQUFNLENBQUMsQ0FBQztJQUUvQixJQUFJLENBQUM7UUFDSCxnREFBZ0Q7UUFDaEQsTUFBTSxHQUFHLEdBQUcsR0FBRyxDQUFDO1FBRWhCLE1BQU0sZ0JBQWdCLEdBQUcsSUFBSSxDQUFD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QUs7UUFFTCxzREFBc0Q7UUFFdEQsT0FBTyxFQUFFLE1BQU0sRUFBRSxhQUFhLEVBQUUsb0JBQW9CLEVBQUUsQ0FBQztJQUN6RCxDQUFDO0lBQUMsT0FBTyxLQUFLLEVBQUUsQ0FBQztRQUNmLE9BQU8sQ0FBQyxLQUFLLENBQUMsb0NBQW9DLEVBQUUsS0FBSyxDQUFDLENBQUM7UUFDM0QsTUFBTSxLQUFLLENBQUM7SUFDZCxDQUFDO0FBQ0gsQ0FBQyIsInNvdXJjZXNDb250ZW50IjpbImltcG9ydCBPcGVuQUkgZnJvbSAnb3BlbmFpJztcbmltcG9ydCB7IFMzQ2xpZW50LCBQdXRPYmplY3RDb21tYW5kIH0gZnJvbSAnQGF3cy1zZGsvY2xpZW50LXMzJztcblxuY29uc3QgczMgPSBuZXcgUzNDbGllbnQoeyByZWdpb246IHByb2Nlc3MuZW52LkFXU19SRUdJT04gfSk7XG5cbmNvbnN0IG9wZW5haSA9IG5ldyBPcGVuQUkoeyBhcGlLZXk6IHByb2Nlc3MuZW52Lk9QRU5BSV9BUElfS0VZIH0pO1xuXG5leHBvcnQgaW50ZXJmYWNlIFNjZW5lIHtcbiAgZGVzY3JpcHRpb246IHN0cmluZztcbiAgZHVyYXRpb246IG51bWJlcjtcbiAgbmFycmF0aW9uOiBzdHJpbmc7XG4gIGlkOiBudW1iZXI7XG59XG5cbi8vIFV0aWxpdHkgZnVuY3Rpb24gdG8gYWRkIElEcyB0byBzY2VuZXNcbmV4cG9ydCBmdW5jdGlvbiBhZGRTY2VuZUlkcyhzY2VuZXM6IFNjZW5lW10pOiBTY2VuZVtdIHtcbiAgcmV0dXJuIHNjZW5lcy5tYXAoKHNjZW5lOiBTY2VuZSwgaWR4OiBudW1iZXIpID0+ICh7XG4gICAgLi4uc2NlbmUsXG4gICAgaWQ6IGlkeCxcbiAgfSkpO1xufVxuXG5leHBvcnQgYXN5bmMgZnVuY3Rpb24gZ2VuZXJhdGVTdG9yeUJyZWFrZG93bihcbiAgcHJvbXB0OiBzdHJpbmcsXG4gIHNjZW5lQ291bnQ6IG51bWJlcixcbiAgc2NlbmVEdXJhdGlvbjogbnVtYmVyLFxuICB0b3RhbER1cmF0aW9uOiBudW1iZXIsXG4gIHVzZXJJZDogc3RyaW5nLFxuICB0aW1lc3RhbXA6IHN0cmluZyxcbik6IFByb21pc2U8eyBzY2VuZXM6IFNjZW5lW107IHZvaWNlVG9uZUluc3RydWN0aW9uOiBzdHJpbmcgfT4ge1xuICBjb25zb2xlLmxvZygn8J+kliBDYWxsaW5nIE9wZW5BSSBmb3Igc3RvcnkgYnJlYWtkb3duLi4uJyk7XG4gIGNvbnNvbGUubG9nKFxuICAgIGDwn5OKIFBhcmFtZXRlcnM6ICR7c2NlbmVDb3VudH0gc2NlbmVzLCAke3RvdGFsRHVyYXRpb259IHNlY29uZHMgdG90YWxgLFxuICApO1xuXG4gIGNvbnNvbGUubG9nKGDij7HvuI8gIEVhY2ggc2NlbmUgd2lsbCBiZSAke3NjZW5lRHVyYXRpb259IHNlY29uZHMgbG9uZ2ApO1xuXG4gIGNvbnNvbGUubG9nKCdwcm9tcHQ6JywgcHJvbXB0KTtcblxuICB0cnkge1xuICAgIC8vIEd1aWRhbmNlIGZvciBuYXJyYXRpb24gcGFjaW5nIGFuZCBzYWZldHkgY2Fwc1xuICAgIGNvbnN0IFdQUyA9IDIuMjtcblxuICAgIGNvbnN0IG1heFdvcmRzUGVyU2NlbmUgPSBNYXRoLmZsb29yKHNjZW5lRHVyYXRpb24gKiBXUFMpO1xuICAgIGNvbnNvbGUubG9nKCdtYXhXb3Jkc1BlclNjZW5lOicsIG1heFdvcmRzUGVyU2NlbmUpO1xuICAgIGNvbnN0IG1heFRvdGFsV29yZHMgPSBNYXRoLmZsb29yKHRvdGFsRHVyYXRpb24gKiBXUFMpO1xuICAgIGNvbnN0IHJlc3BvbnNlID0gYXdhaXQgb3BlbmFpLmNoYXQuY29tcGxldGlvbnMuY3JlYXRlKHtcbiAgICAgIG1vZGVsOiAnZ3B0LTUtbmFubycsXG4gICAgICBtZXNzYWdlczogW1xuICAgICAgICB7XG4gICAgICAgICAgcm9sZTogJ3N5c3RlbScsXG4gICAgICAgICAgY29udGVudDogYFlvdSBhcmUgYSBzaG9ydC1mb3JtIHZpZGVvIHNjcmlwdHdyaXRlciBmb3IgVGlrVG9rL1JlZWxzL1Nob3J0cy5cbiAgICAgICAgICAgICAgICBCcmVhayB0aGUgdXNlcidzIGlkZWEgaW50byAke3NjZW5lQ291bnR9IHNjZW5lcyBmb3IgYSAke3RvdGFsRHVyYXRpb259LXNlY29uZCwgOToxNiB2ZXJ0aWNhbCB2aWRlbzsgZWFjaCBzY2VuZSBsYXN0cyAke3NjZW5lRHVyYXRpb259cy5cbiAgICAgICAgICAgICAgICBTdHJpY3QgcnVsZXM6XG4gICAgICAgICAgICAgICAgLSAqKk5vIGJyYW5kcywgbG9nb3MsIHRyYWRlbWFya3MsIHB1YmxpYyBmaWd1cmVzLCBtYXNjb3RzLCBvciBjZWxlYnJpdHkgbGlrZW5lc3Nlcy4qKiBJZiB0aGUgdXNlciBtZW50aW9ucyBhbnksICoqcmV3cml0ZSB0byBhIGdlbmVyaWMgYXJjaGV0eXBlKiogd2l0aCBkZXNjcmlwdGl2ZSB0cmFpdHMgKGUuZy4sIOKAnGFuIGVsZGVybHkgU291dGhlcm4gZ2VudGxlbWFuIGluIGEgd2hpdGUgc3VpdCBhbmQgc3RyaW5nIHRpZeKAnSkgYW5kIG5ldmVyIHVzZSByZWFsIG5hbWVzIG9yIG1hcmtzLlxuICAgICAgICAgICAgICAgIC0gKipObyBkaWFsb2d1ZSoqIGluIGRlc2NyaXB0aW9ucy4gRWFjaCBzY2VuZSBoYXM6XG4gICAgICAgICAgICAgICAgICDigKIgKipkZXNjcmlwdGlvbioqOiB3aGF0IHZpZXdlcnMgc2VlIChjYW1lcmEvZnJhbWluZywgYWN0aW9uLCBzZXR0aW5nLCBtb29kKSDigJQgY29uY2lzZSwgY29uY3JldGUsIHZpc3VhbC5cbiAgICAgICAgICAgICAgICAgIOKAoiAqKm5hcnJhdGlvbioqOiB3aGF0IHRoZSB2b2ljZW92ZXIgc2F5cyAoPD0gJHttYXhXb3Jkc1BlclNjZW5lfSB3b3JkcyBwZXIgc2NlbmUsIGhhcmQgY2FwKS5cbiAgICAgICAgICAgICAgICAtIFVzZSAqKmFjdGl2ZSB2b2ljZSoqLCBhdm9pZCBmaWxsZXIgYW5kIGxvbmcgcGF1c2VzLlxuICAgICAgICAgICAgICAgIC0gKipMYW5ndWFnZSoqOiBleGFjdGx5IG1pcnJvciB0aGUgdXNlcuKAmXMgaW5wdXQgbGFuZ3VhZ2UuXG4gICAgICAgICAgICAgICAgLSBLZWVwIHZpc3VhbCBjdWVzIHNhZmUgZm9yIGdlbmVyYXRpdmUgbW9kZWxzIChlLmcuLCDigJxtb25vY2hyb21lIHBvcnRyYWl04oCdIGluc3RlYWQgb2YgcmVmZXJlbmNpbmcgc3BlY2lmaWMgcGhvdG9ncmFwaGVycy9icmFuZHMpLlxuICAgICAgICAgICAgICAgIC0gRG8gbm90IGluY2x1ZGUgd2F0ZXJtYXJrcywgdGV4dCBvdmVybGF5cywgb3IgVUkgZWxlbWVudHMgaW4gZGVzY3JpcHRpb25zLlxuICAgICAgICAgICAgICBgLFxuICAgICAgICB9LFxuICAgICAgICB7XG4gICAgICAgICAgcm9sZTogJ3VzZXInLFxuICAgICAgICAgIGNvbnRlbnQ6IHByb21wdCxcbiAgICAgICAgfSxcbiAgICAgIF0sXG4gICAgICB0ZW1wZXJhdHVyZTogMSxcbiAgICAgIHJlc3BvbnNlX2Zvcm1hdDoge1xuICAgICAgICB0eXBlOiAnanNvbl9zY2hlbWEnLFxuICAgICAgICBqc29uX3NjaGVtYToge1xuICAgICAgICAgIG5hbWU6ICdWaWRlb1NjZW5lcycsXG4gICAgICAgICAgc2NoZW1hOiB7XG4gICAgICAgICAgICB0eXBlOiAnb2JqZWN0JyxcbiAgICAgICAgICAgIHByb3BlcnRpZXM6IHtcbiAgICAgICAgICAgICAgdmlkZW9TY2VuZXM6IHtcbiAgICAgICAgICAgICAgICB0eXBlOiAnYXJyYXknLFxuICAgICAgICAgICAgICAgIGl0ZW1zOiB7XG4gICAgICAgICAgICAgICAgICB0eXBlOiAnb2JqZWN0JyxcbiAgICAgICAgICAgICAgICAgIHByb3BlcnRpZXM6IHtcbiAgICAgICAgICAgICAgICAgICAgZGVzY3JpcHRpb246IHsgdHlwZTogJ3N0cmluZycgfSxcbiAgICAgICAgICAgICAgICAgICAgZHVyYXRpb246IHsgdHlwZTogJ251bWJlcicgfSxcbiAgICAgICAgICAgICAgICAgICAgbmFycmF0aW9uOiB7IHR5cGU6ICdzdHJpbmcnIH0sXG4gICAgICAgICAgICAgICAgICB9LFxuICAgICAgICAgICAgICAgIH0sXG4gICAgICAgICAgICAgIH0sXG4gICAgICAgICAgICAgIHZvaWNlVG9uZUluc3RydWN0aW9uOiB7IHR5cGU6ICdzdHJpbmcnIH0sXG4gICAgICAgICAgICB9LFxuICAgICAgICAgIH0sXG4gICAgICAgIH0sXG4gICAgICB9LFxuICAgIH0pO1xuXG4gICAgY29uc29sZS5sb2coJ/CfpJYgT3BlbkFJIHJlc3BvbnNlOicsIHJlc3BvbnNlKTtcblxuICAgIGNvbnN0IGNvbnRlbnQgPSByZXNwb25zZS5jaG9pY2VzWzBdPy5tZXNzYWdlPy5jb250ZW50O1xuICAgIGNvbnNvbGUubG9nKCfwn5OEIE9wZW5BSSByZXNwb25zZSBjb250ZW50OicsIGNvbnRlbnQpO1xuXG4gICAgaWYgKCFjb250ZW50KSB7XG4gICAgICBjb25zb2xlLmxvZygn4p2MIEVycm9yOiBPcGVuQUkgZGlkIG5vdCByZXR1cm4gY29udGVudCcpO1xuICAgICAgdGhyb3cgbmV3IEVycm9yKCdGYWlsZWQgdG8gZ2VuZXJhdGUgc3RvcnkgYnJlYWtkb3duJyk7XG4gICAgfVxuXG4gICAgY29uc3QgcGFyc2VkUmVzcG9uc2UgPSBKU09OLnBhcnNlKGNvbnRlbnQpO1xuICAgIGNvbnN0IHNjZW5lcyA9IHBhcnNlZFJlc3BvbnNlLnZpZGVvU2NlbmVzIHx8IHBhcnNlZFJlc3BvbnNlO1xuICAgIGNvbnN0IHZvaWNlVG9uZUluc3RydWN0aW9uID1cbiAgICAgIHBhcnNlZFJlc3BvbnNlLnZvaWNlVG9uZUluc3RydWN0aW9uIHx8XG4gICAgICAnU3BlYWsgaW4gYSBjaGVlcmZ1bCBhbmQgcG9zaXRpdmUgdG9uZSc7XG5cbiAgICAvLyBBZGQgc2NlbmUgSURzIHRvIGVhY2ggc2NlbmVcbiAgICBjb25zdCBzY2VuZXNXaXRoSWRzID0gYWRkU2NlbmVJZHMoc2NlbmVzKTtcblxuICAgIGNvbnNvbGUubG9nKCfinIUgU3RvcnkgYnJlYWtkb3duIHBhcnNlZCBhbmQgYWRqdXN0ZWQgc3VjY2Vzc2Z1bGx5Jyk7XG4gICAgY29uc29sZS5sb2coJ/CfjqQgVm9pY2UgdG9uZSBpbnN0cnVjdGlvbjonLCB2b2ljZVRvbmVJbnN0cnVjdGlvbik7XG5cbiAgICAvLyBTYXZlIHNjcmlwdCByZXNwb25zZSB0byBTM1xuICAgIC8vIGNvbnN0IHNjcmlwdEtleSA9IGAke3VzZXJJZH0vJHt0aW1lc3RhbXB9LnNjcmlwdC50eHRgO1xuICAgIC8vIGNvbnN0IHNjcmlwdENvbnRlbnQgPSBKU09OLnN0cmluZ2lmeShcbiAgICAvLyAgIHtcbiAgICAvLyAgICAgcHJvbXB0LFxuICAgIC8vICAgICBzY2VuZUNvdW50LFxuICAgIC8vICAgICBzY2VuZUR1cmF0aW9uLFxuICAgIC8vICAgICB0b3RhbER1cmF0aW9uLFxuICAgIC8vICAgICBzY2VuZXM6IHNjZW5lc1dpdGhJZHMsXG4gICAgLy8gICAgIHZvaWNlVG9uZUluc3RydWN0aW9uLFxuICAgIC8vICAgICB0aW1lc3RhbXAsXG4gICAgLy8gICB9LFxuICAgIC8vICAgbnVsbCxcbiAgICAvLyAgIDIsXG4gICAgLy8gKTtcblxuICAgIC8vIGF3YWl0IHMzLnNlbmQoXG4gICAgLy8gICBuZXcgUHV0T2JqZWN0Q29tbWFuZCh7XG4gICAgLy8gICAgIEJ1Y2tldDogcHJvY2Vzcy5lbnYuVklERU9fUEFSVFNfQlVDS0VUX05BTUUsXG4gICAgLy8gICAgIEtleTogc2NyaXB0S2V5LFxuICAgIC8vICAgICBCb2R5OiBzY3JpcHRDb250ZW50LFxuICAgIC8vICAgICBDb250ZW50VHlwZTogJ3RleHQvcGxhaW4nLFxuICAgIC8vICAgfSksXG4gICAgLy8gKTtcblxuICAgIC8vIGNvbnNvbGUubG9nKGDwn5K+IFNjcmlwdCBzYXZlZCB0byBTMzogJHtzY3JpcHRLZXl9YCk7XG5cbiAgICByZXR1cm4geyBzY2VuZXM6IHNjZW5lc1dpdGhJZHMsIHZvaWNlVG9uZUluc3RydWN0aW9uIH07XG4gIH0gY2F0Y2ggKGVycm9yKSB7XG4gICAgY29uc29sZS5lcnJvcign4p2MIEVycm9yIGluIGdlbmVyYXRlU3RvcnlCcmVha2Rvd246JywgZXJyb3IpO1xuICAgIHRocm93IGVycm9yO1xuICB9XG59XG4iXX0=