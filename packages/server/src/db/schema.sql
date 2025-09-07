-- YShvydak Test Dashboard Database Schema
-- SQLite database for storing test runs, results, and attachments

-- Test runs (top-level execution sessions)
CREATE TABLE IF NOT EXISTS test_runs (
    id TEXT PRIMARY KEY,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    status TEXT CHECK(status IN ('running', 'completed', 'failed')) DEFAULT 'running',
    total_tests INTEGER DEFAULT 0,
    passed_tests INTEGER DEFAULT 0,
    failed_tests INTEGER DEFAULT 0,
    skipped_tests INTEGER DEFAULT 0,
    duration INTEGER DEFAULT 0, -- in milliseconds
    metadata TEXT -- JSON string for additional data
);

-- Individual test results
CREATE TABLE IF NOT EXISTS test_results (
    id TEXT PRIMARY KEY,
    run_id TEXT REFERENCES test_runs(id) ON DELETE CASCADE, -- NULL for discovered tests
    test_id TEXT NOT NULL, -- Stable test identifier (file + test name)
    name TEXT NOT NULL,
    file_path TEXT NOT NULL,
    status TEXT CHECK(status IN ('passed', 'failed', 'skipped', 'timeout', 'pending')) NOT NULL,
    duration INTEGER DEFAULT 0, -- in milliseconds
    error_message TEXT,
    error_stack TEXT,
    retry_count INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    metadata TEXT -- JSON string for test steps, annotations, etc.
);

-- Test attachments (videos, screenshots, traces)
CREATE TABLE IF NOT EXISTS attachments (
    id TEXT PRIMARY KEY,
    test_result_id TEXT NOT NULL REFERENCES test_results(id) ON DELETE CASCADE,
    type TEXT CHECK(type IN ('video', 'screenshot', 'trace', 'log')) NOT NULL,
    file_name TEXT NOT NULL,
    file_path TEXT NOT NULL,
    file_size INTEGER DEFAULT 0,
    mime_type TEXT,
    url TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Indexes for better performance
CREATE INDEX IF NOT EXISTS idx_test_runs_status ON test_runs(status);
CREATE INDEX IF NOT EXISTS idx_test_runs_created_at ON test_runs(created_at);

CREATE INDEX IF NOT EXISTS idx_test_results_run_id ON test_results(run_id);
CREATE INDEX IF NOT EXISTS idx_test_results_test_id ON test_results(test_id);
CREATE INDEX IF NOT EXISTS idx_test_results_status ON test_results(status);
CREATE INDEX IF NOT EXISTS idx_test_results_file_path ON test_results(file_path);

CREATE INDEX IF NOT EXISTS idx_attachments_test_result_id ON attachments(test_result_id);
CREATE INDEX IF NOT EXISTS idx_attachments_type ON attachments(type);

-- Triggers to update timestamps
CREATE TRIGGER IF NOT EXISTS update_test_runs_timestamp 
    AFTER UPDATE ON test_runs
BEGIN
    UPDATE test_runs SET updated_at = CURRENT_TIMESTAMP WHERE id = NEW.id;
END;

CREATE TRIGGER IF NOT EXISTS update_test_results_timestamp 
    AFTER UPDATE ON test_results
BEGIN
    UPDATE test_results SET updated_at = CURRENT_TIMESTAMP WHERE id = NEW.id;
END;
