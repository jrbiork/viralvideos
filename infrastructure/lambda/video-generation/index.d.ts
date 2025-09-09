import { SQSEvent, SQSBatchResponse } from 'aws-lambda';
export declare const handler: (event: SQSEvent) => Promise<SQSBatchResponse>;
