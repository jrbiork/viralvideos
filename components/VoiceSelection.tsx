'use client';

import { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { DEFAULT_VOICE } from '../lib/constants';
import { useFloatingPosition } from '../hooks/useFloatingPosition';

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
  const [isOpen, setIsOpen] = useState(false);
  const [loadingVoice, setLoadingVoice] = useState<string | null>(null);
  const [playingVoice, setPlayingVoice] = useState<string | null>(null);
  const [isLoaded, setIsLoaded] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const triggerRef = useRef<HTMLDivElement | null>(null);
  const panelRef = useRef<HTMLDivElement | null>(null);
  const closeDropdown = () => setIsOpen(false);
  const dropdownPosition = useFloatingPosition(triggerRef, isOpen, closeDropdown);

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
    setIsOpen(false);
  };

  // Mark as loaded after hydration
  useEffect(() => {
    setIsLoaded(true);
  }, []);

  // Close dropdown on outside click, and stop any playing audio
  useEffect(() => {
    if (!isOpen) return;

    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as Node;
      if (
        containerRef.current &&
        !containerRef.current.contains(target) &&
        !panelRef.current?.contains(target)
      ) {
        setIsOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      if (audioRef.current) {
        audioRef.current.pause();
        setPlayingVoice(null);
      }
    };
  }, [isOpen]);

  // Show loading state until component is loaded
  if (!isLoaded) {
    return (
      <div className="w-full bg-slate-900 rounded-xl p-4 border border-slate-700">
        <div className="flex items-center justify-center h-[48px]">
          <div className="animate-spin rounded-full h-5 w-5 border-2 border-purple-500 border-t-transparent"></div>
        </div>
      </div>
    );
  }

  return (
    <div ref={containerRef} className="w-full flex items-center gap-3">
      <label className="shrink-0 text-sm font-medium text-gray-300">
        Voice
      </label>

      <div ref={triggerRef} className="relative flex-1 min-w-0">
      {/* Trigger */}
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className={`w-full flex items-center justify-between bg-slate-800/50 rounded-lg border px-3 py-2.5 transition-colors duration-200 hover:bg-slate-800 ${
          isOpen ? 'border-purple-500/60' : 'border-slate-700'
        }`}
      >
        <div className="flex items-center space-x-3">
          {selectedVoiceData && (
            <span
              onClick={(e) => {
                e.stopPropagation();
                handlePlayVoice(selectedVoice);
              }}
              className={`w-8 h-8 rounded-full ${selectedVoiceData.avatarColor} flex items-center justify-center hover:scale-105 transition-all duration-200 shrink-0`}
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
            </span>
          )}
          <span className="text-white font-medium text-sm">
            {selectedVoiceData?.name || 'Select a voice'}
          </span>
        </div>

        <svg
          className={`w-4 h-4 text-gray-400 transition-transform duration-200 ${
            isOpen ? 'rotate-180' : ''
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
      </button>

      {/* Dropdown Panel — portaled so it isn't clipped by a scrollable ancestor */}
      {isOpen &&
        dropdownPosition &&
        createPortal(
        <div
          ref={panelRef}
          className="fixed z-50 bg-slate-900 border border-slate-700 rounded-lg shadow-xl p-2 max-h-80 overflow-y-auto custom-scrollbar"
          style={{
            top: dropdownPosition.top,
            left: dropdownPosition.left,
            width: dropdownPosition.width,
          }}
        >
          {AVAILABLE_VOICES.map((voice) => {
            const isSelected = selectedVoice === voice.id;
            const isLoading = loadingVoice === voice.id;
            const isPlaying = playingVoice === voice.id;

            return (
              <div
                key={voice.id}
                className={`flex items-center justify-between px-2 py-2 rounded-md cursor-pointer transition-colors duration-150 ${
                  isSelected ? 'bg-slate-800' : 'hover:bg-slate-800/60'
                }`}
                onClick={() => handleVoiceSelect(voice.id)}
              >
                <div className="flex items-center space-x-3">
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handlePlayVoice(voice.id);
                    }}
                    disabled={isLoading}
                    className={`w-8 h-8 rounded-full ${voice.avatarColor} flex items-center justify-center hover:scale-105 transition-all duration-200 shrink-0`}
                  >
                    {isLoading ? (
                      <div className="animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent"></div>
                    ) : isPlaying ? (
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
                  <span className="text-white text-sm font-medium">
                    {voice.name}
                  </span>
                </div>

                {isSelected && (
                  <svg
                    className="w-4 h-4 text-purple-400"
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
                )}
              </div>
            );
          })}
        </div>,
        document.body,
      )}
      </div>
    </div>
  );
}
