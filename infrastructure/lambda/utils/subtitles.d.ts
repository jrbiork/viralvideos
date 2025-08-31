import { Scene } from './script';
import { SubtitleData } from './audio';
export interface ASSContentResult {
    [filename: string]: string;
}
export declare function generateSubtitles(scenes: Scene[], userId: string, timestamp: string, subtitleData?: SubtitleData[]): Promise<ASSContentResult[]>;
