import React from 'react';

interface Step2FooterProps {
  onGenerateVideo: () => void;
}

export default function Step2Footer({ onGenerateVideo }: Step2FooterProps) {
  return (
    <div
      className="pl-0 pr-12 flex items-center justify-end"
      style={{ width: '74%' }}
    >
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
