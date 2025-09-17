'use client';

import { useState } from 'react';

interface ImageTemplate {
  id: string;
  name: string;
  description: string;
  iconColor: string;
  imagePath: string;
}

interface ImageTemplateSelectionProps {
  selectedTemplate?: string;
  onTemplateSelect: (templateId: string) => void;
}

const AVAILABLE_TEMPLATES: ImageTemplate[] = [
  {
    id: 'realistic',
    name: '4K Realistic',
    description: 'High-quality photorealistic images',
    iconColor: 'bg-gradient-to-br from-blue-400 to-purple-500',
    imagePath: '/templates/4k-realistic.png',
  },
  {
    id: 'anime',
    name: 'Anime',
    description: 'Japanese animation style',
    iconColor: 'bg-gradient-to-br from-pink-400 to-purple-500',
    imagePath: '/templates/anime.png',
  },
  {
    id: 'sci-fi',
    name: 'Futuristic Sci-Fi',
    description: 'Cyberpunk and futuristic themes',
    iconColor: 'bg-gradient-to-br from-cyan-400 to-blue-500',
    imagePath: '/templates/futuristic.png',
  },
  {
    id: 'pencil',
    name: 'Pencil-drawn Illustration',
    description: 'Hand-drawn sketch style',
    iconColor: 'bg-gradient-to-br from-gray-500 to-gray-700',
    imagePath: '/templates/pencil.png',
  },
  {
    id: 'cartoon',
    name: 'Cartoon',
    description: 'Fun and colorful cartoon style',
    iconColor: 'bg-gradient-to-br from-yellow-400 to-orange-500',
    imagePath: '/templates/cartoon.png',
  },
  {
    id: 'black-and-white',
    name: 'Black and White',
    description: 'Black and white images',
    iconColor: 'bg-gradient-to-br from-gray-500 to-gray-700',
    imagePath: '/templates/blackwhite.png',
  },
];

export default function ImageTemplateSelection({
  selectedTemplate = 'realistic',
  onTemplateSelect,
}: ImageTemplateSelectionProps) {
  const [isCollapsed, setIsCollapsed] = useState(true);

  const selectedTemplateData = AVAILABLE_TEMPLATES.find(
    (template) => template.id === selectedTemplate,
  );

  const handleTemplateSelect = (templateId: string) => {
    onTemplateSelect(templateId);
  };

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
              Choose a visual style for your video
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
                className={`flex flex-col items-center p-4 rounded-lg border transition-all duration-200 hover:bg-slate-800/50 cursor-pointer ${
                  isSelected
                    ? 'bg-slate-800 border-purple-500/50'
                    : 'bg-slate-800/30 border-slate-600'
                }`}
                onClick={() => handleTemplateSelect(template.id)}
              >
                {/* Template Image */}
                <div className="w-20 h-20 rounded-lg overflow-hidden border-2 border-white/20 mb-3">
                  <img
                    src={template.imagePath}
                    alt={template.name}
                    className="w-full h-full object-cover"
                  />
                </div>

                {/* Template Info */}
                <div className="text-center mb-3">
                  <h3 className="text-white font-semibold text-sm mb-1">
                    {template.name}
                  </h3>
                  <p className="text-gray-400 text-xs">
                    {template.description}
                  </p>
                </div>

                {/* Selection Indicator */}
                {isSelected && (
                  <div className="px-3 py-1 bg-gradient-to-r from-purple-600 to-blue-600 text-white rounded-lg text-xs font-medium flex items-center space-x-1 shadow-lg">
                    <svg
                      className="w-4 h-4"
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
                    <span>Selected</span>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
