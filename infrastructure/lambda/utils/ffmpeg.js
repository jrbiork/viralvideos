"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.resolveFfmpegPath = resolveFfmpegPath;
const fs = require("fs");
function isExecutable(p) {
    try {
        fs.accessSync(p, fs.constants.X_OK);
        return true;
    }
    catch {
        return false;
    }
}
function resolveFfmpegPath() {
    const candidates = [
        process.env.FFMPEG_PATH,
        '/opt/bin/ffmpeg',
        '/opt/ffmpeg',
        '/usr/bin/ffmpeg',
        '/usr/local/bin/ffmpeg',
    ].filter(Boolean);
    for (const p of candidates) {
        if (fs.existsSync(p) && isExecutable(p))
            return p;
    }
    throw new Error('FFmpeg binary not found. Expected at one of: ' +
        candidates.join(', ') +
        '. Ensure your Lambda layer provides ffmpeg (common path: /opt/bin/ffmpeg) or set FFMPEG_PATH.');
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZmZtcGVnLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsiZmZtcGVnLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiI7O0FBV0EsOENBa0JDO0FBN0JELHlCQUF5QjtBQUV6QixTQUFTLFlBQVksQ0FBQyxDQUFTO0lBQzdCLElBQUksQ0FBQztRQUNILEVBQUUsQ0FBQyxVQUFVLENBQUMsQ0FBQyxFQUFFLEVBQUUsQ0FBQyxTQUFTLENBQUMsSUFBSSxDQUFDLENBQUM7UUFDcEMsT0FBTyxJQUFJLENBQUM7SUFDZCxDQUFDO0lBQUMsTUFBTSxDQUFDO1FBQ1AsT0FBTyxLQUFLLENBQUM7SUFDZixDQUFDO0FBQ0gsQ0FBQztBQUVELFNBQWdCLGlCQUFpQjtJQUMvQixNQUFNLFVBQVUsR0FBRztRQUNqQixPQUFPLENBQUMsR0FBRyxDQUFDLFdBQVc7UUFDdkIsaUJBQWlCO1FBQ2pCLGFBQWE7UUFDYixpQkFBaUI7UUFDakIsdUJBQXVCO0tBQ3hCLENBQUMsTUFBTSxDQUFDLE9BQU8sQ0FBYSxDQUFDO0lBRTlCLEtBQUssTUFBTSxDQUFDLElBQUksVUFBVSxFQUFFLENBQUM7UUFDM0IsSUFBSSxFQUFFLENBQUMsVUFBVSxDQUFDLENBQUMsQ0FBQyxJQUFJLFlBQVksQ0FBQyxDQUFDLENBQUM7WUFBRSxPQUFPLENBQUMsQ0FBQztJQUNwRCxDQUFDO0lBRUQsTUFBTSxJQUFJLEtBQUssQ0FDYiwrQ0FBK0M7UUFDN0MsVUFBVSxDQUFDLElBQUksQ0FBQyxJQUFJLENBQUM7UUFDckIsK0ZBQStGLENBQ2xHLENBQUM7QUFDSixDQUFDIiwic291cmNlc0NvbnRlbnQiOlsiaW1wb3J0ICogYXMgZnMgZnJvbSAnZnMnO1xuXG5mdW5jdGlvbiBpc0V4ZWN1dGFibGUocDogc3RyaW5nKTogYm9vbGVhbiB7XG4gIHRyeSB7XG4gICAgZnMuYWNjZXNzU3luYyhwLCBmcy5jb25zdGFudHMuWF9PSyk7XG4gICAgcmV0dXJuIHRydWU7XG4gIH0gY2F0Y2gge1xuICAgIHJldHVybiBmYWxzZTtcbiAgfVxufVxuXG5leHBvcnQgZnVuY3Rpb24gcmVzb2x2ZUZmbXBlZ1BhdGgoKTogc3RyaW5nIHtcbiAgY29uc3QgY2FuZGlkYXRlcyA9IFtcbiAgICBwcm9jZXNzLmVudi5GRk1QRUdfUEFUSCxcbiAgICAnL29wdC9iaW4vZmZtcGVnJyxcbiAgICAnL29wdC9mZm1wZWcnLFxuICAgICcvdXNyL2Jpbi9mZm1wZWcnLFxuICAgICcvdXNyL2xvY2FsL2Jpbi9mZm1wZWcnLFxuICBdLmZpbHRlcihCb29sZWFuKSBhcyBzdHJpbmdbXTtcblxuICBmb3IgKGNvbnN0IHAgb2YgY2FuZGlkYXRlcykge1xuICAgIGlmIChmcy5leGlzdHNTeW5jKHApICYmIGlzRXhlY3V0YWJsZShwKSkgcmV0dXJuIHA7XG4gIH1cblxuICB0aHJvdyBuZXcgRXJyb3IoXG4gICAgJ0ZGbXBlZyBiaW5hcnkgbm90IGZvdW5kLiBFeHBlY3RlZCBhdCBvbmUgb2Y6ICcgK1xuICAgICAgY2FuZGlkYXRlcy5qb2luKCcsICcpICtcbiAgICAgICcuIEVuc3VyZSB5b3VyIExhbWJkYSBsYXllciBwcm92aWRlcyBmZm1wZWcgKGNvbW1vbiBwYXRoOiAvb3B0L2Jpbi9mZm1wZWcpIG9yIHNldCBGRk1QRUdfUEFUSC4nLFxuICApO1xufVxuIl19