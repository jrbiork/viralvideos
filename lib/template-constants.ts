export interface ImageTemplate {
  id: string;
  name: string;
  description: string;
  iconColor: string;
  imagePath: string;
}

export const AVAILABLE_TEMPLATES: ImageTemplate[] = [
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
    name: 'Illustration',
    description: 'A pencil sketch image',
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
    name: 'Black/White',
    description: 'Black and white images',
    iconColor: 'bg-gradient-to-br from-gray-500 to-gray-700',
    imagePath: '/templates/blackwhite.png',
  },
];
