'use client';

import VideoGallery from '../../components/VideoGallery';
import MainLayout from '../../components/MainLayout';

export default function VideosPage() {
  return (
    <MainLayout showCreditsUpgrade={true}>
      <div className="w-full h-full flex items-center justify-center">
        {/* Video Gallery */}
        <VideoGallery />
      </div>
    </MainLayout>
  );
}
