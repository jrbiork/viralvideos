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

        {/* Image Template Selection Section */}
        <div className="mb-8 px-2.5">
          <ImageTemplateSelection
            selectedTemplate={externalSelectedTemplate}
            onTemplateSelect={onTemplateSelect || (() => {})}
          />
        </div>
      </div>
    </>
  );
}
