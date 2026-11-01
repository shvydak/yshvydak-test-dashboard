import {describe, it, expect} from 'vitest'
import {getPostLoginPath} from '../postLoginPath'

const at = (pathname: string, search = '', hash = '') => getPostLoginPath({pathname, search, hash})

describe('getPostLoginPath', () => {
    it('returns the page the user opened, with its query', () => {
        expect(at('/tests', '?project=API&testId=abc')).toBe('/tests?project=API&testId=abc')
        expect(at('/dashboard', '?testId=abc', '#x')).toBe('/dashboard?testId=abc#x')
    })

    it('falls back to the dashboard root for the root and the login path', () => {
        expect(at('/')).toBe('/')
        expect(at('/login', '?x=1')).toBe('/')
    })

    it.each([
        ['protocol-relative', '//evil.example', ''],
        ['backslash host', '/\\evil.example', ''],
        ['absolute URL', 'https://evil.example/tests', ''],
        ['javascript scheme', 'javascript:alert(1)', ''],
        ['no leading slash', 'tests', ''],
        ['control character', '/\t/evil.example', ''],
        ['backslash in the query', '/tests', '?next=\\\\evil'],
    ])('refuses %s', (_name, pathname, search) => {
        expect(at(pathname, search)).toBe('/')
    })
})
