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
    ];
  },
};

export default nextConfig; 