"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.handler = void 0;
const client_sqs_1 = require("@aws-sdk/client-sqs");
const image_1 = require("./image");
const narration_1 = require("./narration");
const subtitles_1 = require("./subtitles");
const script_1 = require("./script");
const s3Uploader_1 = require("./util/s3Uploader");
const imageUtils_1 = require("./util/imageUtils");
const videoEffects_1 = require("./util/videoEffects");
const videoCombiner_1 = require("./videoCombiner");
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
        // Send initial progress update
        await broadcastVideoProgress(request.userId, timestamp, 'Video generation started');
        const sceneDuration = Math.floor(request.totalDuration / request.sceneCount);
        // Check if there is already script generated in the s3 bucket for the timestamp
        const scriptKey = `${request.userId}/${timestamp}.script.txt`;
        const existingScript = await (0, s3Uploader_1.getObjectFromS3)(scriptKey);
        let scenes, voiceToneInstruction;
        if (existingScript) {
            console.log('🎥 Script already generated for the timestamp, using existing script');
            scenes = (0, script_1.addSceneIds)(existingScript.scenes);
            voiceToneInstruction = existingScript.voiceToneInstruction;
        }
        else {
            console.log('🎥 No existing script found, generating new story breakdown');
            // Step 1: Generate script/story breakdown using GPT-4
            await broadcastVideoProgress(request.userId, timestamp, 'Generating story breakdown1');
            const storyBreakdown = await (0, narration_1.generateStoryBreakdown)(request.prompt, request.sceneCount, sceneDuration, request.totalDuration, request.userId, timestamp);
            scenes = storyBreakdown.scenes;
            voiceToneInstruction = storyBreakdown.voiceToneInstruction;
            await broadcastVideoProgress(request.userId, timestamp, 'Story breakdown completed');
        }
        if (!scenes || scenes.length === 0) {
            console.log('❌ Error: Failed to get or generate story breakdown');
            throw new Error('Failed to get or generate story breakdown');
        }
        console.log('🎥 Story breakdown generated:', scenes);
        broadcastVideoProgress(request.userId, timestamp, 'Generating images');
        // Check if there are already images generated in the s3 bucket for the timestamp
        let imageUrls = await (0, imageUtils_1.getImageUrls)(request.userId, timestamp);
        if (imageUrls.length > 0) {
            console.log('🎥 Images already generated for the timestamp:', imageUrls);
        }
        else {
            const seed = Math.floor(Math.random() * 1000000);
            // Step 2: Generate images for each scene in parallel
            console.log('🎨 Generating images for each scene in parallel...');
            await broadcastVideoProgress(request.userId, timestamp, 'Generating images');
            try {
                const imagePromises = scenes.map(async (scene, i) => {
                    console.log(`🎨 Generating image for scene ${i + 1}:`, scene.description);
                    const imageUrl = await (0, image_1.generateImage)(scene.description, i, request.userId, timestamp, seed, scene.id);
                    console.log(`✅ Scene ${i + 1} image generated:`, imageUrl);
                    return imageUrl;
                });
                // Wait for all images to be generated
                imageUrls = await Promise.all(imagePromises);
                if (imageUrls.length === 0) {
                    console.log('❌ Error: No images were generated');
                    throw new Error('No images were generated');
                }
                console.log(`🎥 Generated ${imageUrls.length} images in parallel:`, imageUrls);
            }
            catch (error) {
                console.error('❌ Failed to generate images:', error);
                throw new Error(`Failed to generate images: ${error}`);
            }
        }
        await broadcastVideoProgress(request.userId, timestamp, 'Images generated');
        console.log('🎥 No existing audio files found, generating new narration');
        // Step 3: Generate audio narration with word-level timestamps
        await broadcastVideoProgress(request.userId, timestamp, 'Generating audio narration');
        let narrationResult = await (0, narration_1.generateNarration)(scenes, request.userId, timestamp, voiceToneInstruction);
        await broadcastVideoProgress(request.userId, timestamp, 'Audio narration completed');
        console.log('🎥 Audio narration generated:', JSON.stringify(narrationResult, null, 2));
        // Step 4: Generate video clips from images
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
        await broadcastVideoProgress(request.userId, timestamp, 'Generating video effects');
        const videoEffectsKeys = await (0, videoEffects_1.generateVideoEffects)(scenes, request.userId, timestamp);
        await broadcastVideoProgress(request.userId, timestamp, 'Video effects completed');
        console.log('videoEffectsKeys:', videoEffectsKeys);
        // Broadcast media files completed event
        await broadcastMediaFilesCompleted(request.userId, timestamp, videoEffectsKeys, imageUrls);
        // Step 5: Generate subtitles based on word-level timestamps
        await broadcastVideoProgress(request.userId, timestamp, 'Generating subtitles');
        const subtitleKeys = await (0, subtitles_1.generateSubtitles)(scenes, request.userId, timestamp, narrationResult.subtitles);
        await broadcastVideoProgress(request.userId, timestamp, 'Subtitles completed');
        // Broadcast subtitle files completed event
        await broadcastSubtitleFilesCompleted(request.userId, timestamp, subtitleKeys);
        // Step 6: Combine video clips, audio, and subtitles
        await broadcastVideoProgress(request.userId, timestamp, 'Combining final video');
        const finalVideo = await (0, videoCombiner_1.combineVideoAndAudio)(request.userId, timestamp, scenes);
        await broadcastVideoProgress(request.userId, timestamp, 'Final video combined');
        if (!finalVideo) {
            throw new Error('Failed to combine video, audio, and subtitles');
        }
        // Step 6: Upload to S3
        const videoKey = await (0, s3Uploader_1.uploadToS3)(finalVideo, request.userId, timestamp);
        // If this was triggered by SQS, delete the message from the queue
        if (record && process.env.VIDEO_QUEUE_URL) {
            const deleteCommand = new client_sqs_1.DeleteMessageCommand({
                QueueUrl: process.env.VIDEO_QUEUE_URL,
                ReceiptHandle: record.receiptHandle,
            });
            await sqs.send(deleteCommand);
        }
        // Send completion update
        await broadcastVideoProgress(request.userId, timestamp, 'Video generation completed');
        // Broadcast video generation completed event
        await broadcastVideoGenerationCompleted(request.userId, timestamp, videoKey);
        return {
            videoKey,
            message: 'Video generated successfully',
        };
    }
    catch (error) {
        console.error('Error in video generation:', error);
        throw error;
    }
}
// Helper function to broadcast video generation progress via WebSocket
async function broadcastVideoProgress(userId, timestamp, message, data) {
    try {
        const progressMessage = {
            action: 'video_generation_progress',
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
            console.log(`📡 WebSocket progress broadcast: ${message}`);
        }
        else {
            console.log(`📡 WebSocket not configured, skipping broadcast: ${message}`);
        }
    }
    catch (error) {
        console.error('Error broadcasting video progress:', error);
        // Don't throw error to avoid breaking the main process
    }
}
// Helper function to broadcast subtitle files completed event
async function broadcastSubtitleFilesCompleted(userId, timestamp, subtitleKeys) {
    try {
        const subtitleMessage = {
            action: 'subtitle_files_completed',
            data: {
                userId,
                timestamp,
                subtitleFiles: subtitleKeys,
            },
        };
        const domainName = process.env.WEBSOCKET_DOMAIN_NAME;
        const stage = process.env.WEBSOCKET_STAGE || 'prod';
        if (domainName) {
            await (0, websocket_broadcast_1.broadcastMessage)(subtitleMessage, domainName, stage, userId);
            console.log(`📡 WebSocket subtitle files completed broadcast`);
        }
        else {
            console.log(`📡 WebSocket not configured, skipping subtitle broadcast`);
        }
    }
    catch (error) {
        console.error('Error broadcasting subtitle files completed:', error);
    }
}
// Helper function to broadcast media files completed event
async function broadcastMediaFilesCompleted(userId, timestamp, videoEffectsKeys, imageUrls) {
    try {
        const mediaMessage = {
            action: 'media_files_completed',
            data: {
                userId,
                timestamp,
                mediaFiles: {
                    videoEffects: videoEffectsKeys,
                    images: imageUrls,
                },
                assFiles: {}, // This will be populated by the frontend when needed
            },
        };
        const domainName = process.env.WEBSOCKET_DOMAIN_NAME;
        const stage = process.env.WEBSOCKET_STAGE || 'prod';
        if (domainName) {
            await (0, websocket_broadcast_1.broadcastMessage)(mediaMessage, domainName, stage, userId);
            console.log(`📡 WebSocket media files completed broadcast`);
        }
        else {
            console.log(`📡 WebSocket not configured, skipping media broadcast`);
        }
    }
    catch (error) {
        console.error('Error broadcasting media files completed:', error);
    }
}
// Helper function to broadcast video generation completed event
async function broadcastVideoGenerationCompleted(userId, timestamp, videoKey) {
    try {
        const completionMessage = {
            action: 'video_generation_completed',
            data: {
                userId,
                timestamp,
                videoKey,
                message: 'Video generation completed successfully',
            },
        };
        const domainName = process.env.WEBSOCKET_DOMAIN_NAME;
        const stage = process.env.WEBSOCKET_STAGE || 'prod';
        if (domainName) {
            await (0, websocket_broadcast_1.broadcastMessage)(completionMessage, domainName, stage, userId);
            console.log(`📡 WebSocket video generation completed broadcast`);
        }
        else {
            console.log(`📡 WebSocket not configured, skipping completion broadcast`);
        }
    }
    catch (error) {
        console.error('Error broadcasting video generation completed:', error);
    }
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiaW5kZXguanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyJpbmRleC50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiOzs7QUFHQSxvREFBc0U7QUFFdEUsbUNBQXdDO0FBQ3hDLDJDQUErRTtBQUMvRSwyQ0FBZ0Q7QUFDaEQscUNBQXVDO0FBQ3ZDLGtEQUFnRTtBQUNoRSxrREFBaUQ7QUFDakQsc0RBQTJEO0FBQzNELG1EQUF1RDtBQUN2RCxnRUFBMEQ7QUFVMUQsTUFBTSxHQUFHLEdBQUcsSUFBSSxzQkFBUyxDQUFDLEVBQUUsTUFBTSxFQUFFLE9BQU8sQ0FBQyxHQUFHLENBQUMsVUFBVSxJQUFJLFdBQVcsRUFBRSxDQUFDLENBQUM7QUFFdEUsTUFBTSxPQUFPLEdBQUcsS0FBSyxFQUFFLEtBQWUsRUFBNkIsRUFBRTtJQUMxRSxPQUFPLENBQUMsR0FBRyxDQUNULHlFQUF5RSxDQUMxRSxDQUFDO0lBQ0YsT0FBTyxNQUFNLGNBQWMsQ0FBQyxLQUFLLENBQUMsQ0FBQztBQUNyQyxDQUFDLENBQUM7QUFMVyxRQUFBLE9BQU8sV0FLbEI7QUFFRixLQUFLLFVBQVUsY0FBYyxDQUFDLEtBQWU7SUFDM0MsTUFBTSxpQkFBaUIsR0FBaUMsRUFBRSxDQUFDO0lBRTNELEtBQUssTUFBTSxNQUFNLElBQUksS0FBSyxDQUFDLE9BQU8sRUFBRSxDQUFDO1FBQ25DLElBQUksQ0FBQztZQUNILHlCQUF5QjtZQUN6QixNQUFNLE9BQU8sR0FBMkIsSUFBSSxDQUFDLEtBQUssQ0FBQyxNQUFNLENBQUMsSUFBSSxDQUFDLENBQUM7WUFFaEUsa0RBQWtEO1lBQ2xELE1BQU0sc0JBQXNCLENBQUMsT0FBTyxFQUFFLE1BQU0sQ0FBQyxDQUFDO1FBQ2hELENBQUM7UUFBQyxPQUFPLEtBQUssRUFBRSxDQUFDO1lBQ2YsT0FBTyxDQUFDLEtBQUssQ0FBQyw0QkFBNEIsRUFBRSxNQUFNLENBQUMsU0FBUyxFQUFFLEtBQUssQ0FBQyxDQUFDO1lBQ3JFLGlCQUFpQixDQUFDLElBQUksQ0FB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QUM7SUFBQyxPQUFPLEtBQUssRUFBRSxDQUFDO1FBQ2YsT0FBTyxDQUFDLEtBQUssQ0FBQyxnREFBZ0QsRUFBRSxLQUFLLENBQUMsQ0FBQztJQUN6RSxDQUFDO0FBQ0gsQ0FBQyIsInNvdXJjZXNDb250ZW50IjpbIi8vIFVwZGF0ZWQ6IEFkZGVkIGZsdWVudC1mZm1wZWcgZGVwZW5kZW5jeSBzdXBwb3J0XG5pbXBvcnQgeyBTUVNFdmVudCwgU1FTUmVjb3JkLCBTUVNCYXRjaFJlc3BvbnNlIH0gZnJvbSAnYXdzLWxhbWJkYSc7XG5cbmltcG9ydCB7IFNRU0NsaWVudCwgRGVsZXRlTWVzc2FnZUNvbW1hbmQgfSBmcm9tICdAYXdzLXNkay9jbGllbnQtc3FzJztcblxuaW1wb3J0IHsgZ2VuZXJhdGVJbWFnZSB9IGZyb20gJy4vaW1hZ2UnO1xuaW1wb3J0IHsgZ2VuZXJhdGVOYXJyYXRpb24sIGdlbmVyYXRlU3RvcnlCcmVha2Rvd24sIFNjZW5lIH0gZnJvbSAnLi9uYXJyYXRpb24nO1xuaW1wb3J0IHsgZ2VuZXJhdGVTdWJ0aXRsZXMgfSBmcm9tICcuL3N1YnRpdGxlcyc7XG5pbXBvcnQgeyBhZGRTY2VuZUlkcyB9IGZyb20gJy4vc2NyaXB0JztcbmltcG9ydCB7IHVwbG9hZFRvUzMsIGdldE9iamVjdEZyb21TMyB9IGZyb20gJy4vdXRpbC9zM1VwbG9hZGVyJztcbmltcG9ydCB7IGdldEltYWdlVXJscyB9IGZyb20gJy4vdXRpbC9pbWFnZVV0aWxzJztcbmltcG9ydCB7IGdlbmVyYXRlVmlkZW9FZmZlY3RzIH0gZnJvbSAnLi91dGlsL3ZpZGVvRWZmZWN0cyc7XG5pbXBvcnQgeyBjb21iaW5lVmlkZW9BbmRBdWRpbyB9IGZyb20gJy4vdmlkZW9Db21iaW5lcic7XG5pbXBvcnQgeyBicm9hZGNhc3RNZXNzYWdlIH0gZnJvbSAnLi4vd2Vic29ja2V0LWJyb2FkY2FzdCc7XG5cbmludGVyZmFjZSBWaWRlb0dlbmVyYXRpb25SZXF1ZXN0IHtcbiAgcHJvbXB0OiBzdHJpbmc7XG4gIHVzZXJJZDogc3RyaW5nO1xuICB0aW1lc3RhbXA6IHN0cmluZztcbiAgdG90YWxEdXJhdGlvbjogbnVtYmVyO1xuICBzY2VuZUNvdW50OiBudW1iZXI7XG59XG5cbmNvbnN0IHNxcyA9IG5ldyBTUVNDbGllbnQoeyByZWdpb246IHByb2Nlc3MuZW52LkFXU19SRUdJT04gfHwgJ3VzLWVhc3QtMScgfSk7XG5cbmV4cG9ydCBjb25zdCBoYW5kbGVyID0gYXN5bmMgKGV2ZW50OiBTUVNFdmVudCk6IFByb21pc2U8U1FTQmF0Y2hSZXNwb25zZT4gPT4ge1xuICBjb25zb2xlLmxvZyhcbiAgICAn8J+UhCBWaWRlbyBHZW5lcmF0aW9uIExhbWJkYSBzdGFydGVkIC0gVXBkYXRlZCB3aXRoIGZsdWVudC1mZm1wZWcgc3VwcG9ydCcsXG4gICk7XG4gIHJldHVybiBhd2FpdCBoYW5kbGVTUVNFdmVudChldmVudCk7XG59O1xuXG5hc3luYyBmdW5jdGlvbiBoYW5kbGVTUVNFdmVudChldmVudDogU1FTRXZlbnQpOiBQcm9taXNlPFNRU0JhdGNoUmVzcG9uc2U+IHtcbiAgY29uc3QgYmF0Y2hJdGVtRmFpbHVyZXM6IHsgaXRlbUlkZW50aWZpZXI6IHN0cmluZyB9W10gPSBbXTtcblxuICBmb3IgKGNvbnN0IHJlY29yZCBvZiBldmVudC5SZWNvcmRzKSB7XG4gICAgdHJ5IHtcbiAgICAgIC8vIFBhcnNlIHRoZSBtZXNzYWdlIGJvZHlcbiAgICAgIGNvbnN0IHJlcXVlc3Q6IFZpZGVvR2VuZXJhdGlvblJlcXVlc3QgPSBKU09OLnBhcnNlKHJlY29yZC5ib2R5KTtcblxuICAgICAgLy8gUHJvY2VzcyB0aGUgdmlkZW8gZ2VuZXJhdGlvbiB3aXRoIG9yZGVyZWQgc3RlcHNcbiAgICAgIGF3YWl0IHByb2Nlc3NWaWRlb0dlbmVyYXRpb24ocmVxdWVzdCwgcmVjb3JkKTtcbiAgICB9IGNhdGNoIChlcnJvcikge1xuICAgICAgY29uc29sZS5lcnJvcign4p2MIEVycm9yIHByb2Nlc3NpbmcgcmVjb3JkOicsIHJlY29yZC5tZXNzYWdlSWQsIGVycm9yKTtcbiAgICAgIGJhdGNoSXRlbUZhaWx1cmVzLnB1c2goeyBpdGVtSWRlbnRpZmllcjogcmVjb3JkLm1lc3NhZ2VJZCB9KTtcbiAgICB9XG4gIH1cblxuICByZXR1cm4ge1xuICAgIGJhdGNoSXRlbUZhaWx1cmVzLFxuICB9O1xufVxuXG5hc3luYyBmdW5jdGlvbiBwcm9jZXNzVmlkZW9HZW5lcmF0aW9uKFxuICByZXF1ZXN0OiBWaWRlb0dlbmVyYXRpb25SZXF1ZXN0LFxuICByZWNvcmQ/OiBTUVNSZWNvcmQsXG4pOiBQcm9taXNlPGFueT4ge1xuICB0cnkge1xuICAgIGNvbnNvbGUubG9nKCdwcm9jZXNzVmlkZW9HZW5lcmF0aW9uOicsIHJlcXVlc3QpO1xuXG4gICAgLy8gVXNlIHRpbWVzdGFtcCBmcm9tIHJlcXVlc3QgYm9keVxuICAgIGNvbnN0IHRpbWVzdGFtcCA9IHJlcXVlc3QudGltZXN0YW1wO1xuXG4gICAgLy8gU2VuZCBpbml0aWFsIHByb2dyZXNzIHVwZGF0ZVxuICAgIGF3YWl0IGJyb2FkY2FzdFZpZGVvUHJvZ3Jlc3MoXG4gICAgICByZXF1ZXN0LnVzZXJJZCxcbiAgICAgIHRpbWVzdGFtcCxcbiAgICAgICdWaWRlbyBnZW5lcmF0aW9uIHN0YXJ0ZWQnLFxuICAgICk7XG5cbiAgICBjb25zdCBzY2VuZUR1cmF0aW9uID0gTWF0aC5mbG9vcihcbiAgICAgIHJlcXVlc3QudG90YWxEdXJhdGlvbiAvIHJlcXVlc3Quc2NlbmVDb3VudCxcbiAgICApO1xuXG4gICAgLy8gQ2hlY2sgaWYgdGhlcmUgaXMgYWxyZWFkeSBzY3JpcHQgZ2VuZXJhdGVkIGluIHRoZSBzMyBidWNrZXQgZm9yIHRoZSB0aW1lc3RhbXBcbiAgICBjb25zdCBzY3JpcHRLZXkgPSBgJHtyZXF1ZXN0LnVzZXJJZH0vJHt0aW1lc3RhbXB9LnNjcmlwdC50eHRgO1xuICAgIGNvbnN0IGV4aXN0aW5nU2NyaXB0ID0gYXdhaXQgZ2V0T2JqZWN0RnJvbVMzKHNjcmlwdEtleSk7XG5cbiAgICBsZXQgc2NlbmVzLCB2b2ljZVRvbmVJbnN0cnVjdGlvbjtcblxuICAgIGlmIChleGlzdGluZ1NjcmlwdCkge1xuICAgICAgY29uc29sZS5sb2coXG4gICAgICAgICfwn46lIFNjcmlwdCBhbHJlYWR5IGdlbmVyYXRlZCBmb3IgdGhlIHRpbWVzdGFtcCwgdXNpbmcgZXhpc3Rpbmcgc2NyaXB0JyxcbiAgICAgICk7XG4gICAgICBzY2VuZXMgPSBhZGRTY2VuZUlkcyhleGlzdGluZ1NjcmlwdC5zY2VuZXMpO1xuICAgICAgdm9pY2VUb25lSW5zdHJ1Y3Rpb24gPSBleGlzdGluZ1NjcmlwdC52b2ljZVRvbmVJbnN0cnVjdGlvbjtcbiAgICB9IGVsc2Uge1xuICAgICAgY29uc29sZS5sb2coXG4gICAgICAgICfwn46lIE5vIGV4aXN0aW5nIHNjcmlwdCBmb3VuZCwgZ2VuZXJhdGluZyBuZXcgc3RvcnkgYnJlYWtkb3duJyxcbiAgICAgICk7XG5cbiAgICAgIC8vIFN0ZXAgMTogR2VuZXJhdGUgc2NyaXB0L3N0b3J5IGJyZWFrZG93biB1c2luZyBHUFQtNFxuICAgICAgYXdhaXQgYnJvYWRjYXN0VmlkZW9Qcm9ncmVzcyhcbiAgICAgICAgcmVxdWVzdC51c2VySWQsXG4gICAgICAgIHRpbWVzdGFtcCxcbiAgICAgICAgJ0dlbmVyYXRpbmcgc3RvcnkgYnJlYWtkb3duMScsXG4gICAgICApO1xuXG4gICAgICBjb25zdCBzdG9yeUJyZWFrZG93biA9IGF3YWl0IGdlbmVyYXRlU3RvcnlCcmVha2Rvd24oXG4gICAgICAgIHJlcXVlc3QucHJvbXB0LFxuICAgICAgICByZXF1ZXN0LnNjZW5lQ291bnQsXG4gICAgICAgIHNjZW5lRHVyYXRpb24sXG4gICAgICAgIHJlcXVlc3QudG90YWxEdXJhdGlvbixcbiAgICAgICAgcmVxdWVzdC51c2VySWQsXG4gICAgICAgIHRpbWVzdGFtcCxcbiAgICAgICk7XG4gICAgICBzY2VuZXMgPSBzdG9yeUJyZWFrZG93bi5zY2VuZXM7XG4gICAgICB2b2ljZVRvbmVJbnN0cnVjdGlvbiA9IHN0b3J5QnJlYWtkb3duLnZvaWNlVG9uZUluc3RydWN0aW9uO1xuXG4gICAgICBhd2FpdCBicm9hZGNhc3RWaWRlb1Byb2dyZXNzKFxuICAgICAgICByZXF1ZXN0LnVzZXJJZCxcbiAgICAgICAgdGltZXN0YW1wLFxuICAgICAgICAnU3RvcnkgYnJlYWtkb3duIGNvbXBsZXRlZCcsXG4gICAgICApO1xuICAgIH1cblxuICAgIGlmICghc2NlbmVzIHx8IHNjZW5lcy5sZW5ndGggPT09IDApIHtcbiAgICAgIGNvbnNvbGUubG9nKCfinYwgRXJyb3I6IEZhaWxlZCB0byBnZXQgb3IgZ2VuZXJhdGUgc3RvcnkgYnJlYWtkb3duJyk7XG4gICAgICB0aHJvdyBuZXcgRXJyb3IoJ0ZhaWxlZCB0byBnZXQgb3IgZ2VuZXJhdGUgc3RvcnkgYnJlYWtkb3duJyk7XG4gICAgfVxuXG4gICAgY29uc29sZS5sb2coJ/CfjqUgU3RvcnkgYnJlYWtkb3duIGdlbmVyYXRlZDonLCBzY2VuZXMpO1xuXG4gICAgYnJvYWRjYXN0VmlkZW9Qcm9ncmVzcyhyZXF1ZXN0LnVzZXJJZCwgdGltZXN0YW1wLCAnR2VuZXJhdGluZyBpbWFnZXMnKTtcblxuICAgIC8vIENoZWNrIGlmIHRoZXJlIGFyZSBhbHJlYWR5IGltYWdlcyBnZW5lcmF0ZWQgaW4gdGhlIHMzIGJ1Y2tldCBmb3IgdGhlIHRpbWVzdGFtcFxuICAgIGxldCBpbWFnZVVybHMgPSBhd2FpdCBnZXRJbWFnZVVybHMocmVxdWVzdC51c2VySWQsIHRpbWVzdGFtcCk7XG5cbiAgICBpZiAoaW1hZ2VVcmxzLmxlbmd0aCA+IDApIHtcbiAgICAgIGNvbnNvbGUubG9nKCfwn46lIEltYWdlcyBhbHJlYWR5IGdlbmVyYXRlZCBmb3IgdGhlIHRpbWVzdGFtcDonLCBpbWFnZVVybHMpO1xuICAgIH0gZWxzZSB7XG4gICAgICBjb25zdCBzZWVkID0gTWF0aC5mbG9vcihNYXRoLnJhbmRvbSgpICogMTAwMDAwMCk7XG5cbiAgICAgIC8vIFN0ZXAgMjogR2VuZXJhdGUgaW1hZ2VzIGZvciBlYWNoIHNjZW5lIGluIHBhcmFsbGVsXG4gICAgICBjb25zb2xlLmxvZygn8J+OqCBHZW5lcmF0aW5nIGltYWdlcyBmb3IgZWFjaCBzY2VuZSBpbiBwYXJhbGxlbC4uLicpO1xuICAgICAgYXdhaXQgYnJvYWRjYXN0VmlkZW9Qcm9ncmVzcyhcbiAgICAgICAgcmVxdWVzdC51c2VySWQsXG4gICAgICAgIHRpbWVzdGFtcCxcbiAgICAgICAgJ0dlbmVyYXRpbmcgaW1hZ2VzJyxcbiAgICAgICk7XG5cbiAgICAgIHRyeSB7XG4gICAgICAgIGNvbnN0IGltYWdlUHJvbWlzZXMgPSBzY2VuZXMubWFwKGFzeW5jIChzY2VuZTogYW55LCBpOiBudW1iZXIpID0+IHtcbiAgICAgICAgICBjb25zb2xlLmxvZyhcbiAgICAgICAgICAgIGDwn46oIEdlbmVyYXRpbmcgaW1hZ2UgZm9yIHNjZW5lICR7aSArIDF9OmAsXG4gICAgICAgICAgICBzY2VuZS5kZXNjcmlwdGlvbixcbiAgICAgICAgICApO1xuXG4gICAgICAgICAgY29uc3QgaW1hZ2VVcmwgPSBhd2FpdCBnZW5lcmF0ZUltYWdlKFxuICAgICAgICAgICAgc2NlbmUuZGVzY3JpcHRpb24sXG4gICAgICAgICAgICBpLFxuICAgICAgICAgICAgcmVxdWVzdC51c2VySWQsXG4gICAgICAgICAgICB0aW1lc3RhbXAsXG4gICAgICAgICAgICBzZWVkLFxuICAgICAgICAgICAgc2NlbmUuaWQsXG4gICAgICAgICAgKTtcblxuICAgICAgICAgIGNvbnNvbGUubG9nKGDinIUgU2NlbmUgJHtpICsgMX0gaW1hZ2UgZ2VuZXJhdGVkOmAsIGltYWdlVXJsKTtcbiAgICAgICAgICByZXR1cm4gaW1hZ2VVcmw7XG4gICAgICAgIH0pO1xuXG4gICAgICAgIC8vIFdhaXQgZm9yIGFsbCBpbWFnZXMgdG8gYmUgZ2VuZXJhdGVkXG4gICAgICAgIGltYWdlVXJscyA9IGF3YWl0IFByb21pc2UuYWxsKGltYWdlUHJvbWlzZXMpO1xuXG4gICAgICAgIGlmIChpbWFnZVVybHMubGVuZ3RoID09PSAwKSB7XG4gICAgICAgICAgY29uc29sZS5sb2coJ+KdjCBFcnJvcjogTm8gaW1hZ2VzIHdlcmUgZ2VuZXJhdGVkJyk7XG4gICAgICAgICAgdGhyb3cgbmV3IEVycm9yKCdObyBpbWFnZXMgd2VyZSBnZW5lcmF0ZWQnKTtcbiAgICAgICAgfVxuXG4gICAgICAgIGNvbnNvbGUubG9nKFxuICAgICAgICAgIGDwn46lIEdlbmVyYXRlZCAke2ltYWdlVXJscy5sZW5ndGh9IGltYWdlcyBpbiBwYXJhbGxlbDpgLFxuICAgICAgICAgIGltYWdlVXJscyxcbiAgICAgICAgKTtcbiAgICAgIH0gY2F0Y2ggKGVycm9yKSB7XG4gICAgICAgIGNvbnNvbGUuZXJyb3IoJ+KdjCBGYWlsZWQgdG8gZ2VuZXJhdGUgaW1hZ2VzOicsIGVycm9yKTtcbiAgICAgICAgdGhyb3cgbmV3IEVycm9yKGBGYWlsZWQgdG8gZ2VuZXJhdGUgaW1hZ2VzOiAke2Vycm9yfWApO1xuICAgICAgfVxuICAgIH1cblxuICAgIGF3YWl0IGJyb2FkY2FzdFZpZGVvUHJvZ3Jlc3MocmVxdWVzdC51c2VySWQsIHRpbWVzdGFtcCwgJ0ltYWdlcyBnZW5lcmF0ZWQnKTtcblxuICAgIGNvbnNvbGUubG9nKCfwn46lIE5vIGV4aXN0aW5nIGF1ZGlvIGZpbGVzIGZvdW5kLCBnZW5lcmF0aW5nIG5ldyBuYXJyYXRpb24nKTtcblxuICAgIC8vIFN0ZXAgMzogR2VuZXJhdGUgYXVkaW8gbmFycmF0aW9uIHdpdGggd29yZC1sZXZlbCB0aW1lc3RhbXBzXG4gICAgYXdhaXQgYnJvYWRjYXN0VmlkZW9Qcm9ncmVzcyhcbiAgICAgIHJlcXVlc3QudXNlcklkLFxuICAgICAgdGltZXN0YW1wLFxuICAgICAgJ0dlbmVyYXRpbmcgYXVkaW8gbmFycmF0aW9uJyxcbiAgICApO1xuXG4gICAgbGV0IG5hcnJhdGlvblJlc3VsdCA9IGF3YWl0IGdlbmVyYXRlTmFycmF0aW9uKFxuICAgICAgc2NlbmVzLFxuICAgICAgcmVxdWVzdC51c2VySWQsXG4gICAgICB0aW1lc3RhbXAsXG4gICAgICB2b2ljZVRvbmVJbnN0cnVjdGlvbixcbiAgICApO1xuXG4gICAgYXdhaXQgYnJvYWRjYXN0VmlkZW9Qcm9ncmVzcyhcbiAgICAgIHJlcXVlc3QudXNlcklkLFxuICAgICAgdGltZXN0YW1wLFxuICAgICAgJ0F1ZGlvIG5hcnJhdGlvbiBjb21wbGV0ZWQnLFxuICAgICk7XG5cbiAgICBjb25zb2xlLmxvZyhcbiAgICAgICfwn46lIEF1ZGlvIG5hcnJhdGlvbiBnZW5lcmF0ZWQ6JyxcbiAgICAgIEpTT04uc3RyaW5naWZ5KG5hcnJhdGlvblJlc3VsdCwgbnVsbCwgMiksXG4gICAgKTtcblxuICAgIC8vIFN0ZXAgNDogR2VuZXJhdGUgdmlkZW8gY2xpcHMgZnJvbSBpbWFnZXNcbiAgICAvLyBjb25zb2xlLmxvZygn8J+OpSBHZW5lcmF0aW5nIHZpZGVvIGNsaXBzIGZyb20gaW1hZ2VzLi4uJyk7XG4gICAgLy8gY29uc3QgdmlkZW9DbGlwczogc3RyaW5nW10gPSBbXTtcblxuICAgIC8vIGZvciAobGV0IGkgPSAwOyBpIDwgc2NlbmVzLmxlbmd0aDsgaSsrKSB7XG4gICAgLy8gICBjb25zdCBzY2VuZSA9IHNjZW5lc1tpXTtcbiAgICAvLyAgIGNvbnN0IGltYWdlVXJsID0gaW1hZ2VVcmxzW2ldO1xuICAgIC8vICAgY29uc29sZS5sb2coXG4gICAgLy8gICAgIGDwn46sIEdlbmVyYXRpbmcgdmlkZW8gZm9yIHNjZW5lICR7aSArIDF9IGZyb20gaW1hZ2U6YCxcbiAgICAvLyAgICAgc2NlbmUuZGVzY3JpcHRpb24sXG4gICAgLy8gICApO1xuICAgIC8vICAgdHJ5IHtcbiAgICAvLyAgICAgY29uc3QgdmlkZW9DbGlwID0gYXdhaXQgZ2VuZXJhdGVWaWRlb0NsaXAoXG4gICAgLy8gICAgICAgc2NlbmUuZGVzY3JpcHRpb24sXG4gICAgLy8gICAgICAgc2NlbmUuZHVyYXRpb24sXG4gICAgLy8gICAgICAgaSxcbiAgICAvLyAgICAgICByZXF1ZXN0LnVzZXJJZCxcbiAgICAvLyAgICAgICB0aW1lc3RhbXAsXG4gICAgLy8gICAgICAgc2VlZCxcbiAgICAvLyAgICAgICBzY2VuZS5pZCxcbiAgICAvLyAgICAgICBpbWFnZVVybCxcbiAgICAvLyAgICAgKTtcbiAgICAvLyAgICAgdmlkZW9DbGlwcy5wdXNoKHZpZGVvQ2xpcCk7XG4gICAgLy8gICAgIGNvbnNvbGUubG9nKGDinIUgU2NlbmUgJHtpICsgMX0gdmlkZW8gZ2VuZXJhdGVkOmAsIHZpZGVvQ2xpcCk7XG4gICAgLy8gICB9IGNhdGNoIChlcnJvcikge1xuICAgIC8vICAgICBjb25zb2xlLmVycm9yKGDinYwgRmFpbGVkIHRvIGdlbmVyYXRlIHZpZGVvIGZvciBzY2VuZSAke2kgKyAxfTpgLCBlcnJvcik7XG4gICAgLy8gICAgIHRocm93IG5ldyBFcnJvcihcbiAgICAvLyAgICAgICBgRmFpbGVkIHRvIGdlbmVyYXRlIHZpZGVvIGZvciBzY2VuZSAke2kgKyAxfTogJHtlcnJvcn1gLFxuICAgIC8vICAgICApO1xuICAgIC8vICAgfVxuICAgIC8vIH1cblxuICAgIC8vIGlmICh2aWRlb0NsaXBzLmxlbmd0aCA9PT0gMCkge1xuICAgIC8vICAgY29uc29sZS5sb2coJ+KdjCBFcnJvcjogTm8gdmlkZW8gY2xpcHMgd2VyZSBnZW5lcmF0ZWQnKTtcbiAgICAvLyAgIHRocm93IG5ldyBFcnJvcignTm8gdmlkZW8gY2xpcHMgd2VyZSBnZW5lcmF0ZWQnKTtcbiAgICAvLyB9XG5cbiAgICAvLyBjb25zb2xlLmxvZyhg4pyFIEdlbmVyYXRlZCAke3ZpZGVvQ2xpcHMubGVuZ3RofSB2aWRlbyBjbGlwc2ApO1xuXG4gICAgLy8gU3RlcCA0OiBHZW5lcmF0ZSB2aWRlbyBlZmZlY3RzIGFuZCBjYW1lcmEgbW92ZW1lbnQgdXNpbmcgdGhlIGltYWdlc1xuICAgIGF3YWl0IGJyb2FkY2FzdFZpZGVvUHJvZ3Jlc3MoXG4gICAgICByZXF1ZXN0LnVzZXJJZCxcbiAgICAgIHRpbWVzdGFtcCxcbiAgICAgICdHZW5lcmF0aW5nIHZpZGVvIGVmZmVjdHMnLFxuICAgICk7XG5cbiAgICBjb25zdCB2aWRlb0VmZmVjdHNLZXlzID0gYXdhaXQgZ2VuZXJhdGVWaWRlb0VmZmVjdHMoXG4gICAgICBzY2VuZXMsXG4gICAgICByZXF1ZXN0LnVzZXJJZCxcbiAgICAgIHRpbWVzdGFtcCxcbiAgICApO1xuXG4gICAgYXdhaXQgYnJvYWRjYXN0VmlkZW9Qcm9ncmVzcyhcbiAgICAgIHJlcXVlc3QudXNlcklkLFxuICAgICAgdGltZXN0YW1wLFxuICAgICAgJ1ZpZGVvIGVmZmVjdHMgY29tcGxldGVkJyxcbiAgICApO1xuICAgIGNvbnNvbGUubG9nKCd2aWRlb0VmZmVjdHNLZXlzOicsIHZpZGVvRWZmZWN0c0tleXMpO1xuXG4gICAgLy8gQnJvYWRjYXN0IG1lZGlhIGZpbGVzIGNvbXBsZXRlZCBldmVudFxuICAgIGF3YWl0IGJyb2FkY2FzdE1lZGlhRmlsZXNDb21wbGV0ZWQoXG4gICAgICByZXF1ZXN0LnVzZXJJZCxcbiAgICAgIHRpbWVzdGFtcCxcbiAgICAgIHZpZGVvRWZmZWN0c0tleXMsXG4gICAgICBpbWFnZVVybHMsXG4gICAgKTtcblxuICAgIC8vIFN0ZXAgNTogR2VuZXJhdGUgc3VidGl0bGVzIGJhc2VkIG9uIHdvcmQtbGV2ZWwgdGltZXN0YW1wc1xuICAgIGF3YWl0IGJyb2FkY2FzdFZpZGVvUHJvZ3Jlc3MoXG4gICAgICByZXF1ZXN0LnVzZXJJZCxcbiAgICAgIHRpbWVzdGFtcCxcbiAgICAgICdHZW5lcmF0aW5nIHN1YnRpdGxlcycsXG4gICAgKTtcblxuICAgIGNvbnN0IHN1YnRpdGxlS2V5cyA9IGF3YWl0IGdlbmVyYXRlU3VidGl0bGVzKFxuICAgICAgc2NlbmVzLFxuICAgICAgcmVxdWVzdC51c2VySWQsXG4gICAgICB0aW1lc3RhbXAsXG4gICAgICBuYXJyYXRpb25SZXN1bHQuc3VidGl0bGVzLFxuICAgICk7XG5cbiAgICBhd2FpdCBicm9hZGNhc3RWaWRlb1Byb2dyZXNzKFxuICAgICAgcmVxdWVzdC51c2VySWQsXG4gICAgICB0aW1lc3RhbXAsXG4gICAgICAnU3VidGl0bGVzIGNvbXBsZXRlZCcsXG4gICAgKTtcblxuICAgIC8vIEJyb2FkY2FzdCBzdWJ0aXRsZSBmaWxlcyBjb21wbGV0ZWQgZXZlbnRcbiAgICBhd2FpdCBicm9hZGNhc3RTdWJ0aXRsZUZpbGVzQ29tcGxldGVkKFxuICAgICAgcmVxdWVzdC51c2VySWQsXG4gICAgICB0aW1lc3RhbXAsXG4gICAgICBzdWJ0aXRsZUtleXMsXG4gICAgKTtcblxuICAgIC8vIFN0ZXAgNjogQ29tYmluZSB2aWRlbyBjbGlwcywgYXVkaW8sIGFuZCBzdWJ0aXRsZXNcbiAgICBhd2FpdCBicm9hZGNhc3RWaWRlb1Byb2dyZXNzKFxuICAgICAgcmVxdWVzdC51c2VySWQsXG4gICAgICB0aW1lc3RhbXAsXG4gICAgICAnQ29tYmluaW5nIGZpbmFsIHZpZGVvJyxcbiAgICApO1xuXG4gICAgY29uc3QgZmluYWxWaWRlbyA9IGF3YWl0IGNvbWJpbmVWaWRlb0FuZEF1ZGlvKFxuICAgICAgcmVxdWVzdC51c2VySWQsXG4gICAgICB0aW1lc3RhbXAsXG4gICAgICBzY2VuZXMsXG4gICAgKTtcblxuICAgIGF3YWl0IGJyb2FkY2FzdFZpZGVvUHJvZ3Jlc3MoXG4gICAgICByZXF1ZXN0LnVzZXJJZCxcbiAgICAgIHRpbWVzdGFtcCxcbiAgICAgICdGaW5hbCB2aWRlbyBjb21iaW5lZCcsXG4gICAgKTtcblxuICAgIGlmICghZmluYWxWaWRlbykge1xuICAgICAgdGhyb3cgbmV3IEVycm9yKCdGYWlsZWQgdG8gY29tYmluZSB2aWRlbywgYXVkaW8sIGFuZCBzdWJ0aXRsZXMnKTtcbiAgICB9XG5cbiAgICAvLyBTdGVwIDY6IFVwbG9hZCB0byBTM1xuICAgIGNvbnN0IHZpZGVvS2V5ID0gYXdhaXQgdXBsb2FkVG9TMyhmaW5hbFZpZGVvLCByZXF1ZXN0LnVzZXJJZCwgdGltZXN0YW1wKTtcblxuICAgIC8vIElmIHRoaXMgd2FzIHRyaWdnZXJlZCBieSBTUVMsIGRlbGV0ZSB0aGUgbWVzc2FnZSBmcm9tIHRoZSBxdWV1ZVxuICAgIGlmIChyZWNvcmQgJiYgcHJvY2Vzcy5lbnYuVklERU9fUVVFVUVfVVJMKSB7XG4gICAgICBjb25zdCBkZWxldGVDb21tYW5kID0gbmV3IERlbGV0ZU1lc3NhZ2VDb21tYW5kKHtcbiAgICAgICAgUXVldWVVcmw6IHByb2Nlc3MuZW52LlZJREVPX1FVRVVFX1VSTCxcbiAgICAgICAgUmVjZWlwdEhhbmRsZTogcmVjb3JkLnJlY2VpcHRIYW5kbGUsXG4gICAgICB9KTtcbiAgICAgIGF3YWl0IHNxcy5zZW5kKGRlbGV0ZUNvbW1hbmQpO1xuICAgIH1cblxuICAgIC8vIFNlbmQgY29tcGxldGlvbiB1cGRhdGVcbiAgICBhd2FpdCBicm9hZGNhc3RWaWRlb1Byb2dyZXNzKFxuICAgICAgcmVxdWVzdC51c2VySWQsXG4gICAgICB0aW1lc3RhbXAsXG4gICAgICAnVmlkZW8gZ2VuZXJhdGlvbiBjb21wbGV0ZWQnLFxuICAgICk7XG5cbiAgICAvLyBCcm9hZGNhc3QgdmlkZW8gZ2VuZXJhdGlvbiBjb21wbGV0ZWQgZXZlbnRcbiAgICBhd2FpdCBicm9hZGNhc3RWaWRlb0dlbmVyYXRpb25Db21wbGV0ZWQoXG4gICAgICByZXF1ZXN0LnVzZXJJZCxcbiAgICAgIHRpbWVzdGFtcCxcbiAgICAgIHZpZGVvS2V5LFxuICAgICk7XG5cbiAgICByZXR1cm4ge1xuICAgICAgdmlkZW9LZXksXG4gICAgICBtZXNzYWdlOiAnVmlkZW8gZ2VuZXJhdGVkIHN1Y2Nlc3NmdWxseScsXG4gICAgfTtcbiAgfSBjYXRjaCAoZXJyb3IpIHtcbiAgICBjb25zb2xlLmVycm9yKCdFcnJvciBpbiB2aWRlbyBnZW5lcmF0aW9uOicsIGVycm9yKTtcbiAgICB0aHJvdyBlcnJvcjtcbiAgfVxufVxuXG4vLyBIZWxwZXIgZnVuY3Rpb24gdG8gYnJvYWRjYXN0IHZpZGVvIGdlbmVyYXRpb24gcHJvZ3Jlc3MgdmlhIFdlYlNvY2tldFxuYXN5bmMgZnVuY3Rpb24gYnJvYWRjYXN0VmlkZW9Qcm9ncmVzcyhcbiAgdXNlcklkOiBzdHJpbmcsXG4gIHRpbWVzdGFtcDogc3RyaW5nLFxuICBtZXNzYWdlOiBzdHJpbmcsXG4gIGRhdGE/OiBhbnksXG4pOiBQcm9taXNlPHZvaWQ+IHtcbiAgdHJ5IHtcbiAgICBjb25zdCBwcm9ncmVzc01lc3NhZ2UgPSB7XG4gICAgICBhY3Rpb246ICd2aWRlb19nZW5lcmF0aW9uX3Byb2dyZXNzJyxcbiAgICAgIGRhdGE6IHtcbiAgICAgICAgdXNlcklkLFxuICAgICAgICB0aW1lc3RhbXAsXG4gICAgICAgIG1lc3NhZ2UsXG4gICAgICAgIC4uLmRhdGEsXG4gICAgICB9LFxuICAgIH07XG5cbiAgICAvLyBHZXQgdGhlIFdlYlNvY2tldCBkb21haW4gYW5kIHN0YWdlIGZyb20gZW52aXJvbm1lbnQgdmFyaWFibGVzXG4gICAgY29uc3QgZG9tYWluTmFtZSA9IHByb2Nlc3MuZW52LldFQlNPQ0tFVF9ET01BSU5fTkFNRTtcbiAgICBjb25zdCBzdGFnZSA9IHByb2Nlc3MuZW52LldFQlNPQ0tFVF9TVEFHRSB8fCAncHJvZCc7XG5cbiAgICBpZiAoZG9tYWluTmFtZSkge1xuICAgICAgYXdhaXQgYnJvYWRjYXN0TWVzc2FnZShwcm9ncmVzc01lc3NhZ2UsIGRvbWFpbk5hbWUsIHN0YWdlLCB1c2VySWQpO1xuICAgICAgY29uc29sZS5sb2coYPCfk6EgV2ViU29ja2V0IHByb2dyZXNzIGJyb2FkY2FzdDogJHttZXNzYWdlfWApO1xuICAgIH0gZWxzZSB7XG4gICAgICBjb25zb2xlLmxvZyhcbiAgICAgICAgYPCfk6EgV2ViU29ja2V0IG5vdCBjb25maWd1cmVkLCBza2lwcGluZyBicm9hZGNhc3Q6ICR7bWVzc2FnZX1gLFxuICAgICAgKTtcbiAgICB9XG4gIH0gY2F0Y2ggKGVycm9yKSB7XG4gICAgY29uc29sZS5lcnJvcignRXJyb3IgYnJvYWRjYXN0aW5nIHZpZGVvIHByb2dyZXNzOicsIGVycm9yKTtcbiAgICAvLyBEb24ndCB0aHJvdyBlcnJvciB0byBhdm9pZCBicmVha2luZyB0aGUgbWFpbiBwcm9jZXNzXG4gIH1cbn1cblxuLy8gSGVscGVyIGZ1bmN0aW9uIHRvIGJyb2FkY2FzdCBzdWJ0aXRsZSBmaWxlcyBjb21wbGV0ZWQgZXZlbnRcbmFzeW5jIGZ1bmN0aW9uIGJyb2FkY2FzdFN1YnRpdGxlRmlsZXNDb21wbGV0ZWQoXG4gIHVzZXJJZDogc3RyaW5nLFxuICB0aW1lc3RhbXA6IHN0cmluZyxcbiAgc3VidGl0bGVLZXlzOiBzdHJpbmdbXSxcbik6IFByb21pc2U8dm9pZD4ge1xuICB0cnkge1xuICAgIGNvbnN0IHN1YnRpdGxlTWVzc2FnZSA9IHtcbiAgICAgIGFjdGlvbjogJ3N1YnRpdGxlX2ZpbGVzX2NvbXBsZXRlZCcsXG4gICAgICBkYXRhOiB7XG4gICAgICAgIHVzZXJJZCxcbiAgICAgICAgdGltZXN0YW1wLFxuICAgICAgICBzdWJ0aXRsZUZpbGVzOiBzdWJ0aXRsZUtleXMsXG4gICAgICB9LFxuICAgIH07XG5cbiAgICBjb25zdCBkb21haW5OYW1lID0gcHJvY2Vzcy5lbnYuV0VCU09DS0VUX0RPTUFJTl9OQU1FO1xuICAgIGNvbnN0IHN0YWdlID0gcHJvY2Vzcy5lbnYuV0VCU09DS0VUX1NUQUdFIHx8ICdwcm9kJztcblxuICAgIGlmIChkb21haW5OYW1lKSB7XG4gICAgICBhd2FpdCBicm9hZGNhc3RNZXNzYWdlKHN1YnRpdGxlTWVzc2FnZSwgZG9tYWluTmFtZSwgc3RhZ2UsIHVzZXJJZCk7XG4gICAgICBjb25zb2xlLmxvZyhg8J+ToSBXZWJTb2NrZXQgc3VidGl0bGUgZmlsZXMgY29tcGxldGVkIGJyb2FkY2FzdGApO1xuICAgIH0gZWxzZSB7XG4gICAgICBjb25zb2xlLmxvZyhg8J+ToSBXZWJTb2NrZXQgbm90IGNvbmZpZ3VyZWQsIHNraXBwaW5nIHN1YnRpdGxlIGJyb2FkY2FzdGApO1xuICAgIH1cbiAgfSBjYXRjaCAoZXJyb3IpIHtcbiAgICBjb25zb2xlLmVycm9yKCdFcnJvciBicm9hZGNhc3Rpbmcgc3VidGl0bGUgZmlsZXMgY29tcGxldGVkOicsIGVycm9yKTtcbiAgfVxufVxuXG4vLyBIZWxwZXIgZnVuY3Rpb24gdG8gYnJvYWRjYXN0IG1lZGlhIGZpbGVzIGNvbXBsZXRlZCBldmVudFxuYXN5bmMgZnVuY3Rpb24gYnJvYWRjYXN0TWVkaWFGaWxlc0NvbXBsZXRlZChcbiAgdXNlcklkOiBzdHJpbmcsXG4gIHRpbWVzdGFtcDogc3RyaW5nLFxuICB2aWRlb0VmZmVjdHNLZXlzOiBzdHJpbmdbXSxcbiAgaW1hZ2VVcmxzOiBzdHJpbmdbXSxcbik6IFByb21pc2U8dm9pZD4ge1xuICB0cnkge1xuICAgIGNvbnN0IG1lZGlhTWVzc2FnZSA9IHtcbiAgICAgIGFjdGlvbjogJ21lZGlhX2ZpbGVzX2NvbXBsZXRlZCcsXG4gICAgICBkYXRhOiB7XG4gICAgICAgIHVzZXJJZCxcbiAgICAgICAgdGltZXN0YW1wLFxuICAgICAgICBtZWRpYUZpbGVzOiB7XG4gICAgICAgICAgdmlkZW9FZmZlY3RzOiB2aWRlb0VmZmVjdHNLZXlzLFxuICAgICAgICAgIGltYWdlczogaW1hZ2VVcmxzLFxuICAgICAgICB9LFxuICAgICAgICBhc3NGaWxlczoge30sIC8vIFRoaXMgd2lsbCBiZSBwb3B1bGF0ZWQgYnkgdGhlIGZyb250ZW5kIHdoZW4gbmVlZGVkXG4gICAgICB9LFxuICAgIH07XG5cbiAgICBjb25zdCBkb21haW5OYW1lID0gcHJvY2Vzcy5lbnYuV0VCU09DS0VUX0RPTUFJTl9OQU1FO1xuICAgIGNvbnN0IHN0YWdlID0gcHJvY2Vzcy5lbnYuV0VCU09DS0VUX1NUQUdFIHx8ICdwcm9kJztcblxuICAgIGlmIChkb21haW5OYW1lKSB7XG4gICAgICBhd2FpdCBicm9hZGNhc3RNZXNzYWdlKG1lZGlhTWVzc2FnZSwgZG9tYWluTmFtZSwgc3RhZ2UsIHVzZXJJZCk7XG4gICAgICBjb25zb2xlLmxvZyhg8J+ToSBXZWJTb2NrZXQgbWVkaWEgZmlsZXMgY29tcGxldGVkIGJyb2FkY2FzdGApO1xuICAgIH0gZWxzZSB7XG4gICAgICBjb25zb2xlLmxvZyhg8J+ToSBXZWJTb2NrZXQgbm90IGNvbmZpZ3VyZWQsIHNraXBwaW5nIG1lZGlhIGJyb2FkY2FzdGApO1xuICAgIH1cbiAgfSBjYXRjaCAoZXJyb3IpIHtcbiAgICBjb25zb2xlLmVycm9yKCdFcnJvciBicm9hZGNhc3RpbmcgbWVkaWEgZmlsZXMgY29tcGxldGVkOicsIGVycm9yKTtcbiAgfVxufVxuXG4vLyBIZWxwZXIgZnVuY3Rpb24gdG8gYnJvYWRjYXN0IHZpZGVvIGdlbmVyYXRpb24gY29tcGxldGVkIGV2ZW50XG5hc3luYyBmdW5jdGlvbiBicm9hZGNhc3RWaWRlb0dlbmVyYXRpb25Db21wbGV0ZWQoXG4gIHVzZXJJZDogc3RyaW5nLFxuICB0aW1lc3RhbXA6IHN0cmluZyxcbiAgdmlkZW9LZXk6IHN0cmluZyxcbik6IFByb21pc2U8dm9pZD4ge1xuICB0cnkge1xuICAgIGNvbnN0IGNvbXBsZXRpb25NZXNzYWdlID0ge1xuICAgICAgYWN0aW9uOiAndmlkZW9fZ2VuZXJhdGlvbl9jb21wbGV0ZWQnLFxuICAgICAgZGF0YToge1xuICAgICAgICB1c2VySWQsXG4gICAgICAgIHRpbWVzdGFtcCxcbiAgICAgICAgdmlkZW9LZXksXG4gICAgICAgIG1lc3NhZ2U6ICdWaWRlbyBnZW5lcmF0aW9uIGNvbXBsZXRlZCBzdWNjZXNzZnVsbHknLFxuICAgICAgfSxcbiAgICB9O1xuXG4gICAgY29uc3QgZG9tYWluTmFtZSA9IHByb2Nlc3MuZW52LldFQlNPQ0tFVF9ET01BSU5fTkFNRTtcbiAgICBjb25zdCBzdGFnZSA9IHByb2Nlc3MuZW52LldFQlNPQ0tFVF9TVEFHRSB8fCAncHJvZCc7XG5cbiAgICBpZiAoZG9tYWluTmFtZSkge1xuICAgICAgYXdhaXQgYnJvYWRjYXN0TWVzc2FnZShjb21wbGV0aW9uTWVzc2FnZSwgZG9tYWluTmFtZSwgc3RhZ2UsIHVzZXJJZCk7XG4gICAgICBjb25zb2xlLmxvZyhg8J+ToSBXZWJTb2NrZXQgdmlkZW8gZ2VuZXJhdGlvbiBjb21wbGV0ZWQgYnJvYWRjYXN0YCk7XG4gICAgfSBlbHNlIHtcbiAgICAgIGNvbnNvbGUubG9nKGDwn5OhIFdlYlNvY2tldCBub3QgY29uZmlndXJlZCwgc2tpcHBpbmcgY29tcGxldGlvbiBicm9hZGNhc3RgKTtcbiAgICB9XG4gIH0gY2F0Y2ggKGVycm9yKSB7XG4gICAgY29uc29sZS5lcnJvcignRXJyb3IgYnJvYWRjYXN0aW5nIHZpZGVvIGdlbmVyYXRpb24gY29tcGxldGVkOicsIGVycm9yKTtcbiAgfVxufVxuIl19