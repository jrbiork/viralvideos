'use client';

import { useEffect, useState } from 'react';

// Messages shown while narration/subtitles are being generated (before any
// scene has a script/audio yet). Cycled for perceived progress since the
// backend doesn't expose finer-grained sub-steps for this phase.
const AUDIO_PHASE_MESSAGES = ['Generating audio...', 'Building subtitles...'];

interface VideoSkeletonProps {
  // 'audio': script/narration/subtitles still in progress (cycles messages).
  // 'scenes': audio is ready, Ken-Burns scene videos are being rendered.
  phase?: 'audio' | 'scenes';
  // Hide the spinner/status text — used for brief, non-generation waits
  // (e.g. the selection momentarily pointing at a just-deleted scene) where
  // no actual work is happening, so a "Creating scenes..." message would be
  // misleading.
  showMessage?: boolean;
}

export default function VideoSkeleton({
  phase = 'audio',
  showMessage = true,
}: VideoSkeletonProps) {
  const [messageIndex, setMessageIndex] = useState(0);

  useEffect(() => {
    if (phase !== 'audio') return;
    const interval = setInterval(() => {
      setMessageIndex((i) => (i + 1) % AUDIO_PHASE_MESSAGES.length);
    }, 2500);
    return () => clearInterval(interval);
  }, [phase]);

  const message =
    phase === 'audio' ? AUDIO_PHASE_MESSAGES[messageIndex] : 'Creating scenes...';

  return (
    <div className="w-full h-full flex items-center justify-center">
      <div className="flex justify-center w-full mt-4">
        <div className="relative w-full max-w-sm">
          {/* Video placeholder */}
          <div
            className="rounded-xl shadow-lg border-2 border-gray-600 bg-gray-800 animate-pulse"
            style={{
              width: '100%',
              height: '608px',
            }}
          >
            {/* Play button overlay */}
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="w-16 h-16 bg-white/20 rounded-full flex items-center justify-center">
                <div className="w-0 h-0 border-l-[12px] border-l-white border-t-[8px] border-t-transparent border-b-[8px] border-b-transparent ml-1"></div>
              </div>
            </div>

            {/* Loading text */}
            {showMessage && (
              <div className="absolute bottom-4 left-1/2 transform -translate-x-1/2">
                <div className="text-center">
                  <div className="flex items-center justify-center space-x-2 mb-2">
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                    <span className="text-white text-sm">{message}</span>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
