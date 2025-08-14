'use client';

import { Play, Pause, Volume2, VolumeX } from 'lucide-react';
import { useState, useRef, useEffect } from 'react';

interface VideoPreviewProps {
  videoUrl: string;
  autoPlay?: boolean;
  loop?: boolean;
}

export default function VideoPreview({
  videoUrl,
  autoPlay = false,
  loop = false,
}: VideoPreviewProps) {
  const [isPlaying, setIsPlaying] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [hasError, setHasError] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);

  const togglePlay = () => {
    if (videoRef.current) {
      if (isPlaying) {
        videoRef.current.pause();
      } else {
        videoRef.current.play().catch((error) => {
          console.error('Error playing video:', error);
        });
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

  const handleTimeUpdate = () => {
    if (videoRef.current) {
      setCurrentTime(videoRef.current.currentTime);
    }
  };

  const handleLoadedMetadata = () => {
    if (videoRef.current) {
      setDuration(videoRef.current.duration);
      setHasError(false);

      // Auto-play if requested
      if (autoPlay) {
        // Ensure video is muted for autoplay to work
        videoRef.current.muted = true;
        setIsMuted(true);

        videoRef.current.play().catch((error) => {
          console.error('Error auto-playing video:', error);
          // Don't show error for autoplay failures (browser policy)
        });
      }
    }
  };

  const handleError = () => {
    console.error('Video failed to load:', videoUrl);
    setHasError(true);
  };

  const handleSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newTime = parseFloat(e.target.value);
    if (videoRef.current) {
      videoRef.current.currentTime = newTime;
      setCurrentTime(newTime);
    }
  };

  const formatTime = (time: number) => {
    const minutes = Math.floor(time / 60);
    const seconds = Math.floor(time % 60);
    return `${minutes}:${seconds.toString().padStart(2, '0')}`;
  };

  // Reset time when video URL changes
  useEffect(() => {
    setCurrentTime(0);
    setDuration(0);
    setIsPlaying(false);
    setHasError(false);
  }, [videoUrl]);

  // Auto-play effect
  useEffect(() => {
    if (autoPlay && videoRef.current && !hasError) {
      // Ensure video is muted for autoplay to work
      videoRef.current.muted = true;
      setIsMuted(true);

      const playPromise = videoRef.current.play();
      if (playPromise !== undefined) {
        playPromise.catch((error) => {
          console.error('Error auto-playing video:', error);
          // Don't show error for autoplay failures (browser policy)
        });
      }
    }
  }, [autoPlay, hasError]);

  if (hasError) {
    return (
      <div className="bg-black rounded-2xl overflow-hidden shadow-2xl border border-slate-700 h-96 flex items-center justify-center">
        <div className="text-center text-gray-400">
          <div className="text-4xl mb-4">❌</div>
          <p className="text-sm">Failed to load video</p>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-black rounded-2xl overflow-hidden shadow-2xl border border-slate-700">
      <div className="relative">
        <video
          ref={videoRef}
          src={videoUrl}
          className="w-full h-auto max-h-[884px] object-contain"
          onEnded={handleVideoEnded}
          onPlay={() => setIsPlaying(true)}
          onPause={() => setIsPlaying(false)}
          onTimeUpdate={handleTimeUpdate}
          onLoadedMetadata={handleLoadedMetadata}
          onError={handleError}
          muted={isMuted}
          loop={loop}
          preload="metadata"
        />

        <div className="absolute top-6 left-6 bg-black bg-opacity-60 text-white px-4 py-2 rounded-full text-sm backdrop-blur-sm border border-slate-600">
          60s • 1080×1920
        </div>
      </div>

      {/* Video Controls at Bottom */}
      <div className="bg-slate-800 p-4">
        {/* Progress Bar */}
        <div className="mb-3">
          <input
            type="range"
            min="0"
            max={duration || 0}
            value={currentTime}
            onChange={handleSeek}
            className="w-full h-2 bg-slate-600 rounded-lg appearance-none cursor-pointer slider"
            style={{
              background: `linear-gradient(to right, #3b82f6 0%, #3b82f6 ${
                (currentTime / (duration || 1)) * 100
              }%, #475569 ${
                (currentTime / (duration || 1)) * 100
              }%, #475569 100%)`,
            }}
          />
        </div>

        {/* Controls Row */}
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-4">
            <button
              onClick={togglePlay}
              className="bg-blue-600 hover:bg-blue-700 text-white rounded-full p-2 transition-all duration-200"
            >
              {isPlaying ? (
                <Pause className="w-4 h-4" />
              ) : (
                <Play className="w-4 h-4 ml-0.5" />
              )}
            </button>

            <button
              onClick={toggleMute}
              className="bg-slate-700 hover:bg-slate-600 text-white rounded-full p-2 transition-all duration-200"
            >
              {isMuted ? (
                <VolumeX className="w-4 h-4" />
              ) : (
                <Volume2 className="w-4 h-4" />
              )}
            </button>
          </div>

          <div className="text-white text-sm">
            <span>{formatTime(currentTime)}</span>
            <span className="text-gray-400 mx-1">/</span>
            <span>{formatTime(duration)}</span>
          </div>
        </div>
      </div>
    </div>
  );
}
