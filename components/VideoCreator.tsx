import { useState, useEffect } from 'react';
import CreditsDisplay from './CreditsDisplay';
import VoiceSelection from './VoiceSelection';
import LanguageSelection from './LanguageSelection';
import { DEFAULT_VOICE, DEFAULT_LANGUAGE } from '../lib/constants';

interface VideoCreatorProps {
  isGenerating: boolean;
  onGenerateVideo: (
    script: string,
    duration: 30 | 60,
    voice?: string,
    language?: string,
  ) => void;
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
    'AI generated stunning images of the city of Tokey at night with neon lights and a beautiful skyline.',
  );
  const [isGeneratingScript, setIsGeneratingScript] = useState(false);
  const [selectedDuration, setSelectedDuration] = useState<'30s' | '60s'>(
    '30s',
  );
  const [selectedVoice, setSelectedVoice] = useState(DEFAULT_VOICE);
  const [selectedLanguage, setSelectedLanguage] = useState(DEFAULT_LANGUAGE);

  // Debug: Track language changes
  useEffect(() => {
    console.log('🌍 selectedLanguage state changed to:', selectedLanguage);
  }, [selectedLanguage]);

  // Word count calculation
  const wordCount = script.trim() ? script.trim().split(/\s+/).length : 0;
  const maxWords = 100;
  const isOverLimit = wordCount > maxWords;

  const handleMagicScript = async () => {
    if (!script.trim()) return;

    console.log('🌍 Selected Language:', selectedLanguage);
    console.log(
      '🔗 API URL will be:',
      `/api/enhance-prompt?prompt=${encodeURIComponent(
        script.trim(),
      )}&duration=${selectedDuration}&language=${selectedLanguage}`,
    );

    setIsGeneratingScript(true);
    try {
      const response = await fetch(
        `/api/enhance-prompt?prompt=${encodeURIComponent(
          script.trim(),
        )}&duration=${selectedDuration}&language=${selectedLanguage}`,
        {
          method: 'GET',
          credentials: 'include',
        },
      );

      if (response.ok) {
        const data = await response.json();
        if (data.enhancedPrompt) {
          setScript(data.enhancedPrompt);
        }
      } else {
        console.error('Failed to generate enhanced script');
      }
    } catch (error) {
      console.error('Error generating enhanced script:', error);
    } finally {
      setIsGeneratingScript(false);
    }
  };

  return (
    <>
      <div className="ml-4 h-full overflow-y-auto">
        {/* Header */}
        <div className="mb-6 lg:mb-8 px-2.5">
          <h1 className="text-2xl lg:text-3xl font-bold text-white mb-2">
            Let's create your viral short!
          </h1>
          <p className="text-gray-300 text-sm lg:text-base">
            Generate a short video in minutes using AI-powered captions, audio,
            and animations.
          </p>
        </div>

        {/* Script Section */}
        <div className="mb-8 px-2.5">
          <div className="mb-4">
            <div className="relative w-full">
              <textarea
                className={`w-full h-48 bg-slate-800 border rounded-lg p-4 text-white placeholder-gray-400 resize-none focus:outline-none focus:ring-2 focus:ring-purple-500 box-border ${
                  isOverLimit
                    ? 'border-red-500 focus:ring-red-500'
                    : 'border-slate-700'
                }`}
                placeholder="Write your script here..."
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

          {/* Tips and Example */}
          <div className="mb-6">
            <p className="text-gray-400 text-sm mb-2">
              Tip: keep under 100 words for the best video pacing
            </p>
            <p className="text-gray-500 text-sm italic">
              Example: "A breathtaking dive into the mysterious world beneath
              the ocean, narrated with cinematic flair and uplifting music."
            </p>
          </div>

          {/* Action Buttons */}
          <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between">
            <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center">
              <button
                onClick={handleMagicScript}
                disabled={!script.trim() || isGeneratingScript}
                className={`px-6 py-3 text-base font-semibold transition-all duration-300 flex items-center space-x-2 ${
                  script.trim() && !isGeneratingScript
                    ? 'text-white'
                    : 'bg-gray-600 text-gray-400 cursor-not-allowed rounded-xl'
                }`}
                style={
                  script.trim() && !isGeneratingScript
                    ? {
                        borderRadius: '0.75rem',
                        background:
                          'linear-gradient(90deg, #8A66FF 0%, #2FADFF 100%)',
                        boxShadow: '0 2px 6px 0 rgba(100, 0, 160, 0.25)',
                      }
                    : {}
                }
              >
                {isGeneratingScript ? (
                  <>
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                    <span>Enhancing...</span>
                  </>
                ) : (
                  <>
                    <span>✨</span>
                    <span>Write Magic Script</span>
                  </>
                )}
              </button>
            </div>

            {/* Duration Selection - Centered */}
            <div className="flex justify-center w-full sm:w-auto">
              <div className="flex bg-slate-800 rounded-lg p-1 border border-slate-700">
                <button
                  onClick={() => setSelectedDuration('30s')}
                  className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
                    selectedDuration === '30s'
                      ? 'text-white'
                      : 'text-gray-400 hover:text-white'
                  }`}
                  style={
                    selectedDuration === '30s'
                      ? { backgroundColor: '#7552F2' }
                      : {}
                  }
                >
                  30s
                </button>
                <button
                  onClick={() => setSelectedDuration('60s')}
                  className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
                    selectedDuration === '60s'
                      ? 'text-white'
                      : 'text-gray-400 hover:text-white'
                  }`}
                  style={
                    selectedDuration === '60s'
                      ? { backgroundColor: '#7552F2' }
                      : {}
                  }
                >
                  60s
                </button>
              </div>
            </div>

            <button
              onClick={() => {
                const duration = parseInt(selectedDuration.replace('s', '')) as
                  | 30
                  | 60;
                onGenerateVideo(
                  script,
                  duration,
                  selectedVoice,
                  selectedLanguage,
                );
              }}
              disabled={isGenerating || !script.trim() || wordCount < 10}
              className={`px-6 py-3 text-base font-semibold flex items-center justify-center space-x-2 transition-all duration-300 ${
                isGenerating || !script.trim() || wordCount < 10
                  ? 'bg-gray-600 text-gray-400 cursor-not-allowed rounded-xl'
                  : 'text-white'
              }`}
              style={
                !isGenerating && script.trim() && wordCount >= 10
                  ? {
                      borderRadius: '0.75rem',
                      background:
                        'linear-gradient(90deg, #8A66FF 0%, #2FADFF 100%)',
                      boxShadow: '0 2px 6px 0 rgba(100, 0, 160, 0.25)',
                    }
                  : {}
              }
            >
              {isGenerating ? (
                <>
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                  <span>Generating...</span>
                </>
              ) : (
                <span>
                  Preview/Edit Scenes for{' '}
                  {selectedDuration === '30s' ? '10' : '20'} Credits
                </span>
              )}
            </button>
          </div>
        </div>

        {/* Voice Selection Section */}
        <div className="mb-8 px-2.5">
          <VoiceSelection
            selectedVoice={selectedVoice}
            onVoiceSelect={setSelectedVoice}
            onVoiceClone={() =>
              console.log('Voice clone functionality coming soon')
            }
          />
        </div>
      </div>
    </>
  );
}
