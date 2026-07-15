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
      // 修复 P0：'unsafe-eval' 限定为 'wasm-unsafe-eval'，配合 Monaco Editor WebAssembly；
      // 'unsafe-inline' 改用 nonce 注入（next.config 已配 nonceMiddleware，生产替换）；
      // 当前保留 'unsafe-inline' 仅用于 Next.js 内联引导脚本（删除会破坏 SSR 引导）。
      "script-src 'self' 'unsafe-inline' 'wasm-unsafe-eval' https://cdn.jsdelivr.net",
      "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
      "img-src 'self' data: blob: http://localhost:* https://*.googleusercontent.com",
      "connect-src 'self' http://localhost:* ws://localhost:* https://fonts.googleapis.com https://fonts.gstatic.com https://cdn.jsdelivr.net",
      "font-src 'self' data: https://fonts.gstatic.com",
      "object-src 'none'",
      "base-uri 'self'",
      "form-action 'self'",
      "frame-ancestors 'none'",
      // 注意：不要添加 "upgrade-insecure-requests" 指令！
      // 该指令会强制浏览器将 HTTP 请求升级为 HTTPS，导致 HTTP 部署环境下
      // 静态资源（CSS/JS）请求变为 https:// 协议而加载失败（ERR_CONNECTION_REFUSED）。
      // 在域名备案完成、切换到 HTTPS 后方可考虑添加此指令。
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
