"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.broadcastProgress = broadcastProgress;
const websocket_broadcast_1 = require("../websocket-broadcast");
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiYnJvYWRjYXN0UHJvZ3Jlc3MuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyJicm9hZGNhc3RQcm9ncmVzcy50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiOztBQUdBLDhDQTJDQztBQTlDRCxnRUFBMEQ7QUFFMUQsdUVBQXVFO0FBQ2hFLEtBQUssVUFBVSxpQkFBaUIsQ0FDckMsTUFTVyxFQUNYLE1BQWMsRUFDZCxTQUFpQixFQUNqQixJQUFVLEVBQ1YsT0FBZ0I7SUFFaEIsSUFBSSxDQUFDO1FBQ0gsTUFBTSxlQUFlLEdBQUc7WUFDdEIsTUFBTTtZQUNOLElBQUksRUFBRTtnQkFDSixNQUFNO2dCQUNOLFNBQVM7Z0JBQ1QsT0FBTztnQkFDUCxHQUFHLElBQUk7YUFDUjtTQUNGLENBQUM7UUFFRixnRUFBZ0U7UUFDaEUsTUFBTSxVQUFVLEdBQUcsT0FBTyxDQUFDLEdBQUcsQ0FBQyxxQkFBcUIsQ0FBQztRQUNyRCxNQUFNLEtBQUssR0FBRyxPQUFPLENBQUMsR0FBRyxDQUFDLGVBQWUsSUFBSSxNQUFNLENBQUM7UUFFcEQsSUFBSSxVQUFVLEVBQUUsQ0FBQztZQUNmLE1BQU0sSUFBQSxzQ0FBZ0IsRUFBQyxlQUFlLEVBQUUsVUFBVSxFQUFFLEtBQUssRUFBRSxNQUFNLENBQUMsQ0FBQztZQUNuRSxPQUFPLENBQUMsR0FBRyxDQUFDLG9DQUFvQyxNQUFNLE1BQU0sT0FBTyxFQUFFLENBQUMsQ0FBQztRQUN6RSxDQUFDO2FBQU0sQ0FBQztZQUNOLE9BQU8sQ0FBQyxHQUFHLENBQ1Qsb0RBQW9ELE1BQU0sTUFBTSxPQUFPLEVBQUUsQ0FDMUUsQ0FBQztRQUNKLENBQUM7SUFDSCxDQUFDO0lBQUMsT0FBTyxLQUFLLEVBQUUsQ0FBQztRQUNmLE9BQU8sQ0FBQyxLQUFLLENBQUMsb0NBQW9DLEVBQUUsS0FBSyxDQUFDLENBQUM7UUFDM0QsdURBQXVEO0lBQ3pELENBQUM7QUFDSCxDQUFDIiwic291cmNlc0NvbnRlbnQiOlsiaW1wb3J0IHsgYnJvYWRjYXN0TWVzc2FnZSB9IGZyb20gJy4uL3dlYnNvY2tldC1icm9hZGNhc3QnO1xuXG4vLyBIZWxwZXIgZnVuY3Rpb24gdG8gYnJvYWRjYXN0IHZpZGVvIGdlbmVyYXRpb24gcHJvZ3Jlc3MgdmlhIFdlYlNvY2tldFxuZXhwb3J0IGFzeW5jIGZ1bmN0aW9uIGJyb2FkY2FzdFByb2dyZXNzKFxuICBhY3Rpb246XG4gICAgfCAnc2NyaXB0X2NyZWF0ZWQnXG4gICAgfCAnaW1hZ2VfY3JlYXRlZCdcbiAgICB8ICdhdWRpb19zdWJ0aXRsZV9jcmVhdGVkJ1xuICAgIHwgJ3ZpZGVvX3NjZW5lX2NyZWF0ZWQnXG4gICAgfCAncHJldmlld19jb21wbGV0ZWQnXG4gICAgfCAndmlkZW9fY29tcGxldGVkJ1xuICAgIHwgJ2NyZWRpdF91cGRhdGVkJ1xuICAgIHwgJ2luc3VmZmljaWVudF9jcmVkaXRzJ1xuICAgIHwgJ2Vycm9yJyxcbiAgdXNlcklkOiBzdHJpbmcsXG4gIHRpbWVzdGFtcDogc3RyaW5nLFxuICBkYXRhPzogYW55LFxuICBtZXNzYWdlPzogc3RyaW5nLFxuKTogUHJvbWlzZTx2b2lkPiB7XG4gIHRyeSB7XG4gICAgY29uc3QgcHJvZ3Jlc3NNZXNzYWdlID0ge1xuICAgICAgYWN0aW9uLFxuICAgICAgZGF0YToge1xuICAgICAgICB1c2VySWQsXG4gICAgICAgIHRpbWVzdGFtcCxcbiAgICAgICAgbWVzc2FnZSxcbiAgICAgICAgLi4uZGF0YSxcbiAgICAgIH0sXG4gICAgfTtcblxuICAgIC8vIEdldCB0aGUgV2ViU29ja2V0IGRvbWFpbiBhbmQgc3RhZ2UgZnJvbSBlbnZpcm9ubWVudCB2YXJpYWJsZXNcbiAgICBjb25zdCBkb21haW5OYW1lID0gcHJvY2Vzcy5lbnYuV0VCU09DS0VUX0RPTUFJTl9OQU1FO1xuICAgIGNvbnN0IHN0YWdlID0gcHJvY2Vzcy5lbnYuV0VCU09DS0VUX1NUQUdFIHx8ICdwcm9kJztcblxuICAgIGlmIChkb21haW5OYW1lKSB7XG4gICAgICBhd2FpdCBicm9hZGNhc3RNZXNzYWdlKHByb2dyZXNzTWVzc2FnZSwgZG9tYWluTmFtZSwgc3RhZ2UsIHVzZXJJZCk7XG4gICAgICBjb25zb2xlLmxvZyhg8J+ToSBXZWJTb2NrZXQgcHJvZ3Jlc3MgYnJvYWRjYXN0OiAke2FjdGlvbn0gLSAke21lc3NhZ2V9YCk7XG4gICAgfSBlbHNlIHtcbiAgICAgIGNvbnNvbGUubG9nKFxuICAgICAgICBg8J+ToSBXZWJTb2NrZXQgbm90IGNvbmZpZ3VyZWQsIHNraXBwaW5nIGJyb2FkY2FzdDogJHthY3Rpb259IC0gJHttZXNzYWdlfWAsXG4gICAgICApO1xuICAgIH1cbiAgfSBjYXRjaCAoZXJyb3IpIHtcbiAgICBjb25zb2xlLmVycm9yKCdFcnJvciBicm9hZGNhc3RpbmcgdmlkZW8gcHJvZ3Jlc3M6JywgZXJyb3IpO1xuICAgIC8vIERvbid0IHRocm93IGVycm9yIHRvIGF2b2lkIGJyZWFraW5nIHRoZSBtYWluIHByb2Nlc3NcbiAgfVxufVxuIl19