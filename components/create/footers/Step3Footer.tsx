import React from 'react';

interface Step3FooterProps {
  canExport: boolean;
  isExporting: boolean;
  onExport: () => Promise<void> | void;
}

export default function Step3Footer({
  canExport,
  isExporting,
  onExport,
}: Step3FooterProps) {
  return (
    <div
      className="pl-2 pr-8 flex items-center justify-end"
      style={{ width: '65%' }}
    >
      <button
        onClick={onExport}
        disabled={isExporting || !canExport}
        className={`h-12 px-6 min-w-[170px] text-xs sm:text-sm font-semibold flex items-center justify-center gap-2 rounded-[12px] text-white transition-all duration-200 hover:-translate-y-[1px] hover:brightness-95 ${
          isExporting || !canExport ? 'opacity-50 cursor-not-allowed' : ''
        }`}
        style={{
          background:
            'var(--Gradient, linear-gradient(90deg, #7552F2 0%, #2CA4F2 100%))',
          boxShadow: '0 2px 6px 0 rgba(100, 0, 160, 0.25)',
        }}
      >
        {isExporting ? (
          <>
            <div className="animate-spin rounded-full h-3 w-3 border-b-2 border-white"></div>
            <span>Exporting...</span>
          </>
        ) : !canExport ? (
          <span>Creating your video...</span>
        ) : (
          <span>Export Video</span>
        )}
      </button>
    </div>
  );
}
