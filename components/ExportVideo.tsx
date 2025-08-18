interface ExportVideoProps {
  onExportVideo: () => void;
  isExporting?: boolean;
  onBack?: () => void;
}

export default function ExportVideo({
  onExportVideo,
  isExporting = false,
  onBack,
}: ExportVideoProps) {
  return (
    <div className="w-full">
      {/* Header */}
      <div className="mb-6 lg:mb-8">
        <h1 className="text-2xl lg:text-3xl font-bold text-white mb-2">
          Export your viral short
        </h1>
        <p className="text-gray-300 text-sm lg:text-base">
          Download your completed video and share it with the world.
        </p>
      </div>

      {/* Export Options */}
      <div className="mb-8">
        <div className="bg-slate-800 border border-slate-700 rounded-lg p-6">
          <h2 className="text-xl font-semibold text-white mb-4">
            Export Options
          </h2>

          <div className="space-y-4">
            <div className="flex items-center justify-between p-4 bg-slate-700 rounded-lg">
              <div>
                <h3 className="text-white font-medium">High Quality MP4</h3>
                <p className="text-gray-400 text-sm">
                  1080p resolution, optimal for social media
                </p>
              </div>
              <div className="text-right">
                <div className="text-white font-semibold">Free</div>
                <div className="text-gray-400 text-xs">0 credits</div>
              </div>
            </div>

            <div className="flex items-center justify-between p-4 bg-slate-700 rounded-lg">
              <div>
                <h3 className="text-white font-medium">4K Ultra HD</h3>
                <p className="text-gray-400 text-sm">
                  Cinema quality, perfect for professional use
                </p>
              </div>
              <div className="text-right">
                <div className="text-white font-semibold">5 credits</div>
                <div className="text-gray-400 text-xs">Premium quality</div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Export Button */}
      <div className="text-center">
        <button
          onClick={onExportVideo}
          disabled={isExporting}
          className={`px-8 py-4 rounded-lg text-lg font-semibold flex items-center justify-center space-x-2 mx-auto transition-colors ${
            isExporting
              ? 'bg-gray-600 text-gray-400 cursor-not-allowed'
              : 'bg-green-600 hover:bg-green-700 text-white'
          }`}
        >
          {isExporting ? (
            <>
              <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white"></div>
              <span>Exporting...</span>
            </>
          ) : (
            <>
              <span>Export Video</span>
              <span>📤</span>
            </>
          )}
        </button>
      </div>

      {/* Back Button */}
      {onBack && (
        <div className="absolute bottom-4 left-4">
          <button
            onClick={onBack}
            className="px-4 py-2 border border-blue-500 text-blue-500 hover:bg-blue-500 hover:text-white rounded-lg transition-colors"
          >
            ← Back
          </button>
        </div>
      )}
    </div>
  );
}
