import { Scene } from '../narration';
interface ManifestFile {
    mp3: string;
    mp4: string;
    combined: string;
    jpg: string;
    subtitle: string;
    ass: string;
}
interface ManifestScene {
    sceneIndex: number;
    files: ManifestFile;
}
interface VideoManifest {
    schemaVersion: number;
    userId: string;
    bucket: string;
    prefix: string;
    generatedAt: string;
    updatedAt: string;
    sceneCount: number;
    scenes: ManifestScene[];
}
export declare function createManifest(userId: string, timestamp: string, scenes: Scene[]): Promise<string>;
export declare function getManifest(userId: string, timestamp: string): Promise<VideoManifest | null>;
export declare function updateManifest(userId: string, timestamp: string, updates: Partial<VideoManifest>): Promise<string>;
export {};
