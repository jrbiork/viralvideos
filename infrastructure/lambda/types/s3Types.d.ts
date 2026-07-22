export interface ManifestFile {
    mp3: string;
    mp4: string;
    combined?: string;
    jpg?: string;
    png?: string;
    subtitle: string;
    ass: string;
    duration: number;
}
export interface ManifestScene {
    id: number;
    scenePosition: number;
    removed: boolean;
    animated: boolean;
    animationPrompt?: string;
    files: ManifestFile;
}
export interface Manifest {
    schemaVersion: number;
    key: string;
    timestamp: string;
    bucket: string;
    userId: string;
    prefix: string;
    generatedAt: string;
    videoGenerated: boolean;
    isCombining?: boolean;
    updatedAt: string;
    sceneCount: number;
    totalDuration: number;
    finalVideoUrl: string;
    size: string;
    scenes: ManifestScene[];
    voiceToneInstruction: string;
    voice: string;
    language: string;
    template: string;
}
