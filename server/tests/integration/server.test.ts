import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import request from 'supertest';
import { FoundryRelayServer } from '../../src/server';
import { MockFoundryClient } from '../utils/mockFoundryClient';

describe('FoundryRelayServer Integration Tests', () => {
  let server: FoundryRelayServer;
  let mockClient: MockFoundryClient;
  let app: any;

  beforeAll(async () => {
    // Use a different port for testing
    process.env.PORT = '3011';
    
    server = new FoundryRelayServer();
    await server.start();
    app = server.getApp();
    
    // Connect mock FoundryVTT client
    mockClient = new MockFoundryClient();
    await mockClient.connect();
    
    // Wait a bit for connection to establish
    await new Promise(resolve => setTimeout(resolve, 500));
  }, 60000);

  afterAll(async () => {
    if (mockClient) {
      mockClient.disconnect();
    }
    if (server) {
      await server.stop();
    }
  });

  describe('Health Endpoints', () => {
    it('should return health status', async () => {
      const response = await request(app).get('/health');
      
      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('status', 'ok');
      expect(response.body).toHaveProperty('timestamp');
      expect(response.body).toHaveProperty('version');
    });

    it('should return API documentation', async () => {
      const response = await request(app).get('/api/docs');
      
      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('message');
      expect(response.body).toHaveProperty('endpoints');
      expect(Array.isArray(response.body.endpoints)).toBe(true);
    });

    it('should return server status', async () => {
      const response = await request(app).get('/api/status');
      
      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('connectedClients');
      expect(response.body).toHaveProperty('status');
    });
  });

  describe('API Authentication', () => {
    it('should reject requests without API key', async () => {
      const response = await request(app)
        .post('/api/search')
        .send({ query: 'test' });
      
      expect(response.status).toBe(401);
      expect(response.body).toHaveProperty('error', 'API key required');
    });

    it('should reject requests with invalid API key', async () => {
      const response = await request(app)
        .post('/api/search')
        .set('x-api-key', 'invalid')
        .send({ query: 'test' });
      
      expect(response.status).toBe(401);
      expect(response.body).toHaveProperty('error', 'Invalid API key');
    });

    it('should accept requests with valid API key', async () => {
      const response = await request(app)
        .post('/api/search')
        .set('x-api-key', 'test-world-id-12345')
        .send({ query: 'test' });
      
      expect(response.status).toBe(200);
    });
  });

  describe('Search API', () => {
    it('should handle search requests', async () => {
      const response = await request(app)
        .post('/api/search')
        .set('x-api-key', 'test-world-id-12345')
        .send({ query: 'test', filter: 'Actor' });
      
      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('type', 'search-results');
      expect(response.body).toHaveProperty('results');
      expect(Array.isArray(response.body.results)).toBe(true);
    });

    it('should reject search without query', async () => {
      const response = await request(app)
        .post('/api/search')
        .set('x-api-key', 'test-world-id-12345')
        .send({});
      
      expect(response.status).toBe(400);
      expect(response.body).toHaveProperty('error', 'Query parameter is required');
    });
  });

  describe('Entity API', () => {
    it('should get entity by UUID', async () => {
      const response = await request(app)
        .get('/api/entity/Actor.test123')
        .set('x-api-key', 'test-world-id-12345');
      
      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('type', 'entity-data');
      expect(response.body).toHaveProperty('data');
    });

    it('should handle roll requests', async () => {
      const response = await request(app)
        .post('/api/roll')
        .set('x-api-key', 'test-world-id-12345')
        .send({ formula: '1d20+5' });
      
      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('type', 'roll-result');
      expect(response.body).toHaveProperty('result');
    });

    it('should get world structure', async () => {
      const response = await request(app)
        .get('/api/structure')
        .set('x-api-key', 'test-world-id-12345');
      
      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('type', 'structure-data');
      expect(response.body).toHaveProperty('structure');
    });
  });
});