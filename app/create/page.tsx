'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { format } from 'date-fns';
import VideoPreview from '../../components/VideoPreview';
import MainLayout from '../../components/MainLayout';
import { useAuthenticatedFetch } from '../../components/useAuthenticatedFetch';
import ProgressSteps from '../../components/ProgressSteps';
import VideoCreator from '../../components/VideoCreator';
import EditScene from '../../components/EditScene';
import EditSceneSkeleton from '../../components/EditSceneSkeleton';
import ExportVideo from '../../components/ExportVideo';

export default function GeneratePage() {
  const router = useRouter();
  const [isGenerating, setIsGenerating] = useState(false);
  const [generatedVideoUrl, setGeneratedVideoUrl] = useState<string | null>(
    null,
  );
  const [selectedGalleryVideo, setSelectedGalleryVideo] = useState<any>(null);
  const [generationStatus, setGenerationStatus] = useState<
    'idle' | 'queued' | 'processing' | 'completed' | 'error'
  >('idle');
  const [statusMessage, setStatusMessage] = useState('');
  const [currentStep, setCurrentStep] = useState(1);
  const [scriptData, setScriptData] = useState<any>(null);
  const [editingScene, setEditingScene] = useState<number | null>(null);
  const [editedNarration, setEditedNarration] = useState('');
  const [isExporting, setIsExporting] = useState(false);
  const [isLoadingScript, setIsLoadingScript] = useState(false);
  const [hasStartedProcess, setHasStartedProcess] = useState(false);
  const [pollingCount, setPollingCount] = useState(0);
  const [currentTimestamp, setCurrentTimestamp] = useState<string>('');
  const { authenticatedFetch, isAuthenticated, user } = useAuthenticatedFetch();

  // Example video URL
  const exampleVideoUrl = '/assets/example.mp4';

  const fetchScriptData = async (timestamp?: string) => {
    // Only set loading true on the first fetch
    if (pollingCount === 0) {
      setIsLoadingScript(true);
    }

    try {
      // Build query parameters
      const params = new URLSearchParams();
      if (timestamp) {
        params.append('timestamp', timestamp);
      }

      const data = await authenticatedFetch(
        `/api/fetch-script?${params.toString()}`,
      );

      if (data.script) {
        setScriptData(data.script);
        setIsLoadingScript(false); // Stop loading and polling when we get data
        return true; // Indicate success
      } else {
        // Don't stop loading - let polling continue
        console.log(`No script found yet. Polling attempt ${pollingCount + 1}`);
        return false; // Indicate no data yet
      }
    } catch (error) {
      console.error('Error fetching script:', error);
      // Only set error and stop loading on actual errors, not when script is not ready
      if (pollingCount === 0) {
        setIsLoadingScript(false);
      }
      return false; // Indicate failure
    }
  };

  // Polling mechanism
  const startPolling = async (timestamp: string) => {
    setCurrentTimestamp(timestamp);
    setPollingCount(0);
    setIsLoadingScript(true); // Set loading immediately when polling starts

    const pollInterval = setInterval(async () => {
      setPollingCount((prev) => prev + 1);
      const success = await fetchScriptData(timestamp);

      if (success) {
        clearInterval(pollInterval);
        console.log('Script found! Stopping polling.');
      }
    }, 5000); // Poll every 5 seconds

    // Store the interval ID for cleanup
    return pollInterval;
  };

  // Cleanup polling on component unmount
  useEffect(() => {
    return () => {
      // Any cleanup needed for polling
    };
  }, []);

  const handleGenerateVideo = async (script: string, duration: number) => {
    if (!isAuthenticated) return;

    setHasStartedProcess(true);
    setIsGenerating(true);
    setGeneratedVideoUrl(null);
    setGenerationStatus('queued');
    setStatusMessage('Queuing video generation request...');

    try {
      const timestamp = '081925211658'; // format(new Date(), 'MMddyyHHmmss');
      const data = await authenticatedFetch('/api/generate-video', {
        method: 'POST',
        body: {
          prompt: script,
          timestamp,
          totalDuration: duration,
          sceneCount: duration === 60 ? 6 : 3,
        },
      });

      setGenerationStatus('processing');
      setStatusMessage(
        'Video is being generated... This may take a few minutes.',
      );

      // Simulate completion and transition to step 2

      setGenerationStatus('completed');
      setStatusMessage('Video generated successfully!');
      setCurrentStep(2);

      // Start polling for the specific script file

      await startPolling(timestamp);
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
    // This function is now handled by the VideoCreator component
    console.log('Script generated:', prompt);
  };

  const handleEditScene = (sceneId: number, narration: string) => {
    setEditingScene(sceneId);
    setEditedNarration(narration);
  };

  const handleSaveEdit = (sceneId: number) => {
    if (scriptData) {
      const updatedScenes = scriptData.scenes.map((scene: any) =>
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
    // Transition to step 3
    setCurrentStep(3);
  };

  const handleExportVideo = () => {
    setIsExporting(true);
    // TODO: Implement actual export logic
    setTimeout(() => {
      setIsExporting(false);
      console.log('Video exported successfully!');
      // Could redirect to a success page or show download link
    }, 2000);
  };

  const handleNextStep = () => {
    if (scriptData) {
      setCurrentStep(2);
    } else {
      // If no script data, start polling with the current timestamp
      if (currentTimestamp) {
        setCurrentStep(2);
        startPolling(currentTimestamp);
      } else {
        // Fallback: try to fetch without timestamp
        fetchScriptData().then(() => {
          setCurrentStep(2);
        });
      }
    }
  };

  // Right sidebar content
  const rightSidebarContent = (
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
              className="w-4/5 mx-auto rounded-lg shadow-lg border border-slate-800 group"
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
  );

  return (
    <MainLayout
      showCreditsUpgrade={true}
      rightSidebarContent={rightSidebarContent}
    >
      <div className="w-full max-w-4xl mx-auto flex flex-col justify-start pt-4 lg:pt-8">
        <ProgressSteps currentStep={currentStep} />

        <div className="relative overflow-hidden">
          <div
            className={`transition-transform duration-500 ease-in-out ${
              currentStep === 1
                ? 'translate-x-0'
                : currentStep > 1
                ? '-translate-x-full'
                : 'translate-x-full'
            }`}
          >
            <VideoCreator
              isGenerating={isGenerating}
              onGenerateVideo={handleGenerateVideo}
              onGenerateScript={handleGenerateScript}
              generationStatus={generationStatus}
              statusMessage={statusMessage}
              showNextButton={
                hasStartedProcess &&
                currentStep === 1 &&
                (scriptData || generationStatus === 'completed')
              }
              onNextStep={handleNextStep}
            />
          </div>

          <div
            className={`absolute top-0 left-0 w-full transition-transform duration-500 ease-in-out ${
              currentStep === 2
                ? 'translate-x-0'
                : currentStep > 2
                ? '-translate-x-full'
                : 'translate-x-full'
            }`}
          >
            {/* Header */}
            <div className="mb-6 lg:mb-8">
              <h1 className="text-2xl lg:text-3xl font-bold text-white mb-2">
                Review the scenes of your video
              </h1>
              <p className="text-gray-300 text-sm lg:text-base">
                Edit the text and add new or delete scenes.
              </p>
              {isLoadingScript && (
                <div className="mt-4 bg-gradient-to-br from-purple-900 via-purple-800 to-blue-900 border border-purple-700 rounded-xl p-3 lg:p-4 shadow-lg">
                  <div className="text-white text-sm">
                    <div className="flex items-center space-x-2">
                      <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                      <span>Loading video information...</span>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Scene Cards */}
            <div className="space-y-4 mb-6 max-h-[460px] overflow-y-auto pr-2">
              {isLoadingScript
                ? // Show skeleton placeholders while loading script
                  Array.from({ length: 3 }).map((_, index) => (
                    <EditSceneSkeleton key={index} />
                  ))
                : scriptData &&
                  scriptData.scenes &&
                  scriptData.scenes.map((scene: any, index: number) => (
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
            <div className="text-center mb-6">
              <button
                onClick={handleUpdatePreview}
                disabled={isLoadingScript}
                className={`px-8 py-4 rounded-lg text-lg font-semibold transition-colors ${
                  isLoadingScript
                    ? 'bg-gray-600 text-gray-400 cursor-not-allowed'
                    : 'bg-blue-600 hover:bg-blue-700 text-white'
                }`}
              >
                {isLoadingScript ? 'Loading...' : 'Update Preview 3 Credits'}
              </button>
            </div>

            {/* Back Button */}
            <div className="absolute bottom-6 left-4">
              <button
                onClick={() => {
                  setCurrentStep(1);
                  // Keep the hasStartedProcess flag when going back
                }}
                className="px-4 py-2 border border-blue-500 text-blue-500 hover:bg-blue-500 hover:text-white rounded-lg transition-colors"
              >
                ← Back
              </button>
            </div>
          </div>

          {/* Step 3: Export Video */}
          <div
            className={`absolute top-0 left-0 w-full transition-transform duration-500 ease-in-out ${
              currentStep === 3 ? 'translate-x-0' : 'translate-x-full'
            }`}
          >
            <ExportVideo
              onExportVideo={handleExportVideo}
              isExporting={isExporting}
              onBack={() => setCurrentStep(2)}
            />
          </div>
        </div>
      </div>
    </MainLayout>
  );
}
