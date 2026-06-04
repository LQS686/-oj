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

interface EmailSendResult {
  sent: boolean
  reason?: string
}

const verificationCodes = new Map<string, VerificationCode>()

function generateVerificationCode(): string {
  return crypto.randomInt(100000, 999999).toString()
}

/**
 * 发送邮箱验证码。
 *
 * 返回 { sent, reason }：
 *   - sent=true  表示验证码已通过真实邮件服务投递
 *   - sent=false 表示未实际发送，reason 给出原因（便于上层返回明确错误）
 *
 * ⚠️ 当前为占位实现：除非在 .env 中显式配置了 SENDGRID_API_KEY 或 MAILGUN_API_KEY
 *    并接入了真实邮件服务，否则函数将返回 sent=false。
 *
 * 启用方式（任选其一）：
 *   1. SendGrid：在 .env 中设置 SENDGRID_API_KEY=...，并实现 sendWithSendGrid()
 *   2. Mailgun：在 .env 中设置 MAILGUN_API_KEY=... 与 MAILGUN_DOMAIN=...，并实现 sendWithMailgun()
 *   3. SMTP/Nodemailer：在 .env 中设置 SMTP_HOST/USER/PASS，并在下方分支中实现 sendWithSmtp()
 */
function sendVerificationEmail(email: string, code: string): EmailSendResult {
  logger.info(`准备发送验证码至邮箱: ${email}`)

  const hasSendGrid = !!process.env.SENDGRID_API_KEY
  const hasMailgun = !!process.env.MAILGUN_API_KEY

  if (hasSendGrid) {
    // TODO: 接入 SendGrid SDK 调用真实接口
    //   import sgMail from '@sendgrid/mail'
    //   sgMail.setApiKey(process.env.SENDGRID_API_KEY!)
    //   await sgMail.send({ to: email, from: FROM_ADDRESS, subject, text, html })
    logger.error(
      `[Email] 检测到 SENDGRID_API_KEY，但 SendGrid 邮件发送尚未实现，验证码 ${code} 未实际投递至 ${email}`
    )
    return { sent: false, reason: 'SendGrid 邮件服务尚未集成' }
  }

  if (hasMailgun) {
    // TODO: 接入 Mailgun SDK 调用真实接口
    //   import formData from 'form-data'
    //   import Mailgun from 'mailgun.js'
    //   const mg = new Mailgun(formData)
    //   const client = mg.client({ username: 'api', key: process.env.MAILGUN_API_KEY! })
    //   await client.messages.create(process.env.MAILGUN_DOMAIN!, { ... })
    logger.error(
      `[Email] 检测到 MAILGUN_API_KEY，但 Mailgun 邮件发送尚未实现，验证码 ${code} 未实际投递至 ${email}`
    )
    return { sent: false, reason: 'Mailgun 邮件服务尚未集成' }
  }

  logger.error(
    `[Email] 未配置任何邮件服务（SENDGRID_API_KEY / MAILGUN_API_KEY），验证码 ${code} 无法发送至 ${email}`
  )
  return { sent: false, reason: '未配置邮件服务（SENDGRID_API_KEY / MAILGUN_API_KEY）' }
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

    // 仅在邮件确实发送成功后才缓存验证码，
    // 避免在邮件未投递时让客户端一直等待一个永远不会到达的验证码。
    const emailResult = sendVerificationEmail(newEmail, code)
    if (!emailResult.sent) {
      logger.warn(
        `[Email] 拒绝缓存验证码：邮件未实际发送，userId=${user.userId}, newEmail=${newEmail}, reason=${emailResult.reason}`
      )
      return NextResponse.json(
        {
          success: false,
          error: '邮件服务尚未配置或集成，暂无法发送验证码',
          reason: emailResult.reason,
          code: 'EMAIL_SERVICE_NOT_IMPLEMENTED',
        },
        { status: 501 }
      )
    }

    verificationCodes.set(user.userId, {
      code,
      email: newEmail,
      userId: user.userId,
      expiresAt
    })

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
