export default function VideoSkeleton() {
  return (
    <div className="w-full h-full flex items-center justify-center">
      <div className="flex justify-center w-full mt-4">
        <div className="relative w-full max-w-sm">
          {/* Video placeholder */}
          <div
            className="rounded-xl shadow-lg border-2 border-gray-600 bg-gray-800 animate-pulse"
            style={{
              width: '100%',
              height: '608px',
            }}
          >
            {/* Play button overlay */}
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="w-16 h-16 bg-white/20 rounded-full flex items-center justify-center">
                <div className="w-0 h-0 border-l-[12px] border-l-white border-t-[8px] border-t-transparent border-b-[8px] border-b-transparent ml-1"></div>
              </div>
            </div>

            {/* Loading text */}
            <div className="absolute bottom-4 left-1/2 transform -translate-x-1/2">
              <div className="text-center">
                <div className="flex items-center justify-center space-x-2 mb-2">
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                  <span className="text-white text-sm">Loading video...</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
