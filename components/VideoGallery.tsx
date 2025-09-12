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
  Clock,
} from 'lucide-react';
import { useAuthenticatedFetch } from './useAuthenticatedFetch';
import DeleteConfirmationModal from './DeleteConfirmationModal';
import Toaster from './Toaster';

interface Video {
  key?: string;
  finalVideoUrl?: string;
  thumbnailUrl: string | null;
  timestamp: number | string;
  createdAt: string;
  lastModified: string;
  totalDuration: number;
  sceneCount: number;
  videoGenerated: boolean;
  size?: number;
}

interface VideoGalleryProps {}

export default function VideoGallery({}: VideoGalleryProps) {
  const router = useRouter();
  const [videos, setVideos] = useState<Video[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [openMenu, setOpenMenu] = useState<string | null>(null);
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [videoToDelete, setVideoToDelete] = useState<Video | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [toasterMessage, setToasterMessage] = useState<string | null>(null);
  const [toasterType, setToasterType] = useState<'success' | 'error'>(
    'success',
  );
  const [showToaster, setShowToaster] = useState(false);
  const { authenticatedFetch, isAuthenticated } = useAuthenticatedFetch();

  // Helper function to show toaster messages
  const showToasterMessage = (message: string, type: 'success' | 'error') => {
    setToasterMessage(message);
    setToasterType(type);
    setShowToaster(true);

    // Auto-hide toaster after 3 seconds
    setTimeout(() => {
      setShowToaster(false);
    }, 3000);
  };

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

  const handleMenuToggle = (videoKey: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setOpenMenu(openMenu === videoKey ? null : videoKey);
  };

  const handleExport = async (video: Video, e: React.MouseEvent) => {
    e.stopPropagation();
    setOpenMenu(null);

    if (!video.videoGenerated) {
      alert('Video URL not available for export');
      return;
    }

    try {
      // Use our proxy API endpoint - authentication is handled via cookies
      const response = await fetch(
        `/api/download-video?url=${encodeURIComponent(
          video.finalVideoUrl || '',
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
    setVideoToDelete(video);
    setDeleteModalOpen(true);
  };

  const confirmDelete = async () => {
    if (!videoToDelete) return;

    setIsDeleting(true);
    try {
      await authenticatedFetch(
        `/api/delete-video?timestamp=${videoToDelete.timestamp}`,
        {
          method: 'DELETE',
        },
      );
      setVideos(videos.filter((v) => v.timestamp !== videoToDelete.timestamp));
      setDeleteModalOpen(false);
      setVideoToDelete(null);
      showToasterMessage('Video deleted successfully', 'success');
    } catch (error) {
      console.error('Error deleting video:', error);
      showToasterMessage('Failed to delete video. Please try again.', 'error');
    } finally {
      setIsDeleting(false);
    }
  };

  const cancelDelete = () => {
    setDeleteModalOpen(false);
    setVideoToDelete(null);
  };

  const handleEdit = (video: Video, e: React.MouseEvent) => {
    e.stopPropagation();
    setOpenMenu(null);

    // Navigate to create page with the video's timestamp and step=2
    router.push(`/create?timestamp=${video.timestamp}&step=2`);
  };

  const formatDuration = (seconds: number): string => {
    if (seconds === 0) return '0s';
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = Math.floor(seconds % 60);

    if (minutes > 0) {
      return `${minutes}m ${remainingSeconds}s`;
    } else {
      return `${remainingSeconds}s`;
    }
  };

  const formatDate = (dateString: string): string => {
    try {
      let date: Date;

      // Check if it's a timestamp string (all digits)
      if (/^\d+$/.test(dateString)) {
        // It's a timestamp in milliseconds
        date = new Date(parseInt(dateString));
      } else {
        // It's a regular date string
        date = new Date(dateString);
      }

      if (isNaN(date.getTime())) {
        console.warn('Invalid date string:', dateString);
        return 'Invalid date';
      }

      return date.toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      });
    } catch (error) {
      console.error(
        'Error formatting date:',
        error,
        'Date string:',
        dateString,
      );
      return 'Invalid date';
    }
  };

  const formatFileSize = (bytes: number): string => {
    if (!bytes || bytes === 0) return '0 MB';
    const mb = bytes / (1024 * 1024);
    return `${mb.toFixed(1)}MB`;
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
      <div className="w-full flex flex-col h-full">
        <div className="flex-1 overflow-y-auto">
          <div className="flex flex-wrap gap-7 pb-4 w-full p-8">
            {videos
              .sort(
                (a, b) =>
                  new Date(b.lastModified).getTime() -
                  new Date(a.lastModified).getTime(),
              )
              .map((video) => (
                <div
                  key={video.timestamp}
                  className="w-[247px] h-[382px] glass-effect rounded-xl p-4 transition-all duration-300 hover:transform hover:scale-105 hover:bg-slate-700/50"
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
                      onClick={(e) =>
                        handleMenuToggle(String(video.timestamp), e)
                      }
                      className="video-menu-button absolute top-2 right-2 w-8 h-8 bg-black/50 hover:bg-black/70 rounded-full flex items-center justify-center transition-all duration-200 z-10"
                    >
                      <MoreHorizontal className="w-4 h-4 text-white" />
                    </button>

                    {/* Dropdown Menu */}
                    {openMenu === String(video.timestamp) && (
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
                          disabled={!video.videoGenerated}
                          className={`w-full px-3 py-2 text-left text-sm flex items-center gap-2 transition-colors duration-200 ${
                            video.videoGenerated
                              ? 'text-slate-300 hover:bg-slate-700'
                              : 'text-slate-500 cursor-not-allowed'
                          }`}
                        >
                          <Download className="w-4 h-4" />
                          Export {!video.videoGenerated && '(Not Available)'}
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
                    <div className="flex items-center justify-between text-sm text-slate-400">
                      <div className="flex items-center">
                        <Calendar className="w-4 h-4 mr-2" />
                        {formatDate(video.lastModified)}
                      </div>
                      {video.videoGenerated && (
                        <div className="relative group">
                          <div className="w-5 h-5 bg-transparent border border-slate-400 rounded-full flex items-center justify-center">
                            <span className="text-slate-400 text-xs font-bold">
                              E
                            </span>
                          </div>
                          <div className="absolute bottom-full right-0 mb-2 px-2 py-1 bg-gray-800 text-white text-xs rounded opacity-0 group-hover:opacity-100 transition-opacity duration-200 pointer-events-none whitespace-nowrap z-10">
                            Video generated.
                          </div>
                        </div>
                      )}
                    </div>
                    <div className="flex items-center justify-between text-xs text-slate-500">
                      <div className="flex items-center">
                        <Clock className="w-3 h-3 mr-1" />
                        <span>
                          {formatDuration(video.totalDuration)} in{' '}
                          {video.sceneCount} scenes
                        </span>
                      </div>
                      {video.size && <span>{formatFileSize(video.size)}</span>}
                    </div>
                  </div>
                </div>
              ))}
          </div>
        </div>
      </div>

      {/* Delete Confirmation Modal */}
      <DeleteConfirmationModal
        isOpen={deleteModalOpen}
        onClose={cancelDelete}
        onConfirm={confirmDelete}
        video={videoToDelete}
        isDeleting={isDeleting}
      />

      {/* Toaster */}
      <Toaster
        message={toasterMessage || ''}
        type={toasterType}
        isVisible={showToaster}
        onClose={() => setShowToaster(false)}
      />
    </div>
  );
}
