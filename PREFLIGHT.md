# PATHMAP - Pre-Flight Checklist
================================

Use this checklist before running the system.

## Quick Start (Development)

```bash
# 1. Clone and enter directory
cd PATHMAP

# 2. Create environment file
cp .env.example .env

# 3. Start services with Docker
docker-compose up -d

# 4. Verify services are running
docker-compose ps

# 5. Check health
curl http://localhost:8000/v1/health
```

---

## Pre-Flight Checks

### 1. Environment Configuration

- [ ] Copy `.env.example` to `.env`
- [ ] Set `JWT_SECRET_KEY` (minimum 32 characters)
- [ ] Set `POSTGRES_PASSWORD` (strong password)
- [ ] Configure email settings if using notifications

### 2. Docker Requirements

- [ ] Docker Desktop installed and running
- [ ] Docker Compose v2+ installed
- [ ] At least 4GB RAM allocated to Docker
- [ ] Ports available: 5432 (Postgres), 6379 (Redis), 8000 (Backend), 3002 (Frontend)

### 3. Without Docker (Local Development)

```bash
# Backend
cd backend
python -m venv venv
source venv/bin/activate  # or venv\Scripts\activate on Windows
pip install -r requirements.txt
python -m uvicorn main:app --host 0.0.0.0 --port 8000

# Frontend (in another terminal)
cd frontend
npm install
npm run dev
```

### 4. Database Setup (without Docker)

If not using Docker, you need:
- PostgreSQL 15+ running on port 5432
- Redis 7+ running on port 6379
- Run `backend/database/init.sql` to create tables

---

## Service Verification

### Check All Services

```bash
# Docker
docker-compose ps

# Health endpoints
curl http://localhost:8000/v1/health
curl http://localhost:8000/api/v1/tunnel/stats
```

### Expected Output

```json
{
  "status": "healthy",
  "version": "97.0.0",
  "database": "connected",
  "redis": "connected"
}
```

---

## Common Issues

### Port Already in Use

```bash
# Windows
netstat -ano | findstr ":8000"
taskkill /PID <PID> /F

# Linux/Mac
lsof -i :8000
kill -9 <PID>
```

### Database Connection Failed

1. Check PostgreSQL is running
2. Verify DATABASE_URL in .env
3. Check postgres container logs: `docker logs pathmap-postgres`

### Redis Connection Failed

1. Check Redis is running
2. Verify REDIS_URL in .env
3. Check redis container logs: `docker logs pathmap-redis`

### Frontend Can't Connect to Backend

1. Check CORS settings in backend
2. Verify VITE_API_URL points to backend
3. Check browser console for errors

---

## Production Checklist

- [ ] Change all default passwords
- [ ] Set strong JWT_SECRET_KEY (256-bit random)
- [ ] Enable HTTPS/TLS
- [ ] Configure firewall rules
- [ ] Set up database backups
- [ ] Configure monitoring (Sentry)
- [ ] Review rate limiting settings
- [ ] Enable production logging
- [ ] Set ENVIRONMENT=production

---

## Test the System

```bash
# Run all tests
cd PATHMAP
python -m pytest tests/ -v

# Expected: 49 passed
```

---

## Architecture Overview

```
┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│   Frontend  │────▶│   Backend   │────▶│  PostgreSQL │
│   :3002     │     │   :8000     │     │   :5432     │
└─────────────┘     └──────┬──────┘     └─────────────┘
                          │
                          ▼
                   ┌─────────────┐
                   │    Redis    │
                   │   :6379     │
                   └─────────────┘
```

## Need Help?

- Check `buildlogs/` for implementation history
- See `README.md` for API documentation
- Review `docs/` for additional guides
