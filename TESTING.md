# Testing Guide

This document describes the comprehensive testing suite for the FoundryVTT Local Relay Server.

## Overview

The testing suite includes multiple layers of testing to ensure reliability, performance, and correctness:

1. **Unit Tests** - Individual component testing
2. **Health Tests** - Server startup and health endpoint testing  
3. **API Tests** - REST API endpoint testing
4. **Integration Tests** - Full end-to-end testing
5. **Performance Tests** - Load and stress testing
6. **Smoke Tests** - Quick validation tests

## Quick Start

### Prerequisites

- Node.js 18+
- npm or yarn
- curl (for integration tests)
- bc (for performance calculations)

### Running Tests

```bash
# Install dependencies
npm ci

# Run all tests
npm run test:all

# Run specific test types
npm run test:unit           # Unit tests only
npm run test:integration    # Jest integration tests
npm run test:smoke          # Quick smoke tests
npm run test:performance    # Performance tests
npm run test:coverage       # Tests with coverage

# Run comprehensive integration suite
npm run test:integration-full
```

## Test Scripts

### 1. Unit Tests (`npm run test:unit`)

Tests individual components in isolation:
- **ApiKeyManager** - API key generation, validation, and management
- **WebSocketHandler** - WebSocket connection management and message handling
- **Server Health** - Express app configuration and middleware

**Location**: `server/tests/unit/`

**Features**:
- Fast execution (no server startup required)
- Mocked dependencies
- High code coverage
- Validates component logic

### 2. Health Tests (`server/tests/health/`)

Tests server health and basic functionality:
- Server instance creation
- Health endpoint responses
- API documentation endpoint
- CORS configuration
- Basic middleware functionality

**Features**:
- Tests Express app without starting server
- Validates health check structure
- Tests authentication middleware
- Verifies routing configuration

### 3. API Endpoint Tests (`server/tests/api/`)

Comprehensive REST API testing:
- Authentication middleware
- All REST endpoints
- Request/response validation
- Error handling
- HTTP method validation

**Test Files**:
- `restApiEndpoints.test.ts` - Main API tests
- `restApiWithMockWS.test.ts` - Tests with WebSocket mocking
- `restApiIntegration.test.ts` - Full integration with mock client

### 4. Smoke Tests (`npm run test:smoke`)

Quick validation tests for running server:

```bash
npm run test:smoke
```

**Features**:
- Fast execution (< 30 seconds)
- Tests basic endpoints
- Validates authentication
- Checks expected error responses
- Perfect for CI/CD pipelines

**Usage**:
```bash
# Start server first
npm run server:start

# In another terminal
npm run test:smoke
```

### 5. Integration Tests (`npm run test:integration-full`)

Comprehensive end-to-end testing:

```bash
npm run test:integration-full
```

**Features**:
- Starts server automatically
- Tests complete workflows
- Performance monitoring
- Memory leak detection
- Generates detailed reports

**Includes**:
- Server startup validation
- Health check testing
- API endpoint testing
- Unit test execution
- Performance analysis
- Memory usage monitoring

### 6. Performance Tests (`npm run test:performance`)

Load and performance testing:

```bash
# Start server first
npm run server:start

# Run performance tests
npm run test:performance
```

**Features**:
- Response time measurement
- Concurrent user simulation
- Memory usage monitoring
- Performance threshold validation
- Detailed performance reports

**Metrics**:
- Average response time
- P50/P95 percentiles
- Requests per second
- Memory usage patterns
- Success/failure rates

### 7. Comprehensive Test Runner (`npm run test:all`)

Orchestrates all test types:

```bash
# Run all tests
npm run test:all

# Run with options
npm run test:all -- --unit-only
npm run test:all -- --integration-only
npm run test:all -- --performance-only
npm run test:all -- --coverage
npm run test:all -- --docker
npm run test:all -- --help
```

**Options**:
- `--unit-only` - Run only unit tests
- `--integration-only` - Run only integration tests
- `--performance-only` - Run only performance tests
- `--coverage` - Generate coverage reports
- `--docker` - Run tests in Docker container
- `--clean` - Clean artifacts before running
- `--verbose` - Enable verbose output

## Test Reports

All tests generate detailed reports in the `test-reports/` directory:

### Report Types

1. **Test Logs** - Detailed execution logs
2. **Coverage Reports** - Code coverage analysis
3. **Performance Reports** - JSON format performance metrics
4. **Integration Reports** - Comprehensive test results
5. **HTML Reports** - Visual test summaries

### Report Files

```
test-reports/
├── unit-tests.log                    # Unit test output
├── integration-tests.log             # Integration test output
├── performance-tests.log             # Performance test output
├── integration-test-report-*.txt     # Integration summary
├── performance-report-*.json         # Performance metrics
├── comprehensive-test-report-*.html  # Visual summary
└── test-summary.json                 # Machine-readable summary
```

## Docker Testing

Run tests in Docker container:

```bash
npm run test:all -- --docker
```

This will:
1. Build Docker image
2. Run tests in container
3. Copy reports to host
4. Validate containerized environment

## Continuous Integration

### GitHub Actions

The repository includes GitHub Actions workflow (`.github/workflows/docker-build.yml`) that:
- Runs tests on pull requests
- Builds Docker images
- Performs security scanning
- Generates test reports

### Local CI Simulation

```bash
# Simulate CI environment
npm run test:all -- --clean --coverage
```

## Performance Thresholds

The test suite includes performance validation:

### Response Time Thresholds
- **Excellent**: < 100ms average
- **Good**: < 250ms average  
- **Acceptable**: < 500ms average
- **Needs Improvement**: > 500ms average

### Memory Usage Thresholds
- **Excellent**: < 20% increase during load
- **Good**: < 50% increase during load
- **Needs Attention**: > 50% increase during load

### Success Rate Thresholds
- **Target**: > 99% success rate
- **Acceptable**: > 95% success rate
- **Poor**: < 95% success rate

## Troubleshooting

### Common Issues

#### Port Already in Use
```bash
# Find process using port 3001
lsof -ti:3001

# Kill process
lsof -ti:3001 | xargs kill -9
```

#### Server Won't Start
```bash
# Check logs
npm run server:start

# Check dependencies
npm ci

# Clean and rebuild
npm run server:clean && npm run server:build
```

#### Tests Timeout
```bash
# Increase timeout in jest.config.js
testTimeout: 30000

# Or run with longer timeout
jest --testTimeout=30000
```

#### Permission Denied on Scripts
```bash
# Make scripts executable
chmod +x scripts/*.sh
```

### Debug Mode

Enable debug output:

```bash
# Verbose test output
npm run test:all -- --verbose

# Debug specific test
DEBUG=* npm run test:unit
```

## Best Practices

### Writing Tests

1. **Use descriptive test names**
2. **Test one thing per test**
3. **Use proper setup/teardown**
4. **Mock external dependencies**
5. **Validate both success and error cases**

### Running Tests

1. **Run tests before commits**
2. **Use smoke tests for quick validation**
3. **Run full suite before releases**
4. **Monitor performance trends**
5. **Keep test environment clean**

### Test Data

1. **Use predictable test data**
2. **Clean up after tests**
3. **Avoid shared test state**
4. **Use unique identifiers**
5. **Mock external services**

## Contributing

When contributing new features:

1. **Add unit tests** for new components
2. **Update integration tests** for new endpoints
3. **Add performance tests** for new features
4. **Update this documentation**
5. **Ensure all tests pass**

### Test Coverage Goals

- **Unit Tests**: > 80% coverage
- **Integration Tests**: All endpoints covered
- **Performance Tests**: All critical paths tested
- **Error Handling**: All error conditions tested

## Advanced Testing

### Load Testing

For extended load testing:

```bash
# Extended performance test
CONCURRENT_USERS=50 REQUESTS_PER_USER=100 npm run test:performance
```

### Memory Profiling

For memory leak detection:

```bash
# Monitor memory during tests
node --inspect server/dist/server.js
```

### Security Testing

The test suite includes basic security validation:
- Authentication testing
- Authorization checks
- Input validation
- CORS configuration
- Error message sanitization

For comprehensive security testing, consider using additional tools like:
- `npm audit`
- OWASP ZAP
- Snyk

## References

- [Jest Documentation](https://jestjs.io/docs/getting-started)
- [Supertest Documentation](https://github.com/visionmedia/supertest)
- [Node.js Testing Best Practices](https://github.com/goldbergyoni/nodejs-best-practices#-testing)
- [Docker Testing Guide](https://docs.docker.com/build/guide/)