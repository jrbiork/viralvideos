export declare const ANIMATION_DURATION_SECONDS = 5;
/**
 * Animates a scene's existing image into a fixed 5s video via Runway's
 * gen4_turbo image-to-video model, uploading the result to the same S3 key
 * the Ken-Burns effect would otherwise occupy
 * (`${userId}/${timestamp}.scene-${sceneId}.mp4`), then returns a presigned
 * URL to the uploaded clip.
 */
export declare function animateSceneImage(imageUrl: string, prompt: string, sceneId: number, userId: string, timestamp: string): Promise<string>;
