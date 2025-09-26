import React from 'react';

interface Step1FooterProps {
  onMagicScript: () => void;
  isGeneratingScript: boolean;
  onGenerate: () => void;
  canGenerate: boolean;
}

export default function Step1Footer({
  onMagicScript,
  isGeneratingScript,
  onGenerate,
  canGenerate,
}: Step1FooterProps) {
  return (
    <div className="flex items-center justify-center" style={{ gap: '25rem' }}>
      <button
        onClick={onMagicScript}
        disabled={isGeneratingScript}
        className={`h-12 px-4 text-xs sm:text-sm font-semibold flex items-center space-x-2 border rounded-[12px] text-white bg-transparent transition-colors transition-shadow transform duration-200 hover:bg-[#5B5BFF1F] hover:border-[#5B5BFF] hover:shadow-[0_6px_20px_0_rgba(100,0,160,0.55)] hover:-translate-y-[1px] disabled:opacity-50 disabled:cursor-not-allowed disabled:pointer-events-none`}
        style={{
          borderColor: '#5B5BFF',
          borderWidth: '1.5px',
          borderStyle: 'solid',
          boxShadow: '0 4px 16px 0 rgba(100, 0, 160, 0.35)',
        }}
      >
        {isGeneratingScript ? (
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
        onClick={onGenerate}
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
                background: 'linear-gradient(90deg, #8A66FF 0%, #2FADFF 100%)',
                boxShadow: '0 2px 6px 0 rgba(100, 0, 160, 0.25)',
              }
            : {}
        }
      >
        <span>Preview Scenes</span>
      </button>
    </div>
  );
}
