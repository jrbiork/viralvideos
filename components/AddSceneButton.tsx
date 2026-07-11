interface AddSceneButtonProps {
  onAddScene: (position: number) => void;
  position: number; // Position where the new scene should be inserted
  isFirst?: boolean; // Whether this is the first button (before all scenes)
  isLast?: boolean; // Whether this is the last button (after all scenes)
  disabled?: boolean; // Whether the button should be disabled
  disabledReason?: string; // Tooltip text shown while disabled
}

export default function AddSceneButton({
  onAddScene,
  position,
  isFirst = false,
  isLast = false,
  disabled = false,
  disabledReason = 'Add scene is disabled',
}: AddSceneButtonProps) {
  return (
    <div className="flex items-center justify-center my-6">
      {/* Left separator */}
      <div className="flex-1 h-px bg-gradient-to-r from-transparent via-slate-600 to-slate-600"></div>

      {/* Add button */}
      <div className="relative group">
        <button
          onClick={() => !disabled && onAddScene(position)}
          disabled={disabled}
          className={`mx-4 p-3 border-2 border-dashed rounded-xl transition-all duration-200 group/button ${
            disabled
              ? 'bg-slate-800/30 border-slate-600/30 cursor-not-allowed'
              : 'bg-slate-700/50 hover:bg-slate-600/50 border-slate-500 hover:border-slate-400'
          }`}
        >
          <svg
            className={`w-6 h-6 transition-colors duration-200 ${
              disabled
                ? 'text-slate-500'
                : 'text-slate-400 group-hover/button:text-slate-300'
            }`}
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M12 6v6m0 0v6m0-6h6m-6 0H6"
            />
          </svg>
        </button>

        {/* Tooltip when disabled (on hover) */}
        {disabled && (
          <div className="pointer-events-none absolute left-1/2 -translate-x-1/2 mt-2 w-max max-w-xs px-3 py-2 rounded-md bg-slate-800 text-slate-200 text-xs shadow-lg border border-slate-700 opacity-0 group-hover:opacity-100 transition-opacity">
            {disabledReason}
          </div>
        )}
      </div>

      {/* Right separator */}
      <div className="flex-1 h-px bg-gradient-to-l from-transparent via-slate-600 to-slate-600"></div>
    </div>
  );
}
