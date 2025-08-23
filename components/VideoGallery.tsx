'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import {
  Play,
  Download,
  Calendar,
  FileVideo,
  MoreHorizontal,
  Trash2,
  Edit,
} from 'lucide-react';
import VideoPreview from './VideoPreview';
import { useAuthenticatedFetch } from './useAuthenticatedFetch';

interface Video {
  key: string;
  url: string;
  thumbnailUrl: string | null;
  timestamp: number;
  createdAt: string;
  lastModified: string;
  size: number;
}

interface VideoGalleryProps {
  onVideoSelect?: (video: Video) => void;
}

export default function VideoGallery({ onVideoSelect }: VideoGalleryProps) {
  const router = useRouter();
  const [videos, setVideos] = useState<Video[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedVideo, setSelectedVideo] = useState<Video | null>(null);
  const [openMenu, setOpenMenu] = useState<string | null>(null);
  const { authenticatedFetch, isAuthenticated } = useAuthenticatedFetch();

  useEffect(() => {
    if (isAuthenticated) {
      fetchVideos();
    }
  }, [isAuthenticated]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Element;
      if (
        !target.closest('.video-menu-button') &&
        !target.closest('.video-menu-dropdown')
      ) {
        setOpenMenu(null);
      }
    };

    document.addEventListener('click', handleClickOutside);
    return () => {
      document.removeEventListener('click', handleClickOutside);
    };
  }, []);

  const fetchVideos = async () => {
    try {
      setLoading(true);
      setError(null);

      const data = await authenticatedFetch('/api/fetch-videos');
      setVideos(data.videos);
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

  const handleMenuToggle = (videoKey: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setOpenMenu(openMenu === videoKey ? null : videoKey);
  };

  const handleExport = async (video: Video, e: React.MouseEvent) => {
    e.stopPropagation();
    setOpenMenu(null);

    try {
      // Use our proxy API endpoint - authentication is handled via cookies
      const response = await fetch(
        `/api/download-video?url=${encodeURIComponent(
          video.url,
        )}&filename=video-${video.timestamp}.mp4`,
        {
          method: 'GET',
          credentials: 'include', // Include cookies for authentication
        },
      );

      if (!response.ok) {
        throw new Error(`Failed to download video: ${response.status}`);
      }

      // Get the video as blob and download
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);

      const a = document.createElement('a');
      a.href = url;
      a.download = `video-${video.timestamp}.mp4`;
      document.body.appendChild(a);
      a.click();

      // Clean up
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    } catch (error) {
      console.error('Error exporting video:', error);
      alert('Failed to export video. Please try again.');
    }
  };

  const handleDelete = async (video: Video, e: React.MouseEvent) => {
    e.stopPropagation();
    setOpenMenu(null);

    if (confirm('Are you sure you want to delete this video?')) {
      try {
        await authenticatedFetch(`/api/delete-video?key=${video.key}`, {
          method: 'DELETE',
        });
        setVideos(videos.filter((v) => v.key !== video.key));
        if (selectedVideo?.key === video.key) {
          setSelectedVideo(null);
        }
      } catch (error) {
        console.error('Error deleting video:', error);
      }
    }
  };

  const handleEdit = (video: Video, e: React.MouseEvent) => {
    e.stopPropagation();
    setOpenMenu(null);

    // Navigate to create page with the video's timestamp and step=2
    router.push(`/create?timestamp=${video.timestamp}&step=2`);
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
      <div
        className="fixed inset-0 flex items-center justify-center"
        style={{ top: '64px', left: '250px', right: '0px', bottom: '0px' }}
      >
        <div className="text-center animate-fade-in-up">
          <div className="relative mb-6 flex justify-center">
            <div className="relative w-16 h-16">
              <div className="absolute inset-0 w-16 h-16 border-4 border-slate-600 rounded-full animate-pulse-slow"></div>
              <div className="absolute inset-0 w-16 h-16 border-4 border-blue-500 rounded-full animate-spin border-t-transparent"></div>
            </div>
          </div>
          <h3 className="text-2xl font-bold text-gray-700 mb-3">
            Loading Your Videos
          </h3>
          <p className="text-gray-500 text-lg">
            Fetching videos from your library...
          </p>
        </div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-center animate-fade-in-up">
          <div className="w-16 h-16 bg-yellow-500/20 rounded-full flex items-center justify-center mx-auto mb-6">
            <FileVideo className="w-8 h-8 text-yellow-400" />
          </div>
          <h3 className="text-2xl font-bold text-gray-700 mb-3">
            Authentication Required
          </h3>
          <p className="text-gray-500 text-lg mb-4">
            Please sign in to view your video library. Your authentication token
            will be automatically included in all requests.
          </p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-center animate-fade-in-up">
          <div className="w-16 h-16 bg-red-500 rounded-full flex items-center justify-center mx-auto mb-6">
            <FileVideo className="w-8 h-8 text-white" />
          </div>
          <h3 className="text-2xl font-bold text-gray-700 mb-3">
            Error Loading Videos
          </h3>
          <p className="text-gray-500 text-lg mb-4">{error}</p>
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
      <div className="flex items-center justify-center h-full">
        <div className="text-center animate-fade-in-up">
          <div className="w-16 h-16 bg-slate-600 rounded-full flex items-center justify-center mx-auto mb-6">
            <FileVideo className="w-8 h-8 text-white" />
          </div>
          <h3 className="text-2xl font-bold text-gray-700 mb-3">
            No Videos Found
          </h3>
          <p className="text-gray-500 text-lg">Start creating now!</p>
        </div>
      </div>
    );
  }

  return (
    <div className="relative flex h-full">
      {/* Main Gallery */}
      <div className="w-3/4">
        <div className="flex flex-wrap gap-7 pb-4 w-full p-8">
          {videos
            .sort(
              (a, b) =>
                new Date(b.lastModified).getTime() -
                new Date(a.lastModified).getTime(),
            )
            .map((video) => (
              <div
                key={video.key}
                className={`w-[247px] h-[382px] glass-effect rounded-xl p-4 cursor-pointer transition-all duration-300 hover:transform hover:scale-105 ${
                  selectedVideo?.key === video.key
                    ? 'ring-2 ring-blue-500 bg-blue-500/10'
                    : 'hover:bg-slate-700/50'
                }`}
                onClick={() => handleVideoSelect(video)}
              >
                <div className="relative mb-4 h-72 overflow-hidden rounded-xl">
                  {video.thumbnailUrl ? (
                    <img
                      className="w-full h-full object-cover cursor-pointer transition-transform duration-200 hover:scale-105"
                      src={video.thumbnailUrl}
                      alt={`Video thumbnail for ${video.timestamp}`}
                    />
                  ) : (
                    <div className="w-full h-full bg-gradient-to-br from-slate-700 to-slate-800 flex items-center justify-center">
                      <svg
                        className="w-12 h-12 text-slate-400"
                        fill="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path d="M8 5v14l11-7z" />
                      </svg>
                    </div>
                  )}

                  {/* Menu Button */}
                  <button
                    onClick={(e) => handleMenuToggle(video.key, e)}
                    className="video-menu-button absolute top-2 right-2 w-8 h-8 bg-black/50 hover:bg-black/70 rounded-full flex items-center justify-center transition-all duration-200 z-10"
                  >
                    <MoreHorizontal className="w-4 h-4 text-white" />
                  </button>

                  {/* Dropdown Menu */}
                  {openMenu === video.key && (
                    <div className="video-menu-dropdown absolute top-10 right-2 bg-slate-800 border border-slate-600 rounded-lg shadow-lg z-20 min-w-[120px]">
                      <button
                        onClick={(e) => handleEdit(video, e)}
                        className="w-full px-3 py-2 text-left text-sm text-slate-300 hover:bg-slate-700 flex items-center gap-2 transition-colors duration-200"
                      >
                        <Edit className="w-4 h-4" />
                        Edit
                      </button>
                      <button
                        onClick={(e) => handleExport(video, e)}
                        className="w-full px-3 py-2 text-left text-sm text-slate-300 hover:bg-slate-700 flex items-center gap-2 transition-colors duration-200"
                      >
                        <Download className="w-4 h-4" />
                        Export
                      </button>
                      <button
                        onClick={(e) => handleDelete(video, e)}
                        className="w-full px-3 py-2 text-left text-sm text-red-400 hover:bg-slate-700 flex items-center gap-2 transition-colors duration-200"
                      >
                        <Trash2 className="w-4 h-4" />
                        Delete
                      </button>
                    </div>
                  )}
                </div>

                <div className="space-y-2">
                  <div className="flex items-center text-sm text-slate-400">
                    <Calendar className="w-4 h-4 mr-2" />
                    {formatDate(video.lastModified)}
                  </div>
                  <div className="text-xs text-slate-500">
                    {formatFileSize(video.size)}
                  </div>
                </div>
              </div>
            ))}
        </div>
      </div>

      {/* Video Player Sidebar */}
      <div
        className={`fixed inset-y-0 right-0 w-1/4 bg-slate-900/95 backdrop-blur-sm border-l border-slate-700 transform transition-transform duration-500 ease-in-out z-50 ${
          selectedVideo ? 'translate-x-0' : 'translate-x-full'
        }`}
      >
        {selectedVideo && (
          <div className="h-full flex flex-col">
            {/* Header */}
            <div className="flex items-center justify-end p-6 border-b border-slate-700">
              <button
                onClick={() => setSelectedVideo(null)}
                className="w-8 h-8 bg-slate-700 hover:bg-slate-600 rounded-full flex items-center justify-center transition-colors duration-200"
              >
                <svg
                  className="w-4 h-4 text-white"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M6 18L18 6M6 6l12 12"
                  />
                </svg>
              </button>
            </div>

            {/* Video Player */}
            <div className="flex-1 p-4">
              <div className="relative w-full h-full rounded-xl overflow-hidden bg-black">
                <video
                  className="w-full h-full object-contain"
                  controls
                  autoPlay
                  muted
                  src={selectedVideo.url}
                >
                  Your browser does not support the video tag.
                </video>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
