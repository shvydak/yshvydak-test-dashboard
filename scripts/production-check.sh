#!/bin/bash

set -e

GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m'

BASE_URL="${BASE_URL:-http://localhost:3001}"

echo "=================================="
echo "YShvydak Dashboard Health Check"
echo "=================================="
echo ""

check_endpoint() {
    local endpoint=$1
    local description=$2

    echo -n "Checking ${description}... "

    if curl -sf "${BASE_URL}${endpoint}" > /dev/null; then
        echo -e "${GREEN}✓ OK${NC}"
        return 0
    else
        echo -e "${RED}✗ FAILED${NC}"
        return 1
    fi
}

check_pm2_status() {
    echo -n "Checking PM2 processes... "

    if pm2 list | grep -q "online"; then
        echo -e "${GREEN}✓ Running${NC}"
        return 0
    else
        echo -e "${RED}✗ Not running${NC}"
        return 1
    fi
}

check_disk_space() {
    echo -n "Checking disk space... "

    local disk_usage=$(df -h . | tail -1 | awk '{print $5}' | sed 's/%//')

    if [ "$disk_usage" -lt 80 ]; then
        echo -e "${GREEN}✓ ${disk_usage}% used${NC}"
        return 0
    elif [ "$disk_usage" -lt 90 ]; then
        echo -e "${YELLOW}⚠ ${disk_usage}% used${NC}"
        return 0
    else
        echo -e "${RED}✗ ${disk_usage}% used (Critical!)${NC}"
        return 1
    fi
}

check_memory() {
    echo -n "Checking memory usage... "

    if [[ "$OSTYPE" == "darwin"* ]]; then
        echo -e "${YELLOW}⚠ Skipped on macOS (Linux only)${NC}"
        return 0
    fi

    if ! command -v free &> /dev/null; then
        echo -e "${YELLOW}⚠ Command 'free' not found${NC}"
        return 0
    fi

    local mem_usage=$(free | grep Mem | awk '{printf("%.0f", $3/$2 * 100.0)}')

    if [ -z "$mem_usage" ]; then
        echo -e "${YELLOW}⚠ Cannot determine${NC}"
        return 0
    fi

    if [ "$mem_usage" -lt 80 ]; then
        echo -e "${GREEN}✓ ${mem_usage}% used${NC}"
        return 0
    elif [ "$mem_usage" -lt 90 ]; then
        echo -e "${YELLOW}⚠ ${mem_usage}% used${NC}"
        return 0
    else
        echo -e "${RED}✗ ${mem_usage}% used (Critical!)${NC}"
        return 1
    fi
}

FAILURES=0

check_pm2_status || ((FAILURES++))
echo ""

echo "API Endpoints:"
check_endpoint "/api/health" "API Health" || ((FAILURES++))
check_endpoint "/api/tests/diagnostics" "Diagnostics" || ((FAILURES++))
echo ""

echo "System Resources:"
check_disk_space || ((FAILURES++))
check_memory || ((FAILURES++))
echo ""

if [ $FAILURES -eq 0 ]; then
    echo -e "${GREEN}All checks passed! ✓${NC}"
    exit 0
else
    echo -e "${RED}${FAILURES} check(s) failed! ✗${NC}"
    exit 1
fi
