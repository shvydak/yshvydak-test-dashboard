import {describe, it, expect, vi, beforeEach, afterEach} from 'vitest'
import {render, screen, fireEvent, waitFor} from '@testing-library/react'
import LoginPage from '../LoginPage'

const originalLocation = window.location

const openAt = (url: string) => {
    const target = new URL(url, 'http://localhost:8201')
    Object.defineProperty(window, 'location', {
        configurable: true,
        value: {
            pathname: target.pathname,
            search: target.search,
            hash: target.hash,
            href: target.href,
        },
    })
}

const signIn = async () => {
    fireEvent.change(screen.getByLabelText(/email/i), {target: {value: 'a@b.c'}})
    fireEvent.change(screen.getByPlaceholderText(/password/i), {target: {value: 'pw'}})
    fireEvent.click(screen.getByRole('button', {name: /sign in/i}))
}

describe('LoginPage - return to the opened page', () => {
    beforeEach(() => {
        localStorage.clear()
        vi.stubGlobal(
            'fetch',
            vi.fn(async () => ({
                ok: true,
                json: async () => ({
                    success: true,
                    data: {token: 't', user: {email: 'a@b.c'}, expiresIn: '1d'},
                }),
            }))
        )
    })

    afterEach(() => {
        Object.defineProperty(window, 'location', {configurable: true, value: originalLocation})
        vi.unstubAllGlobals()
    })

    it('returns to a shared test link after sign-in', async () => {
        openAt('/tests?project=API_Tests&testId=abc123')
        render(<LoginPage />)

        await signIn()

        await waitFor(() =>
            expect(window.location.href).toBe('/tests?project=API_Tests&testId=abc123')
        )
        expect(localStorage.getItem('_auth')).toBeTruthy()
    })

    it('goes to the root when opened at the root', async () => {
        openAt('/')
        render(<LoginPage />)

        await signIn()

        await waitFor(() => expect(window.location.href).toBe('/'))
    })

    it('never redirects to another origin', async () => {
        openAt('/tests')
        window.location.pathname = '//evil.example/x'
        render(<LoginPage />)

        await signIn()

        await waitFor(() => expect(window.location.href).toBe('/'))
    })
})
