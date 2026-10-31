import {describe, it, expect} from 'vitest'
import {renderHook, act} from '@testing-library/react'
import {useCommandPalette} from '../useCommandPalette'

const press = (init: KeyboardEventInit) =>
    act(() => {
        document.dispatchEvent(
            new KeyboardEvent('keydown', {bubbles: true, cancelable: true, ...init})
        )
    })

describe('useCommandPalette', () => {
    it.each([{metaKey: true}, {ctrlKey: true}])('Cmd/Ctrl+K toggles (%o)', (mod) => {
        const {result} = renderHook(() => useCommandPalette(true))
        press({key: 'k', ...mod})
        expect(result.current.isOpen).toBe(true)
        press({key: 'k', ...mod})
        expect(result.current.isOpen).toBe(false)
    })

    it('ignores a bare K and other Cmd shortcuts', () => {
        const {result} = renderHook(() => useCommandPalette(true))
        press({key: 'k'})
        press({key: 'j', metaKey: true})
        expect(result.current.isOpen).toBe(false)
    })

    it('does nothing while disabled (signed out)', () => {
        const {result} = renderHook(() => useCommandPalette(false))
        press({key: 'k', metaKey: true})
        expect(result.current.isOpen).toBe(false)
    })

    it('open and close work directly', () => {
        const {result} = renderHook(() => useCommandPalette(true))
        act(() => result.current.open())
        expect(result.current.isOpen).toBe(true)
        act(() => result.current.close())
        expect(result.current.isOpen).toBe(false)
    })

    it('prevents the browser default for the shortcut', () => {
        renderHook(() => useCommandPalette(true))
        const event = new KeyboardEvent('keydown', {key: 'k', metaKey: true, cancelable: true})
        act(() => {
            document.dispatchEvent(event)
        })
        expect(event.defaultPrevented).toBe(true)
    })
})
