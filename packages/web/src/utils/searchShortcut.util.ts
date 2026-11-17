// Label of the shortcut that opens the test search palette
export function getSearchShortcutLabel(): string {
    return /Mac|iPhone|iPad/.test(navigator.platform) ? 'Cmd+K' : 'Ctrl+K'
}
