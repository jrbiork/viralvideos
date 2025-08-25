"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.generateImage = generateImage;
const client_s3_1 = require("@aws-sdk/client-s3");
const axios_1 = require("axios");
const sdk_1 = require("@runwayml/sdk");
const s3 = new client_s3_1.S3Client({ region: process.env.AWS_REGION });
async function generateImage(description, sceneIndex, userId, timestamp, seed, sceneId) {
    try {
        // Initialize Runway SDK
        const runway = new sdk_1.RunwayML({
            apiKey: process.env.RUNWAY_API_KEY,
        });
        console.log(`🎨 Calling Runway SDK for image generation in scene ${sceneIndex}...`);
        console.log('📤 Runway SDK request parameters:');
        console.log('- Text-to-image model: gen4_image');
        console.log('- Prompt:', description);
        console.log('- Aspect ratio: 9:16 (vertical)');
        // Generate an image from text using text-to-image API
        console.log('🎨 Generating image from text...');
        // Retry logic for image generation
        let imageResult;
        let imageRetryCount = 0;
        const maxImageRetries = 5;
        while (imageRetryCount < maxImageRetries) {
            try {
                console.log(`🎨 Image generation attempt ${imageRetryCount + 1}/${maxImageRetries} with seed: ${seed}`);
                imageResult = await runway.textToImage
                    .create({
                    model: 'gen4_image',
                    promptText: `${description} - no text overlays, no graphics, no logos, no watermarks, clean visual content only`,
                    ratio: '720:1280', // Vertical format (9:16)
                    seed: seed,
                })
                    .waitForTaskOutput();
                console.log('📡 Text-to-image generation completed');
                console.log('🆔 Image Generation ID:', imageResult.id);
                console.log('✅ Image generation completed');
                console.log('📄 Image result:', imageResult);
                // If we get here, the generation was successful
                break;
            }
            catch (error) {
                imageRetryCount++;
                console.error(`❌ Image generation attempt ${imageRetryCount} failed:`, error);
                // Check if it's the specific error we're seeing
                if (error && typeof error === 'object' && 'taskDetails' in error) {
                    const taskDetails = error.taskDetails;
                    console.error('Task details:', taskDetails);
                    if (taskDetails?.failureCode === 'INTERNAL.BAD_OUTPUT.CODE01') {
                        console.log(`🔄 Retrying image generation due to INTERNAL.BAD_OUTPUT.CODE01 error (attempt ${imageRetryCount}/${maxImageRetries})`);
                        if (imageRetryCount < maxImageRetries) {
                            // Wait before retrying (exponential backoff)
                            const waitTime = Math.min(1000 * Math.pow(2, imageRetryCount - 1), 5000);
                            console.log(`⏳ Waiting ${waitTime}ms before retry...`);
                            await new Promise((resolve) => setTimeout(resolve, waitTime));
                            continue;
                        }
                    }
                }
                // If we've exhausted retries or it's not the specific error, throw
                if (imageRetryCount >= maxImageRetries) {
                    console.error(`❌ All ${maxImageRetries} image generation attempts failed for scene ${sceneIndex}`);
                    throw error;
                }
            }
        }
        if (!imageResult ||
            !imageResult.output ||
            imageResult.output.length === 0) {
            console.log('❌ Error: Runway SDK did not return an image URL');
            console.log('Full image result:', imageResult);
            throw new Error('Runway SDK did not return an image URL');
        }
        // Access the output property which should contain the images
        const imageUrl = imageResult.output[0];
        console.log('imageResult.output:', imageResult.output);
        console.log('🖼️ Generated image URL:', imageUrl);
        // Save image to S3 for debugging purposes
        console.log('💾 Saving image to S3 for debugging...');
        try {
            const imageBuffer = await downloadImage(imageUrl);
            const imageKey = `${userId}/${timestamp}.scene-${sceneId !== undefined ? sceneId : sceneIndex}.jpg`;
            console.log(`☁️ Uploading image to S3: ${process.env.VIDEO_PARTS_BUCKET_NAME}/${imageKey}`);
            await s3.send(new client_s3_1.PutObjectCommand({
                Bucket: process.env.VIDEO_PARTS_BUCKET_NAME,
                Key: imageKey,
                Body: imageBuffer,
                ContentType: 'image/jpeg',
            }));
            console.log(`✅ Uploaded image to S3: ${imageKey}`);
        }
        catch (error) {
            console.error('❌ Error saving image to S3:', error);
            // Don't throw here - we want to continue with video generation even if image saving fails
        }
        return imageUrl;
    }
    catch (error) {
        console.error(`❌ Error in generateImage for scene ${sceneIndex}:`, error);
        if (error && typeof error === 'object' && 'message' in error) {
            console.error('Error message:', error.message);
            console.error('Error name:', error.name);
            console.error('Error stack:', error.stack);
        }
        throw error;
    }
}
async function downloadImage(url) {
    console.log(`📥 Downloading image from: ${url}`);
    try {
        const response = await axios_1.default.get(url, { responseType: 'arraybuffer' });
        console.log(`✅ Downloaded image, status: ${response.status}`);
        return Buffer.from(response.data);
    }
    catch (error) {
        console.error('❌ Error downloading image:', error);
        throw error;
    }
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiaW1hZ2UuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyJpbWFnZS50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiOztBQWFBLHNDQStJQztBQTVKRCxrREFBZ0U7QUFDaEUsaUNBQTBCO0FBQzFCLHVDQUF5QztBQUV6QyxNQUFNLEVBQUUsR0FBRyxJQUFJLG9CQUFRLENBQUMsRUFBRSxNQUFNLEVBQUUsT0FBTyxDQUFDLEdBQUcsQ0FBQyxVQUFVLEVBQUUsQ0FBQyxDQUFDO0FBU3JELEtBQUssVUFBVSxhQUFhLENBQ2pDLFdBQW1CLEVBQ25CLFVBQWtCLEVBQ2xCLE1BQWMsRUFDZCxTQUFpQixFQUNqQixJQUFZLEVBQ1osT0FBZ0I7SUFFaEIsSUFBSSxDQUFDO1FBQ0gsd0JBQXdCO1FBQ3hCLE1BQU0sTUFBTSxHQUFHLElBQUksY0FBUSxDQUFDO1lBQzFCLE1BQU0sRUFBRSxPQUFPLENBQUMsR0FBRyxDQUFDLGNBQWU7U0FDcEMsQ0FBQyxDQUFDO1FBRUgsT0FBTyxDQUFDLEdBQUcsQ0FDVCx1REFBdUQsVUFBVSxLQUFLLENBQ3ZFLENBQUM7UUFDRixPQUFPLENBQUMsR0FBRyxDQUFDLG1DQUFtQyxDQUFDLENBQUM7UUFDakQsT0FBTyxDQUFDLEdBQUcsQ0FBQyxtQ0FBbUMsQ0FBQyxDQUFDO1FBQ2pELE9BQU8sQ0FBQyxHQUFHLENBQUMsV0FBVyxFQUFFLFdBQVcsQ0FBQyxDQUFDO1FBQ3RDLE9BQU8sQ0FBQyxHQUFHLENBQUMsaUNBQWlDLENBQUMsQ0FBQztRQUUvQyxzREFBc0Q7UUFDdEQsT0FBTyxDQUFDLEdBQUcsQ0FBQyxrQ0FBa0MsQ0FBQyxDQUFDO1FBRWhELG1DQUFtQztRQUNuQyxJQUFJLFdBQVcsQ0FBQztRQUNoQixJQUFJLGVBQWUsR0FBRyxDQUFDLENBQUM7UUFDeEIsTUFBTSxlQUFlLEdBQUcsQ0FBQyxDQUFDO1FBRTFCLE9BQU8sZUFBZSxHQUFHLGVBQWUsRUFBRSxDQUFDO1lBQ3pDLElBQUksQ0FBQztnQkFDSCxPQUFPLENBQUMsR0FBRyxDQUNULCtCQUNFLGVBQWUsR0FBRyxDQUNwQixJQUFJLGVBQWUsZUFBZSxJQUFJLEVBQUUsQ0FDekMsQ0FBQztnQkFFRixXQUFXLEdBQUcsTUFBTSxNQUFNLENBQUMsV0FBVztxQkFDbkMsTUFBTSxDQUFDO29CQUNOLEtBQUssRUFBRSxZQUFZO29CQUNuQixVQUFVLEVBQUUsR0FBRyxXQUFXLHNGQUFzRjtvQkFDaEgsS0FBSyxFQUFFLFVBQVUsRUFBRSx5QkFBeUI7b0JBQzVDLElBQUksRUFBRSxJQUFJO2lCQUNYLENBQUM7cUJBQ0QsaUJBQWlCLEVBQUUsQ0FBQztnQkFFdkIsT0FBTyxDQUFDLEdBQUcsQ0FBQyx1Q0FBdUMsQ0FBQyxDQUFDO2dCQUNyRCxPQUFPLENBQUMsR0FBRyxDQUFDLHlCQUF5QixFQUFFLFdBQVcsQ0FBQyxFQUFFLENBQUMsQ0FBQztnQkFDdkQsT0FBTyxDQUFDLEdBQUcsQ0FBQyw4QkFBOEIsQ0FBQyxDQUFDO2dCQUM1QyxPQUFPLENBQUMsR0FBRyxDQUFDLGtCQUFrQixFQUFFLFdBQVcsQ0FBQyxDQUFDO2dCQUU3QyxnREFBZ0Q7Z0JBQ2hELE1BQU07WUFDUixDQUFDO1lBQUMsT0FBTyxLQUFLLEVBQUUsQ0FBQztnQkFDZixlQUFlLEVBQUUsQ0FBQztnQkFDbEIsT0FBTyxDQUFDLEtBQUssQ0FDWCw4QkFBOEIsZUFBZSxVQUFVLEVBQ3ZELEtBQUssQ0FDTixDQUFDO2dCQUVGLGdEQUFnRDtnQkFDaEQsSUFBSSxLQUFLLElBQUksT0FBTyxLQUFLLEtBQUssUUFBUSxJQUFJLGFBQWEsSUFBSSxLQUFLLEVBQUUsQ0FBQztvQkFDakUsTUFBTSxXQUFXLEdBQUksS0FBYSxDQUFDLFdBQVcsQ0FBQztvQkFDL0MsT0FBTyxDQUFDLEtBQUssQ0FBQyxlQUFlLEVBQUUsV0FBVyxDQUFDLENBQUM7b0JBRTVDLElBQUksV0FBVyxFQUFFLFdBQVcsS0FBSyw0QkFBNEIsRUFBRSxDQUFDO3dCQUM5RCxPQUFPLENBQUMsR0FBRyxDQUNULGlGQUFpRixlQUFlLElBQUksZUFBZSxHQUFHLENBQ3ZILENBQUM7d0JBQ0YsSUFBSSxlQUFlLEdBQUcsZUFBZSxFQUFFLENBQUM7NEJBQ3RDLDZDQUE2Qzs0QkFDN0MsTUFBTSxRQUFRLEdBQUcsSUFBSSxDQUFDLEdBQUcsQ0FDdkIsSUFBSSxHQUFHLElBQUksQ0FBQyxHQUFHLENBQUMsQ0FBQyxFQUFFLGVBQWUsR0FBRyxDQUFDLENBQUMsRUFDdkMsSUFBSSxDQUNMLENBQUM7NEJBQ0YsT0FBTyxDQUFDLEdBQUcsQ0FBQyxhQUFhLFFBQVEsb0JBQW9CLENBQUMsQ0FBQzs0QkFDdkQsTUFBTSxJQUFJLE9BQU8sQ0FBQyxDQUFDLE9BQU8sRUFBRSxFQUFFLENBQUMsVUFBVSxDQUFDLE9BQU8sRUFBRSxRQUFRLENBQUMsQ0FBQyxDQUFDOzRCQUM5RCxTQUFTO3dCQUNYLENBQUM7b0JBQ0gsQ0FBQztnQkFDSCxDQUFDO2dCQUVELG1FQUFtRTtnQkFDbkUsSUFBSSxlQUFlLElBQUksZUFBZSxFQUFFLENBQUM7b0JBQ3ZDLE9BQU8sQ0FBQyxLQUFLLENBQ1gsU0FBUyxlQUFlLCtDQUErQyxVQUFVLEVBQUUsQ0FDcEYsQ0FBQztvQkFDRixNQUFNLEtBQUssQ0FBQztnQkFDZCxDQUFDO1lBQ0gsQ0FBQztRQUNILENBQUM7UUFFRCxJQUNFLENBQUMsV0FBVztZQUNaLENBQUMsV0FBVyxDQUFDLE1BQU07WUFDbkIsV0FBVyxDQUFDLE1BQU0sQ0FBQyxNQUFNLEtBQUssQ0FBQyxFQUMvQixDQUFDO1lBQ0QsT0FBTyxDQUFDLEdBQUcsQ0FBQyxpREFBaUQsQ0FBQyxDQUFDO1lBQy9ELE9BQU8sQ0FBQyxHQUFHLENBQUMsb0JBQW9CLEVBQUUsV0FBVyxDQUFDLENBQUM7WUFDL0MsTUFBTSxJQUFJLEtBQUssQ0FBQyx3Q0FBd0MsQ0FBQyxDQUFDO1FBQzVELENBQUM7UUFFRCw2REFBNkQ7UUFDN0QsTUFBTSxRQUFRLEdBQUcsV0FBVyxDQUFDLE1BQU0sQ0FBQyxDQUFDLENBQUMsQ0FBQztRQUN2QyxPQUFPLENBQUMsR0FBRyxDQUFDLHFCQUFxQixFQUFFLFdBQVcsQ0FBQyxNQUFNLENBQUMsQ0FBQztRQUN2RCxPQUFPLENBQUMsR0FBRyxDQUFDLDBCQUEwQixFQUFFLFFBQVEsQ0FBQyxDQUFDO1FBRWxELDBDQUEwQztRQUMxQyxPQUFPLENBQUMsR0FBRyxDQUFDLHdDQUF3QyxDQUFDLENBQUM7UUFDdEQsSUFBSSxDQUFDO1lBQ0gsTUFBTSxXQUFXLEdBQUcsTUFBTSxhQUFhLENBQUMsUUFBUSxDQUFDLENBQUM7WUFDbEQsTUFBTSxRQUFRLEdBQUcsR0FBRyxNQUFNLElBQUksU0FBUyxVQUNyQyxPQUFPLEtBQUssU0FBUyxDQUFDLENBQUMsQ0FBQyxPQUFPLENBQUMsQ0FBQyxDQUFDLFVBQ3BDLE1BQU0sQ0FBQztZQUNQLE9BQU8sQ0FBQyxHQUFHLENBQ1QsNkJBQTZCLE9BQU8sQ0FBQyxHQUFHLENBQUMsdUJBQXVCLElBQUksUUFBUSxFQUFFLENBQy9FLENBQUM7WUFFRixNQUFNLEVBQUUsQ0FBQyxJQUFJLENBQ1gsSUFBSSw0QkFBZ0IsQ0FBQztnQkFDbkIsTUFBTSxFQUFFLE9BQU8sQ0FBQyxHQUFHLENBQUMsdUJBQXVCO2dCQUMzQyxHQUFHLEVBQUUsUUFBUTtnQkFDYixJQUFJLEVBQUUsV0FBVztnQkFDakIsV0FBVyxFQUFFLFlBQVk7YUFDMUIsQ0FBQyxDQUNILENBQUM7WUFDRixPQUFPLENBQUMsR0FBRyxDQUFDLDJCQUEyQixRQUFRLEVBQUUsQ0FBQyxDQUFDO1FBQ3JELENBQUM7UUFBQyxPQUFPLEtBQUssRUFBRSxDQUFDO1lBQ2YsT0FBTyxDQUFDLEtBQUssQ0FBQyw2QkFBNkIsRUFBRSxLQUFLLENBQUMsQ0FBQztZQUNwRCwwRkFBMEY7UUFDNUYsQ0FBQztRQUVELE9BQU8sUUFBUSxDQUFDO0lBQ2xCLENBQUM7SUFBQyxPQUFPLEtBQUssRUFBRSxDQUFDO1FBQ2YsT0FBTyxDQUFDLEtBQUssQ0FBQyxzQ0FBc0MsVUFBVSxHQUFHLEVBQUUsS0FBSyxDQUFDLENBQUM7UUFDMUUsSUFBSSxLQUFLLElBQUksT0FBTyxLQUFLLEtBQUssUUFBUSxJQUFJLFNBQVMsSUFBSSxLQUFLLEVBQUUsQ0FBQztZQUM3RCxPQUFPLENBQUMsS0FBSyxDQUFDLGdCQUFnQixFQUFFLEtBQUssQ0FBQyxPQUFPLENBQUMsQ0FBQztZQUMvQyxPQUFPLENBQUMsS0FBSyxDQUFDLGFBQWEsRUFBRyxLQUFhLENBQUMsSUFBSSxDQUFDLENBQUM7WUFDbEQsT0FBTyxDQUFDLEtBQUssQ0FBQyxjQUFjLEVBQUcsS0FBYSxDQUFDLEtBQUssQ0FBQyxDQUFDO1FBQ3RELENBQUM7UUFDRCxNQUFNLEtBQUssQ0FBQztJQUNkLENBQUM7QUFDSCxDQUFDO0FBRUQsS0FBSyxVQUFVLGFBQWEsQ0FBQyxHQUFXO0lBQ3RDLE9BQU8sQ0FBQyxHQUFHLENBQUMsOEJBQThCLEdBQUcsRUFBRSxDQUFDLENBQUM7SUFDakQsSUFBSSxDQUFDO1FBQ0gsTUFBTSxRQUFRLEdBQUcsTUFBTSxlQUFLLENBQUMsR0FBRyxDQUFDLEdBQUcsRUFBRSxFQUFFLFlBQVksRUFBRSxhQUFhLEVBQUUsQ0FBQyxDQUFDO1FBQ3ZFLE9BQU8sQ0FBQyxHQUFHLENBQUMsK0JBQStCLFFBQVEsQ0FBQyxNQUFNLEVBQUUsQ0FBQyxDQUFDO1FBQzlELE9BQU8sTUFBTSxDQUFDLElBQUksQ0FBQyxRQUFRLENBQUMsSUFBSSxDQUFDLENBQUM7SUFDcEMsQ0FBQztJQUFDLE9BQU8sS0FBSyxFQUFFLENBQUM7UUFDZixPQUFPLENBQUMsS0FBSyxDQUFDLDRCQUE0QixFQUFFLEtBQUssQ0FBQyxDQUFDO1FBQ25ELE1BQU0sS0FBSyxDQUFDO0lBQ2QsQ0FBQztBQUNILENBQUMiLCJzb3VyY2VzQ29udGVudCI6WyJpbXBvcnQgeyBTM0NsaWVudCwgUHV0T2JqZWN0Q29tbWFuZCB9IGZyb20gJ0Bhd3Mtc2RrL2NsaWVudC1zMyc7XG5pbXBvcnQgYXhpb3MgZnJvbSAnYXhpb3MnO1xuaW1wb3J0IHsgUnVud2F5TUwgfSBmcm9tICdAcnVud2F5bWwvc2RrJztcblxuY29uc3QgczMgPSBuZXcgUzNDbGllbnQoeyByZWdpb246IHByb2Nlc3MuZW52LkFXU19SRUdJT04gfSk7XG5cbmV4cG9ydCBpbnRlcmZhY2UgU2NlbmUge1xuICBkZXNjcmlwdGlvbjogc3RyaW5nO1xuICBkdXJhdGlvbjogbnVtYmVyO1xuICBuYXJyYXRpb246IHN0cmluZztcbiAgaWQ6IG51bWJlcjtcbn1cblxuZXhwb3J0IGFzeW5jIGZ1bmN0aW9uIGdlbmVyYXRlSW1hZ2UoXG4gIGRlc2NyaXB0aW9uOiBzdHJpbmcsXG4gIHNjZW5lSW5kZXg6IG51bWJlcixcbiAgdXNlcklkOiBzdHJpbmcsXG4gIHRpbWVzdGFtcDogc3RyaW5nLFxuICBzZWVkOiBudW1iZXIsXG4gIHNjZW5lSWQ/OiBudW1iZXIsXG4pOiBQcm9taXNlPHN0cmluZz4ge1xuICB0cnkge1xuICAgIC8vIEluaXRpYWxpemUgUnVud2F5IFNES1xuICAgIGNvbnN0IHJ1bndheSA9IG5ldyBSdW53YXlNTCh7XG4gICAgICBhcGlLZXk6IHByb2Nlc3MuZW52LlJVTldBWV9BUElfS0VZISxcbiAgICB9KTtcblxuICAgIGNvbnNvbGUubG9nKFxuICAgICAgYPCfjqggQ2FsbGluZyBSdW53YXkgU0RLIGZvciBpbWFnZSBnZW5lcmF0aW9uIGluIHNjZW5lICR7c2NlbmVJbmRleH0uLi5gLFxuICAgICk7XG4gICAgY29uc29sZS5sb2coJ/Cfk6QgUnVud2F5IFNESyByZXF1ZXN0IHBhcmFtZXRlcnM6Jyk7XG4gICAgY29uc29sZS5sb2coJy0gVGV4dC10by1pbWFnZSBtb2RlbDogZ2VuNF9pbWFnZScpO1xuICAgIGNvbnNvbGUubG9nKCctIFByb21wdDonLCBkZXNjcmlwdGlvbik7XG4gICAgY29uc29sZS5sb2coJy0gQXNwZWN0IHJhdGlvOiA5OjE2ICh2ZXJ0aWNhbCknKTtcblxuICAgIC8vIEdlbmVyYXRlIGFuIGltYWdlIGZyb20gdGV4dCB1c2luZyB0ZXh0LXRvLWltYWdlIEFQSVxuICAgIGNvbnNvbGUubG9nKCfwn46oIEdlbmVyYXRpbmcgaW1hZ2UgZnJvbSB0ZXh0Li4uJyk7XG5cbiAgICAvLyBSZXRyeSBsb2dpYyBmb3IgaW1hZ2UgZ2VuZXJhdGlvblxuICAgIGxldCBpbWFnZVJlc3VsdDtcbiAgICBsZXQgaW1hZ2VSZXRyeUNvdW50ID0gMDtcbiAgICBjb25zdCBtYXhJbWFnZVJldHJpZXMgPSA1O1xuXG4gICAgd2hpbGUgKGltYWdlUmV0cnlDb3VudCA8IG1heEltYWdlUmV0cmllcykge1xuICAgICAgdHJ5IHtcbiAgICAgICAgY29uc29sZS5sb2coXG4gICAgICAgICAgYPCfjqggSW1hZ2UgZ2VuZXJhdGlvbiBhdHRlbXB0ICR7XG4gICAgICAgICAgICBpbWFnZVJldHJ5Q291bnQgKyAxXG4gICAgICAgICAgfS8ke21heEltYWdlUmV0cmllc30gd2l0aCBzZWVkOiAke3NlZWR9YCxcbiAgICAgICAgKTtcblxuICAgICAgICBpbWFnZVJlc3VsdCA9IGF3YWl0IHJ1bndheS50ZXh0VG9JbWFnZVxuICAgICAgICAgIC5jcmVhdGUoe1xuICAgICAgICAgICAgbW9kZWw6ICdnZW40X2ltYWdlJyxcbiAgICAgICAgICAgIHByb21wdFRleHQ6IGAke2Rlc2NyaXB0aW9ufSAtIG5vIHRleHQgb3ZlcmxheXMsIG5vIGdyYXBoaWNzLCBubyBsb2dvcywgbm8gd2F0ZXJtYXJrcywgY2xlYW4gdmlzdWFsIGNvbnRlbnQgb25seWAsXG4gICAgICAgICAgICByYXRpbzogJzcyMDoxMjgwJywgLy8gVmVydGljYWwgZm9ybWF0ICg5OjE2KVxuICAgICAgICAgICAgc2VlZDogc2VlZCxcbiAgICAgICAgICB9KVxuICAgICAgICAgIC53YWl0Rm9yVGFza091dHB1dCgpO1xuXG4gICAgICAgIGNvbnNvbGUubG9nKCfwn5OhIFRleHQtdG8taW1hZ2UgZ2VuZXJhdGlvbiBjb21wbGV0ZWQnKTtcbiAgICAgICAgY29uc29sZS5sb2coJ/CfhpQgSW1hZ2UgR2VuZXJhdGlvbiBJRDonLCBpbWFnZVJlc3VsdC5pZCk7XG4gICAgICAgIGNvbnNvbGUubG9nKCfinIUgSW1hZ2UgZ2VuZXJhdGlvbiBjb21wbGV0ZWQnKTtcbiAgICAgICAgY29uc29sZS5sb2coJ/Cfk4QgSW1hZ2UgcmVzdWx0OicsIGltYWdlUmVzdWx0KTtcblxuICAgICAgICAvLyBJZiB3ZSBnZXQgaGVyZSwgdGhlIGdlbmVyYXRpb24gd2FzIHN1Y2Nlc3NmdWxcbiAgICAgICAgYnJlYWs7XG4gICAgICB9IGNhdGNoIChlcnJvcikge1xuICAgICAgICBpbWFnZVJldHJ5Q291bnQrKztcbiAgICAgICAgY29uc29sZS5lcnJvcihcbiAgICAgICAgICBg4p2MIEltYWdlIGdlbmVyYXRpb24gYXR0ZW1wdCAke2ltYWdlUmV0cnlDb3VudH0gZmFpbGVkOmAsXG4gICAgICAgICAgZXJyb3IsXG4gICAgICAgICk7XG5cbiAgICAgICAgLy8gQ2hlY2sgaWYgaXQncyB0aGUgc3BlY2lmaWMgZXJyb3Igd2UncmUgc2VlaW5nXG4gICAgICAgIGlmIChlcnJvciAmJiB0eXBlb2YgZXJyb3IgPT09ICdvYmplY3QnICYmICd0YXNrRGV0YWlscycgaW4gZXJyb3IpIHtcbiAgICAgICAgICBjb25zdCB0YXNrRGV0YWlscyA9IChlcnJvciBhcyBhbnkpLnRhc2tEZXRhaWxzO1xuICAgICAgICAgIGNvbnNvbGUuZXJyb3IoJ1Rhc2sgZGV0YWlsczonLCB0YXNrRGV0YWlscyk7XG5cbiAgICAgICAgICBpZiAodGFza0RldGFpbHM/LmZhaWx1cmVDb2RlID09PSAnSU5URVJOQUwuQkFEX09VVFBVVC5DT0RFMDEnKSB7XG4gICAgICAgICAgICBjb25zb2xlLmxvZyhcbiAgICAgICAgICAgICAgYPCflIQgUmV0cnlpbmcgaW1hZ2UgZ2VuZXJhdGlvbiBkdWUgdG8gSU5URVJOQUwuQkFEX09VVFBVVC5DT0RFMDEgZXJyb3IgKGF0dGVtcHQgJHtpbWFnZVJldHJ5Q291bnR9LyR7bWF4SW1hZ2VSZXRyaWVzfSlgLFxuICAgICAgICAgICAgKTtcbiAgICAgICAgICAgIGlmIChpbWFnZVJldHJ5Q291bnQgPCBtYXhJbWFnZVJldHJpZXMpIHtcbiAgICAgICAgICAgICAgLy8gV2FpdCBiZWZvcmUgcmV0cnlpbmcgKGV4cG9uZW50aWFsIGJhY2tvZmYpXG4gICAgICAgICAgICAgIGNvbnN0IHdhaXRUaW1lID0gTWF0aC5taW4oXG4gICAgICAgICAgICAgICAgMTAwMCAqIE1hdGgucG93KDIsIGltYWdlUmV0cnlDb3VudCAtIDEpLFxuICAgICAgICAgICAgICAgIDUwMDAsXG4gICAgICAgICAgICAgICk7XG4gICAgICAgICAgICAgIGNvbnNvbGUubG9nKGDij7MgV2FpdGluZyAke3dhaXRUaW1lfW1zIGJlZm9yZSByZXRyeS4uLmApO1xuICAgICAgICAgICAgICBhd2FpdCBuZXcgUHJvbWlzZSgocmVzb2x2ZSkgPT4gc2V0VGltZW91dChyZXNvbHZlLCB3YWl0VGltZSkpO1xuICAgICAgICAgICAgICBjb250aW51ZTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICB9XG4gICAgICAgIH1cblxuICAgICAgICAvLyBJZiB3ZSd2ZSBleGhhdXN0ZWQgcmV0cmllcyBvciBpdCdzIG5vdCB0aGUgc3BlY2lmaWMgZXJyb3IsIHRocm93XG4gICAgICAgIGlmIChpbWFnZVJldHJ5Q291bnQgPj0gbWF4SW1hZ2VSZXRyaWVzKSB7XG4gICAgICAgICAgY29uc29sZS5lcnJvcihcbiAgICAgICAgICAgIGDinYwgQWxsICR7bWF4SW1hZ2VSZXRyaWVzfSBpbWFnZSBnZW5lcmF0aW9uIGF0dGVtcHRzIGZhaWxlZCBmb3Igc2NlbmUgJHtzY2VuZUluZGV4fWAsXG4gICAgICAgICAgKTtcbiAgICAgICAgICB0aHJvdyBlcnJvcjtcbiAgICAgICAgfVxuICAgICAgfVxuICAgIH1cblxuICAgIGlmIChcbiAgICAgICFpbWFnZVJlc3VsdCB8fFxuICAgICAgIWltYWdlUmVzdWx0Lm91dHB1dCB8fFxuICAgICAgaW1hZ2VSZXN1bHQub3V0cHV0Lmxlbmd0aCA9PT0gMFxuICAgICkge1xuICAgICAgY29uc29sZS5sb2coJ+KdjCBFcnJvcjogUnVud2F5IFNESyBkaWQgbm90IHJldHVybiBhbiBpbWFnZSBVUkwnKTtcbiAgICAgIGNvbnNvbGUubG9nKCdGdWxsIGltYWdlIHJlc3VsdDonLCBpbWFnZVJlc3VsdCk7XG4gICAgICB0aHJvdyBuZXcgRXJyb3IoJ1J1bndheSBTREsgZGlkIG5vdCByZXR1cm4gYW4gaW1hZ2UgVVJMJyk7XG4gICAgfVxuXG4gICAgLy8gQWNjZXNzIHRoZSBvdXRwdXQgcHJvcGVydHkgd2hpY2ggc2hvdWxkIGNvbnRhaW4gdGhlIGltYWdlc1xuICAgIGNvbnN0IGltYWdlVXJsID0gaW1hZ2VSZXN1bHQub3V0cHV0WzBdO1xuICAgIGNvbnNvbGUubG9nKCdpbWFnZVJlc3VsdC5vdXRwdXQ6JywgaW1hZ2VSZXN1bHQub3V0cHV0KTtcbiAgICBjb25zb2xlLmxvZygn8J+WvO+4jyBHZW5lcmF0ZWQgaW1hZ2UgVVJMOicsIGltYWdlVXJsKTtcblxuICAgIC8vIFNhdmUgaW1hZ2UgdG8gUzMgZm9yIGRlYnVnZ2luZyBwdXJwb3Nlc1xuICAgIGNvbnNvbGUubG9nKCfwn5K+IFNhdmluZyBpbWFnZSB0byBTMyBmb3IgZGVidWdnaW5nLi4uJyk7XG4gICAgdHJ5IHtcbiAgICAgIGNvbnN0IGltYWdlQnVmZmVyID0gYXdhaXQgZG93bmxvYWRJbWFnZShpbWFnZVVybCk7XG4gICAgICBjb25zdCBpbWFnZUtleSA9IGAke3VzZXJJZH0vJHt0aW1lc3RhbXB9LnNjZW5lLSR7XG4gICAgICAgIHNjZW5lSWQgIT09IHVuZGVmaW5lZCA/IHNjZW5lSWQgOiBzY2VuZUluZGV4XG4gICAgICB9LmpwZ2A7XG4gICAgICBjb25zb2xlLmxvZyhcbiAgICAgICAgYOKYge+4jyBVcGxvYWRpbmcgaW1hZ2UgdG8gUzM6ICR7cHJvY2Vzcy5lbnYuVklERU9fUEFSVFNfQlVDS0VUX05BTUV9LyR7aW1hZ2VLZXl9YCxcbiAgICAgICk7XG5cbiAgICAgIGF3YWl0IHMzLnNlbmQoXG4gICAgICAgIG5ldyBQdXRPYmplY3RDb21tYW5kKHtcbiAgICAgICAgICBCdWNrZXQ6IHByb2Nlc3MuZW52LlZJREVPX1BBUlRTX0JVQ0tFVF9OQU1FLFxuICAgICAgICAgIEtleTogaW1hZ2VLZXksXG4gICAgICAgICAgQm9keTogaW1hZ2VCdWZmZXIsXG4gICAgICAgICAgQ29udGVudFR5cGU6ICdpbWFnZS9qcGVnJyxcbiAgICAgICAgfSksXG4gICAgICApO1xuICAgICAgY29uc29sZS5sb2coYOKchSBVcGxvYWRlZCBpbWFnZSB0byBTMzogJHtpbWFnZUtleX1gKTtcbiAgICB9IGNhdGNoIChlcnJvcikge1xuICAgICAgY29uc29sZS5lcnJvcign4p2MIEVycm9yIHNhdmluZyBpbWFnZSB0byBTMzonLCBlcnJvcik7XG4gICAgICAvLyBEb24ndCB0aHJvdyBoZXJlIC0gd2Ugd2FudCB0byBjb250aW51ZSB3aXRoIHZpZGVvIGdlbmVyYXRpb24gZXZlbiBpZiBpbWFnZSBzYXZpbmcgZmFpbHNcbiAgICB9XG5cbiAgICByZXR1cm4gaW1hZ2VVcmw7XG4gIH0gY2F0Y2ggKGVycm9yKSB7XG4gICAgY29uc29sZS5lcnJvcihg4p2MIEVycm9yIGluIGdlbmVyYXRlSW1hZ2UgZm9yIHNjZW5lICR7c2NlbmVJbmRleH06YCwgZXJyb3IpO1xuICAgIGlmIChlcnJvciAmJiB0eXBlb2YgZXJyb3IgPT09ICdvYmplY3QnICYmICdtZXNzYWdlJyBpbiBlcnJvcikge1xuICAgICAgY29uc29sZS5lcnJvcignRXJyb3IgbWVzc2FnZTonLCBlcnJvci5tZXNzYWdlKTtcbiAgICAgIGNvbnNvbGUuZXJyb3IoJ0Vycm9yIG5hbWU6JywgKGVycm9yIGFzIGFueSkubmFtZSk7XG4gICAgICBjb25zb2xlLmVycm9yKCdFcnJvciBzdGFjazonLCAoZXJyb3IgYXMgYW55KS5zdGFjayk7XG4gICAgfVxuICAgIHRocm93IGVycm9yO1xuICB9XG59XG5cbmFzeW5jIGZ1bmN0aW9uIGRvd25sb2FkSW1hZ2UodXJsOiBzdHJpbmcpOiBQcm9taXNlPEJ1ZmZlcj4ge1xuICBjb25zb2xlLmxvZyhg8J+TpSBEb3dubG9hZGluZyBpbWFnZSBmcm9tOiAke3VybH1gKTtcbiAgdHJ5IHtcbiAgICBjb25zdCByZXNwb25zZSA9IGF3YWl0IGF4aW9zLmdldCh1cmwsIHsgcmVzcG9uc2VUeXBlOiAnYXJyYXlidWZmZXInIH0pO1xuICAgIGNvbnNvbGUubG9nKGDinIUgRG93bmxvYWRlZCBpbWFnZSwgc3RhdHVzOiAke3Jlc3BvbnNlLnN0YXR1c31gKTtcbiAgICByZXR1cm4gQnVmZmVyLmZyb20ocmVzcG9uc2UuZGF0YSk7XG4gIH0gY2F0Y2ggKGVycm9yKSB7XG4gICAgY29uc29sZS5lcnJvcign4p2MIEVycm9yIGRvd25sb2FkaW5nIGltYWdlOicsIGVycm9yKTtcbiAgICB0aHJvdyBlcnJvcjtcbiAgfVxufVxuIl19