import { SQSRecord } from 'aws-lambda';
export interface VideoCombineRequest {
    userId: string;
    timestamp: string;
}
export declare function processVideoCombine(request: VideoCombineRequest, record?: SQSRecord): Promise<any>;
