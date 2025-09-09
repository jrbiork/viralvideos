import { Scene } from '../video-generation/script';
export interface SubtitleWord {
    word: string;
    start: number;
    end: number;
}
export interface SubtitleData {
    scenePosition: number;
    words: SubtitleWord[];
    fullText: string;
    duration?: number;
}
export interface NarrationResult {
    subtitles: SubtitleData[];
}
export interface TranscriptionResponse {
    task: string;
    language: string;
    duration: number;
    text: string;
    words: SubtitleWord[];
    usage: {
        type: string;
        seconds: number;
    };
}
/**
 * Adjusts audio duration to match target duration using FFmpeg
 * @param audioBuffer - The original audio buffer
 * @param targetDuration - The target duration in seconds
 * @returns Promise<Buffer> - The adjusted audio buffer
 */
export declare function generateNarration(scenes: Scene[], userId: string, timestamp: string, instructions?: string, voice?: string, language?: string): Promise<NarrationResult>;
