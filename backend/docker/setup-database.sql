-- setup-database.sql
-- Initial PostgreSQL setup for Hospici
-- Runs on container initialization

-- Create extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Create application user (if different from postgres)
-- Note: The main user is created via docker-compose environment variables

-- Verify setup
SELECT 'PostgreSQL extensions loaded successfully' as status;
