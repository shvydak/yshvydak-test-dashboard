#!/bin/bash

##############################################################################
# YShvydak Test Dashboard - Test Execution Trigger (Bash Wrapper)
#
# This is a convenience wrapper around trigger-test-run.js that provides
# a simpler command-line interface.
#
# Usage:
#   ./scripts/trigger-test-run.sh [options]
#
# Options:
#   -w, --workers <number>  Maximum number of parallel workers
#   --wait                  Wait for test completion
#   -t, --timeout <seconds> Maximum wait time (default: 600)
#   -s, --silent            Silent mode (JSON output only)
#   -h, --help              Show help message
#
# Examples:
#   ./scripts/trigger-test-run.sh --wait
#   ./scripts/trigger-test-run.sh -w 2 --wait
#   ./scripts/trigger-test-run.sh --wait --silent
##############################################################################

# Get script directory
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Check if Node.js is installed
if ! command -v node &> /dev/null; then
    echo -e "${RED}❌ Error: Node.js is not installed${NC}"
    echo "Please install Node.js 18+ from https://nodejs.org/"
    exit 2
fi

# Check Node.js version
NODE_VERSION=$(node -v | cut -d'v' -f2 | cut -d'.' -f1)
if [ "$NODE_VERSION" -lt 18 ]; then
    echo -e "${YELLOW}⚠️  Warning: Node.js version $NODE_VERSION detected. Recommended: 18+${NC}"
fi

# Parse arguments and pass to Node.js script
NODE_ARGS=()

while [[ $# -gt 0 ]]; do
    case $1 in
        -w|--workers)
            NODE_ARGS+=("--max-workers" "$2")
            shift 2
            ;;
        --wait)
            NODE_ARGS+=("--wait")
            shift
            ;;
        -t|--timeout)
            NODE_ARGS+=("--timeout" "$2")
            shift 2
            ;;
        -s|--silent)
            NODE_ARGS+=("--silent")
            shift
            ;;
        -h|--help)
            NODE_ARGS+=("--help")
            shift
            ;;
        *)
            echo -e "${RED}❌ Unknown option: $1${NC}"
            echo "Use --help to see available options"
            exit 2
            ;;
    esac
done

# Run the Node.js script
cd "$PROJECT_ROOT" || exit 2
exec node "$SCRIPT_DIR/trigger-test-run.js" "${NODE_ARGS[@]}"
