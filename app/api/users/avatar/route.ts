import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getUserFromRequest } from '@/lib/auth'
import { writeFile } from 'fs/promises'
import path from 'path'
import crypto from 'crypto'

const ALLOWED_MIME_TYPES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp']
const ALLOWED_EXTENSIONS = ['.jpg', '.jpeg', '.png', '.gif', '.webp']
const MAX_FILE_SIZE = 5 * 1024 * 1024
const UPLOAD_DIR = path.join(process.cwd(), 'public', 'uploads', 'avatars')

export async function POST(request: NextRequest) {
  try {
    const user = getUserFromRequest(request)
    if (!user) {
      return NextResponse.json(
        { success: false, error: '请先登录' },
        { status: 401 }
      )
    }

    const formData = await request.formData()
    const file = formData.get('avatar') as File | null

    if (!file) {
      return NextResponse.json(
        { success: false, error: '请选择头像文件' },
        { status: 400 }
      )
    }

    if (!ALLOWED_MIME_TYPES.includes(file.type)) {
      return NextResponse.json(
        { success: false, error: '仅支持 JPG、PNG、GIF、WebP 格式的图片' },
        { status: 400 }
      )
    }

    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json(
        { success: false, error: '文件大小不能超过 5MB' },
        { status: 400 }
      )
    }

    const ext = path.extname(file.name).toLowerCase()
    if (!ALLOWED_EXTENSIONS.includes(ext)) {
      return NextResponse.json(
        { success: false, error: '不支持的文件格式' },
        { status: 400 }
      )
    }

    const safeFilename = crypto.randomUUID() + ext
    const filePath = path.join(UPLOAD_DIR, safeFilename)

    const resolvedPath = path.resolve(filePath)
    if (!resolvedPath.startsWith(path.resolve(UPLOAD_DIR))) {
      return NextResponse.json(
        { success: false, error: '非法的文件路径' },
        { status: 400 }
      )
    }

    const buffer = Buffer.from(await file.arrayBuffer())

    if (
      ext === '.png' &&
      buffer[0] === 0x89 &&
      buffer[1] === 0x50 &&
      buffer[2] === 0x4E &&
      buffer[3] === 0x47
    ) {
    } else if (
      (ext === '.jpg' || ext === '.jpeg') &&
      buffer[0] === 0xFF &&
      buffer[1] === 0xD8
    ) {
    } else if (
      ext === '.gif' &&
      buffer[0] === 0x47 &&
      buffer[1] === 0x49 &&
      buffer[2] === 0x46
    ) {
    } else if (
      ext === '.webp' &&
      buffer[0] === 0x52 &&
      buffer[1] === 0x49 &&
      buffer[2] === 0x46 &&
      buffer[3] === 0x46
    ) {
    } else {
      return NextResponse.json(
        { success: false, error: '文件内容与声明格式不匹配' },
        { status: 400 }
      )
    }

    await writeFile(filePath, buffer)

    const avatarUrl = `/uploads/avatars/${safeFilename}`

    await prisma.user.update({
      where: { id: user.userId },
      data: { avatar: avatarUrl }
    })

    return NextResponse.json({
      success: true,
      data: { avatarUrl },
      message: '头像更新成功'
    })
  } catch (error: any) {
    console.error('上传头像失败:', error)
    return NextResponse.json(
      { success: false, error: '上传头像失败' },
      { status: 500 }
    )
  }
}
