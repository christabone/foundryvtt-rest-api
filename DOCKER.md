# Docker Deployment Guide

This guide covers the complete Docker containerization solution for the FoundryVTT Local Relay Server.

## Quick Start

### Prerequisites
- Docker Engine 20.10+
- Docker Compose v2.0+
- 512MB RAM minimum
- 1GB disk space

### 1. Clone and Setup
```bash
git clone <repository>
cd foundryvtt-rest-api

# Copy environment file
cp .env.example .env
# Edit .env with your configuration
```

### 2. Deploy with Docker Compose
```bash
# Production deployment
docker-compose up -d

# Development deployment
docker-compose -f docker-compose.dev.yml up -d
```

### 3. Verify Deployment
```bash
# Check health
curl http://localhost:3001/health

# Check logs
docker-compose logs foundry-relay
```

## Detailed Configuration

### Environment Variables

Copy `.env.example` to `.env` and configure:

```env
# Server Configuration
NODE_ENV=production
PORT=3001
LOG_LEVEL=info

# Security (Generate secure keys!)
API_KEY_1=your-secure-api-key-here

# WebSocket Configuration
WS_HEARTBEAT_INTERVAL=30000
WS_REQUEST_TIMEOUT=10000

# Foundry Integration
FOUNDRY_HOST=localhost
FOUNDRY_PORT=30000
```

### Docker Compose Configurations

#### Production (`docker-compose.yml`)
- Optimized production image
- Health checks enabled
- Persistent volumes
- Automatic restart

#### Development (`docker-compose.dev.yml`)  
- Live code reloading
- Debug port exposed
- Development logging
- Volume mounts for source code

## Deployment Options

### Option 1: Docker Compose (Recommended)
```bash
# Production
docker-compose up -d

# Development
docker-compose -f docker-compose.dev.yml up -d

# Custom environment
docker-compose --env-file .env.custom up -d
```

### Option 2: Manual Docker Run
```bash
# Build image
docker build -t foundry-relay-server .

# Run container
docker run -d \
  --name foundry-relay \
  -p 3001:3001 \
  -v $(pwd)/data:/app/server/data \
  -v $(pwd)/logs:/app/logs \
  --env-file .env \
  foundry-relay-server
```

### Option 3: Using Build Scripts
```bash
# Build image with testing
./scripts/build.sh latest Dockerfile . --test

# Deploy with custom configuration
./scripts/deploy.sh docker-compose.yml .env.production deploy
```

## Persistent Data

### Volume Mounts
- `/app/server/data` - API keys and persistent data
- `/app/logs` - Application logs

### Data Backup
```bash
# Backup data directory
docker cp foundry-relay:/app/server/data ./backup-data/

# Backup with timestamp
tar -czf "backup-$(date +%Y%m%d-%H%M%S).tar.gz" data/ logs/
```

### Data Restore
```bash
# Stop container
docker-compose down

# Restore data
cp -r ./backup-data/* ./data/

# Restart
docker-compose up -d
```

## Security Configuration

### API Keys
1. Generate secure API keys:
```bash
# Generate random key
openssl rand -hex 32

# Or use Node.js
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

2. Add to `.env`:
```env
API_KEY_1=your-generated-key-here
API_KEY_2=another-key-for-different-client
```

### Network Security
```yaml
# In docker-compose.yml
networks:
  foundry-network:
    driver: bridge
    ipam:
      config:
        - subnet: 172.20.0.0/16
```

### Container Security
- Runs as non-root user (foundry:1001)
- Minimal Alpine Linux base image
- Regular security updates
- Limited file permissions

## Monitoring and Health Checks

### Built-in Health Checks
```bash
# Manual health check
curl http://localhost:3001/health

# Docker health check status
docker inspect foundry-relay --format='{{.State.Health.Status}}'

# Using health check script
./scripts/health-check.sh
```

### Log Monitoring
```bash
# View live logs
docker-compose logs -f foundry-relay

# View specific number of lines
docker-compose logs --tail 100 foundry-relay

# Search logs
docker-compose logs foundry-relay | grep ERROR
```

### Resource Monitoring
```bash
# Container stats
docker stats foundry-relay

# Detailed resource usage
docker exec foundry-relay ps aux
docker exec foundry-relay df -h
```

## Troubleshooting

### Common Issues

#### Container Won't Start
```bash
# Check logs
docker-compose logs foundry-relay

# Common causes:
# - Port 3001 already in use
# - Invalid environment variables
# - Missing .env file
# - Insufficient permissions on data directory
```

#### Health Check Failing
```bash
# Check if server is responding
docker exec foundry-relay curl http://localhost:3001/health

# Check if port is accessible
netstat -tlnp | grep 3001

# Restart container
docker-compose restart foundry-relay
```

#### Permission Issues
```bash
# Fix data directory permissions
sudo chown -R 1001:1001 data/ logs/
sudo chmod 750 data/ logs/
```

#### Memory Issues
```bash
# Check memory usage
docker stats foundry-relay

# Increase memory limit in docker-compose.yml
services:
  foundry-relay:
    deploy:
      resources:
        limits:
          memory: 512M
```

### Debug Mode

Enable debug logging:
```env
# In .env
NODE_ENV=development
LOG_LEVEL=debug
DEBUG_MODE=true
```

Run with debug output:
```bash
docker-compose -f docker-compose.dev.yml up
```

## Advanced Configuration

### Reverse Proxy Setup (Nginx)
```nginx
server {
    listen 80;
    server_name your-domain.com;
    
    location / {
        proxy_pass http://localhost:3001;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

### SSL/TLS Configuration
```yaml
# docker-compose.yml with SSL
services:
  foundry-relay:
    environment:
      - HTTPS_ENABLED=true
      - SSL_CERT_PATH=/app/certs/cert.pem
      - SSL_KEY_PATH=/app/certs/key.pem
    volumes:
      - ./certs:/app/certs:ro
```

### Multi-Instance Deployment
```yaml
# docker-compose.yml for multiple instances
services:
  foundry-relay-1:
    # ... configuration
    ports:
      - "3001:3001"
  
  foundry-relay-2:
    # ... configuration  
    ports:
      - "3002:3001"
```

## CI/CD Integration

### GitHub Actions
The repository includes `.github/workflows/docker-build.yml` for automated:
- Building Docker images
- Running tests
- Security scanning
- Publishing to container registry

### Manual CI/CD Setup
```bash
# Build and test
./scripts/build.sh latest Dockerfile . --test

# Deploy to staging
./scripts/deploy.sh docker-compose.staging.yml .env.staging deploy

# Deploy to production
./scripts/deploy.sh docker-compose.yml .env.production deploy
```

## Performance Tuning

### Container Resources
```yaml
# docker-compose.yml
services:
  foundry-relay:
    deploy:
      resources:
        limits:
          cpus: '1.0'
          memory: 512M
        reservations:
          cpus: '0.5'
          memory: 256M
```

### Node.js Performance
```env
# In .env
NODE_OPTIONS=--max-old-space-size=512
UV_THREADPOOL_SIZE=4
```

## Maintenance

### Regular Tasks
```bash
# Update base images
docker-compose pull
docker-compose up -d

# Clean up unused images
docker image prune

# Backup configuration
tar -czf "config-backup-$(date +%Y%m%d).tar.gz" .env docker-compose.yml

# Rotate logs
docker-compose exec foundry-relay logrotate /etc/logrotate.conf
```

### Updating the Application
```bash
# Pull latest code
git pull origin main

# Rebuild and deploy
docker-compose up -d --build

# Verify deployment
curl http://localhost:3001/health
```

## Support

### Getting Help
1. Check the troubleshooting section above
2. Review container logs: `docker-compose logs foundry-relay`
3. Check GitHub issues
4. Run health check script: `./scripts/health-check.sh`

### Reporting Issues
Include the following information:
- Docker version: `docker --version`
- Docker Compose version: `docker-compose --version`
- Container logs: `docker-compose logs foundry-relay`
- Configuration (sanitized .env file)
- Steps to reproduce the issue