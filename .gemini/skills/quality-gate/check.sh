#!/bin/bash
set -e

echo "🚧 Starting Quality Gate Checks..."

echo "1️⃣  Formatting (Prettier)..."
npm run format

echo "2️⃣  Type Checking (TypeScript)..."
npm run type-check

echo "3️⃣  Linting (ESLint)..."
npm run lint:fix

echo "4️⃣  Building (Verification)..."
npm run build

echo "✅ Quality Gate Passed! Ready for testing."
