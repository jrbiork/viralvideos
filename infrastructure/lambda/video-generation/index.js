"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.handler = void 0;
exports.broadcastProgress = broadcastProgress;
const client_sqs_1 = require("@aws-sdk/client-sqs");
const image_1 = require("./image");
const audio_1 = require("../utils/audio");
const subtitles_1 = require("../utils/subtitles");
const script_1 = require("../utils/script");
const script_2 = require("../utils/script");
const s3Uploader_1 = require("./util/s3Uploader");
const audioUtils_1 = require("./util/audioUtils");
const imageUtils_1 = require("../utils/imageUtils");
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
            await broadcastProgress('preview_completed', request.userId, request.timestamp, { manifest: manifestHydrated }, 'Video generated successfully');
            return {
                message: 'Video already generated',
                manifest: manifestHydrated,
            };
        }
        else {
            scenes = Array.from({ length: request.sceneCount }, (_, i) => ({
                id: i,
                description: '',
                duration: sceneDuration,
                narration: '',
            }));
            // Create manifest and upload to s3
            await (0, manifestUtils_1.createManifest)(request.userId, timestamp, scenes, request.totalDuration);
            manifest = await (0, manifestUtils_1.getManifest)(request.userId, request.timestamp);
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
            const storyBreakdown = await (0, script_2.generateStoryBreakdown)(request.prompt, request.sceneCount, sceneDuration, request.totalDuration, request.userId, timestamp);
            scenes = storyBreakdown.scenes;
            voiceToneInstruction = storyBreakdown.voiceToneInstruction;
        }
        if (!scenes || scenes.length === 0) {
            console.log('❌ Error: Failed to get or generate story breakdown');
            throw new Error('Failed to get or generate story breakdown');
        }
        console.log('🎥 Manifest created and uploaded:');
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
            const { subtitles } = await (0, audio_1.generateNarration)(scenes, request.userId, timestamp, voiceToneInstruction);
            // Step 4: Generate subtitle file
            await (0, subtitles_1.generateSubtitles)(scenes, request.userId, timestamp, subtitles);
        }
        let manifestHydrated = await (0, manifestUtils_1.hydrateManifest)(manifest);
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
        await (0, videoEffects_1.getVideoEffectUrls)(request.userId, timestamp, scenes);
        console.log('🎬 Video effects URLs generated:');
        console.log('🎬 Manifest preview completed:', JSON.stringify(manifest, null, 2));
        manifestHydrated = await (0, manifestUtils_1.hydrateManifest)(manifest);
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiaW5kZXguanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyJpbmRleC50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiOzs7QUFtVkEsOENBd0NDO0FBeFhELG9EQUFzRTtBQUV0RSxtQ0FBd0M7QUFDeEMsMENBQW1EO0FBQ25ELGtEQUF1RDtBQUN2RCw0Q0FBOEM7QUFDOUMsNENBQWdFO0FBQ2hFLGtEQUFnRTtBQUNoRSxrREFBNEQ7QUFDNUQsb0RBQW1EO0FBQ25ELHNEQUF5RDtBQUN6RCxtREFBdUQ7QUFDdkQsd0RBSThCO0FBQzlCLGdFQUEwRDtBQVcxRCxNQUFNLEdBQUcsR0FBRyxJQUFJLHNCQUFTLENBQUMsRUFBRSxNQUFNLEVBQUUsT0FBTyxDQUFDLEdBQUcsQ0FBQyxVQUFVLElBQUksV0FBVyxFQUFFLENBQUMsQ0FBQztBQUV0RSxNQUFNLE9BQU8sR0FBRyxLQUFLLEVBQUUsS0FBZSxFQUE2QixFQUFFO0lBQzFFLE9BQU8sQ0FBQyxHQUFHLENBQ1QseUVBQXlFLENBQzFFLENBQUM7SUFDRixPQUFPLE1BQU0sY0FBYyxDQUFDLEtBQUssQ0FBQyxDQUFDO0FBQ3JDLENBQUMsQ0FBQztBQUxXLFFBQUEsT0FBTyxXQUtsQjtBQUVGLEtBQUssVUFBVSxjQUFjLENBQUMsS0FBZTtJQUMzQyxNQUFNLGlCQUFpQixHQUFpQyxFQUFFLENBQUM7SUFFM0QsS0FBSyxNQUFNLE1BQU0sSUFBSSxLQUFLLENBQUMsT0FBTyxFQUFFLENBQUM7UUFDbkMsSUFBSSxDQUFDO1lBQ0gseUJBQXlCO1lBQ3pCLE1BQU0sT0FBTyxHQUEyQixJQUFJLENBQUMsS0FBSyxDQUFDLE1BQU0sQ0FBQyxJQUFJLENBQUMsQ0FBQztZQUVoRSxrREFBa0Q7WUFDbEQsTUFBTSxzQkFBc0IsQ0FBQyxPQUFPLEVBQUUsTUFBTSxDQUFDLENBQUM7UUFDaEQsQ0FBQztRQUFDLE9BQU8sS0FBSyxFQUFFLENBQUM7WUFDZixPQUFPLENBQUMsS0FBSyxDQUFDLDRCQUE0QixFQUFFLE1BQU0sQ0FB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QUFFLENBQUM7WUFDZixNQUFNLElBQUEsc0NBQWdCLEVBQUMsZUFBZSxFQUFFLFVBQVUsRUFBRSxLQUFLLEVBQUUsTUFBTSxDQUFDLENBQUM7WUFDbkUsT0FBTyxDQUFDLEdBQUcsQ0FBQyxvQ0FBb0MsTUFBTSxNQUFNLE9BQU8sRUFBRSxDQUFDLENBQUM7UUFDekUsQ0FBQzthQUFNLENBQUM7WUFDTixPQUFPLENBQUMsR0FBRyxDQUNULG9EQUFvRCxNQUFNLE1BQU0sT0FBTyxFQUFFLENBQzFFLENBQUM7UUFDSixDQUFDO0lBQ0gsQ0FBQztJQUFDLE9BQU8sS0FBSyxFQUFFLENBQUM7UUFDZixPQUFPLENBQUMsS0FBSyxDQUFDLG9DQUFvQyxFQUFFLEtBQUssQ0FBQyxDQUFDO1FBQzNELHVEQUF1RDtJQUN6RCxDQUFDO0FBQ0gsQ0FBQyIsInNvdXJjZXNDb250ZW50IjpbIi8vIFVwZGF0ZWQ6IEFkZGVkIGZsdWVudC1mZm1wZWcgZGVwZW5kZW5jeSBzdXBwb3J0XG5pbXBvcnQgeyBTUVNFdmVudCwgU1FTUmVjb3JkLCBTUVNCYXRjaFJlc3BvbnNlIH0gZnJvbSAnYXdzLWxhbWJkYSc7XG5cbmltcG9ydCB7IFNRU0NsaWVudCwgRGVsZXRlTWVzc2FnZUNvbW1hbmQgfSBmcm9tICdAYXdzLXNkay9jbGllbnQtc3FzJztcblxuaW1wb3J0IHsgZ2VuZXJhdGVJbWFnZSB9IGZyb20gJy4vaW1hZ2UnO1xuaW1wb3J0IHsgZ2VuZXJhdGVOYXJyYXRpb24gfSBmcm9tICcuLi91dGlscy9hdWRpbyc7XG5pbXBvcnQgeyBnZW5lcmF0ZVN1YnRpdGxlcyB9IGZyb20gJy4uL3V0aWxzL3N1YnRpdGxlcyc7XG5pbXBvcnQgeyBhZGRTY2VuZUlkcyB9IGZyb20gJy4uL3V0aWxzL3NjcmlwdCc7XG5pbXBvcnQgeyBnZW5lcmF0ZVN0b3J5QnJlYWtkb3duLCBTY2VuZSB9IGZyb20gJy4uL3V0aWxzL3NjcmlwdCc7XG5pbXBvcnQgeyB1cGxvYWRUb1MzLCBnZXRPYmplY3RGcm9tUzMgfSBmcm9tICcuL3V0aWwvczNVcGxvYWRlcic7XG5pbXBvcnQgeyBjaGVja0F1ZGlvQ2FwdGlvbkV4aXN0cyB9IGZyb20gJy4vdXRpbC9hdWRpb1V0aWxzJztcbmltcG9ydCB7IGdldEltYWdlVXJscyB9IGZyb20gJy4uL3V0aWxzL2ltYWdlVXRpbHMnO1xuaW1wb3J0IHsgZ2V0VmlkZW9FZmZlY3RVcmxzIH0gZnJvbSAnLi91dGlsL3ZpZGVvRWZmZWN0cyc7XG5pbXBvcnQgeyBjb21iaW5lVmlkZW9BbmRBdWRpbyB9IGZyb20gJy4vdmlkZW9Db21iaW5lcic7XG5pbXBvcnQge1xuICBjcmVhdGVNYW5pZmVzdCxcbiAgZ2V0TWFuaWZlc3QsXG4gIGh5ZHJhdGVNYW5pZmVzdCxcbn0gZnJvbSAnLi91dGlsL21hbmlmZXN0VXRpbHMnO1xuaW1wb3J0IHsgYnJvYWRjYXN0TWVzc2FnZSB9IGZyb20gJy4uL3dlYnNvY2tldC1icm9hZGNhc3QnO1xuXG5pbnRlcmZhY2UgVmlkZW9HZW5lcmF0aW9uUmVxdWVzdCB7XG4gIHByb21wdD86IHN0cmluZztcbiAgdXNlcklkOiBzdHJpbmc7XG4gIHRpbWVzdGFtcDogc3RyaW5nO1xuICB0b3RhbER1cmF0aW9uOiBudW1iZXI7XG4gIHNjZW5lQ291bnQ6IG51bWJlcjtcbiAgc3RlcDogbnVtYmVyO1xufVxuXG5jb25zdCBzcXMgPSBuZXcgU1FTQ2xpZW50KHsgcmVnaW9uOiBwcm9jZXNzLmVudi5BV1NfUkVHSU9OIHx8ICd1cy1lYXN0LTEnIH0pO1xuXG5leHBvcnQgY29uc3QgaGFuZGxlciA9IGFzeW5jIChldmVudDogU1FTRXZlbnQpOiBQcm9taXNlPFNRU0JhdGNoUmVzcG9uc2U+ID0+IHtcbiAgY29uc29sZS5sb2coXG4gICAgJ/CflIQgVmlkZW8gR2VuZXJhdGlvbiBMYW1iZGEgc3RhcnRlZCAtIFVwZGF0ZWQgd2l0aCBmbHVlbnQtZmZtcGVnIHN1cHBvcnQnLFxuICApO1xuICByZXR1cm4gYXdhaXQgaGFuZGxlU1FTRXZlbnQoZXZlbnQpO1xufTtcblxuYXN5bmMgZnVuY3Rpb24gaGFuZGxlU1FTRXZlbnQoZXZlbnQ6IFNRU0V2ZW50KTogUHJvbWlzZTxTUVNCYXRjaFJlc3BvbnNlPiB7XG4gIGNvbnN0IGJhdGNoSXRlbUZhaWx1cmVzOiB7IGl0ZW1JZGVudGlmaWVyOiBzdHJpbmcgfVtdID0gW107XG5cbiAgZm9yIChjb25zdCByZWNvcmQgb2YgZXZlbnQuUmVjb3Jkcykge1xuICAgIHRyeSB7XG4gICAgICAvLyBQYXJzZSB0aGUgbWVzc2FnZSBib2R5XG4gICAgICBjb25zdCByZXF1ZXN0OiBWaWRlb0dlbmVyYXRpb25SZXF1ZXN0ID0gSlNPTi5wYXJzZShyZWNvcmQuYm9keSk7XG5cbiAgICAgIC8vIFByb2Nlc3MgdGhlIHZpZGVvIGdlbmVyYXRpb24gd2l0aCBvcmRlcmVkIHN0ZXBzXG4gICAgICBhd2FpdCBwcm9jZXNzVmlkZW9HZW5lcmF0aW9uKHJlcXVlc3QsIHJlY29yZCk7XG4gICAgfSBjYXRjaCAoZXJyb3IpIHtcbiAgICAgIGNvbnNvbGUuZXJyb3IoJ+KdjCBFcnJvciBwcm9jZXNzaW5nIHJlY29yZDonLCByZWNvcmQubWVzc2FnZUlkLCBlcnJvcik7XG4gICAgICBiYXRjaEl0ZW1GYWlsdXJlcy5wdXNoKHsgaXRlbUlkZW50aWZpZXI6IHJlY29yZC5tZXNzYWdlSWQgfSk7XG4gICAgfVxuICB9XG5cbiAgcmV0dXJuIHtcbiAgICBiYXRjaEl0ZW1GYWlsdXJlcyxcbiAgfTtcbn1cblxuYXN5bmMgZnVuY3Rpb24gcHJvY2Vzc1ZpZGVvR2VuZXJhdGlvbihcbiAgcmVxdWVzdDogVmlkZW9HZW5lcmF0aW9uUmVxdWVzdCxcbiAgcmVjb3JkPzogU1FTUmVjb3JkLFxuKTogUHJvbWlzZTxhbnk+IHtcbiAgdHJ5IHtcbiAgICBjb25zb2xlLmxvZygncHJvY2Vzc1ZpZGVvR2VuZXJhdGlvbjonLCByZXF1ZXN0KTtcblxuICAgIC8vIFVzZSB0aW1lc3RhbXBcbiAgICBjb25zdCB0aW1lc3RhbXAgPSByZXF1ZXN0LnRpbWVzdGFtcDtcblxuICAgIGNvbnN0IHNjZW5lRHVyYXRpb24gPSBNYXRoLmZsb29yKFxuICAgICAgcmVxdWVzdC50b3RhbER1cmF0aW9uIC8gcmVxdWVzdC5zY2VuZUNvdW50LFxuICAgICk7XG5cbiAgICBsZXQgc2NlbmVzOiBTY2VuZVtdID0gW107XG4gICAgbGV0IHZvaWNlVG9uZUluc3RydWN0aW9uOiBzdHJpbmcgPSAnJztcblxuICAgIC8vIGNoZWNrIGlmIHRoZSB2aWRlbyBpcyBhbHJlYWR5IGdlbmVyYXRlZFxuICAgIGxldCBtYW5pZmVzdCA9IGF3YWl0IGdldE1hbmlmZXN0KHJlcXVlc3QudXNlcklkLCByZXF1ZXN0LnRpbWVzdGFtcCk7XG5cbiAgICBpZiAobWFuaWZlc3QpIHtcbiAgICAgIGNvbnNvbGUubG9nKCfwn46lIFZpZGVvIGFscmVhZHkgZ2VuZXJhdGVkLCBza2lwcGluZyB2aWRlbyBnZW5lcmF0aW9uJyk7XG4gICAgICBjb25zdCBtYW5pZmVzdEh5ZHJhdGVkID0gYXdhaXQgaHlkcmF0ZU1hbmlmZXN0KG1hbmlmZXN0KTtcbiAgICAgIGF3YWl0IGJyb2FkY2FzdFByb2dyZXNzKFxuICAgICAgICAncHJldmlld19jb21wbGV0ZWQnLFxuICAgICAgICByZXF1ZXN0LnVzZXJJZCxcbiAgICAgICAgcmVxdWVzdC50aW1lc3RhbXAsXG4gICAgICAgIHsgbWFuaWZlc3Q6IG1hbmlmZXN0SHlkcmF0ZWQgfSxcbiAgICAgICAgJ1ZpZGVvIGdlbmVyYXRlZCBzdWNjZXNzZnVsbHknLFxuICAgICAgKTtcbiAgICAgIHJldHVybiB7XG4gICAgICAgIG1lc3NhZ2U6ICdWaWRlbyBhbHJlYWR5IGdlbmVyYXRlZCcsXG4gICAgICAgIG1hbmlmZXN0OiBtYW5pZmVzdEh5ZHJhdGVkLFxuICAgICAgfTtcbiAgICB9IGVsc2Uge1xuICAgICAgc2NlbmVzID0gQXJyYXkuZnJvbSh7IGxlbmd0aDogcmVxdWVzdC5zY2VuZUNvdW50IH0sIChfLCBpKSA9PiAoe1xuICAgICAgICBpZDogaSxcbiAgICAgICAgZGVzY3JpcHRpb246ICcnLFxuICAgICAgICBkdXJhdGlvbjogc2NlbmVEdXJhdGlvbixcbiAgICAgICAgbmFycmF0aW9uOiAnJyxcbiAgICAgIH0pKTtcblxuICAgICAgLy8gQ3JlYXRlIG1hbmlmZXN0IGFuZCB1cGxvYWQgdG8gczNcbiAgICAgIGF3YWl0IGNyZWF0ZU1hbmlmZXN0KFxuICAgICAgICByZXF1ZXN0LnVzZXJJZCxcbiAgICAgICAgdGltZXN0YW1wLFxuICAgICAgICBzY2VuZXMsXG4gICAgICAgIHJlcXVlc3QudG90YWxEdXJhdGlvbixcbiAgICAgICk7XG5cbiAgICAgIG1hbmlmZXN0ID0gYXdhaXQgZ2V0TWFuaWZlc3QocmVxdWVzdC51c2VySWQsIHJlcXVlc3QudGltZXN0YW1wKTtcbiAgICB9XG5cbiAgICAvLyBDaGVjayBpZiB0aGVyZSBpcyBhbHJlYWR5IHNjcmlwdCBnZW5lcmF0ZWQgaW4gdGhlIHMzIGJ1Y2tldCBmb3IgdGhlIHRpbWVzdGFtcFxuICAgIGNvbnN0IHNjcmlwdEtleSA9IGAke3JlcXVlc3QudXNlcklkfS8ke3RpbWVzdGFtcH0uc2NyaXB0LnR4dGA7XG4gICAgY29uc3QgZXhpc3RpbmdTY3JpcHQgPSBhd2FpdCBnZXRPYmplY3RGcm9tUzMoc2NyaXB0S2V5KTtcblxuICAgIC8vIFN0ZXAgMTogR2VuZXJhdGUgc2NyaXB0L3N0b3J5IGJyZWFrZG93biB1c2luZyBHUFQtNFxuICAgIGlmIChleGlzdGluZ1NjcmlwdCkge1xuICAgICAgY29uc29sZS5sb2coXG4gICAgICAgICfwn46lIFNjcmlwdCBhbHJlYWR5IGdlbmVyYXRlZCBmb3IgdGhlIHRpbWVzdGFtcCwgdXNpbmcgZXhpc3Rpbmcgc2NyaXB0JyxcbiAgICAgICk7XG4gICAgICBzY2VuZXMgPSBhZGRTY2VuZUlkcyhleGlzdGluZ1NjcmlwdC5zY2VuZXMpO1xuICAgICAgdm9pY2VUb25lSW5zdHJ1Y3Rpb24gPSBleGlzdGluZ1NjcmlwdC52b2ljZVRvbmVJbnN0cnVjdGlvbjtcbiAgICB9IGVsc2Uge1xuICAgICAgY29uc29sZS5sb2coXG4gICAgICAgICfwn46lIE5vIGV4aXN0aW5nIHNjcmlwdCBmb3VuZCwgZ2VuZXJhdGluZyBuZXcgc3RvcnkgYnJlYWtkb3duJyxcbiAgICAgICk7XG5cbiAgICAgIGlmICghcmVxdWVzdC5wcm9tcHQpIHtcbiAgICAgICAgY29uc29sZS5sb2coJ+KdjCBFcnJvcjogTm8gcHJvbXB0IHByb3ZpZGVkJyk7XG4gICAgICAgIHRocm93IG5ldyBFcnJvcignTm8gcHJvbXB0IHByb3ZpZGVkJyk7XG4gICAgICB9XG5cbiAgICAgIGNvbnN0IHN0b3J5QnJlYWtkb3duID0gYXdhaXQgZ2VuZXJhdGVTdG9yeUJyZWFrZG93bihcbiAgICAgICAgcmVxdWVzdC5wcm9tcHQhLFxuICAgICAgICByZXF1ZXN0LnNjZW5lQ291bnQsXG4gICAgICAgIHNjZW5lRHVyYXRpb24sXG4gICAgICAgIHJlcXVlc3QudG90YWxEdXJhdGlvbixcbiAgICAgICAgcmVxdWVzdC51c2VySWQsXG4gICAgICAgIHRpbWVzdGFtcCxcbiAgICAgICk7XG4gICAgICBzY2VuZXMgPSBzdG9yeUJyZWFrZG93bi5zY2VuZXM7XG4gICAgICB2b2ljZVRvbmVJbnN0cnVjdGlvbiA9IHN0b3J5QnJlYWtkb3duLnZvaWNlVG9uZUluc3RydWN0aW9uO1xuICAgIH1cblxuICAgIGlmICghc2NlbmVzIHx8IHNjZW5lcy5sZW5ndGggPT09IDApIHtcbiAgICAgIGNvbnNvbGUubG9nKCfinYwgRXJyb3I6IEZhaWxlZCB0byBnZXQgb3IgZ2VuZXJhdGUgc3RvcnkgYnJlYWtkb3duJyk7XG4gICAgICB0aHJvdyBuZXcgRXJyb3IoJ0ZhaWxlZCB0byBnZXQgb3IgZ2VuZXJhdGUgc3RvcnkgYnJlYWtkb3duJyk7XG4gICAgfVxuXG4gICAgY29uc29sZS5sb2coJ/CfjqUgTWFuaWZlc3QgY3JlYXRlZCBhbmQgdXBsb2FkZWQ6Jyk7XG5cbiAgICBjb25zb2xlLmxvZygn8J+OpSBTdG9yeSBicmVha2Rvd24gZ2VuZXJhdGVkOicsIHNjZW5lcyk7XG5cbiAgICAvLyBTdGVwIDI6IEdlbmVyYXRlIGltYWdlcyBmb3IgZWFjaCBzY2VuZSBpbiBwYXJhbGxlbFxuICAgIC8vIENoZWNrIGlmIHRoZXJlIGFyZSBhbHJlYWR5IGltYWdlcyBnZW5lcmF0ZWQgaW4gdGhlIHMzIGJ1Y2tldCBmb3IgdGhlIHRpbWVzdGFtcFxuICAgIGxldCBpbWFnZVVybHMgPSBhd2FpdCBnZXRJbWFnZVVybHMocmVxdWVzdC51c2VySWQsIHRpbWVzdGFtcCk7XG5cbiAgICBpZiAoaW1hZ2VVcmxzLmxlbmd0aCA+IDApIHtcbiAgICAgIGNvbnNvbGUubG9nKCfwn46lIEltYWdlcyBhbHJlYWR5IGdlbmVyYXRlZCBmb3IgdGhlIHRpbWVzdGFtcDonLCBpbWFnZVVybHMpO1xuICAgIH0gZWxzZSB7XG4gICAgICBjb25zdCBzZWVkID0gTWF0aC5mbG9vcihNYXRoLnJhbmRvbSgpICogMTAwMDAwMCk7XG5cbiAgICAgIGNvbnNvbGUubG9nKCfwn46oIEdlbmVyYXRpbmcgaW1hZ2VzIGZvciBlYWNoIHNjZW5lIGluIHBhcmFsbGVsLi4uJyk7XG5cbiAgICAgIHRyeSB7XG4gICAgICAgIGNvbnN0IGltYWdlUHJvbWlzZXMgPSBzY2VuZXMubWFwKGFzeW5jIChzY2VuZTogYW55LCBpOiBudW1iZXIpID0+IHtcbiAgICAgICAgICBjb25zb2xlLmxvZyhcbiAgICAgICAgICAgIGDwn46oIEdlbmVyYXRpbmcgaW1hZ2UgZm9yIHNjZW5lICR7aSArIDF9OmAsXG4gICAgICAgICAgICBzY2VuZS5kZXNjcmlwdGlvbixcbiAgICAgICAgICApO1xuXG4gICAgICAgICAgY29uc3QgaW1hZ2VVcmwgPSBhd2FpdCBnZW5lcmF0ZUltYWdlKFxuICAgICAgICAgICAgc2NlbmUuZGVzY3JpcHRpb24sXG4gICAgICAgICAgICBpLFxuICAgICAgICAgICAgcmVxdWVzdC51c2VySWQsXG4gICAgICAgICAgICB0aW1lc3RhbXAsXG4gICAgICAgICAgICBzZWVkLFxuICAgICAgICAgICAgc2NlbmUuaWQsXG4gICAgICAgICAgKTtcblxuICAgICAgICAgIGNvbnNvbGUubG9nKGDinIUgU2NlbmUgJHtpICsgMX0gaW1hZ2UgZ2VuZXJhdGVkOmAsIGltYWdlVXJsKTtcbiAgICAgICAgICByZXR1cm4gaW1hZ2VVcmw7XG4gICAgICAgIH0pO1xuXG4gICAgICAgIC8vIFdhaXQgZm9yIGFsbCBpbWFnZXMgdG8gYmUgZ2VuZXJhdGVkXG4gICAgICAgIGNvbnN0IGdlbmVyYXRlZEltYWdlVXJscyA9IGF3YWl0IFByb21pc2UuYWxsKGltYWdlUHJvbWlzZXMpO1xuXG4gICAgICAgIGlmIChnZW5lcmF0ZWRJbWFnZVVybHMubGVuZ3RoID09PSAwKSB7XG4gICAgICAgICAgY29uc29sZS5sb2coJ+KdjCBFcnJvcjogTm8gaW1hZ2VzIHdlcmUgZ2VuZXJhdGVkJyk7XG4gICAgICAgICAgdGhyb3cgbmV3IEVycm9yKCdObyBpbWFnZXMgd2VyZSBnZW5lcmF0ZWQnKTtcbiAgICAgICAgfVxuXG4gICAgICAgIC8vIENvbnZlcnQgZ2VuZXJhdGVkIGltYWdlIFVSTHMgdG8gdGhlIG5ldyBmb3JtYXRcbiAgICAgICAgaW1hZ2VVcmxzID0gZ2VuZXJhdGVkSW1hZ2VVcmxzLm1hcCgoaW1hZ2VVcmwsIGluZGV4KSA9PiB7XG4gICAgICAgICAgY29uc3QgZmlsZW5hbWUgPSBgJHt0aW1lc3RhbXB9LnNjZW5lLSR7c2NlbmVzW2luZGV4XS5pZH0uanBnYDtcbiAgICAgICAgICByZXR1cm4geyBbZmlsZW5hbWVdOiBpbWFnZVVybCB9O1xuICAgICAgICB9KTtcblxuICAgICAgICBjb25zb2xlLmxvZyhcbiAgICAgICAgICBg8J+OpSBHZW5lcmF0ZWQgJHtpbWFnZVVybHMubGVuZ3RofSBpbWFnZXMgaW4gcGFyYWxsZWw6YCxcbiAgICAgICAgICBpbWFnZVVybHMsXG4gICAgICAgICk7XG4gICAgICB9IGNhdGNoIChlcnJvcikge1xuICAgICAgICBjb25zb2xlLmVycm9yKCfinYwgRmFpbGVkIHRvIGdlbmVyYXRlIGltYWdlczonLCBlcnJvcik7XG4gICAgICAgIHRocm93IG5ldyBFcnJvcihgRmFpbGVkIHRvIGdlbmVyYXRlIGltYWdlczogJHtlcnJvcn1gKTtcbiAgICAgIH1cbiAgICB9XG5cbiAgICBjb25zb2xlLmxvZygn8J+WvO+4jyBJbWFnZSBVUkxzIGdlbmVyYXRlZDonLCBpbWFnZVVybHMpO1xuXG4gICAgLy8gY2hlY2sgaWYgYWxsIHRvZ2V0aGVyIGlmIC5tcDMsIC5zdWJ0aXRsZS5qc29uLCAuYXNzIGZpbGVzIGFyZSBhbHJlYWR5IGV4aXN0cyBpbiB0aGUgczMgYnVja2V0IGFuZCByZXR1cm4gYm9vbGVhblxuICAgIGNvbnN0IGF1ZGlvQ2FwdGlvbkZpbGVzRXhpc3QgPSBhd2FpdCBjaGVja0F1ZGlvQ2FwdGlvbkV4aXN0cyhcbiAgICAgIHJlcXVlc3QudXNlcklkLFxuICAgICAgdGltZXN0YW1wLFxuICAgICk7XG4gICAgaWYgKGF1ZGlvQ2FwdGlvbkZpbGVzRXhpc3QpIHtcbiAgICAgIGNvbnNvbGUubG9nKFxuICAgICAgICAn8J+OpSBBdWRpbywgc3VidGl0bGUsIGFuZCBhc3MgZmlsZXMgYWxyZWFkeSBnZW5lcmF0ZWQgZm9yIHRoZSB0aW1lc3RhbXA6JyxcbiAgICAgICAgYXVkaW9DYXB0aW9uRmlsZXNFeGlzdCxcbiAgICAgICk7XG4gICAgfSBlbHNlIHtcbiAgICAgIGNvbnNvbGUubG9nKFxuICAgICAgICAn8J+OpSBObyBleGlzdGluZyBhdWRpbywgc3VidGl0bGUsIGFuZCBhc3MgZmlsZXMgZm91bmQsIGdlbmVyYXRpbmcgbmV3IG5hcnJhdGlvbicsXG4gICAgICApO1xuXG4gICAgICAvLyBTdGVwIDM6IEdlbmVyYXRlIGF1ZGlvIGZpbGVzIHdpdGggd29yZC1sZXZlbCB0aW1lc3RhbXBzXG4gICAgICBjb25zdCB7IHN1YnRpdGxlcyB9ID0gYXdhaXQgZ2VuZXJhdGVOYXJyYXRpb24oXG4gICAgICAgIHNjZW5lcyxcbiAgICAgICAgcmVxdWVzdC51c2VySWQsXG4gICAgICAgIHRpbWVzdGFtcCxcbiAgICAgICAgdm9pY2VUb25lSW5zdHJ1Y3Rpb24sXG4gICAgICApO1xuXG4gICAgICAvLyBTdGVwIDQ6IEdlbmVyYXRlIHN1YnRpdGxlIGZpbGVcbiAgICAgIGF3YWl0IGdlbmVyYXRlU3VidGl0bGVzKHNjZW5lcywgcmVxdWVzdC51c2VySWQsIHRpbWVzdGFtcCwgc3VidGl0bGVzKTtcbiAgICB9XG5cbiAgICBsZXQgbWFuaWZlc3RIeWRyYXRlZCA9IGF3YWl0IGh5ZHJhdGVNYW5pZmVzdChtYW5pZmVzdCk7XG5cbiAgICBhd2FpdCBicm9hZGNhc3RQcm9ncmVzcyhcbiAgICAgICdhdWRpb19zdWJ0aXRsZV9jcmVhdGVkJyxcbiAgICAgIHJlcXVlc3QudXNlcklkLFxuICAgICAgdGltZXN0YW1wLFxuICAgICAge1xuICAgICAgICBtYW5pZmVzdDogbWFuaWZlc3RIeWRyYXRlZCxcbiAgICAgIH0sXG4gICAgICAnQXVkaW8gYW5kIFN1YnRpdGxlcyBjb21wbGV0ZWQnLFxuICAgICk7XG5cbiAgICAvLyBTdGVwIDU6IENoZWNrIGV4aXN0aW5nIHZpZGVvIGlmIG5vdCwgZ2VuZXJhdGUgdmlkZW8gY2xpcHMgZnJvbSBpbWFnZXNcbiAgICAvLyBjb25zb2xlLmxvZygn8J+OpSBHZW5lcmF0aW5nIHZpZGVvIGNsaXBzIGZyb20gaW1hZ2VzLi4uJyk7XG4gICAgLy8gY29uc3QgdmlkZW9DbGlwczogc3RyaW5nW10gPSBbXTtcblxuICAgIC8vIGZvciAobGV0IGkgPSAwOyBpIDwgc2NlbmVzLmxlbmd0aDsgaSsrKSB7XG4gICAgLy8gICBjb25zdCBzY2VuZSA9IHNjZW5lc1tpXTtcbiAgICAvLyAgIGNvbnN0IGltYWdlVXJsID0gaW1hZ2VVcmxzW2ldO1xuICAgIC8vICAgY29uc29sZS5sb2coXG4gICAgLy8gICAgIGDwn46sIEdlbmVyYXRpbmcgdmlkZW8gZm9yIHNjZW5lICR7aSArIDF9IGZyb20gaW1hZ2U6YCxcbiAgICAvLyAgICAgc2NlbmUuZGVzY3JpcHRpb24sXG4gICAgLy8gICApO1xuICAgIC8vICAgdHJ5IHtcbiAgICAvLyAgICAgY29uc3QgdmlkZW9DbGlwID0gYXdhaXQgZ2VuZXJhdGVWaWRlb0NsaXAoXG4gICAgLy8gICAgICAgc2NlbmUuZGVzY3JpcHRpb24sXG4gICAgLy8gICAgICAgc2NlbmUuZHVyYXRpb24sXG4gICAgLy8gICAgICAgaSxcbiAgICAvLyAgICAgICByZXF1ZXN0LnVzZXJJZCxcbiAgICAvLyAgICAgICB0aW1lc3RhbXAsXG4gICAgLy8gICAgICAgc2VlZCxcbiAgICAvLyAgICAgICBzY2VuZS5pZCxcbiAgICAvLyAgICAgICBpbWFnZVVybCxcbiAgICAvLyAgICAgKTtcbiAgICAvLyAgICAgdmlkZW9DbGlwcy5wdXNoKHZpZGVvQ2xpcCk7XG4gICAgLy8gICAgIGNvbnNvbGUubG9nKGDinIUgU2NlbmUgJHtpICsgMX0gdmlkZW8gZ2VuZXJhdGVkOmAsIHZpZGVvQ2xpcCk7XG4gICAgLy8gICB9IGNhdGNoIChlcnJvcikge1xuICAgIC8vICAgICBjb25zb2xlLmVycm9yKGDinYwgRmFpbGVkIHRvIGdlbmVyYXRlIHZpZGVvIGZvciBzY2VuZSAke2kgKyAxfTpgLCBlcnJvcik7XG4gICAgLy8gICAgIHRocm93IG5ldyBFcnJvcihcbiAgICAvLyAgICAgICBgRmFpbGVkIHRvIGdlbmVyYXRlIHZpZGVvIGZvciBzY2VuZSAke2kgKyAxfTogJHtlcnJvcn1gLFxuICAgIC8vICAgICApO1xuICAgIC8vICAgfVxuICAgIC8vIH1cblxuICAgIC8vIGlmICh2aWRlb0NsaXBzLmxlbmd0aCA9PT0gMCkge1xuICAgIC8vICAgY29uc29sZS5sb2coJ+KdjCBFcnJvcjogTm8gdmlkZW8gY2xpcHMgd2VyZSBnZW5lcmF0ZWQnKTtcbiAgICAvLyAgIHRocm93IG5ldyBFcnJvcignTm8gdmlkZW8gY2xpcHMgd2VyZSBnZW5lcmF0ZWQnKTtcbiAgICAvLyB9XG5cbiAgICAvLyBjb25zb2xlLmxvZyhg4pyFIEdlbmVyYXRlZCAke3ZpZGVvQ2xpcHMubGVuZ3RofSB2aWRlbyBjbGlwc2ApO1xuXG4gICAgLy8gU3RlcCA0OiBHZW5lcmF0ZSBjYW1lcmEgbW92ZW1lbnRzIGZyb20gaW1hZ2VcbiAgICAvLyBjaGVjayBpZiB0aGVyZSBhcmUgYWxyZWFkeSBhbGwgdGhlIHZpZGVvIGVmZmVjdHMgZ2VuZXJhdGVkIGluIHRoZSBzMyBidWNrZXQgZm9yIHRoZSB0aW1lc3RhbXBcbiAgICBhd2FpdCBnZXRWaWRlb0VmZmVjdFVybHMocmVxdWVzdC51c2VySWQsIHRpbWVzdGFtcCwgc2NlbmVzKTtcblxuICAgIGNvbnNvbGUubG9nKCfwn46sIFZpZGVvIGVmZmVjdHMgVVJMcyBnZW5lcmF0ZWQ6Jyk7XG4gICAgY29uc29sZS5sb2coXG4gICAgICAn8J+OrCBNYW5pZmVzdCBwcmV2aWV3IGNvbXBsZXRlZDonLFxuICAgICAgSlNPTi5zdHJpbmdpZnkobWFuaWZlc3QsIG51bGwsIDIpLFxuICAgICk7XG5cbiAgICBtYW5pZmVzdEh5ZHJhdGVkID0gYXdhaXQgaHlkcmF0ZU1hbmlmZXN0KG1hbmlmZXN0KTtcblxuICAgIGF3YWl0IGJyb2FkY2FzdFByb2dyZXNzKFxuICAgICAgJ3ByZXZpZXdfY29tcGxldGVkJyxcbiAgICAgIHJlcXVlc3QudXNlcklkLFxuICAgICAgdGltZXN0YW1wLFxuICAgICAgeyBtYW5pZmVzdDogbWFuaWZlc3RIeWRyYXRlZCB9LFxuICAgICAgJ1ZpZGVvIGdlbmVyYXRlZCBzdWNjZXNzZnVsbHknLFxuICAgICk7XG5cbiAgICAvLyBTdGVwIDY6IENvbWJpbmUgdmlkZW8gcGFydHMgYW5kIHVwbG9hZCB0byBzM1xuICAgIGNvbnN0IGZpbmFsVmlkZW9VcmwgPSBhd2FpdCBjb21iaW5lVmlkZW9BbmRBdWRpbyhcbiAgICAgIHJlcXVlc3QudXNlcklkLFxuICAgICAgdGltZXN0YW1wLFxuICAgICAgc2NlbmVzLFxuICAgICk7XG5cbiAgICBjb25zb2xlLmxvZygn8J+OrCBWaWRlbyBjb21iaW5lZCBjb21wbGV0ZWQnLCBmaW5hbFZpZGVvVXJsKTtcblxuICAgIC8vIElmIHRoaXMgd2FzIHRyaWdnZXJlZCBieSBTUVMsIGRlbGV0ZSB0aGUgbWVzc2FnZSBmcm9tIHRoZSBxdWV1ZVxuICAgIGlmIChyZWNvcmQgJiYgcHJvY2Vzcy5lbnYuVklERU9fUVVFVUVfVVJMKSB7XG4gICAgICBjb25zdCBkZWxldGVDb21tYW5kID0gbmV3IERlbGV0ZU1lc3NhZ2VDb21tYW5kKHtcbiAgICAgICAgUXVldWVVcmw6IHByb2Nlc3MuZW52LlZJREVPX1FVRVVFX1VSTCxcbiAgICAgICAgUmVjZWlwdEhhbmRsZTogcmVjb3JkLnJlY2VpcHRIYW5kbGUsXG4gICAgICB9KTtcbiAgICAgIGF3YWl0IHNxcy5zZW5kKGRlbGV0ZUNvbW1hbmQpO1xuICAgIH1cblxuICAgIHJldHVybiB7XG4gICAgICBtZXNzYWdlOiAnVmlkZW8gZ2VuZXJhdGVkIHN1Y2Nlc3NmdWxseScsXG4gICAgfTtcbiAgfSBjYXRjaCAoZXJyb3IpIHtcbiAgICBjb25zb2xlLmVycm9yKCdFcnJvciBpbiB2aWRlbyBnZW5lcmF0aW9uOicsIGVycm9yKTtcbiAgICB0aHJvdyBlcnJvcjtcbiAgfVxufVxuXG4vLyBIZWxwZXIgZnVuY3Rpb24gdG8gYnJvYWRjYXN0IHZpZGVvIGdlbmVyYXRpb24gcHJvZ3Jlc3MgdmlhIFdlYlNvY2tldFxuZXhwb3J0IGFzeW5jIGZ1bmN0aW9uIGJyb2FkY2FzdFByb2dyZXNzKFxuICBhY3Rpb246XG4gICAgfCAnc2NyaXB0X2NyZWF0ZWQnXG4gICAgfCAnaW1hZ2VfY3JlYXRlZCdcbiAgICB8ICdhdWRpb19zdWJ0aXRsZV9jcmVhdGVkJ1xuICAgIHwgJ3ZpZGVvX3NjZW5lX2NyZWF0ZWQnXG4gICAgfCAncHJldmlld19jb21wbGV0ZWQnXG4gICAgfCAndmlkZW9fY29tcGxldGVkJyxcbiAgdXNlcklkOiBzdHJpbmcsXG4gIHRpbWVzdGFtcDogc3RyaW5nLFxuICBkYXRhPzogYW55LFxuICBtZXNzYWdlPzogc3RyaW5nLFxuKTogUHJvbWlzZTx2b2lkPiB7XG4gIHRyeSB7XG4gICAgY29uc3QgcHJvZ3Jlc3NNZXNzYWdlID0ge1xuICAgICAgYWN0aW9uLFxuICAgICAgZGF0YToge1xuICAgICAgICB1c2VySWQsXG4gICAgICAgIHRpbWVzdGFtcCxcbiAgICAgICAgbWVzc2FnZSxcbiAgICAgICAgLi4uZGF0YSxcbiAgICAgIH0sXG4gICAgfTtcblxuICAgIC8vIEdldCB0aGUgV2ViU29ja2V0IGRvbWFpbiBhbmQgc3RhZ2UgZnJvbSBlbnZpcm9ubWVudCB2YXJpYWJsZXNcbiAgICBjb25zdCBkb21haW5OYW1lID0gcHJvY2Vzcy5lbnYuV0VCU09DS0VUX0RPTUFJTl9OQU1FO1xuICAgIGNvbnN0IHN0YWdlID0gcHJvY2Vzcy5lbnYuV0VCU09DS0VUX1NUQUdFIHx8ICdwcm9kJztcblxuICAgIGlmIChkb21haW5OYW1lKSB7XG4gICAgICBhd2FpdCBicm9hZGNhc3RNZXNzYWdlKHByb2dyZXNzTWVzc2FnZSwgZG9tYWluTmFtZSwgc3RhZ2UsIHVzZXJJZCk7XG4gICAgICBjb25zb2xlLmxvZyhg8J+ToSBXZWJTb2NrZXQgcHJvZ3Jlc3MgYnJvYWRjYXN0OiAke2FjdGlvbn0gLSAke21lc3NhZ2V9YCk7XG4gICAgfSBlbHNlIHtcbiAgICAgIGNvbnNvbGUubG9nKFxuICAgICAgICBg8J+ToSBXZWJTb2NrZXQgbm90IGNvbmZpZ3VyZWQsIHNraXBwaW5nIGJyb2FkY2FzdDogJHthY3Rpb259IC0gJHttZXNzYWdlfWAsXG4gICAgICApO1xuICAgIH1cbiAgfSBjYXRjaCAoZXJyb3IpIHtcbiAgICBjb25zb2xlLmVycm9yKCdFcnJvciBicm9hZGNhc3RpbmcgdmlkZW8gcHJvZ3Jlc3M6JywgZXJyb3IpO1xuICAgIC8vIERvbid0IHRocm93IGVycm9yIHRvIGF2b2lkIGJyZWFraW5nIHRoZSBtYWluIHByb2Nlc3NcbiAgfVxufVxuIl19