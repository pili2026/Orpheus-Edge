/**
 * Which opening of the connect form a connect request, and its result, belong to.
 *
 * Pure: no Vue, no store, no DOM. The page feeds it events and applies what it returns.
 *
 * An opening is one selection of a network: it starts when a network is selected and
 * ends when the selection is cleared. A tier change is not a new opening: the same
 * opening is shown as the bottom sheet at xs or as the inline form at sm and up, with its
 * typed password.
 *
 * A request belongs to the opening it was sent from, and records its origin: the sheet
 * (sent at xs) or the inline form (sent at sm+). On completion, whether it is handled
 * depends only on the request and the opening, never on the tier; the tier at
 * completion only picks which rule applies.
 *
 * Governing rule (a product decision): on a phone, a finished connect (accepted, or no
 * response) never leaves a form on screen. Only a request sent at sm+ that also
 * completes at sm+ keeps the sm+ behaviour, where the form stays. A definite rejection
 * always keeps the opening and its password, and its result belongs to that opening:
 * in the sheet at xs, beside the inline form at sm+.
 */

export type Tier = 'xs' | 'sm+'
export type Origin = 'sheet' | 'inline'
export type Outcome = 'accepted' | 'rejected' | 'no-response'

export interface Opening {
  id: number
  /** The outcome of the last request this opening sent; null before one, or while one is pending. */
  lastOutcome: Outcome | null
}

export interface OwnershipState {
  /** The opening on screen, or null when no network is selected. */
  current: Opening | null
  nextId: number
  /**
   * The token of the most recently sent request. Today the store's single
   * `loading.connect` flag disables Connect while any connect is pending, so one opening
   * never has two in flight and a completing request is always the latest. The token
   * guards which request owns the opening if that flag ever becomes per-request.
   */
  latestToken: number
  /** The opening the last result belongs to; null when it belongs in the page position. */
  resultOwner: number | null
}

/** A request as it was sent. */
export interface SentRequest {
  token: number
  /** The opening it was sent from. */
  opening: number | null
  origin: Origin
}

export type OwnershipEvent =
  | { type: 'open' }
  | { type: 'close' }
  | { type: 'sent'; tier: Tier }
  | { type: 'settled'; request: SentRequest; outcome: Outcome; tier: Tier }
  | { type: 'tier'; tier: Tier }

export interface Effects {
  /** Clear the selection and the typed password: the opening has ended. */
  endOpening: boolean
  /** Bring the result in the page position (under the summary row) into view. */
  scrollToPageResult: boolean
}

export interface Transition {
  state: OwnershipState
  effects: Effects
  /** Set for `sent`: what the page keeps with the request until it settles. */
  request?: SentRequest
}

export const initialOwnership = (): OwnershipState => ({
  current: null,
  nextId: 1,
  latestToken: 0,
  resultOwner: null,
})

const NO_EFFECTS: Effects = { endOpening: false, scrollToPageResult: false }

/** True when the last result belongs to the opening on screen. */
export const resultBelongsToCurrent = (state: OwnershipState): boolean =>
  state.current !== null && state.resultOwner === state.current.id

const finished = (outcome: Outcome | null): boolean =>
  outcome === 'accepted' || outcome === 'no-response'

export function reduce(state: OwnershipState, event: OwnershipEvent): Transition {
  switch (event.type) {
    case 'open':
      return {
        state: {
          ...state,
          current: { id: state.nextId, lastOutcome: null },
          nextId: state.nextId + 1,
        },
        effects: NO_EFFECTS,
      }

    case 'close':
      return { state: { ...state, current: null }, effects: NO_EFFECTS }

    case 'sent': {
      const request: SentRequest = {
        token: state.latestToken + 1,
        opening: state.current?.id ?? null,
        origin: event.tier === 'xs' ? 'sheet' : 'inline',
      }
      return {
        state: {
          ...state,
          latestToken: request.token,
          // Pending: the opening no longer has a finished outcome.
          current: state.current ? { ...state.current, lastOutcome: null } : null,
        },
        effects: NO_EFFECTS,
        request,
      }
    }

    case 'settled': {
      const { request, outcome, tier } = event
      const current = state.current
      const own =
        request.token === state.latestToken && current !== null && request.opening === current.id

      // Not the opening on screen (closed, replaced, or reopened since): leave it alone.
      // The result goes to the page position, never into an opening it was not sent from.
      if (!own) {
        return {
          state: { ...state, resultOwner: null },
          effects: { endOpening: false, scrollToPageResult: tier === 'xs' },
        }
      }

      const settled: Opening = { ...current, lastOutcome: outcome }
      if (outcome === 'rejected') {
        return {
          state: { ...state, current: settled, resultOwner: settled.id },
          effects: NO_EFFECTS,
        }
      }
      // Accepted or no response: only sent at sm+ and completing at sm+ keeps the form.
      if (request.origin === 'inline' && tier === 'sm+') {
        return { state: { ...state, current: settled, resultOwner: null }, effects: NO_EFFECTS }
      }
      return {
        state: { ...state, current: null, resultOwner: null },
        effects: { endOpening: true, scrollToPageResult: tier === 'xs' },
      }
    }

    case 'tier':
      // Onto a phone, an opening whose last request finished must not reappear as a
      // sheet. Towards sm+ nothing changes: at xs an opening never holds a finished
      // outcome, since the rule above already ended it.
      if (event.tier === 'xs' && state.current && finished(state.current.lastOutcome)) {
        return {
          state: { ...state, current: null, resultOwner: null },
          effects: { endOpening: true, scrollToPageResult: true },
        }
      }
      return { state, effects: NO_EFFECTS }
  }
}
