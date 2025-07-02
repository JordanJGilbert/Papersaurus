/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // basePath: '/app', // Commented out to serve at root
  trailingSlash: true,
  async rewrites() {
    return [
      {
        source: '/query',
        destination: 'http://localhost:5001/query',
      },
      {
        source: '/api/cards/store',
        destination: 'http://localhost:5000/api/cards/store',
      },
      {
        source: '/api/cards/list',
        destination: 'http://localhost:5000/api/cards/list',
      },
      {
        source: '/generate_thumbnail',
        destination: 'http://localhost:5000/generate_thumbnail',
      },
      {
        source: '/api/cards/static.json',
        destination: 'http://localhost:5000/api/cards/static.json',
      },
    ];
  },
};

export default nextConfig; 