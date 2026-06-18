/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    // Vertex SDK is server-only; keep it out of the client bundle. (Next 14.2)
    serverComponentsExternalPackages: ["@google-cloud/vertexai"],
    // Bundle the SQL files into the migrate function so fs.readFile works on Vercel.
    outputFileTracingIncludes: {
      "/api/migrate": ["./db/**/*"],
    },
  },
  // Prototype: don't let lint nits block deploys. Type-checking stays enforced.
  eslint: { ignoreDuringBuilds: true },
};

export default nextConfig;
