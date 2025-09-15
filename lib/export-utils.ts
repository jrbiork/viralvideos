interface ExportVideoParams {
  finalVideoUrl: string;
  filename: string;
  showToasterMessage?: (message: string, type: 'success' | 'error') => void;
}

export const formatFileSize = (bytes: number): string => {
  if (!bytes || bytes === 0) return '0 MB';
  const mb = bytes / (1024 * 1024);
  return `${mb.toFixed(1)} MB`;
};

export const handleExportVideo = async ({
  finalVideoUrl,
  filename,
  showToasterMessage,
}: ExportVideoParams): Promise<void> => {
  if (!finalVideoUrl) {
    showToasterMessage?.('Video URL not available for export', 'error');
    return;
  }

  try {
    // Use our proxy API endpoint - authentication is handled via cookies
    const response = await fetch(
      `/api/download-video?url=${encodeURIComponent(
        finalVideoUrl,
      )}&filename=${filename}`,
      {
        method: 'GET',
        credentials: 'include', // Include cookies for authentication
      },
    );

    if (!response.ok) {
      throw new Error(`Failed to download video: ${response.status}`);
    }

    // Get the video as blob and download
    const blob = await response.blob();
    const url = window.URL.createObjectURL(blob);

    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();

    // Clean up
    window.URL.revokeObjectURL(url);
    document.body.removeChild(a);

    showToasterMessage?.('Video exported successfully!', 'success');
  } catch (error) {
    console.error('Error exporting video:', error);
    showToasterMessage?.('Failed to export video. Please try again.', 'error');
  }
};
