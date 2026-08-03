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