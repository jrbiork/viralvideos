/** @type {import('next').NextConfig} */
const nextConfig = {
  env: {
    AWS_REGION: process.env.AWS_REGION || 'us-east-1',
  },
  async headers() {
    return [
      {
        source: '/videos/:path*.mp4',
        headers: [
          {
            key: 'Cache-Control',
            value: 'public, max-age=31536000, immutable',
          },
        ],
      },
    ];
  },
};

module.exports = nextConfig;
