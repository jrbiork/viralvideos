"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.uploadToS3 = exports.combineVideoAndAudio = void 0;
var videoCombiner_1 = require("./videoCombiner");
Object.defineProperty(exports, "combineVideoAndAudio", { enumerable: true, get: function () { return videoCombiner_1.combineVideoAndAudio; } });
var s3Uploader_1 = require("./util/s3Uploader");
Object.defineProperty(exports, "uploadToS3", { enumerable: true, get: function () { return s3Uploader_1.uploadToS3; } });
