export interface Scene {
    description: string;
    duration: number;
    narration: string;
    id: number;
}
export declare function combineVideoAndAudio(userId: string, timestamp: string, scenes?: Scene[]): Promise<string>;
