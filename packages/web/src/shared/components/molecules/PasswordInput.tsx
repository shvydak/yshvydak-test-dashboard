import {useState, InputHTMLAttributes} from 'react'
import {Eye, EyeOff} from 'lucide-react'
import {Input} from '../atoms'

export interface PasswordInputProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'type'> {
    label?: string
    error?: string
    helperText?: string
    fullWidth?: boolean
}

export function PasswordInput({
    label,
    error,
    helperText,
    className = '',
    disabled,
    fullWidth,
    ...props
}: PasswordInputProps) {
    const [showPassword, setShowPassword] = useState(false)

    const eyeIcon = (
        <button
            type="button"
            onClick={() => setShowPassword(!showPassword)}
            disabled={disabled}
            className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            aria-label={showPassword ? 'Hide password' : 'Show password'}>
            {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
        </button>
    )

    return (
        <Input
            type={showPassword ? 'text' : 'password'}
            icon={eyeIcon}
            iconPosition="right"
            label={label}
            error={error}
            helperText={helperText}
            className={className}
            disabled={disabled}
            fullWidth={fullWidth}
            {...props}
        />
    )
}
