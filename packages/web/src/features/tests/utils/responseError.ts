const GENERIC_SERVER_ERROR = 'Internal server error'

// The server's reason for a refused or failed action, instead of the bare "HTTP error! status: 400".
// `message` is the reason on 4xx; on 5xx `error` holds the cause (discovery), unless it is the generic label (then `message`).
export async function responseError(response: Response): Promise<Error> {
    try {
        const body = await response.json()
        const message = typeof body?.message === 'string' ? body.message : ''
        const error = typeof body?.error === 'string' ? body.error : ''
        const causeInError = error && error !== GENERIC_SERVER_ERROR
        const reason = response.status >= 500 && causeInError ? error : message || error
        if (reason) return new Error(reason)
    } catch {
        // not JSON: fall through to the generic message
    }
    return new Error(`HTTP error! status: ${response.status}`)
}
