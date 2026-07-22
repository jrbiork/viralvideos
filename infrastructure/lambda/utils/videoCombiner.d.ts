import { Manifest } from '../types/s3Types';
import { UserItem } from './user';
export interface S3FileObject {
    Key: string;
}
export interface Scene {
    description: string;
    duration: number;
    narration: string;
    id: number;
}
export declare function combineVideoAndAudio(userId: string, timestamp: string, manifest: Manifest, removedScenes: number[] | undefined, user: UserItem | null): Promise<{
    finalVideoSignedUrl: string;
    size: string;
}>;
/**
 * Processes a single scene by combining video, audio, and subtitle files
 * @param videoFile S3 object containing video file info
 * @param audioFile S3 object containing audio file info (optional)
 * @param subtitleFile S3 object containing subtitle file info (optional)
 * @param scenePosition Index of the scene being processed
 * @param userId User ID for S3 operations
 * @param timestamp Timestamp for S3 operations
 * @param isAnimated Whether this scene's video is a fixed-length Runway
 *   animation clip that should loop to cover the full audio duration
 * @returns Path to the combined scene file
 */
export declare function processScene(videoFile: S3FileObject, audioFile: S3FileObject | null, subtitleFile: S3FileObject | null, scenePosition: number, userId: string, timestamp: string, isAnimated?: boolean): Promise<string>;
