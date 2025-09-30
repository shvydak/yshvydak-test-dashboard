import React from 'react'

/**
 * Очищает ANSI escape sequences из строки
 */
export function stripAnsiCodes(text: string): string {
    // Регулярное выражение для удаления ANSI escape codes
    // eslint-disable-next-line no-control-regex
    return text.replace(/\u001b\[[0-9;]*m/g, '')
}

/**
 * Форматирует строки ошибки с выделением проблемной строки
 */
export function formatErrorLines(errorMessage: string): JSX.Element[] {
    // Очищаем ANSI коды и разбиваем на строки
    const cleanError = stripAnsiCodes(errorMessage)
    const lines = cleanError.split('\n')

    return lines.map((line, index) => {
        // Выделяем строку с ошибкой (начинается с >)
        if (line.trim().startsWith('>')) {
            return (
                <div
                    key={index}
                    className="bg-red-50 dark:bg-red-900/30 px-2 py-1 border-l-4 border-red-400">
                    <code className="text-red-700 dark:text-red-300 font-mono text-sm whitespace-pre">
                        {line}
                    </code>
                </div>
            )
        }

        // Обычные строки
        return (
            <div key={index} className="px-2">
                <code className="text-gray-700 dark:text-gray-300 font-mono text-sm whitespace-pre">
                    {line || '\u00A0'}
                </code>
            </div>
        )
    })
}

/**
 * Извлекает номер строки из стека ошибки
 */
export function extractLineNumber(errorMessage: string): string | undefined {
    const lineMatch = errorMessage.match(/:(\d+):\d+$/)
    return lineMatch ? lineMatch[1] : undefined
}

/**
 * Форматирует краткую версию ошибки (только первые несколько строк)
 */
export function formatShortError(errorMessage: string, maxLines: number = 3): string {
    const cleanError = stripAnsiCodes(errorMessage)
    const lines = cleanError.split('\n')
    return lines.slice(0, maxLines).join('\n')
}
