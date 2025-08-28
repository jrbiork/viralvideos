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
        // Use timestamp from request body
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
        await broadcastProgress('script_created', request.userId, timestamp, {
            scenes,
        }, 'Story breakdown completed');
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
        await broadcastProgress('image_created', request.userId, timestamp, imageUrls, 'Images generated');
        console.log('🎥 No existing audio files found, generating new narration');
        // Step 3: Generate audio files with word-level timestamps
        const { subtitles, narrationUrls } = await (0, narration_1.generateNarration)(scenes, request.userId, timestamp, voiceToneInstruction);
        // Step 4: Generate subtitle file
        const subtitleUrls = await (0, subtitles_1.generateSubtitles)(scenes, request.userId, timestamp, subtitles);
        console.log('📝 Subtitle URLs generated:', subtitleUrls);
        console.log('🎤 Narration URLs generated:', narrationUrls);
        await broadcastProgress('audio_subtitle_created', request.userId, timestamp, {
            subtitles: subtitles.map((subtitle) => ({
                [`${timestamp}.scene-${subtitle.sceneIndex}.subtitle`]: {
                    text: subtitle.fullText,
                },
            })),
            subtitleUrls,
            narrationUrls,
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
        // Step 4: Generate video effects and camera movement using the images
        // check if there are already all the video effects generated in the s3 bucket for the timestamp
        let videoEffectsUrls = [];
        videoEffectsUrls = await (0, videoEffects_1.getVideoEffectUrls)(request.userId, timestamp, scenes);
        await broadcastProgress('video_scene_created', request.userId, timestamp, {
            videoEffectsUrls,
        }, 'Video effects completed');
        console.log('🎬 Video effects URLs generated:', videoEffectsUrls);
        // Step 6: Combine video parts and upload to s3
        const finalVideoUrl = await (0, videoCombiner_1.combineVideoAndAudio)(request.userId, timestamp, scenes);
        console.log('🎬 Video combined completed', finalVideoUrl);
        await broadcastProgress('video_completed', request.userId, timestamp, { finalVideoUrl }, 'Video generated successfully');
        // If this was triggered by SQS, delete the message from the queue
        if (record && process.env.VIDEO_QUEUE_URL) {
            const deleteCommand = new client_sqs_1.DeleteMessageCommand({
                QueueUrl: process.env.VIDEO_QUEUE_URL,
                ReceiptHandle: record.receiptHandle,
            });
            await sqs.send(deleteCommand);
        }
        // Step 7: Create manifest and upload to s3
        await (0, manifestUtils_1.createManifest)(request.userId, timestamp, scenes);
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiaW5kZXguanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyJpbmRleC50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiOzs7QUFzVUEsOENBdUNDO0FBMVdELG9EQUFzRTtBQUV0RSxtQ0FBd0M7QUFDeEMsMkNBQStFO0FBQy9FLDJDQUFnRDtBQUNoRCxxQ0FBdUM7QUFDdkMsa0RBQWdFO0FBQ2hFLGtEQUFpRDtBQUNqRCxzREFBK0U7QUFDL0UsbURBQXVEO0FBQ3ZELHdEQUFzRDtBQUN0RCxnRUFBMEQ7QUFXMUQsTUFBTSxHQUFHLEdBQUcsSUFBSSxzQkFBUyxDQUFDLEVBQUUsTUFBTSxFQUFFLE9BQU8sQ0FBQyxHQUFHLENBQUMsVUFBVSxJQUFJLFdBQVcsRUFBRSxDQUFDLENBQUM7QUFFdEUsTUFBTSxPQUFPLEdBQUcsS0FBSyxFQUFFLEtBQWUsRUFBNkIsRUFBRTtJQUMxRSxPQUFPLENBQUMsR0FBRyxDQUNULHlFQUF5RSxDQUMxRSxDQUFDO0lBQ0YsT0FBTyxNQUFNLGNBQWMsQ0FBQyxLQUFLLENBQUMsQ0FBQztBQUNyQyxDQUFDLENBQUM7QUFMVyxRQUFBLE9BQU8sV0FLbEI7QUFFRixLQUFLLFVBQVUsY0FBYyxDQUFDLEtBQWU7SUFDM0MsTUFBTSxpQkFBaUIsR0FBaUMsRUFBRSxDQUFDO0lBRTNELEtBQUssTUFBTSxNQUFNLElBQUksS0FBSyxDQUFDLE9BQU8sRUFBRSxDQUFDO1FBQ25DLElBQUksQ0FBQztZQUNILHlCQUF5QjtZQUN6QixNQUFNLE9BQU8sR0FBMkIsSUFBSSxDQUFDLEtBQUssQ0FBQyxNQUFNLENBQUMsSUFBSSxDQUFDLENBQUM7WUFFaEUsa0RBQWtEO1lBQ2xELE1BQU0sc0JBQXNCLENBQUMsT0FBTyxFQUFFLE1BQU0sQ0FBQyxDQUFDO1FBQ2hELENBQUM7UUFBQyxPQUFPLEtBQUssRUFBRSxDQUFDO1lBQ2YsT0FBTyxDQUFDLEtBQUssQ0FBQyw0QkFBNEIsRUFBRSxNQUFNLENBQUMsU0FBUyxFQUFFLEtBQUssQ0FBQyxDQUFD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QWlCLENBQ3JDLE1BS3FCLEVBQ3JCLE1BQWMsRUFDZCxTQUFpQixFQUNqQixJQUFVLEVBQ1YsT0FBZ0I7SUFFaEIsSUFBSSxDQUFDO1FBQ0gsTUFBTSxlQUFlLEdBQUc7WUFDdEIsTUFBTTtZQUNOLElBQUksRUFBRTtnQkFDSixNQUFNO2dCQUNOLFNBQVM7Z0JBQ1QsT0FBTztnQkFDUCxHQUFHLElBQUk7YUFDUjtTQUNGLENBQUM7UUFFRixnRUFBZ0U7UUFDaEUsTUFBTSxVQUFVLEdBQUcsT0FBTyxDQUFDLEdBQUcsQ0FBQyxxQkFBcUIsQ0FBQztRQUNyRCxNQUFNLEtBQUssR0FBRyxPQUFPLENBQUMsR0FBRyxDQUFDLGVBQWUsSUFBSSxNQUFNLENBQUM7UUFFcEQsSUFBSSxVQUFVLEVBQUUsQ0FBQztZQUNmLE1BQU0sSUFBQSxzQ0FBZ0IsRUFBQyxlQUFlLEVBQUUsVUFBVSxFQUFFLEtBQUssRUFBRSxNQUFNLENBQUMsQ0FBQztZQUNuRSxPQUFPLENBQUMsR0FBRyxDQUFDLG9DQUFvQyxNQUFNLE1BQU0sT0FBTyxFQUFFLENBQUMsQ0FBQztRQUN6RSxDQUFDO2FBQU0sQ0FBQztZQUNOLE9BQU8sQ0FBQyxHQUFHLENBQ1Qsb0RBQW9ELE1BQU0sTUFBTSxPQUFPLEVBQUUsQ0FDMUUsQ0FBQztRQUNKLENBQUM7SUFDSCxDQUFDO0lBQUMsT0FBTyxLQUFLLEVBQUUsQ0FBQztRQUNmLE9BQU8sQ0FBQyxLQUFLLENBQUMsb0NBQW9DLEVBQUUsS0FBSyxDQUFDLENBQUM7UUFDM0QsdURBQXVEO0lBQ3pELENBQUM7QUFDSCxDQUFDIiwic291cmNlc0NvbnRlbnQiOlsiLy8gVXBkYXRlZDogQWRkZWQgZmx1ZW50LWZmbXBlZyBkZXBlbmRlbmN5IHN1cHBvcnRcbmltcG9ydCB7IFNRU0V2ZW50LCBTUVNSZWNvcmQsIFNRU0JhdGNoUmVzcG9uc2UgfSBmcm9tICdhd3MtbGFtYmRhJztcblxuaW1wb3J0IHsgU1FTQ2xpZW50LCBEZWxldGVNZXNzYWdlQ29tbWFuZCB9IGZyb20gJ0Bhd3Mtc2RrL2NsaWVudC1zcXMnO1xuXG5pbXBvcnQgeyBnZW5lcmF0ZUltYWdlIH0gZnJvbSAnLi9pbWFnZSc7XG5pbXBvcnQgeyBnZW5lcmF0ZU5hcnJhdGlvbiwgZ2VuZXJhdGVTdG9yeUJyZWFrZG93biwgU2NlbmUgfSBmcm9tICcuL25hcnJhdGlvbic7XG5pbXBvcnQgeyBnZW5lcmF0ZVN1YnRpdGxlcyB9IGZyb20gJy4vc3VidGl0bGVzJztcbmltcG9ydCB7IGFkZFNjZW5lSWRzIH0gZnJvbSAnLi9zY3JpcHQnO1xuaW1wb3J0IHsgdXBsb2FkVG9TMywgZ2V0T2JqZWN0RnJvbVMzIH0gZnJvbSAnLi91dGlsL3MzVXBsb2FkZXInO1xuaW1wb3J0IHsgZ2V0SW1hZ2VVcmxzIH0gZnJvbSAnLi91dGlsL2ltYWdlVXRpbHMnO1xuaW1wb3J0IHsgZ2VuZXJhdGVWaWRlb0VmZmVjdHMsIGdldFZpZGVvRWZmZWN0VXJscyB9IGZyb20gJy4vdXRpbC92aWRlb0VmZmVjdHMnO1xuaW1wb3J0IHsgY29tYmluZVZpZGVvQW5kQXVkaW8gfSBmcm9tICcuL3ZpZGVvQ29tYmluZXInO1xuaW1wb3J0IHsgY3JlYXRlTWFuaWZlc3QgfSBmcm9tICcuL3V0aWwvbWFuaWZlc3RVdGlscyc7XG5pbXBvcnQgeyBicm9hZGNhc3RNZXNzYWdlIH0gZnJvbSAnLi4vd2Vic29ja2V0LWJyb2FkY2FzdCc7XG5cbmludGVyZmFjZSBWaWRlb0dlbmVyYXRpb25SZXF1ZXN0IHtcbiAgcHJvbXB0Pzogc3RyaW5nO1xuICB1c2VySWQ6IHN0cmluZztcbiAgdGltZXN0YW1wOiBzdHJpbmc7XG4gIHRvdGFsRHVyYXRpb246IG51bWJlcjtcbiAgc2NlbmVDb3VudDogbnVtYmVyO1xuICBzdGVwOiBudW1iZXI7XG59XG5cbmNvbnN0IHNxcyA9IG5ldyBTUVNDbGllbnQoeyByZWdpb246IHByb2Nlc3MuZW52LkFXU19SRUdJT04gfHwgJ3VzLWVhc3QtMScgfSk7XG5cbmV4cG9ydCBjb25zdCBoYW5kbGVyID0gYXN5bmMgKGV2ZW50OiBTUVNFdmVudCk6IFByb21pc2U8U1FTQmF0Y2hSZXNwb25zZT4gPT4ge1xuICBjb25zb2xlLmxvZyhcbiAgICAn8J+UhCBWaWRlbyBHZW5lcmF0aW9uIExhbWJkYSBzdGFydGVkIC0gVXBkYXRlZCB3aXRoIGZsdWVudC1mZm1wZWcgc3VwcG9ydCcsXG4gICk7XG4gIHJldHVybiBhd2FpdCBoYW5kbGVTUVNFdmVudChldmVudCk7XG59O1xuXG5hc3luYyBmdW5jdGlvbiBoYW5kbGVTUVNFdmVudChldmVudDogU1FTRXZlbnQpOiBQcm9taXNlPFNRU0JhdGNoUmVzcG9uc2U+IHtcbiAgY29uc3QgYmF0Y2hJdGVtRmFpbHVyZXM6IHsgaXRlbUlkZW50aWZpZXI6IHN0cmluZyB9W10gPSBbXTtcblxuICBmb3IgKGNvbnN0IHJlY29yZCBvZiBldmVudC5SZWNvcmRzKSB7XG4gICAgdHJ5IHtcbiAgICAgIC8vIFBhcnNlIHRoZSBtZXNzYWdlIGJvZHlcbiAgICAgIGNvbnN0IHJlcXVlc3Q6IFZpZGVvR2VuZXJhdGlvblJlcXVlc3QgPSBKU09OLnBhcnNlKHJlY29yZC5ib2R5KTtcblxuICAgICAgLy8gUHJvY2VzcyB0aGUgdmlkZW8gZ2VuZXJhdGlvbiB3aXRoIG9yZGVyZWQgc3RlcHNcbiAgICAgIGF3YWl0IHByb2Nlc3NWaWRlb0dlbmVyYXRpb24ocmVxdWVzdCwgcmVjb3JkKTtcbiAgICB9IGNhdGNoIChlcnJvcikge1xuICAgICAgY29uc29sZS5lcnJvcign4p2MIEVycm9yIHByb2Nlc3NpbmcgcmVjb3JkOicsIHJlY29yZC5tZXNzYWdlSWQsIGVycm9yKTtcbiAgICAgIGJhdGNoSXRlbUZhaWx1cmVzLnB1c2goeyBpdGVtSWRlbnRpZmllcjogcmVjb3JkLm1lc3NhZ2VJZCB9KTtcbiAgICB9XG4gIH1cblxuICByZXR1cm4ge1xuICAgIGJhdGNoSXRlbUZhaWx1cmVzLFxuICB9O1xufVxuXG5hc3luYyBmdW5jdGlvbiBwcm9jZXNzVmlkZW9HZW5lcmF0aW9uKFxuICByZXF1ZXN0OiBWaWRlb0dlbmVyYXRpb25SZXF1ZXN0LFxuICByZWNvcmQ/OiBTUVNSZWNvcmQsXG4pOiBQcm9taXNlPGFueT4ge1xuICB0cnkge1xuICAgIGNvbnNvbGUubG9nKCdwcm9jZXNzVmlkZW9HZW5lcmF0aW9uOicsIHJlcXVlc3QpO1xuXG4gICAgLy8gVXNlIHRpbWVzdGFtcCBmcm9tIHJlcXVlc3QgYm9keVxuICAgIGNvbnN0IHRpbWVzdGFtcCA9IHJlcXVlc3QudGltZXN0YW1wO1xuXG4gICAgY29uc3Qgc2NlbmVEdXJhdGlvbiA9IE1hdGguZmxvb3IoXG4gICAgICByZXF1ZXN0LnRvdGFsRHVyYXRpb24gLyByZXF1ZXN0LnNjZW5lQ291bnQsXG4gICAgKTtcblxuICAgIC8vIENoZWNrIGlmIHRoZXJlIGlzIGFscmVhZHkgc2NyaXB0IGdlbmVyYXRlZCBpbiB0aGUgczMgYnVja2V0IGZvciB0aGUgdGltZXN0YW1wXG4gICAgY29uc3Qgc2NyaXB0S2V5ID0gYCR7cmVxdWVzdC51c2VySWR9LyR7dGltZXN0YW1wfS5zY3JpcHQudHh0YDtcbiAgICBjb25zdCBleGlzdGluZ1NjcmlwdCA9IGF3YWl0IGdldE9iamVjdEZyb21TMyhzY3JpcHRLZXkpO1xuXG4gICAgbGV0IHNjZW5lczogU2NlbmVbXSA9IFtdO1xuICAgIGxldCB2b2ljZVRvbmVJbnN0cnVjdGlvbjogc3RyaW5nID0gJyc7XG5cbiAgICAvLyBTdGVwIDE6IEdlbmVyYXRlIHNjcmlwdC9zdG9yeSBicmVha2Rvd24gdXNpbmcgR1BULTRcbiAgICBpZiAoZXhpc3RpbmdTY3JpcHQpIHtcbiAgICAgIGNvbnNvbGUubG9nKFxuICAgICAgICAn8J+OpSBTY3JpcHQgYWxyZWFkeSBnZW5lcmF0ZWQgZm9yIHRoZSB0aW1lc3RhbXAsIHVzaW5nIGV4aXN0aW5nIHNjcmlwdCcsXG4gICAgICApO1xuICAgICAgc2NlbmVzID0gYWRkU2NlbmVJZHMoZXhpc3RpbmdTY3JpcHQuc2NlbmVzKTtcbiAgICAgIHZvaWNlVG9uZUluc3RydWN0aW9uID0gZXhpc3RpbmdTY3JpcHQudm9pY2VUb25lSW5zdHJ1Y3Rpb247XG4gICAgfSBlbHNlIHtcbiAgICAgIGNvbnNvbGUubG9nKFxuICAgICAgICAn8J+OpSBObyBleGlzdGluZyBzY3JpcHQgZm91bmQsIGdlbmVyYXRpbmcgbmV3IHN0b3J5IGJyZWFrZG93bicsXG4gICAgICApO1xuXG4gICAgICBpZiAoIXJlcXVlc3QucHJvbXB0KSB7XG4gICAgICAgIGNvbnNvbGUubG9nKCfinYwgRXJyb3I6IE5vIHByb21wdCBwcm92aWRlZCcpO1xuICAgICAgICB0aHJvdyBuZXcgRXJyb3IoJ05vIHByb21wdCBwcm92aWRlZCcpO1xuICAgICAgfVxuXG4gICAgICBjb25zdCBzdG9yeUJyZWFrZG93biA9IGF3YWl0IGdlbmVyYXRlU3RvcnlCcmVha2Rvd24oXG4gICAgICAgIHJlcXVlc3QucHJvbXB0LFxuICAgICAgICByZXF1ZXN0LnNjZW5lQ291bnQsXG4gICAgICAgIHNjZW5lRHVyYXRpb24sXG4gICAgICAgIHJlcXVlc3QudG90YWxEdXJhdGlvbixcbiAgICAgICAgcmVxdWVzdC51c2VySWQsXG4gICAgICAgIHRpbWVzdGFtcCxcbiAgICAgICk7XG4gICAgICBzY2VuZXMgPSBzdG9yeUJyZWFrZG93bi5zY2VuZXM7XG4gICAgICB2b2ljZVRvbmVJbnN0cnVjdGlvbiA9IHN0b3J5QnJlYWtkb3duLnZvaWNlVG9uZUluc3RydWN0aW9uO1xuICAgIH1cblxuICAgIGlmICghc2NlbmVzIHx8IHNjZW5lcy5sZW5ndGggPT09IDApIHtcbiAgICAgIGNvbnNvbGUubG9nKCfinYwgRXJyb3I6IEZhaWxlZCB0byBnZXQgb3IgZ2VuZXJhdGUgc3RvcnkgYnJlYWtkb3duJyk7XG4gICAgICB0aHJvdyBuZXcgRXJyb3IoJ0ZhaWxlZCB0byBnZXQgb3IgZ2VuZXJhdGUgc3RvcnkgYnJlYWtkb3duJyk7XG4gICAgfVxuXG4gICAgY29uc29sZS5sb2coJ/CfjqUgU3RvcnkgYnJlYWtkb3duIGdlbmVyYXRlZDonLCBzY2VuZXMpO1xuXG4gICAgYXdhaXQgYnJvYWRjYXN0UHJvZ3Jlc3MoXG4gICAgICAnc2NyaXB0X2NyZWF0ZWQnLFxuICAgICAgcmVxdWVzdC51c2VySWQsXG4gICAgICB0aW1lc3RhbXAsXG4gICAgICB7XG4gICAgICAgIHNjZW5lcyxcbiAgICAgIH0sXG4gICAgICAnU3RvcnkgYnJlYWtkb3duIGNvbXBsZXRlZCcsXG4gICAgKTtcblxuICAgIC8vIFN0ZXAgMjogR2VuZXJhdGUgaW1hZ2VzIGZvciBlYWNoIHNjZW5lIGluIHBhcmFsbGVsXG4gICAgLy8gQ2hlY2sgaWYgdGhlcmUgYXJlIGFscmVhZHkgaW1hZ2VzIGdlbmVyYXRlZCBpbiB0aGUgczMgYnVja2V0IGZvciB0aGUgdGltZXN0YW1wXG4gICAgbGV0IGltYWdlVXJscyA9IGF3YWl0IGdldEltYWdlVXJscyhyZXF1ZXN0LnVzZXJJZCwgdGltZXN0YW1wKTtcblxuICAgIGlmIChpbWFnZVVybHMubGVuZ3RoID4gMCkge1xuICAgICAgY29uc29sZS5sb2coJ/CfjqUgSW1hZ2VzIGFscmVhZHkgZ2VuZXJhdGVkIGZvciB0aGUgdGltZXN0YW1wOicsIGltYWdlVXJscyk7XG4gICAgfSBlbHNlIHtcbiAgICAgIGNvbnN0IHNlZWQgPSBNYXRoLmZsb29yKE1hdGgucmFuZG9tKCkgKiAxMDAwMDAwKTtcblxuICAgICAgY29uc29sZS5sb2coJ/CfjqggR2VuZXJhdGluZyBpbWFnZXMgZm9yIGVhY2ggc2NlbmUgaW4gcGFyYWxsZWwuLi4nKTtcblxuICAgICAgdHJ5IHtcbiAgICAgICAgY29uc3QgaW1hZ2VQcm9taXNlcyA9IHNjZW5lcy5tYXAoYXN5bmMgKHNjZW5lOiBhbnksIGk6IG51bWJlcikgPT4ge1xuICAgICAgICAgIGNvbnNvbGUubG9nKFxuICAgICAgICAgICAgYPCfjqggR2VuZXJhdGluZyBpbWFnZSBmb3Igc2NlbmUgJHtpICsgMX06YCxcbiAgICAgICAgICAgIHNjZW5lLmRlc2NyaXB0aW9uLFxuICAgICAgICAgICk7XG5cbiAgICAgICAgICBjb25zdCBpbWFnZVVybCA9IGF3YWl0IGdlbmVyYXRlSW1hZ2UoXG4gICAgICAgICAgICBzY2VuZS5kZXNjcmlwdGlvbixcbiAgICAgICAgICAgIGksXG4gICAgICAgICAgICByZXF1ZXN0LnVzZXJJZCxcbiAgICAgICAgICAgIHRpbWVzdGFtcCxcbiAgICAgICAgICAgIHNlZWQsXG4gICAgICAgICAgICBzY2VuZS5pZCxcbiAgICAgICAgICApO1xuXG4gICAgICAgICAgY29uc29sZS5sb2coYOKchSBTY2VuZSAke2kgKyAxfSBpbWFnZSBnZW5lcmF0ZWQ6YCwgaW1hZ2VVcmwpO1xuICAgICAgICAgIHJldHVybiBpbWFnZVVybDtcbiAgICAgICAgfSk7XG5cbiAgICAgICAgLy8gV2FpdCBmb3IgYWxsIGltYWdlcyB0byBiZSBnZW5lcmF0ZWRcbiAgICAgICAgY29uc3QgZ2VuZXJhdGVkSW1hZ2VVcmxzID0gYXdhaXQgUHJvbWlzZS5hbGwoaW1hZ2VQcm9taXNlcyk7XG5cbiAgICAgICAgaWYgKGdlbmVyYXRlZEltYWdlVXJscy5sZW5ndGggPT09IDApIHtcbiAgICAgICAgICBjb25zb2xlLmxvZygn4p2MIEVycm9yOiBObyBpbWFnZXMgd2VyZSBnZW5lcmF0ZWQnKTtcbiAgICAgICAgICB0aHJvdyBuZXcgRXJyb3IoJ05vIGltYWdlcyB3ZXJlIGdlbmVyYXRlZCcpO1xuICAgICAgICB9XG5cbiAgICAgICAgLy8gQ29udmVydCBnZW5lcmF0ZWQgaW1hZ2UgVVJMcyB0byB0aGUgbmV3IGZvcm1hdFxuICAgICAgICBpbWFnZVVybHMgPSBnZW5lcmF0ZWRJbWFnZVVybHMubWFwKChpbWFnZVVybCwgaW5kZXgpID0+IHtcbiAgICAgICAgICBjb25zdCBmaWxlbmFtZSA9IGAke3RpbWVzdGFtcH0uc2NlbmUtJHtzY2VuZXNbaW5kZXhdLmlkfS5qcGdgO1xuICAgICAgICAgIHJldHVybiB7IFtmaWxlbmFtZV06IGltYWdlVXJsIH07XG4gICAgICAgIH0pO1xuXG4gICAgICAgIGNvbnNvbGUubG9nKFxuICAgICAgICAgIGDwn46lIEdlbmVyYXRlZCAke2ltYWdlVXJscy5sZW5ndGh9IGltYWdlcyBpbiBwYXJhbGxlbDpgLFxuICAgICAgICAgIGltYWdlVXJscyxcbiAgICAgICAgKTtcbiAgICAgIH0gY2F0Y2ggKGVycm9yKSB7XG4gICAgICAgIGNvbnNvbGUuZXJyb3IoJ+KdjCBGYWlsZWQgdG8gZ2VuZXJhdGUgaW1hZ2VzOicsIGVycm9yKTtcbiAgICAgICAgdGhyb3cgbmV3IEVycm9yKGBGYWlsZWQgdG8gZ2VuZXJhdGUgaW1hZ2VzOiAke2Vycm9yfWApO1xuICAgICAgfVxuICAgIH1cblxuICAgIGNvbnNvbGUubG9nKCfwn5a877iPIEltYWdlIFVSTHMgZ2VuZXJhdGVkOicsIGltYWdlVXJscyk7XG5cbiAgICBhd2FpdCBicm9hZGNhc3RQcm9ncmVzcyhcbiAgICAgICdpbWFnZV9jcmVhdGVkJyxcbiAgICAgIHJlcXVlc3QudXNlcklkLFxuICAgICAgdGltZXN0YW1wLFxuICAgICAgaW1hZ2VVcmxzLFxuICAgICAgJ0ltYWdlcyBnZW5lcmF0ZWQnLFxuICAgICk7XG5cbiAgICBjb25zb2xlLmxvZygn8J+OpSBObyBleGlzdGluZyBhdWRpbyBmaWxlcyBmb3VuZCwgZ2VuZXJhdGluZyBuZXcgbmFycmF0aW9uJyk7XG5cbiAgICAvLyBTdGVwIDM6IEdlbmVyYXRlIGF1ZGlvIGZpbGVzIHdpdGggd29yZC1sZXZlbCB0aW1lc3RhbXBzXG4gICAgY29uc3QgeyBzdWJ0aXRsZXMsIG5hcnJhdGlvblVybHMgfSA9IGF3YWl0IGdlbmVyYXRlTmFycmF0aW9uKFxuICAgICAgc2NlbmVzLFxuICAgICAgcmVxdWVzdC51c2VySWQsXG4gICAgICB0aW1lc3RhbXAsXG4gICAgICB2b2ljZVRvbmVJbnN0cnVjdGlvbixcbiAgICApO1xuXG4gICAgLy8gU3RlcCA0OiBHZW5lcmF0ZSBzdWJ0aXRsZSBmaWxlXG4gICAgY29uc3Qgc3VidGl0bGVVcmxzID0gYXdhaXQgZ2VuZXJhdGVTdWJ0aXRsZXMoXG4gICAgICBzY2VuZXMsXG4gICAgICByZXF1ZXN0LnVzZXJJZCxcbiAgICAgIHRpbWVzdGFtcCxcbiAgICAgIHN1YnRpdGxlcyxcbiAgICApO1xuXG4gICAgY29uc29sZS5sb2coJ/Cfk50gU3VidGl0bGUgVVJMcyBnZW5lcmF0ZWQ6Jywgc3VidGl0bGVVcmxzKTtcbiAgICBjb25zb2xlLmxvZygn8J+OpCBOYXJyYXRpb24gVVJMcyBnZW5lcmF0ZWQ6JywgbmFycmF0aW9uVXJscyk7XG5cbiAgICBhd2FpdCBicm9hZGNhc3RQcm9ncmVzcyhcbiAgICAgICdhdWRpb19zdWJ0aXRsZV9jcmVhdGVkJyxcbiAgICAgIHJlcXVlc3QudXNlcklkLFxuICAgICAgdGltZXN0YW1wLFxuICAgICAge1xuICAgICAgICBzdWJ0aXRsZXM6IHN1YnRpdGxlcy5tYXAoKHN1YnRpdGxlKSA9PiAoe1xuICAgICAgICAgIFtgJHt0aW1lc3RhbXB9LnNjZW5lLSR7c3VidGl0bGUuc2NlbmVJbmRleH0uc3VidGl0bGVgXToge1xuICAgICAgICAgICAgdGV4dDogc3VidGl0bGUuZnVsbFRleHQsXG4gICAgICAgICAgfSxcbiAgICAgICAgfSkpLFxuICAgICAgICBzdWJ0aXRsZVVybHMsXG4gICAgICAgIG5hcnJhdGlvblVybHMsXG4gICAgICB9LFxuICAgICAgJ0F1ZGlvIGFuZCBTdWJ0aXRsZXMgY29tcGxldGVkJyxcbiAgICApO1xuXG4gICAgLy8gU3RlcCA1OiBDaGVjayBleGlzdGluZyB2aWRlbyBpZiBub3QsIGdlbmVyYXRlIHZpZGVvIGNsaXBzIGZyb20gaW1hZ2VzXG4gICAgLy8gY29uc29sZS5sb2coJ/CfjqUgR2VuZXJhdGluZyB2aWRlbyBjbGlwcyBmcm9tIGltYWdlcy4uLicpO1xuICAgIC8vIGNvbnN0IHZpZGVvQ2xpcHM6IHN0cmluZ1tdID0gW107XG5cbiAgICAvLyBmb3IgKGxldCBpID0gMDsgaSA8IHNjZW5lcy5sZW5ndGg7IGkrKykge1xuICAgIC8vICAgY29uc3Qgc2NlbmUgPSBzY2VuZXNbaV07XG4gICAgLy8gICBjb25zdCBpbWFnZVVybCA9IGltYWdlVXJsc1tpXTtcbiAgICAvLyAgIGNvbnNvbGUubG9nKFxuICAgIC8vICAgICBg8J+OrCBHZW5lcmF0aW5nIHZpZGVvIGZvciBzY2VuZSAke2kgKyAxfSBmcm9tIGltYWdlOmAsXG4gICAgLy8gICAgIHNjZW5lLmRlc2NyaXB0aW9uLFxuICAgIC8vICAgKTtcbiAgICAvLyAgIHRyeSB7XG4gICAgLy8gICAgIGNvbnN0IHZpZGVvQ2xpcCA9IGF3YWl0IGdlbmVyYXRlVmlkZW9DbGlwKFxuICAgIC8vICAgICAgIHNjZW5lLmRlc2NyaXB0aW9uLFxuICAgIC8vICAgICAgIHNjZW5lLmR1cmF0aW9uLFxuICAgIC8vICAgICAgIGksXG4gICAgLy8gICAgICAgcmVxdWVzdC51c2VySWQsXG4gICAgLy8gICAgICAgdGltZXN0YW1wLFxuICAgIC8vICAgICAgIHNlZWQsXG4gICAgLy8gICAgICAgc2NlbmUuaWQsXG4gICAgLy8gICAgICAgaW1hZ2VVcmwsXG4gICAgLy8gICAgICk7XG4gICAgLy8gICAgIHZpZGVvQ2xpcHMucHVzaCh2aWRlb0NsaXApO1xuICAgIC8vICAgICBjb25zb2xlLmxvZyhg4pyFIFNjZW5lICR7aSArIDF9IHZpZGVvIGdlbmVyYXRlZDpgLCB2aWRlb0NsaXApO1xuICAgIC8vICAgfSBjYXRjaCAoZXJyb3IpIHtcbiAgICAvLyAgICAgY29uc29sZS5lcnJvcihg4p2MIEZhaWxlZCB0byBnZW5lcmF0ZSB2aWRlbyBmb3Igc2NlbmUgJHtpICsgMX06YCwgZXJyb3IpO1xuICAgIC8vICAgICB0aHJvdyBuZXcgRXJyb3IoXG4gICAgLy8gICAgICAgYEZhaWxlZCB0byBnZW5lcmF0ZSB2aWRlbyBmb3Igc2NlbmUgJHtpICsgMX06ICR7ZXJyb3J9YCxcbiAgICAvLyAgICAgKTtcbiAgICAvLyAgIH1cbiAgICAvLyB9XG5cbiAgICAvLyBpZiAodmlkZW9DbGlwcy5sZW5ndGggPT09IDApIHtcbiAgICAvLyAgIGNvbnNvbGUubG9nKCfinYwgRXJyb3I6IE5vIHZpZGVvIGNsaXBzIHdlcmUgZ2VuZXJhdGVkJyk7XG4gICAgLy8gICB0aHJvdyBuZXcgRXJyb3IoJ05vIHZpZGVvIGNsaXBzIHdlcmUgZ2VuZXJhdGVkJyk7XG4gICAgLy8gfVxuXG4gICAgLy8gY29uc29sZS5sb2coYOKchSBHZW5lcmF0ZWQgJHt2aWRlb0NsaXBzLmxlbmd0aH0gdmlkZW8gY2xpcHNgKTtcblxuICAgIC8vIFN0ZXAgNDogR2VuZXJhdGUgdmlkZW8gZWZmZWN0cyBhbmQgY2FtZXJhIG1vdmVtZW50IHVzaW5nIHRoZSBpbWFnZXNcblxuICAgIC8vIGNoZWNrIGlmIHRoZXJlIGFyZSBhbHJlYWR5IGFsbCB0aGUgdmlkZW8gZWZmZWN0cyBnZW5lcmF0ZWQgaW4gdGhlIHMzIGJ1Y2tldCBmb3IgdGhlIHRpbWVzdGFtcFxuICAgIGxldCB2aWRlb0VmZmVjdHNVcmxzID0gW107XG5cbiAgICB2aWRlb0VmZmVjdHNVcmxzID0gYXdhaXQgZ2V0VmlkZW9FZmZlY3RVcmxzKFxuICAgICAgcmVxdWVzdC51c2VySWQsXG4gICAgICB0aW1lc3RhbXAsXG4gICAgICBzY2VuZXMsXG4gICAgKTtcblxuICAgIGF3YWl0IGJyb2FkY2FzdFByb2dyZXNzKFxuICAgICAgJ3ZpZGVvX3NjZW5lX2NyZWF0ZWQnLFxuICAgICAgcmVxdWVzdC51c2VySWQsXG4gICAgICB0aW1lc3RhbXAsXG4gICAgICB7XG4gICAgICAgIHZpZGVvRWZmZWN0c1VybHMsXG4gICAgICB9LFxuICAgICAgJ1ZpZGVvIGVmZmVjdHMgY29tcGxldGVkJyxcbiAgICApO1xuXG4gICAgY29uc29sZS5sb2coJ/CfjqwgVmlkZW8gZWZmZWN0cyBVUkxzIGdlbmVyYXRlZDonLCB2aWRlb0VmZmVjdHNVcmxzKTtcblxuICAgIC8vIFN0ZXAgNjogQ29tYmluZSB2aWRlbyBwYXJ0cyBhbmQgdXBsb2FkIHRvIHMzXG4gICAgY29uc3QgZmluYWxWaWRlb1VybCA9IGF3YWl0IGNvbWJpbmVWaWRlb0FuZEF1ZGlvKFxuICAgICAgcmVxdWVzdC51c2VySWQsXG4gICAgICB0aW1lc3RhbXAsXG4gICAgICBzY2VuZXMsXG4gICAgKTtcblxuICAgIGNvbnNvbGUubG9nKCfwn46sIFZpZGVvIGNvbWJpbmVkIGNvbXBsZXRlZCcsIGZpbmFsVmlkZW9VcmwpO1xuXG4gICAgYXdhaXQgYnJvYWRjYXN0UHJvZ3Jlc3MoXG4gICAgICAndmlkZW9fY29tcGxldGVkJyxcbiAgICAgIHJlcXVlc3QudXNlcklkLFxuICAgICAgdGltZXN0YW1wLFxuICAgICAgeyBmaW5hbFZpZGVvVXJsIH0sXG4gICAgICAnVmlkZW8gZ2VuZXJhdGVkIHN1Y2Nlc3NmdWxseScsXG4gICAgKTtcblxuICAgIC8vIElmIHRoaXMgd2FzIHRyaWdnZXJlZCBieSBTUVMsIGRlbGV0ZSB0aGUgbWVzc2FnZSBmcm9tIHRoZSBxdWV1ZVxuICAgIGlmIChyZWNvcmQgJiYgcHJvY2Vzcy5lbnYuVklERU9fUVVFVUVfVVJMKSB7XG4gICAgICBjb25zdCBkZWxldGVDb21tYW5kID0gbmV3IERlbGV0ZU1lc3NhZ2VDb21tYW5kKHtcbiAgICAgICAgUXVldWVVcmw6IHByb2Nlc3MuZW52LlZJREVPX1FVRVVFX1VSTCxcbiAgICAgICAgUmVjZWlwdEhhbmRsZTogcmVjb3JkLnJlY2VpcHRIYW5kbGUsXG4gICAgICB9KTtcbiAgICAgIGF3YWl0IHNxcy5zZW5kKGRlbGV0ZUNvbW1hbmQpO1xuICAgIH1cblxuICAgIC8vIFN0ZXAgNzogQ3JlYXRlIG1hbmlmZXN0IGFuZCB1cGxvYWQgdG8gczNcbiAgICBhd2FpdCBjcmVhdGVNYW5pZmVzdChyZXF1ZXN0LnVzZXJJZCwgdGltZXN0YW1wLCBzY2VuZXMpO1xuICAgIGNvbnNvbGUubG9nKCdtYW5pZmVzdCBjcmVhdGVkJyk7XG5cbiAgICByZXR1cm4ge1xuICAgICAgbWVzc2FnZTogJ1ZpZGVvIGdlbmVyYXRlZCBzdWNjZXNzZnVsbHknLFxuICAgIH07XG4gIH0gY2F0Y2ggKGVycm9yKSB7XG4gICAgY29uc29sZS5lcnJvcignRXJyb3IgaW4gdmlkZW8gZ2VuZXJhdGlvbjonLCBlcnJvcik7XG4gICAgdGhyb3cgZXJyb3I7XG4gIH1cbn1cblxuLy8gSGVscGVyIGZ1bmN0aW9uIHRvIGJyb2FkY2FzdCB2aWRlbyBnZW5lcmF0aW9uIHByb2dyZXNzIHZpYSBXZWJTb2NrZXRcbmV4cG9ydCBhc3luYyBmdW5jdGlvbiBicm9hZGNhc3RQcm9ncmVzcyhcbiAgYWN0aW9uOlxuICAgIHwgJ3NjcmlwdF9jcmVhdGVkJ1xuICAgIHwgJ2ltYWdlX2NyZWF0ZWQnXG4gICAgfCAnYXVkaW9fc3VidGl0bGVfY3JlYXRlZCdcbiAgICB8ICd2aWRlb19zY2VuZV9jcmVhdGVkJ1xuICAgIHwgJ3ZpZGVvX2NvbXBsZXRlZCcsXG4gIHVzZXJJZDogc3RyaW5nLFxuICB0aW1lc3RhbXA6IHN0cmluZyxcbiAgZGF0YT86IGFueSxcbiAgbWVzc2FnZT86IHN0cmluZyxcbik6IFByb21pc2U8dm9pZD4ge1xuICB0cnkge1xuICAgIGNvbnN0IHByb2dyZXNzTWVzc2FnZSA9IHtcbiAgICAgIGFjdGlvbixcbiAgICAgIGRhdGE6IHtcbiAgICAgICAgdXNlcklkLFxuICAgICAgICB0aW1lc3RhbXAsXG4gICAgICAgIG1lc3NhZ2UsXG4gICAgICAgIC4uLmRhdGEsXG4gICAgICB9LFxuICAgIH07XG5cbiAgICAvLyBHZXQgdGhlIFdlYlNvY2tldCBkb21haW4gYW5kIHN0YWdlIGZyb20gZW52aXJvbm1lbnQgdmFyaWFibGVzXG4gICAgY29uc3QgZG9tYWluTmFtZSA9IHByb2Nlc3MuZW52LldFQlNPQ0tFVF9ET01BSU5fTkFNRTtcbiAgICBjb25zdCBzdGFnZSA9IHByb2Nlc3MuZW52LldFQlNPQ0tFVF9TVEFHRSB8fCAncHJvZCc7XG5cbiAgICBpZiAoZG9tYWluTmFtZSkge1xuICAgICAgYXdhaXQgYnJvYWRjYXN0TWVzc2FnZShwcm9ncmVzc01lc3NhZ2UsIGRvbWFpbk5hbWUsIHN0YWdlLCB1c2VySWQpO1xuICAgICAgY29uc29sZS5sb2coYPCfk6EgV2ViU29ja2V0IHByb2dyZXNzIGJyb2FkY2FzdDogJHthY3Rpb259IC0gJHttZXNzYWdlfWApO1xuICAgIH0gZWxzZSB7XG4gICAgICBjb25zb2xlLmxvZyhcbiAgICAgICAgYPCfk6EgV2ViU29ja2V0IG5vdCBjb25maWd1cmVkLCBza2lwcGluZyBicm9hZGNhc3Q6ICR7YWN0aW9ufSAtICR7bWVzc2FnZX1gLFxuICAgICAgKTtcbiAgICB9XG4gIH0gY2F0Y2ggKGVycm9yKSB7XG4gICAgY29uc29sZS5lcnJvcignRXJyb3IgYnJvYWRjYXN0aW5nIHZpZGVvIHByb2dyZXNzOicsIGVycm9yKTtcbiAgICAvLyBEb24ndCB0aHJvdyBlcnJvciB0byBhdm9pZCBicmVha2luZyB0aGUgbWFpbiBwcm9jZXNzXG4gIH1cbn1cbiJdfQ==