#!/usr/bin/env bash
set -euo pipefail

# --- Userpulse: Deploy to AWS Lightsail ---
# Usage:
#   1. Create a Lightsail instance (Ubuntu 22.04, $10/mo 2GB RAM)
#   2. SSH in and run this script on the instance
#   3. Or run locally: ssh your-instance 'bash -s' < deploy.sh

echo "==> Installing Docker..."
if ! command -v docker &>/dev/null; then
  curl -fsSL https://get.docker.com | sh
  sudo usermod -aG docker "$USER"
  echo "Docker installed. Log out and back in, then re-run this script."
  exit 0
fi

echo "==> Installing Docker Compose plugin..."
if ! docker compose version &>/dev/null; then
  sudo apt-get update && sudo apt-get install -y docker-compose-plugin
fi

echo "==> Cloning/updating repository..."
REPO_DIR="$HOME/userpulse"
if [ -d "$REPO_DIR" ]; then
  cd "$REPO_DIR"
  git pull
else
  echo "Please clone your repository to $REPO_DIR first:"
  echo "  git clone <your-repo-url> $REPO_DIR"
  exit 1
fi

echo "==> Checking .env.prod..."
if [ ! -f .env.prod ]; then
  cp .env.prod.example .env.prod
  echo ""
  echo "Created .env.prod from example. Edit it with real values:"
  echo "  nano $REPO_DIR/.env.prod"
  echo ""
  echo "Then re-run this script."
  exit 1
fi

echo "==> Building and starting services..."
docker compose -f docker-compose.prod.yml --env-file .env.prod up -d --build

echo "==> Waiting for services..."
sleep 10

echo "==> Checking health..."
if curl -sf http://localhost/health > /dev/null 2>&1; then
  echo "API is healthy!"
else
  echo "API health check failed. Check logs with:"
  echo "  docker compose -f docker-compose.prod.yml logs api"
fi

echo ""
echo "==> Deployment complete!"
echo "    Web:  http://$(curl -s http://checkip.amazonaws.com 2>/dev/null || echo 'your-ip')"
echo "    Logs: docker compose -f docker-compose.prod.yml logs -f"
