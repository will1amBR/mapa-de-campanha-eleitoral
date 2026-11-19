// Connectors of the signed-in user: each user connects THEIR OWN accounts
// (Google Sheets, Gmail…) and the app acts with them. Served by the app's
// PocketBase — don't write routes or OAuth code for this, use these helpers.
import pb from './pocketbase/client'

export type ConnectorStatus = 'connected' | 'not_connected' | 'expired'

export interface ConnectorState {
  toolkit: string
  status: ConnectorStatus
}

/** data is whatever the provider answered: narrow it before use. */
export interface ConnectorResult {
  successful: boolean
  data: unknown
  error: string | null
}

// Answers are checked before use: a wrong shape is an error, never a guess.
const unexpected = (what: string): never => {
  throw new Error(`Unexpected connectors answer: ${what}`)
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null

const STATUSES: readonly ConnectorStatus[] = ['connected', 'not_connected', 'expired']

const toConnectorState = (value: unknown): ConnectorState => {
  if (!isRecord(value) || typeof value.toolkit !== 'string') return unexpected('connector')
  const status = STATUSES.find((s) => s === value.status)
  return status ? { toolkit: value.toolkit, status } : unexpected('connector status')
}

/** Every toolkit enabled for this app, with this user's status. */
export const listConnectors = async (): Promise<ConnectorState[]> => {
  const res: unknown = await pb.send('/api/skip/connectors', { method: 'GET' })
  if (!isRecord(res) || !Array.isArray(res.connectors)) return unexpected('connector list')
  return res.connectors.map(toConnectorState)
}

/** Sends the browser to the provider's consent screen; it returns to returnUrl (this page by default). */
const inFrame = (): boolean => {
  try {
    return window.self !== window.top
  } catch {
    return true // a cross-origin parent: framed
  }
}

// A framed app's consent window comes back to returnUrl carrying this marker,
// so the page it lands on closes it and the user is back where they clicked.
const RETURN_MARKER = 'skip_connectors_return'

const withReturnMarker = (url: string): string => {
  const marked = new URL(url)
  marked.searchParams.set(RETURN_MARKER, '1')
  return marked.toString()
}

if (new URLSearchParams(window.location.search).has(RETURN_MARKER)) {
  window.close()
  // Still open (a window the browser won't let a script close): drop the
  // marker so the app carries on normally in this tab.
  const clean = new URL(window.location.href)
  clean.searchParams.delete(RETURN_MARKER)
  window.history.replaceState(null, '', clean.toString())
}

/** The browser blocked the consent window; open `url` from a new click (a link). */
export class ConnectPopupBlockedError extends Error {
  readonly url: string
  constructor(url: string) {
    super('The browser blocked the connection window')
    this.name = 'ConnectPopupBlockedError'
    this.url = url
  }
}

/**
 * Sends the user to the provider's consent screen; it returns to returnUrl (this page by default).
 * Consent pages refuse to load inside an iframe (Skip's preview, an embed), so a framed app opens
 * them in a new window once the link arrives. Browsers allow that for a few seconds after the
 * click; past it (or in a strict browser) they block it, and ConnectPopupBlockedError carries the
 * URL so the app can offer it as a link.
 */
export const connect = async (
  toolkit: string,
  // No query or hash: they can carry secrets (a reset token) the provider must not see.
  returnUrl = window.location.origin + window.location.pathname,
): Promise<void> => {
  const framed = inFrame()
  const res: unknown = await pb.send(
    `/api/skip/connectors/${encodeURIComponent(toolkit)}/connect`,
    { method: 'POST', body: { returnUrl: framed ? withReturnMarker(returnUrl) : returnUrl } },
  )
  const url = isRecord(res) && typeof res.url === 'string' ? res.url : unexpected('consent URL')
  // Only ever navigate to an http(s) consent page.
  if (!/^https?:/i.test(url)) return unexpected('consent URL')
  if (!framed) return window.location.assign(url)
  // Opened blank and pointed right away (no visible blank page): the opener is
  // cut while the window is still same-origin, which a cross-origin one forbids.
  const popup = window.open('', '_blank')
  if (!popup) throw new ConnectPopupBlockedError(url)
  popup.opener = null
  popup.location.href = url
}

export const disconnect = async (toolkit: string): Promise<void> => {
  await pb.send(`/api/skip/connectors/${encodeURIComponent(toolkit)}`, { method: 'DELETE' })
}

/**
 * Runs a connector tool as the signed-in user, e.g.
 * execute('GOOGLESHEETS_BATCH_GET', { spreadsheet_id, ranges: ['A1:C10'] }).
 * successful: false is the provider's answer; a thrown error means the outcome is
 * unknown (it may have run), so don't blindly retry a write.
 */
export const execute = async (
  tool: string,
  args: Record<string, unknown> = {},
): Promise<ConnectorResult> => {
  const res: unknown = await pb.send('/api/skip/connectors/execute', {
    method: 'POST',
    body: { tool, args },
  })
  if (!isRecord(res) || typeof res.successful !== 'boolean') return unexpected('execute result')
  const rawError = res.error ?? null
  if (rawError !== null && typeof rawError !== 'string') return unexpected('execute error')
  // Narrowed by typeof: generated apps compile without strictNullChecks, where
  // the check above does not narrow unknown to string | null.
  const error = typeof rawError === 'string' ? rawError : null
  return { successful: res.successful, data: res.data, error }
}
