import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import request from 'supertest';
import { FoundryRelayServer } from '../../src/server';
import { MockFoundryClient } from '../utils/mockFoundryClient';

describe('REST API Integration Tests with Mock FoundryVTT', () => {
  let server: FoundryRelayServer;
  let mockClient: MockFoundryClient;
  let app: any;
  
  const validApiKey = 'test-world-id-12345';

  beforeAll(async () => {
    // Start the actual server for integration testing
    server = new FoundryRelayServer();
    await server.start();
    app = server.getApp();
    
    // Connect mock FoundryVTT client
    mockClient = new MockFoundryClient();
    await mockClient.connect();
    
    // Wait for connection to establish
    await new Promise(resolve => setTimeout(resolve, 1000));
  }, 30000);

  afterAll(async () => {
    if (mockClient) {
      mockClient.disconnect();
    }
    if (server) {
      await server.stop();
    }
  });

  describe('API Status with Connected Client', () => {
    it('should show connected status when client is connected', async () => {
      const response = await request(app).get('/api/status');
      
      expect(response.status).toBe(200);
      expect(response.body.connectedClients).toBeGreaterThan(0);
      expect(response.body.status).toBe('connected');
      expect(Array.isArray(response.body.clients)).toBe(true);
    });
  });

  describe('Search API with Real WebSocket Connection', () => {
    it('should return actual search results', async () => {
      const response = await request(app)
        .post('/api/search')
        .set('x-api-key', validApiKey)
        .send({ query: 'test', filter: 'Actor' });
      
      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('type', 'search-results');
      expect(response.body).toHaveProperty('results');
      expect(Array.isArray(response.body.results)).toBe(true);
    });

    it('should handle search without filter', async () => {
      const response = await request(app)
        .post('/api/search')
        .set('x-api-key', validApiKey)
        .send({ query: 'weapon' });
      
      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('type', 'search-results');
    });

    it('should return empty results for non-existent items', async () => {
      const response = await request(app)
        .post('/api/search')
        .set('x-api-key', validApiKey)
        .send({ query: 'non-existent-item-xyz123' });
      
      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('results');
      expect(response.body.results).toHaveLength(0);
    });
  });

  describe('Entity API with Real WebSocket Connection', () => {
    it('should get entity data', async () => {
      const response = await request(app)
        .get('/api/entity/Actor.test123')
        .set('x-api-key', validApiKey);
      
      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('type', 'entity-data');
      expect(response.body).toHaveProperty('data');
    });

    it('should handle non-existent entity', async () => {
      const response = await request(app)
        .get('/api/entity/Actor.nonexistent')
        .set('x-api-key', validApiKey);
      
      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('type', 'entity-data');
      expect(response.body.data).toBeNull();
    });
  });

  describe('Roll API with Real WebSocket Connection', () => {
    it('should perform dice rolls', async () => {
      const response = await request(app)
        .post('/api/roll')
        .set('x-api-key', validApiKey)
        .send({ formula: '1d20+5' });
      
      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('type', 'roll-result');
      expect(response.body).toHaveProperty('result');
      expect(response.body.result).toHaveProperty('total');
      expect(response.body.result).toHaveProperty('formula', '1d20+5');
    });

    it('should handle complex dice formulas', async () => {
      const response = await request(app)
        .post('/api/roll')
        .set('x-api-key', validApiKey)
        .send({ formula: '2d6+3' });
      
      expect(response.status).toBe(200);
      expect(response.body.result.total).toBeGreaterThanOrEqual(5);
      expect(response.body.result.total).toBeLessThanOrEqual(15);
    });

    it('should get recent rolls', async () => {
      // First perform a roll
      await request(app)
        .post('/api/roll')
        .set('x-api-key', validApiKey)
        .send({ formula: '1d6' });
      
      // Then get rolls
      const response = await request(app)
        .get('/api/rolls')
        .set('x-api-key', validApiKey);
      
      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('type', 'rolls-data');
      expect(response.body).toHaveProperty('rolls');
      expect(Array.isArray(response.body.rolls)).toBe(true);
    });
  });

  describe('Structure and Contents API', () => {
    it('should get world structure', async () => {
      const response = await request(app)
        .get('/api/structure')
        .set('x-api-key', validApiKey);
      
      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('type', 'structure-data');
      expect(response.body).toHaveProperty('structure');
    });

    it('should get contents', async () => {
      const response = await request(app)
        .get('/api/contents')
        .set('x-api-key', validApiKey);
      
      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('type', 'contents-data');
      expect(response.body).toHaveProperty('contents');
    });

    it('should get contents with path', async () => {
      const response = await request(app)
        .get('/api/contents?path=/actors')
        .set('x-api-key', validApiKey);
      
      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('type', 'contents-data');
    });
  });

  describe('Selection API', () => {
    it('should get selected entities', async () => {
      const response = await request(app)
        .get('/api/selected')
        .set('x-api-key', validApiKey);
      
      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('type', 'selected-entities');
      expect(response.body).toHaveProperty('entities');
      expect(Array.isArray(response.body.entities)).toBe(true);
    });

    it('should select entities', async () => {
      const response = await request(app)
        .post('/api/select')
        .set('x-api-key', validApiKey)
        .send({ criteria: { type: 'Actor' } });
      
      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('type', 'selection-result');
    });
  });

  describe('Code Execution API', () => {
    it('should execute JavaScript code', async () => {
      const response = await request(app)
        .post('/api/execute')
        .set('x-api-key', validApiKey)
        .send({ code: 'console.log("Hello from API test");' });
      
      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('type', 'execution-result');
    });

    it('should handle code with return value', async () => {
      const response = await request(app)
        .post('/api/execute')
        .set('x-api-key', validApiKey)
        .send({ code: '1 + 1' });
      
      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('type', 'execution-result');
    });
  });

  describe('Macro Execution API', () => {
    it('should execute macro', async () => {
      const response = await request(app)
        .post('/api/macro/Macro.test123')
        .set('x-api-key', validApiKey)
        .send({});
      
      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('type', 'macro-result');
    });

    it('should execute macro with arguments', async () => {
      const response = await request(app)
        .post('/api/macro/Macro.test123')
        .set('x-api-key', validApiKey)
        .send({ args: ['test', 'args'] });
      
      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('type', 'macro-result');
    });
  });

  describe('Error Handling with Real Connection', () => {
    it('should handle invalid roll formulas', async () => {
      const response = await request(app)
        .post('/api/roll')
        .set('x-api-key', validApiKey)
        .send({ formula: 'invalid-formula' });
      
      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('type', 'roll-result');
      expect(response.body).toHaveProperty('error');
    });

    it('should handle invalid JavaScript code', async () => {
      const response = await request(app)
        .post('/api/execute')
        .set('x-api-key', validApiKey)
        .send({ code: 'invalid javascript syntax {' });
      
      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('type', 'execution-result');
      expect(response.body).toHaveProperty('error');
    });
  });

  describe('Performance and Stress Testing', () => {
    it('should handle rapid sequential requests', async () => {
      const promises = [];
      
      for (let i = 0; i < 10; i++) {
        promises.push(
          request(app)
            .post('/api/search')
            .set('x-api-key', validApiKey)
            .send({ query: `test-${i}` })
        );
      }
      
      const responses = await Promise.all(promises);
      
      responses.forEach(response => {
        expect(response.status).toBe(200);
        expect(response.body).toHaveProperty('type', 'search-results');
      });
    });

    it('should handle mixed API calls concurrently', async () => {
      const promises = [
        request(app).get('/api/status'),
        request(app).get('/api/structure').set('x-api-key', validApiKey),
        request(app).post('/api/roll').set('x-api-key', validApiKey).send({ formula: '1d20' }),
        request(app).get('/api/selected').set('x-api-key', validApiKey),
        request(app).post('/api/search').set('x-api-key', validApiKey).send({ query: 'test' })
      ];
      
      const responses = await Promise.all(promises);
      
      // All should succeed
      responses.forEach(response => {
        expect(response.status).toBe(200);
      });
    });
  });
});