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
    ];
  },
};

export default nextConfig; 