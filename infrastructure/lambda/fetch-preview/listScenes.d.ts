import { S3Client } from '@aws-sdk/client-s3';
export declare function listScenes(s3: S3Client, Bucket: string, userId: string, timestamp: string, expiresIn?: number): Promise<{
    scenes: any;
    sceneCount: number;
}>;
