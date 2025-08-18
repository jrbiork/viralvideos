export default function EditSceneSkeleton() {
  return (
    <div className="bg-slate-800 border border-slate-700 rounded-lg p-4 flex space-x-4 animate-pulse">
      {/* Scene Image Placeholder Skeleton */}
      <div className="w-24 h-24 bg-slate-700 rounded-lg flex items-center justify-center">
        <div className="w-8 h-8 bg-slate-600 rounded-full"></div>
      </div>

      {/* Scene Content Skeleton */}
      <div className="flex-1 space-y-3">
        {/* Text lines skeleton */}
        <div className="space-y-2">
          <div className="h-4 bg-slate-700 rounded w-3/4"></div>
          <div className="h-4 bg-slate-700 rounded w-full"></div>
          <div className="h-4 bg-slate-700 rounded w-2/3"></div>
        </div>
        
        {/* Edit button skeleton */}
        <div className="flex justify-end">
          <div className="w-16 h-6 bg-slate-700 rounded"></div>
        </div>
      </div>
    </div>
  );
}
