'use client';

import { Play, Pause, Volume2, VolumeX } from 'lucide-react';
import { useState, useRef } from 'react';

interface VideoPreviewProps {
  videoUrl: string;
}

export default function VideoPreview({ videoUrl }: VideoPreviewProps) {
  const [isPlaying, setIsPlaying] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);

  const togglePlay = () => {
    if (videoRef.current) {
      if (isPlaying) {
        videoRef.current.pause();
      } else {
        videoRef.current.play();
      }
      setIsPlaying(!isPlaying);
    }
  };

  const toggleMute = () => {
    if (videoRef.current) {
      videoRef.current.muted = !isMuted;
      setIsMuted(!isMuted);
    }
  };

  const handleVideoEnded = () => {
    setIsPlaying(false);
  };

  return (
    <div className="relative bg-black rounded-2xl overflow-hidden shadow-2xl border border-slate-700">
      <video
        ref={videoRef}
        src={videoUrl}
        className="w-full h-auto max-h-96 object-contain"
        onEnded={handleVideoEnded}
        onPlay={() => setIsPlaying(true)}
        onPause={() => setIsPlaying(false)}
      />

      <div className="absolute inset-0 flex items-center justify-center">
        <button
          onClick={togglePlay}
          className="bg-black bg-opacity-60 hover:bg-opacity-80 text-white rounded-full p-6 transition-all duration-200 transform hover:scale-110 backdrop-blur-sm"
        >
          {isPlaying ? (
            <Pause className="w-10 h-10" />
          ) : (
            <Play className="w-10 h-10 ml-1" />
          )}
        </button>
      </div>

      <div className="absolute bottom-6 right-6">
        <button
          onClick={toggleMute}
          className="bg-black bg-opacity-60 hover:bg-opacity-80 text-white rounded-full p-3 transition-all duration-200 transform hover:scale-110 backdrop-blur-sm"
        >
          {isMuted ? (
            <VolumeX className="w-6 h-6" />
          ) : (
            <Volume2 className="w-6 h-6" />
          )}
        </button>
      </div>

      <div className="absolute top-6 left-6 bg-black bg-opacity-60 text-white px-4 py-2 rounded-full text-sm backdrop-blur-sm border border-slate-600">
        60s • 1080×1920
      </div>
    </div>
  );
}
