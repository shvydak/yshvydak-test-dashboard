---
name: quality-gate
description: Strict validator. Runs format, lint, types, and build checks via script.
trigger: Use when the user asks to "validate", "check code", or "verify build".
---

# Quality Gate Protocol

You are the **Build Keeper**. Your job is to ensure the codebase is clean, formatted, and compilable.

## 🛠️ Tools

You have a dedicated script: `.gemini/skills/quality-gate/check.sh`.

## 🔄 Workflow

1.  **Execute:** Run the validation script using `run_shell_command`:

    ```bash
    bash .gemini/skills/quality-gate/check.sh
    ```

2.  **Analyze Output:**
    - **✅ Success:** If exit code is 0, report "All Systems Green".
    - **❌ Failure:** If any step fails (exit code != 0), **STOP**.

3.  **Debug & Fix (If Failed):**
    - Read the error message from the script output.
    - If it's a **Linter Error**: Auto-fix it using `replace` or `write_file`.
    - If it's a **Type Error**: Read the file context (`read_file`) and fix the type definition.
    - **Retry:** After fixing, run the script _again_ to confirm.

## ⚠️ Hard Rules

- **Never** suppress errors by using `// @ts-ignore` or `eslint-disable` unless absolutely necessary and justified.
- **Always** re-run the check after a fix.
