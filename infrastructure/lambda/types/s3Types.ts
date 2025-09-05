export interface ManifestFile {
  mp3: string;
  mp4: string;
  combined?: string;
  jpg?: string;
  png?: string;
  subtitle: string;
  ass: string;
}

export interface ManifestScene {
  sceneIndex: number;
  files: ManifestFile;
}

export interface Manifest {
  schemaVersion: number;
  timestamp: string;
  bucket: string;
  userId: string;
  prefix: string;
  generatedAt: string;
  updatedAt: string;
  sceneCount: number;
  totalDuration: number;
  finalVideoUrl: string;
  scenes: ManifestScene[];
}
