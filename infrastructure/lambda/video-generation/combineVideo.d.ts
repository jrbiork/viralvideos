export interface Scene {
    description: string;
    duration: number;
    narration: string;
}
export declare function combineVideoAndAudio(userId: string, timestamp: string): Promise<string>;
export declare function uploadToS3(filePath: string, userId: string, timestamp: string): Promise<string>;
