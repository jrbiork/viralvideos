"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.processVideoGeneration = processVideoGeneration;
const client_sqs_1 = require("@aws-sdk/client-sqs");
const audio_1 = require("../utils/audio");
const subtitles_1 = require("../utils/subtitles");
const script_1 = require("../utils/script");
const script_2 = require("../utils/script");
const s3Uploader_1 = require("../utils/s3Uploader");
const audioUtils_1 = require("../utils/audioUtils");
const imageUtils_1 = require("../utils/imageUtils");
const imageNanoBanana_1 = require("../utils/imageNanoBanana");
// Constants
const DEFAULT_VOICE = 'ash';
const DEFAULT_LANGUAGE = 'en';
const videoEffects_1 = require("../utils/videoEffects");
const manifestUtils_1 = require("../utils/manifestUtils");
const broadcastProgress_1 = require("../utils/broadcastProgress");
const user_1 = require("../utils/user");
const sqs = new client_sqs_1.SQSClient({ region: process.env.AWS_REGION || 'us-east-1' });
async function processVideoGeneration(request, record) {
    try {
        console.log('processVideoGeneration:', request);
        console.log('request.voice:', request.voice);
        // Use timestamp
        const timestamp = request.timestamp;
        const sceneDuration = Math.floor(request.totalDuration / request.sceneCount);
        let scenes = [];
        let voiceToneInstruction = '';
        // check if the video is already generated
        let manifest = await (0, manifestUtils_1.getManifest)(request.userId, request.timestamp);
        if (manifest) {
            console.log('🎥 Video already generated, skipping video generation');
            const manifestHydrated = await (0, manifestUtils_1.hydrateManifest)(manifest);
            await (0, broadcastProgress_1.broadcastProgress)('preview_completed', request.userId, request.timestamp, { manifest: manifestHydrated }, 'Video generated successfully');
            return {
                message: 'Video already generated',
                manifest: manifestHydrated,
            };
        }
        // Check if there is already script generated in the s3 bucket for the timestamp
        const scriptKey = `${request.userId}/${timestamp}.script.txt`;
        const existingScript = await (0, s3Uploader_1.getObjectFromS3)(scriptKey);
        // Step 1: Generate script/story breakdown using GPT-4
        if (existingScript) {
            console.log('🎥 Script already generated for the timestamp, using existing script');
            scenes = (0, script_1.addSceneIds)(existingScript.scenes);
            voiceToneInstruction = existingScript.voiceToneInstruction;
        }
        else {
            console.log('🎥 No existing script found, generating new story breakdown');
            if (!request.prompt) {
                console.log('❌ Error: No prompt provided');
                throw new Error('No prompt provided');
            }
            const storyBreakdown = await (0, script_2.generateStoryBreakdown)(request.prompt, request.sceneCount, sceneDuration, request.totalDuration);
            scenes = storyBreakdown.scenes;
            voiceToneInstruction = storyBreakdown.voiceToneInstruction;
        }
        if (!scenes || scenes.length === 0) {
            console.log('❌ Error: Failed to get or generate story breakdown');
            throw new Error('Failed to get or generate story breakdown');
        }
        console.log('🎥 Story breakdown generated:', scenes);
        console.log('🖼️ Received imageTemplate:', request.imageTemplate);
        // Step 2: Generate images for each scene in parallel
        const generateImagesStep = async () => {
            // Check if there are already images generated in the s3 bucket for the timestamp
            const imageUrls = await (0, imageUtils_1.getImageUrls)(request.userId, timestamp);
            if (imageUrls.length > 0) {
                console.log('🎥 Images already generated for the timestamp:', imageUrls);
                return;
            }
            const seed = Math.floor(Math.random() * 1000000);
            console.log('🎨 Generating images for each scene in parallel...');
            try {
                const imagePromises = scenes.map(async (scene, i) => {
                    console.log(`🎨 Generating image for scene ${i + 1}:`, scene.description);
                    const imageDescription = `[${request.imageTemplate}]: ${scene.description}`;
                    const result = await (0, imageNanoBanana_1.generateNanoBananaImage)(imageDescription, scene.id, request.userId, timestamp, seed);
                    console.log(`✅ Scene ${i + 1} image generated: done`);
                    return result;
                });
                // Wait for all images to be generated using allSettled for better error handling
                console.log('⏳ Waiting for all image generation to complete...');
                const results = await Promise.allSettled(imagePromises);
                // Log results and handle failures
                const successful = results.filter((result) => result.status === 'fulfilled');
                const failed = results.filter((result) => result.status === 'rejected');
                console.log(`✅ Image generation results: ${successful.length} successful, ${failed.length} failed`);
                // Log failed promises with detailed error info
                failed.forEach((result, index) => {
                    if (result.status === 'rejected') {
                        console.error(`❌ Scene ${index} image generation failed:`, result.reason);
                    }
                });
                // Continue processing even if some images failed
                if (successful.length === 0) {
                    throw new Error('All image generation attempts failed');
                }
                console.log(`🎨 Successfully generated ${successful.length} out of ${results.length} images`);
                console.log('🖼️ Images uploaded to S3');
            }
            catch (error) {
                console.error('❌ Failed to generate images:', error);
            }
        };
        // Step 3: Generate audio narration and subtitles for each scene
        const generateAudioStep = async () => {
            // check if all together if .mp3, .subtitle.json, .ass files are already exists in the s3 bucket and return boolean
            const audioCaptionFilesExist = await (0, audioUtils_1.checkAudioCaptionExists)(request.userId, timestamp);
            if (audioCaptionFilesExist) {
                console.log('🎥 Audio, subtitle, and ass files already generated for the timestamp:', audioCaptionFilesExist);
                return;
            }
            console.log('🎥 No existing audio, subtitle, and ass files found, generating new narration');
            // Generate audio files with word-level timestamps
            const { subtitles } = await (0, audio_1.generateNarration)(scenes, request.userId, timestamp, voiceToneInstruction, request.voice || DEFAULT_VOICE, request.language || DEFAULT_LANGUAGE);
            // update scenes duration
            scenes.forEach((scene, i) => {
                scene.duration = subtitles[i].duration || 10;
                console.log('subtitles[i].duration:', subtitles[i].duration);
            });
            // Generate subtitle file
            await (0, subtitles_1.generateSubtitles)(scenes, request.userId, timestamp, subtitles);
        };
        // Images and audio both depend only on the script, so run them concurrently.
        // Image failures are swallowed inside generateImagesStep (as before);
        // an audio failure must still fail the whole run.
        await Promise.all([generateImagesStep(), generateAudioStep()]);
        console.log('🎥 Scenes before creating manifest:', JSON.stringify(scenes, null, 2));
        // Create manifest and upload to s3
        await (0, manifestUtils_1.createManifest)(request.userId, timestamp, scenes, request.totalDuration, voiceToneInstruction, request.voice || DEFAULT_VOICE, request.language || DEFAULT_LANGUAGE, request.imageTemplate);
        manifest = await (0, manifestUtils_1.getManifest)(request.userId, request.timestamp);
        let manifestHydrated = await (0, manifestUtils_1.hydrateManifest)(manifest);
        await (0, broadcastProgress_1.broadcastProgress)('audio_subtitle_created', request.userId, timestamp, {
            manifest: manifestHydrated,
        }, 'Audio and Subtitles completed');
        // get the user's subscription
        const user = await (0, user_1.getUser)(request.userId);
        console.log('User fetched:', JSON.stringify(user, null, 2));
        // Step 4: Generate camera movements from image
        // check if there are already all the video effects generated in the s3 bucket for the timestamp
        await (0, videoEffects_1.getVideoEffectUrls)(request.userId, timestamp, scenes, user);
        console.log('🎬 Video effects URLs generated:');
        // Re-fetch rather than reusing the in-memory `manifest` from before
        // getVideoEffectUrls — that step can take 10s+ per scene, and if the
        // user applies narration/image edits during that window, a concurrent
        // batch-edit invocation writes them to S3. Broadcasting the stale
        // in-memory copy here would clobber the frontend's view of those edits
        // with pre-edit data even though S3 itself is correct.
        manifest = (await (0, manifestUtils_1.getManifest)(request.userId, request.timestamp)) || manifest;
        console.log('🎬 Manifest preview completed:', JSON.stringify(manifest, null, 2));
        manifestHydrated = await (0, manifestUtils_1.hydrateManifest)(manifest);
        await (0, broadcastProgress_1.broadcastProgress)('preview_completed', request.userId, timestamp, { manifest: manifestHydrated }, 'Video generated successfully');
        // If this was triggered by SQS, delete the message from the queue
        if (record && process.env.VIDEO_QUEUE_URL) {
            const deleteCommand = new client_sqs_1.DeleteMessageCommand({
                QueueUrl: process.env.VIDEO_QUEUE_URL,
                ReceiptHandle: record.receiptHandle,
            });
            await sqs.send(deleteCommand);
        }
        return {
            message: 'Preview generated successfully',
        };
    }
    catch (error) {
        console.error('Error in video generation:', error);
        throw Error('Video generation failed');
    }
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoicHJvY2Vzc1ZpZGVvR2VuZXJhdGlvbi5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbInByb2Nlc3NWaWRlb0dlbmVyYXRpb24udHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6Ijs7QUFzQ0Esd0RBc1JDO0FBM1RELG9EQUFzRTtBQUN0RSwwQ0FBbUQ7QUFDbkQsa0RBQXVEO0FBQ3ZELDRDQUE4QztBQUM5Qyw0Q0FBZ0U7QUFDaEUsb0RBQWtFO0FBQ2xFLG9EQUE4RDtBQUM5RCxvREFBbUQ7QUFDbkQsOERBQW1FO0FBRW5FLFlBQVk7QUFDWixNQUFNLGFBQWEsR0FBRyxLQUFLLENBQUM7QUFDNUIsTUFBTSxnQkFBZ0IsR0FBRyxJQUFJLENBQUM7QUFDOUIsd0RBQTJEO0FBQzNELDBEQUlnQztBQUNoQyxrRUFBK0Q7QUFDL0Qsd0NBQXdDO0FBRXhDLE1BQU0sR0FBRyxHQUFHLElBQUksc0JBQVMsQ0FBQyxFQUFFLE1BQU0sRUFBRSxPQUFPLENBQUMsR0FBRyxDQUFDLFVBQVUsSUFBSSxXQUFXLEVBQUUsQ0FBQyxDQUFDO0FBZXRFLEtBQUssVUFBVSxzQkFBc0IsQ0FDMUMsT0FBK0IsRUFDL0IsTUFBa0I7SUFFbEIsSUFBSSxDQUFDO1FBQ0gsT0FBTyxDQUFDLEdBQUcsQ0FBQyx5QkFBeUIsRUFBRSxPQUFPLENBQUMsQ0FBQztRQUVoRCxPQUFPLENBQUMsR0FBRyxDQUFDLGdCQUFnQixFQUFFLE9BQU8sQ0FBQyxLQUFLLENBQUMsQ0FBQztRQUU3QyxnQkFBZ0I7UUFDaEIsTUFBTSxTQUFTLEdBQUcsT0FBTyxDQUFDLFNBQVMsQ0FBQztRQUVwQyxNQUFNLGFBQWEsR0FBRyxJQUFJLENBQUMsS0FBSyxDQUM5QixPQUFPLENBQUMsYUFBYSxHQUFHLE9BQU8sQ0FBQyxVQUFVLENBQzNDLENBQUM7UUFFRixJQUFJLE1BQU0sR0FBWSxFQUFFLENBQUM7UUFDekIsSUFBSSxvQkFBb0IsR0FBVyxFQUFFLENBQUM7UUFFdEMsMENBQTBDO1FBQzFDLElBQUksUUFBUSxHQUFHLE1BQU0sSUFBQSwyQkFBVyxFQUFDLE9BQU8sQ0FBQyxNQUFNLEVBQUUsT0FBTyxDQUFDLFNBQVMsQ0FBQyxDQUFDO1FBRXBFLElBQUksUUFBUSxFQUFFLENBQUM7WUFDYixPQUFPLENBQUMsR0FBRyxDQUFDLHVEQUF1RCxDQUFDLENBQUM7WUFDckUsTUFBTSxnQkFBZ0IsR0FBRyxNQUFNLElBQUEsK0JBQWUsRUFBQyxRQUFRLENBQUMsQ0FBQztZQUN6RCxNQUFNLElBQUEscUNBQWlCLEVBQ3JCLG1CQUFtQixFQUNuQixPQUFPLENBQUMsTUFBTSxFQUNkLE9BQU8sQ0FBQyxTQUFTLEVBQ2pCLEVBQUUsUUFBUSxFQUFFLGdCQUFnQixFQUFFLEVBQzlCLDhCQUE4QixDQUMvQixDQUFDO1lBQ0YsT0FBTztnQkFDTCxPQUFPLEVBQUUseUJBQXlCO2dCQUNsQyxRQUFRLEVBQUUsZ0JBQWdCO2FBQzNCLENBQUM7UUFDSixDQUFDO1FBRUQsZ0ZBQWdGO1FBQ2hGLE1BQU0sU0FBUyxHQUFHLEdBQUcsT0FBTyxDQUFDLE1BQU0sSUFBSSxTQUFTLGFBQWEsQ0FBQztRQUM5RCxNQUFNLGNBQWMsR0FBRyxNQUFNLElBQUEsNEJBQWUsRUFBQyxTQUFTLENBQUMsQ0FBQztRQUV4RCxzREFBc0Q7UUFDdEQsSUFBSSxjQUFjLEVBQUUsQ0FBQztZQUNuQixPQUFPLENBQUMsR0FBRyxDQUNULHNFQUFzRSxDQUN2RSxDQUFDO1lBQ0YsTUFBTSxHQUFHLElBQUEsb0JBQVcsRUFBQyxjQUFjLENBQUMsTUFBTSxDQUFDLENBQUM7WUFDNUMsb0JBQW9CLEdBQUcsY0FBYyxDQUFDLG9CQUFvQixDQUFDO1FBQzdELENBQUM7YUFBTSxDQUFDO1lBQ04sT0FBTyxDQUFDLEdBQUcsQ0FDVCw2REFBNkQsQ0FDOUQsQ0FBQztZQUVGLElBQUksQ0FBQyxPQUFPLENBQUMsTUFBTSxFQUFFLENBQUM7Z0JBQ3BCLE9BQU8sQ0FBQyxHQUFHLENBQUMsNkJBQTZCLENBQUMsQ0FBQztnQkFDM0MsTUFBTSxJQUFJLEtBQUssQ0FBQyxvQkFBb0IsQ0FBQyxDQUFDO1lBQ3hDLENBQUM7WUFFRCxNQUFNLGNBQWMsR0FBRyxNQUFNLElBQUEsK0JBQXNCLEVBQ2pELE9BQU8sQ0FBQyxNQUFPLEVBQ2YsT0FBTyxDQUFDLFVBQVUsRUFDbEIsYUFBYSxFQUNiLE9BQU8sQ0FBQyxhQUFhLENBQ3RCLENBQUM7WUFDRixNQUFNLEdBQUcsY0FBYyxDQUFDLE1BQU0sQ0FBQztZQUMvQixvQkFBb0IsR0FBRyxjQUFjLENBQUMsb0JBQW9CLENBQUM7UUFDN0QsQ0FBQztRQUVELElBQUksQ0FBQyxNQUFNLElBQUksTUFBTSxDQUFDLE1BQU0sS0FBSyxDQUFDLEVBQUUsQ0FBQztZQUNuQyxPQUFPLENBQUMsR0FBRyxDQUFDLG9EQUFvRCxDQUFDLENBQUM7WUFDbEUsTUFBTSxJQUFJLEtBQUssQ0FBQywyQ0FBMkMsQ0FBQyxDQUFDO1FBQy9ELENBQUM7UUFFRCxPQUFPLENBQUMsR0FBRyxDQUFDLCtCQUErQixFQUFFLE1BQU0sQ0FBQyxDQUFDO1FBQ3JELE9BQU8sQ0FBQyxHQUFHLENBQUMsNkJBQTZCLEVBQUUsT0FBTyxDQUFDLGFBQWEsQ0FBQyxDQUFDO1FBRWxFLHFEQUFxRDtRQUNyRCxNQUFNLGtCQUFrQixHQUFHLEtBQUssSUFBSSxFQUFFO1lBQ3BDLGlGQUFpRjtZQUNqRixNQUFNLFNBQVMsR0FBRyxNQUFNLElBQUEseUJBQVksRUFBQyxPQUFPLENBQUMsTUFBTSxFQUFFLFNBQVMsQ0FBQyxDQUFDO1lBRWhFLElBQUksU0FBUyxDQUFDLE1BQU0sR0FBRyxDQUFDLEVBQUUsQ0FBQztnQkFDekIsT0FBTyxDQUFDLEdBQUcsQ0FDVCxnREFBZ0QsRUFDaEQsU0FBUyxDQUNWLENBQUM7Z0JBQ0YsT0FBTztZQUNULENBQUM7WUFFRCxNQUFNLElBQUksR0FBRyxJQUFJLENBQUMsS0FBSyxDQUFDLElBQUksQ0FBQyxNQUFNLEVBQUUsR0FBRyxPQUFPLENBQUMsQ0FBQztZQUVqRCxPQUFPLENBQUMsR0FBRyxDQUFDLG9EQUFvRCxDQUFDLENBQUM7WUFFbEUsSUFBSSxDQUFDO2dCQUNILE1BQU0sYUFBYSxHQUFHLE1BQU0sQ0FBQyxHQUFHLENBQUMsS0FBSyxFQUFFLEtBQVUsRUFBRSxDQUFTLEVBQUUsRUFBRTtvQkFDL0QsT0FBTyxDQUFDLEdBQUcsQ0FDVCxpQ0FBaUMsQ0FBQyxHQUFHLENBQUMsR0FBRyxFQUN6QyxLQUFLLENBQUMsV0FBVyxDQUNsQixDQUFDO29CQUVGLE1BQU0sZ0JBQWdCLEdBQUcsSUFBSSxPQUFPLENBQUMsYUFBYSxNQUFNLEtBQUssQ0FBQyxXQUFXLEVBQUUsQ0FBQztvQkFFNUUsTUFBTSxNQUFNLEdBQUcsTUFBTSxJQUFBLHlDQUF1QixFQUMxQyxnQkFBZ0IsRUFDaEIsS0FBSyxDQUFDLEVBQUUsRUFDUixPQUFPLENBQUMsTUFBTSxFQUNkLFNBQVMsRUFDVCxJQUFJLENBQ0wsQ0FBQztvQkFFRixPQUFPLENBQUMsR0FBRyxDQUFDLFdBQVcsQ0FBQyxHQUFHLENBQUMsd0JBQXdCLENBQUMsQ0FBQztvQkFDdEQsT0FBTyxNQUFNLENBQUM7Z0JBQ2hCLENBQUMsQ0FBQyxDQUFDO2dCQUVILGlGQUFpRjtnQkFDakYsT0FBTyxDQUFDLEdBQUcsQ0FBQyxtREFBbUQsQ0FBQyxDQUFDO2dCQUNqRSxNQUFNLE9BQU8sR0FBRyxNQUFNLE9BQU8sQ0FBQyxVQUFVLENBQUMsYUFBYSxDQUFDLENBQUM7Z0JBRXhELGtDQUFrQztnQkFDbEMsTUFBTSxVQUFVLEdBQUcsT0FBTyxDQUFDLE1BQU0sQ0FDL0IsQ0FBQyxNQUFNLEVBQUUsRUFBRSxDQUFDLE1BQU0sQ0FBQyxNQUFNLEtBQUssV0FBVyxDQUMxQyxDQUFDO2dCQUNGLE1BQU0sTUFBTSxHQUFHLE9BQU8sQ0FBQyxNQUFNLENBQUMsQ0FBQyxNQUFNLEVBQUUsRUFBRSxDQUFDLE1BQU0sQ0FBQyxNQUFNLEtBQUssVUFBVSxDQUFDLENBQUM7Z0JBRXhFLE9BQU8sQ0FBQyxHQUFHLENBQ1QsK0JBQStCLFVBQVUsQ0FBQyxNQUFNLGdCQUFnQixNQUFNLENBQUMsTUFBTSxTQUFTLENBQ3ZGLENBQUM7Z0JBRUYsK0NBQStDO2dCQUMvQyxNQUFNLENBQUMsT0FBTyxDQUFDLENBQUMsTUFBTSxFQUFFLEtBQUssRUFBRSxFQUFFO29CQUMvQixJQUFJLE1BQU0sQ0FBQyxNQUFNLEtBQUssVUFBVSxFQUFFLENBQUM7d0JBQ2pDLE9BQU8sQ0FBQyxLQUFLLENBQ1gsV0FBVyxLQUFLLDJCQUEyQixFQUMzQyxNQUFNLENBQUMsTUFBTSxDQUNkLENBQUM7b0JBQ0osQ0FBQztnQkFDSCxDQUFDLENBQUMsQ0FBQztnQkFFSCxpREFBaUQ7Z0JBQ2pELElBQUksVUFBVSxDQUFDLE1BQU0sS0FBSyxDQUFDLEVBQUUsQ0FBQztvQkFDNUIsTUFBTSxJQUFJLEtBQUssQ0FBQyxzQ0FBc0MsQ0FBQyxDQUFDO2dCQUMxRCxDQUFDO2dCQUVELE9BQU8sQ0FBQyxHQUFHLENBQ1QsNkJBQTZCLFVBQVUsQ0FBQyxNQUFNLFdBQVcsT0FBTyxDQUFDLE1BQU0sU0FBUyxDQUNqRixDQUFDO2dCQUVGLE9BQU8sQ0FBQyxHQUFHLENBQUMsMkJBQTJCLENBQUMsQ0FBQztZQUMzQyxDQUFDO1lBQUMsT0FBTyxLQUFLLEVBQUUsQ0FBQztnQkFDZixPQUFPLENBQUMsS0FBSyxDQUFDLDhCQUE4QixFQUFFLEtBQUssQ0FBQyxDQUFDO1lBQ3ZELENBQUM7UUFDSCxDQUFDLENBQUM7UUFFRixnRUFBZ0U7UUFDaEUsTUFBTSxpQkFBaUIsR0FBRyxLQUFLLElBQUksRUFBRTtZQUNuQyxtSEFBbUg7WUFDbkgsTUFBTSxzQkFBc0IsR0FBRyxNQUFNLElBQUEsb0NBQXVCLEVBQzFELE9BQU8sQ0FBQyxNQUFNLEVBQ2QsU0FBUyxDQUNWLENBQUM7WUFDRixJQUFJLHNCQUFzQixFQUFFLENBQUM7Z0JBQzNCLE9BQU8sQ0FBQyxHQUFHLENBQ1Qsd0VBQXdFLEVBQ3hFLHNCQUFzQixDQUN2QixDQUFDO2dCQUNGLE9BQU87WUFDVCxDQUFDO1lBRUQsT0FBTyxDQUFDLEdBQUcsQ0FDVCwrRUFBK0UsQ0FDaEYsQ0FBQztZQUVGLGtEQUFrRDtZQUNsRCxNQUFNLEVBQUUsU0FBUyxFQUFFLEdBQUcsTUFBTSxJQUFBLHlCQUFpQixFQUMzQyxNQUFNLEVBQ04sT0FBTyxDQUFDLE1BQU0sRUFDZCxTQUFTLEVBQ1Qsb0JBQW9CLEVBQ3BCLE9BQU8sQ0FBQyxLQUFLLElBQUksYUFBYSxFQUM5QixPQUFPLENBQUMsUUFBUSxJQUFJLGdCQUFnQixDQUNyQyxDQUFDO1lBRUYseUJBQXlCO1lBQ3pCLE1BQU0sQ0FBQyxPQUFPLENBQUMsQ0FBQyxLQUFLLEVBQUUsQ0FBQyxFQUFFLEVBQUU7Z0JBQzFCLEtBQUssQ0FBQyxRQUFRLEdBQUcsU0FBUyxDQUFDLENBQUMsQ0FBQyxDQUFDLFFBQVEsSUFBSSxFQUFFLENBQUM7Z0JBQzdDLE9BQU8sQ0FBQyxHQUFHLENBQUMsd0JBQXdCLEVBQUUsU0FBUyxDQUFDLENBQUMsQ0FBQyxDQUFDLFFBQVEsQ0FBQyxDQUFDO1lBQy9ELENBQUMsQ0FBQyxDQUFDO1lBRUgseUJBQXlCO1lBQ3pCLE1BQU0sSUFBQSw2QkFBaUIsRUFBQyxNQUFNLEVBQUUsT0FBTyxDQUFDLE1BQU0sRUFBRSxTQUFTLEVBQUUsU0FBUyxDQUFDLENBQUM7UUFDeEUsQ0FBQyxDQUFDO1FBRUYsNkVBQTZFO1FBQzdFLHNFQUFzRTtRQUN0RSxrREFBa0Q7UUFDbEQsTUFBTSxPQUFPLENBQUMsR0FBRyxDQUFDLENBQUMsa0JBQWtCLEVBQUUsRUFBRSxpQkFBaUIsRUFBRSxDQUFDLENBQUMsQ0FBQztRQUUvRCxPQUFPLENBQUMsR0FBRyxDQUNULHFDQUFxQyxFQUNyQyxJQUFJLENBQUMsU0FBUyxDQUFDLE1BQU0sRUFBRSxJQUFJLEVBQUUsQ0FBQyxDQUFDLENBQ2hDLENBQUM7UUFFRixtQ0FBbUM7UUFDbkMsTUFBTSxJQUFBLDhCQUFjLEVBQ2xCLE9BQU8sQ0FBQyxNQUFNLEVBQ2QsU0FBUyxFQUNULE1BQU0sRUFDTixPQUFPLENBQUMsYUFBYSxFQUNyQixvQkFBb0IsRUFDcEIsT0FBTyxDQUFDLEtBQUssSUFBSSxhQUFhLEVBQzlCLE9BQU8sQ0FBQyxRQUFRLElBQUksZ0JBQWdCLEVBQ3BDLE9BQU8sQ0FBQyxhQUFhLENBQ3RCLENBQUM7UUFFRixRQUFRLEdBQUcsTUFBTSxJQUFBLDJCQUFXLEVBQUMsT0FBTyxDQUFDLE1BQU0sRUFBRSxPQUFPLENBQUMsU0FBUyxDQUFDLENBQUM7UUFFaEUsSUFBSSxnQkFBZ0IsR0FBRyxNQUFNLElBQUEsK0JBQWUsRUFBQyxRQUFRLENBQUMsQ0FBQztRQUV2RCxNQUFNLElBQUEscUNBQWlCLEVBQ3JCLHdCQUF3QixFQUN4QixPQUFPLENBQUMsTUFBTSxFQUNkLFNBQVMsRUFDVDtZQUNFLFFBQVEsRUFBRSxnQkFBZ0I7U0FDM0IsRUFDRCwrQkFBK0IsQ0FDaEMsQ0FBQztRQUVGLDhCQUE4QjtRQUM5QixNQUFNLElBQUksR0FBRyxNQUFNLElBQUEsY0FBTyxFQUFDLE9BQU8sQ0FBQyxNQUFNLENBQUMsQ0FBQztRQUMzQyxPQUFPLENBQUMsR0FBRyxDQUFDLGVBQWUsRUFBRSxJQUFJLENBQUMsU0FBUyxDQUFDLElBQUksRUFBRSxJQUFJLEVBQUUsQ0FBQyxDQUFDLENBQUMsQ0FBQztRQUU1RCwrQ0FBK0M7UUFDL0MsZ0dBQWdHO1FBQ2hHLE1BQU0sSUFBQSxpQ0FBa0IsRUFBQyxPQUFPLENBQUMsTUFBTSxFQUFFLFNBQVMsRUFBRSxNQUFNLEVBQUUsSUFBSSxDQUFDLENBQUM7UUFFbEUsT0FBTyxDQUFDLEdBQUcsQ0FBQyxrQ0FBa0MsQ0FBQyxDQUFDO1FBRWhELG9FQUFvRTtRQUNwRSxxRUFBcUU7UUFDckUsc0VBQXNFO1FBQ3RFLGtFQUFrRTtRQUNsRSx1RUFBdUU7UUFDdkUsdURBQXVEO1FBQ3ZELFFBQVEsR0FBRyxDQUFDLE1BQU0sSUFBQSwyQkFBVyxFQUFDLE9BQU8sQ0FBQyxNQUFNLEVBQUUsT0FBTyxDQUFDLFNBQVMsQ0FBQyxDQUFDLElBQUksUUFBUSxDQUFDO1FBRTlFLE9BQU8sQ0FBQyxHQUFHLENBQ1QsZ0NBQWdDLEVBQ2hDLElBQUksQ0FBQyxTQUFTLENBQUMsUUFBUSxFQUFFLElBQUksRUFBRSxDQUFDLENBQUMsQ0FDbEMsQ0FBQztRQUVGLGdCQUFnQixHQUFHLE1BQU0sSUFBQSwrQkFBZSxFQUFDLFFBQVEsQ0FBQyxDQUFDO1FBRW5ELE1BQU0sSUFBQSxxQ0FBaUIsRUFDckIsbUJBQW1CLEVBQ25CLE9BQU8sQ0FBQyxNQUFNLEVBQ2QsU0FBUyxFQUNULEVBQUUsUUFBUSxFQUFFLGdCQUFnQixFQUFFLEVBQzlCLDhCQUE4QixDQUMvQixDQUFDO1FBRUYsa0VBQWtFO1FBQ2xFLElBQUksTUFBTSxJQUFJLE9BQU8sQ0FBQyxHQUFHLENBQUMsZUFBZSxFQUFFLENBQUM7WUFDMUMsTUFBTSxhQUFhLEdBQUcsSUFBSSxpQ0FBb0IsQ0FBQztnQkFDN0MsUUFBUSxFQUFFLE9BQU8sQ0FBQyxHQUFHLENBQUMsZUFBZTtnQkFDckMsYUFBYSxFQUFFLE1BQU0sQ0FBQyxhQUFhO2FBQ3BDLENBQUMsQ0FBQztZQUNILE1BQU0sR0FBRyxDQUFDLElBQUksQ0FBQyxhQUFhLENBQUMsQ0FBQztRQUNoQyxDQUFDO1FBRUQsT0FBTztZQUNMLE9BQU8sRUFBRSxnQ0FBZ0M7U0FDMUMsQ0FBQztJQUNKLENBQUM7SUFBQyxPQUFPLEtBQUssRUFBRSxDQUFDO1FBQ2YsT0FBTyxDQUFDLEtBQUssQ0FBQyw0QkFBNEIsRUFBRSxLQUFLLENBQUMsQ0FBQztRQUNuRCxNQUFNLEtBQUssQ0FBQyx5QkFBeUIsQ0FBQyxDQUFDO0lBQ3pDLENBQUM7QUFDSCxDQUFDIiwic291cmNlc0NvbnRlbnQiOlsiaW1wb3J0IHsgU1FTUmVjb3JkIH0gZnJvbSAnYXdzLWxhbWJkYSc7XG5pbXBvcnQgeyBTUVNDbGllbnQsIERlbGV0ZU1lc3NhZ2VDb21tYW5kIH0gZnJvbSAnQGF3cy1zZGsvY2xpZW50LXNxcyc7XG5pbXBvcnQgeyBnZW5lcmF0ZU5hcnJhdGlvbiB9IGZyb20gJy4uL3V0aWxzL2F1ZGlvJztcbmltcG9ydCB7IGdlbmVyYXRlU3VidGl0bGVzIH0gZnJvbSAnLi4vdXRpbHMvc3VidGl0bGVzJztcbmltcG9ydCB7IGFkZFNjZW5lSWRzIH0gZnJvbSAnLi4vdXRpbHMvc2NyaXB0JztcbmltcG9ydCB7IGdlbmVyYXRlU3RvcnlCcmVha2Rvd24sIFNjZW5lIH0gZnJvbSAnLi4vdXRpbHMvc2NyaXB0JztcbmltcG9ydCB7IHVwbG9hZFRvUzMsIGdldE9iamVjdEZyb21TMyB9IGZyb20gJy4uL3V0aWxzL3MzVXBsb2FkZXInO1xuaW1wb3J0IHsgY2hlY2tBdWRpb0NhcHRpb25FeGlzdHMgfSBmcm9tICcuLi91dGlscy9hdWRpb1V0aWxzJztcbmltcG9ydCB7IGdldEltYWdlVXJscyB9IGZyb20gJy4uL3V0aWxzL2ltYWdlVXRpbHMnO1xuaW1wb3J0IHsgZ2VuZXJhdGVOYW5vQmFuYW5hSW1hZ2UgfSBmcm9tICcuLi91dGlscy9pbWFnZU5hbm9CYW5hbmEnO1xuXG4vLyBDb25zdGFudHNcbmNvbnN0IERFRkFVTFRfVk9JQ0UgPSAnYXNoJztcbmNvbnN0IERFRkFVTFRfTEFOR1VBR0UgPSAnZW4nO1xuaW1wb3J0IHsgZ2V0VmlkZW9FZmZlY3RVcmxzIH0gZnJvbSAnLi4vdXRpbHMvdmlkZW9FZmZlY3RzJztcbmltcG9ydCB7XG4gIGNyZWF0ZU1hbmlmZXN0LFxuICBnZXRNYW5pZmVzdCxcbiAgaHlkcmF0ZU1hbmlmZXN0LFxufSBmcm9tICcuLi91dGlscy9tYW5pZmVzdFV0aWxzJztcbmltcG9ydCB7IGJyb2FkY2FzdFByb2dyZXNzIH0gZnJvbSAnLi4vdXRpbHMvYnJvYWRjYXN0UHJvZ3Jlc3MnO1xuaW1wb3J0IHsgZ2V0VXNlciB9IGZyb20gJy4uL3V0aWxzL3VzZXInO1xuXG5jb25zdCBzcXMgPSBuZXcgU1FTQ2xpZW50KHsgcmVnaW9uOiBwcm9jZXNzLmVudi5BV1NfUkVHSU9OIHx8ICd1cy1lYXN0LTEnIH0pO1xuXG5leHBvcnQgaW50ZXJmYWNlIFZpZGVvR2VuZXJhdGlvblJlcXVlc3Qge1xuICB0eXBlPzogJ2dlbmVyYXRlLXZpZGVvJyB8ICdjb21iaW5lLXZpZGVvJyB8ICdiYXRjaC1lZGl0JyB8ICdhbmltYXRlLXNjZW5lJztcbiAgcHJvbXB0Pzogc3RyaW5nO1xuICB1c2VySWQ6IHN0cmluZztcbiAgdGltZXN0YW1wOiBzdHJpbmc7XG4gIHRvdGFsRHVyYXRpb246IG51bWJlcjtcbiAgc2NlbmVDb3VudDogbnVtYmVyO1xuICBzdGVwOiBudW1iZXI7XG4gIHZvaWNlPzogc3RyaW5nO1xuICBsYW5ndWFnZT86IHN0cmluZztcbiAgaW1hZ2VUZW1wbGF0ZTogc3RyaW5nO1xufVxuXG5leHBvcnQgYXN5bmMgZnVuY3Rpb24gcHJvY2Vzc1ZpZGVvR2VuZXJhdGlvbihcbiAgcmVxdWVzdDogVmlkZW9HZW5lcmF0aW9uUmVxdWVzdCxcbiAgcmVjb3JkPzogU1FTUmVjb3JkLFxuKTogUHJvbWlzZTxhbnk+IHtcbiAgdHJ5IHtcbiAgICBjb25zb2xlLmxvZygncHJvY2Vzc1ZpZGVvR2VuZXJhdGlvbjonLCByZXF1ZXN0KTtcblxuICAgIGNvbnNvbGUubG9nKCdyZXF1ZXN0LnZvaWNlOicsIHJlcXVlc3Qudm9pY2UpO1xuXG4gICAgLy8gVXNlIHRpbWVzdGFtcFxuICAgIGNvbnN0IHRpbWVzdGFtcCA9IHJlcXVlc3QudGltZXN0YW1wO1xuXG4gICAgY29uc3Qgc2NlbmVEdXJhdGlvbiA9IE1hdGguZmxvb3IoXG4gICAgICByZXF1ZXN0LnRvdGFsRHVyYXRpb24gLyByZXF1ZXN0LnNjZW5lQ291bnQsXG4gICAgKTtcblxuICAgIGxldCBzY2VuZXM6IFNjZW5lW10gPSBbXTtcbiAgICBsZXQgdm9pY2VUb25lSW5zdHJ1Y3Rpb246IHN0cmluZyA9ICcnO1xuXG4gICAgLy8gY2hlY2sgaWYgdGhlIHZpZGVvIGlzIGFscmVhZHkgZ2VuZXJhdGVkXG4gICAgbGV0IG1hbmlmZXN0ID0gYXdhaXQgZ2V0TWFuaWZlc3QocmVxdWVzdC51c2VySWQsIHJlcXVlc3QudGltZXN0YW1wKTtcblxuICAgIGlmIChtYW5pZmVzdCkge1xuICAgICAgY29uc29sZS5sb2coJ/CfjqUgVmlkZW8gYWxyZWFkeSBnZW5lcmF0ZWQsIHNraXBwaW5nIHZpZGVvIGdlbmVyYXRpb24nKTtcbiAgICAgIGNvbnN0IG1hbmlmZXN0SHlkcmF0ZWQgPSBhd2FpdCBoeWRyYXRlTWFuaWZlc3QobWFuaWZlc3QpO1xuICAgICAgYXdhaXQgYnJvYWRjYXN0UHJvZ3Jlc3MoXG4gICAgICAgICdwcmV2aWV3X2NvbXBsZXRlZCcsXG4gICAgICAgIHJlcXVlc3QudXNlcklkLFxuICAgICAgICByZXF1ZXN0LnRpbWVzdGFtcCxcbiAgICAgICAgeyBtYW5pZmVzdDogbWFuaWZlc3RIeWRyYXRlZCB9LFxuICAgICAgICAnVmlkZW8gZ2VuZXJhdGVkIHN1Y2Nlc3NmdWxseScsXG4gICAgICApO1xuICAgICAgcmV0dXJuIHtcbiAgICAgICAgbWVzc2FnZTogJ1ZpZGVvIGFscmVhZHkgZ2VuZXJhdGVkJyxcbiAgICAgICAgbWFuaWZlc3Q6IG1hbmlmZXN0SHlkcmF0ZWQsXG4gICAgICB9O1xuICAgIH1cblxuICAgIC8vIENoZWNrIGlmIHRoZXJlIGlzIGFscmVhZHkgc2NyaXB0IGdlbmVyYXRlZCBpbiB0aGUgczMgYnVja2V0IGZvciB0aGUgdGltZXN0YW1wXG4gICAgY29uc3Qgc2NyaXB0S2V5ID0gYCR7cmVxdWVzdC51c2VySWR9LyR7dGltZXN0YW1wfS5zY3JpcHQudHh0YDtcbiAgICBjb25zdCBleGlzdGluZ1NjcmlwdCA9IGF3YWl0IGdldE9iamVjdEZyb21TMyhzY3JpcHRLZXkpO1xuXG4gICAgLy8gU3RlcCAxOiBHZW5lcmF0ZSBzY3JpcHQvc3RvcnkgYnJlYWtkb3duIHVzaW5nIEdQVC00XG4gICAgaWYgKGV4aXN0aW5nU2NyaXB0KSB7XG4gICAgICBjb25zb2xlLmxvZyhcbiAgICAgICAgJ/CfjqUgU2NyaXB0IGFscmVhZHkgZ2VuZXJhdGVkIGZvciB0aGUgdGltZXN0YW1wLCB1c2luZyBleGlzdGluZyBzY3JpcHQnLFxuICAgICAgKTtcbiAgICAgIHNjZW5lcyA9IGFkZFNjZW5lSWRzKGV4aXN0aW5nU2NyaXB0LnNjZW5lcyk7XG4gICAgICB2b2ljZVRvbmVJbnN0cnVjdGlvbiA9IGV4aXN0aW5nU2NyaXB0LnZvaWNlVG9uZUluc3RydWN0aW9uO1xuICAgIH0gZWxzZSB7XG4gICAgICBjb25zb2xlLmxvZyhcbiAgICAgICAgJ/CfjqUgTm8gZXhpc3Rpbmcgc2NyaXB0IGZvdW5kLCBnZW5lcmF0aW5nIG5ldyBzdG9yeSBicmVha2Rvd24nLFxuICAgICAgKTtcblxuICAgICAgaWYgKCFyZXF1ZXN0LnByb21wdCkge1xuICAgICAgICBjb25zb2xlLmxvZygn4p2MIEVycm9yOiBObyBwcm9tcHQgcHJvdmlkZWQnKTtcbiAgICAgICAgdGhyb3cgbmV3IEVycm9yKCdObyBwcm9tcHQgcHJvdmlkZWQnKTtcbiAgICAgIH1cblxuICAgICAgY29uc3Qgc3RvcnlCcmVha2Rvd24gPSBhd2FpdCBnZW5lcmF0ZVN0b3J5QnJlYWtkb3duKFxuICAgICAgICByZXF1ZXN0LnByb21wdCEsXG4gICAgICAgIHJlcXVlc3Quc2NlbmVDb3VudCxcbiAgICAgICAgc2NlbmVEdXJhdGlvbixcbiAgICAgICAgcmVxdWVzdC50b3RhbER1cmF0aW9uLFxuICAgICAgKTtcbiAgICAgIHNjZW5lcyA9IHN0b3J5QnJlYWtkb3duLnNjZW5lcztcbiAgICAgIHZvaWNlVG9uZUluc3RydWN0aW9uID0gc3RvcnlCcmVha2Rvd24udm9pY2VUb25lSW5zdHJ1Y3Rpb247XG4gICAgfVxuXG4gICAgaWYgKCFzY2VuZXMgfHwgc2NlbmVzLmxlbmd0aCA9PT0gMCkge1xuICAgICAgY29uc29sZS5sb2coJ+KdjCBFcnJvcjogRmFpbGVkIHRvIGdldCBvciBnZW5lcmF0ZSBzdG9yeSBicmVha2Rvd24nKTtcbiAgICAgIHRocm93IG5ldyBFcnJvcignRmFpbGVkIHRvIGdldCBvciBnZW5lcmF0ZSBzdG9yeSBicmVha2Rvd24nKTtcbiAgICB9XG5cbiAgICBjb25zb2xlLmxvZygn8J+OpSBTdG9yeSBicmVha2Rvd24gZ2VuZXJhdGVkOicsIHNjZW5lcyk7XG4gICAgY29uc29sZS5sb2coJ/CflrzvuI8gUmVjZWl2ZWQgaW1hZ2VUZW1wbGF0ZTonLCByZXF1ZXN0LmltYWdlVGVtcGxhdGUpO1xuXG4gICAgLy8gU3RlcCAyOiBHZW5lcmF0ZSBpbWFnZXMgZm9yIGVhY2ggc2NlbmUgaW4gcGFyYWxsZWxcbiAgICBjb25zdCBnZW5lcmF0ZUltYWdlc1N0ZXAgPSBhc3luYyAoKSA9PiB7XG4gICAgICAvLyBDaGVjayBpZiB0aGVyZSBhcmUgYWxyZWFkeSBpbWFnZXMgZ2VuZXJhdGVkIGluIHRoZSBzMyBidWNrZXQgZm9yIHRoZSB0aW1lc3RhbXBcbiAgICAgIGNvbnN0IGltYWdlVXJscyA9IGF3YWl0IGdldEltYWdlVXJscyhyZXF1ZXN0LnVzZXJJZCwgdGltZXN0YW1wKTtcblxuICAgICAgaWYgKGltYWdlVXJscy5sZW5ndGggPiAwKSB7XG4gICAgICAgIGNvbnNvbGUubG9nKFxuICAgICAgICAgICfwn46lIEltYWdlcyBhbHJlYWR5IGdlbmVyYXRlZCBmb3IgdGhlIHRpbWVzdGFtcDonLFxuICAgICAgICAgIGltYWdlVXJscyxcbiAgICAgICAgKTtcbiAgICAgICAgcmV0dXJuO1xuICAgICAgfVxuXG4gICAgICBjb25zdCBzZWVkID0gTWF0aC5mbG9vcihNYXRoLnJhbmRvbSgpICogMTAwMDAwMCk7XG5cbiAgICAgIGNvbnNvbGUubG9nKCfwn46oIEdlbmVyYXRpbmcgaW1hZ2VzIGZvciBlYWNoIHNjZW5lIGluIHBhcmFsbGVsLi4uJyk7XG5cbiAgICAgIHRyeSB7XG4gICAgICAgIGNvbnN0IGltYWdlUHJvbWlzZXMgPSBzY2VuZXMubWFwKGFzeW5jIChzY2VuZTogYW55LCBpOiBudW1iZXIpID0+IHtcbiAgICAgICAgICBjb25zb2xlLmxvZyhcbiAgICAgICAgICAgIGDwn46oIEdlbmVyYXRpbmcgaW1hZ2UgZm9yIHNjZW5lICR7aSArIDF9OmAsXG4gICAgICAgICAgICBzY2VuZS5kZXNjcmlwdGlvbixcbiAgICAgICAgICApO1xuXG4gICAgICAgICAgY29uc3QgaW1hZ2VEZXNjcmlwdGlvbiA9IGBbJHtyZXF1ZXN0LmltYWdlVGVtcGxhdGV9XTogJHtzY2VuZS5kZXNjcmlwdGlvbn1gO1xuXG4gICAgICAgICAgY29uc3QgcmVzdWx0ID0gYXdhaXQgZ2VuZXJhdGVOYW5vQmFuYW5hSW1hZ2UoXG4gICAgICAgICAgICBpbWFnZURlc2NyaXB0aW9uLFxuICAgICAgICAgICAgc2NlbmUuaWQsXG4gICAgICAgICAgICByZXF1ZXN0LnVzZXJJZCxcbiAgICAgICAgICAgIHRpbWVzdGFtcCxcbiAgICAgICAgICAgIHNlZWQsXG4gICAgICAgICAgKTtcblxuICAgICAgICAgIGNvbnNvbGUubG9nKGDinIUgU2NlbmUgJHtpICsgMX0gaW1hZ2UgZ2VuZXJhdGVkOiBkb25lYCk7XG4gICAgICAgICAgcmV0dXJuIHJlc3VsdDtcbiAgICAgICAgfSk7XG5cbiAgICAgICAgLy8gV2FpdCBmb3IgYWxsIGltYWdlcyB0byBiZSBnZW5lcmF0ZWQgdXNpbmcgYWxsU2V0dGxlZCBmb3IgYmV0dGVyIGVycm9yIGhhbmRsaW5nXG4gICAgICAgIGNvbnNvbGUubG9nKCfij7MgV2FpdGluZyBmb3IgYWxsIGltYWdlIGdlbmVyYXRpb24gdG8gY29tcGxldGUuLi4nKTtcbiAgICAgICAgY29uc3QgcmVzdWx0cyA9IGF3YWl0IFByb21pc2UuYWxsU2V0dGxlZChpbWFnZVByb21pc2VzKTtcblxuICAgICAgICAvLyBMb2cgcmVzdWx0cyBhbmQgaGFuZGxlIGZhaWx1cmVzXG4gICAgICAgIGNvbnN0IHN1Y2Nlc3NmdWwgPSByZXN1bHRzLmZpbHRlcihcbiAgICAgICAgICAocmVzdWx0KSA9PiByZXN1bHQuc3RhdHVzID09PSAnZnVsZmlsbGVkJyxcbiAgICAgICAgKTtcbiAgICAgICAgY29uc3QgZmFpbGVkID0gcmVzdWx0cy5maWx0ZXIoKHJlc3VsdCkgPT4gcmVzdWx0LnN0YXR1cyA9PT0gJ3JlamVjdGVkJyk7XG5cbiAgICAgICAgY29uc29sZS5sb2coXG4gICAgICAgICAgYOKchSBJbWFnZSBnZW5lcmF0aW9uIHJlc3VsdHM6ICR7c3VjY2Vzc2Z1bC5sZW5ndGh9IHN1Y2Nlc3NmdWwsICR7ZmFpbGVkLmxlbmd0aH0gZmFpbGVkYCxcbiAgICAgICAgKTtcblxuICAgICAgICAvLyBMb2cgZmFpbGVkIHByb21pc2VzIHdpdGggZGV0YWlsZWQgZXJyb3IgaW5mb1xuICAgICAgICBmYWlsZWQuZm9yRWFjaCgocmVzdWx0LCBpbmRleCkgPT4ge1xuICAgICAgICAgIGlmIChyZXN1bHQuc3RhdHVzID09PSAncmVqZWN0ZWQnKSB7XG4gICAgICAgICAgICBjb25zb2xlLmVycm9yKFxuICAgICAgICAgICAgICBg4p2MIFNjZW5lICR7aW5kZXh9IGltYWdlIGdlbmVyYXRpb24gZmFpbGVkOmAsXG4gICAgICAgICAgICAgIHJlc3VsdC5yZWFzb24sXG4gICAgICAgICAgICApO1xuICAgICAgICAgIH1cbiAgICAgICAgfSk7XG5cbiAgICAgICAgLy8gQ29udGludWUgcHJvY2Vzc2luZyBldmVuIGlmIHNvbWUgaW1hZ2VzIGZhaWxlZFxuICAgICAgICBpZiAoc3VjY2Vzc2Z1bC5sZW5ndGggPT09IDApIHtcbiAgICAgICAgICB0aHJvdyBuZXcgRXJyb3IoJ0FsbCBpbWFnZSBnZW5lcmF0aW9uIGF0dGVtcHRzIGZhaWxlZCcpO1xuICAgICAgICB9XG5cbiAgICAgICAgY29uc29sZS5sb2coXG4gICAgICAgICAgYPCfjqggU3VjY2Vzc2Z1bGx5IGdlbmVyYXRlZCAke3N1Y2Nlc3NmdWwubGVuZ3RofSBvdXQgb2YgJHtyZXN1bHRzLmxlbmd0aH0gaW1hZ2VzYCxcbiAgICAgICAgKTtcblxuICAgICAgICBjb25zb2xlLmxvZygn8J+WvO+4jyBJbWFnZXMgdXBsb2FkZWQgdG8gUzMnKTtcbiAgICAgIH0gY2F0Y2ggKGVycm9yKSB7XG4gICAgICAgIGNvbnNvbGUuZXJyb3IoJ+KdjCBGYWlsZWQgdG8gZ2VuZXJhdGUgaW1hZ2VzOicsIGVycm9yKTtcbiAgICAgIH1cbiAgICB9O1xuXG4gICAgLy8gU3RlcCAzOiBHZW5lcmF0ZSBhdWRpbyBuYXJyYXRpb24gYW5kIHN1YnRpdGxlcyBmb3IgZWFjaCBzY2VuZVxuICAgIGNvbnN0IGdlbmVyYXRlQXVkaW9TdGVwID0gYXN5bmMgKCkgPT4ge1xuICAgICAgLy8gY2hlY2sgaWYgYWxsIHRvZ2V0aGVyIGlmIC5tcDMsIC5zdWJ0aXRsZS5qc29uLCAuYXNzIGZpbGVzIGFyZSBhbHJlYWR5IGV4aXN0cyBpbiB0aGUgczMgYnVja2V0IGFuZCByZXR1cm4gYm9vbGVhblxuICAgICAgY29uc3QgYXVkaW9DYXB0aW9uRmlsZXNFeGlzdCA9IGF3YWl0IGNoZWNrQXVkaW9DYXB0aW9uRXhpc3RzKFxuICAgICAgICByZXF1ZXN0LnVzZXJJZCxcbiAgICAgICAgdGltZXN0YW1wLFxuICAgICAgKTtcbiAgICAgIGlmIChhdWRpb0NhcHRpb25GaWxlc0V4aXN0KSB7XG4gICAgICAgIGNvbnNvbGUubG9nKFxuICAgICAgICAgICfwn46lIEF1ZGlvLCBzdWJ0aXRsZSwgYW5kIGFzcyBmaWxlcyBhbHJlYWR5IGdlbmVyYXRlZCBmb3IgdGhlIHRpbWVzdGFtcDonLFxuICAgICAgICAgIGF1ZGlvQ2FwdGlvbkZpbGVzRXhpc3QsXG4gICAgICAgICk7XG4gICAgICAgIHJldHVybjtcbiAgICAgIH1cblxuICAgICAgY29uc29sZS5sb2coXG4gICAgICAgICfwn46lIE5vIGV4aXN0aW5nIGF1ZGlvLCBzdWJ0aXRsZSwgYW5kIGFzcyBmaWxlcyBmb3VuZCwgZ2VuZXJhdGluZyBuZXcgbmFycmF0aW9uJyxcbiAgICAgICk7XG5cbiAgICAgIC8vIEdlbmVyYXRlIGF1ZGlvIGZpbGVzIHdpdGggd29yZC1sZXZlbCB0aW1lc3RhbXBzXG4gICAgICBjb25zdCB7IHN1YnRpdGxlcyB9ID0gYXdhaXQgZ2VuZXJhdGVOYXJyYXRpb24oXG4gICAgICAgIHNjZW5lcyxcbiAgICAgICAgcmVxdWVzdC51c2VySWQsXG4gICAgICAgIHRpbWVzdGFtcCxcbiAgICAgICAgdm9pY2VUb25lSW5zdHJ1Y3Rpb24sXG4gICAgICAgIHJlcXVlc3Qudm9pY2UgfHwgREVGQVVMVF9WT0lDRSxcbiAgICAgICAgcmVxdWVzdC5sYW5ndWFnZSB8fCBERUZBVUxUX0xBTkdVQUdFLFxuICAgICAgKTtcblxuICAgICAgLy8gdXBkYXRlIHNjZW5lcyBkdXJhdGlvblxuICAgICAgc2NlbmVzLmZvckVhY2goKHNjZW5lLCBpKSA9PiB7XG4gICAgICAgIHNjZW5lLmR1cmF0aW9uID0gc3VidGl0bGVzW2ldLmR1cmF0aW9uIHx8IDEwO1xuICAgICAgICBjb25zb2xlLmxvZygnc3VidGl0bGVzW2ldLmR1cmF0aW9uOicsIHN1YnRpdGxlc1tpXS5kdXJhdGlvbik7XG4gICAgICB9KTtcblxuICAgICAgLy8gR2VuZXJhdGUgc3VidGl0bGUgZmlsZVxuICAgICAgYXdhaXQgZ2VuZXJhdGVTdWJ0aXRsZXMoc2NlbmVzLCByZXF1ZXN0LnVzZXJJZCwgdGltZXN0YW1wLCBzdWJ0aXRsZXMpO1xuICAgIH07XG5cbiAgICAvLyBJbWFnZXMgYW5kIGF1ZGlvIGJvdGggZGVwZW5kIG9ubHkgb24gdGhlIHNjcmlwdCwgc28gcnVuIHRoZW0gY29uY3VycmVudGx5LlxuICAgIC8vIEltYWdlIGZhaWx1cmVzIGFyZSBzd2FsbG93ZWQgaW5zaWRlIGdlbmVyYXRlSW1hZ2VzU3RlcCAoYXMgYmVmb3JlKTtcbiAgICAvLyBhbiBhdWRpbyBmYWlsdXJlIG11c3Qgc3RpbGwgZmFpbCB0aGUgd2hvbGUgcnVuLlxuICAgIGF3YWl0IFByb21pc2UuYWxsKFtnZW5lcmF0ZUltYWdlc1N0ZXAoKSwgZ2VuZXJhdGVBdWRpb1N0ZXAoKV0pO1xuXG4gICAgY29uc29sZS5sb2coXG4gICAgICAn8J+OpSBTY2VuZXMgYmVmb3JlIGNyZWF0aW5nIG1hbmlmZXN0OicsXG4gICAgICBKU09OLnN0cmluZ2lmeShzY2VuZXMsIG51bGwsIDIpLFxuICAgICk7XG5cbiAgICAvLyBDcmVhdGUgbWFuaWZlc3QgYW5kIHVwbG9hZCB0byBzM1xuICAgIGF3YWl0IGNyZWF0ZU1hbmlmZXN0KFxuICAgICAgcmVxdWVzdC51c2VySWQsXG4gICAgICB0aW1lc3RhbXAsXG4gICAgICBzY2VuZXMsXG4gICAgICByZXF1ZXN0LnRvdGFsRHVyYXRpb24sXG4gICAgICB2b2ljZVRvbmVJbnN0cnVjdGlvbixcbiAgICAgIHJlcXVlc3Qudm9pY2UgfHwgREVGQVVMVF9WT0lDRSxcbiAgICAgIHJlcXVlc3QubGFuZ3VhZ2UgfHwgREVGQVVMVF9MQU5HVUFHRSxcbiAgICAgIHJlcXVlc3QuaW1hZ2VUZW1wbGF0ZSxcbiAgICApO1xuXG4gICAgbWFuaWZlc3QgPSBhd2FpdCBnZXRNYW5pZmVzdChyZXF1ZXN0LnVzZXJJZCwgcmVxdWVzdC50aW1lc3RhbXApO1xuXG4gICAgbGV0IG1hbmlmZXN0SHlkcmF0ZWQgPSBhd2FpdCBoeWRyYXRlTWFuaWZlc3QobWFuaWZlc3QpO1xuXG4gICAgYXdhaXQgYnJvYWRjYXN0UHJvZ3Jlc3MoXG4gICAgICAnYXVkaW9fc3VidGl0bGVfY3JlYXRlZCcsXG4gICAgICByZXF1ZXN0LnVzZXJJZCxcbiAgICAgIHRpbWVzdGFtcCxcbiAgICAgIHtcbiAgICAgICAgbWFuaWZlc3Q6IG1hbmlmZXN0SHlkcmF0ZWQsXG4gICAgICB9LFxuICAgICAgJ0F1ZGlvIGFuZCBTdWJ0aXRsZXMgY29tcGxldGVkJyxcbiAgICApO1xuXG4gICAgLy8gZ2V0IHRoZSB1c2VyJ3Mgc3Vic2NyaXB0aW9uXG4gICAgY29uc3QgdXNlciA9IGF3YWl0IGdldFVzZXIocmVxdWVzdC51c2VySWQpO1xuICAgIGNvbnNvbGUubG9nKCdVc2VyIGZldGNoZWQ6JywgSlNPTi5zdHJpbmdpZnkodXNlciwgbnVsbCwgMikpO1xuXG4gICAgLy8gU3RlcCA0OiBHZW5lcmF0ZSBjYW1lcmEgbW92ZW1lbnRzIGZyb20gaW1hZ2VcbiAgICAvLyBjaGVjayBpZiB0aGVyZSBhcmUgYWxyZWFkeSBhbGwgdGhlIHZpZGVvIGVmZmVjdHMgZ2VuZXJhdGVkIGluIHRoZSBzMyBidWNrZXQgZm9yIHRoZSB0aW1lc3RhbXBcbiAgICBhd2FpdCBnZXRWaWRlb0VmZmVjdFVybHMocmVxdWVzdC51c2VySWQsIHRpbWVzdGFtcCwgc2NlbmVzLCB1c2VyKTtcblxuICAgIGNvbnNvbGUubG9nKCfwn46sIFZpZGVvIGVmZmVjdHMgVVJMcyBnZW5lcmF0ZWQ6Jyk7XG5cbiAgICAvLyBSZS1mZXRjaCByYXRoZXIgdGhhbiByZXVzaW5nIHRoZSBpbi1tZW1vcnkgYG1hbmlmZXN0YCBmcm9tIGJlZm9yZVxuICAgIC8vIGdldFZpZGVvRWZmZWN0VXJscyDigJQgdGhhdCBzdGVwIGNhbiB0YWtlIDEwcysgcGVyIHNjZW5lLCBhbmQgaWYgdGhlXG4gICAgLy8gdXNlciBhcHBsaWVzIG5hcnJhdGlvbi9pbWFnZSBlZGl0cyBkdXJpbmcgdGhhdCB3aW5kb3csIGEgY29uY3VycmVudFxuICAgIC8vIGJhdGNoLWVkaXQgaW52b2NhdGlvbiB3cml0ZXMgdGhlbSB0byBTMy4gQnJvYWRjYXN0aW5nIHRoZSBzdGFsZVxuICAgIC8vIGluLW1lbW9yeSBjb3B5IGhlcmUgd291bGQgY2xvYmJlciB0aGUgZnJvbnRlbmQncyB2aWV3IG9mIHRob3NlIGVkaXRzXG4gICAgLy8gd2l0aCBwcmUtZWRpdCBkYXRhIGV2ZW4gdGhvdWdoIFMzIGl0c2VsZiBpcyBjb3JyZWN0LlxuICAgIG1hbmlmZXN0ID0gKGF3YWl0IGdldE1hbmlmZXN0KHJlcXVlc3QudXNlcklkLCByZXF1ZXN0LnRpbWVzdGFtcCkpIHx8IG1hbmlmZXN0O1xuXG4gICAgY29uc29sZS5sb2coXG4gICAgICAn8J+OrCBNYW5pZmVzdCBwcmV2aWV3IGNvbXBsZXRlZDonLFxuICAgICAgSlNPTi5zdHJpbmdpZnkobWFuaWZlc3QsIG51bGwsIDIpLFxuICAgICk7XG5cbiAgICBtYW5pZmVzdEh5ZHJhdGVkID0gYXdhaXQgaHlkcmF0ZU1hbmlmZXN0KG1hbmlmZXN0KTtcblxuICAgIGF3YWl0IGJyb2FkY2FzdFByb2dyZXNzKFxuICAgICAgJ3ByZXZpZXdfY29tcGxldGVkJyxcbiAgICAgIHJlcXVlc3QudXNlcklkLFxuICAgICAgdGltZXN0YW1wLFxuICAgICAgeyBtYW5pZmVzdDogbWFuaWZlc3RIeWRyYXRlZCB9LFxuICAgICAgJ1ZpZGVvIGdlbmVyYXRlZCBzdWNjZXNzZnVsbHknLFxuICAgICk7XG5cbiAgICAvLyBJZiB0aGlzIHdhcyB0cmlnZ2VyZWQgYnkgU1FTLCBkZWxldGUgdGhlIG1lc3NhZ2UgZnJvbSB0aGUgcXVldWVcbiAgICBpZiAocmVjb3JkICYmIHByb2Nlc3MuZW52LlZJREVPX1FVRVVFX1VSTCkge1xuICAgICAgY29uc3QgZGVsZXRlQ29tbWFuZCA9IG5ldyBEZWxldGVNZXNzYWdlQ29tbWFuZCh7XG4gICAgICAgIFF1ZXVlVXJsOiBwcm9jZXNzLmVudi5WSURFT19RVUVVRV9VUkwsXG4gICAgICAgIFJlY2VpcHRIYW5kbGU6IHJlY29yZC5yZWNlaXB0SGFuZGxlLFxuICAgICAgfSk7XG4gICAgICBhd2FpdCBzcXMuc2VuZChkZWxldGVDb21tYW5kKTtcbiAgICB9XG5cbiAgICByZXR1cm4ge1xuICAgICAgbWVzc2FnZTogJ1ByZXZpZXcgZ2VuZXJhdGVkIHN1Y2Nlc3NmdWxseScsXG4gICAgfTtcbiAgfSBjYXRjaCAoZXJyb3IpIHtcbiAgICBjb25zb2xlLmVycm9yKCdFcnJvciBpbiB2aWRlbyBnZW5lcmF0aW9uOicsIGVycm9yKTtcbiAgICB0aHJvdyBFcnJvcignVmlkZW8gZ2VuZXJhdGlvbiBmYWlsZWQnKTtcbiAgfVxufVxuIl19