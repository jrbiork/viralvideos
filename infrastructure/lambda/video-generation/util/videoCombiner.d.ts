import { Manifest } from '../../types/s3Types';
import { UserItem } from '../../utils/user';
export interface Scene {
    description: string;
    duration: number;
    narration: string;
    id: number;
}
export declare function combineVideoAndAudio(userId: string, timestamp: string, manifest: Manifest, removedScenes: number[] | undefined, user: UserItem | null): Promise<{
    finalVideoSignedUrl: string;
    size: string;
}>;
