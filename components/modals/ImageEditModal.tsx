import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import Cropper, { type Area } from 'react-easy-crop';

const MAX_UPLOAD_BYTES = 50 * 1024 * 1024;
// Scene images are rendered/exported at this resolution everywhere else in
// the app (see the "Export Details: 1080 x 1920" panel) — crop output is
// resampled to match regardless of the source image's own resolution.
const CROP_OUTPUT_WIDTH = 1080;
const CROP_OUTPUT_HEIGHT = 1920;

function loadImageElement(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new window.Image();
    img.addEventListener('load', () => resolve(img));
    img.addEventListener('error', () =>
      reject(new Error('Could not read that file as an image.')),
    );
    img.src = src;
  });
}

async function getCroppedImageFile(
  imageSrc: string,
  croppedAreaPixels: Area,
  fileName: string,
): Promise<File> {
  const image = await loadImageElement(imageSrc);
  const canvas = document.createElement('canvas');
  canvas.width = CROP_OUTPUT_WIDTH;
  canvas.height = CROP_OUTPUT_HEIGHT;
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    throw new Error('Could not get canvas context');
  }

  ctx.drawImage(
    image,
    croppedAreaPixels.x,
    croppedAreaPixels.y,
    croppedAreaPixels.width,
    croppedAreaPixels.height,
    0,
    0,
    CROP_OUTPUT_WIDTH,
    CROP_OUTPUT_HEIGHT,
  );

  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (!blob) {
        reject(new Error('Failed to create cropped image'));
        return;
      }
      resolve(new File([blob], fileName, { type: 'image/png' }));
    }, 'image/png');
  });
}

interface ImageEditModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentImageUrl?: string | null;
  displayIndex: number;
  onGenerateImage: (prompt: string) => Promise<void>;
  onUploadImage: (file: File) => Promise<void>;
  onSaveImage: () => Promise<void>;
  isGeneratingImage: boolean;
  isUploadingImage: boolean;
  isSavingImage: boolean;
  generatedImageUrl?: string | null;
  validationErrors: { image: boolean };
  onClearValidationError: () => void;
}

export default function ImageEditModal({
  isOpen,
  onClose,
  currentImageUrl,
  displayIndex,
  onGenerateImage,
  onUploadImage,
  onSaveImage,
  isGeneratingImage,
  isUploadingImage,
  isSavingImage,
  generatedImageUrl,
  validationErrors,
  onClearValidationError,
}: ImageEditModalProps) {
  const [editPrompt, setEditPrompt] = useState('');
  const [hasGeneratedImage, setHasGeneratedImage] = useState(false);
  const [mode, setMode] = useState<'generate' | 'upload'>('generate');
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [uploadStep, setUploadStep] = useState<'pick' | 'crop'>('pick');
  const [selectedImageSrc, setSelectedImageSrc] = useState<string | null>(
    null,
  );
  const [selectedFileName, setSelectedFileName] = useState('upload.png');
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [croppedAreaPixels, setCroppedAreaPixels] = useState<Area | null>(
    null,
  );
  const isBusy = isGeneratingImage || isUploadingImage;

  // Revokes the previous object URL whenever a new file is picked, and on
  // unmount — avoids leaking memory across repeated file selections.
  React.useEffect(() => {
    if (!selectedImageSrc) return;
    return () => URL.revokeObjectURL(selectedImageSrc);
  }, [selectedImageSrc]);

  const handleGenerateImage = async () => {
    if (!editPrompt.trim()) {
      alert('Please enter a prompt for the new image');
      return;
    }

    try {
      await onGenerateImage(editPrompt);
      setHasGeneratedImage(true);
      onClearValidationError();
    } catch (error) {
      console.error('Error generating image:', error);
      alert('Failed to generate image. Please try again.');
    }
  };

  const handleTryAnother = async () => {
    if (mode === 'upload') {
      // Uploads have no "regenerate" concept — just go back to the file
      // picker so the user can choose a different file.
      setHasGeneratedImage(false);
      setUploadError(null);
      setUploadStep('pick');
      return;
    }

    if (!editPrompt.trim()) {
      alert('Please enter a prompt for the new image');
      return;
    }

    try {
      await onGenerateImage(editPrompt);
    } catch (error) {
      console.error('Error generating image:', error);
      alert('Failed to generate image. Please try again.');
    }
  };

  const handleDiscard = () => {
    setHasGeneratedImage(false);
    setUploadError(null);
  };

  const handleFileSelected = (file: File) => {
    setUploadError(null);

    if (file.size > MAX_UPLOAD_BYTES) {
      setUploadError(
        `Image must be under 50MB (yours is ${(file.size / (1024 * 1024)).toFixed(1)}MB).`,
      );
      return;
    }

    setSelectedImageSrc(URL.createObjectURL(file));
    setSelectedFileName(file.name || 'upload.png');
    setCrop({ x: 0, y: 0 });
    setZoom(1);
    setCroppedAreaPixels(null);
    setUploadStep('crop');
  };

  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (file) {
      handleFileSelected(file);
    }
  };

  const handleCancelCrop = () => {
    setSelectedImageSrc(null);
    setUploadStep('pick');
    setCroppedAreaPixels(null);
  };

  const handleConfirmCrop = async () => {
    if (!selectedImageSrc || !croppedAreaPixels) return;

    try {
      const file = await getCroppedImageFile(
        selectedImageSrc,
        croppedAreaPixels,
        selectedFileName,
      );
      setSelectedImageSrc(null);
      setUploadStep('pick');
      await onUploadImage(file);
      setHasGeneratedImage(true);
      onClearValidationError();
    } catch (error) {
      console.error('Error cropping/uploading image:', error);
      setUploadError('Failed to upload image. Please try again.');
      setUploadStep('pick');
    }
  };

  const handleUseImage = async () => {
    try {
      await onSaveImage();
      setHasGeneratedImage(false);
      onClose();
    } catch (error) {
      console.error('Error saving image:', error);
      alert('Failed to save image. Please try again.');
    }
  };

  if (!isOpen) return null;

  // Portaled to <body> — see AnimateSceneModal.tsx for why (the step-2
  // sliding panel's CSS transform breaks descendant "fixed" positioning).
  return createPortal(
    <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-[100] p-4">
      <div className="bg-slate-900 rounded-2xl w-full max-h-[90vh] overflow-hidden shadow-2xl border border-slate-700/60 transition-all duration-300 ease-in-out max-w-[51.2rem]">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-slate-700/60">
          <h2 className="text-base font-semibold text-white">
            Scene {displayIndex + 1}
          </h2>
          <button
            onClick={onClose}
            className="w-6 h-6 rounded-full bg-slate-800 hover:bg-slate-700 text-slate-300 flex items-center justify-center transition-colors"
          >
            <svg
              className="w-3 h-3"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
            >
              <path
                d="M6 18L18 6M6 6l12 12"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </button>
        </div>

        {/* Body */}
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-4 lg:gap-6 p-3 sm:p-4 items-start overflow-y-auto max-h-[calc(90vh-56px)]">
          {/* Left: Current Image */}
          <div className="lg:col-span-1 flex flex-col items-center">
            <h3 className="text-white font-semibold mb-2 lg:mb-4">Current Image</h3>
            <div className="relative aspect-[9/16] rounded-xl overflow-hidden bg-slate-800 ring-2 ring-slate-700 max-h-[28vh] lg:max-h-[40vh] mt-2">
              {currentImageUrl ? (
                <img
                  src={currentImageUrl}
                  alt={`Scene ${displayIndex + 1}`}
                  className="w-full h-full object-cover"
                />
              ) : (
                <div className="w-full h-full flex items-center justify-center text-slate-400 text-sm p-16 whitespace-nowrap">
                  No image
                </div>
              )}
            </div>
          </div>

          {/* Right: New Image (when generated/uploaded or in progress) or Edit Controls */}
          {isBusy || (hasGeneratedImage && generatedImageUrl) ? (
            <div className="flex flex-col items-center lg:col-span-3">
              <h3
                className="text-white font-semibold mb-2 text-center"
                style={{
                  width: '100%',
                  textAlign: 'center',
                }}
              >
                New Image
              </h3>
              <div
                className="flex justify-center bg-slate-800/50 border border-slate-700 rounded-xl p-4"
                style={{ width: '100%' }}
              >
                <div className="relative aspect-[9/16] rounded-xl overflow-hidden bg-slate-800 ring-1 ring-slate-700 h-[28vh] lg:h-[40vh] flex items-center justify-center">
                  {isBusy ? (
                    <div className="w-full h-full bg-slate-700/60 animate-pulse flex items-center justify-center">
                      <span className="inline-block h-8 w-8 border-2 border-white/70 border-t-transparent rounded-full animate-spin" />
                    </div>
                  ) : (
                    <img
                      src={generatedImageUrl!}
                      alt="Generated image"
                      className="w-full h-full object-cover"
                    />
                  )}
                </div>
              </div>

              {/* Action Buttons */}
              {hasGeneratedImage && generatedImageUrl && (
              <div className="mt-4 flex flex-col sm:flex-row items-stretch sm:items-center gap-3 sm:gap-6">
                <button
                  onClick={handleTryAnother}
                  disabled={isBusy}
                  className="flex items-center justify-center sm:justify-start gap-2 text-[#A5A6F6] hover:text-[#A5A6F6]/80 transition-colors text-xs font-medium disabled:opacity-50 disabled:cursor-not-allowed min-w-0 sm:min-w-[200px]"
                >
                  {isGeneratingImage ? (
                    <>
                      <span className="inline-block h-4 w-4 border-2 border-[#A5A6F6]/70 border-t-transparent rounded-full animate-spin" />
                      Generating...
                    </>
                  ) : (
                    <>
                      <svg
                        className="w-4 h-4"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                      >
                        <path
                          d="M1 4v6h6"
                          strokeWidth="2"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        />
                        <path
                          d="M23 20v-6h-6"
                          strokeWidth="2"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        />
                        <path
                          d="M20.49 9A9 9 0 0 0 5.64 5.64L1 10m22 4l-4.64 4.36A9 9 0 0 1 3.51 15"
                          strokeWidth="2"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        />
                      </svg>
                      Try another
                    </>
                  )}
                </button>

                <button
                  onClick={handleDiscard}
                  className="py-2 px-4 text-white transition-all duration-200 text-xs font-bold hover:bg-[#5B5BFF]/30 hover:scale-105"
                  style={{
                    borderRadius: '12px',
                    border: '1.5px solid #5B5BFF',
                    boxShadow: '0 4px 16px 0 rgba(100, 0, 160, 0.35)',
                  }}
                >
                  Discard
                </button>

                <button
                  onClick={handleUseImage}
                  disabled={isSavingImage}
                  className="py-2 px-4 text-white transition-colors hover:brightness-95 text-xs font-bold"
                  style={{
                    borderRadius: '12px',
                    background:
                      'linear-gradient(90deg, #7552F2 0%, #2CA4F2 100%)',
                    boxShadow: '0 2px 6px 0 rgba(100, 0, 160, 0.25)',
                  }}
                >
                  {isSavingImage ? 'Saving...' : 'Use this image'}
                </button>
              </div>
              )}
            </div>
          ) : (
            /* Right: Edit */
            <div className="flex flex-col lg:col-span-3">
              {/* Generate / Upload toggle */}
              <div className="flex gap-1 mb-4 bg-slate-800 rounded-xl p-1 w-fit">
                <button
                  type="button"
                  onClick={() => setMode('generate')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                    mode === 'generate'
                      ? 'bg-slate-700 text-white'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  Generate
                </button>
                <button
                  type="button"
                  onClick={() => setMode('upload')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                    mode === 'upload'
                      ? 'bg-slate-700 text-white'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  Upload
                </button>
              </div>

              {mode === 'generate' ? (
                <>
                  <div>
                    <h4 className="text-white font-semibold mb-2">Prompt</h4>
                    <div className="bg-slate-800 border border-slate-700 rounded-xl p-0 mt-6">
                      <textarea
                        value={editPrompt}
                        onChange={(e) => setEditPrompt(e.target.value)}
                        placeholder="Describe the new image you want to generate..."
                        className="w-full h-28 bg-transparent p-3 text-slate-200 placeholder-slate-400 resize-none focus:outline-none"
                      />
                      <div className="px-3 pb-3 text-xs text-slate-400">
                        E.g.: An elephant in the jungle
                      </div>
                    </div>
                  </div>

                  {/* Footer actions */}
                  <div className="mt-auto pt-4 flex items-center justify-end">
                    <button
                      onClick={handleGenerateImage}
                      disabled={!editPrompt.trim() || isGeneratingImage}
                      className={`${
                        editPrompt.trim() && !isGeneratingImage
                          ? 'text-white hover:brightness-95'
                          : 'bg-slate-700 text-slate-400 cursor-not-allowed'
                      } inline-flex items-center text-xs font-semibold transition-colors`}
                      style={
                        editPrompt.trim() && !isGeneratingImage
                          ? {
                              borderRadius: '12px',
                              background:
                                'var(--Gradient, linear-gradient(90deg, #7552F2 0%, #2CA4F2 100%))',
                              boxShadow: '0 2px 6px 0 rgba(100, 0, 160, 0.25)',
                              height: '40px',
                              padding: '8px 16px',
                              justifyContent: 'center',
                              alignItems: 'center',
                              gap: '10px',
                            }
                          : {
                              borderRadius: '12px',
                              height: '40px',
                              padding: '8px 16px',
                              justifyContent: 'center',
                              alignItems: 'center',
                              gap: '10px',
                            }
                      }
                    >
                      {isGeneratingImage ? (
                        <span className="flex items-center gap-2">
                          <span className="inline-block h-4 w-4 border-2 border-white/70 border-t-transparent rounded-full animate-spin" />
                          Generating...
                        </span>
                      ) : (
                        'Generate image'
                      )}
                    </button>
                  </div>
                </>
              ) : uploadStep === 'pick' ? (
                <div>
                  <h4 className="text-white font-semibold mb-2">
                    Upload your own image
                  </h4>
                  <label
                    className={`flex flex-col items-center justify-center gap-2 bg-slate-800 border-2 border-dashed rounded-xl p-8 mt-6 cursor-pointer transition-colors ${
                      uploadError
                        ? 'border-red-500/60'
                        : 'border-slate-700 hover:border-slate-500'
                    }`}
                  >
                    <input
                      type="file"
                      accept="image/png,image/jpeg"
                      className="hidden"
                      onChange={handleFileInputChange}
                      disabled={isUploadingImage}
                    />
                    <span className="text-slate-200 text-sm font-medium">
                      Click to choose an image
                    </span>
                    <span className="text-xs text-slate-400 text-center">
                      PNG or JPEG, up to 50MB — you&apos;ll position a 9:16
                      crop next
                    </span>
                  </label>
                  {uploadError && (
                    <div className="text-red-400 text-xs mt-2">
                      {uploadError}
                    </div>
                  )}
                </div>
              ) : (
                <div className="flex flex-col">
                  <h4 className="text-white font-semibold mb-2">
                    Position your crop
                  </h4>
                  <div className="relative w-full h-[42vh] max-h-[420px] bg-slate-800 rounded-xl overflow-hidden mt-2">
                    {selectedImageSrc && (
                      <Cropper
                        image={selectedImageSrc}
                        crop={crop}
                        zoom={zoom}
                        rotation={0}
                        aspect={9 / 16}
                        onCropChange={setCrop}
                        onZoomChange={setZoom}
                        onCropComplete={(_area, areaPixels) =>
                          setCroppedAreaPixels(areaPixels)
                        }
                      />
                    )}
                  </div>
                  <div className="flex items-center gap-3 mt-4">
                    <span className="text-xs text-slate-400">Zoom</span>
                    <input
                      type="range"
                      min={1}
                      max={3}
                      step={0.01}
                      value={zoom}
                      onChange={(e) => setZoom(Number(e.target.value))}
                      className="flex-1"
                    />
                  </div>
                  {uploadError && (
                    <div className="text-red-400 text-xs mt-2">
                      {uploadError}
                    </div>
                  )}
                  <div className="mt-auto pt-4 flex items-center justify-end gap-3">
                    <button
                      onClick={handleCancelCrop}
                      disabled={isUploadingImage}
                      className="py-2 px-4 text-white transition-all duration-200 text-xs font-bold hover:bg-[#5B5BFF]/30 hover:scale-105 disabled:opacity-50 disabled:cursor-not-allowed"
                      style={{
                        borderRadius: '12px',
                        border: '1.5px solid #5B5BFF',
                      }}
                    >
                      Cancel
                    </button>
                    <button
                      onClick={handleConfirmCrop}
                      disabled={!croppedAreaPixels || isUploadingImage}
                      className="py-2 px-4 text-white transition-colors hover:brightness-95 text-xs font-bold disabled:opacity-50 disabled:cursor-not-allowed"
                      style={{
                        borderRadius: '12px',
                        background:
                          'linear-gradient(90deg, #7552F2 0%, #2CA4F2 100%)',
                        boxShadow: '0 2px 6px 0 rgba(100, 0, 160, 0.25)',
                      }}
                    >
                      {isUploadingImage ? 'Uploading...' : 'Use this crop'}
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}
