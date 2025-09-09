export declare function uploadToS3(filePath: string, userId: string, timestamp: string): Promise<string>;
export declare function uploadJsonToS3(jsonContent: string, key: string, bucketName?: string): Promise<string>;
export declare function getObjectFromS3(key: string, bucketName?: string): Promise<any | null>;
/**
 * Download an image from a URL and upload it to S3
 * @param imageUrl - The URL of the image to download
 * @param userId - The user ID for the S3 key
 * @param timestamp - The timestamp for the S3 key
 * @param sceneId - The scene ID (optional, falls back to scenePosition)
 * @param scenePosition - The scene index (optional, falls back to sceneId)
 * @returns Promise<string> - The S3 key where the image was uploaded
 */
export declare function uploadImageToS3(imageUrl: string, userId: string, timestamp: string, sceneId?: number): Promise<string>;
