/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    // Vertex SDK is server-only; keep it out of the client bundle. (Next 14.2)
    serverComponentsExternalPackages: ["@google-cloud/vertexai"],
  },
};

export default nextConfig;
