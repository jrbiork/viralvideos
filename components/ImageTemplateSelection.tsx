'use client';

import { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { AVAILABLE_TEMPLATES, ImageTemplate } from '../lib/template-constants';
import { useFloatingPosition } from '../hooks/useFloatingPosition';

interface ImageTemplateSelectionProps {
  selectedTemplate?: string;
  onTemplateSelect: (templateId: string) => void;
}

export default function ImageTemplateSelection({
  selectedTemplate = 'realistic',
  onTemplateSelect,
}: ImageTemplateSelectionProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [hoveredTemplate, setHoveredTemplate] = useState<string | null>(null);
  const [previewPosition, setPreviewPosition] = useState<{
    top: number;
    left: number;
  } | null>(null);
  const [isLoaded, setIsLoaded] = useState(false);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const triggerRef = useRef<HTMLDivElement | null>(null);
  const panelRef = useRef<HTMLDivElement | null>(null);
  const closeDropdown = () => {
    setIsOpen(false);
    setHoveredTemplate(null);
  };
  const dropdownPosition = useFloatingPosition(triggerRef, isOpen, closeDropdown);

  const selectedTemplateData = AVAILABLE_TEMPLATES.find(
    (template) => template.id === selectedTemplate,
  );

  const hoveredTemplateData = AVAILABLE_TEMPLATES.find(
    (template) => template.id === hoveredTemplate,
  );

  const handleTemplateSelect = (templateId: string) => {
    onTemplateSelect(templateId);
    setIsOpen(false);
    setHoveredTemplate(null);
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

  // Close dropdown on outside click
  useEffect(() => {
    if (!isOpen) return;

    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as Node;
      if (
        containerRef.current &&
        !containerRef.current.contains(target) &&
        !panelRef.current?.contains(target)
      ) {
        setIsOpen(false);
        setHoveredTemplate(null);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isOpen]);

  // Show loading state until component is loaded
  if (!isLoaded) {
    return (
      <div className="w-full flex items-center gap-3">
        <span className="w-24 shrink-0 text-sm font-medium text-gray-300">
          Image Style
        </span>
        <div className="flex-1 bg-slate-800/50 rounded-lg border border-slate-700 h-[44px] flex items-center justify-center">
          <div className="animate-spin rounded-full h-5 w-5 border-2 border-purple-500 border-t-transparent"></div>
        </div>
      </div>
    );
  }

  return (
    <div ref={containerRef} className="w-full flex items-center gap-3">
      <label className="w-24 shrink-0 text-sm font-medium text-gray-300">
        Image Style
      </label>

      <div ref={triggerRef} className="relative flex-1 min-w-0">
        {/* Trigger */}
        <button
          type="button"
          onClick={() => setIsOpen(!isOpen)}
          className={`w-full flex items-center justify-between bg-slate-800/50 rounded-lg border px-3 py-2.5 transition-colors duration-200 hover:bg-slate-800 ${
            isOpen ? 'border-purple-500/60' : 'border-slate-700'
          }`}
        >
          <div className="flex items-center space-x-3">
            {selectedTemplateData && (
              <div className="w-8 h-8 rounded-md overflow-hidden border-2 border-white/20 shrink-0">
                <img
                  src={selectedTemplateData.imagePath}
                  alt={selectedTemplateData.name}
                  className="w-full h-full object-cover"
                />
              </div>
            )}
            <span className="text-white font-medium text-sm">
              {selectedTemplateData?.name || 'Select a style'}
            </span>
          </div>

          <svg
            className={`w-4 h-4 text-gray-400 transition-transform duration-200 ${
              isOpen ? 'rotate-180' : ''
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
        </button>

        {/* Dropdown Panel — portaled so it isn't clipped by a scrollable ancestor */}
        {isOpen &&
          dropdownPosition &&
          createPortal(
          <div
            ref={panelRef}
            className="fixed z-50 bg-slate-900 border border-slate-700 rounded-lg shadow-xl p-2 max-h-80 overflow-y-auto custom-scrollbar"
            style={{
              top: dropdownPosition.top,
              left: dropdownPosition.left,
              width: dropdownPosition.width,
            }}
            onMouseLeave={() => setHoveredTemplate(null)}
          >
            {AVAILABLE_TEMPLATES.map((template) => {
              const isSelected = selectedTemplate === template.id;

              return (
                <div
                  key={template.id}
                  className={`relative flex items-center justify-between px-2 py-2 rounded-md cursor-pointer transition-colors duration-150 ${
                    isSelected ? 'bg-slate-800' : 'hover:bg-slate-800/60'
                  }`}
                  onClick={() => handleTemplateSelect(template.id)}
                  onMouseEnter={(e) => {
                    setHoveredTemplate(template.id);
                    const rect = e.currentTarget.getBoundingClientRect();
                    setPreviewPosition({
                      top: rect.top + rect.height / 2,
                      left: rect.right + 8,
                    });
                  }}
                >
                  <div className="flex items-center space-x-3">
                    <div className="w-8 h-8 rounded-md overflow-hidden border-2 border-white/20 shrink-0">
                      <img
                        src={template.imagePath}
                        alt={template.name}
                        className="w-full h-full object-cover"
                      />
                    </div>
                    <div>
                      <span className="text-white text-sm font-medium block">
                        {template.name}
                      </span>
                      <span className="text-gray-400 text-xs block">
                        {template.description}
                      </span>
                    </div>
                  </div>

                  {isSelected && (
                    <svg
                      className="w-4 h-4 text-purple-400 shrink-0"
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
                  )}

                </div>
              );
            })}
          </div>,
          document.body,
        )}

        {/* Bigger preview shown while hovering a dropdown item — portaled
            separately since it must escape the dropdown panel's own
            overflow-y-auto (which clips overflow-x too). */}
        {hoveredTemplateData &&
          previewPosition &&
          createPortal(
            <div
              className="hidden sm:block fixed z-50 w-48 rounded-xl overflow-hidden border-2 border-purple-400/60 shadow-2xl pointer-events-none"
              style={{
                top: previewPosition.top,
                left: previewPosition.left,
                transform: 'translateY(-50%)',
              }}
            >
              <img
                src={hoveredTemplateData.imagePath}
                alt={hoveredTemplateData.name}
                className="w-full h-48 object-cover"
              />
              <div className="bg-slate-900/95 px-3 py-2">
                <p className="text-white text-sm font-semibold">
                  {hoveredTemplateData.name}
                </p>
                <p className="text-gray-400 text-xs">
                  {hoveredTemplateData.description}
                </p>
              </div>
            </div>,
            document.body,
          )}
      </div>
    </div>
  );
}
