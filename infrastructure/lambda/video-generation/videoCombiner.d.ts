import { Manifest } from '../types/s3Types';
export interface Scene {
    description: string;
    duration: number;
    narration: string;
    id: number;
}
export declare function combineVideoAndAudio(userId: string, timestamp: string, manifest: Manifest): Promise<string>;
