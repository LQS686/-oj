import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  poweredByHeader: false,
  output: 'standalone',

  images: {
    remotePatterns: [
      {
        protocol: "http",
        hostname: "localhost",
        port: "",
        pathname: "/**",
      },
    ],
    // 禁用 SVG 加载：SVG 可内嵌 <script>，存在 XSS 风险。
    // 项目头像上传已限定 JPG/PNG/GIF/WebP（见 lib/user/service.ts），无需 SVG。
    dangerouslyAllowSVG: false,
    // 为了更好的兼容性，我们设置 unoptimized 为 true
    // 这将禁用 Next.js 的图片优化，直接使用原文件
    unoptimized: true,
  },

  async headers() {
    const cspDirectives = [
      "default-src 'self'",
      // 'unsafe-eval' 为 Monaco Editor（@monaco-editor/react）Web Worker 必需，移除会导致代码编辑器无法加载；'unsafe-inline' 为 Next.js 内联脚本所需
      "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://cdn.jsdelivr.net",
      "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
      "img-src 'self' data: blob: http://localhost:* https://*.googleusercontent.com",
      "connect-src 'self' http://localhost:* ws://localhost:* https://fonts.googleapis.com https://fonts.gstatic.com https://cdn.jsdelivr.net",
      "font-src 'self' data: https://fonts.gstatic.com",
      "object-src 'none'",
      "base-uri 'self'",
      "form-action 'self'",
      "frame-ancestors 'none'",
    ].join("; ");

    return [
      {
        source: "/:path*",
        headers: [
          {
            key: "X-Frame-Options",
            value: "DENY",
          },
          {
            key: "X-Content-Type-Options",
            value: "nosniff",
          },
          {
            key: "X-XSS-Protection",
            value: "1; mode=block",
          },
          {
            key: "Referrer-Policy",
            value: "strict-origin-when-cross-origin",
          },
          {
            key: "Permissions-Policy",
            value: "camera=(), microphone=(), geolocation=(), interest-cohort=(), payment=(), sync-xhr=()",
          },
          {
            key: "Content-Security-Policy",
            value: cspDirectives,
          },
        ],
      },
    ];
  },

  typescript: {
    ignoreBuildErrors: false,
  },
};

export default nextConfig;
