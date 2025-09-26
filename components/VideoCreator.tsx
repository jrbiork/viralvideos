import { useState, useEffect } from 'react';
import CreditsDisplay from './CreditsDisplay';
import VoiceSelection from './VoiceSelection';
import ImageTemplateSelection from './ImageTemplateSelection';
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
  // Props for footer buttons
  onMagicScript?: () => void;
  isGeneratingScript?: boolean;
  script?: string;
  onScriptChange?: (script: string) => void;
  onGenerateVideoFromFooter?: (
    script: string,
    duration: 30 | 60,
    voice?: string,
    language?: string,
  ) => void;
  selectedDuration?: '30s' | '60s';
  selectedVoice?: string;
  selectedLanguage?: string;
  selectedTemplate?: string;
  onTemplateSelect?: (templateId: string) => void;
  canGenerate?: boolean;
}

export default function VideoCreator({
  isGenerating,
  onGenerateVideo,
  onGenerateScript,
  generationStatus,
  statusMessage,
  showNextButton = false,
  onNextStep,
  onMagicScript,
  isGeneratingScript = false,
  script: externalScript,
  onScriptChange,
  onGenerateVideoFromFooter,
  selectedDuration: externalSelectedDuration,
  selectedVoice: externalSelectedVoice,
  selectedLanguage: externalSelectedLanguage,
  selectedTemplate: externalSelectedTemplate,
  onTemplateSelect,
  canGenerate = false,
}: VideoCreatorProps) {
  const [script, setScript] = useState(externalScript);
  const [internalIsGeneratingScript, setInternalIsGeneratingScript] =
    useState(false);
  const [selectedDuration, setSelectedDuration] = useState<'30s' | '60s'>(
    externalSelectedDuration || '30s',
  );
  const [selectedVoice, setSelectedVoice] = useState(
    externalSelectedVoice || DEFAULT_VOICE,
  );

  // Load voice from localStorage after hydration
  useEffect(() => {
    if (!externalSelectedVoice && typeof window !== 'undefined') {
      const savedVoice = localStorage.getItem('selectedVoice');
      if (savedVoice) {
        setSelectedVoice(savedVoice);
      }
    }
  }, [externalSelectedVoice]);

  // Handle voice selection with localStorage save
  const handleVoiceSelect = (voiceId: string) => {
    localStorage.setItem('selectedVoice', voiceId);
    setSelectedVoice(voiceId);
  };

  const [selectedLanguage, setSelectedLanguage] = useState(
    externalSelectedLanguage || DEFAULT_LANGUAGE,
  );

  // Debug: Track language changes
  useEffect(() => {
    console.log('🌍 selectedLanguage state changed to:', selectedLanguage);
  }, [selectedLanguage]);

  // Sync external state with internal state
  useEffect(() => {
    if (externalScript !== undefined) {
      setScript(externalScript);
    }
  }, [externalScript]);

  useEffect(() => {
    if (externalSelectedDuration !== undefined) {
      setSelectedDuration(externalSelectedDuration);
    }
  }, [externalSelectedDuration]);

  useEffect(() => {
    if (externalSelectedVoice !== undefined) {
      setSelectedVoice(externalSelectedVoice);
    }
  }, [externalSelectedVoice]);

  useEffect(() => {
    if (externalSelectedLanguage !== undefined) {
      setSelectedLanguage(externalSelectedLanguage);
    }
  }, [externalSelectedLanguage]);

  // Word count calculation
  const wordCount = script?.trim() ? script.trim().split(/\s+/).length : 0;
  const maxWords = 50;
  const isOverLimit = wordCount > maxWords;

  const handleMagicScript = async () => {
    if (!script?.trim()) return;

    // Use external handler if provided, otherwise use internal logic
    if (onMagicScript) {
      onMagicScript();
      return;
    }

    console.log('🌍 Selected Language:', selectedLanguage);
    console.log(
      '🔗 API URL will be:',
      `/api/enhance-prompt?prompt=${encodeURIComponent(
        script.trim(),
      )}&duration=${selectedDuration}&language=${selectedLanguage}`,
    );

    setInternalIsGeneratingScript(true);
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
      setInternalIsGeneratingScript(false);
    }
  };

  return (
    <>
      <div className="ml-4 h-full min-h-0 overflow-y-scroll custom-scrollbar relative">
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
                    newValue.length < (script?.length || 0)
                  ) {
                    setScript(newValue);
                    if (onScriptChange) {
                      onScriptChange(newValue);
                    }
                  }
                }}
                disabled={isGenerating}
              />
              {(!script || !script.trim()) && (
                <div className="absolute bottom-3 left-4 right-24 text-xs text-gray-400 pointer-events-none">
                  <p className="mb-1">
                    Tip: keep under 50 words for the best video pacing
                  </p>
                  <p className="italic">
                    Example: "A breathtaking dive into the mysterious world
                    beneath the ocean, narrated with cinematic flair and
                    uplifting music."
                  </p>
                </div>
              )}
              <div
                className={`absolute bottom-2 right-2 text-xs font-medium ${
                  isOverLimit
                    ? 'text-red-400'
                    : wordCount > maxWords * 0.8
                    ? 'text-yellow-400'
                    : 'text-gray-400'
                }`}
              >
                Words: {wordCount}/{maxWords}
              </div>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between">
            {/* Duration Selection - Right aligned */}
            <div className="flex justify-end w-full sm:w-auto ml-auto">
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
          </div>
        </div>

        {/* Voice Selection and Image Template Selection - Stacked (block) */}
        <div className="mb-8 px-2.5">
          <div className="flex flex-col gap-6">
            {/* Voice Selection Section */}
            <div className="w-full">
              <VoiceSelection
                selectedVoice={selectedVoice}
                onVoiceSelect={handleVoiceSelect}
                onVoiceClone={() =>
                  console.log('Voice clone functionality coming soon')
                }
              />
            </div>

            {/* Image Template Selection Section */}
            <div className="w-full">
              <ImageTemplateSelection
                selectedTemplate={externalSelectedTemplate}
                onTemplateSelect={onTemplateSelect || (() => {})}
              />
            </div>
          </div>
        </div>

        {/* Sticky Footer Buttons */}
        <div className="sticky bottom-0 bg-gradient-to-t from-[#090526] via-[#090526] to-transparent pt-4 pb-2 px-2.5">
          <div
            className="flex items-center justify-end"
            style={{ gap: '5rem' }}
          >
            <button
              onClick={onMagicScript || handleMagicScript}
              disabled={isGeneratingScript || internalIsGeneratingScript}
              className={`h-12 px-4 text-xs sm:text-sm font-semibold flex items-center space-x-2 border rounded-[12px] text-white bg-transparent transition-colors transition-shadow transform duration-200 hover:bg-[#5B5BFF1F] hover:border-[#5B5BFF] hover:shadow-[0_6px_20px_0_rgba(100,0,160,0.55)] hover:-translate-y-[1px] disabled:opacity-50 disabled:cursor-not-allowed disabled:pointer-events-none`}
              style={{
                borderColor: '#5B5BFF',
                borderWidth: '1.5px',
                borderStyle: 'solid',
                boxShadow: '0 4px 16px 0 rgba(100, 0, 160, 0.35)',
                minWidth: '181.14px',
              }}
            >
              {isGeneratingScript || internalIsGeneratingScript ? (
                <>
                  <div className="animate-spin rounded-full h-3 w-3 border-2 border-white border-t-transparent"></div>
                  <span>Enhancing...</span>
                </>
              ) : (
                <>
                  <span>✨</span>
                  <span>Write Magic Script</span>
                </>
              )}
            </button>
            <button
              onClick={() => {
                if (onGenerateVideoFromFooter) {
                  const duration = parseInt(
                    selectedDuration.replace('s', ''),
                  ) as 30 | 60;
                  onGenerateVideoFromFooter(
                    script || '',
                    duration,
                    selectedVoice,
                    selectedLanguage,
                  );
                }
              }}
              disabled={!canGenerate}
              className={`h-12 px-4 text-xs sm:text-sm font-semibold flex items-center justify-center space-x-2 transition-all duration-300 hover:brightness-90 hover:-translate-y-[1px] ${
                !canGenerate
                  ? 'bg-gray-600 text-gray-400 cursor-not-allowed rounded-xl'
                  : 'text-white'
              }`}
              style={
                canGenerate
                  ? {
                      borderRadius: '0.75rem',
                      background:
                        'linear-gradient(90deg, #8A66FF 0%, #2FADFF 100%)',
                      boxShadow: '0 2px 6px 0 rgba(100, 0, 160, 0.25)',
                    }
                  : {}
              }
            >
              <span>
                Preview Scenes for {selectedDuration === '30s' ? '10' : '20'}{' '}
                credits
              </span>
              <svg
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                xmlns="http://www.w3.org/2000/svg"
              >
                <path
                  d="M5 12H19M19 12L12 5M19 12L12 19"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
