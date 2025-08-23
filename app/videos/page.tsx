'use client';

import VideoGallery from '../../components/VideoGallery';
import MainLayout from '../../components/MainLayout';

export default function VideosPage() {
  return (
    <MainLayout showCreditsUpgrade={true}>
      <div className="flex-1 p-8 overflow-y-auto">
        <div className="max-w-7xl mx-auto">
          {/* Video Gallery */}
          <VideoGallery />
        </div>
      </div>
    </MainLayout>
  );
}
