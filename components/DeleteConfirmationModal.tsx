import React from 'react';
import { Trash2 } from 'lucide-react';
import Modal from './Modal';

interface Video {
  key?: string;
  finalVideoUrl?: string;
  thumbnailUrl: string | null;
  timestamp: number | string;
  createdAt: string;
  lastModified: string;
  totalDuration: number;
  sceneCount: number;
  videoGenerated: boolean;
}

interface DeleteConfirmationModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => Promise<void>;
  video: Video | null;
  isDeleting?: boolean;
}

export default function DeleteConfirmationModal({
  isOpen,
  onClose,
  onConfirm,
  video,
  isDeleting = false,
}: DeleteConfirmationModalProps) {
  if (!video) return null;

  const formatDate = (dateString: string): string => {
    try {
      let date: Date;

      // Check if it's a timestamp string (all digits)
      if (/^\d+$/.test(dateString)) {
        // It's a timestamp in milliseconds
        date = new Date(parseInt(dateString));
      } else {
        // It's a regular date string
        date = new Date(dateString);
      }

      if (isNaN(date.getTime())) {
        console.warn('Invalid date string:', dateString);
        return 'Invalid date';
      }

      return date.toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      });
    } catch (error) {
      console.error(
        'Error formatting date:',
        error,
        'Date string:',
        dateString,
      );
      return 'Invalid date';
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Delete Video"
      maxWidth="max-w-md"
    >
      <div className="space-y-4">
        <div className="flex items-center space-x-3 p-4 rounded-lg border border-purple-500/20">
          <div className="w-12 h-12 rounded-lg flex items-center justify-center">
            <Trash2 className="w-6 h-6 text-purple-400" />
          </div>
          <div>
            <p className="text-white font-medium">
              Are you sure you want to delete it?
            </p>
            <p className="text-purple-300 text-sm">
              Video from {formatDate(video.lastModified)}
            </p>
          </div>
        </div>

        <p className="text-gray-300 text-sm">
          This action cannot be undone. The video and all its associated files
          will be permanently deleted.
        </p>

        {/* Modal Actions */}
        <div className="flex space-x-3 pt-4">
          <button
            onClick={onClose}
            disabled={isDeleting}
            className="flex-1 px-4 py-3 bg-slate-700 hover:bg-slate-600 disabled:bg-slate-600 disabled:cursor-not-allowed text-white rounded-lg font-medium transition-colors duration-200"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            disabled={isDeleting}
            className="flex-1 px-4 py-3 bg-purple-600 hover:bg-purple-700 disabled:bg-purple-600/70 disabled:cursor-not-allowed text-white rounded-lg font-medium transition-colors duration-200 flex items-center justify-center gap-2"
          >
            {isDeleting && (
              <svg
                className="animate-spin -ml-1 mr-2 h-4 w-4 text-white"
                xmlns="http://www.w3.org/2000/svg"
                fill="none"
                viewBox="0 0 24 24"
              >
                <circle
                  className="opacity-25"
                  cx="12"
                  cy="12"
                  r="10"
                  stroke="none"
                  strokeWidth="4"
                ></circle>
                <path
                  className="opacity-75"
                  fill="none"
                  d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                ></path>
              </svg>
            )}
            {isDeleting ? 'Deleting...' : 'Delete Video'}
          </button>
        </div>
      </div>
    </Modal>
  );
}
