'use client';

import { useState } from 'react';
import VideoPreview from '../../components/VideoPreview';
import LoginButton from '../../components/LoginButton';
import UserDropdown from '../../components/UserDropdown';
import Breadcrumb from '../../components/Breadcrumb';
import AIScriptWriterModal from '../../components/AIScriptWriterModal';
import { useAuthenticatedFetch } from '../../components/useAuthenticatedFetch';

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
  const [isScriptModalOpen, setIsScriptModalOpen] = useState(false);
  const [isGeneratingScript, setIsGeneratingScript] = useState(false);
  const [selectedAspectRatio, setSelectedAspectRatio] = useState<
    '9:16' | '16:9' | '1:1'
  >('9:16');
  const { authenticatedFetch, isAuthenticated } = useAuthenticatedFetch();

  // Word count calculation
  const wordCount = script.trim() ? script.trim().split(/\s+/).length : 0;
  const maxWords = 100;
  const isOverLimit = wordCount > maxWords;

  // Example video URL
  const exampleVideoUrl = '/assets/example.mp4';

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

      setGenerationStatus('processing');
      setStatusMessage(
        'Video is being generated... This may take a few minutes.',
      );
    } catch (error) {
      console.error('Error queuing video generation:', error);
      setGenerationStatus('error');
      setStatusMessage('Failed to queue video generation. Please try again.');
      alert('Failed to queue video generation. Please try again.');
    } finally {
      setIsGenerating(false);
    }
  };

  const handleGenerateScript = async (prompt: string) => {
    setIsGeneratingScript(true);

    try {
      // For now, we'll simulate AI script generation
      // In the future, this would call an AI API
      const generatedScript = `Create a short video about ${prompt}. The video should be engaging and show ${prompt} in an interesting and visually appealing way.`;

      setScript(generatedScript);
      setIsScriptModalOpen(false);
    } catch (error) {
      console.error('Error generating script:', error);
      alert('Failed to generate script. Please try again.');
    } finally {
      setIsGeneratingScript(false);
    }
  };

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
    <div className="h-screen bg-black flex flex-col">
      {/* Top Bar */}
      <div className="flex items-center justify-between p-4 border-b border-slate-800 bg-slate-900 flex-shrink-0">
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

      <div className="flex flex-col lg:flex-row flex-1 overflow-hidden">
        {/* Left Sidebar */}
        <div className="w-full lg:w-64 bg-black border-b lg:border-b-0 lg:border-r border-slate-800 p-4 lg:p-6 flex flex-col">
          {/* Top Section */}
          <div className="flex-1 space-y-4 lg:space-y-6">
            {/* Navigation Links */}
            <div className="space-y-2">
              <div className="flex items-center space-x-3 text-white bg-slate-800 p-2 rounded-lg cursor-pointer">
                <span>🏠</span>
                <span className="hidden sm:inline">Dashboard</span>
              </div>
              <a
                href="/videos"
                className="flex items-center space-x-3 text-white hover:bg-slate-800 p-2 rounded-lg cursor-pointer"
              >
                <span>📹</span>
                <span className="hidden sm:inline">Videos</span>
              </a>
            </div>
          </div>

          {/* Bottom Section - Credits and Login */}
          <div className="space-y-3 lg:space-y-4">
            {/* Credits Section */}
            <div className="bg-gradient-to-b from-purple-900 to-purple-800 border border-purple-700 rounded-xl p-3 lg:p-4">
              <div className="flex items-start justify-between mb-2 lg:mb-3">
                <div className="flex items-center space-x-2 lg:space-x-3">
                  <div className="relative">
                    <div className="w-6 h-6 lg:w-8 lg:h-8 bg-purple-600 rounded-full flex items-center justify-center text-white text-xs lg:text-sm font-bold">
                      $
                    </div>
                  </div>
                  <div>
                    <div className="text-white text-lg lg:text-2xl font-bold">
                      10
                    </div>
                    <div className="text-gray-300 text-xs">
                      Credits available
                    </div>
                  </div>
                </div>
                <div className="bg-purple-600 text-white text-xs px-2 py-1 rounded-full">
                  Free
                </div>
              </div>
              <div className="text-white text-xs mb-2 lg:mb-3">
                Need more? Upgrade your plan
              </div>
              <button className="w-full bg-purple-600 hover:bg-purple-700 text-white text-xs lg:text-sm font-semibold py-2 rounded-xl transition-colors">
                Upgrade now
              </button>
            </div>

            {/* User Dropdown */}
            <UserDropdown className="w-full" />
          </div>
        </div>

        {/* Center Content */}
        <div className="flex-1 p-4 lg:p-8 bg-black overflow-y-auto">
          <div className="max-w-4xl mx-auto flex flex-col justify-start pt-4 lg:pt-8">
            {/* Header */}
            <div className="mb-6 lg:mb-8">
              <h1 className="text-2xl lg:text-3xl font-bold text-white mb-2">
                Create a new video
              </h1>
              <p className="text-gray-300 text-sm lg:text-base">
                Select a tool and pick your options to create your video.
              </p>
            </div>

            {/* Video Type Selection */}
            <div className="mb-6 lg:mb-8">
              <div className="flex space-x-2 overflow-x-auto pb-2">
                <button className="bg-blue-600 text-white px-3 lg:px-4 py-2 rounded-full text-xs lg:text-sm whitespace-nowrap">
                  Faceless Video
                </button>
                <div className="relative group">
                  <button
                    className="bg-slate-800 text-gray-500 px-3 lg:px-4 py-2 rounded-full text-xs lg:text-sm whitespace-nowrap cursor-not-allowed opacity-50"
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
                <div className="flex items-center space-x-4">
                  {/* Aspect Ratio Selection */}
                  <div className="flex bg-slate-800 rounded-lg p-1 border border-slate-700">
                    <button
                      onClick={() => setSelectedAspectRatio('9:16')}
                      className={`flex items-center space-x-2 px-3 py-2 rounded-md text-sm font-medium transition-colors ${
                        selectedAspectRatio === '9:16'
                          ? 'bg-slate-700 text-white'
                          : 'text-gray-400 hover:text-white'
                      }`}
                    >
                      <svg
                        className="w-4 h-4"
                        fill="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <rect
                          x="6"
                          y="4"
                          width="12"
                          height="16"
                          rx="1"
                          fill="currentColor"
                        />
                      </svg>
                      <span>9:16</span>
                    </button>
                    <button
                      disabled
                      className="flex items-center space-x-2 px-3 py-2 rounded-md text-sm font-medium transition-colors text-gray-500 cursor-not-allowed opacity-50"
                    >
                      <svg
                        className="w-4 h-4"
                        fill="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <rect
                          x="4"
                          y="6"
                          width="16"
                          height="12"
                          rx="1"
                          fill="currentColor"
                        />
                      </svg>
                      <span>16:9</span>
                    </button>
                    <button
                      disabled
                      className="flex items-center space-x-2 px-3 py-2 rounded-md text-sm font-medium transition-colors text-gray-500 cursor-not-allowed opacity-50"
                    >
                      <svg
                        className="w-4 h-4"
                        fill="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <rect
                          x="6"
                          y="6"
                          width="12"
                          height="12"
                          rx="1"
                          fill="currentColor"
                        />
                      </svg>
                      <span>1:1</span>
                    </button>
                  </div>
                  <button
                    onClick={() => setIsScriptModalOpen(true)}
                    className="bg-slate-800 hover:bg-slate-700 text-white px-4 py-2 rounded-lg text-sm flex items-center space-x-2"
                  >
                    <span>✨</span>
                    <span>AI script writer</span>
                  </button>
                </div>
              </div>
              <p className="text-gray-300 text-sm mb-4">
                Enter your video script or use AI to generate one.
              </p>
              <div className="relative">
                <textarea
                  className={`w-full h-32 bg-slate-800 border rounded-lg p-4 text-white placeholder-gray-400 resize-none focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                    isOverLimit
                      ? 'border-red-500 focus:ring-red-500'
                      : 'border-slate-700'
                  }`}
                  placeholder="Enter your video script here..."
                  value={script}
                  onChange={(e) => {
                    const newValue = e.target.value;
                    const newWordCount = newValue.trim()
                      ? newValue.trim().split(/\s+/).length
                      : 0;

                    // Only allow input if under word limit
                    if (
                      newWordCount <= maxWords ||
                      newValue.length < script.length
                    ) {
                      setScript(newValue);
                    }
                  }}
                  disabled={isGenerating}
                />
                <div
                  className={`absolute bottom-2 right-2 text-xs font-medium ${
                    isOverLimit
                      ? 'text-red-400'
                      : wordCount > maxWords * 0.8
                      ? 'text-yellow-400'
                      : 'text-gray-400'
                  }`}
                >
                  {wordCount}/{maxWords}
                </div>
              </div>
            </div>

            {/* Status Message */}
            {generationStatus !== 'idle' && (
              <div className="mb-6 p-4 bg-slate-800 border border-slate-700 rounded-lg">
                <div className="flex items-center space-x-3">
                  <span className="text-2xl">{getStatusIcon()}</span>
                  <div>
                    <div className="text-white font-medium">
                      {generationStatus === 'queued' && 'Video Queued'}
                      {generationStatus === 'processing' && 'Processing Video'}
                      {generationStatus === 'completed' && 'Video Completed'}
                      {generationStatus === 'error' && 'Generation Failed'}
                    </div>
                    <div className="text-gray-400 text-sm">{statusMessage}</div>
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
        <div className="w-full lg:w-2/6 bg-black border-l border-slate-800 overflow-y-auto">
          <div className="sticky top-4">
            <div className="rounded-lg border-slate-800 border bg-slate-900 text-white p-4 border-none shadow-none">
              <div className="flex flex-col space-y-1.5 p-6">
                <h3 className="font-semibold tracking-tight text-md font-mono">
                  Output Example
                </h3>
              </div>
              <div className="p-6 pt-0">
                {/* Video Preview */}
                {generatedVideoUrl && (
                  <video
                    className="w-full rounded-lg shadow-lg border border-slate-800 group"
                    controls
                    src={generatedVideoUrl}
                  />
                )}

                {selectedGalleryVideo && !generatedVideoUrl && (
                  <video
                    className="w-full rounded-lg shadow-lg border border-slate-800 group"
                    controls
                    src={selectedGalleryVideo.url}
                  />
                )}

                {!generatedVideoUrl && !selectedGalleryVideo && (
                  <video
                    className="w-full rounded-lg shadow-lg border border-slate-800 group"
                    controls
                    autoPlay
                    muted
                    loop
                    src={exampleVideoUrl}
                  />
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* AI Script Writer Modal */}
      <AIScriptWriterModal
        isOpen={isScriptModalOpen}
        onClose={() => setIsScriptModalOpen(false)}
        initialScript={script}
        onGenerate={handleGenerateScript}
        isGenerating={isGeneratingScript}
      />
    </div>
  );
}
