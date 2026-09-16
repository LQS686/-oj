/**
 * lib/user/avatar-config.ts
 * 头像功能配置（纯常量模块，Server / Client 均可安全导入）
 *
 * ⚠️ 禁止从此文件 import server-only / prisma / redis。
 */

/**
 * 是否允许「上传自定义头像」。
 *
 * 当前临时关闭：仅允许从内置头像库（public/avatars/）中选择。
 * 需要恢复上传功能时，把此常量改回 `true` 即可 —— 设置页 UI 会自动切回
 * AvatarUploader，服务端（3 个 upload 路由 + server.ts 分片直通路径）也会随之放行。
 */
export const AVATAR_UPLOAD_ENABLED = false

/** 内置头像所在目录前缀（对应 public/avatars/ 下的静态 SVG） */
export const BUILTIN_AVATAR_PREFIX = '/avatars/'

/**
 * 内置可选头像清单。
 * 均为自绘的几何 / 抽象图形（无人物、无文字、无色情暴力等不健康元素），
 * 以静态 SVG 托管在本站，不依赖外部图床。
 */
export const BUILTIN_AVATARS: readonly string[] = [
  `${BUILTIN_AVATAR_PREFIX}avatar-01.svg`,
  `${BUILTIN_AVATAR_PREFIX}avatar-02.svg`,
  `${BUILTIN_AVATAR_PREFIX}avatar-03.svg`,
  `${BUILTIN_AVATAR_PREFIX}avatar-04.svg`,
  `${BUILTIN_AVATAR_PREFIX}avatar-05.svg`,
  `${BUILTIN_AVATAR_PREFIX}avatar-06.svg`,
  `${BUILTIN_AVATAR_PREFIX}avatar-07.svg`,
  `${BUILTIN_AVATAR_PREFIX}avatar-08.svg`,
  `${BUILTIN_AVATAR_PREFIX}avatar-09.svg`,
  `${BUILTIN_AVATAR_PREFIX}avatar-10.svg`,
  `${BUILTIN_AVATAR_PREFIX}avatar-11.svg`,
  `${BUILTIN_AVATAR_PREFIX}avatar-12.svg`,
]

/**
 * 是否为合法内置头像路径（精确匹配清单，避免 `/avatars/../x` 之类越界写法）。
 */
export function isBuiltinAvatar(url: string | null | undefined): boolean {
  return typeof url === 'string' && BUILTIN_AVATARS.includes(url)
}
