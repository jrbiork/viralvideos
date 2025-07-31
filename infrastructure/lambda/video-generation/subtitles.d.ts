import { Scene, SubtitleData } from './narration';
export declare function generateSubtitles(scenes: Scene[], userId: string, timestamp: string, subtitleData?: SubtitleData[]): Promise<string[]>;
