'use client';

import { useState, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import CreditsDisplay from '../../components/CreditsDisplay';
import VideoEditorLayout from '../../components/VideoEditorLayout';
import { useAuthenticatedFetch } from '../../components/useAuthenticatedFetch';
import ProgressSteps from '../../components/ProgressSteps';
import EditScene from '../../components/EditScene';
import EditSceneSkeleton from '../../components/EditSceneSkeleton';

interface Scene {
  id: number;
  description: string;
  narration: string;
  duration: number;
}

interface ScriptData {
  prompt: string;
  sceneCount: number;
  sceneDuration: number;
  totalDuration: number;
  scenes: Scene[];
  voiceToneInstruction: string;
  timestamp: string;
}

export default function EditPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [scriptData, setScriptData] = useState<ScriptData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editingScene, setEditingScene] = useState<number | null>(null);
  const [editedNarration, setEditedNarration] = useState('');
  const [pollingCount, setPollingCount] = useState(0);
  const { authenticatedFetch, isAuthenticated } = useAuthenticatedFetch();

  // Get userId and timestamp from URL parameters
  const userId = searchParams.get('userId');
  const timestamp = searchParams.get('timestamp');

  const handleEditScene = (sceneId: number, narration: string) => {
    setEditingScene(sceneId);
    setEditedNarration(narration);
  };

  const handleSaveEdit = (sceneId: number) => {
    if (scriptData) {
      const updatedScenes = scriptData.scenes.map((scene) =>
        scene.id === sceneId ? { ...scene, narration: editedNarration } : scene,
      );
      setScriptData({ ...scriptData, scenes: updatedScenes });
      setEditingScene(null);
      setEditedNarration('');
    }
  };

  const handleCancelEdit = () => {
    setEditingScene(null);
    setEditedNarration('');
  };

  const handleUpdatePreview = () => {
    // TODO: Implement preview update logic
    console.log('Updating preview with edited scenes:', scriptData);
  };

  if (loading) {
    return (
      <div
        className="h-screen flex items-center justify-center"
        style={{ backgroundColor: 'rgba(9,5,38,255)' }}
      >
        <div className="text-center text-white">
          <div className="text-xl mb-4">Loading script data...</div>
          {pollingCount > 0 && (
            <div className="text-sm text-gray-300">
              Attempt {pollingCount + 1} - Checking every 10 seconds
            </div>
          )}
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div
        className="h-screen flex items-center justify-center"
        style={{ backgroundColor: 'rgba(9,5,38,255)' }}
      >
        <div className="text-white text-xl">{error}</div>
      </div>
    );
  }

  if (!scriptData) {
    return (
      <div
        className="h-screen flex items-center justify-center"
        style={{ backgroundColor: 'rgba(9,5,38,255)' }}
      >
        <div className="text-white text-xl">No script data available</div>
      </div>
    );
  }

  // Right sidebar content
  const rightSidebarContent = (
    <div className="sticky top-4 p-4">
      {/* Aspect Ratio Indicator */}
      <div className="flex items-center space-x-2 mb-4">
        <div className="w-6 h-3 bg-white rounded-sm flex items-center justify-center">
          <div className="w-1 h-1 bg-gray-800 rounded-full"></div>
        </div>
        <span className="text-white text-sm">9:16 Vertical</span>
      </div>

      {/* Video Preview */}
      <div className="bg-slate-900 rounded-lg overflow-hidden">
        <div className="aspect-[9/16] bg-gradient-to-br from-pink-400 to-purple-600 flex items-center justify-center relative">
          {/* Placeholder Video Content */}
          <div className="text-center text-white">
            <div className="w-16 h-16 bg-white/20 rounded-full flex items-center justify-center mx-auto mb-4">
              <svg className="w-8 h-8" fill="currentColor" viewBox="0 0 24 24">
                <path d="M8 5v14l11-7z" />
              </svg>
            </div>
            <p className="text-sm opacity-80">Video Preview</p>
          </div>

          {/* Text Overlay */}
          <div className="absolute bottom-4 left-4 right-4 text-white text-sm">
            <p className="bg-black/50 p-2 rounded">
              First stop:{' '}
              <span className="text-blue-400">Brammibal's Donuts</span>. Famous
              for their vegan recipes and colorful toppings, this...
            </p>
          </div>
        </div>

        {/* Video Controls */}
        <div className="p-4 bg-slate-800 flex items-center justify-between">
          <button className="text-white hover:text-gray-300">
            <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 24 24">
              <path d="M6 4h4v16H6V4zm8 0h4v16h-4V4z" />
            </svg>
          </button>
          <button className="text-white hover:text-gray-300">
            <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 24 24">
              <path d="M11.99 5V1l-5 5 5 5V7c3.31 0 6 2.69 6 6s-2.69 6-6 6-6-2.69-6-6H4c0 4.42 3.58 8 8 8s8-3.58 8-8-3.58-8-8-8z" />
            </svg>
            <span className="text-xs ml-1">10</span>
          </button>
          <button className="text-white hover:text-gray-300">
            <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 24 24">
              <path d="M12 5V1L7 6l5 5V7c3.31 0 6 2.69 6 6s-2.69 6-6 6-6-2.69-6-6H2c0 4.42 3.58 8 8 8s8-3.58 8-8-3.58-8-8-8z" />
            </svg>
            <span className="text-xs ml-1">10</span>
          </button>
          <button className="text-white hover:text-gray-300">
            <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 24 24">
              <path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02zM14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77z" />
            </svg>
          </button>
        </div>
      </div>
    </div>
  );

  return (
    <VideoEditorLayout
      rightSidebarContent={rightSidebarContent}
      showCreditsUpgrade={false}
    >
      <div className="max-w-4xl mx-auto flex flex-col justify-start pt-4 lg:pt-8">
        {/* Progress Steps */}
        <ProgressSteps currentStep={2} />

        {/* Header */}
        <div className="mb-6 lg:mb-8">
          <h1 className="text-2xl lg:text-3xl font-bold text-white mb-2">
            Review the scenes of your video
          </h1>
          <p className="text-gray-300 text-sm lg:text-base">
            Edit the text and add new or delete scenes.
          </p>
        </div>

        {/* Scene Cards */}
        <div className="space-y-4 mb-8">
          {loading
            ? // Show skeleton placeholders while loading
              Array.from({ length: 3 }).map((_, index) => (
                <EditSceneSkeleton key={index} />
              ))
            : scriptData.scenes.map((scene, index) => (
                <EditScene
                  key={scene.id}
                  scene={scene}
                  editingScene={editingScene}
                  editedNarration={editedNarration}
                  onEditScene={handleEditScene}
                  onSaveEdit={handleSaveEdit}
                  onCancelEdit={handleCancelEdit}
                  onEditedNarrationChange={setEditedNarration}
                />
              ))}
        </div>

        {/* Update Preview Button */}
        <div className="text-center">
          <button
            onClick={handleUpdatePreview}
            disabled={loading}
            className={`px-8 py-4 rounded-lg text-lg font-semibold transition-colors ${
              loading
                ? 'bg-gray-600 text-gray-400 cursor-not-allowed'
                : 'bg-blue-600 hover:bg-blue-700 text-white'
            }`}
          >
            {loading ? 'Loading...' : 'Update Preview 3 Credits'}
          </button>
        </div>
      </div>
    </VideoEditorLayout>
  );
}
