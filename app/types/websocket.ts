import { Manifest } from './manifest';

export type WebSocketAction =
  | 'script_created'
  | 'image_created'
  | 'audio_subtitle_created'
  | 'video_scene_created'
  | 'preview_completed'
  | 'video_completed'
  | 'scene_animated'
  | 'ping'
  | 'error';

export interface WebSocketMessage {
  action: WebSocketAction;
  data: {
    userId: string;
    timestamp: string;
    message?: string;
    manifest?: Manifest;
    sceneId?: number;
    videoUrl?: string;
    animationPrompt?: string;
  };
}
