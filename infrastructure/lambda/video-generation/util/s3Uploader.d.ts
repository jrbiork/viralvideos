export declare function uploadToS3(filePath: string, userId: string, timestamp: string): Promise<string>;
export declare function uploadJsonToS3(jsonContent: string, key: string, bucketName?: string): Promise<string>;
export declare function getObjectFromS3(key: string, bucketName?: string): Promise<any | null>;
