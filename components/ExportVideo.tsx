import { useState } from 'react';
import { Manifest } from '../app/types/manifest';
import { handleExportVideo, formatFileSize } from '../lib/export-utils';

interface UserSubscription {
  mode: 'free' | 'starter' | 'creator' | 'influencer';
  renewalDate?: string | null;
  status: 'active' | 'cancelled' | 'expired';
}

interface ExportVideoProps {
  onExportVideo: () => void;
  isExporting?: boolean;
  onBack?: () => void;
  isVideoGenerating: boolean;
  videoCompletionData: Manifest | null;
  onRemoveWatermark?: () => void;
  showToasterMessage?: (
    message: string,
    type: 'success' | 'error' | 'info',
  ) => void;
  userSubscription?: UserSubscription;
}

export default function ExportVideo({
  onExportVideo,
  isExporting = false,
  onBack,
  isVideoGenerating = false,
  videoCompletionData = null,
  onRemoveWatermark,
  showToasterMessage,
  userSubscription,
}: ExportVideoProps) {
  const [watermarkRemoved, setWatermarkRemoved] = useState(false);

  // Handle video export using shared utility
  const handleExport = async () => {
    if (!videoCompletionData?.finalVideoUrl) {
      showToasterMessage?.('Video URL not available for export', 'error');
      return;
    }

    await handleExportVideo({
      finalVideoUrl: videoCompletionData.finalVideoUrl,
      filename: `video-${videoCompletionData.generatedAt}.mp4`,
      showToasterMessage,
    });
  };

  // Loading state
  if (isVideoGenerating) {
    return (
      <div className="w-full flex flex-col items-center justify-center min-h-[400px]">
        <div className="text-center">
          <div className="animate-spin rounded-full h-16 w-16 border-b-2 border-blue-500 mx-auto mb-6"></div>
          <h1 className="text-2xl lg:text-3xl font-bold text-white mb-4">
            Generating Your Video
          </h1>
          <p className="text-gray-300 text-lg">
            Please wait while we combine your scenes into the final video...
          </p>
          <p className="text-gray-400 text-sm mt-2">
            This may take a few minutes
          </p>
        </div>
      </div>
    );
  }

  // Get data from videoCompletionData
  const manifest = videoCompletionData;
  const totalDuration = manifest?.totalDuration || 30;
  const sceneCount = manifest?.sceneCount || 0;
  const generatedAt = manifest?.generatedAt || '';
  // Find the first scene that is not removed (removed: false)
  const firstNonRemovedScene = manifest?.scenes?.find(
    (scene) => !scene.removed,
  );
  const thumbnailUrl =
    firstNonRemovedScene?.files?.png || firstNonRemovedScene?.files?.jpg;

  return (
    <div className="w-full max-w-4xl mx-auto flex flex-col items-center">
      {/* Header */}
      <div
        className="mb-8 text-left"
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'start',
          width: '100%',
        }}
      >
        <h1 className="text-3xl lg:text-4xl font-bold text-white mb-3">
          Let's export your video!
        </h1>
        <p className="text-gray-300 text-lg">
          Review details and export your video
        </p>
      </div>

      {/* Main Card */}
      <div
        className="bg-gray-900 border border-purple-500/20 rounded-2xl p-8"
        style={{
          borderRadius: '16px',
          border: '1px solid #7552F2',
          background: '#1F1F31',
          boxShadow: '0 0 0 3px rgba(17, 17, 119, 0.25)',
        }}
      >
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          {/* Final Preview Section */}
          <div>
            <div className="relative flex justify-center">
              <div className="aspect-[9/16] bg-gradient-to-br from-pink-400 to-pink-600 rounded-xl overflow-hidden w-full max-w-[280px]">
                {thumbnailUrl ? (
                  <img
                    src={thumbnailUrl}
                    alt="Video thumbnail"
                    className="w-full h-full object-cover"
                  />
                ) : (
                  /* Fallback donut image when no thumbnail available */
                  <div className="w-full h-full flex items-center justify-center">
                    <div className="w-32 h-32 bg-pink-300 rounded-full relative">
                      <div className="absolute inset-0 bg-gradient-to-br from-pink-200 to-pink-400 rounded-full"></div>
                      <div className="absolute inset-2 bg-gradient-to-br from-pink-100 to-pink-300 rounded-full"></div>
                      <div className="absolute inset-4 bg-gradient-to-br from-pink-50 to-pink-200 rounded-full"></div>
                      {/* Sprinkles */}
                      <div className="absolute top-2 left-4 w-2 h-2 bg-yellow-400 rounded-full"></div>
                      <div className="absolute top-6 right-6 w-2 h-2 bg-red-400 rounded-full"></div>
                      <div className="absolute bottom-4 left-6 w-2 h-2 bg-blue-400 rounded-full"></div>
                      <div className="absolute bottom-2 right-4 w-2 h-2 bg-green-400 rounded-full"></div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Export Details Section */}
          <div>
            <h2 className="text-xl font-semibold text-white mb-6">
              Export Details
            </h2>

            <div className="grid grid-cols-2 gap-6">
              {/* Left Column */}
              <div className="space-y-4">
                {/* Duration */}
                <div>
                  <div className="text-white font-medium">Duration:</div>
                  <div className="text-gray-300 text-sm">
                    {totalDuration} seconds ({sceneCount} scenes)
                  </div>
                </div>

                {/* Resolution */}
                <div>
                  <div className="text-white font-medium">Resolution:</div>
                  <div className="text-gray-300 text-sm">
                    1080 × 1920 (Full HD)
                  </div>
                </div>

                {/* Generated */}
                {generatedAt && (
                  <div>
                    <div className="text-white font-medium">Generated at:</div>
                    <div className="text-gray-300 text-sm">
                      {new Date(parseInt(generatedAt)).toLocaleString()}
                    </div>
                  </div>
                )}
              </div>

              {/* Right Column */}
              <div className="space-y-4">
                {/* Aspect Ratio */}
                <div>
                  <div className="text-white font-medium">Aspect Ratio:</div>
                  <div className="text-gray-300 text-sm">9:16</div>
                </div>

                {/* Size */}
                <div>
                  <div className="text-white font-medium">Size:</div>
                  <div className="text-gray-300 text-sm">
                    {formatFileSize(parseInt(manifest?.size || '0'))}
                  </div>
                </div>

                {/* Subtitles */}
                <div>
                  <div className="text-white font-medium">Subtitles:</div>
                  <div className="text-gray-300 text-sm">Included</div>
                </div>
              </div>
              {/* Subscription Prompt for Free Users - Spanning All Columns */}
              {userSubscription?.mode === 'free' && (
                <div className="col-span-full mt-6">
                  <a href="/pricing" className="transition-colors ">
                    <div className="bg-gradient-to-r from-purple-600/20 to-blue-600/20 border border-purple-500/30 rounded-xl p-6 w-full">
                      <div className="text-center">
                        <div className="text-white font-normal text-base">
                          Subscribe to remove the watermark
                        </div>
                      </div>
                    </div>
                  </a>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
