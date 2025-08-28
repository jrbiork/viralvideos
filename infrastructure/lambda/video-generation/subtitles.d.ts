import { Scene } from './script';
import { SubtitleData } from './audio';
export declare function generateSubtitles(scenes: Scene[], userId: string, timestamp: string, subtitleData?: SubtitleData[]): Promise<Array<{
    [key: string]: string;
}>>;
export declare function generateSubtitleUrls(scenes: Scene[], userId: string, timestamp: string, subtitleData?: SubtitleData[]): Promise<Array<{
    [key: string]: string;
}>>;
