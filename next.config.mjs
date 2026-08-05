import { initOpenNextCloudflareForDev } from "@opennextjs/cloudflare";

// The platform proxy is only needed by `next dev`. Starting it during a
// production/OpenNext build would create a second Worker runtime unnecessarily.
if (process.env.NODE_ENV === "development") {
  initOpenNextCloudflareForDev();
}

/** @type {import('next').NextConfig} */
const nextConfig = {
  // 允许更大的上传文件请求体（解决 10MB 限制问题）
  experimental: {
    serverActions: {
      bodySizeLimit: '50mb',
    },
  },
};

export default nextConfig;
