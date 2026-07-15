'use client';

import { useEffect, useRef } from 'react';
import posthog from 'posthog-js';
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
    posthog.capture('videos_page_loaded');
  }, []);

  useEffect(() => {
    // Subscribe to WebSocket messages
    const unsubscribe = subscribe(
      'videos-page',
      (message: WebSocketMessage) => {
        console.log('Videos page received WebSocket message:', message);

        // Handle video_completed message
        if (message.action === 'video_completed') {
          posthog.capture('video_completed');
          showToasterMessage('Video generated successfully!', 'success');

          // Add the video directly from the manifest without a full refresh
          if (
            videoGalleryRef.current?.addVideoFromManifest &&
            message.data.manifest
          ) {
            videoGalleryRef.current.addVideoFromManifest(message.data.manifest);
          }
        }

        // Handle preview_completed message (scenes generated, video not yet
        // combined/exported) — show the draft in the gallery immediately
        if (message.action === 'preview_completed') {
          showToasterMessage('Video scenes generated!', 'success');

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
    <MainLayout>
      <div className="w-full h-full">
        {/* Video Gallery */}
        <VideoGallery ref={videoGalleryRef} />
      </div>
      {ToasterComponent}
    </MainLayout>
  );
}
