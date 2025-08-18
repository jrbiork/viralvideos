import { useState } from 'react';
import CreditsDisplay from './CreditsDisplay';
import AIScriptWriterModal from './AIScriptWriterModal';

interface VideoCreatorProps {
  isGenerating: boolean;
  onGenerateVideo: (script: string) => void;
  onGenerateScript: (prompt: string) => void;
  generationStatus: 'idle' | 'queued' | 'processing' | 'completed' | 'error';
  statusMessage: string;
  showNextButton?: boolean;
  onNextStep?: () => void;
}

export default function VideoCreator({
  isGenerating,
  onGenerateVideo,
  onGenerateScript,
  generationStatus,
  statusMessage,
  showNextButton = false,
  onNextStep,
}: VideoCreatorProps) {
  const [script, setScript] = useState(
    'Create a short video about a cat playing in a garden. The video should be engaging and show the cat exploring different areas of the garden, chasing butterflies, and relaxing in the sunshine.',
  );
  const [isScriptModalOpen, setIsScriptModalOpen] = useState(false);
  const [isGeneratingScript, setIsGeneratingScript] = useState(false);
  const [selectedAspectRatio, setSelectedAspectRatio] = useState<
    '9:16' | '16:9' | '1:1'
  >('9:16');
  const [selectedDuration, setSelectedDuration] = useState<
    '10s' | '30s' | '60s'
  >('30s');

  // Word count calculation
  const wordCount = script.trim() ? script.trim().split(/\s+/).length : 0;
  const maxWords = 100;
  const isOverLimit = wordCount > maxWords;

  const handleGenerateScript = async (prompt: string) => {
    setScript(prompt);
    setIsScriptModalOpen(false);
    onGenerateScript(prompt);
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
    <>
      <div className="max-w-4xl mx-auto flex flex-col justify-start pt-4 lg:pt-8">
        {/* Header */}
        <div className="mb-6 lg:mb-8">
          <div className="flex items-center justify-between mb-2">
            <h1 className="text-2xl lg:text-3xl font-bold text-white">
              Create a new video
            </h1>
            <CreditsDisplay size="lg" showLabel={true} />
          </div>
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
              <div className="absolute bottom-full left-full ml-2 mt-5 px-3 py-3 bg-slate-800 border border-slate-600 text-white text-xs rounded-lg opacity-0 group-hover:opacity-100 transition-opacity duration-0 pointer-events-none z-10 w-[275px]">
                Write your video idea and use AI to improve it.
                <br />
                The AI will use this text to create matching visuals.
                <div className="absolute top-2 -left-2 w-0 h-0 border-l-4 border-r-4 border-t-4 border-transparent border-t-slate-800"></div>
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
            Write your video idea and use AI to improve it.
          </p>
          <div className="relative">
            <textarea
              className={`w-full h-48 bg-slate-800 border rounded-lg p-4 text-white placeholder-gray-400 resize-none focus:outline-none focus:ring-2 focus:ring-blue-500 ${
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

        {/* Duration Selection */}
        <div className="mb-6">
          <div className="flex justify-end">
            <div className="flex bg-slate-800 rounded-lg p-1 border border-slate-700">
              <button
                onClick={() => setSelectedDuration('10s')}
                className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
                  selectedDuration === '10s'
                    ? 'bg-slate-700 text-white'
                    : 'text-gray-400 hover:text-white'
                }`}
              >
                10s
              </button>
              <button
                onClick={() => setSelectedDuration('30s')}
                className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
                  selectedDuration === '30s'
                    ? 'bg-slate-700 text-white'
                    : 'text-gray-400 hover:text-white'
                }`}
              >
                30s
              </button>
              <button
                onClick={() => setSelectedDuration('60s')}
                className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
                  selectedDuration === '60s'
                    ? 'bg-slate-700 text-white'
                    : 'text-gray-400 hover:text-white'
                }`}
              >
                60s
              </button>
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
        <div className="text-center flex items-center justify-center space-x-4">
          <button
            onClick={() => onGenerateVideo(script)}
            disabled={isGenerating || !script.trim()}
            className={`px-8 py-4 rounded-xl text-lg font-semibold flex items-center justify-center space-x-2 transition-colors ${
              isGenerating || !script.trim()
                ? 'bg-gray-600 text-gray-400 cursor-not-allowed'
                : 'bg-gradient-to-b from-purple-900 to-purple-800 border border-purple-700 text-white hover:from-purple-800 hover:to-purple-700'
            }`}
          >
            {isGenerating ? (
              <>
                <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white"></div>
                <span>Queuing...</span>
              </>
            ) : (
              <>
                <span>Preview for 10 Credits</span>
                <span>→</span>
              </>
            )}
          </button>

          {/* Test Next Button */}
          <button
            onClick={onNextStep}
            className="px-6 py-4 rounded-xl text-lg font-semibold bg-blue-600 hover:bg-blue-700 text-white transition-colors border border-blue-500"
          >
            Next (Test)
          </button>
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
    </>
  );
}
