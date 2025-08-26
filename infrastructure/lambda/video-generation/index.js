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
        const sceneDuration = Math.floor(request.totalDuration / request.sceneCount);
        // Check if there is already script generated in the s3 bucket for the timestamp
        const scriptKey = `${request.userId}/${timestamp}.script.txt`;
        const existingScript = await (0, s3Uploader_1.getObjectFromS3)(scriptKey);
        let scenes = [];
        let voiceToneInstruction = '';
        if (existingScript) {
            console.log('🎥 Script already generated for the timestamp, using existing script');
            scenes = (0, script_1.addSceneIds)(existingScript.scenes);
            voiceToneInstruction = existingScript.voiceToneInstruction;
        }
        else {
            console.log('🎥 No existing script found, generating new story breakdown');
            // Step 1: Generate script/story breakdown using GPT-4
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
        // Check if there are already images generated in the s3 bucket for the timestamp
        let imageUrls = await (0, imageUtils_1.getImageUrls)(request.userId, timestamp);
        if (imageUrls.length > 0) {
            console.log('🎥 Images already generated for the timestamp:', imageUrls);
        }
        else {
            const seed = Math.floor(Math.random() * 1000000);
            // Step 2: Generate images for each scene in parallel
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
        // Step 3: Generate audio narration with word-level timestamps
        const { subtitles, narrationUrls } = await (0, narration_1.generateNarration)(scenes, request.userId, timestamp, voiceToneInstruction);
        const subtitleContent = await (0, subtitles_1.generateSubtitleContent)(scenes, request.userId, timestamp, subtitles);
        console.log('📝 Subtitle content generated:', subtitleContent);
        console.log('🎤 Narration URLs generated:', narrationUrls);
        await broadcastProgress('audio_subtitle_created', request.userId, timestamp, {
            subtitles: subtitles.map((subtitle) => ({
                [`${timestamp}.scene-${subtitle.sceneIndex}.subtitle`]: {
                    text: subtitle.fullText,
                },
            })),
            subtitleContent,
            narrationUrls,
        }, 'Audio and Subtitles completed');
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
        // check if there are already all the video effects generated in the s3 bucket for the timestamp
        let videoEffectsUrls = [];
        videoEffectsUrls = await (0, videoEffects_1.getVideoEffectUrls)(request.userId, timestamp, scenes);
        await broadcastProgress('video_scene_created', request.userId, timestamp, {
            videoEffectsUrls,
        }, 'Video effects completed');
        console.log('🎬 Video effects URLs generated:', videoEffectsUrls);
        // Step 6: Combine video clips, audio, and subtitles
        // lets add a request.step param that will only run this combineVideoAudio if step === 3
        if (request.step === 3) {
            const finalVideo = await (0, videoCombiner_1.combineVideoAndAudio)(request.userId, timestamp, scenes);
            if (!finalVideo) {
                throw new Error('Failed to combine video, audio, and subtitles');
            }
            // Step 6: Upload to S3
            const videoKey = await (0, s3Uploader_1.uploadToS3)(finalVideo, request.userId, timestamp);
        }
        // If this was triggered by SQS, delete the message from the queue
        if (record && process.env.VIDEO_QUEUE_URL) {
            const deleteCommand = new client_sqs_1.DeleteMessageCommand({
                QueueUrl: process.env.VIDEO_QUEUE_URL,
                ReceiptHandle: record.receiptHandle,
            });
            await sqs.send(deleteCommand);
        }
        // Broadcast video generation completed event
        await broadcastProgress('video_completed', request.userId, timestamp, null, 'Video generation completed');
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiaW5kZXguanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyJpbmRleC50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiOzs7QUFHQSxvREFBc0U7QUFFdEUsbUNBQXdDO0FBQ3hDLDJDQUErRTtBQUMvRSwyQ0FBeUU7QUFDekUscUNBQXVDO0FBQ3ZDLGtEQUFnRTtBQUNoRSxrREFBaUQ7QUFDakQsc0RBQStFO0FBQy9FLG1EQUF1RDtBQUN2RCxnRUFBMEQ7QUFXMUQsTUFBTSxHQUFHLEdBQUcsSUFBSSxzQkFBUyxDQUFDLEVBQUUsTUFBTSxFQUFFLE9BQU8sQ0FBQyxHQUFHLENBQUMsVUFBVSxJQUFJLFdBQVcsRUFBRSxDQUFDLENBQUM7QUFFdEUsTUFBTSxPQUFPLEdBQUcsS0FBSyxFQUFFLEtBQWUsRUFBNkIsRUFBRTtJQUMxRSxPQUFPLENBQUMsR0FBRyxDQUNULHlFQUF5RSxDQUMxRSxDQUFDO0lBQ0YsT0FBTyxNQUFNLGNBQWMsQ0FBQyxLQUFLLENBQUMsQ0FBQztBQUNyQyxDQUFDLENBQUM7QUFMVyxRQUFBLE9BQU8sV0FLbEI7QUFFRixLQUFLLFVBQVUsY0FBYyxDQUFDLEtBQWU7SUFDM0MsTUFBTSxpQkFBaUIsR0FBaUMsRUFBRSxDQUFDO0lBRTNELEtBQUssTUFBTSxNQUFNLElBQUksS0FBSyxDQUFDLE9BQU8sRUFBRSxDQUFDO1FBQ25DLElBQUksQ0FBQztZQUNILHlCQUF5QjtZQUN6QixNQUFNLE9BQU8sR0FBMkIsSUFBSSxDQUFDLEtBQUssQ0FBQyxNQUFNLENBQUMsSUFBSSxDQUFDLENBQUM7WUFFaEUsa0RBQWtEO1lBQ2xELE1BQU0sc0JBQXNCLENBQUMsT0FBTyxFQUFFLE1BQU0sQ0FBQyxDQUFDO1FBQ2hELENBQUM7UUFBQyxPQUFPLEtBQUssRUFBRSxDQUFDO1lBQ2YsT0FBTyxDQUFDLEtBQUssQ0FBQyw0QkFBNEIsRUFBRSxNQUFNLENBQUMsU0FBUyxFQUFFLEtBQUssQ0FBQyxDQUFDO1lBQ3JFLGlCQUFpQixDQUFDLElBQUksQ0FB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QU07WUFDTixJQUFJLEVBQUU7Z0JBQ0osTUFBTTtnQkFDTixTQUFTO2dCQUNULE9BQU87Z0JBQ1AsR0FBRyxJQUFJO2FBQ1I7U0FDRixDQUFDO1FBRUYsZ0VBQWdFO1FBQ2hFLE1BQU0sVUFBVSxHQUFHLE9BQU8sQ0FBQyxHQUFHLENBQUMscUJBQXFCLENBQUM7UUFDckQsTUFBTSxLQUFLLEdBQUcsT0FBTyxDQUFDLEdBQUcsQ0FBQyxlQUFlLElBQUksTUFBTSxDQUFDO1FBRXBELElBQUksVUFBVSxFQUFFLENBQUM7WUFDZixNQUFNLElBQUEsc0NBQWdCLEVBQUMsZUFBZSxFQUFFLFVBQVUsRUFBRSxLQUFLLEVBQUUsTUFBTSxDQUFDLENBQUM7WUFDbkUsT0FBTyxDQUFDLEdBQUcsQ0FBQyxvQ0FBb0MsTUFBTSxNQUFNLE9BQU8sRUFBRSxDQUFDLENBQUM7UUFDekUsQ0FBQzthQUFNLENBQUM7WUFDTixPQUFPLENBQUMsR0FBRyxDQUNULG9EQUFvRCxNQUFNLE1BQU0sT0FBTyxFQUFFLENBQzFFLENBQUM7UUFDSixDQUFDO0lBQ0gsQ0FBQztJQUFDLE9BQU8sS0FBSyxFQUFFLENBQUM7UUFDZixPQUFPLENBQUMsS0FBSyxDQUFDLG9DQUFvQyxFQUFFLEtBQUssQ0FBQyxDQUFDO1FBQzNELHVEQUF1RDtJQUN6RCxDQUFDO0FBQ0gsQ0FBQyIsInNvdXJjZXNDb250ZW50IjpbIi8vIFVwZGF0ZWQ6IEFkZGVkIGZsdWVudC1mZm1wZWcgZGVwZW5kZW5jeSBzdXBwb3J0XG5pbXBvcnQgeyBTUVNFdmVudCwgU1FTUmVjb3JkLCBTUVNCYXRjaFJlc3BvbnNlIH0gZnJvbSAnYXdzLWxhbWJkYSc7XG5cbmltcG9ydCB7IFNRU0NsaWVudCwgRGVsZXRlTWVzc2FnZUNvbW1hbmQgfSBmcm9tICdAYXdzLXNkay9jbGllbnQtc3FzJztcblxuaW1wb3J0IHsgZ2VuZXJhdGVJbWFnZSB9IGZyb20gJy4vaW1hZ2UnO1xuaW1wb3J0IHsgZ2VuZXJhdGVOYXJyYXRpb24sIGdlbmVyYXRlU3RvcnlCcmVha2Rvd24sIFNjZW5lIH0gZnJvbSAnLi9uYXJyYXRpb24nO1xuaW1wb3J0IHsgZ2VuZXJhdGVTdWJ0aXRsZXMsIGdlbmVyYXRlU3VidGl0bGVDb250ZW50IH0gZnJvbSAnLi9zdWJ0aXRsZXMnO1xuaW1wb3J0IHsgYWRkU2NlbmVJZHMgfSBmcm9tICcuL3NjcmlwdCc7XG5pbXBvcnQgeyB1cGxvYWRUb1MzLCBnZXRPYmplY3RGcm9tUzMgfSBmcm9tICcuL3V0aWwvczNVcGxvYWRlcic7XG5pbXBvcnQgeyBnZXRJbWFnZVVybHMgfSBmcm9tICcuL3V0aWwvaW1hZ2VVdGlscyc7XG5pbXBvcnQgeyBnZW5lcmF0ZVZpZGVvRWZmZWN0cywgZ2V0VmlkZW9FZmZlY3RVcmxzIH0gZnJvbSAnLi91dGlsL3ZpZGVvRWZmZWN0cyc7XG5pbXBvcnQgeyBjb21iaW5lVmlkZW9BbmRBdWRpbyB9IGZyb20gJy4vdmlkZW9Db21iaW5lcic7XG5pbXBvcnQgeyBicm9hZGNhc3RNZXNzYWdlIH0gZnJvbSAnLi4vd2Vic29ja2V0LWJyb2FkY2FzdCc7XG5cbmludGVyZmFjZSBWaWRlb0dlbmVyYXRpb25SZXF1ZXN0IHtcbiAgcHJvbXB0OiBzdHJpbmc7XG4gIHVzZXJJZDogc3RyaW5nO1xuICB0aW1lc3RhbXA6IHN0cmluZztcbiAgdG90YWxEdXJhdGlvbjogbnVtYmVyO1xuICBzY2VuZUNvdW50OiBudW1iZXI7XG4gIHN0ZXA6IG51bWJlcjtcbn1cblxuY29uc3Qgc3FzID0gbmV3IFNRU0NsaWVudCh7IHJlZ2lvbjogcHJvY2Vzcy5lbnYuQVdTX1JFR0lPTiB8fCAndXMtZWFzdC0xJyB9KTtcblxuZXhwb3J0IGNvbnN0IGhhbmRsZXIgPSBhc3luYyAoZXZlbnQ6IFNRU0V2ZW50KTogUHJvbWlzZTxTUVNCYXRjaFJlc3BvbnNlPiA9PiB7XG4gIGNvbnNvbGUubG9nKFxuICAgICfwn5SEIFZpZGVvIEdlbmVyYXRpb24gTGFtYmRhIHN0YXJ0ZWQgLSBVcGRhdGVkIHdpdGggZmx1ZW50LWZmbXBlZyBzdXBwb3J0JyxcbiAgKTtcbiAgcmV0dXJuIGF3YWl0IGhhbmRsZVNRU0V2ZW50KGV2ZW50KTtcbn07XG5cbmFzeW5jIGZ1bmN0aW9uIGhhbmRsZVNRU0V2ZW50KGV2ZW50OiBTUVNFdmVudCk6IFByb21pc2U8U1FTQmF0Y2hSZXNwb25zZT4ge1xuICBjb25zdCBiYXRjaEl0ZW1GYWlsdXJlczogeyBpdGVtSWRlbnRpZmllcjogc3RyaW5nIH1bXSA9IFtdO1xuXG4gIGZvciAoY29uc3QgcmVjb3JkIG9mIGV2ZW50LlJlY29yZHMpIHtcbiAgICB0cnkge1xuICAgICAgLy8gUGFyc2UgdGhlIG1lc3NhZ2UgYm9keVxuICAgICAgY29uc3QgcmVxdWVzdDogVmlkZW9HZW5lcmF0aW9uUmVxdWVzdCA9IEpTT04ucGFyc2UocmVjb3JkLmJvZHkpO1xuXG4gICAgICAvLyBQcm9jZXNzIHRoZSB2aWRlbyBnZW5lcmF0aW9uIHdpdGggb3JkZXJlZCBzdGVwc1xuICAgICAgYXdhaXQgcHJvY2Vzc1ZpZGVvR2VuZXJhdGlvbihyZXF1ZXN0LCByZWNvcmQpO1xuICAgIH0gY2F0Y2ggKGVycm9yKSB7XG4gICAgICBjb25zb2xlLmVycm9yKCfinYwgRXJyb3IgcHJvY2Vzc2luZyByZWNvcmQ6JywgcmVjb3JkLm1lc3NhZ2VJZCwgZXJyb3IpO1xuICAgICAgYmF0Y2hJdGVtRmFpbHVyZXMucHVzaCh7IGl0ZW1JZGVudGlmaWVyOiByZWNvcmQubWVzc2FnZUlkIH0pO1xuICAgIH1cbiAgfVxuXG4gIHJldHVybiB7XG4gICAgYmF0Y2hJdGVtRmFpbHVyZXMsXG4gIH07XG59XG5cbmFzeW5jIGZ1bmN0aW9uIHByb2Nlc3NWaWRlb0dlbmVyYXRpb24oXG4gIHJlcXVlc3Q6IFZpZGVvR2VuZXJhdGlvblJlcXVlc3QsXG4gIHJlY29yZD86IFNRU1JlY29yZCxcbik6IFByb21pc2U8YW55PiB7XG4gIHRyeSB7XG4gICAgY29uc29sZS5sb2coJ3Byb2Nlc3NWaWRlb0dlbmVyYXRpb246JywgcmVxdWVzdCk7XG5cbiAgICAvLyBVc2UgdGltZXN0YW1wIGZyb20gcmVxdWVzdCBib2R5XG4gICAgY29uc3QgdGltZXN0YW1wID0gcmVxdWVzdC50aW1lc3RhbXA7XG5cbiAgICBjb25zdCBzY2VuZUR1cmF0aW9uID0gTWF0aC5mbG9vcihcbiAgICAgIHJlcXVlc3QudG90YWxEdXJhdGlvbiAvIHJlcXVlc3Quc2NlbmVDb3VudCxcbiAgICApO1xuXG4gICAgLy8gQ2hlY2sgaWYgdGhlcmUgaXMgYWxyZWFkeSBzY3JpcHQgZ2VuZXJhdGVkIGluIHRoZSBzMyBidWNrZXQgZm9yIHRoZSB0aW1lc3RhbXBcbiAgICBjb25zdCBzY3JpcHRLZXkgPSBgJHtyZXF1ZXN0LnVzZXJJZH0vJHt0aW1lc3RhbXB9LnNjcmlwdC50eHRgO1xuICAgIGNvbnN0IGV4aXN0aW5nU2NyaXB0ID0gYXdhaXQgZ2V0T2JqZWN0RnJvbVMzKHNjcmlwdEtleSk7XG5cbiAgICBsZXQgc2NlbmVzOiBTY2VuZVtdID0gW107XG4gICAgbGV0IHZvaWNlVG9uZUluc3RydWN0aW9uOiBzdHJpbmcgPSAnJztcblxuICAgIGlmIChleGlzdGluZ1NjcmlwdCkge1xuICAgICAgY29uc29sZS5sb2coXG4gICAgICAgICfwn46lIFNjcmlwdCBhbHJlYWR5IGdlbmVyYXRlZCBmb3IgdGhlIHRpbWVzdGFtcCwgdXNpbmcgZXhpc3Rpbmcgc2NyaXB0JyxcbiAgICAgICk7XG4gICAgICBzY2VuZXMgPSBhZGRTY2VuZUlkcyhleGlzdGluZ1NjcmlwdC5zY2VuZXMpO1xuICAgICAgdm9pY2VUb25lSW5zdHJ1Y3Rpb24gPSBleGlzdGluZ1NjcmlwdC52b2ljZVRvbmVJbnN0cnVjdGlvbjtcbiAgICB9IGVsc2Uge1xuICAgICAgY29uc29sZS5sb2coXG4gICAgICAgICfwn46lIE5vIGV4aXN0aW5nIHNjcmlwdCBmb3VuZCwgZ2VuZXJhdGluZyBuZXcgc3RvcnkgYnJlYWtkb3duJyxcbiAgICAgICk7XG5cbiAgICAgIC8vIFN0ZXAgMTogR2VuZXJhdGUgc2NyaXB0L3N0b3J5IGJyZWFrZG93biB1c2luZyBHUFQtNFxuXG4gICAgICBjb25zdCBzdG9yeUJyZWFrZG93biA9IGF3YWl0IGdlbmVyYXRlU3RvcnlCcmVha2Rvd24oXG4gICAgICAgIHJlcXVlc3QucHJvbXB0LFxuICAgICAgICByZXF1ZXN0LnNjZW5lQ291bnQsXG4gICAgICAgIHNjZW5lRHVyYXRpb24sXG4gICAgICAgIHJlcXVlc3QudG90YWxEdXJhdGlvbixcbiAgICAgICAgcmVxdWVzdC51c2VySWQsXG4gICAgICAgIHRpbWVzdGFtcCxcbiAgICAgICk7XG4gICAgICBzY2VuZXMgPSBzdG9yeUJyZWFrZG93bi5zY2VuZXM7XG4gICAgICB2b2ljZVRvbmVJbnN0cnVjdGlvbiA9IHN0b3J5QnJlYWtkb3duLnZvaWNlVG9uZUluc3RydWN0aW9uO1xuICAgIH1cblxuICAgIGlmICghc2NlbmVzIHx8IHNjZW5lcy5sZW5ndGggPT09IDApIHtcbiAgICAgIGNvbnNvbGUubG9nKCfinYwgRXJyb3I6IEZhaWxlZCB0byBnZXQgb3IgZ2VuZXJhdGUgc3RvcnkgYnJlYWtkb3duJyk7XG4gICAgICB0aHJvdyBuZXcgRXJyb3IoJ0ZhaWxlZCB0byBnZXQgb3IgZ2VuZXJhdGUgc3RvcnkgYnJlYWtkb3duJyk7XG4gICAgfVxuXG4gICAgY29uc29sZS5sb2coJ/CfjqUgU3RvcnkgYnJlYWtkb3duIGdlbmVyYXRlZDonLCBzY2VuZXMpO1xuXG4gICAgYXdhaXQgYnJvYWRjYXN0UHJvZ3Jlc3MoXG4gICAgICAnc2NyaXB0X2NyZWF0ZWQnLFxuICAgICAgcmVxdWVzdC51c2VySWQsXG4gICAgICB0aW1lc3RhbXAsXG4gICAgICB7XG4gICAgICAgIHNjZW5lcyxcbiAgICAgIH0sXG4gICAgICAnU3RvcnkgYnJlYWtkb3duIGNvbXBsZXRlZCcsXG4gICAgKTtcblxuICAgIC8vIENoZWNrIGlmIHRoZXJlIGFyZSBhbHJlYWR5IGltYWdlcyBnZW5lcmF0ZWQgaW4gdGhlIHMzIGJ1Y2tldCBmb3IgdGhlIHRpbWVzdGFtcFxuICAgIGxldCBpbWFnZVVybHMgPSBhd2FpdCBnZXRJbWFnZVVybHMocmVxdWVzdC51c2VySWQsIHRpbWVzdGFtcCk7XG5cbiAgICBpZiAoaW1hZ2VVcmxzLmxlbmd0aCA+IDApIHtcbiAgICAgIGNvbnNvbGUubG9nKCfwn46lIEltYWdlcyBhbHJlYWR5IGdlbmVyYXRlZCBmb3IgdGhlIHRpbWVzdGFtcDonLCBpbWFnZVVybHMpO1xuICAgIH0gZWxzZSB7XG4gICAgICBjb25zdCBzZWVkID0gTWF0aC5mbG9vcihNYXRoLnJhbmRvbSgpICogMTAwMDAwMCk7XG5cbiAgICAgIC8vIFN0ZXAgMjogR2VuZXJhdGUgaW1hZ2VzIGZvciBlYWNoIHNjZW5lIGluIHBhcmFsbGVsXG4gICAgICBjb25zb2xlLmxvZygn8J+OqCBHZW5lcmF0aW5nIGltYWdlcyBmb3IgZWFjaCBzY2VuZSBpbiBwYXJhbGxlbC4uLicpO1xuXG4gICAgICB0cnkge1xuICAgICAgICBjb25zdCBpbWFnZVByb21pc2VzID0gc2NlbmVzLm1hcChhc3luYyAoc2NlbmU6IGFueSwgaTogbnVtYmVyKSA9PiB7XG4gICAgICAgICAgY29uc29sZS5sb2coXG4gICAgICAgICAgICBg8J+OqCBHZW5lcmF0aW5nIGltYWdlIGZvciBzY2VuZSAke2kgKyAxfTpgLFxuICAgICAgICAgICAgc2NlbmUuZGVzY3JpcHRpb24sXG4gICAgICAgICAgKTtcblxuICAgICAgICAgIGNvbnN0IGltYWdlVXJsID0gYXdhaXQgZ2VuZXJhdGVJbWFnZShcbiAgICAgICAgICAgIHNjZW5lLmRlc2NyaXB0aW9uLFxuICAgICAgICAgICAgaSxcbiAgICAgICAgICAgIHJlcXVlc3QudXNlcklkLFxuICAgICAgICAgICAgdGltZXN0YW1wLFxuICAgICAgICAgICAgc2VlZCxcbiAgICAgICAgICAgIHNjZW5lLmlkLFxuICAgICAgICAgICk7XG5cbiAgICAgICAgICBjb25zb2xlLmxvZyhg4pyFIFNjZW5lICR7aSArIDF9IGltYWdlIGdlbmVyYXRlZDpgLCBpbWFnZVVybCk7XG4gICAgICAgICAgcmV0dXJuIGltYWdlVXJsO1xuICAgICAgICB9KTtcblxuICAgICAgICAvLyBXYWl0IGZvciBhbGwgaW1hZ2VzIHRvIGJlIGdlbmVyYXRlZFxuICAgICAgICBjb25zdCBnZW5lcmF0ZWRJbWFnZVVybHMgPSBhd2FpdCBQcm9taXNlLmFsbChpbWFnZVByb21pc2VzKTtcblxuICAgICAgICBpZiAoZ2VuZXJhdGVkSW1hZ2VVcmxzLmxlbmd0aCA9PT0gMCkge1xuICAgICAgICAgIGNvbnNvbGUubG9nKCfinYwgRXJyb3I6IE5vIGltYWdlcyB3ZXJlIGdlbmVyYXRlZCcpO1xuICAgICAgICAgIHRocm93IG5ldyBFcnJvcignTm8gaW1hZ2VzIHdlcmUgZ2VuZXJhdGVkJyk7XG4gICAgICAgIH1cblxuICAgICAgICAvLyBDb252ZXJ0IGdlbmVyYXRlZCBpbWFnZSBVUkxzIHRvIHRoZSBuZXcgZm9ybWF0XG4gICAgICAgIGltYWdlVXJscyA9IGdlbmVyYXRlZEltYWdlVXJscy5tYXAoKGltYWdlVXJsLCBpbmRleCkgPT4ge1xuICAgICAgICAgIGNvbnN0IGZpbGVuYW1lID0gYCR7dGltZXN0YW1wfS5zY2VuZS0ke3NjZW5lc1tpbmRleF0uaWR9LmpwZ2A7XG4gICAgICAgICAgcmV0dXJuIHsgW2ZpbGVuYW1lXTogaW1hZ2VVcmwgfTtcbiAgICAgICAgfSk7XG5cbiAgICAgICAgY29uc29sZS5sb2coXG4gICAgICAgICAgYPCfjqUgR2VuZXJhdGVkICR7aW1hZ2VVcmxzLmxlbmd0aH0gaW1hZ2VzIGluIHBhcmFsbGVsOmAsXG4gICAgICAgICAgaW1hZ2VVcmxzLFxuICAgICAgICApO1xuICAgICAgfSBjYXRjaCAoZXJyb3IpIHtcbiAgICAgICAgY29uc29sZS5lcnJvcign4p2MIEZhaWxlZCB0byBnZW5lcmF0ZSBpbWFnZXM6JywgZXJyb3IpO1xuICAgICAgICB0aHJvdyBuZXcgRXJyb3IoYEZhaWxlZCB0byBnZW5lcmF0ZSBpbWFnZXM6ICR7ZXJyb3J9YCk7XG4gICAgICB9XG4gICAgfVxuXG4gICAgY29uc29sZS5sb2coJ/CflrzvuI8gSW1hZ2UgVVJMcyBnZW5lcmF0ZWQ6JywgaW1hZ2VVcmxzKTtcblxuICAgIGF3YWl0IGJyb2FkY2FzdFByb2dyZXNzKFxuICAgICAgJ2ltYWdlX2NyZWF0ZWQnLFxuICAgICAgcmVxdWVzdC51c2VySWQsXG4gICAgICB0aW1lc3RhbXAsXG4gICAgICBpbWFnZVVybHMsXG4gICAgICAnSW1hZ2VzIGdlbmVyYXRlZCcsXG4gICAgKTtcblxuICAgIGNvbnNvbGUubG9nKCfwn46lIE5vIGV4aXN0aW5nIGF1ZGlvIGZpbGVzIGZvdW5kLCBnZW5lcmF0aW5nIG5ldyBuYXJyYXRpb24nKTtcblxuICAgIC8vIFN0ZXAgMzogR2VuZXJhdGUgYXVkaW8gbmFycmF0aW9uIHdpdGggd29yZC1sZXZlbCB0aW1lc3RhbXBzXG4gICAgY29uc3QgeyBzdWJ0aXRsZXMsIG5hcnJhdGlvblVybHMgfSA9IGF3YWl0IGdlbmVyYXRlTmFycmF0aW9uKFxuICAgICAgc2NlbmVzLFxuICAgICAgcmVxdWVzdC51c2VySWQsXG4gICAgICB0aW1lc3RhbXAsXG4gICAgICB2b2ljZVRvbmVJbnN0cnVjdGlvbixcbiAgICApO1xuXG4gICAgY29uc3Qgc3VidGl0bGVDb250ZW50ID0gYXdhaXQgZ2VuZXJhdGVTdWJ0aXRsZUNvbnRlbnQoXG4gICAgICBzY2VuZXMsXG4gICAgICByZXF1ZXN0LnVzZXJJZCxcbiAgICAgIHRpbWVzdGFtcCxcbiAgICAgIHN1YnRpdGxlcyxcbiAgICApO1xuXG4gICAgY29uc29sZS5sb2coJ/Cfk50gU3VidGl0bGUgY29udGVudCBnZW5lcmF0ZWQ6Jywgc3VidGl0bGVDb250ZW50KTtcbiAgICBjb25zb2xlLmxvZygn8J+OpCBOYXJyYXRpb24gVVJMcyBnZW5lcmF0ZWQ6JywgbmFycmF0aW9uVXJscyk7XG5cbiAgICBhd2FpdCBicm9hZGNhc3RQcm9ncmVzcyhcbiAgICAgICdhdWRpb19zdWJ0aXRsZV9jcmVhdGVkJyxcbiAgICAgIHJlcXVlc3QudXNlcklkLFxuICAgICAgdGltZXN0YW1wLFxuICAgICAge1xuICAgICAgICBzdWJ0aXRsZXM6IHN1YnRpdGxlcy5tYXAoKHN1YnRpdGxlKSA9PiAoe1xuICAgICAgICAgIFtgJHt0aW1lc3RhbXB9LnNjZW5lLSR7c3VidGl0bGUuc2NlbmVJbmRleH0uc3VidGl0bGVgXToge1xuICAgICAgICAgICAgdGV4dDogc3VidGl0bGUuZnVsbFRleHQsXG4gICAgICAgICAgfSxcbiAgICAgICAgfSkpLFxuICAgICAgICBzdWJ0aXRsZUNvbnRlbnQsXG4gICAgICAgIG5hcnJhdGlvblVybHMsXG4gICAgICB9LFxuICAgICAgJ0F1ZGlvIGFuZCBTdWJ0aXRsZXMgY29tcGxldGVkJyxcbiAgICApO1xuXG4gICAgLy8gU3RlcCA0OiBHZW5lcmF0ZSB2aWRlbyBjbGlwcyBmcm9tIGltYWdlc1xuICAgIC8vIGNvbnNvbGUubG9nKCfwn46lIEdlbmVyYXRpbmcgdmlkZW8gY2xpcHMgZnJvbSBpbWFnZXMuLi4nKTtcbiAgICAvLyBjb25zdCB2aWRlb0NsaXBzOiBzdHJpbmdbXSA9IFtdO1xuXG4gICAgLy8gZm9yIChsZXQgaSA9IDA7IGkgPCBzY2VuZXMubGVuZ3RoOyBpKyspIHtcbiAgICAvLyAgIGNvbnN0IHNjZW5lID0gc2NlbmVzW2ldO1xuICAgIC8vICAgY29uc3QgaW1hZ2VVcmwgPSBpbWFnZVVybHNbaV07XG4gICAgLy8gICBjb25zb2xlLmxvZyhcbiAgICAvLyAgICAgYPCfjqwgR2VuZXJhdGluZyB2aWRlbyBmb3Igc2NlbmUgJHtpICsgMX0gZnJvbSBpbWFnZTpgLFxuICAgIC8vICAgICBzY2VuZS5kZXNjcmlwdGlvbixcbiAgICAvLyAgICk7XG4gICAgLy8gICB0cnkge1xuICAgIC8vICAgICBjb25zdCB2aWRlb0NsaXAgPSBhd2FpdCBnZW5lcmF0ZVZpZGVvQ2xpcChcbiAgICAvLyAgICAgICBzY2VuZS5kZXNjcmlwdGlvbixcbiAgICAvLyAgICAgICBzY2VuZS5kdXJhdGlvbixcbiAgICAvLyAgICAgICBpLFxuICAgIC8vICAgICAgIHJlcXVlc3QudXNlcklkLFxuICAgIC8vICAgICAgIHRpbWVzdGFtcCxcbiAgICAvLyAgICAgICBzZWVkLFxuICAgIC8vICAgICAgIHNjZW5lLmlkLFxuICAgIC8vICAgICAgIGltYWdlVXJsLFxuICAgIC8vICAgICApO1xuICAgIC8vICAgICB2aWRlb0NsaXBzLnB1c2godmlkZW9DbGlwKTtcbiAgICAvLyAgICAgY29uc29sZS5sb2coYOKchSBTY2VuZSAke2kgKyAxfSB2aWRlbyBnZW5lcmF0ZWQ6YCwgdmlkZW9DbGlwKTtcbiAgICAvLyAgIH0gY2F0Y2ggKGVycm9yKSB7XG4gICAgLy8gICAgIGNvbnNvbGUuZXJyb3IoYOKdjCBGYWlsZWQgdG8gZ2VuZXJhdGUgdmlkZW8gZm9yIHNjZW5lICR7aSArIDF9OmAsIGVycm9yKTtcbiAgICAvLyAgICAgdGhyb3cgbmV3IEVycm9yKFxuICAgIC8vICAgICAgIGBGYWlsZWQgdG8gZ2VuZXJhdGUgdmlkZW8gZm9yIHNjZW5lICR7aSArIDF9OiAke2Vycm9yfWAsXG4gICAgLy8gICAgICk7XG4gICAgLy8gICB9XG4gICAgLy8gfVxuXG4gICAgLy8gaWYgKHZpZGVvQ2xpcHMubGVuZ3RoID09PSAwKSB7XG4gICAgLy8gICBjb25zb2xlLmxvZygn4p2MIEVycm9yOiBObyB2aWRlbyBjbGlwcyB3ZXJlIGdlbmVyYXRlZCcpO1xuICAgIC8vICAgdGhyb3cgbmV3IEVycm9yKCdObyB2aWRlbyBjbGlwcyB3ZXJlIGdlbmVyYXRlZCcpO1xuICAgIC8vIH1cblxuICAgIC8vIGNvbnNvbGUubG9nKGDinIUgR2VuZXJhdGVkICR7dmlkZW9DbGlwcy5sZW5ndGh9IHZpZGVvIGNsaXBzYCk7XG5cbiAgICAvLyBTdGVwIDQ6IEdlbmVyYXRlIHZpZGVvIGVmZmVjdHMgYW5kIGNhbWVyYSBtb3ZlbWVudCB1c2luZyB0aGUgaW1hZ2VzXG5cbiAgICAvLyBjaGVjayBpZiB0aGVyZSBhcmUgYWxyZWFkeSBhbGwgdGhlIHZpZGVvIGVmZmVjdHMgZ2VuZXJhdGVkIGluIHRoZSBzMyBidWNrZXQgZm9yIHRoZSB0aW1lc3RhbXBcbiAgICBsZXQgdmlkZW9FZmZlY3RzVXJscyA9IFtdO1xuXG4gICAgdmlkZW9FZmZlY3RzVXJscyA9IGF3YWl0IGdldFZpZGVvRWZmZWN0VXJscyhcbiAgICAgIHJlcXVlc3QudXNlcklkLFxuICAgICAgdGltZXN0YW1wLFxuICAgICAgc2NlbmVzLFxuICAgICk7XG5cbiAgICBhd2FpdCBicm9hZGNhc3RQcm9ncmVzcyhcbiAgICAgICd2aWRlb19zY2VuZV9jcmVhdGVkJyxcbiAgICAgIHJlcXVlc3QudXNlcklkLFxuICAgICAgdGltZXN0YW1wLFxuICAgICAge1xuICAgICAgICB2aWRlb0VmZmVjdHNVcmxzLFxuICAgICAgfSxcbiAgICAgICdWaWRlbyBlZmZlY3RzIGNvbXBsZXRlZCcsXG4gICAgKTtcblxuICAgIGNvbnNvbGUubG9nKCfwn46sIFZpZGVvIGVmZmVjdHMgVVJMcyBnZW5lcmF0ZWQ6JywgdmlkZW9FZmZlY3RzVXJscyk7XG5cbiAgICAvLyBTdGVwIDY6IENvbWJpbmUgdmlkZW8gY2xpcHMsIGF1ZGlvLCBhbmQgc3VidGl0bGVzXG4gICAgLy8gbGV0cyBhZGQgYSByZXF1ZXN0LnN0ZXAgcGFyYW0gdGhhdCB3aWxsIG9ubHkgcnVuIHRoaXMgY29tYmluZVZpZGVvQXVkaW8gaWYgc3RlcCA9PT0gM1xuICAgIGlmIChyZXF1ZXN0LnN0ZXAgPT09IDMpIHtcbiAgICAgIGNvbnN0IGZpbmFsVmlkZW8gPSBhd2FpdCBjb21iaW5lVmlkZW9BbmRBdWRpbyhcbiAgICAgICAgcmVxdWVzdC51c2VySWQsXG4gICAgICAgIHRpbWVzdGFtcCxcbiAgICAgICAgc2NlbmVzLFxuICAgICAgKTtcblxuICAgICAgaWYgKCFmaW5hbFZpZGVvKSB7XG4gICAgICAgIHRocm93IG5ldyBFcnJvcignRmFpbGVkIHRvIGNvbWJpbmUgdmlkZW8sIGF1ZGlvLCBhbmQgc3VidGl0bGVzJyk7XG4gICAgICB9XG5cbiAgICAgIC8vIFN0ZXAgNjogVXBsb2FkIHRvIFMzXG4gICAgICBjb25zdCB2aWRlb0tleSA9IGF3YWl0IHVwbG9hZFRvUzMoZmluYWxWaWRlbywgcmVxdWVzdC51c2VySWQsIHRpbWVzdGFtcCk7XG4gICAgfVxuXG4gICAgLy8gSWYgdGhpcyB3YXMgdHJpZ2dlcmVkIGJ5IFNRUywgZGVsZXRlIHRoZSBtZXNzYWdlIGZyb20gdGhlIHF1ZXVlXG4gICAgaWYgKHJlY29yZCAmJiBwcm9jZXNzLmVudi5WSURFT19RVUVVRV9VUkwpIHtcbiAgICAgIGNvbnN0IGRlbGV0ZUNvbW1hbmQgPSBuZXcgRGVsZXRlTWVzc2FnZUNvbW1hbmQoe1xuICAgICAgICBRdWV1ZVVybDogcHJvY2Vzcy5lbnYuVklERU9fUVVFVUVfVVJMLFxuICAgICAgICBSZWNlaXB0SGFuZGxlOiByZWNvcmQucmVjZWlwdEhhbmRsZSxcbiAgICAgIH0pO1xuICAgICAgYXdhaXQgc3FzLnNlbmQoZGVsZXRlQ29tbWFuZCk7XG4gICAgfVxuXG4gICAgLy8gQnJvYWRjYXN0IHZpZGVvIGdlbmVyYXRpb24gY29tcGxldGVkIGV2ZW50XG4gICAgYXdhaXQgYnJvYWRjYXN0UHJvZ3Jlc3MoXG4gICAgICAndmlkZW9fY29tcGxldGVkJyxcbiAgICAgIHJlcXVlc3QudXNlcklkLFxuICAgICAgdGltZXN0YW1wLFxuICAgICAgbnVsbCxcbiAgICAgICdWaWRlbyBnZW5lcmF0aW9uIGNvbXBsZXRlZCcsXG4gICAgKTtcblxuICAgIHJldHVybiB7XG4gICAgICBtZXNzYWdlOiAnVmlkZW8gZ2VuZXJhdGVkIHN1Y2Nlc3NmdWxseScsXG4gICAgfTtcbiAgfSBjYXRjaCAoZXJyb3IpIHtcbiAgICBjb25zb2xlLmVycm9yKCdFcnJvciBpbiB2aWRlbyBnZW5lcmF0aW9uOicsIGVycm9yKTtcbiAgICB0aHJvdyBlcnJvcjtcbiAgfVxufVxuXG4vLyBIZWxwZXIgZnVuY3Rpb24gdG8gYnJvYWRjYXN0IHZpZGVvIGdlbmVyYXRpb24gcHJvZ3Jlc3MgdmlhIFdlYlNvY2tldFxuYXN5bmMgZnVuY3Rpb24gYnJvYWRjYXN0UHJvZ3Jlc3MoXG4gIGFjdGlvbjpcbiAgICB8ICdzY3JpcHRfY3JlYXRlZCdcbiAgICB8ICdpbWFnZV9jcmVhdGVkJ1xuICAgIHwgJ2F1ZGlvX3N1YnRpdGxlX2NyZWF0ZWQnXG4gICAgfCAndmlkZW9fc2NlbmVfY3JlYXRlZCdcbiAgICB8ICd2aWRlb19jb21wbGV0ZWQnLFxuICB1c2VySWQ6IHN0cmluZyxcbiAgdGltZXN0YW1wOiBzdHJpbmcsXG4gIGRhdGE/OiBhbnksXG4gIG1lc3NhZ2U/OiBzdHJpbmcsXG4pOiBQcm9taXNlPHZvaWQ+IHtcbiAgdHJ5IHtcbiAgICBjb25zdCBwcm9ncmVzc01lc3NhZ2UgPSB7XG4gICAgICBhY3Rpb24sXG4gICAgICBkYXRhOiB7XG4gICAgICAgIHVzZXJJZCxcbiAgICAgICAgdGltZXN0YW1wLFxuICAgICAgICBtZXNzYWdlLFxuICAgICAgICAuLi5kYXRhLFxuICAgICAgfSxcbiAgICB9O1xuXG4gICAgLy8gR2V0IHRoZSBXZWJTb2NrZXQgZG9tYWluIGFuZCBzdGFnZSBmcm9tIGVudmlyb25tZW50IHZhcmlhYmxlc1xuICAgIGNvbnN0IGRvbWFpbk5hbWUgPSBwcm9jZXNzLmVudi5XRUJTT0NLRVRfRE9NQUlOX05BTUU7XG4gICAgY29uc3Qgc3RhZ2UgPSBwcm9jZXNzLmVudi5XRUJTT0NLRVRfU1RBR0UgfHwgJ3Byb2QnO1xuXG4gICAgaWYgKGRvbWFpbk5hbWUpIHtcbiAgICAgIGF3YWl0IGJyb2FkY2FzdE1lc3NhZ2UocHJvZ3Jlc3NNZXNzYWdlLCBkb21haW5OYW1lLCBzdGFnZSwgdXNlcklkKTtcbiAgICAgIGNvbnNvbGUubG9nKGDwn5OhIFdlYlNvY2tldCBwcm9ncmVzcyBicm9hZGNhc3Q6ICR7YWN0aW9ufSAtICR7bWVzc2FnZX1gKTtcbiAgICB9IGVsc2Uge1xuICAgICAgY29uc29sZS5sb2coXG4gICAgICAgIGDwn5OhIFdlYlNvY2tldCBub3QgY29uZmlndXJlZCwgc2tpcHBpbmcgYnJvYWRjYXN0OiAke2FjdGlvbn0gLSAke21lc3NhZ2V9YCxcbiAgICAgICk7XG4gICAgfVxuICB9IGNhdGNoIChlcnJvcikge1xuICAgIGNvbnNvbGUuZXJyb3IoJ0Vycm9yIGJyb2FkY2FzdGluZyB2aWRlbyBwcm9ncmVzczonLCBlcnJvcik7XG4gICAgLy8gRG9uJ3QgdGhyb3cgZXJyb3IgdG8gYXZvaWQgYnJlYWtpbmcgdGhlIG1haW4gcHJvY2Vzc1xuICB9XG59XG4iXX0=