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
}

export default function EditScene({
  scene,
  editingScene,
  editedNarration,
  onEditScene,
  onSaveEdit,
  onCancelEdit,
  onEditedNarrationChange,
}: EditSceneProps) {
  console.log('scene:', scene);
  const isEditing = editingScene === scene.id;

  return (
    <div className="bg-slate-800 border border-slate-700 rounded-lg p-4 flex space-x-4">
      {/* Scene Image Placeholder */}
      <div className="w-24 h-24 bg-gradient-to-br from-pink-400 to-purple-600 rounded-lg flex items-center justify-center text-white text-xs font-medium">
        Scene {scene.id + 1}
      </div>

      {/* Scene Content */}
      <div className="flex-1">
        {isEditing ? (
          <div className="space-y-3">
            <textarea
              className="w-full h-24 bg-slate-700 border border-slate-600 rounded-lg p-3 text-white placeholder-gray-400 resize-none focus:outline-none focus:ring-2 focus:ring-blue-500"
              value={editedNarration}
              onChange={(e) => onEditedNarrationChange(e.target.value)}
              placeholder="Enter scene narration..."
            />
            <div className="flex space-x-2">
              <button
                onClick={() => onSaveEdit(scene.id)}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm transition-colors"
              >
                Save
              </button>
              <button
                onClick={onCancelEdit}
                className="px-4 py-2 bg-slate-600 hover:bg-slate-700 text-white rounded-lg text-sm transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <div className="space-y-2">
            <p className="text-white text-sm leading-relaxed">
              {scene.narration}
            </p>
            <div className="flex justify-end">
              <button
                onClick={() => onEditScene(scene.id, scene.narration)}
                className="flex items-center space-x-1 text-blue-400 hover:text-blue-300 text-sm"
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
  );
}
