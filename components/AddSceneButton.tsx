interface AddSceneButtonProps {
  onAddScene: (position: number) => void;
  position: number; // Position where the new scene should be inserted
  isFirst?: boolean; // Whether this is the first button (before all scenes)
  isLast?: boolean; // Whether this is the last button (after all scenes)
}

export default function AddSceneButton({
  onAddScene,
  position,
  isFirst = false,
  isLast = false,
}: AddSceneButtonProps) {
  return (
    <div className="flex items-center justify-center my-4">
      {/* Left separator */}
      <div className="flex-1 h-px bg-gradient-to-r from-transparent via-slate-600 to-slate-600"></div>

      {/* Add button */}
      <button
        onClick={() => onAddScene(position)}
        className="mx-4 p-3 bg-slate-700/50 hover:bg-slate-600/50 border-2 border-dashed border-slate-500 hover:border-slate-400 rounded-xl transition-all duration-200 group"
        title={
          isFirst
            ? 'Add scene at beginning'
            : isLast
            ? 'Add scene at end'
            : 'Add scene here'
        }
      >
        <svg
          className="w-6 h-6 text-slate-400 group-hover:text-slate-300 transition-colors duration-200"
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

      {/* Right separator */}
      <div className="flex-1 h-px bg-gradient-to-l from-transparent via-slate-600 to-slate-600"></div>
    </div>
  );
}
