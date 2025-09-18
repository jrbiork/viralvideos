'use client';

import { useState, useEffect } from 'react';
import { AVAILABLE_TEMPLATES, ImageTemplate } from '../lib/template-constants';

interface ImageTemplateSelectionProps {
  selectedTemplate?: string;
  onTemplateSelect: (templateId: string) => void;
}

export default function ImageTemplateSelection({
  selectedTemplate = 'realistic',
  onTemplateSelect,
}: ImageTemplateSelectionProps) {
  const [isCollapsed, setIsCollapsed] = useState(true);
  const [previewTemplate, setPreviewTemplate] = useState<string | null>(null);
  const [isLoaded, setIsLoaded] = useState(false);

  const selectedTemplateData = AVAILABLE_TEMPLATES.find(
    (template) => template.id === selectedTemplate,
  );

  const handleTemplateSelect = (templateId: string) => {
    onTemplateSelect(templateId);
  };

  const handlePreviewClick = (templateId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setPreviewTemplate(templateId);
  };

  const handleClosePreview = () => {
    setPreviewTemplate(null);
  };

  // Load from localStorage after hydration
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const savedTemplate = localStorage.getItem('selectedTemplate');
      if (savedTemplate && savedTemplate !== selectedTemplate) {
        onTemplateSelect(savedTemplate);
      }
    }
    setIsLoaded(true);
  }, [selectedTemplate, onTemplateSelect]);

  // Show loading state until component is loaded
  if (!isLoaded) {
    return (
      <div className="w-full bg-slate-900 rounded-xl p-6 border border-slate-700">
        <div className="flex items-center justify-center h-[60px]">
          <div className="animate-spin rounded-full h-6 w-6 border-2 border-purple-500 border-t-transparent"></div>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full bg-slate-900 rounded-xl p-6 border border-slate-700">
      {/* Header */}
      <div
        className={`flex items-center justify-between h-[60px] cursor-pointer hover:bg-slate-800/30 rounded-lg px-2 transition-colors duration-200 ${
          !isCollapsed ? 'mb-6' : ''
        }`}
        onClick={() => setIsCollapsed(!isCollapsed)}
      >
        <div className="flex items-center justify-between">
          <div className="flex flex-col justify-center h-full">
            <h2 className="text-xl font-bold text-white leading-none mb-2">
              Image Template
            </h2>
            <p className="text-gray-400 text-sm leading-none mt-1">
              Choose a visual style
            </p>
          </div>

          {/* Collapsed State - Show Selected Template */}
          {isCollapsed && selectedTemplateData && (
            <div className="flex items-center space-x-3 ml-24">
              {/* Template Icon */}
              <div className="w-12 h-12 rounded-lg overflow-hidden border-2 border-white/20">
                <img
                  src={selectedTemplateData.imagePath}
                  alt={selectedTemplateData.name}
                  className="w-full h-full object-cover"
                />
              </div>

              {/* Selected Template Name */}
              <div className="flex items-center space-x-2">
                <span className="text-white font-medium">
                  {selectedTemplateData.name}
                </span>
              </div>
            </div>
          )}
        </div>

        <div className="flex items-center justify-center">
          <svg
            className={`w-5 h-5 transform transition-transform duration-200 text-gray-400 ${
              isCollapsed ? 'rotate-180' : ''
            }`}
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

      {/* Template List */}
      <div
        className={`overflow-hidden transition-all duration-300 ease-in-out ${
          isCollapsed ? 'max-h-0 opacity-0' : 'max-h-[2000px] opacity-100'
        }`}
      >
        <div className="grid grid-cols-3 gap-4 pt-0">
          {AVAILABLE_TEMPLATES.map((template) => {
            const isSelected = selectedTemplate === template.id;

            return (
              <div
                key={template.id}
                className={`group relative flex flex-col items-center p-4 rounded-lg border transition-all duration-300 hover:bg-slate-800/50 cursor-pointer ${
                  isSelected
                    ? 'bg-slate-800 border-purple-500/50'
                    : 'bg-slate-800/30 border-slate-600'
                }`}
                onClick={() => handleTemplateSelect(template.id)}
              >
                {/* Template Image */}
                <div className="relative w-20 h-20 rounded-lg overflow-hidden border-2 border-white/20 mb-3 transition-all duration-300 group-hover:scale-110 group-hover:border-purple-400/50">
                  <img
                    src={template.imagePath}
                    alt={template.name}
                    className="w-full h-full object-cover transition-all duration-300 group-hover:scale-105"
                  />
                  {/* Preview Button */}
                  <button
                    onClick={(e) => handlePreviewClick(template.id, e)}
                    className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity duration-300 flex items-center justify-center"
                  >
                    <div className="w-8 h-8 bg-white/20 backdrop-blur-sm rounded-full flex items-center justify-center hover:bg-white/30 transition-colors duration-200">
                      <svg
                        className="w-4 h-4 text-white"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                        strokeWidth={2}
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
                        />
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"
                        />
                      </svg>
                    </div>
                  </button>
                </div>

                {/* Template Info */}
                <div className="text-center mb-3">
                  <h3 className="text-white font-semibold text-sm mb-1 transition-colors duration-300 group-hover:text-purple-300">
                    {template.name}
                  </h3>
                  <p className="text-gray-400 text-xs transition-colors duration-300 group-hover:text-gray-300">
                    {template.description}
                  </p>
                </div>

                {/* Selection Indicator - Only show checkmark */}
                {isSelected && (
                  <div className="absolute top-2 right-2 w-6 h-6 bg-gradient-to-r from-purple-600 to-blue-600 rounded-full flex items-center justify-center shadow-lg">
                    <svg
                      className="w-4 h-4 text-white"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                      strokeWidth={2.5}
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        d="M5 13l4 4L19 7"
                      />
                    </svg>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Preview Modal */}
      {previewTemplate && (
        <div
          className="fixed inset-0 bg-slate-900/90 backdrop-blur-md z-50 flex items-center justify-center transition-all duration-300"
          onClick={handleClosePreview}
        >
          {/* Large Preview Image */}
          <div className="w-96 h-96 rounded-2xl overflow-hidden border-4 border-purple-400/60 shadow-2xl transform transition-transform duration-300">
            <img
              src={
                AVAILABLE_TEMPLATES.find((t) => t.id === previewTemplate)
                  ?.imagePath
              }
              alt={
                AVAILABLE_TEMPLATES.find((t) => t.id === previewTemplate)?.name
              }
              className="w-full h-full object-cover"
            />
          </div>
        </div>
      )}
    </div>
  );
}
