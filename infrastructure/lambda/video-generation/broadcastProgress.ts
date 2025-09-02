import { broadcastMessage } from '../websocket-broadcast';

// Helper function to broadcast video generation progress via WebSocket
export async function broadcastProgress(
  action:
    | 'script_created'
    | 'image_created'
    | 'audio_subtitle_created'
    | 'video_scene_created'
    | 'preview_completed'
    | 'video_completed'
    | 'credit_updated',
  userId: string,
  timestamp: string,
  data?: any,
  message?: string,
): Promise<void> {
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
      await broadcastMessage(progressMessage, domainName, stage, userId);
      console.log(`📡 WebSocket progress broadcast: ${action} - ${message}`);
    } else {
      console.log(
        `📡 WebSocket not configured, skipping broadcast: ${action} - ${message}`,
      );
    }
  } catch (error) {
    console.error('Error broadcasting video progress:', error);
    // Don't throw error to avoid breaking the main process
  }
}
