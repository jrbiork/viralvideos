'use client';

import { DEFAULT_LANGUAGE } from '../lib/constants';

interface Language {
  code: string;
  name: string;
  flag: string;
}

interface LanguageSelectionProps {
  selectedLanguage?: string;
  onLanguageSelect?: (language: string) => void;
}

const AVAILABLE_LANGUAGES: Language[] = [
  { code: 'en', name: 'English', flag: '🇺🇸' },
  { code: 'es', name: 'Spanish', flag: '🇪🇸' },
  { code: 'fr', name: 'French', flag: '🇫🇷' },
  { code: 'de', name: 'German', flag: '🇩🇪' },
  { code: 'it', name: 'Italian', flag: '🇮🇹' },
  { code: 'pt', name: 'Portuguese', flag: '🇵🇹' },
  { code: 'pt-BR', name: 'Portuguese (Brazil)', flag: '🇧🇷' },
];

export default function LanguageSelection({
  selectedLanguage = DEFAULT_LANGUAGE,
  onLanguageSelect,
}: LanguageSelectionProps) {
  return (
    <div className="w-full bg-slate-900 rounded-xl p-6 border border-slate-700 mb-6">
      <h3 className="text-lg font-semibold text-white mb-3">Language</h3>
      <div className="flex flex-wrap gap-2">
        {AVAILABLE_LANGUAGES.map((language) => (
          <button
            key={language.code}
            onClick={() => {
              console.log('🌍 Language clicked:', language.code);
              onLanguageSelect?.(language.code);
            }}
            className={`px-3 py-2 rounded-lg text-sm font-medium transition-all duration-200 flex items-center space-x-2 ${
              selectedLanguage === language.code
                ? 'bg-purple-600 text-white shadow-lg'
                : 'bg-slate-700 text-gray-300 hover:bg-slate-600'
            }`}
          >
            <span className="text-lg">{language.flag}</span>
            <span>{language.name}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
