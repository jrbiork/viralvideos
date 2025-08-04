'use client';

import { useState } from 'react';
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

  const handleGenerationStart = () => {
    setIsGenerating(true);
    setGeneratedVideoUrl(null);
  };

  const handleVideoGenerated = (videoUrl: string) => {
    setIsGenerating(false);
    setGeneratedVideoUrl(videoUrl);
  };

  const handleGalleryVideoSelect = (video: any) => {
    setSelectedGalleryVideo(video);
    setGeneratedVideoUrl(null); // Clear the generated video when selecting from gallery
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-900 via-blue-900 to-indigo-900">
      {/* Navigation */}
      <nav className="flex items-center justify-between p-6">
        <div className="text-white text-2xl font-bold">ViralVideos</div>
        <LoginButton />
      </nav>

      {/* Main Content */}
      <div className="container mx-auto px-6 py-12">
        <div className="max-w-7xl mx-auto">
          {/* Header */}
          <div className="text-center mb-12">
            <h1 className="text-4xl font-bold text-white mb-4">
              Generate Your Video
            </h1>
            <p className="text-xl text-gray-300">
              Describe your vision and let AI create your viral video
            </p>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
            {/* Left Column - Video Generator */}
            <div className="space-y-8">
              {/* Video Generator */}
              <div className="bg-slate-800/50 backdrop-blur-sm rounded-2xl p-8 border border-slate-700">
                <VideoGenerator
                  onGenerationStart={handleGenerationStart}
                  onVideoGenerated={handleVideoGenerated}
                  isGenerating={isGenerating}
                />
              </div>

              {/* Video Preview - Generated Video */}
              {generatedVideoUrl && (
                <div className="bg-slate-800/50 backdrop-blur-sm rounded-2xl p-8 border border-slate-700">
                  <h3 className="text-2xl font-bold text-white mb-4">
                    🎬 Generated Video
                  </h3>
                  <VideoPreview videoUrl={generatedVideoUrl} />
                </div>
              )}

              {/* Video Preview - Selected from Gallery */}
              {selectedGalleryVideo && !generatedVideoUrl && (
                <div className="bg-slate-800/50 backdrop-blur-sm rounded-2xl p-8 border border-slate-700">
                  <h3 className="text-2xl font-bold text-white mb-4">
                    📺 Selected Video
                  </h3>
                  <VideoPreview videoUrl={selectedGalleryVideo.url} />
                </div>
              )}
            </div>

            {/* Right Column - Video Gallery */}
            <div className="space-y-8">
              <div className="bg-slate-800/50 backdrop-blur-sm rounded-2xl p-8 border border-slate-700">
                <VideoGallery onVideoSelect={handleGalleryVideoSelect} />
              </div>
            </div>
          </div>

          {/* Full Width Video Preview - When no side-by-side layout */}
          {(generatedVideoUrl || selectedGalleryVideo) && (
            <div className="mt-8 lg:hidden">
              <div className="bg-slate-800/50 backdrop-blur-sm rounded-2xl p-8 border border-slate-700">
                <h3 className="text-2xl font-bold text-white mb-4">
                  {generatedVideoUrl
                    ? '🎬 Generated Video'
                    : '📺 Selected Video'}
                </h3>
                <VideoPreview
                  videoUrl={generatedVideoUrl || selectedGalleryVideo?.url}
                />
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
