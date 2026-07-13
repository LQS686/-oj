import { prisma } from '@/lib/prisma';
import bcrypt from 'bcryptjs';
import { signToken } from '@/lib/auth';
import { logger } from '@/lib/logger';
import { trimAll, escapeHtml, removeNullBytes } from '@/lib/sanitize';
import { validateRequired } from '@/lib/validation';
import { errorMonitor } from '@/lib/error-monitor';
import type { LoginResponse } from '@/lib/api/auth';

// 类型定义
export interface LoginInput {
  username: string;
  password: string;
}

export interface RegisterInput {
  username: string;
  email: string;
  password: string;
  nickname?: string;
}

export interface UserResponse {
  id: string;
  username: string;
  email: string;
  nickname?: string;
  avatar?: string;
  bio?: string;
  rating: number;
  rank: string;
  color: string;
  role: string;
  createdAt: string;
}

// 辅助函数
function mapUserToResponse(user: any): UserResponse {
  return {
    id: user.id,
    username: user.username,
    email: user.email,
    nickname: user.nickname ?? undefined,
    avatar: user.avatar ?? undefined,
    bio: user.bio ?? undefined,
    rating: user.rating,
    rank: user.rank,
    color: user.color,
    role: user.role,
    createdAt: user.createdAt.toISOString(),
  };
}

class AuthService {
  async login(input: LoginInput): Promise<LoginResponse> {
    try {
      const trimmedInput = trimAll(input as unknown as Record<string, unknown>);
      const { username, password } = trimmedInput as unknown as LoginInput;

      const requiredError = validateRequired(trimmedInput, ['username', 'password']);
      if (requiredError) {
        logger.warn('登录尝试缺少字段', { input: trimmedInput });
        throw new Error('请输入用户名和密码');
      }

      const sanitizedUsername = removeNullBytes(escapeHtml(username));

      if (sanitizedUsername.length > 100) {
        logger.warn('登录尝试用户名过长', { usernameLength: sanitizedUsername.length });
        throw new Error('用户名格式不正确');
      }

      // 使用更精确的查询，添加索引字段
      const user = await prisma.user.findFirst({
        where: {
          OR: [
            { username: sanitizedUsername },
            { email: sanitizedUsername },
          ],
        },
        select: {
          id: true,
          username: true,
          email: true,
          password: true,
          nickname: true,
          avatar: true,
          bio: true,
          rating: true,
          rank: true,
          color: true,
          role: true,
          isBanned: true,
          tokenVersion: true,
          createdAt: true,
        },
      });

      if (!user) {
        logger.warn('登录失败: 用户不存在', { username: sanitizedUsername });
        throw new Error('用户名或密码错误');
      }

      if (user.isBanned) {
        logger.warn('登录被阻止: 用户被封禁', { userId: user.id, username: user.username });
        throw new Error('账号已被封禁');
      }

      const isPasswordValid = await bcrypt.compare(password, user.password);

      if (!isPasswordValid) {
        logger.warn('登录失败: 密码错误', { userId: user.id, username: user.username });
        throw new Error('用户名或密码错误');
      }

      const token = signToken({
        userId: user.id,
        email: user.email,
        username: user.username,
        role: user.role,
        tokenVersion: user.tokenVersion,
      });

      const userResponse = mapUserToResponse(user);

      logger.info('登录成功', { userId: user.id, username: user.username, role: user.role });
      return { user: userResponse, token };
    } catch (error) {
      errorMonitor.trackError(error as Error, { errorType: 'auth', operation: 'login' });
      throw error;
    }
  }
}

// 导出单例实例
export const authService = new AuthService();

