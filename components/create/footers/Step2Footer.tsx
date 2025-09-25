import React from 'react';

interface Step2FooterProps {
  onBack: () => void;
  onGenerateVideo: () => void;
}

export default function Step2Footer({
  onBack,
  onGenerateVideo,
}: Step2FooterProps) {
  return (
    <div
      className="pl-0 pr-12 flex items-center justify-between"
      style={{ width: '74%' }}
    >
      <button
        onClick={onBack}
        className="h-12 px-5 min-w-[150px] text-xs sm:text-sm font-semibold flex items-center justify-center gap-2 rounded-[12px] text-white bg-transparent transition-all duration-200 hover:bg-white/10 hover:-translate-y-[1px]"
        style={{
          borderColor: '#5B5BFF',
          borderWidth: '1.5px',
          borderStyle: 'solid',
          boxShadow: '0 4px 16px 0 rgba(100, 0, 160, 0.35)',
        }}
      >
        <img src="/back.svg" alt="Back" className="w-4 h-4" />
        <span>Back to Idea</span>
      </button>
      <button
        onClick={onGenerateVideo}
        className="h-12 px-6 min-w-[170px] text-xs sm:text-sm font-semibold flex items-center justify-center gap-2 rounded-[12px] text-white transition-all duration-200 hover:-translate-y-[1px] hover:brightness-95"
        style={{
          background:
            'var(--Gradient, linear-gradient(90deg, #7552F2 0%, #2CA4F2 100%))',
          boxShadow: '0 2px 6px 0 rgba(100, 0, 160, 0.25)',
        }}
      >
        <span>Generate Video</span>
      </button>
    </div>
  );
}
