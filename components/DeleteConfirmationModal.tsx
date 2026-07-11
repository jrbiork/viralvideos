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
        <div className="flex items-center space-x-3 p-4 rounded-xl bg-slate-800/50 border border-slate-700/50">
          <div className="w-12 h-12 rounded-lg flex items-center justify-center bg-red-500/10 border border-red-500/20">
            <Trash2 className="w-6 h-6 text-red-400" />
          </div>
          <div>
            <p className="text-white font-medium">
              Are you sure you want to delete it?
            </p>
            <p className="text-slate-400 text-sm">
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
            className="flex-1 px-4 py-3 rounded-xl border-[1.5px] border-[#5B5BFF] text-white hover:bg-[#5B5BFF] disabled:opacity-50 disabled:cursor-not-allowed font-medium transition-all duration-300"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            disabled={isDeleting}
            className="flex-1 px-4 py-3 bg-red-600 hover:bg-red-700 disabled:bg-red-600/70 disabled:cursor-not-allowed text-white rounded-xl font-medium transition-all duration-200 hover:-translate-y-[1px] flex items-center justify-center gap-2"
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
