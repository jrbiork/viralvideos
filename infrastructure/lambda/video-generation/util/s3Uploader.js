"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.uploadToS3 = uploadToS3;
exports.getObjectFromS3 = getObjectFromS3;
const client_s3_1 = require("@aws-sdk/client-s3");
const fs = __importStar(require("fs"));
const s3 = new client_s3_1.S3Client({ region: process.env.AWS_REGION });
async function uploadToS3(filePath, userId, timestamp) {
    try {
        const fileBuffer = fs.readFileSync(filePath);
        const videoKey = `${userId}/${timestamp}-final-video.mp4`;
        await s3.send(new client_s3_1.PutObjectCommand({
            Bucket: process.env.VIDEO_BUCKET_NAME,
            Key: videoKey,
            Body: fileBuffer,
            ContentType: 'video/mp4',
        }));
        return videoKey;
    }
    catch (error) {
        console.error('❌ Error uploading to S3:', error);
        throw error;
    }
}
async function getObjectFromS3(key, bucketName) {
    try {
        const bucket = bucketName || process.env.VIDEO_PARTS_BUCKET_NAME;
        if (!bucket) {
            throw new Error('Bucket name not provided and VIDEO_PARTS_BUCKET_NAME not set');
        }
        const command = new client_s3_1.GetObjectCommand({
            Bucket: bucket,
            Key: key,
        });
        const response = await s3.send(command);
        if (!response.Body) {
            return null;
        }
        const streamReader = response.Body.transformToString();
        const content = await streamReader;
        try {
            return JSON.parse(content);
        }
        catch {
            return content;
        }
    }
    catch (error) {
        if (error &&
            typeof error === 'object' &&
            'name' in error &&
            error.name === 'NoSuchKey') {
            return null;
        }
        console.error(`❌ Error getting object from S3 (${key}):`, error);
        return null;
    }
}
