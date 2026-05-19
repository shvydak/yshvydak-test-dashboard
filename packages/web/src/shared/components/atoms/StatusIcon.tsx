import {CheckCircle2, XCircle, SkipForward, CircleDot, HelpCircle} from 'lucide-react'

export type TestStatus = 'passed' | 'failed' | 'skipped' | 'pending'

export interface StatusIconProps {
    status: TestStatus
    className?: string
}

export function StatusIcon({status, className = 'h-3.5 w-3.5'}: StatusIconProps) {
    switch (status) {
        case 'passed':
            return <CheckCircle2 className={className} />
        case 'failed':
            return <XCircle className={className} />
        case 'skipped':
            return <SkipForward className={className} />
        case 'pending':
            return <CircleDot className={className} />
        default:
            return <HelpCircle className={className} />
    }
}
