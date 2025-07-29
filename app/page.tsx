'use client';

import { useState } from 'react';
import { Video, Sparkles, Download, Play } from 'lucide-react';
import VideoGenerator from '@/components/VideoGenerator';
import VideoPreview from '@/components/VideoPreview';
import VideoGallery from '@/components/VideoGallery';

export default function Home() {
  const [generatedVideo, setGeneratedVideo] = useState<string | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);

  const handleVideoGenerated = (videoUrl: string) => {
    setGeneratedVideo(videoUrl);
    setIsGenerating(false);
  };

  const handleGenerationStart = () => {
    setIsGenerating(true);
    setGeneratedVideo(null);
  };

  return (
    <main className="container mx-auto px-4 py-8 min-h-screen">
      <div className="text-center mb-12 animate-fade-in-up">
        <div className="flex items-center justify-center mb-6">
          <div className="relative">
            <div className="absolute inset-0 bg-gradient-to-r from-blue-500 to-green-500 rounded-full blur-xl opacity-20"></div>
            <Video className="w-10 h-10 text-blue-400 relative z-10" />
          </div>
          <h1 className="text-5xl font-bold bg-gradient-to-r from-blue-400 to-green-400 bg-clip-text text-transparent ml-4">
            Viral Videos MVP
          </h1>
        </div>
        <p className="text-xl text-slate-300 max-w-3xl mx-auto leading-relaxed">
          Generate stunning vertical videos for TikTok and Instagram Reels using
          <span className="text-blue-400 font-semibold">
            {' '}
            AI-powered video generation
          </span>
          , narration, and subtitles.
        </p>
      </div>

      <div className="max-w-5xl mx-auto">
        <div className="glass-effect rounded-2xl p-8 mb-8 animate-fade-in-up">
          <div className="flex items-center mb-8">
            <div className="w-12 h-12 bg-gradient-to-r from-blue-500 to-green-500 rounded-xl flex items-center justify-center mr-4">
              <Sparkles className="w-6 h-6 text-white" />
            </div>
            <h2 className="text-3xl font-bold text-white">Create Your Video</h2>
          </div>

          <VideoGenerator
            onGenerationStart={handleGenerationStart}
            onVideoGenerated={handleVideoGenerated}
            isGenerating={isGenerating}
          />
        </div>

        {isGenerating && (
          <div className="glass-effect rounded-2xl p-8 mb-8 animate-fade-in-up">
            <div className="text-center">
              <div className="relative mb-6">
                <div className="w-16 h-16 border-4 border-slate-600 rounded-full animate-pulse-slow"></div>
                <div className="absolute inset-0 w-16 h-16 border-4 border-blue-500 rounded-full animate-spin border-t-transparent"></div>
              </div>
              <h3 className="text-2xl font-bold text-white mb-3">
                Generating Your Video
              </h3>
              <p className="text-slate-300 text-lg">
                Our AI is creating your masterpiece with narration and
                subtitles...
              </p>
              <div className="mt-4 flex justify-center space-x-2">
                <div className="w-2 h-2 bg-blue-500 rounded-full animate-pulse"></div>
                <div
                  className="w-2 h-2 bg-green-500 rounded-full animate-pulse"
                  style={{ animationDelay: '0.2s' }}
                ></div>
                <div
                  className="w-2 h-2 bg-purple-500 rounded-full animate-pulse"
                  style={{ animationDelay: '0.4s' }}
                ></div>
              </div>
            </div>
          </div>
        )}

        {generatedVideo && (
          <div className="glass-effect rounded-2xl p-8 animate-fade-in-up">
            <div className="flex items-center mb-8">
              <div className="w-12 h-12 bg-gradient-to-r from-green-500 to-emerald-500 rounded-xl flex items-center justify-center mr-4">
                <Play className="w-6 h-6 text-white" />
              </div>
              <h2 className="text-3xl font-bold text-white">
                Your Generated Video
              </h2>
            </div>

            <VideoPreview videoUrl={generatedVideo} />

            <div className="mt-8 flex justify-center">
              <a
                href={generatedVideo}
                download="generated-video.mp4"
                className="inline-flex items-center px-8 py-4 bg-gradient-to-r from-green-500 to-emerald-500 text-white font-bold rounded-xl hover:from-green-600 hover:to-emerald-600 transition-all duration-200 transform hover:scale-105 shadow-lg hover:shadow-xl"
              >
                <Download className="w-5 h-5 mr-3" />
                Download Video
              </a>
            </div>
          </div>
        )}

        {/* Video Gallery Section */}
        <div className="mt-8">
          <VideoGallery />
        </div>
      </div>

      <div className="mt-20 text-center animate-fade-in-up">
        <h3 className="text-3xl font-bold text-white mb-12">How It Works</h3>
        <div className="grid md:grid-cols-3 gap-8 max-w-5xl mx-auto">
          <div className="glass-effect rounded-xl p-8 hover:transform hover:scale-105 transition-all duration-300">
            <div className="w-16 h-16 bg-gradient-to-r from-blue-500 to-blue-600 rounded-full flex items-center justify-center mx-auto mb-6">
              <span className="text-white font-bold text-xl">1</span>
            </div>
            <h4 className="font-bold text-white text-xl mb-4">
              Write Your Story
            </h4>
            <p className="text-slate-300 leading-relaxed">
              Enter a descriptive prompt about your video content and set the
              duration
            </p>
          </div>
          <div className="glass-effect rounded-xl p-8 hover:transform hover:scale-105 transition-all duration-300">
            <div className="w-16 h-16 bg-gradient-to-r from-purple-500 to-purple-600 rounded-full flex items-center justify-center mx-auto mb-6">
              <span className="text-white font-bold text-xl">2</span>
            </div>
            <h4 className="font-bold text-white text-xl mb-4">AI Processing</h4>
            <p className="text-slate-300 leading-relaxed">
              Our advanced AI generates video scenes, narration, and subtitles
              automatically
            </p>
          </div>
          <div className="glass-effect rounded-xl p-8 hover:transform hover:scale-105 transition-all duration-300">
            <div className="w-16 h-16 bg-gradient-to-r from-green-500 to-green-600 rounded-full flex items-center justify-center mx-auto mb-6">
              <span className="text-white font-bold text-xl">3</span>
            </div>
            <h4 className="font-bold text-white text-xl mb-4">
              Download & Share
            </h4>
            <p className="text-slate-300 leading-relaxed">
              Get your professional vertical video ready for social media
              platforms
            </p>
          </div>
        </div>
      </div>
    </main>
  );
}
