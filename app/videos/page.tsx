'use client';

import { useEffect, useRef, useState } from 'react';
import posthog from 'posthog-js';
import VideoGallery, {
  VideoGalleryHandle,
  VideoStatusFilter,
} from '../../components/VideoGallery';
import MainLayout from '../../components/MainLayout';
import { useWebSocketContext } from '../../components/WebSocketContext';
import { WebSocketMessage } from '../types/websocket';
import { useToaster } from '@/hooks/useToaster';

export default function VideosPage() {
  const { subscribe } = useWebSocketContext();
  const videoGalleryRef = useRef<VideoGalleryHandle | null>(null);
  const { showToasterMessage, ToasterComponent } = useToaster();
  const [statusFilter, setStatusFilter] = useState<VideoStatusFilter>('all');

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
        {/* Status Filter */}
        <div className="flex justify-start px-4 pt-4 sm:px-8">
          <div className="relative w-44">
            <select
              value={statusFilter}
              onChange={(e) =>
                setStatusFilter(e.target.value as VideoStatusFilter)
              }
              className="w-full appearance-none flex items-center justify-between bg-slate-800/50 rounded-lg border border-slate-700 px-3 py-2.5 text-white font-medium text-sm transition-colors duration-200 hover:bg-slate-800 focus:outline-none focus:border-purple-500/60"
            >
              <option value="all">All</option>
              <option value="done">Done</option>
              <option value="draft">Draft</option>
            </select>
            <svg
              className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M19 9l-7 7-7-7"
              />
            </svg>
          </div>
        </div>

        {/* Video Gallery */}
        <VideoGallery ref={videoGalleryRef} statusFilter={statusFilter} />
      </div>
      {ToasterComponent}
    </MainLayout>
  );
}
