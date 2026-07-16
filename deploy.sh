#!/bin/bash
# Local deployment script for Taipei Traffic Flood Watch on Cloudflare Pages

echo "=== Taipei Traffic Flood Watch: Cloudflare Deployment ==="
echo "This script will deploy the flood detector frontend and proxy function."
echo ""

# Navigate to the cloudflare-deploy directory
cd "$(dirname "$0")/cloudflare-deploy"

# Deploy using Wrangler Pages
echo "Executing wrangler pages deploy..."
npx wrangler pages deploy public

echo ""
echo "Deployment process finished!"
