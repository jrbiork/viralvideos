import { Scene } from '../video-generation/script';
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
    subtitles: SubtitleData[];
    narrationUrls: Array<{
        [key: string]: string;
    }>;
}
/**
 * Adjusts audio duration to match target duration using FFmpeg
 * @param audioBuffer - The original audio buffer
 * @param targetDuration - The target duration in seconds
 * @returns Promise<Buffer> - The adjusted audio buffer
 */
export declare function generateNarration(scenes: Scene[], userId: string, timestamp: string, instructions?: string, voice?: string, language?: string): Promise<NarrationResult>;
