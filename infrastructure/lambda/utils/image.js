"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.generateImage = generateImage;
const sdk_1 = require("@runwayml/sdk");
async function generateImage(description, sceneIndex, userId, timestamp, seed, sceneId) {
    try {
        // Initialize Runway SDK
        const runway = new sdk_1.RunwayML({
            apiKey: process.env.RUNWAY_API_KEY,
        });
        console.log(`🎨 Calling Runway SDK for image generation in scene ${sceneIndex}...`);
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
                    promptText: `${description} - realistic image with good lighting, no text, no logos, clean visual content only`,
                    ratio: '720:1280', // Vertical format (9:16)
                    seed: seed,
                })
                    .waitForTaskOutput();
                console.log('📡 Text-to-image generation completed');
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
        console.log('🖼️ Generated image URL:', imageUrl);
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiaW1hZ2UuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyJpbWFnZS50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiOztBQVVBLHNDQWtIQztBQTVIRCx1Q0FBeUM7QUFVbEMsS0FBSyxVQUFVLGFBQWEsQ0FDakMsV0FBbUIsRUFDbkIsVUFBa0IsRUFDbEIsTUFBYyxFQUNkLFNBQWlCLEVBQ2pCLElBQVksRUFDWixPQUFnQjtJQUVoQixJQUFJLENBQUM7UUFDSCx3QkFBd0I7UUFDeEIsTUFBTSxNQUFNLEdBQUcsSUFBSSxjQUFRLENBQUM7WUFDMUIsTUFBTSxFQUFFLE9BQU8sQ0FBQyxHQUFHLENBQUMsY0FBZTtTQUNwQyxDQUFDLENBQUM7UUFFSCxPQUFPLENBQUMsR0FBRyxDQUNULHVEQUF1RCxVQUFVLEtBQUssQ0FDdkUsQ0FBQztRQUNGLE9BQU8sQ0FBQyxHQUFHLENBQUMsV0FBVyxFQUFFLFdBQVcsQ0FBQyxDQUFDO1FBQ3RDLE9BQU8sQ0FBQyxHQUFHLENBQUMsaUNBQWlDLENBQUMsQ0FBQztRQUUvQyxzREFBc0Q7UUFDdEQsT0FBTyxDQUFDLEdBQUcsQ0FBQyxrQ0FBa0MsQ0FBQyxDQUFDO1FBRWhELG1DQUFtQztRQUNuQyxJQUFJLFdBQVcsQ0FBQztRQUNoQixJQUFJLGVBQWUsR0FBRyxDQUFDLENBQUM7UUFDeEIsTUFBTSxlQUFlLEdBQUcsQ0FBQyxDQUFDO1FBRTFCLE9BQU8sZUFBZSxHQUFHLGVBQWUsRUFBRSxDQUFDO1lBQ3pDLElBQUksQ0FBQztnQkFDSCxPQUFPLENBQUMsR0FBRyxDQUNULCtCQUNFLGVBQWUsR0FBRyxDQUNwQixJQUFJLGVBQWUsZUFBZSxJQUFJLEVBQUUsQ0FDekMsQ0FBQztnQkFFRixXQUFXLEdBQUcsTUFBTSxNQUFNLENBQUMsV0FBVztxQkFDbkMsTUFBTSxDQUFDO29CQUNOLEtBQUssRUFBRSxZQUFZO29CQUNuQixVQUFVLEVBQUUsR0FBRyxXQUFXLHFGQUFxRjtvQkFDL0csS0FBSyxFQUFFLFVBQVUsRUFBRSx5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SSxDQUFDLENBQUM7WUFDbEQsT0FBTyxDQUFDLEtBQUssQ0FBQyxjQUFjLEVBQUcsS0FBYSxDQUFDLEtBQUssQ0FBQyxDQUFDO1FBQ3RELENBQUM7UUFDRCxNQUFNLEtBQUssQ0FBQztJQUNkLENBQUM7QUFDSCxDQUFDIiwic291cmNlc0NvbnRlbnQiOlsiaW1wb3J0IHsgUnVud2F5TUwgfSBmcm9tICdAcnVud2F5bWwvc2RrJztcbmltcG9ydCB7IHVwbG9hZEltYWdlVG9TMyB9IGZyb20gJy4vczNVcGxvYWRlcic7XG5cbmV4cG9ydCBpbnRlcmZhY2UgU2NlbmUge1xuICBkZXNjcmlwdGlvbjogc3RyaW5nO1xuICBkdXJhdGlvbjogbnVtYmVyO1xuICBuYXJyYXRpb246IHN0cmluZztcbiAgaWQ6IG51bWJlcjtcbn1cblxuZXhwb3J0IGFzeW5jIGZ1bmN0aW9uIGdlbmVyYXRlSW1hZ2UoXG4gIGRlc2NyaXB0aW9uOiBzdHJpbmcsXG4gIHNjZW5lSW5kZXg6IG51bWJlcixcbiAgdXNlcklkOiBzdHJpbmcsXG4gIHRpbWVzdGFtcDogc3RyaW5nLFxuICBzZWVkOiBudW1iZXIsXG4gIHNjZW5lSWQ/OiBudW1iZXIsXG4pOiBQcm9taXNlPHN0cmluZz4ge1xuICB0cnkge1xuICAgIC8vIEluaXRpYWxpemUgUnVud2F5IFNES1xuICAgIGNvbnN0IHJ1bndheSA9IG5ldyBSdW53YXlNTCh7XG4gICAgICBhcGlLZXk6IHByb2Nlc3MuZW52LlJVTldBWV9BUElfS0VZISxcbiAgICB9KTtcblxuICAgIGNvbnNvbGUubG9nKFxuICAgICAgYPCfjqggQ2FsbGluZyBSdW53YXkgU0RLIGZvciBpbWFnZSBnZW5lcmF0aW9uIGluIHNjZW5lICR7c2NlbmVJbmRleH0uLi5gLFxuICAgICk7XG4gICAgY29uc29sZS5sb2coJy0gUHJvbXB0OicsIGRlc2NyaXB0aW9uKTtcbiAgICBjb25zb2xlLmxvZygnLSBBc3BlY3QgcmF0aW86IDk6MTYgKHZlcnRpY2FsKScpO1xuXG4gICAgLy8gR2VuZXJhdGUgYW4gaW1hZ2UgZnJvbSB0ZXh0IHVzaW5nIHRleHQtdG8taW1hZ2UgQVBJXG4gICAgY29uc29sZS5sb2coJ/CfjqggR2VuZXJhdGluZyBpbWFnZSBmcm9tIHRleHQuLi4nKTtcblxuICAgIC8vIFJldHJ5IGxvZ2ljIGZvciBpbWFnZSBnZW5lcmF0aW9uXG4gICAgbGV0IGltYWdlUmVzdWx0O1xuICAgIGxldCBpbWFnZVJldHJ5Q291bnQgPSAwO1xuICAgIGNvbnN0IG1heEltYWdlUmV0cmllcyA9IDU7XG5cbiAgICB3aGlsZSAoaW1hZ2VSZXRyeUNvdW50IDwgbWF4SW1hZ2VSZXRyaWVzKSB7XG4gICAgICB0cnkge1xuICAgICAgICBjb25zb2xlLmxvZyhcbiAgICAgICAgICBg8J+OqCBJbWFnZSBnZW5lcmF0aW9uIGF0dGVtcHQgJHtcbiAgICAgICAgICAgIGltYWdlUmV0cnlDb3VudCArIDFcbiAgICAgICAgICB9LyR7bWF4SW1hZ2VSZXRyaWVzfSB3aXRoIHNlZWQ6ICR7c2VlZH1gLFxuICAgICAgICApO1xuXG4gICAgICAgIGltYWdlUmVzdWx0ID0gYXdhaXQgcnVud2F5LnRleHRUb0ltYWdlXG4gICAgICAgICAgLmNyZWF0ZSh7XG4gICAgICAgICAgICBtb2RlbDogJ2dlbjRfaW1hZ2UnLFxuICAgICAgICAgICAgcHJvbXB0VGV4dDogYCR7ZGVzY3JpcHRpb259IC0gcmVhbGlzdGljIGltYWdlIHdpdGggZ29vZCBsaWdodGluZywgbm8gdGV4dCwgbm8gbG9nb3MsIGNsZWFuIHZpc3VhbCBjb250ZW50IG9ubHlgLFxuICAgICAgICAgICAgcmF0aW86ICc3MjA6MTI4MCcsIC8vIFZlcnRpY2FsIGZvcm1hdCAoOToxNilcbiAgICAgICAgICAgIHNlZWQ6IHNlZWQsXG4gICAgICAgICAgfSlcbiAgICAgICAgICAud2FpdEZvclRhc2tPdXRwdXQoKTtcblxuICAgICAgICBjb25zb2xlLmxvZygn8J+ToSBUZXh0LXRvLWltYWdlIGdlbmVyYXRpb24gY29tcGxldGVkJyk7XG4gICAgICAgIGNvbnNvbGUubG9nKCfwn5OEIEltYWdlIHJlc3VsdDonLCBpbWFnZVJlc3VsdCk7XG5cbiAgICAgICAgLy8gSWYgd2UgZ2V0IGhlcmUsIHRoZSBnZW5lcmF0aW9uIHdhcyBzdWNjZXNzZnVsXG4gICAgICAgIGJyZWFrO1xuICAgICAgfSBjYXRjaCAoZXJyb3IpIHtcbiAgICAgICAgaW1hZ2VSZXRyeUNvdW50Kys7XG4gICAgICAgIGNvbnNvbGUuZXJyb3IoXG4gICAgICAgICAgYOKdjCBJbWFnZSBnZW5lcmF0aW9uIGF0dGVtcHQgJHtpbWFnZVJldHJ5Q291bnR9IGZhaWxlZDpgLFxuICAgICAgICAgIGVycm9yLFxuICAgICAgICApO1xuXG4gICAgICAgIC8vIENoZWNrIGlmIGl0J3MgdGhlIHNwZWNpZmljIGVycm9yIHdlJ3JlIHNlZWluZ1xuICAgICAgICBpZiAoZXJyb3IgJiYgdHlwZW9mIGVycm9yID09PSAnb2JqZWN0JyAmJiAndGFza0RldGFpbHMnIGluIGVycm9yKSB7XG4gICAgICAgICAgY29uc3QgdGFza0RldGFpbHMgPSAoZXJyb3IgYXMgYW55KS50YXNrRGV0YWlscztcbiAgICAgICAgICBjb25zb2xlLmVycm9yKCdUYXNrIGRldGFpbHM6JywgdGFza0RldGFpbHMpO1xuXG4gICAgICAgICAgaWYgKHRhc2tEZXRhaWxzPy5mYWlsdXJlQ29kZSA9PT0gJ0lOVEVSTkFMLkJBRF9PVVRQVVQuQ09ERTAxJykge1xuICAgICAgICAgICAgY29uc29sZS5sb2coXG4gICAgICAgICAgICAgIGDwn5SEIFJldHJ5aW5nIGltYWdlIGdlbmVyYXRpb24gZHVlIHRvIElOVEVSTkFMLkJBRF9PVVRQVVQuQ09ERTAxIGVycm9yIChhdHRlbXB0ICR7aW1hZ2VSZXRyeUNvdW50fS8ke21heEltYWdlUmV0cmllc30pYCxcbiAgICAgICAgICAgICk7XG4gICAgICAgICAgICBpZiAoaW1hZ2VSZXRyeUNvdW50IDwgbWF4SW1hZ2VSZXRyaWVzKSB7XG4gICAgICAgICAgICAgIC8vIFdhaXQgYmVmb3JlIHJldHJ5aW5nIChleHBvbmVudGlhbCBiYWNrb2ZmKVxuICAgICAgICAgICAgICBjb25zdCB3YWl0VGltZSA9IE1hdGgubWluKFxuICAgICAgICAgICAgICAgIDEwMDAgKiBNYXRoLnBvdygyLCBpbWFnZVJldHJ5Q291bnQgLSAxKSxcbiAgICAgICAgICAgICAgICA1MDAwLFxuICAgICAgICAgICAgICApO1xuICAgICAgICAgICAgICBjb25zb2xlLmxvZyhg4o+zIFdhaXRpbmcgJHt3YWl0VGltZX1tcyBiZWZvcmUgcmV0cnkuLi5gKTtcbiAgICAgICAgICAgICAgYXdhaXQgbmV3IFByb21pc2UoKHJlc29sdmUpID0+IHNldFRpbWVvdXQocmVzb2x2ZSwgd2FpdFRpbWUpKTtcbiAgICAgICAgICAgICAgY29udGludWU7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgfVxuICAgICAgICB9XG5cbiAgICAgICAgLy8gSWYgd2UndmUgZXhoYXVzdGVkIHJldHJpZXMgb3IgaXQncyBub3QgdGhlIHNwZWNpZmljIGVycm9yLCB0aHJvd1xuICAgICAgICBpZiAoaW1hZ2VSZXRyeUNvdW50ID49IG1heEltYWdlUmV0cmllcykge1xuICAgICAgICAgIGNvbnNvbGUuZXJyb3IoXG4gICAgICAgICAgICBg4p2MIEFsbCAke21heEltYWdlUmV0cmllc30gaW1hZ2UgZ2VuZXJhdGlvbiBhdHRlbXB0cyBmYWlsZWQgZm9yIHNjZW5lICR7c2NlbmVJbmRleH1gLFxuICAgICAgICAgICk7XG4gICAgICAgICAgdGhyb3cgZXJyb3I7XG4gICAgICAgIH1cbiAgICAgIH1cbiAgICB9XG5cbiAgICBpZiAoXG4gICAgICAhaW1hZ2VSZXN1bHQgfHxcbiAgICAgICFpbWFnZVJlc3VsdC5vdXRwdXQgfHxcbiAgICAgIGltYWdlUmVzdWx0Lm91dHB1dC5sZW5ndGggPT09IDBcbiAgICApIHtcbiAgICAgIGNvbnNvbGUubG9nKCfinYwgRXJyb3I6IFJ1bndheSBTREsgZGlkIG5vdCByZXR1cm4gYW4gaW1hZ2UgVVJMJyk7XG4gICAgICBjb25zb2xlLmxvZygnRnVsbCBpbWFnZSByZXN1bHQ6JywgaW1hZ2VSZXN1bHQpO1xuICAgICAgdGhyb3cgbmV3IEVycm9yKCdSdW53YXkgU0RLIGRpZCBub3QgcmV0dXJuIGFuIGltYWdlIFVSTCcpO1xuICAgIH1cblxuICAgIC8vIEFjY2VzcyB0aGUgb3V0cHV0IHByb3BlcnR5IHdoaWNoIHNob3VsZCBjb250YWluIHRoZSBpbWFnZXNcbiAgICBjb25zdCBpbWFnZVVybCA9IGltYWdlUmVzdWx0Lm91dHB1dFswXTtcblxuICAgIGNvbnNvbGUubG9nKCfwn5a877iPIEdlbmVyYXRlZCBpbWFnZSBVUkw6JywgaW1hZ2VVcmwpO1xuXG4gICAgcmV0dXJuIGltYWdlVXJsO1xuICB9IGNhdGNoIChlcnJvcikge1xuICAgIGNvbnNvbGUuZXJyb3IoYOKdjCBFcnJvciBpbiBnZW5lcmF0ZUltYWdlIGZvciBzY2VuZSAke3NjZW5lSW5kZXh9OmAsIGVycm9yKTtcbiAgICBpZiAoZXJyb3IgJiYgdHlwZW9mIGVycm9yID09PSAnb2JqZWN0JyAmJiAnbWVzc2FnZScgaW4gZXJyb3IpIHtcbiAgICAgIGNvbnNvbGUuZXJyb3IoJ0Vycm9yIG1lc3NhZ2U6JywgZXJyb3IubWVzc2FnZSk7XG4gICAgICBjb25zb2xlLmVycm9yKCdFcnJvciBuYW1lOicsIChlcnJvciBhcyBhbnkpLm5hbWUpO1xuICAgICAgY29uc29sZS5lcnJvcignRXJyb3Igc3RhY2s6JywgKGVycm9yIGFzIGFueSkuc3RhY2spO1xuICAgIH1cbiAgICB0aHJvdyBlcnJvcjtcbiAgfVxufVxuIl19