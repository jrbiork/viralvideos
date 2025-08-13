'use client';

import { useState } from 'react';
import { Send, Sparkles, Clock, Film } from 'lucide-react';
import { useAuthenticatedFetch } from './useAuthenticatedFetch';

interface VideoGeneratorProps {
  onGenerationStart: () => void;
  onVideoGenerated: (videoUrl: string) => void;
  isGenerating: boolean;
}

export default function VideoGenerator({
  onGenerationStart,
  onVideoGenerated,
  isGenerating,
}: VideoGeneratorProps) {
  const [prompt, setPrompt] = useState(
    'A beautiful sunset over the ocean with gentle waves, perfect for a relaxing meditation video',
  );
  const [duration, setDuration] = useState(10); // Default 10 seconds
  const [sceneCount, setSceneCount] = useState(1); // Default 1 scene
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { authenticatedFetch, isAuthenticated } = useAuthenticatedFetch();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!prompt.trim() || isGenerating || !isAuthenticated) return;

    setIsSubmitting(true);
    onGenerationStart();

    try {
      const data = await authenticatedFetch('/api/generate-video', {
        method: 'POST',
        body: {
          prompt: prompt.trim(),
          duration: duration,
          sceneCount: sceneCount,
        },
      });

      onVideoGenerated(data.videoUrl);
    } catch (error) {
      console.error('Error generating video:', error);
      alert('Failed to generate video. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-8">
      {!isAuthenticated && (
        <div className="p-4 bg-yellow-500/10 border border-yellow-500/20 rounded-lg">
          <p className="text-yellow-400 text-sm">
            Please sign in to generate videos. Your authentication token will be
            automatically included in all requests.
          </p>
        </div>
      )}

      <div>
        <label
          htmlFor="prompt"
          className="block text-lg font-semibold text-white mb-3"
        >
          Describe Your Video
        </label>
        <textarea
          id="prompt"
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          placeholder="e.g., A beautiful sunset over the ocean with gentle waves, perfect for a relaxing meditation video..."
          className="w-full px-6 py-4 bg-slate-800 border border-slate-600 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none text-white placeholder-slate-400 transition-all duration-200"
          rows={4}
          disabled={isGenerating || !isAuthenticated}
        />
        <p className="mt-3 text-sm text-slate-400">
          Be descriptive! Include details about scenes, mood, and style for
          better results.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div>
          <label className="block text-lg font-semibold text-white mb-3">
            <div className="flex items-center">
              <Clock className="w-5 h-5 mr-2 text-blue-400" />
              Video Duration:{' '}
              <span className="text-blue-400 ml-1">{duration}s</span>
            </div>
          </label>
          <div className="relative">
            <input
              type="range"
              min="10"
              max="60"
              value={duration}
              onChange={(e) => setDuration(parseInt(e.target.value))}
              className="w-full h-3 bg-slate-700 rounded-lg appearance-none cursor-pointer slider"
              disabled={isGenerating || !isAuthenticated}
            />
            <div className="flex justify-between text-sm text-slate-400 mt-2">
              <span>10s</span>
              <span>35s</span>
              <span>60s</span>
            </div>
          </div>
          <p className="mt-3 text-sm text-slate-400">
            Choose the duration for your video. Longer videos may take more time
            to generate.
          </p>
        </div>

        <div>
          <label className="block text-lg font-semibold text-white mb-3">
            <div className="flex items-center">
              <Film className="w-5 h-5 mr-2 text-blue-400" />
              Number of Scenes:{' '}
              <span className="text-blue-400 ml-1">{sceneCount}</span>
            </div>
          </label>
          <div className="relative">
            <input
              type="range"
              min="1"
              max="6"
              value={sceneCount}
              onChange={(e) => setSceneCount(parseInt(e.target.value))}
              className="w-full h-3 bg-slate-700 rounded-lg appearance-none cursor-pointer slider"
              disabled={isGenerating || !isAuthenticated}
            />
            <div className="flex justify-between text-sm text-slate-400 mt-2">
              <span>1</span>
              <span>3</span>
              <span>6</span>
            </div>
          </div>
          <p className="mt-3 text-sm text-slate-400">
            Choose how many scenes to break your video into. More scenes create
            more variety.
          </p>
        </div>
      </div>

      <div className="flex items-center justify-between pt-4">
        <div className="flex items-center text-sm text-slate-400">
          <Sparkles className="w-4 h-4 mr-2 text-blue-400" />
          AI-powered video generation
        </div>

        <button
          type="submit"
          disabled={
            !prompt.trim() || isGenerating || isSubmitting || !isAuthenticated
          }
          className="inline-flex items-center px-8 py-4 bg-gradient-to-r from-blue-500 to-blue-600 text-white font-bold rounded-xl hover:from-blue-600 hover:to-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200 transform hover:scale-105 shadow-lg hover:shadow-xl"
        >
          <Send className="w-5 h-5 mr-3" />
          {isSubmitting ? 'Generating...' : 'Generate Video'}
        </button>
      </div>
    </form>
  );
}
