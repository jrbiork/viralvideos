"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.handler = void 0;
const image_1 = require("../utils/image");
const credits_1 = require("../utils/credits");
const credits_2 = require("../utils/credits");
const handler = async (event) => {
    console.log('🎨 Image Generation Lambda handler started');
    try {
        // Parse request body
        if (!event.body) {
            return {
                statusCode: 400,
                body: JSON.stringify({ error: 'Request body is required' }),
            };
        }
        // get userId from the authorizer context
        const userId = event.requestContext.authorizer?.principalId;
        if (!userId) {
            return {
                statusCode: 401,
                body: JSON.stringify({ error: 'Unauthorized' }),
            };
        }
        // get timestamp from query string
        const timestamp = event.queryStringParameters?.['timestamp'];
        if (!timestamp) {
            return {
                statusCode: 400,
                body: JSON.stringify({ error: 'Timestamp is required' }),
            };
        }
        // get scene object from body
        const { imagePrompt } = JSON.parse(event.body);
        if (!imagePrompt) {
            return {
                statusCode: 400,
                body: JSON.stringify({
                    error: 'Image prompt is required',
                }),
            };
        }
        // Check if user has sufficient credits
        const { hasSufficientCredits, currentCredits } = await (0, credits_2.hasSufficientCreditsByUserId)(userId, credits_1.CREDITS_COST.new_image);
        console.log('hasCredits / current credits:', hasSufficientCredits, currentCredits);
        if (!hasSufficientCredits) {
            return {
                statusCode: 400,
                body: JSON.stringify({ error: 'Insufficient credits' }),
            };
        }
        const seed = parseInt(timestamp);
        const sceneId = 99;
        const imageUrl = await (0, image_1.generateImage)(imagePrompt, sceneId, userId, timestamp, seed, sceneId);
        console.log('🎨 Image generated successfully:', imageUrl);
        // Deduct credits
        const newCurrentCredits = await (0, credits_2.updateCreditBalanceByUserId)(userId, credits_1.CREDITS_COST.new_image);
        console.log('new credits after deduction:', newCurrentCredits);
        // Return success response
        return {
            statusCode: 200,
            body: JSON.stringify({
                imageUrl,
            }),
        };
    }
    catch (error) {
        console.error('❌ Error in image generation:', error);
        return {
            statusCode: 500,
            body: JSON.stringify({
                error: 'Internal server error',
                message: error instanceof Error ? error.message : 'Unknown error occurred',
            }),
        };
    }
};
exports.handler = handler;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiaW5kZXguanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyJpbmRleC50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiOzs7QUFFQSwwQ0FBK0M7QUFJL0MsOENBQWdEO0FBRWhELDhDQUcwQjtBQU1uQixNQUFNLE9BQU8sR0FBRyxLQUFLLEVBQzFCLEtBQTJCLEVBQ0ssRUFBRTtJQUNsQyxPQUFPLENBQUMsR0FBRyxDQUFDLDRDQUE0QyxDQUFDLENBQUM7SUFFMUQsSUFBSSxDQUFDO1FBQ0gscUJBQXFCO1FBQ3JCLElBQUksQ0FBQyxLQUFLLENBQUMsSUFBSSxFQUFFLENBQUM7WUFDaEIsT0FBTztnQkFDTCxVQUFVLEVBQUUsR0FBRztnQkFDZixJQUFJLEVBQUUsSUFBSSxDQUFDLFNBQVMsQ0FBQyxFQUFFLEtBQUssRUFBRSwwQkFBMEIsRUFBRSxDQUFDO2FBQzVELENBQUM7UUFDSixDQUFDO1FBRUQseUNBQXlDO1FBQ3pDLE1BQU0sTUFBTSxHQUFJLEtBQUssQ0FBQyxjQUFzQixDQUFDLFVBQVUsRUFBRSxXQUFXLENBQUM7UUFDckUsSUFBSSxDQUFDLE1BQU0sRUFBRSxDQUFDO1lBQ1osT0FBTztnQkFDTCxVQUFVLEVBQUUsR0FBRztnQkFDZixJQUFJLEVBQUUsSUFBSSxDQUFDLFNBQVMsQ0FBQyxFQUFFLEtBQUssRUFBRSxjQUFjLEVBQUUsQ0FBQzthQUNoRCxDQUFDO1FBQ0osQ0FBQztRQUVELGtDQUFrQztRQUNsQyxNQUFNLFNBQVMsR0FBRyxLQUFLLENBQUMscUJBQXFCLEVBQUUsQ0FBQyxXQUFXLENBQUMsQ0FBQztRQUM3RCxJQUFJLENBQUMsU0FBUyxFQUFFLENBQUM7WUFDZixPQUFPO2dCQUNMLFVBQVUsRUFBRSxHQUFHO2dCQUNmLElBQUksRUFBRSxJQUFJLENBQUMsU0FBUyxDQUFDLEVBQUUsS0FBSyxFQUFFLHVCQUF1QixFQUFFLENBQUM7YUFDekQsQ0FBQztRQUNKLENBQUM7UUFFRCw2QkFBNkI7UUFDN0IsTUFBTSxFQUFFLFdBQVcsRUFBRSxHQUFHLElBQUksQ0FBQyxLQUFLLENBQUMsS0FBSyxDQUFDLElBQUksQ0FBZ0IsQ0FBQztRQUM5RCxJQUFJLENBQUMsV0FBVyxFQUFFLENBQUM7WUFDakIsT0FBTztnQkFDTCxVQUFVLEVBQUUsR0FBRztnQkFDZixJQUFJLEVBQUUsSUFBSSxDQUFDLFNBQVMsQ0FBQztvQkFDbkIsS0FBSyxFQUFFLDBCQUEwQjtpQkFDbEMsQ0FBQzthQUNILENBQUM7UUFDSixDQUFDO1FBRUQsdUNBQXVDO1FBQ3ZDLE1BQU0sRUFBRSxvQkFBb0IsRUFBRSxjQUFjLEVBQUUsR0FDNUMsTUFBTSxJQUFBLHNDQUE0QixFQUFDLE1BQU0sRUFBRSxzQkFBWSxDQUFDLFNBQVMsQ0FBQyxDQUFDO1FBRXJFLE9BQU8sQ0FBQyxHQUFHLENBQ1QsK0JBQStCLEVBQy9CLG9CQUFvQixFQUNwQixjQUFjLENBQ2YsQ0FBQztRQUVGLElBQUksQ0FBQyxvQkFBb0IsRUFBRSxDQUFDO1lBQzFCLE9BQU87Z0JBQ0wsVUFBVSxFQUFFLEdBQUc7Z0JBQ2YsSUFBSSxFQUFFLElBQUksQ0FBQyxTQUFTLENBQUMsRUFBRSxLQUFLLEVBQUUsc0JBQXNCLEVBQUUsQ0FBQzthQUN4RCxDQUFDO1FBQ0osQ0FBQztRQUVELE1BQU0sSUFBSSxHQUFHLFFBQVEsQ0FBQyxTQUFTLENBQUMsQ0FBQztRQUNqQyxNQUFNLE9BQU8sR0FBRyxFQUFFLENBQUM7UUFFbkIsTUFBTSxRQUFRLEdBQUcsTUFBTSxJQUFBLHFCQUFhLEVBQ2xDLFdBQVcsRUFDWCxPQUFPLEVBQ1AsTUFBTSxFQUNOLFNBQVMsRUFDVCxJQUFJLEVBQ0osT0FBTyxDQUNSLENBQUM7UUFFRixPQUFPLENBQUMsR0FBRyxDQUFDLGtDQUFrQyxFQUFFLFFBQVEsQ0FBQyxDQUFDO1FBRTFELGlCQUFpQjtRQUNqQixNQUFNLGlCQUFpQixHQUFHLE1BQU0sSUFBQSxxQ0FBMkIsRUFDekQsTUFBTSxFQUNOLHNCQUFZLENBQUMsU0FBUyxDQUN2QixDQUFDO1FBRUYsT0FBTyxDQUFDLEdBQUcsQ0FBQyw4QkFBOEIsRUFBRSxpQkFBaUIsQ0FBQyxDQUFDO1FBRS9ELDBCQUEwQjtRQUMxQixPQUFPO1lBQ0wsVUFBVSxFQUFFLEdBQUc7WUFDZixJQUFJLEVBQUUsSUFBSSxDQUFDLFNBQVMsQ0FBQztnQkFDbkIsUUFBUTthQUNULENBQUM7U0FDSCxDQUFDO0lBQ0osQ0FBQztJQUFDLE9BQU8sS0FBSyxFQUFFLENBQUM7UUFDZixPQUFPLENBQUMsS0FBSyxDQUFDLDhCQUE4QixFQUFFLEtBQUssQ0FBQyxDQUFDO1FBRXJELE9BQU87WUFDTCxVQUFVLEVBQUUsR0FBRztZQUNmLElBQUksRUFBRSxJQUFJLENBQUMsU0FBUyxDQUFDO2dCQUNuQixLQUFLLEVBQUUsdUJBQXVCO2dCQUM5QixPQUFPLEVBQ0wsS0FBSyxZQUFZLEtBQUssQ0FBQyxDQUFDLENBQUMsS0FBSyxDQUFDLE9BQU8sQ0FBQyxDQUFDLENBQUMsd0JBQXdCO2FBQ3BFLENBQUM7U0FDSCxDQUFDO0lBQ0osQ0FBQztBQUNILENBQUMsQ0FBQztBQXJHVyxRQUFBLE9BQU8sV0FxR2xCIiwic291cmNlc0NvbnRlbnQiOlsiaW1wb3J0IHsgQVBJR2F0ZXdheVByb3h5RXZlbnQsIEFQSUdhdGV3YXlQcm94eVJlc3VsdCB9IGZyb20gJ2F3cy1sYW1iZGEnO1xuXG5pbXBvcnQgeyBnZW5lcmF0ZUltYWdlIH0gZnJvbSAnLi4vdXRpbHMvaW1hZ2UnO1xuaW1wb3J0IHsgU2NlbmUgfSBmcm9tICcuLi91dGlscy9zY3JpcHQnO1xuXG5pbXBvcnQgeyBicm9hZGNhc3RQcm9ncmVzcyB9IGZyb20gJy4uL3ZpZGVvLWdlbmVyYXRpb24nO1xuaW1wb3J0IHsgQ1JFRElUU19DT1NUIH0gZnJvbSAnLi4vdXRpbHMvY3JlZGl0cyc7XG5cbmltcG9ydCB7XG4gIGhhc1N1ZmZpY2llbnRDcmVkaXRzQnlVc2VySWQsXG4gIHVwZGF0ZUNyZWRpdEJhbGFuY2VCeVVzZXJJZCxcbn0gZnJvbSAnLi4vdXRpbHMvY3JlZGl0cyc7XG5cbmludGVyZmFjZSBSZXF1ZXN0Qm9keSB7XG4gIGltYWdlUHJvbXB0OiBzdHJpbmc7XG59XG5cbmV4cG9ydCBjb25zdCBoYW5kbGVyID0gYXN5bmMgKFxuICBldmVudDogQVBJR2F0ZXdheVByb3h5RXZlbnQsXG4pOiBQcm9taXNlPEFQSUdhdGV3YXlQcm94eVJlc3VsdD4gPT4ge1xuICBjb25zb2xlLmxvZygn8J+OqCBJbWFnZSBHZW5lcmF0aW9uIExhbWJkYSBoYW5kbGVyIHN0YXJ0ZWQnKTtcblxuICB0cnkge1xuICAgIC8vIFBhcnNlIHJlcXVlc3QgYm9keVxuICAgIGlmICghZXZlbnQuYm9keSkge1xuICAgICAgcmV0dXJuIHtcbiAgICAgICAgc3RhdHVzQ29kZTogNDAwLFxuICAgICAgICBib2R5OiBKU09OLnN0cmluZ2lmeSh7IGVycm9yOiAnUmVxdWVzdCBib2R5IGlzIHJlcXVpcmVkJyB9KSxcbiAgICAgIH07XG4gICAgfVxuXG4gICAgLy8gZ2V0IHVzZXJJZCBmcm9tIHRoZSBhdXRob3JpemVyIGNvbnRleHRcbiAgICBjb25zdCB1c2VySWQgPSAoZXZlbnQucmVxdWVzdENvbnRleHQgYXMgYW55KS5hdXRob3JpemVyPy5wcmluY2lwYWxJZDtcbiAgICBpZiAoIXVzZXJJZCkge1xuICAgICAgcmV0dXJuIHtcbiAgICAgICAgc3RhdHVzQ29kZTogNDAxLFxuICAgICAgICBib2R5OiBKU09OLnN0cmluZ2lmeSh7IGVycm9yOiAnVW5hdXRob3JpemVkJyB9KSxcbiAgICAgIH07XG4gICAgfVxuXG4gICAgLy8gZ2V0IHRpbWVzdGFtcCBmcm9tIHF1ZXJ5IHN0cmluZ1xuICAgIGNvbnN0IHRpbWVzdGFtcCA9IGV2ZW50LnF1ZXJ5U3RyaW5nUGFyYW1ldGVycz8uWyd0aW1lc3RhbXAnXTtcbiAgICBpZiAoIXRpbWVzdGFtcCkge1xuICAgICAgcmV0dXJuIHtcbiAgICAgICAgc3RhdHVzQ29kZTogNDAwLFxuICAgICAgICBib2R5OiBKU09OLnN0cmluZ2lmeSh7IGVycm9yOiAnVGltZXN0YW1wIGlzIHJlcXVpcmVkJyB9KSxcbiAgICAgIH07XG4gICAgfVxuXG4gICAgLy8gZ2V0IHNjZW5lIG9iamVjdCBmcm9tIGJvZHlcbiAgICBjb25zdCB7IGltYWdlUHJvbXB0IH0gPSBKU09OLnBhcnNlKGV2ZW50LmJvZHkpIGFzIFJlcXVlc3RCb2R5O1xuICAgIGlmICghaW1hZ2VQcm9tcHQpIHtcbiAgICAgIHJldHVybiB7XG4gICAgICAgIHN0YXR1c0NvZGU6IDQwMCxcbiAgICAgICAgYm9keTogSlNPTi5zdHJpbmdpZnkoe1xuICAgICAgICAgIGVycm9yOiAnSW1hZ2UgcHJvbXB0IGlzIHJlcXVpcmVkJyxcbiAgICAgICAgfSksXG4gICAgICB9O1xuICAgIH1cblxuICAgIC8vIENoZWNrIGlmIHVzZXIgaGFzIHN1ZmZpY2llbnQgY3JlZGl0c1xuICAgIGNvbnN0IHsgaGFzU3VmZmljaWVudENyZWRpdHMsIGN1cnJlbnRDcmVkaXRzIH0gPVxuICAgICAgYXdhaXQgaGFzU3VmZmljaWVudENyZWRpdHNCeVVzZXJJZCh1c2VySWQsIENSRURJVFNfQ09TVC5uZXdfaW1hZ2UpO1xuXG4gICAgY29uc29sZS5sb2coXG4gICAgICAnaGFzQ3JlZGl0cyAvIGN1cnJlbnQgY3JlZGl0czonLFxuICAgICAgaGFzU3VmZmljaWVudENyZWRpdHMsXG4gICAgICBjdXJyZW50Q3JlZGl0cyxcbiAgICApO1xuXG4gICAgaWYgKCFoYXNTdWZmaWNpZW50Q3JlZGl0cykge1xuICAgICAgcmV0dXJuIHtcbiAgICAgICAgc3RhdHVzQ29kZTogNDAwLFxuICAgICAgICBib2R5OiBKU09OLnN0cmluZ2lmeSh7IGVycm9yOiAnSW5zdWZmaWNpZW50IGNyZWRpdHMnIH0pLFxuICAgICAgfTtcbiAgICB9XG5cbiAgICBjb25zdCBzZWVkID0gcGFyc2VJbnQodGltZXN0YW1wKTtcbiAgICBjb25zdCBzY2VuZUlkID0gOTk7XG5cbiAgICBjb25zdCBpbWFnZVVybCA9IGF3YWl0IGdlbmVyYXRlSW1hZ2UoXG4gICAgICBpbWFnZVByb21wdCxcbiAgICAgIHNjZW5lSWQsXG4gICAgICB1c2VySWQsXG4gICAgICB0aW1lc3RhbXAsXG4gICAgICBzZWVkLFxuICAgICAgc2NlbmVJZCxcbiAgICApO1xuXG4gICAgY29uc29sZS5sb2coJ/CfjqggSW1hZ2UgZ2VuZXJhdGVkIHN1Y2Nlc3NmdWxseTonLCBpbWFnZVVybCk7XG5cbiAgICAvLyBEZWR1Y3QgY3JlZGl0c1xuICAgIGNvbnN0IG5ld0N1cnJlbnRDcmVkaXRzID0gYXdhaXQgdXBkYXRlQ3JlZGl0QmFsYW5jZUJ5VXNlcklkKFxuICAgICAgdXNlcklkLFxuICAgICAgQ1JFRElUU19DT1NULm5ld19pbWFnZSxcbiAgICApO1xuXG4gICAgY29uc29sZS5sb2coJ25ldyBjcmVkaXRzIGFmdGVyIGRlZHVjdGlvbjonLCBuZXdDdXJyZW50Q3JlZGl0cyk7XG5cbiAgICAvLyBSZXR1cm4gc3VjY2VzcyByZXNwb25zZVxuICAgIHJldHVybiB7XG4gICAgICBzdGF0dXNDb2RlOiAyMDAsXG4gICAgICBib2R5OiBKU09OLnN0cmluZ2lmeSh7XG4gICAgICAgIGltYWdlVXJsLFxuICAgICAgfSksXG4gICAgfTtcbiAgfSBjYXRjaCAoZXJyb3IpIHtcbiAgICBjb25zb2xlLmVycm9yKCfinYwgRXJyb3IgaW4gaW1hZ2UgZ2VuZXJhdGlvbjonLCBlcnJvcik7XG5cbiAgICByZXR1cm4ge1xuICAgICAgc3RhdHVzQ29kZTogNTAwLFxuICAgICAgYm9keTogSlNPTi5zdHJpbmdpZnkoe1xuICAgICAgICBlcnJvcjogJ0ludGVybmFsIHNlcnZlciBlcnJvcicsXG4gICAgICAgIG1lc3NhZ2U6XG4gICAgICAgICAgZXJyb3IgaW5zdGFuY2VvZiBFcnJvciA/IGVycm9yLm1lc3NhZ2UgOiAnVW5rbm93biBlcnJvciBvY2N1cnJlZCcsXG4gICAgICB9KSxcbiAgICB9O1xuICB9XG59O1xuIl19