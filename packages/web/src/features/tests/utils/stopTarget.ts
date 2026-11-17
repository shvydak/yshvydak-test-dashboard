export type StopTargetKind = 'pipeline' | 'run-all' | 'run-group' | 'rerun' | 'run'

/** What the Stop button would stop, as the user sees it: `id` goes to POST /runs/:id/stop (null = the global stop). */
export interface StopTarget {
    id: string | null
    kind: StopTargetKind
    /** Pipeline name, project, spec file or test name; absent when the web does not know it. */
    name?: string
}

/** A run the server's `connection:status` snapshot lists. */
export interface ActiveRunRef {
    id: string
    type: 'run-all' | 'run-group' | 'rerun'
    project?: string
    filePath?: string
    originalTestId?: string
}

/** The spec file's own name, without its folders. */
export const specFileName = (filePath: string) => filePath.split('/').pop() || filePath

/** Confirm title that names what the click will stop. */
export function stopDialogTitle(target: StopTarget): string {
    switch (target.kind) {
        case 'pipeline':
            return target.name ? `Stop the ${target.name} pipeline?` : 'Stop the pipeline?'
        case 'run-all':
            return target.name ? `Stop Run All — ${target.name}?` : 'Stop Run All?'
        case 'run-group':
            return target.name ? `Stop the run of ${target.name}?` : 'Stop the run of this file?'
        case 'rerun':
            return target.name ? `Stop the rerun of ${target.name}?` : 'Stop the rerun?'
        default:
            return 'Stop the run?'
    }
}
