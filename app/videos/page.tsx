'use client';

import VideoGallery from '../../components/VideoGallery';
import MainLayout from '../../components/MainLayout';
import Breadcrumb from '../../components/Breadcrumb';

export default function VideosPage() {
  return (
    <MainLayout showCreditsUpgrade={true}>
      <div
        className="flex-1 p-8 overflow-y-auto"
        style={{ backgroundColor: 'rgba(9,5,38,255)' }}
      >
        <div className="max-w-7xl mx-auto">
          {/* Header */}
          <div className="mb-8">
            <Breadcrumb
              items={[
                { label: 'Dashboard', href: '/create' },
                { label: 'Videos', href: '/videos' },
              ]}
            />
          </div>

          {/* Video Gallery */}
          <VideoGallery />
        </div>
      </div>
    </MainLayout>
  );
}
