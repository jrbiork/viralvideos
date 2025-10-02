'use client';

import { useEffect, useRef } from 'react';
import VideoGallery, {
  VideoGalleryHandle,
} from '../../components/VideoGallery';
import MainLayout from '../../components/MainLayout';
import { useWebSocketContext } from '../../components/WebSocketContext';
import { WebSocketMessage } from '../types/websocket';
import { useToaster } from '@/hooks/useToaster';

export default function VideosPage() {
  const { subscribe } = useWebSocketContext();
  const videoGalleryRef = useRef<VideoGalleryHandle | null>(null);
  const { showToasterMessage, ToasterComponent } = useToaster();

  useEffect(() => {
    // Subscribe to WebSocket messages
    const unsubscribe = subscribe(
      'videos-page',
      (message: WebSocketMessage) => {
        console.log('Videos page received WebSocket message:', message);

        // Handle video_completed message
        if (message.action === 'video_completed') {
          showToasterMessage('Video generated successfully!', 'success');

          // Add the video directly from the manifest without a full refresh
          if (
            videoGalleryRef.current?.addVideoFromManifest &&
            message.data.manifest
          ) {
            videoGalleryRef.current.addVideoFromManifest(message.data.manifest);
          }
        }
      },
    );

    // Cleanup subscription on unmount
    return () => {
      unsubscribe();
    };
  }, [subscribe, showToasterMessage]);

  return (
    <MainLayout showCreditsUpgrade={true}>
      <div className="w-full h-full flex items-center justify-center">
        {/* Video Gallery */}
        <VideoGallery ref={videoGalleryRef} />
      </div>
      {ToasterComponent}
    </MainLayout>
  );
}
