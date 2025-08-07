import { Scene } from './script';
export interface SubtitleWord {
    word: string;
    start: number;
    end: number;
}
export interface SubtitleData {
    sceneIndex: number;
    words: SubtitleWord[];
    fullText: string;
}
export interface NarrationResult {
    audioKeys: string[];
    subtitles: SubtitleData[];
}
/**
 * Adjusts audio duration to match target duration using FFmpeg
 * @param audioBuffer - The original audio buffer
 * @param targetDuration - The target duration in seconds
 * @returns Promise<Buffer> - The adjusted audio buffer
 */
export declare function generateNarration(scenes: Scene[], userId: string, timestamp: string): Promise<NarrationResult>;
