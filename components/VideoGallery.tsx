'use client';

import {
  useState,
  useEffect,
  useRef,
  forwardRef,
  useImperativeHandle,
} from 'react';
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
  Share,
} from 'lucide-react';
import { useAuthenticatedFetch } from './useAuthenticatedFetch';
import DeleteConfirmationModal from './DeleteConfirmationModal';
import { handleExportVideo, formatFileSize } from '../lib/export-utils';
import { useToaster } from '@/hooks/useToaster';

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

export interface VideoGalleryHandle {
  refreshVideos: () => void;
  addVideoFromManifest: (manifest: any) => void;
}

const VideoGallery = forwardRef<VideoGalleryHandle, VideoGalleryProps>(
  (props, ref) => {
    const router = useRouter();
    const [videos, setVideos] = useState<Video[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [openMenu, setOpenMenu] = useState<string | null>(null);
    const [deleteModalOpen, setDeleteModalOpen] = useState(false);
    const [videoToDelete, setVideoToDelete] = useState<Video | null>(null);
    const [isDeleting, setIsDeleting] = useState(false);
    const [deletingTimestamp, setDeletingTimestamp] = useState<
      string | number | null
    >(null);
    const [videoModalOpen, setVideoModalOpen] = useState(false);
    const [videoToPlay, setVideoToPlay] = useState<Video | null>(null);
    const { authenticatedFetch, isAuthenticated } = useAuthenticatedFetch();
    const { showToasterMessage, ToasterComponent } = useToaster();

    const hasFetchedRef = useRef(false);

    useEffect(() => {
      if (!isAuthenticated) return;
      if (hasFetchedRef.current) return;
      hasFetchedRef.current = true;
      fetchVideos();
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

    // Helper to transform manifest data to Video format
    const transformManifestToVideo = (manifest: any): Video => {
      // Get thumbnail from first scene
      const thumbnailUrl = manifest.scenes?.[0]?.files?.jpg || null;

      return {
        key: manifest.key,
        finalVideoUrl: manifest.finalVideoUrl,
        thumbnailUrl,
        timestamp: manifest.timestamp || manifest.generatedAt,
        createdAt: new Date(
          parseInt(manifest.generatedAt || manifest.updatedAt),
        ).toISOString(),
        lastModified: new Date(
          parseInt(manifest.updatedAt || manifest.generatedAt),
        ).toISOString(),
        totalDuration: manifest.totalDuration || 0,
        sceneCount: manifest.sceneCount || 0,
        videoGenerated:
          Boolean(manifest.finalVideoUrl) || Boolean(manifest.videoGenerated),
        size: manifest.size ? parseInt(manifest.size) : undefined,
      };
    };

    // Expose methods via ref
    useImperativeHandle(ref, () => ({
      refreshVideos: () => {
        fetchVideos();
      },
      addVideoFromManifest: (manifest: any) => {
        const newVideo = transformManifestToVideo(manifest);

        // Add to beginning of array, avoiding duplicates
        setVideos((prevVideos) => {
          // Check if video already exists
          const exists = prevVideos.some(
            (v) => String(v.timestamp) === String(newVideo.timestamp),
          );

          if (exists) {
            // Update existing video
            return prevVideos.map((v) =>
              String(v.timestamp) === String(newVideo.timestamp) ? newVideo : v,
            );
          } else {
            // Add new video at the beginning
            return [newVideo, ...prevVideos];
          }
        });
      },
    }));

    const handleMenuToggle = (videoKey: string, e: React.MouseEvent) => {
      e.stopPropagation();
      setOpenMenu(openMenu === videoKey ? null : videoKey);
    };

    const handleExport = async (video: Video, e: React.MouseEvent) => {
      e.stopPropagation();
      setOpenMenu(null);

      if (!video.videoGenerated || !video.finalVideoUrl) {
        showToasterMessage('Video URL not available for export', 'error');
        return;
      }

      await handleExportVideo({
        finalVideoUrl: video.finalVideoUrl,
        filename: `video-${video.timestamp}.mp4`,
        showToasterMessage,
      });
    };

    const handleDelete = async (video: Video, e: React.MouseEvent) => {
      e.stopPropagation();
      setOpenMenu(null);
      setVideoToDelete(video);
      setDeleteModalOpen(true);
    };

    const confirmDelete = async () => {
      if (!videoToDelete) return;
      // Optimistically close modal immediately
      const timestamp = videoToDelete.timestamp;
      setDeletingTimestamp(timestamp);
      setDeleteModalOpen(false);
      setVideoToDelete(null);

      setIsDeleting(true);
      try {
        await authenticatedFetch(`/api/delete-video?timestamp=${timestamp}`, {
          method: 'DELETE',
        });
        setVideos((prev) => prev.filter((v) => v.timestamp !== timestamp));
        showToasterMessage('Video deleted successfully', 'success');
      } catch (error) {
        console.error('Error deleting video:', error);
        showToasterMessage(
          'Failed to delete video. Please try again.',
          'error',
        );
      } finally {
        setIsDeleting(false);
        setDeletingTimestamp(null);
      }
    };

    const cancelDelete = () => {
      setDeleteModalOpen(false);
      setVideoToDelete(null);
    };

    const navigateToEdit = (video: Video) => {
      // Navigate to create page with the video's timestamp and step=2
      router.push(`/create?timestamp=${video.timestamp}&step=2`);
    };

    const handleEdit = (video: Video, e: React.MouseEvent) => {
      e.stopPropagation();
      setOpenMenu(null);
      navigateToEdit(video);
    };

    const handleThumbnailClick = (video: Video) => {
      setOpenMenu(null);
      navigateToEdit(video);
    };

    const handlePlayVideo = (video: Video, e: React.MouseEvent) => {
      e.stopPropagation();
      setVideoToPlay(video);
      setVideoModalOpen(true);
    };

    const closeVideoModal = () => {
      setVideoModalOpen(false);
      setVideoToPlay(null);
    };

    const handleShareLink = async (video: Video, e: React.MouseEvent) => {
      e.stopPropagation();
      setOpenMenu(null);

      if (!video.finalVideoUrl) {
        showToasterMessage('Video URL not available for sharing', 'error');
        return;
      }

      try {
        const res = await authenticatedFetch('/api/share/create', {
          method: 'POST',
          body: { timestamp: String(video.timestamp) },
        });
        const shortUrl = res?.url;
        if (!shortUrl) {
          throw new Error('Failed to create share link');
        }
        await navigator.clipboard.writeText(shortUrl);
        showToasterMessage('Short link copied to clipboard!', 'success');
      } catch (error) {
        console.error('Error creating/copying share link:', error);
        showToasterMessage('Failed to create share link', 'error');
      }
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

    if (loading) {
      return (
        <div className="w-full min-h-[60vh] flex items-center justify-center">
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
        <div className="flex items-center justify-center min-h-[60vh]">
          <div className="text-center animate-fade-in-up">
            <div className="w-16 h-16 bg-yellow-500/20 rounded-full flex items-center justify-center mx-auto mb-6">
              <FileVideo className="w-8 h-8 text-yellow-400" />
            </div>
            <h3 className="text-2xl font-bold text-gray-700 mb-3">
              Authentication Required
            </h3>
            <p className="text-gray-500 text-lg mb-4">
              Please sign in to view your video library. Your authentication
              token will be automatically included in all requests.
            </p>
          </div>
        </div>
      );
    }

    if (error) {
      return (
        <div className="flex items-center justify-center min-h-[60vh]">
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
        <div className="flex items-center justify-center min-h-[60vh]">
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
      <div className="relative flex h-full w-full">
        {/* Main Gallery */}
        <div className="w-full flex flex-col h-full">
          <div className="flex-1 overflow-y-auto">
            <div
              className="grid gap-4 sm:gap-6 lg:gap-7 pb-4 w-full p-4 sm:p-8"
              style={{
                gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 247px))',
              }}
            >
              {videos
                .sort(
                  (a, b) =>
                    new Date(b.lastModified).getTime() -
                    new Date(a.lastModified).getTime(),
                )
                .map((video) => (
                  <div
                    key={video.timestamp}
                    className="relative w-full glass-effect rounded-xl p-4 transition-all duration-300 hover:transform hover:scale-105 hover:bg-slate-700/50"
                  >
                    <div
                      className="relative mb-4 aspect-[9/16] overflow-hidden rounded-xl cursor-pointer"
                      onClick={() => handleThumbnailClick(video)}
                    >
                      {video.thumbnailUrl ? (
                        <img
                          className="w-full h-full object-cover transition-transform duration-200 hover:scale-105"
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

                      {/* Done Tag - Bottom Right */}
                      {(video.finalVideoUrl || video.videoGenerated) && (
                        <div className="absolute bottom-2 right-2 text-white text-[10px] p-1.5 rounded-md bg-black/60 z-10">
                          Done
                        </div>
                      )}

                      {/* Not Finished Tag - Bottom Right */}
                      {!video.finalVideoUrl && !video.videoGenerated && (
                        <div className="absolute bottom-2 right-2 text-white text-[10px] p-1.5 rounded-md bg-black/60 z-10">
                          Draft
                        </div>
                      )}

                      {/* Play Button - Show when a playable URL exists */}
                      {video.finalVideoUrl && (
                        <button
                          onClick={(e) => handlePlayVideo(video, e)}
                          className="absolute inset-0 flex items-center justify-center bg-black/10 hover:bg-black/20 transition-all duration-200 z-10 group"
                        >
                          <div className="w-12 h-12 bg-white/30 hover:bg-white/50 rounded-full flex items-center justify-center transition-all duration-200 group-hover:scale-110 backdrop-blur-sm">
                            <Play
                              className="w-6 h-6 text-white/80 ml-0.5"
                              fill="currentColor"
                            />
                          </div>
                        </button>
                      )}

                      {/* Menu Button */}
                      <button
                        onClick={(e) =>
                          handleMenuToggle(String(video.timestamp), e)
                        }
                        className="video-menu-button absolute top-2 right-2 w-8 h-8 bg-black/50 hover:bg-black/70 rounded-full flex items-center justify-center transition-all duration-200 z-20"
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
                            disabled={!video.finalVideoUrl}
                            className={`w-full px-3 py-2 text-left text-sm flex items-center gap-2 transition-colors duration-200 ${
                              video.finalVideoUrl
                                ? 'text-slate-300 hover:bg-slate-700'
                                : 'text-slate-500 cursor-not-allowed'
                            }`}
                          >
                            <Download className="w-4 h-4" />
                            Export {!video.finalVideoUrl && '(Not Available)'}
                          </button>
                          {video.finalVideoUrl && (
                            <button
                              onClick={(e) => handleShareLink(video, e)}
                              className="w-full px-3 py-2 text-left text-sm text-slate-300 hover:bg-slate-700 flex items-center gap-2 transition-colors duration-200"
                            >
                              <Share className="w-4 h-4" />
                              Share Link
                            </button>
                          )}
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
                      </div>
                      <div className="flex items-center justify-between text-xs text-slate-500">
                        <div className="flex items-center">
                          <Clock className="w-3 h-3 mr-1" />
                          <span>
                            {formatDuration(video.totalDuration)} in{' '}
                            {video.sceneCount} scenes
                          </span>
                        </div>
                        {
                          <span>
                            {video.size ? formatFileSize(video.size) : ''}
                          </span>
                        }
                      </div>
                    </div>

                    {/* Deleting Overlay for this video */}
                    {isDeleting &&
                      deletingTimestamp !== null &&
                      String(deletingTimestamp) === String(video.timestamp) && (
                        <div className="absolute inset-0 bg-black/60 rounded-xl flex items-center justify-center z-30">
                          <div className="flex items-center gap-2 text-white text-sm font-medium">
                            <span className="inline-block h-4 w-4 border-2 border-white/70 border-t-transparent rounded-full animate-spin" />
                            Deleting video...
                          </div>
                        </div>
                      )}
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

        {/* Video Modal */}
        {videoModalOpen && videoToPlay && (
          <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-50 p-4">
            <div className="relative w-full max-w-4xl max-h-[90vh] bg-slate-900 rounded-xl overflow-hidden">
              {/* Header */}
              <div className="flex items-center justify-between p-4 border-b border-slate-700">
                <h3 className="text-lg font-semibold text-white">
                  Video - {videoToPlay.timestamp}
                </h3>
                <button
                  onClick={closeVideoModal}
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
              <div className="p-4">
                <div className="relative w-full max-w-sm mx-auto aspect-[9/16] bg-black rounded-lg overflow-hidden">
                  {videoToPlay.finalVideoUrl ? (
                    <video
                      className="w-full h-full object-contain"
                      controls
                      autoPlay
                      src={videoToPlay.finalVideoUrl}
                    >
                      Your browser does not support the video tag.
                    </video>
                  ) : (
                    <div className="w-full h-full flex items-center justify-center">
                      <p className="text-white text-center">
                        Video not available
                      </p>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Toaster */}
        {ToasterComponent}
      </div>
    );
  },
);

VideoGallery.displayName = 'VideoGallery';

export default VideoGallery;
