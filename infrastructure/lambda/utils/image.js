"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.generateImage = generateImage;
const sdk_1 = require("@runwayml/sdk");
async function generateImage(description, scenePosition, userId, timestamp, seed, sceneId) {
    try {
        // Initialize Runway SDK
        const runway = new sdk_1.RunwayML({
            apiKey: process.env.RUNWAY_API_KEY,
        });
        console.log(`🎨 Calling Runway SDK for image generation in scene ${scenePosition}...`);
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
                    console.error(`❌ All ${maxImageRetries} image generation attempts failed for scene ${scenePosition}`);
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
        console.error(`❌ Error in generateImage for scene ${scenePosition}:`, error);
        if (error && typeof error === 'object' && 'message' in error) {
            console.error('Error message:', error.message);
            console.error('Error name:', error.name);
            console.error('Error stack:', error.stack);
        }
        throw error;
    }
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiaW1hZ2UuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyJpbWFnZS50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiOztBQVNBLHNDQXFIQztBQTlIRCx1Q0FBeUM7QUFTbEMsS0FBSyxVQUFVLGFBQWEsQ0FDakMsV0FBbUIsRUFDbkIsYUFBcUIsRUFDckIsTUFBYyxFQUNkLFNBQWlCLEVBQ2pCLElBQVksRUFDWixPQUFnQjtJQUVoQixJQUFJLENBQUM7UUFDSCx3QkFBd0I7UUFDeEIsTUFBTSxNQUFNLEdBQUcsSUFBSSxjQUFRLENBQUM7WUFDMUIsTUFBTSxFQUFFLE9BQU8sQ0FBQyxHQUFHLENBQUMsY0FBZTtTQUNwQyxDQUFDLENBQUM7UUFFSCxPQUFPLENBQUMsR0FBRyxDQUNULHVEQUF1RCxhQUFhLEtBQUssQ0FDMUUsQ0FBQztRQUNGLE9BQU8sQ0FBQyxHQUFHLENBQUMsV0FBVyxFQUFFLFdBQVcsQ0FBQyxDQUFDO1FBQ3RDLE9BQU8sQ0FBQyxHQUFHLENBQUMsaUNBQWlDLENBQUMsQ0FBQztRQUUvQyxzREFBc0Q7UUFDdEQsT0FBTyxDQUFDLEdBQUcsQ0FBQyxrQ0FBa0MsQ0FBQyxDQUFDO1FBRWhELG1DQUFtQztRQUNuQyxJQUFJLFdBQVcsQ0FBQztRQUNoQixJQUFJLGVBQWUsR0FBRyxDQUFDLENBQUM7UUFDeEIsTUFBTSxlQUFlLEdBQUcsQ0FBQyxDQUFDO1FBRTFCLE9BQU8sZUFBZSxHQUFHLGVBQWUsRUFBRSxDQUFDO1lBQ3pDLElBQUksQ0FBQztnQkFDSCxPQUFPLENBQUMsR0FBRyxDQUNULCtCQUNFLGVBQWUsR0FBRyxDQUNwQixJQUFJLGVBQWUsZUFBZSxJQUFJLEVBQUUsQ0FDekMsQ0FBQztnQkFFRixXQUFXLEdBQUcsTUFBTSxNQUFNLENBQUMsV0FBVztxQkFDbkMsTUFBTSxDQUFDO29CQUNOLEtBQUssRUFBRSxZQUFZO29CQUNuQixVQUFVLEVBQUUsR0FBRyxXQUFXLHFGQUFxRjtvQkFDL0csS0FBSyxFQUFFLFVBQVUsRUFBRSx5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SSxDQUFDLENBQUM7WUFDbEQsT0FBTyxDQUFDLEtBQUssQ0FBQyxjQUFjLEVBQUcsS0FBYSxDQUFDLEtBQUssQ0FBQyxDQUFDO1FBQ3RELENBQUM7UUFDRCxNQUFNLEtBQUssQ0FBQztJQUNkLENBQUM7QUFDSCxDQUFDIiwic291cmNlc0NvbnRlbnQiOlsiaW1wb3J0IHsgUnVud2F5TUwgfSBmcm9tICdAcnVud2F5bWwvc2RrJztcblxuZXhwb3J0IGludGVyZmFjZSBTY2VuZSB7XG4gIGRlc2NyaXB0aW9uOiBzdHJpbmc7XG4gIGR1cmF0aW9uOiBudW1iZXI7XG4gIG5hcnJhdGlvbjogc3RyaW5nO1xuICBpZDogbnVtYmVyO1xufVxuXG5leHBvcnQgYXN5bmMgZnVuY3Rpb24gZ2VuZXJhdGVJbWFnZShcbiAgZGVzY3JpcHRpb246IHN0cmluZyxcbiAgc2NlbmVQb3NpdGlvbjogbnVtYmVyLFxuICB1c2VySWQ6IHN0cmluZyxcbiAgdGltZXN0YW1wOiBzdHJpbmcsXG4gIHNlZWQ6IG51bWJlcixcbiAgc2NlbmVJZD86IG51bWJlcixcbik6IFByb21pc2U8c3RyaW5nPiB7XG4gIHRyeSB7XG4gICAgLy8gSW5pdGlhbGl6ZSBSdW53YXkgU0RLXG4gICAgY29uc3QgcnVud2F5ID0gbmV3IFJ1bndheU1MKHtcbiAgICAgIGFwaUtleTogcHJvY2Vzcy5lbnYuUlVOV0FZX0FQSV9LRVkhLFxuICAgIH0pO1xuXG4gICAgY29uc29sZS5sb2coXG4gICAgICBg8J+OqCBDYWxsaW5nIFJ1bndheSBTREsgZm9yIGltYWdlIGdlbmVyYXRpb24gaW4gc2NlbmUgJHtzY2VuZVBvc2l0aW9ufS4uLmAsXG4gICAgKTtcbiAgICBjb25zb2xlLmxvZygnLSBQcm9tcHQ6JywgZGVzY3JpcHRpb24pO1xuICAgIGNvbnNvbGUubG9nKCctIEFzcGVjdCByYXRpbzogOToxNiAodmVydGljYWwpJyk7XG5cbiAgICAvLyBHZW5lcmF0ZSBhbiBpbWFnZSBmcm9tIHRleHQgdXNpbmcgdGV4dC10by1pbWFnZSBBUElcbiAgICBjb25zb2xlLmxvZygn8J+OqCBHZW5lcmF0aW5nIGltYWdlIGZyb20gdGV4dC4uLicpO1xuXG4gICAgLy8gUmV0cnkgbG9naWMgZm9yIGltYWdlIGdlbmVyYXRpb25cbiAgICBsZXQgaW1hZ2VSZXN1bHQ7XG4gICAgbGV0IGltYWdlUmV0cnlDb3VudCA9IDA7XG4gICAgY29uc3QgbWF4SW1hZ2VSZXRyaWVzID0gNTtcblxuICAgIHdoaWxlIChpbWFnZVJldHJ5Q291bnQgPCBtYXhJbWFnZVJldHJpZXMpIHtcbiAgICAgIHRyeSB7XG4gICAgICAgIGNvbnNvbGUubG9nKFxuICAgICAgICAgIGDwn46oIEltYWdlIGdlbmVyYXRpb24gYXR0ZW1wdCAke1xuICAgICAgICAgICAgaW1hZ2VSZXRyeUNvdW50ICsgMVxuICAgICAgICAgIH0vJHttYXhJbWFnZVJldHJpZXN9IHdpdGggc2VlZDogJHtzZWVkfWAsXG4gICAgICAgICk7XG5cbiAgICAgICAgaW1hZ2VSZXN1bHQgPSBhd2FpdCBydW53YXkudGV4dFRvSW1hZ2VcbiAgICAgICAgICAuY3JlYXRlKHtcbiAgICAgICAgICAgIG1vZGVsOiAnZ2VuNF9pbWFnZScsXG4gICAgICAgICAgICBwcm9tcHRUZXh0OiBgJHtkZXNjcmlwdGlvbn0gLSByZWFsaXN0aWMgaW1hZ2Ugd2l0aCBnb29kIGxpZ2h0aW5nLCBubyB0ZXh0LCBubyBsb2dvcywgY2xlYW4gdmlzdWFsIGNvbnRlbnQgb25seWAsXG4gICAgICAgICAgICByYXRpbzogJzcyMDoxMjgwJywgLy8gVmVydGljYWwgZm9ybWF0ICg5OjE2KVxuICAgICAgICAgICAgc2VlZDogc2VlZCxcbiAgICAgICAgICB9KVxuICAgICAgICAgIC53YWl0Rm9yVGFza091dHB1dCgpO1xuXG4gICAgICAgIGNvbnNvbGUubG9nKCfwn5OhIFRleHQtdG8taW1hZ2UgZ2VuZXJhdGlvbiBjb21wbGV0ZWQnKTtcbiAgICAgICAgY29uc29sZS5sb2coJ/Cfk4QgSW1hZ2UgcmVzdWx0OicsIGltYWdlUmVzdWx0KTtcblxuICAgICAgICAvLyBJZiB3ZSBnZXQgaGVyZSwgdGhlIGdlbmVyYXRpb24gd2FzIHN1Y2Nlc3NmdWxcbiAgICAgICAgYnJlYWs7XG4gICAgICB9IGNhdGNoIChlcnJvcikge1xuICAgICAgICBpbWFnZVJldHJ5Q291bnQrKztcbiAgICAgICAgY29uc29sZS5lcnJvcihcbiAgICAgICAgICBg4p2MIEltYWdlIGdlbmVyYXRpb24gYXR0ZW1wdCAke2ltYWdlUmV0cnlDb3VudH0gZmFpbGVkOmAsXG4gICAgICAgICAgZXJyb3IsXG4gICAgICAgICk7XG5cbiAgICAgICAgLy8gQ2hlY2sgaWYgaXQncyB0aGUgc3BlY2lmaWMgZXJyb3Igd2UncmUgc2VlaW5nXG4gICAgICAgIGlmIChlcnJvciAmJiB0eXBlb2YgZXJyb3IgPT09ICdvYmplY3QnICYmICd0YXNrRGV0YWlscycgaW4gZXJyb3IpIHtcbiAgICAgICAgICBjb25zdCB0YXNrRGV0YWlscyA9IChlcnJvciBhcyBhbnkpLnRhc2tEZXRhaWxzO1xuICAgICAgICAgIGNvbnNvbGUuZXJyb3IoJ1Rhc2sgZGV0YWlsczonLCB0YXNrRGV0YWlscyk7XG5cbiAgICAgICAgICBpZiAodGFza0RldGFpbHM/LmZhaWx1cmVDb2RlID09PSAnSU5URVJOQUwuQkFEX09VVFBVVC5DT0RFMDEnKSB7XG4gICAgICAgICAgICBjb25zb2xlLmxvZyhcbiAgICAgICAgICAgICAgYPCflIQgUmV0cnlpbmcgaW1hZ2UgZ2VuZXJhdGlvbiBkdWUgdG8gSU5URVJOQUwuQkFEX09VVFBVVC5DT0RFMDEgZXJyb3IgKGF0dGVtcHQgJHtpbWFnZVJldHJ5Q291bnR9LyR7bWF4SW1hZ2VSZXRyaWVzfSlgLFxuICAgICAgICAgICAgKTtcbiAgICAgICAgICAgIGlmIChpbWFnZVJldHJ5Q291bnQgPCBtYXhJbWFnZVJldHJpZXMpIHtcbiAgICAgICAgICAgICAgLy8gV2FpdCBiZWZvcmUgcmV0cnlpbmcgKGV4cG9uZW50aWFsIGJhY2tvZmYpXG4gICAgICAgICAgICAgIGNvbnN0IHdhaXRUaW1lID0gTWF0aC5taW4oXG4gICAgICAgICAgICAgICAgMTAwMCAqIE1hdGgucG93KDIsIGltYWdlUmV0cnlDb3VudCAtIDEpLFxuICAgICAgICAgICAgICAgIDUwMDAsXG4gICAgICAgICAgICAgICk7XG4gICAgICAgICAgICAgIGNvbnNvbGUubG9nKGDij7MgV2FpdGluZyAke3dhaXRUaW1lfW1zIGJlZm9yZSByZXRyeS4uLmApO1xuICAgICAgICAgICAgICBhd2FpdCBuZXcgUHJvbWlzZSgocmVzb2x2ZSkgPT4gc2V0VGltZW91dChyZXNvbHZlLCB3YWl0VGltZSkpO1xuICAgICAgICAgICAgICBjb250aW51ZTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICB9XG4gICAgICAgIH1cblxuICAgICAgICAvLyBJZiB3ZSd2ZSBleGhhdXN0ZWQgcmV0cmllcyBvciBpdCdzIG5vdCB0aGUgc3BlY2lmaWMgZXJyb3IsIHRocm93XG4gICAgICAgIGlmIChpbWFnZVJldHJ5Q291bnQgPj0gbWF4SW1hZ2VSZXRyaWVzKSB7XG4gICAgICAgICAgY29uc29sZS5lcnJvcihcbiAgICAgICAgICAgIGDinYwgQWxsICR7bWF4SW1hZ2VSZXRyaWVzfSBpbWFnZSBnZW5lcmF0aW9uIGF0dGVtcHRzIGZhaWxlZCBmb3Igc2NlbmUgJHtzY2VuZVBvc2l0aW9ufWAsXG4gICAgICAgICAgKTtcbiAgICAgICAgICB0aHJvdyBlcnJvcjtcbiAgICAgICAgfVxuICAgICAgfVxuICAgIH1cblxuICAgIGlmIChcbiAgICAgICFpbWFnZVJlc3VsdCB8fFxuICAgICAgIWltYWdlUmVzdWx0Lm91dHB1dCB8fFxuICAgICAgaW1hZ2VSZXN1bHQub3V0cHV0Lmxlbmd0aCA9PT0gMFxuICAgICkge1xuICAgICAgY29uc29sZS5sb2coJ+KdjCBFcnJvcjogUnVud2F5IFNESyBkaWQgbm90IHJldHVybiBhbiBpbWFnZSBVUkwnKTtcbiAgICAgIGNvbnNvbGUubG9nKCdGdWxsIGltYWdlIHJlc3VsdDonLCBpbWFnZVJlc3VsdCk7XG4gICAgICB0aHJvdyBuZXcgRXJyb3IoJ1J1bndheSBTREsgZGlkIG5vdCByZXR1cm4gYW4gaW1hZ2UgVVJMJyk7XG4gICAgfVxuXG4gICAgLy8gQWNjZXNzIHRoZSBvdXRwdXQgcHJvcGVydHkgd2hpY2ggc2hvdWxkIGNvbnRhaW4gdGhlIGltYWdlc1xuICAgIGNvbnN0IGltYWdlVXJsID0gaW1hZ2VSZXN1bHQub3V0cHV0WzBdO1xuXG4gICAgY29uc29sZS5sb2coJ/CflrzvuI8gR2VuZXJhdGVkIGltYWdlIFVSTDonLCBpbWFnZVVybCk7XG5cbiAgICByZXR1cm4gaW1hZ2VVcmw7XG4gIH0gY2F0Y2ggKGVycm9yKSB7XG4gICAgY29uc29sZS5lcnJvcihcbiAgICAgIGDinYwgRXJyb3IgaW4gZ2VuZXJhdGVJbWFnZSBmb3Igc2NlbmUgJHtzY2VuZVBvc2l0aW9ufTpgLFxuICAgICAgZXJyb3IsXG4gICAgKTtcbiAgICBpZiAoZXJyb3IgJiYgdHlwZW9mIGVycm9yID09PSAnb2JqZWN0JyAmJiAnbWVzc2FnZScgaW4gZXJyb3IpIHtcbiAgICAgIGNvbnNvbGUuZXJyb3IoJ0Vycm9yIG1lc3NhZ2U6JywgZXJyb3IubWVzc2FnZSk7XG4gICAgICBjb25zb2xlLmVycm9yKCdFcnJvciBuYW1lOicsIChlcnJvciBhcyBhbnkpLm5hbWUpO1xuICAgICAgY29uc29sZS5lcnJvcignRXJyb3Igc3RhY2s6JywgKGVycm9yIGFzIGFueSkuc3RhY2spO1xuICAgIH1cbiAgICB0aHJvdyBlcnJvcjtcbiAgfVxufVxuIl19