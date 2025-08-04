'use client';

import { useState, useEffect } from 'react';
import VideoGenerator from '../../components/VideoGenerator';
import VideoPreview from '../../components/VideoPreview';
import VideoGallery from '../../components/VideoGallery';
import LoginButton from '../../components/LoginButton';

export default function GeneratePage() {
  const [isGenerating, setIsGenerating] = useState(false);
  const [generatedVideoUrl, setGeneratedVideoUrl] = useState<string | null>(
    null,
  );
  const [selectedGalleryVideo, setSelectedGalleryVideo] = useState<any>(null);
  const [script, setScript] = useState('Create a short video about a cat playing in a garden. The video should be engaging and show the cat exploring different areas of the garden, chasing butterflies, and relaxing in the sunshine.');

  const handleGenerateVideo = async () => {
    if (!script.trim()) return;

    setIsGenerating(true);
    setGeneratedVideoUrl(null);

    try {
      const response = await fetch('/api/generate-video', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          prompt: script,
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to generate video');
      }

      const data = await response.json();
      setGeneratedVideoUrl(data.videoUrl);
    } catch (error) {
      console.error('Error generating video:', error);
      alert('Failed to generate video. Please try again.');
    } finally {
      setIsGenerating(false);
    }
  };

  const handleGalleryVideoSelect = (video: any) => {
    setSelectedGalleryVideo(video);
    setGeneratedVideoUrl(null);
  };

  // Auto-select the latest video when the page loads
  useEffect(() => {
    // This will be handled by the VideoGallery component
    // which will automatically select the latest video
  }, []);

  return (
    <div className="min-h-screen bg-black">
      {/* Top Bar */}
      <div className="flex items-center justify-between p-4 border-b border-slate-800 bg-slate-900">
        <div className="flex items-center space-x-4">
          <div className="text-yellow-400 text-2xl">⚡</div>
          <div className="text-white text-xl font-bold">Viral Shorts</div>
        </div>
        
        <div className="flex items-center space-x-4">
          <div className="text-gray-300 text-sm">Dashboard > Create</div>
        </div>
      </div>

      <div className="flex h-screen">
        {/* Left Sidebar */}
        <div className="w-64 bg-black border-r border-slate-800 p-6 flex flex-col">
          {/* Top Section */}
          <div className="flex-1 space-y-6">
            {/* Navigation Links */}
            <div className="space-y-2">
              <div className="flex items-center space-x-3 text-white hover:bg-slate-800 p-2 rounded-lg cursor-pointer">
                <span>🏠</span>
                <span>Dashboard</span>
              </div>
              <div className="flex items-center space-x-3 text-white hover:bg-slate-800 p-2 rounded-lg cursor-pointer">
                <span>📹</span>
                <span>Videos</span>
              </div>
            </div>

            {/* Credits Section */}
            <div className="border-t border-slate-800 pt-4">
              <div className="bg-slate-800 border border-slate-700 rounded-lg p-4">
                <div className="text-white text-sm font-medium">10 Free Credits available</div>
                <div className="text-gray-400 text-xs">Free</div>
                <button className="w-full mt-2 bg-purple-600 hover:bg-purple-700 text-white text-xs py-2 rounded-lg transition-colors">
                  Upgrade now
                </button>
              </div>
            </div>
          </div>

          {/* Bottom Section - User Info */}
          <div className="border-t border-slate-800 pt-4 mt-auto">
            <div className="flex items-center justify-between text-white">
              <div className="flex items-center space-x-3">
                <div className="w-8 h-8 bg-purple-600 rounded-full flex items-center justify-center text-sm">
                  R
                </div>
                <div>
                  <div className="text-sm font-medium">Rubens</div>
                  <div className="text-xs text-gray-400">rbiork@gmail.com</div>
                </div>
              </div>
              <span>▼</span>
            </div>
          </div>
        </div>

        {/* Center Content */}
        <div className="flex-1 p-8 bg-black">
                  <div className="max-w-4xl mx-auto h-full flex flex-col justify-center">
          {/* Header */}
          <div className="mb-8">
            <h1 className="text-3xl font-bold text-white mb-2">Create a new video</h1>
            <p className="text-gray-300">Select a tool and pick your options to create your video.</p>
          </div>

          {/* Video Type Selection */}
          <div className="mb-8">
            <div className="flex space-x-2 overflow-x-auto pb-2">
              <button className="bg-blue-600 text-white px-4 py-2 rounded-full text-sm whitespace-nowrap">
                Faceless Video
              </button>
              <button className="bg-slate-800 text-gray-300 px-4 py-2 rounded-full text-sm whitespace-nowrap hover:bg-slate-700">
                UGC Video
              </button>
              <button className="bg-slate-800 text-gray-300 px-4 py-2 rounded-full text-sm whitespace-nowrap hover:bg-slate-700">
                Gameplay Video
              </button>
              <button className="bg-slate-800 text-gray-300 px-4 py-2 rounded-full text-sm whitespace-nowrap hover:bg-slate-700">
                UGC Ads
              </button>
              <button className="bg-slate-800 text-gray-300 px-4 py-2 rounded-full text-sm whitespace-nowrap hover:bg-slate-700">
                Italian Brainrot
              </button>
              <button className="bg-slate-800 text-gray-300 px-4 py-2 rounded-full text-sm whitespace-nowrap hover:bg-slate-700">
                POV Video
              </button>
            </div>
          </div>

          {/* Script Section */}
          <div className="mb-8">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center space-x-2">
                <h2 className="text-xl font-semibold text-white">Script</h2>
                <span className="text-gray-400">❓</span>
              </div>
              <button className="bg-slate-800 hover:bg-slate-700 text-white px-4 py-2 rounded-lg text-sm flex items-center space-x-2">
                <span>✨</span>
                <span>AI script writer</span>
              </button>
            </div>
            <p className="text-gray-300 text-sm mb-4">Enter your video script or use AI to generate one.</p>
            <textarea 
              className="w-full h-32 bg-slate-800 border border-slate-700 rounded-lg p-4 text-white placeholder-gray-400 resize-none"
              placeholder="Enter your video script here..."
              value={script}
              onChange={(e) => setScript(e.target.value)}
            />
          </div>

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
                  <span>Generating...</span>
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
        <div className="w-[425px] bg-black border-l border-slate-800 p-6">
          <h2 className="text-xl font-semibold text-white mb-4">Output Example</h2>
          
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
          <div className="hidden">
            <VideoGallery onVideoSelect={handleGalleryVideoSelect} />
          </div>
        </div>
      </div>
    </div>
  );
}
