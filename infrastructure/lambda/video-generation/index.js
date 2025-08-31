"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.handler = void 0;
exports.broadcastProgress = broadcastProgress;
const client_sqs_1 = require("@aws-sdk/client-sqs");
const image_1 = require("./image");
const narration_1 = require("./narration");
const subtitles_1 = require("./subtitles");
const script_1 = require("./script");
const s3Uploader_1 = require("./util/s3Uploader");
const audioUtils_1 = require("./util/audioUtils");
const imageUtils_1 = require("./util/imageUtils");
const videoEffects_1 = require("./util/videoEffects");
const videoCombiner_1 = require("./videoCombiner");
const manifestUtils_1 = require("./util/manifestUtils");
const websocket_broadcast_1 = require("../websocket-broadcast");
const sqs = new client_sqs_1.SQSClient({ region: process.env.AWS_REGION || 'us-east-1' });
const handler = async (event) => {
    console.log('🔄 Video Generation Lambda started - Updated with fluent-ffmpeg support');
    return await handleSQSEvent(event);
};
exports.handler = handler;
async function handleSQSEvent(event) {
    const batchItemFailures = [];
    for (const record of event.Records) {
        try {
            // Parse the message body
            const request = JSON.parse(record.body);
            // Process the video generation with ordered steps
            await processVideoGeneration(request, record);
        }
        catch (error) {
            console.error('❌ Error processing record:', record.messageId, error);
            batchItemFailures.push({ itemIdentifier: record.messageId });
        }
    }
    return {
        batchItemFailures,
    };
}
async function processVideoGeneration(request, record) {
    try {
        console.log('processVideoGeneration:', request);
        // check if the video is already generated
        let manifest = await (0, manifestUtils_1.getManifest)(request.userId, request.timestamp);
        const manifestHydrated = await (0, manifestUtils_1.hydrateManifest)(manifest);
        console.log('🎥 Video already generated, skipping video generation');
        if (manifestHydrated) {
            // await broadcastProgress(
            //   'preview_completed',
            //   request.userId,
            //   request.timestamp,
            //   { manifest: manifestHydrated },
            //   'Video generated successfully',
            // );
            // return {
            //   message: 'Video already generated',
            //   manifest: manifestHydrated,
            // };
        }
        // Use timestamp
        const timestamp = request.timestamp;
        const sceneDuration = Math.floor(request.totalDuration / request.sceneCount);
        // Check if there is already script generated in the s3 bucket for the timestamp
        const scriptKey = `${request.userId}/${timestamp}.script.txt`;
        const existingScript = await (0, s3Uploader_1.getObjectFromS3)(scriptKey);
        let scenes = [];
        let voiceToneInstruction = '';
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
            const storyBreakdown = await (0, narration_1.generateStoryBreakdown)(request.prompt, request.sceneCount, sceneDuration, request.totalDuration, request.userId, timestamp);
            scenes = storyBreakdown.scenes;
            voiceToneInstruction = storyBreakdown.voiceToneInstruction;
        }
        if (!scenes || scenes.length === 0) {
            console.log('❌ Error: Failed to get or generate story breakdown');
            throw new Error('Failed to get or generate story breakdown');
        }
        console.log('🎥 Story breakdown generated:', scenes);
        // Step 2: Generate images for each scene in parallel
        // Check if there are already images generated in the s3 bucket for the timestamp
        let imageUrls = await (0, imageUtils_1.getImageUrls)(request.userId, timestamp);
        if (imageUrls.length > 0) {
            console.log('🎥 Images already generated for the timestamp:', imageUrls);
        }
        else {
            const seed = Math.floor(Math.random() * 1000000);
            console.log('🎨 Generating images for each scene in parallel...');
            try {
                const imagePromises = scenes.map(async (scene, i) => {
                    console.log(`🎨 Generating image for scene ${i + 1}:`, scene.description);
                    const imageUrl = await (0, image_1.generateImage)(scene.description, i, request.userId, timestamp, seed, scene.id);
                    console.log(`✅ Scene ${i + 1} image generated:`, imageUrl);
                    return imageUrl;
                });
                // Wait for all images to be generated
                const generatedImageUrls = await Promise.all(imagePromises);
                if (generatedImageUrls.length === 0) {
                    console.log('❌ Error: No images were generated');
                    throw new Error('No images were generated');
                }
                // Convert generated image URLs to the new format
                imageUrls = generatedImageUrls.map((imageUrl, index) => {
                    const filename = `${timestamp}.scene-${scenes[index].id}.jpg`;
                    return { [filename]: imageUrl };
                });
                console.log(`🎥 Generated ${imageUrls.length} images in parallel:`, imageUrls);
            }
            catch (error) {
                console.error('❌ Failed to generate images:', error);
                throw new Error(`Failed to generate images: ${error}`);
            }
        }
        console.log('🖼️ Image URLs generated:', imageUrls);
        // check if all together if .mp3, .subtitle.json, .ass files are already exists in the s3 bucket and return boolean
        const audioCaptionFilesExist = await (0, audioUtils_1.checkAudioCaptionExists)(request.userId, timestamp);
        if (audioCaptionFilesExist) {
            console.log('🎥 Audio, subtitle, and ass files already generated for the timestamp:', audioCaptionFilesExist);
        }
        else {
            console.log('🎥 No existing audio, subtitle, and ass files found, generating new narration');
            // Step 3: Generate audio files with word-level timestamps
            const { subtitles } = await (0, narration_1.generateNarration)(scenes, request.userId, timestamp, voiceToneInstruction);
            // Step 4: Generate subtitle file
            await (0, subtitles_1.generateSubtitles)(scenes, request.userId, timestamp, subtitles);
        }
        await broadcastProgress('audio_subtitle_created', request.userId, timestamp, {
            manifest: manifestHydrated,
        }, 'Audio and Subtitles completed');
        // Step 5: Check existing video if not, generate video clips from images
        // console.log('🎥 Generating video clips from images...');
        // const videoClips: string[] = [];
        // for (let i = 0; i < scenes.length; i++) {
        //   const scene = scenes[i];
        //   const imageUrl = imageUrls[i];
        //   console.log(
        //     `🎬 Generating video for scene ${i + 1} from image:`,
        //     scene.description,
        //   );
        //   try {
        //     const videoClip = await generateVideoClip(
        //       scene.description,
        //       scene.duration,
        //       i,
        //       request.userId,
        //       timestamp,
        //       seed,
        //       scene.id,
        //       imageUrl,
        //     );
        //     videoClips.push(videoClip);
        //     console.log(`✅ Scene ${i + 1} video generated:`, videoClip);
        //   } catch (error) {
        //     console.error(`❌ Failed to generate video for scene ${i + 1}:`, error);
        //     throw new Error(
        //       `Failed to generate video for scene ${i + 1}: ${error}`,
        //     );
        //   }
        // }
        // if (videoClips.length === 0) {
        //   console.log('❌ Error: No video clips were generated');
        //   throw new Error('No video clips were generated');
        // }
        // console.log(`✅ Generated ${videoClips.length} video clips`);
        // Step 4: Generate camera movements from image
        // check if there are already all the video effects generated in the s3 bucket for the timestamp
        let videoEffectsUrls = [];
        videoEffectsUrls = await (0, videoEffects_1.getVideoEffectUrls)(request.userId, timestamp, scenes);
        console.log('🎬 Video effects URLs generated:', videoEffectsUrls);
        console.log('🎬 Manifest preview completed:', JSON.stringify(manifest, null, 2));
        await broadcastProgress('preview_completed', request.userId, timestamp, { manifest: manifestHydrated }, 'Video generated successfully');
        // Step 6: Combine video parts and upload to s3
        const finalVideoUrl = await (0, videoCombiner_1.combineVideoAndAudio)(request.userId, timestamp, scenes);
        console.log('🎬 Video combined completed', finalVideoUrl);
        // If this was triggered by SQS, delete the message from the queue
        if (record && process.env.VIDEO_QUEUE_URL) {
            const deleteCommand = new client_sqs_1.DeleteMessageCommand({
                QueueUrl: process.env.VIDEO_QUEUE_URL,
                ReceiptHandle: record.receiptHandle,
            });
            await sqs.send(deleteCommand);
        }
        // Step 7: Create manifest and upload to s3
        await (0, manifestUtils_1.createManifest)(request.userId, timestamp, scenes, request.totalDuration);
        console.log('manifest created');
        return {
            message: 'Video generated successfully',
        };
    }
    catch (error) {
        console.error('Error in video generation:', error);
        throw error;
    }
}
// Helper function to broadcast video generation progress via WebSocket
async function broadcastProgress(action, userId, timestamp, data, message) {
    try {
        const progressMessage = {
            action,
            data: {
                userId,
                timestamp,
                message,
                ...data,
            },
        };
        // Get the WebSocket domain and stage from environment variables
        const domainName = process.env.WEBSOCKET_DOMAIN_NAME;
        const stage = process.env.WEBSOCKET_STAGE || 'prod';
        if (domainName) {
            await (0, websocket_broadcast_1.broadcastMessage)(progressMessage, domainName, stage, userId);
            console.log(`📡 WebSocket progress broadcast: ${action} - ${message}`);
        }
        else {
            console.log(`📡 WebSocket not configured, skipping broadcast: ${action} - ${message}`);
        }
    }
    catch (error) {
        console.error('Error broadcasting video progress:', error);
        // Don't throw error to avoid breaking the main process
    }
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiaW5kZXguanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyJpbmRleC50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiOzs7QUE0VUEsOENBd0NDO0FBalhELG9EQUFzRTtBQUV0RSxtQ0FBd0M7QUFDeEMsMkNBQStFO0FBQy9FLDJDQUFnRDtBQUNoRCxxQ0FBdUM7QUFDdkMsa0RBQWdFO0FBQ2hFLGtEQUE0RDtBQUM1RCxrREFBaUQ7QUFDakQsc0RBQStFO0FBQy9FLG1EQUF1RDtBQUN2RCx3REFLOEI7QUFDOUIsZ0VBQTBEO0FBWTFELE1BQU0sR0FBRyxHQUFHLElBQUksc0JBQVMsQ0FBQyxFQUFFLE1BQU0sRUFBRSxPQUFPLENBQUMsR0FBRyxDQUFDLFVBQVUsSUFBSSxXQUFXLEVBQUUsQ0FBQyxDQUFDO0FBRXRFLE1BQU0sT0FBTyxHQUFHLEtBQUssRUFBRSxLQUFlLEVBQTZCLEVBQUU7SUFDMUUsT0FBTyxDQUFDLEdBQUcsQ0FDVCx5RUFBeUUsQ0FDMUUsQ0FBQztJQUNGLE9BQU8sTUFBTSxjQUFjLENBQUMsS0FBSyxDQUFDLENBQUM7QUFDckMsQ0FBQyxDQUFDO0FBTFcsUUFBQSxPQUFPLFdBS2xCO0FBRUYsS0FBSyxVQUFVLGNBQWMsQ0FBQyxLQUFlO0lBQzNDLE1BQU0saUJBQWlCLEdBQWlDLEVBQUUsQ0FBQztJQUUzRCxLQUFLLE1BQU0sTUFBTSxJQUFJLEtBQUssQ0FBQyxPQUFPLEVBQUUsQ0FBQztRQUNuQyxJQUFJLENBQUM7WUFDSCx5QkFBeUI7WUFDekIsTUFBTSxPQUFPLEdBQTJCLElBQUksQ0FBQyxLQUFLLENBQUMsTUFBTSxDQUFDLElBQUksQ0FBQyxDQUFDO1lBRWhFLGtEQUFrRDtZQUNsRCxNQUFNLHNCQUFzQixDQUFDLE9BQU8sRUFBRSxNQUFNLENBQUMsQ0FBQztRQUNoRCxDQUFDO1FBQUMsT0FBTyxLQUFLLEVBQUUsQ0FBQztZQUNmLE9BQU8sQ0FBQyxLQUFLLENBQUMsNEJBQTRCLEVBQUUsTUFBTSxDQUFDLFNBQVMsRUFBRSxL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LE9BQU8sQ0FBQyxLQUFLLENBQUMsNEJBQTRCLEVBQUUsS0FBSyxDQUFDLENBQUM7UUFDbkQsTUFBTSxLQUFLLENBQUM7SUFDZCxDQUFDO0FBQ0gsQ0FBQztBQUVELHVFQUF1RTtBQUNoRSxLQUFLLFVBQVUsaUJBQWlCLENBQ3JDLE1BTXFCLEVBQ3JCLE1BQWMsRUFDZCxTQUFpQixFQUNqQixJQUFVLEVBQ1YsT0FBZ0I7SUFFaEIsSUFBSSxDQUFDO1FBQ0gsTUFBTSxlQUFlLEdBQUc7WUFDdEIsTUFBTTtZQUNOLElBQUksRUFBRTtnQkFDSixNQUFNO2dCQUNOLFNBQVM7Z0JBQ1QsT0FBTztnQkFDUCxHQUFHLElBQUk7YUFDUjtTQUNGLENBQUM7UUFFRixnRUFBZ0U7UUFDaEUsTUFBTSxVQUFVLEdBQUcsT0FBTyxDQUFDLEdBQUcsQ0FBQyxxQkFBcUIsQ0FBQztRQUNyRCxNQUFNLEtBQUssR0FBRyxPQUFPLENBQUMsR0FBRyxDQUFDLGVBQWUsSUFBSSxNQUFNLENBQUM7UUFFcEQsSUFBSSxVQUFVLEVBQUUsQ0FBQztZQUNmLE1BQU0sSUFBQSxzQ0FBZ0IsRUFBQyxlQUFlLEVBQUUsVUFBVSxFQUFFLEtBQUssRUFBRSxNQUFNLENBQUMsQ0FBQztZQUNuRSxPQUFPLENBQUMsR0FBRyxDQUFDLG9DQUFvQyxNQUFNLE1BQU0sT0FBTyxFQUFFLENBQUMsQ0FBQztRQUN6RSxDQUFDO2FBQU0sQ0FBQztZQUNOLE9BQU8sQ0FBQyxHQUFHLENBQ1Qsb0RBQW9ELE1BQU0sTUFBTSxPQUFPLEVBQUUsQ0FDMUUsQ0FBQztRQUNKLENBQUM7SUFDSCxDQUFDO0lBQUMsT0FBTyxLQUFLLEVBQUUsQ0FBQztRQUNmLE9BQU8sQ0FBQyxLQUFLLENBQUMsb0NBQW9DLEVBQUUsS0FBSyxDQUFDLENBQUM7UUFDM0QsdURBQXVEO0lBQ3pELENBQUM7QUFDSCxDQUFDIiwic291cmNlc0NvbnRlbnQiOlsiLy8gVXBkYXRlZDogQWRkZWQgZmx1ZW50LWZmbXBlZyBkZXBlbmRlbmN5IHN1cHBvcnRcbmltcG9ydCB7IFNRU0V2ZW50LCBTUVNSZWNvcmQsIFNRU0JhdGNoUmVzcG9uc2UgfSBmcm9tICdhd3MtbGFtYmRhJztcblxuaW1wb3J0IHsgU1FTQ2xpZW50LCBEZWxldGVNZXNzYWdlQ29tbWFuZCB9IGZyb20gJ0Bhd3Mtc2RrL2NsaWVudC1zcXMnO1xuXG5pbXBvcnQgeyBnZW5lcmF0ZUltYWdlIH0gZnJvbSAnLi9pbWFnZSc7XG5pbXBvcnQgeyBnZW5lcmF0ZU5hcnJhdGlvbiwgZ2VuZXJhdGVTdG9yeUJyZWFrZG93biwgU2NlbmUgfSBmcm9tICcuL25hcnJhdGlvbic7XG5pbXBvcnQgeyBnZW5lcmF0ZVN1YnRpdGxlcyB9IGZyb20gJy4vc3VidGl0bGVzJztcbmltcG9ydCB7IGFkZFNjZW5lSWRzIH0gZnJvbSAnLi9zY3JpcHQnO1xuaW1wb3J0IHsgdXBsb2FkVG9TMywgZ2V0T2JqZWN0RnJvbVMzIH0gZnJvbSAnLi91dGlsL3MzVXBsb2FkZXInO1xuaW1wb3J0IHsgY2hlY2tBdWRpb0NhcHRpb25FeGlzdHMgfSBmcm9tICcuL3V0aWwvYXVkaW9VdGlscyc7XG5pbXBvcnQgeyBnZXRJbWFnZVVybHMgfSBmcm9tICcuL3V0aWwvaW1hZ2VVdGlscyc7XG5pbXBvcnQgeyBnZW5lcmF0ZVZpZGVvRWZmZWN0cywgZ2V0VmlkZW9FZmZlY3RVcmxzIH0gZnJvbSAnLi91dGlsL3ZpZGVvRWZmZWN0cyc7XG5pbXBvcnQgeyBjb21iaW5lVmlkZW9BbmRBdWRpbyB9IGZyb20gJy4vdmlkZW9Db21iaW5lcic7XG5pbXBvcnQge1xuICBjcmVhdGVNYW5pZmVzdCxcbiAgZ2V0TWFuaWZlc3QsXG4gIGh5ZHJhdGVNYW5pZmVzdCxcbiAgdXBkYXRlTWFuaWZlc3QsXG59IGZyb20gJy4vdXRpbC9tYW5pZmVzdFV0aWxzJztcbmltcG9ydCB7IGJyb2FkY2FzdE1lc3NhZ2UgfSBmcm9tICcuLi93ZWJzb2NrZXQtYnJvYWRjYXN0JztcbmltcG9ydCB7IE1hbmlmZXN0IH0gZnJvbSAnLi4vdHlwZXMvczNUeXBlcyc7XG5cbmludGVyZmFjZSBWaWRlb0dlbmVyYXRpb25SZXF1ZXN0IHtcbiAgcHJvbXB0Pzogc3RyaW5nO1xuICB1c2VySWQ6IHN0cmluZztcbiAgdGltZXN0YW1wOiBzdHJpbmc7XG4gIHRvdGFsRHVyYXRpb246IG51bWJlcjtcbiAgc2NlbmVDb3VudDogbnVtYmVyO1xuICBzdGVwOiBudW1iZXI7XG59XG5cbmNvbnN0IHNxcyA9IG5ldyBTUVNDbGllbnQoeyByZWdpb246IHByb2Nlc3MuZW52LkFXU19SRUdJT04gfHwgJ3VzLWVhc3QtMScgfSk7XG5cbmV4cG9ydCBjb25zdCBoYW5kbGVyID0gYXN5bmMgKGV2ZW50OiBTUVNFdmVudCk6IFByb21pc2U8U1FTQmF0Y2hSZXNwb25zZT4gPT4ge1xuICBjb25zb2xlLmxvZyhcbiAgICAn8J+UhCBWaWRlbyBHZW5lcmF0aW9uIExhbWJkYSBzdGFydGVkIC0gVXBkYXRlZCB3aXRoIGZsdWVudC1mZm1wZWcgc3VwcG9ydCcsXG4gICk7XG4gIHJldHVybiBhd2FpdCBoYW5kbGVTUVNFdmVudChldmVudCk7XG59O1xuXG5hc3luYyBmdW5jdGlvbiBoYW5kbGVTUVNFdmVudChldmVudDogU1FTRXZlbnQpOiBQcm9taXNlPFNRU0JhdGNoUmVzcG9uc2U+IHtcbiAgY29uc3QgYmF0Y2hJdGVtRmFpbHVyZXM6IHsgaXRlbUlkZW50aWZpZXI6IHN0cmluZyB9W10gPSBbXTtcblxuICBmb3IgKGNvbnN0IHJlY29yZCBvZiBldmVudC5SZWNvcmRzKSB7XG4gICAgdHJ5IHtcbiAgICAgIC8vIFBhcnNlIHRoZSBtZXNzYWdlIGJvZHlcbiAgICAgIGNvbnN0IHJlcXVlc3Q6IFZpZGVvR2VuZXJhdGlvblJlcXVlc3QgPSBKU09OLnBhcnNlKHJlY29yZC5ib2R5KTtcblxuICAgICAgLy8gUHJvY2VzcyB0aGUgdmlkZW8gZ2VuZXJhdGlvbiB3aXRoIG9yZGVyZWQgc3RlcHNcbiAgICAgIGF3YWl0IHByb2Nlc3NWaWRlb0dlbmVyYXRpb24ocmVxdWVzdCwgcmVjb3JkKTtcbiAgICB9IGNhdGNoIChlcnJvcikge1xuICAgICAgY29uc29sZS5lcnJvcign4p2MIEVycm9yIHByb2Nlc3NpbmcgcmVjb3JkOicsIHJlY29yZC5tZXNzYWdlSWQsIGVycm9yKTtcbiAgICAgIGJhdGNoSXRlbUZhaWx1cmVzLnB1c2goeyBpdGVtSWRlbnRpZmllcjogcmVjb3JkLm1lc3NhZ2VJZCB9KTtcbiAgICB9XG4gIH1cblxuICByZXR1cm4ge1xuICAgIGJhdGNoSXRlbUZhaWx1cmVzLFxuICB9O1xufVxuXG5hc3luYyBmdW5jdGlvbiBwcm9jZXNzVmlkZW9HZW5lcmF0aW9uKFxuICByZXF1ZXN0OiBWaWRlb0dlbmVyYXRpb25SZXF1ZXN0LFxuICByZWNvcmQ/OiBTUVNSZWNvcmQsXG4pOiBQcm9taXNlPGFueT4ge1xuICB0cnkge1xuICAgIGNvbnNvbGUubG9nKCdwcm9jZXNzVmlkZW9HZW5lcmF0aW9uOicsIHJlcXVlc3QpO1xuXG4gICAgLy8gY2hlY2sgaWYgdGhlIHZpZGVvIGlzIGFscmVhZHkgZ2VuZXJhdGVkXG4gICAgbGV0IG1hbmlmZXN0ID0gYXdhaXQgZ2V0TWFuaWZlc3QocmVxdWVzdC51c2VySWQsIHJlcXVlc3QudGltZXN0YW1wKTtcblxuICAgIGNvbnN0IG1hbmlmZXN0SHlkcmF0ZWQgPSBhd2FpdCBoeWRyYXRlTWFuaWZlc3QobWFuaWZlc3QpO1xuICAgIGNvbnNvbGUubG9nKCfwn46lIFZpZGVvIGFscmVhZHkgZ2VuZXJhdGVkLCBza2lwcGluZyB2aWRlbyBnZW5lcmF0aW9uJyk7XG4gICAgaWYgKG1hbmlmZXN0SHlkcmF0ZWQpIHtcbiAgICAgIC8vIGF3YWl0IGJyb2FkY2FzdFByb2dyZXNzKFxuICAgICAgLy8gICAncHJldmlld19jb21wbGV0ZWQnLFxuICAgICAgLy8gICByZXF1ZXN0LnVzZXJJZCxcbiAgICAgIC8vICAgcmVxdWVzdC50aW1lc3RhbXAsXG4gICAgICAvLyAgIHsgbWFuaWZlc3Q6IG1hbmlmZXN0SHlkcmF0ZWQgfSxcbiAgICAgIC8vICAgJ1ZpZGVvIGdlbmVyYXRlZCBzdWNjZXNzZnVsbHknLFxuICAgICAgLy8gKTtcbiAgICAgIC8vIHJldHVybiB7XG4gICAgICAvLyAgIG1lc3NhZ2U6ICdWaWRlbyBhbHJlYWR5IGdlbmVyYXRlZCcsXG4gICAgICAvLyAgIG1hbmlmZXN0OiBtYW5pZmVzdEh5ZHJhdGVkLFxuICAgICAgLy8gfTtcbiAgICB9XG5cbiAgICAvLyBVc2UgdGltZXN0YW1wXG4gICAgY29uc3QgdGltZXN0YW1wID0gcmVxdWVzdC50aW1lc3RhbXA7XG5cbiAgICBjb25zdCBzY2VuZUR1cmF0aW9uID0gTWF0aC5mbG9vcihcbiAgICAgIHJlcXVlc3QudG90YWxEdXJhdGlvbiAvIHJlcXVlc3Quc2NlbmVDb3VudCxcbiAgICApO1xuXG4gICAgLy8gQ2hlY2sgaWYgdGhlcmUgaXMgYWxyZWFkeSBzY3JpcHQgZ2VuZXJhdGVkIGluIHRoZSBzMyBidWNrZXQgZm9yIHRoZSB0aW1lc3RhbXBcbiAgICBjb25zdCBzY3JpcHRLZXkgPSBgJHtyZXF1ZXN0LnVzZXJJZH0vJHt0aW1lc3RhbXB9LnNjcmlwdC50eHRgO1xuICAgIGNvbnN0IGV4aXN0aW5nU2NyaXB0ID0gYXdhaXQgZ2V0T2JqZWN0RnJvbVMzKHNjcmlwdEtleSk7XG5cbiAgICBsZXQgc2NlbmVzOiBTY2VuZVtdID0gW107XG4gICAgbGV0IHZvaWNlVG9uZUluc3RydWN0aW9uOiBzdHJpbmcgPSAnJztcblxuICAgIC8vIFN0ZXAgMTogR2VuZXJhdGUgc2NyaXB0L3N0b3J5IGJyZWFrZG93biB1c2luZyBHUFQtNFxuICAgIGlmIChleGlzdGluZ1NjcmlwdCkge1xuICAgICAgY29uc29sZS5sb2coXG4gICAgICAgICfwn46lIFNjcmlwdCBhbHJlYWR5IGdlbmVyYXRlZCBmb3IgdGhlIHRpbWVzdGFtcCwgdXNpbmcgZXhpc3Rpbmcgc2NyaXB0JyxcbiAgICAgICk7XG4gICAgICBzY2VuZXMgPSBhZGRTY2VuZUlkcyhleGlzdGluZ1NjcmlwdC5zY2VuZXMpO1xuICAgICAgdm9pY2VUb25lSW5zdHJ1Y3Rpb24gPSBleGlzdGluZ1NjcmlwdC52b2ljZVRvbmVJbnN0cnVjdGlvbjtcbiAgICB9IGVsc2Uge1xuICAgICAgY29uc29sZS5sb2coXG4gICAgICAgICfwn46lIE5vIGV4aXN0aW5nIHNjcmlwdCBmb3VuZCwgZ2VuZXJhdGluZyBuZXcgc3RvcnkgYnJlYWtkb3duJyxcbiAgICAgICk7XG5cbiAgICAgIGlmICghcmVxdWVzdC5wcm9tcHQpIHtcbiAgICAgICAgY29uc29sZS5sb2coJ+KdjCBFcnJvcjogTm8gcHJvbXB0IHByb3ZpZGVkJyk7XG4gICAgICAgIHRocm93IG5ldyBFcnJvcignTm8gcHJvbXB0IHByb3ZpZGVkJyk7XG4gICAgICB9XG5cbiAgICAgIGNvbnN0IHN0b3J5QnJlYWtkb3duID0gYXdhaXQgZ2VuZXJhdGVTdG9yeUJyZWFrZG93bihcbiAgICAgICAgcmVxdWVzdC5wcm9tcHQhLFxuICAgICAgICByZXF1ZXN0LnNjZW5lQ291bnQsXG4gICAgICAgIHNjZW5lRHVyYXRpb24sXG4gICAgICAgIHJlcXVlc3QudG90YWxEdXJhdGlvbixcbiAgICAgICAgcmVxdWVzdC51c2VySWQsXG4gICAgICAgIHRpbWVzdGFtcCxcbiAgICAgICk7XG4gICAgICBzY2VuZXMgPSBzdG9yeUJyZWFrZG93bi5zY2VuZXM7XG4gICAgICB2b2ljZVRvbmVJbnN0cnVjdGlvbiA9IHN0b3J5QnJlYWtkb3duLnZvaWNlVG9uZUluc3RydWN0aW9uO1xuICAgIH1cblxuICAgIGlmICghc2NlbmVzIHx8IHNjZW5lcy5sZW5ndGggPT09IDApIHtcbiAgICAgIGNvbnNvbGUubG9nKCfinYwgRXJyb3I6IEZhaWxlZCB0byBnZXQgb3IgZ2VuZXJhdGUgc3RvcnkgYnJlYWtkb3duJyk7XG4gICAgICB0aHJvdyBuZXcgRXJyb3IoJ0ZhaWxlZCB0byBnZXQgb3IgZ2VuZXJhdGUgc3RvcnkgYnJlYWtkb3duJyk7XG4gICAgfVxuXG4gICAgY29uc29sZS5sb2coJ/CfjqUgU3RvcnkgYnJlYWtkb3duIGdlbmVyYXRlZDonLCBzY2VuZXMpO1xuXG4gICAgLy8gU3RlcCAyOiBHZW5lcmF0ZSBpbWFnZXMgZm9yIGVhY2ggc2NlbmUgaW4gcGFyYWxsZWxcbiAgICAvLyBDaGVjayBpZiB0aGVyZSBhcmUgYWxyZWFkeSBpbWFnZXMgZ2VuZXJhdGVkIGluIHRoZSBzMyBidWNrZXQgZm9yIHRoZSB0aW1lc3RhbXBcbiAgICBsZXQgaW1hZ2VVcmxzID0gYXdhaXQgZ2V0SW1hZ2VVcmxzKHJlcXVlc3QudXNlcklkLCB0aW1lc3RhbXApO1xuXG4gICAgaWYgKGltYWdlVXJscy5sZW5ndGggPiAwKSB7XG4gICAgICBjb25zb2xlLmxvZygn8J+OpSBJbWFnZXMgYWxyZWFkeSBnZW5lcmF0ZWQgZm9yIHRoZSB0aW1lc3RhbXA6JywgaW1hZ2VVcmxzKTtcbiAgICB9IGVsc2Uge1xuICAgICAgY29uc3Qgc2VlZCA9IE1hdGguZmxvb3IoTWF0aC5yYW5kb20oKSAqIDEwMDAwMDApO1xuXG4gICAgICBjb25zb2xlLmxvZygn8J+OqCBHZW5lcmF0aW5nIGltYWdlcyBmb3IgZWFjaCBzY2VuZSBpbiBwYXJhbGxlbC4uLicpO1xuXG4gICAgICB0cnkge1xuICAgICAgICBjb25zdCBpbWFnZVByb21pc2VzID0gc2NlbmVzLm1hcChhc3luYyAoc2NlbmU6IGFueSwgaTogbnVtYmVyKSA9PiB7XG4gICAgICAgICAgY29uc29sZS5sb2coXG4gICAgICAgICAgICBg8J+OqCBHZW5lcmF0aW5nIGltYWdlIGZvciBzY2VuZSAke2kgKyAxfTpgLFxuICAgICAgICAgICAgc2NlbmUuZGVzY3JpcHRpb24sXG4gICAgICAgICAgKTtcblxuICAgICAgICAgIGNvbnN0IGltYWdlVXJsID0gYXdhaXQgZ2VuZXJhdGVJbWFnZShcbiAgICAgICAgICAgIHNjZW5lLmRlc2NyaXB0aW9uLFxuICAgICAgICAgICAgaSxcbiAgICAgICAgICAgIHJlcXVlc3QudXNlcklkLFxuICAgICAgICAgICAgdGltZXN0YW1wLFxuICAgICAgICAgICAgc2VlZCxcbiAgICAgICAgICAgIHNjZW5lLmlkLFxuICAgICAgICAgICk7XG5cbiAgICAgICAgICBjb25zb2xlLmxvZyhg4pyFIFNjZW5lICR7aSArIDF9IGltYWdlIGdlbmVyYXRlZDpgLCBpbWFnZVVybCk7XG4gICAgICAgICAgcmV0dXJuIGltYWdlVXJsO1xuICAgICAgICB9KTtcblxuICAgICAgICAvLyBXYWl0IGZvciBhbGwgaW1hZ2VzIHRvIGJlIGdlbmVyYXRlZFxuICAgICAgICBjb25zdCBnZW5lcmF0ZWRJbWFnZVVybHMgPSBhd2FpdCBQcm9taXNlLmFsbChpbWFnZVByb21pc2VzKTtcblxuICAgICAgICBpZiAoZ2VuZXJhdGVkSW1hZ2VVcmxzLmxlbmd0aCA9PT0gMCkge1xuICAgICAgICAgIGNvbnNvbGUubG9nKCfinYwgRXJyb3I6IE5vIGltYWdlcyB3ZXJlIGdlbmVyYXRlZCcpO1xuICAgICAgICAgIHRocm93IG5ldyBFcnJvcignTm8gaW1hZ2VzIHdlcmUgZ2VuZXJhdGVkJyk7XG4gICAgICAgIH1cblxuICAgICAgICAvLyBDb252ZXJ0IGdlbmVyYXRlZCBpbWFnZSBVUkxzIHRvIHRoZSBuZXcgZm9ybWF0XG4gICAgICAgIGltYWdlVXJscyA9IGdlbmVyYXRlZEltYWdlVXJscy5tYXAoKGltYWdlVXJsLCBpbmRleCkgPT4ge1xuICAgICAgICAgIGNvbnN0IGZpbGVuYW1lID0gYCR7dGltZXN0YW1wfS5zY2VuZS0ke3NjZW5lc1tpbmRleF0uaWR9LmpwZ2A7XG4gICAgICAgICAgcmV0dXJuIHsgW2ZpbGVuYW1lXTogaW1hZ2VVcmwgfTtcbiAgICAgICAgfSk7XG5cbiAgICAgICAgY29uc29sZS5sb2coXG4gICAgICAgICAgYPCfjqUgR2VuZXJhdGVkICR7aW1hZ2VVcmxzLmxlbmd0aH0gaW1hZ2VzIGluIHBhcmFsbGVsOmAsXG4gICAgICAgICAgaW1hZ2VVcmxzLFxuICAgICAgICApO1xuICAgICAgfSBjYXRjaCAoZXJyb3IpIHtcbiAgICAgICAgY29uc29sZS5lcnJvcign4p2MIEZhaWxlZCB0byBnZW5lcmF0ZSBpbWFnZXM6JywgZXJyb3IpO1xuICAgICAgICB0aHJvdyBuZXcgRXJyb3IoYEZhaWxlZCB0byBnZW5lcmF0ZSBpbWFnZXM6ICR7ZXJyb3J9YCk7XG4gICAgICB9XG4gICAgfVxuXG4gICAgY29uc29sZS5sb2coJ/CflrzvuI8gSW1hZ2UgVVJMcyBnZW5lcmF0ZWQ6JywgaW1hZ2VVcmxzKTtcblxuICAgIC8vIGNoZWNrIGlmIGFsbCB0b2dldGhlciBpZiAubXAzLCAuc3VidGl0bGUuanNvbiwgLmFzcyBmaWxlcyBhcmUgYWxyZWFkeSBleGlzdHMgaW4gdGhlIHMzIGJ1Y2tldCBhbmQgcmV0dXJuIGJvb2xlYW5cbiAgICBjb25zdCBhdWRpb0NhcHRpb25GaWxlc0V4aXN0ID0gYXdhaXQgY2hlY2tBdWRpb0NhcHRpb25FeGlzdHMoXG4gICAgICByZXF1ZXN0LnVzZXJJZCxcbiAgICAgIHRpbWVzdGFtcCxcbiAgICApO1xuICAgIGlmIChhdWRpb0NhcHRpb25GaWxlc0V4aXN0KSB7XG4gICAgICBjb25zb2xlLmxvZyhcbiAgICAgICAgJ/CfjqUgQXVkaW8sIHN1YnRpdGxlLCBhbmQgYXNzIGZpbGVzIGFscmVhZHkgZ2VuZXJhdGVkIGZvciB0aGUgdGltZXN0YW1wOicsXG4gICAgICAgIGF1ZGlvQ2FwdGlvbkZpbGVzRXhpc3QsXG4gICAgICApO1xuICAgIH0gZWxzZSB7XG4gICAgICBjb25zb2xlLmxvZyhcbiAgICAgICAgJ/CfjqUgTm8gZXhpc3RpbmcgYXVkaW8sIHN1YnRpdGxlLCBhbmQgYXNzIGZpbGVzIGZvdW5kLCBnZW5lcmF0aW5nIG5ldyBuYXJyYXRpb24nLFxuICAgICAgKTtcblxuICAgICAgLy8gU3RlcCAzOiBHZW5lcmF0ZSBhdWRpbyBmaWxlcyB3aXRoIHdvcmQtbGV2ZWwgdGltZXN0YW1wc1xuICAgICAgY29uc3QgeyBzdWJ0aXRsZXMgfSA9IGF3YWl0IGdlbmVyYXRlTmFycmF0aW9uKFxuICAgICAgICBzY2VuZXMsXG4gICAgICAgIHJlcXVlc3QudXNlcklkLFxuICAgICAgICB0aW1lc3RhbXAsXG4gICAgICAgIHZvaWNlVG9uZUluc3RydWN0aW9uLFxuICAgICAgKTtcblxuICAgICAgLy8gU3RlcCA0OiBHZW5lcmF0ZSBzdWJ0aXRsZSBmaWxlXG4gICAgICBhd2FpdCBnZW5lcmF0ZVN1YnRpdGxlcyhzY2VuZXMsIHJlcXVlc3QudXNlcklkLCB0aW1lc3RhbXAsIHN1YnRpdGxlcyk7XG4gICAgfVxuXG4gICAgYXdhaXQgYnJvYWRjYXN0UHJvZ3Jlc3MoXG4gICAgICAnYXVkaW9fc3VidGl0bGVfY3JlYXRlZCcsXG4gICAgICByZXF1ZXN0LnVzZXJJZCxcbiAgICAgIHRpbWVzdGFtcCxcbiAgICAgIHtcbiAgICAgICAgbWFuaWZlc3Q6IG1hbmlmZXN0SHlkcmF0ZWQsXG4gICAgICB9LFxuICAgICAgJ0F1ZGlvIGFuZCBTdWJ0aXRsZXMgY29tcGxldGVkJyxcbiAgICApO1xuXG4gICAgLy8gU3RlcCA1OiBDaGVjayBleGlzdGluZyB2aWRlbyBpZiBub3QsIGdlbmVyYXRlIHZpZGVvIGNsaXBzIGZyb20gaW1hZ2VzXG4gICAgLy8gY29uc29sZS5sb2coJ/CfjqUgR2VuZXJhdGluZyB2aWRlbyBjbGlwcyBmcm9tIGltYWdlcy4uLicpO1xuICAgIC8vIGNvbnN0IHZpZGVvQ2xpcHM6IHN0cmluZ1tdID0gW107XG5cbiAgICAvLyBmb3IgKGxldCBpID0gMDsgaSA8IHNjZW5lcy5sZW5ndGg7IGkrKykge1xuICAgIC8vICAgY29uc3Qgc2NlbmUgPSBzY2VuZXNbaV07XG4gICAgLy8gICBjb25zdCBpbWFnZVVybCA9IGltYWdlVXJsc1tpXTtcbiAgICAvLyAgIGNvbnNvbGUubG9nKFxuICAgIC8vICAgICBg8J+OrCBHZW5lcmF0aW5nIHZpZGVvIGZvciBzY2VuZSAke2kgKyAxfSBmcm9tIGltYWdlOmAsXG4gICAgLy8gICAgIHNjZW5lLmRlc2NyaXB0aW9uLFxuICAgIC8vICAgKTtcbiAgICAvLyAgIHRyeSB7XG4gICAgLy8gICAgIGNvbnN0IHZpZGVvQ2xpcCA9IGF3YWl0IGdlbmVyYXRlVmlkZW9DbGlwKFxuICAgIC8vICAgICAgIHNjZW5lLmRlc2NyaXB0aW9uLFxuICAgIC8vICAgICAgIHNjZW5lLmR1cmF0aW9uLFxuICAgIC8vICAgICAgIGksXG4gICAgLy8gICAgICAgcmVxdWVzdC51c2VySWQsXG4gICAgLy8gICAgICAgdGltZXN0YW1wLFxuICAgIC8vICAgICAgIHNlZWQsXG4gICAgLy8gICAgICAgc2NlbmUuaWQsXG4gICAgLy8gICAgICAgaW1hZ2VVcmwsXG4gICAgLy8gICAgICk7XG4gICAgLy8gICAgIHZpZGVvQ2xpcHMucHVzaCh2aWRlb0NsaXApO1xuICAgIC8vICAgICBjb25zb2xlLmxvZyhg4pyFIFNjZW5lICR7aSArIDF9IHZpZGVvIGdlbmVyYXRlZDpgLCB2aWRlb0NsaXApO1xuICAgIC8vICAgfSBjYXRjaCAoZXJyb3IpIHtcbiAgICAvLyAgICAgY29uc29sZS5lcnJvcihg4p2MIEZhaWxlZCB0byBnZW5lcmF0ZSB2aWRlbyBmb3Igc2NlbmUgJHtpICsgMX06YCwgZXJyb3IpO1xuICAgIC8vICAgICB0aHJvdyBuZXcgRXJyb3IoXG4gICAgLy8gICAgICAgYEZhaWxlZCB0byBnZW5lcmF0ZSB2aWRlbyBmb3Igc2NlbmUgJHtpICsgMX06ICR7ZXJyb3J9YCxcbiAgICAvLyAgICAgKTtcbiAgICAvLyAgIH1cbiAgICAvLyB9XG5cbiAgICAvLyBpZiAodmlkZW9DbGlwcy5sZW5ndGggPT09IDApIHtcbiAgICAvLyAgIGNvbnNvbGUubG9nKCfinYwgRXJyb3I6IE5vIHZpZGVvIGNsaXBzIHdlcmUgZ2VuZXJhdGVkJyk7XG4gICAgLy8gICB0aHJvdyBuZXcgRXJyb3IoJ05vIHZpZGVvIGNsaXBzIHdlcmUgZ2VuZXJhdGVkJyk7XG4gICAgLy8gfVxuXG4gICAgLy8gY29uc29sZS5sb2coYOKchSBHZW5lcmF0ZWQgJHt2aWRlb0NsaXBzLmxlbmd0aH0gdmlkZW8gY2xpcHNgKTtcblxuICAgIC8vIFN0ZXAgNDogR2VuZXJhdGUgY2FtZXJhIG1vdmVtZW50cyBmcm9tIGltYWdlXG4gICAgLy8gY2hlY2sgaWYgdGhlcmUgYXJlIGFscmVhZHkgYWxsIHRoZSB2aWRlbyBlZmZlY3RzIGdlbmVyYXRlZCBpbiB0aGUgczMgYnVja2V0IGZvciB0aGUgdGltZXN0YW1wXG4gICAgbGV0IHZpZGVvRWZmZWN0c1VybHMgPSBbXTtcblxuICAgIHZpZGVvRWZmZWN0c1VybHMgPSBhd2FpdCBnZXRWaWRlb0VmZmVjdFVybHMoXG4gICAgICByZXF1ZXN0LnVzZXJJZCxcbiAgICAgIHRpbWVzdGFtcCxcbiAgICAgIHNjZW5lcyxcbiAgICApO1xuXG4gICAgY29uc29sZS5sb2coJ/CfjqwgVmlkZW8gZWZmZWN0cyBVUkxzIGdlbmVyYXRlZDonLCB2aWRlb0VmZmVjdHNVcmxzKTtcbiAgICBjb25zb2xlLmxvZyhcbiAgICAgICfwn46sIE1hbmlmZXN0IHByZXZpZXcgY29tcGxldGVkOicsXG4gICAgICBKU09OLnN0cmluZ2lmeShtYW5pZmVzdCwgbnVsbCwgMiksXG4gICAgKTtcblxuICAgIGF3YWl0IGJyb2FkY2FzdFByb2dyZXNzKFxuICAgICAgJ3ByZXZpZXdfY29tcGxldGVkJyxcbiAgICAgIHJlcXVlc3QudXNlcklkLFxuICAgICAgdGltZXN0YW1wLFxuICAgICAgeyBtYW5pZmVzdDogbWFuaWZlc3RIeWRyYXRlZCB9LFxuICAgICAgJ1ZpZGVvIGdlbmVyYXRlZCBzdWNjZXNzZnVsbHknLFxuICAgICk7XG5cbiAgICAvLyBTdGVwIDY6IENvbWJpbmUgdmlkZW8gcGFydHMgYW5kIHVwbG9hZCB0byBzM1xuICAgIGNvbnN0IGZpbmFsVmlkZW9VcmwgPSBhd2FpdCBjb21iaW5lVmlkZW9BbmRBdWRpbyhcbiAgICAgIHJlcXVlc3QudXNlcklkLFxuICAgICAgdGltZXN0YW1wLFxuICAgICAgc2NlbmVzLFxuICAgICk7XG5cbiAgICBjb25zb2xlLmxvZygn8J+OrCBWaWRlbyBjb21iaW5lZCBjb21wbGV0ZWQnLCBmaW5hbFZpZGVvVXJsKTtcblxuICAgIC8vIElmIHRoaXMgd2FzIHRyaWdnZXJlZCBieSBTUVMsIGRlbGV0ZSB0aGUgbWVzc2FnZSBmcm9tIHRoZSBxdWV1ZVxuICAgIGlmIChyZWNvcmQgJiYgcHJvY2Vzcy5lbnYuVklERU9fUVVFVUVfVVJMKSB7XG4gICAgICBjb25zdCBkZWxldGVDb21tYW5kID0gbmV3IERlbGV0ZU1lc3NhZ2VDb21tYW5kKHtcbiAgICAgICAgUXVldWVVcmw6IHByb2Nlc3MuZW52LlZJREVPX1FVRVVFX1VSTCxcbiAgICAgICAgUmVjZWlwdEhhbmRsZTogcmVjb3JkLnJlY2VpcHRIYW5kbGUsXG4gICAgICB9KTtcbiAgICAgIGF3YWl0IHNxcy5zZW5kKGRlbGV0ZUNvbW1hbmQpO1xuICAgIH1cblxuICAgIC8vIFN0ZXAgNzogQ3JlYXRlIG1hbmlmZXN0IGFuZCB1cGxvYWQgdG8gczNcbiAgICBhd2FpdCBjcmVhdGVNYW5pZmVzdChcbiAgICAgIHJlcXVlc3QudXNlcklkLFxuICAgICAgdGltZXN0YW1wLFxuICAgICAgc2NlbmVzLFxuICAgICAgcmVxdWVzdC50b3RhbER1cmF0aW9uLFxuICAgICk7XG4gICAgY29uc29sZS5sb2coJ21hbmlmZXN0IGNyZWF0ZWQnKTtcblxuICAgIHJldHVybiB7XG4gICAgICBtZXNzYWdlOiAnVmlkZW8gZ2VuZXJhdGVkIHN1Y2Nlc3NmdWxseScsXG4gICAgfTtcbiAgfSBjYXRjaCAoZXJyb3IpIHtcbiAgICBjb25zb2xlLmVycm9yKCdFcnJvciBpbiB2aWRlbyBnZW5lcmF0aW9uOicsIGVycm9yKTtcbiAgICB0aHJvdyBlcnJvcjtcbiAgfVxufVxuXG4vLyBIZWxwZXIgZnVuY3Rpb24gdG8gYnJvYWRjYXN0IHZpZGVvIGdlbmVyYXRpb24gcHJvZ3Jlc3MgdmlhIFdlYlNvY2tldFxuZXhwb3J0IGFzeW5jIGZ1bmN0aW9uIGJyb2FkY2FzdFByb2dyZXNzKFxuICBhY3Rpb246XG4gICAgfCAnc2NyaXB0X2NyZWF0ZWQnXG4gICAgfCAnaW1hZ2VfY3JlYXRlZCdcbiAgICB8ICdhdWRpb19zdWJ0aXRsZV9jcmVhdGVkJ1xuICAgIHwgJ3ZpZGVvX3NjZW5lX2NyZWF0ZWQnXG4gICAgfCAncHJldmlld19jb21wbGV0ZWQnXG4gICAgfCAndmlkZW9fY29tcGxldGVkJyxcbiAgdXNlcklkOiBzdHJpbmcsXG4gIHRpbWVzdGFtcDogc3RyaW5nLFxuICBkYXRhPzogYW55LFxuICBtZXNzYWdlPzogc3RyaW5nLFxuKTogUHJvbWlzZTx2b2lkPiB7XG4gIHRyeSB7XG4gICAgY29uc3QgcHJvZ3Jlc3NNZXNzYWdlID0ge1xuICAgICAgYWN0aW9uLFxuICAgICAgZGF0YToge1xuICAgICAgICB1c2VySWQsXG4gICAgICAgIHRpbWVzdGFtcCxcbiAgICAgICAgbWVzc2FnZSxcbiAgICAgICAgLi4uZGF0YSxcbiAgICAgIH0sXG4gICAgfTtcblxuICAgIC8vIEdldCB0aGUgV2ViU29ja2V0IGRvbWFpbiBhbmQgc3RhZ2UgZnJvbSBlbnZpcm9ubWVudCB2YXJpYWJsZXNcbiAgICBjb25zdCBkb21haW5OYW1lID0gcHJvY2Vzcy5lbnYuV0VCU09DS0VUX0RPTUFJTl9OQU1FO1xuICAgIGNvbnN0IHN0YWdlID0gcHJvY2Vzcy5lbnYuV0VCU09DS0VUX1NUQUdFIHx8ICdwcm9kJztcblxuICAgIGlmIChkb21haW5OYW1lKSB7XG4gICAgICBhd2FpdCBicm9hZGNhc3RNZXNzYWdlKHByb2dyZXNzTWVzc2FnZSwgZG9tYWluTmFtZSwgc3RhZ2UsIHVzZXJJZCk7XG4gICAgICBjb25zb2xlLmxvZyhg8J+ToSBXZWJTb2NrZXQgcHJvZ3Jlc3MgYnJvYWRjYXN0OiAke2FjdGlvbn0gLSAke21lc3NhZ2V9YCk7XG4gICAgfSBlbHNlIHtcbiAgICAgIGNvbnNvbGUubG9nKFxuICAgICAgICBg8J+ToSBXZWJTb2NrZXQgbm90IGNvbmZpZ3VyZWQsIHNraXBwaW5nIGJyb2FkY2FzdDogJHthY3Rpb259IC0gJHttZXNzYWdlfWAsXG4gICAgICApO1xuICAgIH1cbiAgfSBjYXRjaCAoZXJyb3IpIHtcbiAgICBjb25zb2xlLmVycm9yKCdFcnJvciBicm9hZGNhc3RpbmcgdmlkZW8gcHJvZ3Jlc3M6JywgZXJyb3IpO1xuICAgIC8vIERvbid0IHRocm93IGVycm9yIHRvIGF2b2lkIGJyZWFraW5nIHRoZSBtYWluIHByb2Nlc3NcbiAgfVxufVxuIl19