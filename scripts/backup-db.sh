#!/bin/bash

set -e

GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DB_DIR="${PROJECT_ROOT}/packages/server"
DB_FILE="test-results.db"
BACKUP_DIR="${PROJECT_ROOT}/backups"
TIMESTAMP=$(date +"%Y%m%d_%H%M%S")
BACKUP_FILE="${BACKUP_DIR}/test-results_${TIMESTAMP}.db"

KEEP_DAYS="${KEEP_DAYS:-7}"

echo "=================================="
echo "YShvydak Dashboard Database Backup"
echo "=================================="
echo ""

mkdir -p "${BACKUP_DIR}"

if [ ! -f "${DB_DIR}/${DB_FILE}" ]; then
    echo -e "${YELLOW}Warning: Database file not found at ${DB_DIR}/${DB_FILE}${NC}"
    echo "This might be the first run. Skipping backup."
    exit 0
fi

echo "Backing up database..."
echo "Source: ${DB_DIR}/${DB_FILE}"
echo "Destination: ${BACKUP_FILE}"
echo ""

cp "${DB_DIR}/${DB_FILE}" "${BACKUP_FILE}"

if [ $? -eq 0 ]; then
    echo -e "${GREEN}✓ Backup completed successfully!${NC}"
    echo ""

    DB_SIZE=$(du -h "${DB_DIR}/${DB_FILE}" | cut -f1)
    BACKUP_SIZE=$(du -h "${BACKUP_FILE}" | cut -f1)
    echo "Database size: ${DB_SIZE}"
    echo "Backup size: ${BACKUP_SIZE}"
    echo ""
else
    echo -e "${RED}✗ Backup failed!${NC}"
    exit 1
fi

echo "Cleaning up old backups (keeping last ${KEEP_DAYS} days)..."
find "${BACKUP_DIR}" -name "test-results_*.db" -type f -mtime +${KEEP_DAYS} -delete
REMAINING_BACKUPS=$(ls -1 "${BACKUP_DIR}"/test-results_*.db 2>/dev/null | wc -l)
echo -e "${GREEN}✓ Cleanup completed. ${REMAINING_BACKUPS} backup(s) remaining.${NC}"
echo ""

echo "Latest backups:"
ls -lht "${BACKUP_DIR}"/test-results_*.db 2>/dev/null | head -5 || echo "No backups found"
