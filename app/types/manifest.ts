export interface ManifestFile {
  mp3: string;
  mp4: string;
  combined: string;
  jpg?: string;
  png?: string;
  subtitle: string;
  ass: string;
  duration: number;
}

export interface ManifestScene {
  scenePosition: number;
  id: number;
  removed?: boolean;
  files: ManifestFile;
}

export interface Manifest {
  schemaVersion: number;
  userId: string;
  bucket: string;
  prefix: string;
  generatedAt: string;
  updatedAt: string;
  sceneCount: number;
  scenes: ManifestScene[];
  timestamp?: string;
  finalVideoUrl?: string;
  totalDuration?: number;
  size?: string;
}
