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
    <div className="flex justify-center">
      <video
        ref={videoRef}
        src={videoUrl}
        className="rounded-xl shadow-lg border-2 border-gray-600"
        style={{ width: '65%', height: 'auto' }}
        controls
        autoPlay={autoPlay}
        muted={isMuted}
        loop={loop}
        preload="metadata"
        onEnded={handleVideoEnded}
        onPlay={() => setIsPlaying(true)}
        onPause={() => setIsPlaying(false)}
        onTimeUpdate={handleTimeUpdate}
        onLoadedMetadata={handleLoadedMetadata}
        onError={handleError}
      />
    </div>
  );
}
