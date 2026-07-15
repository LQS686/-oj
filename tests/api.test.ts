import { describe, it, expect } from 'vitest';
import request from 'supertest';

describe('API Tests', () => {
  const baseURL = 'http://localhost:3001';
  const agent = request(baseURL);

  describe('Health Check', () => {
    it('should return 200 for DB health check', async () => {
      const response = await agent.get('/api/health/db');
      expect(response.status).toBe(200);
    });
  });

  describe('Authentication', () => {
    it('should register a new user', async () => {
      const response = await agent
        .post('/api/auth/register')
        .send({
          email: `test${Date.now()}@example.com`,
          password: 'Test123!',
          name: 'Test User'
        });
      expect(response.status).toBe(201);
    });

    it('should login with valid credentials', async () => {
      // 测试环境凭据：必须通过环境变量注入（TEST_ADMIN_EMAIL/TEST_ADMIN_PASSWORD）。
      // 安全修复（2026-07）：移除 'admin@example.com' / 'admin123' 默认值，
      //   否则任何部署环境的默认凭据被写死在测试中，导致 CI/本地预期与生产实际脱节。
      //   若未注入凭据，跳过此测试（而不是用错误的默认凭据登录）。
      const email = process.env.TEST_ADMIN_EMAIL
      const password = process.env.TEST_ADMIN_PASSWORD
      if (!email || !password) {
        console.warn('[api.test] 跳过登录测试：未设置 TEST_ADMIN_EMAIL/TEST_ADMIN_PASSWORD')
        return
      }
      const response = await agent
        .post('/api/auth/login')
        .send({ email, password });
      expect(response.status).toBe(200);
    });

    it('should NOT have a default admin/admin123 account', async () => {
      // 安全审计回归测试：验证默认账户已不存在
      // 这是攻击者最常尝试的凭据之一，必须返回 401
      const response = await agent
        .post('/api/auth/login')
        .send({ email: 'admin@admin.com', password: 'admin123' });
      expect(response.status).toBe(401);
    });
  });

  describe('Problems', () => {
    it('should get all problems', async () => {
      const response = await agent.get('/api/problems');
      expect(response.status).toBe(200);
    });
  });

  describe('Contests', () => {
    it('should get all contests', async () => {
      const response = await agent.get('/api/contests');
      expect(response.status).toBe(200);
    });
  });

  describe('Rankings', () => {
    it('should get rankings', async () => {
      const response = await agent.get('/api/rankings');
      expect(response.status).toBe(200);
    });
  });
});
