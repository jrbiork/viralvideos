export interface Scene {
    description: string;
    duration: number;
    narration: string;
}
export declare function combineVideoAndAudio(userId: string, timestamp: string, scenes?: Scene[]): Promise<string>;
