'use client';

import { useState, useEffect } from 'react';
import { Play, Download, Calendar, FileVideo } from 'lucide-react';
import VideoPreview from './VideoPreview';

interface Video {
  key: string;
  url: string;
  timestamp: number;
  createdAt: string;
  size: number;
}

interface VideoGalleryProps {
  onVideoSelect?: (video: Video) => void;
}

export default function VideoGallery({ onVideoSelect }: VideoGalleryProps) {
  const [videos, setVideos] = useState<Video[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedVideo, setSelectedVideo] = useState<Video | null>(null);
  const [playingVideos, setPlayingVideos] = useState<Set<string>>(new Set());

  useEffect(() => {
    fetchVideos();
  }, []);

  // Auto-select the latest video when videos are loaded
  useEffect(() => {
    if (videos.length > 0 && !selectedVideo) {
      // Sort videos by timestamp (newest first) and select the first one
      const sortedVideos = [...videos].sort(
        (a, b) => b.timestamp - a.timestamp,
      );
      const latestVideo = sortedVideos[0];
      setSelectedVideo(latestVideo);
      onVideoSelect?.(latestVideo);
    }
  }, [videos, selectedVideo, onVideoSelect]);

  const fetchVideos = async () => {
    try {
      setLoading(true);
      setError(null);

      const response = await fetch('/api/fetch-videos');
      const data = await response.json();

      if (response.ok) {
        setVideos(data.videos);
      } else {
        setError(data.error || 'Failed to fetch videos');
      }
    } catch (error) {
      console.error('Error fetching videos:', error);
      setError('Failed to fetch videos');
    } finally {
      setLoading(false);
    }
  };

  const handleVideoSelect = (video: Video) => {
    setSelectedVideo(video);
    onVideoSelect?.(video);
  };

  const handleVideoClick = (
    videoKey: string,
    videoElement: HTMLVideoElement,
  ) => {
    if (videoElement.paused) {
      // Pause all other videos first and mute them
      const allVideos = document.querySelectorAll('video');
      allVideos.forEach((v) => {
        if (v !== videoElement) {
          v.pause();
          v.muted = true;
        }
      });

      // Unmute and play this video
      videoElement.muted = false;
      videoElement.play();
      setPlayingVideos((prev) => new Set([...prev, videoKey]));
    } else {
      // Pause this video
      videoElement.pause();
      setPlayingVideos((prev) => {
        const newSet = new Set(prev);
        newSet.delete(videoKey);
        return newSet;
      });
    }
  };

  const formatFileSize = (bytes: number): string => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const formatDate = (dateString: string): string => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  if (loading) {
    return (
      <div className="glass-effect rounded-2xl p-8 animate-fade-in-up">
        <div className="text-center">
          <div className="relative mb-6">
            <div className="w-16 h-16 border-4 border-slate-600 rounded-full animate-pulse-slow"></div>
            <div className="absolute inset-0 w-16 h-16 border-4 border-blue-500 rounded-full animate-spin border-t-transparent"></div>
          </div>
          <h3 className="text-2xl font-bold text-white mb-3">
            Loading Your Videos
          </h3>
          <p className="text-slate-300 text-lg">
            Fetching videos from your library...
          </p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="glass-effect rounded-2xl p-8 animate-fade-in-up">
        <div className="text-center">
          <div className="w-16 h-16 bg-red-500 rounded-full flex items-center justify-center mx-auto mb-6">
            <FileVideo className="w-8 h-8 text-white" />
          </div>
          <h3 className="text-2xl font-bold text-white mb-3">
            Error Loading Videos
          </h3>
          <p className="text-slate-300 text-lg mb-4">{error}</p>
          <button
            onClick={fetchVideos}
            className="inline-flex items-center px-6 py-3 bg-gradient-to-r from-blue-500 to-blue-600 text-white font-bold rounded-xl hover:from-blue-600 hover:to-blue-700 transition-all duration-200 transform hover:scale-105"
          >
            Try Again
          </button>
        </div>
      </div>
    );
  }

  if (videos.length === 0) {
    return (
      <div className="glass-effect rounded-2xl p-8 animate-fade-in-up">
        <div className="text-center">
          <div className="w-16 h-16 bg-slate-600 rounded-full flex items-center justify-center mx-auto mb-6">
            <FileVideo className="w-8 h-8 text-white" />
          </div>
          <h3 className="text-2xl font-bold text-white mb-3">
            No Videos Found
          </h3>
          <p className="text-slate-300 text-lg">
            You haven't generated any videos yet. Create your first video to get
            started!
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="glass-effect rounded-2xl p-8 animate-fade-in-up">
      <div className="flex items-center mb-8">
        <div className="w-12 h-12 bg-gradient-to-r from-purple-500 to-pink-500 rounded-xl flex items-center justify-center mr-4">
          <FileVideo className="w-6 h-6 text-white" />
        </div>
        <h2 className="text-3xl font-bold text-white">Your Video Library</h2>
      </div>

      {selectedVideo && (
        <div className="mb-8">
          <VideoPreview videoUrl={selectedVideo.url} />
          <div className="mt-4 flex justify-center">
            <a
              href={selectedVideo.url}
              download={`video-${selectedVideo.timestamp}.mp4`}
              className="inline-flex items-center px-6 py-3 bg-gradient-to-r from-green-500 to-emerald-500 text-white font-bold rounded-xl hover:from-green-600 hover:to-emerald-600 transition-all duration-200 transform hover:scale-105 shadow-lg hover:shadow-xl"
            >
              <Download className="w-5 h-5 mr-3" />
              Download Video
            </a>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {videos.map((video) => (
          <div
            key={video.key}
            className={`glass-effect rounded-xl p-6 cursor-pointer transition-all duration-300 hover:transform hover:scale-105 ${
              selectedVideo?.key === video.key
                ? 'ring-2 ring-blue-500 bg-blue-500/10'
                : 'hover:bg-slate-700/50'
            }`}
            onClick={() => handleVideoSelect(video)}
          >
            <div className="relative mb-4">
              <video
                className="aspect-[9/16] w-full rounded-lg object-cover cursor-pointer transition-transform duration-200 hover:scale-105"
                src={video.url}
                preload="metadata"
                muted={!playingVideos.has(video.key)}
                onClick={(e) => {
                  e.stopPropagation();
                  handleVideoClick(video.key, e.currentTarget);
                }}
                onLoadedData={(e) => {
                  // Auto-pause at the first frame
                  const video = e.target as HTMLVideoElement;
                  video.currentTime = 0;
                  video.pause();
                }}
                onPlay={() =>
                  setPlayingVideos((prev) => new Set([...prev, video.key]))
                }
                onPause={() => {
                  setPlayingVideos((prev) => {
                    const newSet = new Set(prev);
                    newSet.delete(video.key);
                    return newSet;
                  });
                }}
                onError={(e) => {
                  // Fallback to placeholder if video fails to load
                  const video = e.target as HTMLVideoElement;
                  video.style.display = 'none';
                  const parent = video.parentElement;
                  if (parent) {
                    const placeholder = document.createElement('div');
                    placeholder.className =
                      'aspect-[9/16] bg-gradient-to-br from-slate-700 to-slate-800 rounded-lg flex items-center justify-center';
                    placeholder.innerHTML =
                      '<svg class="w-12 h-12 text-slate-400" fill="currentColor" viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>';
                    parent.appendChild(placeholder);
                  }
                }}
              />
              {!playingVideos.has(video.key) && (
                <div className="absolute top-2 right-2 bg-black/50 rounded-full p-1">
                  <Play className="w-4 h-4 text-white" />
                </div>
              )}
              {playingVideos.has(video.key) && (
                <div className="absolute top-2 right-2 bg-black/50 rounded-full p-1">
                  <div className="w-4 h-4 flex items-center justify-center">
                    <div className="w-1 h-4 bg-white rounded-sm mx-0.5"></div>
                    <div className="w-1 h-4 bg-white rounded-sm mx-0.5"></div>
                  </div>
                </div>
              )}
            </div>

            <div className="space-y-2">
              <div className="flex items-center text-sm text-slate-400">
                <Calendar className="w-4 h-4 mr-2" />
                {formatDate(video.createdAt)}
              </div>
              <div className="text-xs text-slate-500">
                {formatFileSize(video.size)}
              </div>
            </div>
          </div>
        ))}
      </div>

      <div className="mt-8 text-center">
        <button
          onClick={fetchVideos}
          className="inline-flex items-center px-6 py-3 bg-gradient-to-r from-slate-600 to-slate-700 text-white font-bold rounded-xl hover:from-slate-700 hover:to-slate-800 transition-all duration-200 transform hover:scale-105"
        >
          Refresh Videos
        </button>
      </div>
    </div>
  );
}
