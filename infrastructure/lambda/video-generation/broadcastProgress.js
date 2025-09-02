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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiYnJvYWRjYXN0UHJvZ3Jlc3MuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyJicm9hZGNhc3RQcm9ncmVzcy50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiOztBQUdBLDhDQXlDQztBQTVDRCxnRUFBMEQ7QUFFMUQsdUVBQXVFO0FBQ2hFLEtBQUssVUFBVSxpQkFBaUIsQ0FDckMsTUFPb0IsRUFDcEIsTUFBYyxFQUNkLFNBQWlCLEVBQ2pCLElBQVUsRUFDVixPQUFnQjtJQUVoQixJQUFJLENBQUM7UUFDSCxNQUFNLGVBQWUsR0FBRztZQUN0QixNQUFNO1lBQ04sSUFBSSxFQUFFO2dCQUNKLE1BQU07Z0JBQ04sU0FBUztnQkFDVCxPQUFPO2dCQUNQLEdBQUcsSUFBSTthQUNSO1NBQ0YsQ0FBQztRQUVGLGdFQUFnRTtRQUNoRSxNQUFNLFVBQVUsR0FBRyxPQUFPLENBQUMsR0FBRyxDQUFDLHFCQUFxQixDQUFDO1FBQ3JELE1BQU0sS0FBSyxHQUFHLE9BQU8sQ0FBQyxHQUFHLENBQUMsZUFBZSxJQUFJLE1BQU0sQ0FBQztRQUVwRCxJQUFJLFVBQVUsRUFBRSxDQUFDO1lBQ2YsTUFBTSxJQUFBLHNDQUFnQixFQUFDLGVBQWUsRUFBRSxVQUFVLEVBQUUsS0FBSyxFQUFFLE1BQU0sQ0FBQyxDQUFDO1lBQ25FLE9BQU8sQ0FBQyxHQUFHLENBQUMsb0NBQW9DLE1BQU0sTUFBTSxPQUFPLEVBQUUsQ0FBQyxDQUFDO1FBQ3pFLENBQUM7YUFBTSxDQUFDO1lBQ04sT0FBTyxDQUFDLEdBQUcsQ0FDVCxvREFBb0QsTUFBTSxNQUFNLE9BQU8sRUFBRSxDQUMxRSxDQUFDO1FBQ0osQ0FBQztJQUNILENBQUM7SUFBQyxPQUFPLEtBQUssRUFBRSxDQUFDO1FBQ2YsT0FBTyxDQUFDLEtBQUssQ0FBQyxvQ0FBb0MsRUFBRSxLQUFLLENBQUMsQ0FBQztRQUMzRCx1REFBdUQ7SUFDekQsQ0FBQztBQUNILENBQUMiLCJzb3VyY2VzQ29udGVudCI6WyJpbXBvcnQgeyBicm9hZGNhc3RNZXNzYWdlIH0gZnJvbSAnLi4vd2Vic29ja2V0LWJyb2FkY2FzdCc7XG5cbi8vIEhlbHBlciBmdW5jdGlvbiB0byBicm9hZGNhc3QgdmlkZW8gZ2VuZXJhdGlvbiBwcm9ncmVzcyB2aWEgV2ViU29ja2V0XG5leHBvcnQgYXN5bmMgZnVuY3Rpb24gYnJvYWRjYXN0UHJvZ3Jlc3MoXG4gIGFjdGlvbjpcbiAgICB8ICdzY3JpcHRfY3JlYXRlZCdcbiAgICB8ICdpbWFnZV9jcmVhdGVkJ1xuICAgIHwgJ2F1ZGlvX3N1YnRpdGxlX2NyZWF0ZWQnXG4gICAgfCAndmlkZW9fc2NlbmVfY3JlYXRlZCdcbiAgICB8ICdwcmV2aWV3X2NvbXBsZXRlZCdcbiAgICB8ICd2aWRlb19jb21wbGV0ZWQnXG4gICAgfCAnY3JlZGl0X3VwZGF0ZWQnLFxuICB1c2VySWQ6IHN0cmluZyxcbiAgdGltZXN0YW1wOiBzdHJpbmcsXG4gIGRhdGE/OiBhbnksXG4gIG1lc3NhZ2U/OiBzdHJpbmcsXG4pOiBQcm9taXNlPHZvaWQ+IHtcbiAgdHJ5IHtcbiAgICBjb25zdCBwcm9ncmVzc01lc3NhZ2UgPSB7XG4gICAgICBhY3Rpb24sXG4gICAgICBkYXRhOiB7XG4gICAgICAgIHVzZXJJZCxcbiAgICAgICAgdGltZXN0YW1wLFxuICAgICAgICBtZXNzYWdlLFxuICAgICAgICAuLi5kYXRhLFxuICAgICAgfSxcbiAgICB9O1xuXG4gICAgLy8gR2V0IHRoZSBXZWJTb2NrZXQgZG9tYWluIGFuZCBzdGFnZSBmcm9tIGVudmlyb25tZW50IHZhcmlhYmxlc1xuICAgIGNvbnN0IGRvbWFpbk5hbWUgPSBwcm9jZXNzLmVudi5XRUJTT0NLRVRfRE9NQUlOX05BTUU7XG4gICAgY29uc3Qgc3RhZ2UgPSBwcm9jZXNzLmVudi5XRUJTT0NLRVRfU1RBR0UgfHwgJ3Byb2QnO1xuXG4gICAgaWYgKGRvbWFpbk5hbWUpIHtcbiAgICAgIGF3YWl0IGJyb2FkY2FzdE1lc3NhZ2UocHJvZ3Jlc3NNZXNzYWdlLCBkb21haW5OYW1lLCBzdGFnZSwgdXNlcklkKTtcbiAgICAgIGNvbnNvbGUubG9nKGDwn5OhIFdlYlNvY2tldCBwcm9ncmVzcyBicm9hZGNhc3Q6ICR7YWN0aW9ufSAtICR7bWVzc2FnZX1gKTtcbiAgICB9IGVsc2Uge1xuICAgICAgY29uc29sZS5sb2coXG4gICAgICAgIGDwn5OhIFdlYlNvY2tldCBub3QgY29uZmlndXJlZCwgc2tpcHBpbmcgYnJvYWRjYXN0OiAke2FjdGlvbn0gLSAke21lc3NhZ2V9YCxcbiAgICAgICk7XG4gICAgfVxuICB9IGNhdGNoIChlcnJvcikge1xuICAgIGNvbnNvbGUuZXJyb3IoJ0Vycm9yIGJyb2FkY2FzdGluZyB2aWRlbyBwcm9ncmVzczonLCBlcnJvcik7XG4gICAgLy8gRG9uJ3QgdGhyb3cgZXJyb3IgdG8gYXZvaWQgYnJlYWtpbmcgdGhlIG1haW4gcHJvY2Vzc1xuICB9XG59XG4iXX0=