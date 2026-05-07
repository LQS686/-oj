import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getUserFromRequest } from '@/lib/auth'
import { logger } from '@/lib/logger'
import crypto from 'crypto'
import bcrypt from 'bcryptjs'
import clientPromise from '@/lib/mongodb'
import { ObjectId } from 'mongodb'

interface VerificationCode {
  code: string
  email: string
  userId: string
  expiresAt: number
}

const verificationCodes = new Map<string, VerificationCode>()

function generateVerificationCode(): string {
  return crypto.randomInt(100000, 999999).toString()
}

function sendVerificationEmail(email: string, code: string): boolean {
  logger.info(`发送验证码至邮箱: ${email}, 验证码: ${code}`)

  if (process.env.SENDGRID_API_KEY || process.env.MAILGUN_API_KEY) {
    // 生产环境：接入真实邮件服务
    // TODO: 集成 SendGrid/Mailgun/Nodemailer 发送邮件
    logger.info(`[Email] 验证码 ${code} 发送至 ${email}（邮件服务待集成）`)
    return true
  }

  return true
}

async function checkEmailExists(email: string): Promise<boolean> {
  const existingUser = await prisma.user.findUnique({
    where: { email }
  })
  return !!existingUser
}

export async function POST(request: NextRequest) {
  try {
    const user = getUserFromRequest(request)
    
    if (!user) {
      return NextResponse.json(
        { success: false, error: '未登录' },
        { status: 401 }
      )
    }

    const body = await request.json()
    const { email: newEmail, currentPassword } = body

    if (!newEmail || !currentPassword) {
      return NextResponse.json(
        { success: false, error: '请提供新邮箱和当前密码' },
        { status: 400 }
      )
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    if (!emailRegex.test(newEmail)) {
      return NextResponse.json(
        { success: false, error: '邮箱格式不正确' },
        { status: 400 }
      )
    }

    const userRecord = await prisma.user.findUnique({
      where: { id: user.userId },
      select: { password: true, email: true }
    })

    if (!userRecord) {
      return NextResponse.json(
        { success: false, error: '用户不存在' },
        { status: 404 }
      )
    }

    if (userRecord.email.toLowerCase() === newEmail.toLowerCase()) {
      return NextResponse.json(
        { success: false, error: '新邮箱不能与当前邮箱相同' },
        { status: 400 }
      )
    }

    const isPasswordValid = await bcrypt.compare(currentPassword, userRecord.password)
    if (!isPasswordValid) {
      return NextResponse.json(
        { success: false, error: '当前密码错误' },
        { status: 401 }
      )
    }

    const emailExists = await checkEmailExists(newEmail)
    if (emailExists) {
      return NextResponse.json(
        { success: false, error: '该邮箱已被使用' },
        { status: 400 }
      )
    }

    const code = generateVerificationCode()
    const expiresAt = Date.now() + 5 * 60 * 1000

    verificationCodes.set(user.userId, {
      code,
      email: newEmail,
      userId: user.userId,
      expiresAt
    })

    const emailSent = sendVerificationEmail(newEmail, code)
    if (!emailSent) {
      return NextResponse.json(
        { success: false, error: '发送验证码失败，请稍后重试' },
        { status: 500 }
      )
    }

    return NextResponse.json({
      success: true,
      message: '验证码已发送至新邮箱',
      expiresIn: 300
    })
  } catch (error) {
    console.error('发送邮箱验证码失败:', error)
    return NextResponse.json(
      { success: false, error: '服务器错误' },
      { status: 500 }
    )
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const user = getUserFromRequest(request)
    
    if (!user) {
      return NextResponse.json(
        { success: false, error: '未登录' },
        { status: 401 }
      )
    }

    const body = await request.json()
    const { code, currentPassword } = body

    if (!code) {
      return NextResponse.json(
        { success: false, error: '请提供验证码' },
        { status: 400 }
      )
    }

    const storedCode = verificationCodes.get(user.userId)
    
    if (!storedCode) {
      return NextResponse.json(
        { success: false, error: '请先获取验证码' },
        { status: 400 }
      )
    }

    if (Date.now() > storedCode.expiresAt) {
      verificationCodes.delete(user.userId)
      return NextResponse.json(
        { success: false, error: '验证码已过期，请重新获取' },
        { status: 400 }
      )
    }

    if (storedCode.code !== code) {
      return NextResponse.json(
        { success: false, error: '验证码错误' },
        { status: 400 }
      )
    }

    if (currentPassword) {
      const userRecord = await prisma.user.findUnique({
        where: { id: user.userId },
        select: { password: true }
      })

      if (!userRecord) {
        return NextResponse.json(
          { success: false, error: '用户不存在' },
          { status: 404 }
        )
      }

      const isPasswordValid = await bcrypt.compare(currentPassword, userRecord.password)
      if (!isPasswordValid) {
        return NextResponse.json(
          { success: false, error: '当前密码错误' },
          { status: 401 }
        )
      }
    }

    const emailExists = await checkEmailExists(storedCode.email)
    if (emailExists) {
      verificationCodes.delete(user.userId)
      return NextResponse.json(
        { success: false, error: '该邮箱已被使用' },
        { status: 400 }
      )
    }

    const client = await clientPromise
    const db = client.db()

    await db.collection('User').updateOne(
      { _id: new ObjectId(user.userId) },
      {
        $set: {
          email: storedCode.email,
          updatedAt: new Date()
        }
      }
    )

    verificationCodes.delete(user.userId)

    return NextResponse.json({
      success: true,
      message: '邮箱更改成功',
      newEmail: storedCode.email
    })
  } catch (error) {
    console.error('更改邮箱失败:', error)
    return NextResponse.json(
      { success: false, error: '服务器错误' },
      { status: 500 }
    )
  }
}
