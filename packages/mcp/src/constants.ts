// Claude Code saves any MCP text result over 50,000 chars to a file; stay well under it.
export const MAX_PAYLOAD_CHARS = 40_000

export const LIST_DEFAULT_LIMIT = 50
export const LIST_MAX_LIMIT = 200
export const HISTORY_DEFAULT_LIMIT = 20
export const HISTORY_MAX_LIMIT = 100
// Server-side window for one tab fetch; hitting it exactly means the list may be cut.
export const SERVER_LIST_WINDOW = 5000

export const MAX_ERROR_MESSAGE_CHARS = 2000
export const MAX_ERROR_STACK_CHARS = 4000
export const MAX_ERRORS = 5
export const MAX_ERROR_ENTRY_CHARS = 1500
export const MAX_STEPS = 10
export const MAX_STEP_TITLE_CHARS = 200
export const MAX_CONSOLE_ENTRIES = 30
export const MAX_CONSOLE_CHARS = 3000
export const MAX_CONSOLE_LINE_CHARS = 500
export const MAX_FIELD_CHARS = 200
export const MAX_TAGS = 50
export const MAX_ATTACHMENTS = 50
export const MAX_NOT_RETURNED = 20
export const MAX_NOTE_CHARS_IN_LIST = 120
export const MAX_ERROR_LINE_CHARS = 200

export const SCREENSHOTS_DEFAULT = 1
export const SCREENSHOTS_MAX = 3
export const IMAGE_DEFAULT_MAX_BYTES = 1_000_000
export const IMAGE_ABSOLUTE_MAX_BYTES = 3_000_000

export const JIRA_BATCH_SIZE = 200
export const REQUEST_TIMEOUT_MS = 30_000
export const PASSWORD_CMD_TIMEOUT_MS = 10_000

export const RUN_DEFAULT_WORKERS = 2
export const RUN_MAX_WORKERS = 4
export const RUN_MAX_TEST_NAMES = 50
export const RUN_MAX_NAME_CHARS = 300
export const RUN_MAX_PATH_CHARS = 300
export const RUN_RESULTS_LIMIT = 100
