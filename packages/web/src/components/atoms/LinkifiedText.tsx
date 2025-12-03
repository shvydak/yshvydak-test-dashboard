import React from 'react'
import {parseLinksInText} from '@/utils/linkify.util'

interface LinkifiedTextProps {
    text: string
    className?: string
    linkClassName?: string
}

/**
 * Component that renders text with clickable links
 * Auto-detects URLs and makes them clickable
 */
export const LinkifiedText: React.FC<LinkifiedTextProps> = ({
    text,
    className = '',
    linkClassName = 'text-primary-600 dark:text-primary-400 hover:underline',
}) => {
    if (!text) return null

    const parts = parseLinksInText(text)

    return (
        <span className={className}>
            {parts.map((part, index) => {
                if (part.type === 'link') {
                    return (
                        <a
                            key={index}
                            href={part.href}
                            target="_blank"
                            rel="noopener noreferrer"
                            className={linkClassName}
                            onClick={(e) => e.stopPropagation()}>
                            {part.content}
                        </a>
                    )
                }
                return <span key={index}>{part.content}</span>
            })}
        </span>
    )
}
