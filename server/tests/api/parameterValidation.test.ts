import { describe, it, expect, beforeAll, beforeEach, afterEach, jest } from '@jest/globals';
import request from 'supertest';
import { FoundryRelayServer } from '../../src/server';

describe('Parameter Validation Tests (With Mock WebSocket)', () => {
  let server: FoundryRelayServer;
  let app: any;
  let originalWebSocketHandler: any;
  
  const validApiKey = 'test-world-id-12345';

  beforeAll(() => {
    server = new FoundryRelayServer();
    app = server.getApp();
    
    // Store original WebSocket handler
    originalWebSocketHandler = (server as any).webSocketHandler;
  });

  beforeEach(() => {
    // Mock WebSocket handler to bypass connection check
    const mockWebSocketHandler = {
      getConnectedClients: jest.fn().mockReturnValue(['mock-client-1']),
      sendMessageToFoundry: jest.fn().mockImplementation(() => {
        throw new Error('Mock WebSocket error');
      })
    };
    
    // Temporarily replace WebSocket handler for parameter validation tests
    (server as any).webSocketHandler = mockWebSocketHandler;
  });

  afterEach(() => {
    // Restore original WebSocket handler
    (server as any).webSocketHandler = originalWebSocketHandler;
  });

  describe('Search Parameter Validation', () => {
    it('should require query parameter', async () => {
      const response = await request(app)
        .post('/api/search')
        .set('x-api-key', validApiKey)
        .send({});
      
      expect(response.status).toBe(400);
      expect(response.body).toHaveProperty('error', 'Query parameter is required');
    });

    it('should reject empty query string', async () => {
      const response = await request(app)
        .post('/api/search')
        .set('x-api-key', validApiKey)
        .send({ query: '' });
      
      expect(response.status).toBe(400);
      expect(response.body).toHaveProperty('error', 'Query parameter is required');
    });

    it('should accept valid query with filter', async () => {
      const response = await request(app)
        .post('/api/search')
        .set('x-api-key', validApiKey)
        .send({ query: 'test', filter: 'Actor' });
      
      // Should reach WebSocket handler and get mocked error (500)
      expect(response.status).toBe(500);
    });
  });

  describe('Entity Creation Parameter Validation', () => {
    it('should require type and data parameters', async () => {
      const response = await request(app)
        .post('/api/entity')
        .set('x-api-key', validApiKey)
        .send({});
      
      expect(response.status).toBe(400);
      expect(response.body).toHaveProperty('error', 'Type and data parameters are required');
    });

    it('should require type parameter', async () => {
      const response = await request(app)
        .post('/api/entity')
        .set('x-api-key', validApiKey)
        .send({ data: { name: 'Test' } });
      
      expect(response.status).toBe(400);
      expect(response.body).toHaveProperty('error', 'Type and data parameters are required');
    });

    it('should require data parameter', async () => {
      const response = await request(app)
        .post('/api/entity')
        .set('x-api-key', validApiKey)
        .send({ type: 'Actor' });
      
      expect(response.status).toBe(400);
      expect(response.body).toHaveProperty('error', 'Type and data parameters are required');
    });

    it('should accept valid entity creation data', async () => {
      const response = await request(app)
        .post('/api/entity')
        .set('x-api-key', validApiKey)
        .send({ 
          type: 'Actor', 
          data: { name: 'Test Actor' } 
        });
      
      // Should reach WebSocket handler and get mocked error (500)
      expect(response.status).toBe(500);
    });
  });

  describe('Entity Update Parameter Validation', () => {
    it('should require data parameter', async () => {
      const response = await request(app)
        .put('/api/entity/Actor.test123')
        .set('x-api-key', validApiKey)
        .send({});
      
      expect(response.status).toBe(400);
      expect(response.body).toHaveProperty('error', 'Data parameter is required');
    });

    it('should accept valid update data', async () => {
      const response = await request(app)
        .put('/api/entity/Actor.test123')
        .set('x-api-key', validApiKey)
        .send({ data: { name: 'Updated Actor' } });
      
      // Should reach WebSocket handler and get mocked error (500)
      expect(response.status).toBe(500);
    });
  });

  describe('Roll Parameter Validation', () => {
    it('should require formula parameter', async () => {
      const response = await request(app)
        .post('/api/roll')
        .set('x-api-key', validApiKey)
        .send({});
      
      expect(response.status).toBe(400);
      expect(response.body).toHaveProperty('error', 'Formula parameter is required');
    });

    it('should reject empty formula', async () => {
      const response = await request(app)
        .post('/api/roll')
        .set('x-api-key', validApiKey)
        .send({ formula: '' });
      
      expect(response.status).toBe(400);
      expect(response.body).toHaveProperty('error', 'Formula parameter is required');
    });

    it('should accept valid roll formula', async () => {
      const response = await request(app)
        .post('/api/roll')
        .set('x-api-key', validApiKey)
        .send({ formula: '1d20+5' });
      
      // Should reach WebSocket handler and get mocked error (500)
      expect(response.status).toBe(500);
    });
  });

  describe('Code Execution Parameter Validation', () => {
    it('should require code parameter', async () => {
      const response = await request(app)
        .post('/api/execute')
        .set('x-api-key', validApiKey)
        .send({});
      
      expect(response.status).toBe(400);
      expect(response.body).toHaveProperty('error', 'Code parameter is required');
    });

    it('should reject empty code', async () => {
      const response = await request(app)
        .post('/api/execute')
        .set('x-api-key', validApiKey)
        .send({ code: '' });
      
      expect(response.status).toBe(400);
      expect(response.body).toHaveProperty('error', 'Code parameter is required');
    });

    it('should accept valid JavaScript code', async () => {
      const response = await request(app)
        .post('/api/execute')
        .set('x-api-key', validApiKey)
        .send({ code: 'console.log("test");' });
      
      // Should reach WebSocket handler and get mocked error (500)
      expect(response.status).toBe(500);
    });
  });

  describe('Parameter Type Validation', () => {
    it('should handle null parameters', async () => {
      const response = await request(app)
        .post('/api/entity')
        .set('x-api-key', validApiKey)
        .send({ type: null, data: null });
      
      expect(response.status).toBe(400);
      expect(response.body).toHaveProperty('error', 'Type and data parameters are required');
    });

    it('should handle undefined parameters', async () => {
      const response = await request(app)
        .post('/api/roll')
        .set('x-api-key', validApiKey)
        .send({ formula: undefined });
      
      expect(response.status).toBe(400);
      expect(response.body).toHaveProperty('error', 'Formula parameter is required');
    });

    it('should handle numeric parameters as strings', async () => {
      const response = await request(app)
        .post('/api/search')
        .set('x-api-key', validApiKey)
        .send({ query: 123 });
      
      // Should accept numeric query and reach WebSocket handler
      expect(response.status).toBe(500);
    });

    it('should handle boolean parameters', async () => {
      const response = await request(app)
        .post('/api/search')
        .set('x-api-key', validApiKey)
        .send({ query: true });
      
      // Should accept boolean query and reach WebSocket handler
      expect(response.status).toBe(500);
    });
  });

  describe('Complex Parameter Validation', () => {
    it('should handle deeply nested objects', async () => {
      const complexData = {
        type: 'Actor',
        data: {
          name: 'Complex Actor',
          nested: {
            level1: {
              level2: {
                value: 'deep'
              }
            }
          },
          array: [1, 2, { nested: 'array' }]
        }
      };

      const response = await request(app)
        .post('/api/entity')
        .set('x-api-key', validApiKey)
        .send(complexData);
      
      // Should accept complex data and reach WebSocket handler
      expect(response.status).toBe(500);
    });

    it('should handle large parameter values', async () => {
      const largeQuery = 'a'.repeat(1000);
      
      const response = await request(app)
        .post('/api/search')
        .set('x-api-key', validApiKey)
        .send({ query: largeQuery });
      
      // Should accept large query and reach WebSocket handler
      expect(response.status).toBe(500);
    });

    it('should handle special characters in parameters', async () => {
      const specialQuery = 'test"\'<>&\n\t';
      
      const response = await request(app)
        .post('/api/search')
        .set('x-api-key', validApiKey)
        .send({ query: specialQuery });
      
      // Should accept special characters and reach WebSocket handler
      expect(response.status).toBe(500);
    });
  });
});