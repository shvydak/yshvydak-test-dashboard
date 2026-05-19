/** @type {import('tailwindcss').Config} */

// Soft & Friendly design system — indigo accent, emerald/rose/amber status,
// soft slate-indigo neutral scale. Legacy palette names (blue/green/red/amber/
// yellow/gray) are intentionally re-mapped onto the new system so the entire
// app shifts cohesively without touching every file.

const indigo = {
    50: '#eef2ff',
    100: '#e0e7ff',
    200: '#c7d2fe',
    300: '#a5b4fc',
    400: '#818cf8',
    500: '#6366f1',
    600: '#4f46e5',
    700: '#4338ca',
    800: '#3730a3',
    900: '#312e81',
    950: '#1e1b4b',
}

const emerald = {
    50: '#ecfdf5',
    100: '#d1fae5',
    200: '#a7f3d0',
    300: '#6ee7b7',
    400: '#34d399',
    500: '#10b981',
    600: '#059669',
    700: '#047857',
    800: '#065f46',
    900: '#064e3b',
    950: '#022c22',
}

const rose = {
    50: '#fff1f2',
    100: '#ffe4e6',
    200: '#fecdd3',
    300: '#fda4af',
    400: '#fb7185',
    500: '#f43f5e',
    600: '#e11d48',
    700: '#be123c',
    800: '#9f1239',
    900: '#881337',
    950: '#4c0519',
}

const amber = {
    50: '#fffbeb',
    100: '#fef3c7',
    200: '#fde68a',
    300: '#fcd34d',
    400: '#fbbf24',
    500: '#f59e0b',
    600: '#d97706',
    700: '#b45309',
    800: '#92400e',
    900: '#78350f',
    950: '#451a03',
}

// Soft slate-indigo neutral ramp. Light end is warm off-white (never stark),
// dark end is a deep navy-charcoal (never pure black) for the "friendly" feel.
const neutral = {
    50: '#f7f8fb',
    100: '#eef0f6',
    200: '#e3e6ef',
    300: '#cdd2e1',
    400: '#a4abc2',
    500: '#7b8299',
    600: '#565d73',
    700: '#363c4e',
    800: '#21263a',
    900: '#161a29',
    950: '#0f1220',
}

export default {
    content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
    darkMode: 'class',
    theme: {
        extend: {
            colors: {
                primary: indigo,
                accent: indigo,
                success: emerald,
                danger: rose,
                warning: amber,
                // Re-map Tailwind defaults so legacy utility classes
                // (bg-blue-600, bg-green-600, bg-red-600, bg-gray-800…)
                // automatically adopt the new Soft & Friendly system.
                blue: indigo,
                indigo,
                green: emerald,
                emerald,
                red: rose,
                rose,
                amber,
                yellow: amber,
                gray: neutral,
                slate: neutral,
            },
            fontFamily: {
                sans: [
                    '"DM Sans"',
                    'ui-sans-serif',
                    'system-ui',
                    '-apple-system',
                    'BlinkMacSystemFont',
                    '"Segoe UI"',
                    'Roboto',
                    'sans-serif',
                ],
                mono: [
                    '"DM Mono"',
                    'ui-monospace',
                    'SFMono-Regular',
                    '"SF Mono"',
                    'Menlo',
                    'monospace',
                ],
            },
            borderRadius: {
                xl: '0.875rem',
                '2xl': '1.125rem',
                '3xl': '1.5rem',
            },
            boxShadow: {
                soft: '0 1px 2px 0 rgb(20 26 41 / 0.04), 0 1px 3px 0 rgb(20 26 41 / 0.06)',
                card: '0 2px 4px -1px rgb(20 26 41 / 0.05), 0 8px 24px -6px rgb(20 26 41 / 0.08)',
                'card-hover':
                    '0 4px 8px -2px rgb(20 26 41 / 0.07), 0 16px 40px -8px rgb(20 26 41 / 0.14)',
                pop: '0 12px 32px -8px rgb(20 26 41 / 0.18), 0 4px 12px -4px rgb(20 26 41 / 0.10)',
                glow: '0 0 0 1px rgb(99 102 241 / 0.18), 0 8px 28px -6px rgb(99 102 241 / 0.35)',
                'inner-soft': 'inset 0 1px 2px 0 rgb(20 26 41 / 0.06)',
            },
            backgroundImage: {
                'mesh-light':
                    'radial-gradient(900px circle at 8% -10%, rgb(99 102 241 / 0.10), transparent 45%), radial-gradient(800px circle at 100% 0%, rgb(16 185 129 / 0.07), transparent 45%)',
                'mesh-dark':
                    'radial-gradient(900px circle at 8% -10%, rgb(99 102 241 / 0.16), transparent 45%), radial-gradient(800px circle at 100% 0%, rgb(16 185 129 / 0.09), transparent 45%)',
            },
            keyframes: {
                'fade-in': {
                    '0%': {opacity: '0'},
                    '100%': {opacity: '1'},
                },
                'slide-up': {
                    '0%': {opacity: '0', transform: 'translateY(12px)'},
                    '100%': {opacity: '1', transform: 'translateY(0)'},
                },
                'scale-in': {
                    '0%': {opacity: '0', transform: 'scale(0.96)'},
                    '100%': {opacity: '1', transform: 'scale(1)'},
                },
                'slide-in-right': {
                    '0%': {opacity: '0', transform: 'translateX(24px)'},
                    '100%': {opacity: '1', transform: 'translateX(0)'},
                },
                shimmer: {
                    '100%': {transform: 'translateX(100%)'},
                },
            },
            animation: {
                'spin-slow': 'spin 3s linear infinite',
                'pulse-slow': 'pulse 3s cubic-bezier(0.4, 0, 0.6, 1) infinite',
                'bounce-soft': 'bounce 2s infinite',
                'fade-in': 'fade-in 0.4s ease-out both',
                'slide-up': 'slide-up 0.45s cubic-bezier(0.16, 1, 0.3, 1) both',
                'scale-in': 'scale-in 0.3s cubic-bezier(0.16, 1, 0.3, 1) both',
                'slide-in-right': 'slide-in-right 0.35s cubic-bezier(0.16, 1, 0.3, 1) both',
                shimmer: 'shimmer 1.6s infinite',
            },
        },
    },
    plugins: [],
}
