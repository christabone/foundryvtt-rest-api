import { describe, it, expect, beforeAll } from '@jest/globals';
import request from 'supertest';
import { FoundryRelayServer } from '../../src/server';

describe('Server Health Tests', () => {
  let server: FoundryRelayServer;
  let app: any;

  beforeAll(() => {
    // Create server instance but don't start it - just test the Express app
    server = new FoundryRelayServer();
    app = server.getApp();
  });

  describe('Express App Configuration', () => {
    it('should create server instance successfully', () => {
      expect(server).toBeDefined();
      expect(app).toBeDefined();
    });

    it('should have health endpoint configured', async () => {
      const response = await request(app).get('/health');
      expect(response.status).toBe(200);
    });
  });

  describe('Health Endpoint', () => {
    it('should return 200 status', async () => {
      const response = await request(app).get('/health');
      expect(response.status).toBe(200);
    });

    it('should return proper health status structure', async () => {
      const response = await request(app).get('/health');
      
      expect(response.body).toHaveProperty('status', 'ok');
      expect(response.body).toHaveProperty('timestamp');
      expect(response.body).toHaveProperty('version');
      expect(response.body).toHaveProperty('websocket');
    });

    it('should return valid timestamp', async () => {
      const response = await request(app).get('/health');
      
      const timestamp = new Date(response.body.timestamp);
      expect(timestamp.getTime()).not.toBeNaN();
      
      // Should be within the last 10 seconds
      const now = new Date();
      const timeDiff = now.getTime() - timestamp.getTime();
      expect(timeDiff).toBeLessThan(10000);
    });

    it('should return version information', async () => {
      const response = await request(app).get('/health');
      
      expect(response.body.version).toBeDefined();
      expect(typeof response.body.version).toBe('string');
      expect(response.body.version.length).toBeGreaterThan(0);
    });

    it('should report websocket status', async () => {
      const response = await request(app).get('/health');
      
      expect(response.body.websocket).toBeDefined();
      expect(['connected', 'disconnected']).toContain(response.body.websocket);
    });

    it('should report disconnected websocket when not started', async () => {
      const response = await request(app).get('/health');
      
      // Since we haven't started the server, websocket should be disconnected
      expect(response.body.websocket).toBe('disconnected');
    });
  });

  describe('API Documentation Endpoint', () => {
    it('should return API documentation', async () => {
      const response = await request(app).get('/api/docs');
      
      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('message');
      expect(response.body).toHaveProperty('version');
      expect(response.body).toHaveProperty('endpoints');
      expect(Array.isArray(response.body.endpoints)).toBe(true);
    });

    it('should include essential endpoints in documentation', async () => {
      const response = await request(app).get('/api/docs');
      
      const endpoints = response.body.endpoints;
      const endpointPaths = endpoints.map((ep: any) => ep.path);
      
      expect(endpointPaths).toContain('/health');
      expect(endpointPaths).toContain('/api/docs');
      expect(endpointPaths).toContain('/ws');
    });
  });

  describe('Error Handling', () => {
    it('should return 404 for unknown endpoints', async () => {
      const response = await request(app).get('/nonexistent-endpoint');
      
      expect(response.status).toBe(404);
      expect(response.body).toHaveProperty('error', 'Endpoint not found');
    });

    it('should handle malformed requests gracefully', async () => {
      const response = await request(app)
        .post('/api/search')
        .set('Content-Type', 'application/json')
        .send('invalid-json');
      
      // Should not crash the server, but should return error
      expect([400, 401, 500]).toContain(response.status);
    });
  });

  describe('Middleware Configuration', () => {
    it('should handle requests with various HTTP methods', async () => {
      // GET should work for health
      const getResponse = await request(app).get('/health');
      expect(getResponse.status).toBe(200);
      
      // POST, PUT, DELETE should return 404 for health (method not allowed)
      const postResponse = await request(app).post('/health');
      expect(postResponse.status).toBe(404);
      
      const putResponse = await request(app).put('/health');
      expect(putResponse.status).toBe(404);
      
      const deleteResponse = await request(app).delete('/health');
      expect(deleteResponse.status).toBe(404);
    });

    it('should include CORS headers', async () => {
      const response = await request(app)
        .get('/health')
        .set('Origin', 'http://localhost:3000');
      
      expect(response.status).toBe(200);
      expect(response.headers).toHaveProperty('access-control-allow-origin');
    });

    it('should handle preflight OPTIONS requests', async () => {
      const response = await request(app)
        .options('/api/search')
        .set('Origin', 'http://localhost:3000')
        .set('Access-Control-Request-Method', 'POST')
        .set('Access-Control-Request-Headers', 'x-api-key');
      
      expect(response.status).toBe(204);
      expect(response.headers).toHaveProperty('access-control-allow-origin');
      expect(response.headers).toHaveProperty('access-control-allow-methods');
    });
  });

  describe('API Authentication Structure', () => {
    it('should reject requests without API key', async () => {
      const response = await request(app)
        .post('/api/search')
        .send({ query: 'test' });
      
      expect(response.status).toBe(401);
      expect(response.body).toHaveProperty('error', 'API key required');
    });

    it('should have proper API route structure', async () => {
      // Test that API routes are mounted correctly
      const response = await request(app).get('/api/status');
      
      // Should get some response (even if auth fails, route should exist)
      expect(response.status).toBeDefined();
      expect([200, 401, 503]).toContain(response.status);
    });
  });

  describe('Request Processing', () => {
    it('should handle concurrent requests', async () => {
      const promises = [];
      
      // Send 5 concurrent health check requests
      for (let i = 0; i < 5; i++) {
        promises.push(request(app).get('/health'));
      }
      
      const responses = await Promise.all(promises);
      
      // All should succeed
      responses.forEach(response => {
        expect(response.status).toBe(200);
        expect(response.body.status).toBe('ok');
      });
    });

    it('should handle JSON request body parsing', async () => {
      const response = await request(app)
        .post('/api/search')
        .set('Content-Type', 'application/json')
        .set('x-api-key', 'test-key')
        .send({ query: 'test' });
      
      // Should parse JSON and reach API logic (even if auth fails)
      expect(response.status).toBeDefined();
      expect([200, 401, 503]).toContain(response.status);
    });
  });
});