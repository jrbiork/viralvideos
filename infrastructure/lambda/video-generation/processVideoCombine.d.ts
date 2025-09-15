import { SQSRecord } from 'aws-lambda';
export interface VideoCombineRequest {
    userId: string;
    timestamp: string;
    removedScenes?: number[];
}
export declare function processVideoCombine(request: VideoCombineRequest, record?: SQSRecord): Promise<any>;
