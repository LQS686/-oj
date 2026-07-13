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
      // 测试环境凭据：实际部署时应通过环境变量注入，此处仅用于 CI/本地测试
      const response = await agent
        .post('/api/auth/login')
        .send({
          email: process.env.TEST_ADMIN_EMAIL || 'admin@example.com',
          password: process.env.TEST_ADMIN_PASSWORD || 'admin123'
        });
      expect(response.status).toBe(200);
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
