import {SearchX} from 'lucide-react'
import {AlertBanner} from '@shared/components/molecules/AlertBanner'
import type {TestLinkFailure} from '../hooks/useTestLink'

const NOTICES: Record<TestLinkFailure, {title: string; message: string}> = {
    'not-found': {
        title: 'Test not found',
        message: 'The linked test no longer exists in the dashboard',
    },
    error: {
        title: 'Could not open the test link',
        message: 'The server did not answer. Reload the page to try again',
    },
}

export function TestLinkBanner({
    reason,
    onDismiss,
}: {
    reason: TestLinkFailure
    onDismiss: () => void
}) {
    return (
        <AlertBanner
            severity="warning"
            icon={<SearchX className="h-4 w-4" />}
            title={NOTICES[reason].title}
            message={NOTICES[reason].message}
            onDismiss={onDismiss}
        />
    )
}
