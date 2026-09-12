'use client'

import dynamic from 'next/dynamic'

/**
 * Markdown 展示组件的「按需加载」外壳。
 *
 * 为什么要单独一层：
 *   markdown 渲染管线（react-markdown + remark/rehype + KaTeX + 代码高亮）实测单个
 *   分包 631KB / gzip 190KB。凡是被客户端组件直接 import 的路由，它都会进入首屏 JS。
 *   这些消费方本身都是「客户端组件 + 客户端取数」，内容不可能进入 SSR HTML，
 *   因此把管线改为 ssr:false 的异步分包：不占首屏 JS，页面数据到达后再按需下载。
 *
 * 与「服务端渲染」的关系：
 *   能拿到服务端数据的页面（如 /problem/[id]、/contests/[id]）不走本组件，
 *   而是由服务端组件用 MarkdownContent 渲染好、以 React 节点传下来 —— 那样
 *   浏览器侧完全不加载 markdown 管线（见 ProblemDescription / EntityDescriptionCard 的
 *   markdownNodes / renderedContent 参数）。
 *
 * 说明：Next 16 禁止在应用代码里 import react-dom/server（构建期直接报错），
 * 所以「服务端渲染成 HTML 字符串再发给浏览器」这条路走不通，只能用上面两种方式。
 */
const LazyMarkdownRenderer = dynamic(() => import('./MarkdownRenderer'), {
  ssr: false,
  loading: () => (
    <div className="min-h-[1.5rem] animate-pulse rounded bg-muted/50" aria-busy="true" />
  ),
})

export default LazyMarkdownRenderer
