import { Scene } from '../narration';
import { Manifest } from '../../types/s3Types';
export declare function createManifest(userId: string, timestamp: string, scenes: Scene[], finalVideoUrl: string, totalDuration: number): Promise<string>;
export declare function getManifest(userId: string, timestamp: string): Promise<Manifest | null>;
export declare function updateManifest(existingManifest: Manifest, updates: Partial<Manifest>): Promise<Manifest>;
export declare function hydrateManifest(manifest: Manifest | null): Promise<Manifest | null>;
