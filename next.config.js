/** @type {import('next').NextConfig} */
const nextConfig = {
  env: {
    AWS_REGION: process.env.AWS_REGION || 'us-east-1',
  },
};

module.exports = nextConfig;
