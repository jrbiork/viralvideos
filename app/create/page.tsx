'use client';

import { useState, useEffect } from 'react';
import VideoGenerator from '../../components/VideoGenerator';
import VideoPreview from '../../components/VideoPreview';
// import VideoGallery from '../../components/VideoGallery'; // COMMENTED OUT FOR TESTING
import LoginButton from '../../components/LoginButton';
import Breadcrumb from '../../components/Breadcrumb';
import { useAuthenticatedFetch } from '../../components/useAuthenticatedFetch';
import ProtectedRoute from '../../components/ProtectedRoute';

export default function GeneratePage() {
  const [isGenerating, setIsGenerating] = useState(false);
  const [generatedVideoUrl, setGeneratedVideoUrl] = useState<string | null>(
    null,
  );
  const [selectedGalleryVideo, setSelectedGalleryVideo] = useState<any>(null);
  const [script, setScript] = useState(
    'Create a short video about a cat playing in a garden. The video should be engaging and show the cat exploring different areas of the garden, chasing butterflies, and relaxing in the sunshine.',
  );
  const [generationStatus, setGenerationStatus] = useState<
    'idle' | 'queued' | 'processing' | 'completed' | 'error'
  >('idle');
  const [statusMessage, setStatusMessage] = useState('');
  const [pollingInterval, setPollingInterval] = useState<NodeJS.Timeout | null>(
    null,
  );
  const { authenticatedFetch, isAuthenticated } = useAuthenticatedFetch();

  const handleGenerateVideo = async () => {
    if (!script.trim() || !isAuthenticated) return;

    setIsGenerating(true);
    setGeneratedVideoUrl(null);
    setGenerationStatus('queued');
    setStatusMessage('Queuing video generation request...');

    try {
      const data = await authenticatedFetch('/api/generate-video', {
        method: 'POST',
        body: {
          prompt: script,
        },
      });

      console.log('Video generation queued:', data);

      setGenerationStatus('processing');
      setStatusMessage(
        'Video is being generated... This may take a few minutes.',
      );

      // Start polling for video completion
      // startPollingForVideo(); // COMMENTED OUT FOR TESTING
    } catch (error) {
      console.error('Error queuing video generation:', error);
      setGenerationStatus('error');
      setStatusMessage('Failed to queue video generation. Please try again.');
      alert('Failed to queue video generation. Please try again.');
    } finally {
      setIsGenerating(false);
    }
  };

  // COMMENTED OUT FOR TESTING - fetch-videos API call
  /*
  const startPollingForVideo = () => {
    // Clear any existing polling interval
    if (pollingInterval) {
      clearInterval(pollingInterval);
    }

    // Start polling every 10 seconds
    const interval = setInterval(async () => {
      try {
        const data = await authenticatedFetch(
          '/api/fetch-videos?userId=demo-user4',
        );

        // Check if we have any videos (indicating completion)
        if (data.videos && data.videos.length > 0) {
          // Get the most recent video
          const latestVideo = data.videos[0];
          setGeneratedVideoUrl(latestVideo.url);
          setGenerationStatus('completed');
          setStatusMessage('Video generated successfully!');

          // Stop polling
          clearInterval(interval);
          setPollingInterval(null);
        }
      } catch (error) {
        console.error('Error polling for video:', error);
      }
    }, 10000); // Poll every 10 seconds

    setPollingInterval(interval);
  };
  */

  const handleGalleryVideoSelect = (video: any) => {
    setSelectedGalleryVideo(video);
    setGeneratedVideoUrl(null);
  };

  // Cleanup polling interval on unmount
  useEffect(() => {
    return () => {
      if (pollingInterval) {
        clearInterval(pollingInterval);
      }
    };
  }, [pollingInterval]);

  // Auto-select the latest video when the page loads
  useEffect(() => {
    // This will be handled by the VideoGallery component
    // which will automatically select the latest video
    // COMMENTED OUT FOR TESTING - VideoGallery is disabled
  }, []);

  const getStatusIcon = () => {
    switch (generationStatus) {
      case 'queued':
        return '⏳';
      case 'processing':
        return '🔄';
      case 'completed':
        return '✅';
      case 'error':
        return '❌';
      default:
        return '📹';
    }
  };

  return (
    <ProtectedRoute>
      <div className="min-h-screen bg-black">
        {/* Top Bar */}
        <div className="flex items-center justify-between p-4 border-b border-slate-800 bg-slate-900">
          <div className="flex items-center space-x-4">
            <div className="text-yellow-400 text-2xl">⚡</div>
            <div className="text-white text-xl font-bold">Viral Shorts</div>
          </div>

          <div className="flex-1 flex justify-center">
            <div className="max-w-4xl w-full">
              <Breadcrumb
                items={[
                  { label: 'Dashboard', href: '/create' },
                  { label: 'Create' },
                ]}
              />
            </div>
          </div>

          <div className="w-32">{/* Spacer to balance the layout */}</div>
        </div>

        <div className="flex h-screen">
          {/* Left Sidebar */}
          <div className="w-64 bg-black border-r border-slate-800 p-6 flex flex-col">
            {/* Top Section */}
            <div className="flex-1 space-y-6">
              {/* Navigation Links */}
              <div className="space-y-2">
                <div className="flex items-center space-x-3 text-white bg-slate-800 p-2 rounded-lg cursor-pointer">
                  <span>🏠</span>
                  <span>Dashboard</span>
                </div>
                <a
                  href="/videos"
                  className="flex items-center space-x-3 text-white hover:bg-slate-800 p-2 rounded-lg cursor-pointer"
                >
                  <span>📹</span>
                  <span>Videos</span>
                </a>
              </div>

              {/* Credits Section */}
              <div className="mt-auto">
                <div className="bg-gradient-to-b from-purple-900 to-purple-800 border border-purple-700 rounded-xl p-4">
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex items-center space-x-3">
                      <div className="relative">
                        <div className="w-8 h-8 bg-purple-600 rounded-full flex items-center justify-center text-white text-sm font-bold">
                          $
                        </div>
                      </div>
                      <div>
                        <div className="text-white text-2xl font-bold">10</div>
                        <div className="text-gray-300 text-xs">
                          Credits available
                        </div>
                      </div>
                    </div>
                    <div className="bg-purple-600 text-white text-xs px-2 py-1 rounded-full">
                      Free
                    </div>
                  </div>
                  <div className="text-white text-xs mb-3">
                    Need more? Upgrade your plan
                  </div>
                  <button className="w-full bg-purple-600 hover:bg-purple-700 text-white text-sm font-semibold py-2 rounded-xl transition-colors">
                    Upgrade now
                  </button>
                </div>
              </div>
            </div>

            {/* Bottom Section - Login Button */}
            <div className="border-t border-slate-800 pt-4 mt-auto">
              <LoginButton variant="outline" className="w-full" />
            </div>
          </div>

          {/* Center Content */}
          <div className="flex-1 p-8 bg-black">
            <div className="max-w-4xl mx-auto h-full flex flex-col justify-start pt-8">
              {/* Header */}
              <div className="mb-8">
                <h1 className="text-3xl font-bold text-white mb-2">
                  Create a new video
                </h1>
                <p className="text-gray-300">
                  Select a tool and pick your options to create your video.
                </p>
              </div>

              {/* Video Type Selection */}
              <div className="mb-8">
                <div className="flex space-x-2 overflow-x-auto pb-2">
                  <button className="bg-blue-600 text-white px-4 py-2 rounded-full text-sm whitespace-nowrap">
                    Faceless Video
                  </button>
                  <div className="relative group">
                    <button
                      className="bg-slate-800 text-gray-500 px-4 py-2 rounded-full text-sm whitespace-nowrap cursor-not-allowed opacity-50"
                      disabled
                    >
                      AI Influencer
                    </button>
                    <div className="absolute bottom-full left-1/2 transform -translate-x-1/2 mb-2 px-3 py-1 bg-black text-white text-xs rounded-lg opacity-0 group-hover:opacity-100 transition-opacity duration-0 pointer-events-none whitespace-nowrap z-10">
                      Available soon
                      <div className="absolute top-full left-1/2 transform -translate-x-1/2 w-0 h-0 border-l-4 border-r-4 border-t-4 border-transparent border-t-black"></div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Script Section */}
              <div className="mb-8">
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center space-x-2">
                    <h2 className="text-xl font-semibold text-white">Script</h2>
                    <div className="relative group">
                      <span className="text-gray-400 cursor-help">❓</span>
                      <div className="absolute bottom-full left-full ml-2 mt-5 px-3 py-3 bg-slate-800 border border-slate-600 text-white text-xs rounded-lg opacity-0 group-hover:opacity-100 transition-opacity duration-0 pointer-events-none z-10 w-[275px]">
                        Write or generate a script for your video.
                        <br />
                        The AI will use this text to create matching visuals.
                        <div className="absolute top-2 -left-2 w-0 h-0 border-l-4 border-r-4 border-t-4 border-transparent border-t-slate-800"></div>
                      </div>
                    </div>
                  </div>
                  <button className="bg-slate-800 hover:bg-slate-700 text-white px-4 py-2 rounded-lg text-sm flex items-center space-x-2">
                    <span>✨</span>
                    <span>AI script writer</span>
                  </button>
                </div>
                <p className="text-gray-300 text-sm mb-4">
                  Enter your video script or use AI to generate one.
                </p>
                <textarea
                  className="w-full h-32 bg-slate-800 border border-slate-700 rounded-lg p-4 text-white placeholder-gray-400 resize-none"
                  placeholder="Enter your video script here..."
                  value={script}
                  onChange={(e) => setScript(e.target.value)}
                  disabled={isGenerating}
                />
              </div>

              {/* Status Message */}
              {generationStatus !== 'idle' && (
                <div className="mb-6 p-4 bg-slate-800 border border-slate-700 rounded-lg">
                  <div className="flex items-center space-x-3">
                    <span className="text-2xl">{getStatusIcon()}</span>
                    <div>
                      <div className="text-white font-medium">
                        {generationStatus === 'queued' && 'Video Queued'}
                        {generationStatus === 'processing' &&
                          'Processing Video'}
                        {generationStatus === 'completed' && 'Video Completed'}
                        {generationStatus === 'error' && 'Generation Failed'}
                      </div>
                      <div className="text-gray-400 text-sm">
                        {statusMessage}
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Generate Button */}
              <div className="text-center">
                <button
                  onClick={handleGenerateVideo}
                  disabled={isGenerating || !script.trim()}
                  className={`px-8 py-4 rounded-lg text-lg font-semibold flex items-center justify-center space-x-2 mx-auto transition-colors ${
                    isGenerating || !script.trim()
                      ? 'bg-gray-600 text-gray-400 cursor-not-allowed'
                      : 'bg-blue-600 hover:bg-blue-700 text-white'
                  }`}
                >
                  {isGenerating ? (
                    <>
                      <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white"></div>
                      <span>Queuing...</span>
                    </>
                  ) : (
                    <>
                      <span>Estimated cost: 0 credits</span>
                      <span>Generate Video →</span>
                      <span>✨</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>

          {/* Right Sidebar - Video Preview */}
          <div className="w-[489px] bg-black border-l border-slate-800 p-6">
            <h2 className="text-xl font-semibold text-white mb-4">
              Output Example
            </h2>

            {/* Video Preview */}
            {generatedVideoUrl && (
              <div className="bg-black rounded-2xl overflow-hidden shadow-2xl border border-slate-700 mb-4">
                <VideoPreview videoUrl={generatedVideoUrl} />
              </div>
            )}

            {selectedGalleryVideo && !generatedVideoUrl && (
              <div className="bg-black rounded-2xl overflow-hidden shadow-2xl border border-slate-700 mb-4">
                <VideoPreview videoUrl={selectedGalleryVideo.url} />
              </div>
            )}

            {!generatedVideoUrl && !selectedGalleryVideo && (
              <div className="bg-black rounded-2xl overflow-hidden shadow-2xl border border-slate-700 h-96 flex items-center justify-center mb-4">
                <div className="text-center text-gray-400">
                  <div className="text-4xl mb-4">📹</div>
                  <p className="text-sm">Generate a video to see preview</p>
                </div>
              </div>
            )}

            {/* Hidden VideoGallery for auto-selecting latest video */}
            {/* COMMENTED OUT FOR TESTING - VideoGallery makes fetch-videos API call
            <div className="hidden">
              <VideoGallery onVideoSelect={handleGalleryVideoSelect} />
            </div>
            */}
          </div>
        </div>
      </div>
    </ProtectedRoute>
  );
}
