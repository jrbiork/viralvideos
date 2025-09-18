'use client';

import { useState, useRef, useEffect } from 'react';
import { DEFAULT_VOICE } from '../lib/constants';

interface Voice {
  id: string;
  name: string;
  provider: string;
  description?: string;
  avatarColor: string;
}

interface VoiceSelectionProps {
  selectedVoice?: string;
  onVoiceSelect: (voiceId: string) => void;
  onVoiceClone?: () => void;
}

const AVAILABLE_VOICES: Voice[] = [
  {
    id: 'alloy',
    name: 'Alloy',
    provider: '',
    avatarColor: 'bg-gradient-to-br from-blue-400 to-purple-500',
  },
  {
    id: 'ash',
    name: 'Ash',
    provider: '',
    avatarColor: 'bg-gradient-to-br from-gray-500 to-gray-700',
  },
  {
    id: 'ballad',
    name: 'Ballad',
    provider: '',
    avatarColor: 'bg-gradient-to-br from-indigo-400 to-blue-500',
  },
  {
    id: 'coral',
    name: 'Coral',
    provider: '',
    avatarColor: 'bg-gradient-to-br from-pink-400 to-orange-400',
  },
  {
    id: 'fable',
    name: 'Fable',
    provider: '',
    avatarColor: 'bg-gradient-to-br from-pink-400 to-purple-500',
  },
  {
    id: 'nova',
    name: 'Nova',
    provider: '',
    avatarColor: 'bg-gradient-to-br from-purple-400 to-pink-500',
  },
  {
    id: 'onyx',
    name: 'Onyx',
    provider: '',
    avatarColor: 'bg-gradient-to-br from-gray-600 to-gray-800',
  },
  {
    id: 'sage',
    name: 'Sage',
    provider: '',
    avatarColor: 'bg-gradient-to-br from-green-500 to-emerald-600',
  },
  {
    id: 'shimmer',
    name: 'Shimmer',
    provider: '',
    avatarColor: 'bg-gradient-to-br from-yellow-400 to-orange-500',
  },
  {
    id: 'verse',
    name: 'Verse',
    provider: '',
    avatarColor: 'bg-gradient-to-br from-teal-400 to-cyan-500',
  },
];

export default function VoiceSelection({
  selectedVoice = DEFAULT_VOICE,
  onVoiceSelect,
  onVoiceClone,
}: VoiceSelectionProps) {
  const [visibleCount, setVisibleCount] = useState(6);
  const [isCollapsed, setIsCollapsed] = useState(true);
  const [loadingVoice, setLoadingVoice] = useState<string | null>(null);
  const [playingVoice, setPlayingVoice] = useState<string | null>(null);
  const [isLoaded, setIsLoaded] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const visibleVoices = AVAILABLE_VOICES.slice(0, visibleCount);
  const hasMore = visibleCount < AVAILABLE_VOICES.length;
  const selectedVoiceData = AVAILABLE_VOICES.find(
    (voice) => voice.id === selectedVoice,
  );
  const isSelectedVoicePlaying = playingVoice === selectedVoice;
  const isSelectedVoiceLoading = loadingVoice === selectedVoice;

  const handlePlayVoice = async (voiceId: string) => {
    // If this voice is currently playing, pause it
    if (playingVoice === voiceId && audioRef.current) {
      audioRef.current.pause();
      setPlayingVoice(null);
      return;
    }

    if (loadingVoice === voiceId) return;

    setLoadingVoice(voiceId);

    try {
      // Stop any currently playing audio
      if (audioRef.current) {
        audioRef.current.pause();
        setPlayingVoice(null);
      }

      // Play the local MP3 file
      const audioUrl = `/voices/${voiceId}.mp3`;
      audioRef.current = new Audio(audioUrl);

      audioRef.current.onloadstart = () => {
        setLoadingVoice(voiceId);
      };

      audioRef.current.oncanplaythrough = () => {
        setLoadingVoice(null);
        setPlayingVoice(voiceId);
      };

      audioRef.current.onended = () => {
        setLoadingVoice(null);
        setPlayingVoice(null);
      };

      audioRef.current.onerror = () => {
        console.error('Error loading audio file:', audioUrl);
        setLoadingVoice(null);
        setPlayingVoice(null);
      };

      await audioRef.current.play();
    } catch (error) {
      console.error('Error playing voice preview:', error);
      setLoadingVoice(null);
      setPlayingVoice(null);
    }
  };

  const handleVoiceSelect = (voiceId: string) => {
    onVoiceSelect(voiceId);
  };

  // Mark as loaded after hydration
  useEffect(() => {
    setIsLoaded(true);
  }, []);

  // Show loading state until component is loaded
  if (!isLoaded) {
    return (
      <div className="w-full bg-slate-900 rounded-xl p-6 border border-slate-700">
        <div className="flex items-center justify-center h-[60px]">
          <div className="animate-spin rounded-full h-6 w-6 border-2 border-purple-500 border-t-transparent"></div>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full bg-slate-900 rounded-xl p-6 border border-slate-700">
      {/* Header */}
      <div
        className={`flex items-center justify-between h-[60px] cursor-pointer hover:bg-slate-800/30 rounded-lg px-2 transition-colors duration-200 ${
          !isCollapsed ? 'mb-6' : ''
        }`}
        onClick={() => setIsCollapsed(!isCollapsed)}
      >
        <div className="flex items-center justify-between">
          <div className="flex flex-col justify-center h-full">
            <h2 className="text-xl font-bold text-white leading-none mb-2">
              Voice Selection
            </h2>
            <p className="text-gray-400 text-sm leading-none mt-1">
              Choose a voice for your content
            </p>
          </div>

          {/* Collapsed State - Show Selected Voice */}
          {isCollapsed && selectedVoiceData && (
            <div className="flex items-center space-x-3 ml-24">
              {/* Play/Pause Button for Selected Voice */}
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  handlePlayVoice(selectedVoice);
                }}
                disabled={isSelectedVoiceLoading}
                className={`w-8 h-8 rounded-full ${selectedVoiceData.avatarColor} flex items-center justify-center hover:scale-105 transition-all duration-200`}
              >
                {isSelectedVoiceLoading ? (
                  <div className="animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent"></div>
                ) : isSelectedVoicePlaying ? (
                  <svg
                    className="w-4 h-4 text-white"
                    fill="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path d="M6 4h4v16H6V4zm8 0h4v16h-4V4z" />
                  </svg>
                ) : (
                  <svg
                    className="w-4 h-4 text-white ml-0.5"
                    fill="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path d="M8 5v14l11-7z" />
                  </svg>
                )}
              </button>

              {/* Selected Voice Name */}
              <div className="flex items-center space-x-2">
                <span className="text-white font-medium">
                  {selectedVoiceData.name}
                </span>
              </div>
            </div>
          )}

          {/* Audio Waves in Header - Show when any voice is playing */}
          {playingVoice && (
            <div className="flex items-center space-x-1 ml-6">
              <div
                className="w-1 h-3 bg-purple-400 rounded-full animate-pulse"
                style={{
                  animationDelay: '0ms',
                  animationDuration: '0.8s',
                }}
              ></div>
              <div
                className="w-1 h-4 bg-purple-500 rounded-full animate-pulse"
                style={{
                  animationDelay: '0.15s',
                  animationDuration: '0.8s',
                }}
              ></div>
              <div
                className="w-1 h-2 bg-purple-400 rounded-full animate-pulse"
                style={{
                  animationDelay: '0.3s',
                  animationDuration: '0.8s',
                }}
              ></div>
              <div
                className="w-1 h-3.5 bg-purple-500 rounded-full animate-pulse"
                style={{
                  animationDelay: '0.45s',
                  animationDuration: '0.8s',
                }}
              ></div>
            </div>
          )}
        </div>

        <div className="flex items-center justify-center">
          <svg
            className={`w-5 h-5 transform transition-transform duration-200 text-gray-400 ${
              isCollapsed ? 'rotate-180' : ''
            }`}
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M19 9l-7 7-7-7"
            />
          </svg>
        </div>
      </div>

      {/* Voice List */}
      <div
        className={`overflow-hidden transition-all duration-300 ease-in-out ${
          isCollapsed ? 'max-h-0 opacity-0' : 'max-h-[2000px] opacity-100'
        }`}
      >
        <div className="grid grid-cols-3 gap-4 pt-0">
          {visibleVoices.map((voice) => {
            const isSelected = selectedVoice === voice.id;
            const isLoading = loadingVoice === voice.id;
            const isPlaying = playingVoice === voice.id;

            return (
              <div
                key={voice.id}
                className={`group relative flex flex-col items-center p-4 rounded-lg border transition-all duration-300 hover:bg-slate-800/50 cursor-pointer ${
                  isSelected
                    ? 'bg-slate-800 border-purple-500/50'
                    : 'bg-slate-800/30 border-slate-600'
                }`}
                onClick={() => handleVoiceSelect(voice.id)}
              >
                {/* Play/Pause Button */}
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    handlePlayVoice(voice.id);
                  }}
                  disabled={isLoading}
                  className={`w-12 h-12 rounded-full ${voice.avatarColor} flex items-center justify-center hover:scale-105 transition-all duration-200 relative mb-3`}
                >
                  {isLoading ? (
                    <div className="animate-spin rounded-full h-5 w-5 border-2 border-white border-t-transparent"></div>
                  ) : isPlaying ? (
                    <svg
                      className="w-5 h-5 text-white"
                      fill="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path d="M6 4h4v16H6V4zm8 0h4v16h-4V4z" />
                    </svg>
                  ) : (
                    <svg
                      className="w-5 h-5 text-white ml-0.5"
                      fill="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path d="M8 5v14l11-7z" />
                    </svg>
                  )}
                </button>

                {/* Voice Info */}
                <div className="text-center">
                  <h3 className="text-white font-semibold text-sm transition-colors duration-300 group-hover:text-purple-300">
                    {voice.name}
                  </h3>
                </div>

                {/* Selection Indicator - Only show checkmark */}
                {isSelected && (
                  <div className="absolute top-2 right-2 w-6 h-6 bg-gradient-to-r from-purple-600 to-blue-600 rounded-full flex items-center justify-center shadow-lg">
                    <svg
                      className="w-4 h-4 text-white"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                      strokeWidth={2.5}
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        d="M5 13l4 4L19 7"
                      />
                    </svg>
                  </div>
                )}
              </div>
            );
          })}

          {/* View More Button */}
          {hasMore && (
            <div className="col-span-3 flex justify-center mt-6">
              <button
                onClick={() => setVisibleCount(AVAILABLE_VOICES.length)}
                className="flex items-center space-x-2 text-gray-400 hover:text-white transition-colors"
              >
                <span className="text-sm font-medium">View more</span>
                <svg
                  className="w-4 h-4"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M19 9l-7 7-7-7"
                  />
                </svg>
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
