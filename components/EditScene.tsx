interface Scene {
  id: number;
  description: string;
  narration: string;
  duration: number;
}

interface EditSceneProps {
  scene: Scene;
  editingScene: number | null;
  editedNarration: string;
  onEditScene: (sceneId: number, narration: string) => void;
  onSaveEdit: (sceneId: number) => void;
  onCancelEdit: () => void;
  onEditedNarrationChange: (value: string) => void;
  imageUrl?: string;
  isSelected?: boolean;
  onSelect?: (sceneId: number) => void;
}

export default function EditScene({
  scene,
  editingScene,
  editedNarration,
  onEditScene,
  onSaveEdit,
  onCancelEdit,
  onEditedNarrationChange,
  imageUrl,
  isSelected = false,
  onSelect,
}: EditSceneProps) {
  const isEditing = editingScene === scene.id;

  return (
    <div className="mb-4">
      {/* Scene Label */}
      <div className="mb-2">
        <h3 className="text-white text-lg font-semibold">
          Scene {scene.id + 1}
        </h3>
      </div>

      {/* Scene Card */}
      <div
        className={`bg-slate-800/50 border rounded-xl p-2 flex space-x-3 cursor-pointer transition-all duration-200 mr-4 ${
          isSelected
            ? 'border-purple-500 shadow-lg shadow-purple-500/25'
            : 'border-slate-700/50 hover:border-slate-600'
        }`}
        onClick={() => onSelect && onSelect(scene.id)}
      >
        {/* Scene Image */}
        {imageUrl ? (
          <div
            className="flex-shrink-0 rounded-xl overflow-hidden"
            style={{
              width: '7.0rem', // Reduced by 15% more from 8.23rem
              height: '12.43rem', // Reduced by 15% more from 14.62rem
            }}
          >
            <img
              src={imageUrl}
              alt={`Scene ${scene.id + 1}`}
              className="w-full h-full object-contain rounded-xl"
              onError={(e) => {
                // Hide the image if it fails to load
                e.currentTarget.style.display = 'none';
                e.currentTarget.parentElement!.style.backgroundColor =
                  '#374151';
              }}
            />
          </div>
        ) : (
          <div
            className="flex-shrink-0 rounded-xl flex items-center justify-center"
            style={{
              width: '7.0rem', // Reduced by 15% more from 8.23rem
              height: '12.43rem', // Reduced by 15% more from 14.62rem
              backgroundColor: '#374151',
            }}
          >
            <div className="flex flex-col items-center space-y-3">
              <div className="animate-spin rounded-full h-8 w-8 border-2 border-purple-500 border-t-transparent"></div>
              <span className="text-white text-sm font-medium">Loading...</span>
            </div>
          </div>
        )}

        {/* Scene Content */}
        <div className="flex-1 flex flex-col">
          {isEditing ? (
            <div className="space-y-1">
              <div className="relative">
                <div className="absolute top-1 left-1 w-4 h-4 bg-purple-600 rounded flex items-center justify-center">
                  <span className="text-white text-xs font-bold">T</span>
                </div>
                <textarea
                  className="w-full h-8 bg-slate-700/50 border border-purple-500/30 rounded-xl p-1 pl-8 text-white placeholder-gray-400 resize-none focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-purple-500"
                  value={editedNarration}
                  onChange={(e) => onEditedNarrationChange(e.target.value)}
                  placeholder="Enter scene narration..."
                />
              </div>
              <div className="flex justify-end space-x-3">
                <button
                  onClick={() => onSaveEdit(scene.id)}
                  className="px-6 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-lg text-sm font-medium transition-colors flex items-center space-x-2"
                >
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
                      d="M5 13l4 4L19 7"
                    />
                  </svg>
                  <span>Save</span>
                </button>
                <button
                  onClick={onCancelEdit}
                  className="flex items-center justify-center gap-2.5 h-10 px-6 rounded-xl border-[1.5px] border-[#5B5BFF] text-[#5B5BFF] hover:text-white hover:bg-[#5B5BFF] text-sm font-medium transition-all duration-300"
                  style={{
                    boxShadow: '0 4px 16px 0 rgba(100, 0, 160, 0.35)',
                  }}
                >
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
                      d="M6 18L18 6M6 6l12 12"
                    />
                  </svg>
                  <span>Cancel</span>
                </button>
              </div>
            </div>
          ) : (
            <div className="space-y-1">
              <div className="relative">
                <div className="absolute top-1 left-1 w-4 h-4 bg-purple-600 rounded flex items-center justify-center">
                  <span className="text-white text-xs font-bold">T</span>
                </div>
                <div className="w-full min-h-28 bg-slate-700/50 border border-purple-500/30 rounded-xl p-1 pl-8 pb-4 text-white my-2">
                  <p className="text-white text-sm leading-relaxed">
                    {scene.narration}
                  </p>
                </div>
              </div>
              <div className="flex justify-end">
                <button
                  onClick={() => onEditScene(scene.id, scene.narration)}
                  className="flex items-center justify-center gap-2.5 h-10 px-6 rounded-xl border-[1.5px] border-[#5B5BFF] text-[#5B5BFF] hover:text-white hover:bg-[#5B5BFF] text-sm font-medium transition-all duration-300"
                  style={{
                    boxShadow: '0 4px 16px 0 rgba(100, 0, 160, 0.35)',
                  }}
                >
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
                      d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"
                    />
                  </svg>
                  <span>Edit</span>
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
