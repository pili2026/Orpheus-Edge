import { describe, it, expect } from 'vitest'
import {
  initialOwnership,
  reduce,
  resultBelongsToCurrent,
  type Effects,
  type Outcome,
  type OwnershipState,
  type SentRequest,
  type Tier,
} from '@/views/debug/connectOwnership'

// One row per cell of the state × event table in PR #30's description. A row is a
// sequence of steps from no selection, and the state and effects it must end in.

type Step =
  | 'open'
  | 'close'
  | { send: Tier; as: string }
  | { settle: string; outcome: Outcome; tier: Tier }
  | { tier: Tier }

interface Expected {
  /** The opening on screen by the order it was opened in (1 = first), or null. */
  opening: number | null
  lastOutcome?: Outcome | null
  /** The last result belongs to the opening on screen (sheet at xs, beside the form at sm+). */
  resultInOpening: boolean
  /** The effects of the last step. */
  effects: Effects
}

const NONE: Effects = { endOpening: false, scrollToPageResult: false }
const END_AND_SCROLL: Effects = { endOpening: true, scrollToPageResult: true }
const END_ONLY: Effects = { endOpening: true, scrollToPageResult: false }
const SCROLL_ONLY: Effects = { endOpening: false, scrollToPageResult: true }

function run(steps: Step[]): { state: OwnershipState; effects: Effects } {
  let state = initialOwnership()
  let effects = NONE
  const sent = new Map<string, SentRequest>()
  for (const step of steps) {
    let t
    if (step === 'open' || step === 'close') {
      t = reduce(state, { type: step })
    } else if ('send' in step) {
      t = reduce(state, { type: 'sent', tier: step.send })
      sent.set(step.as, t.request!)
    } else if ('settle' in step) {
      t = reduce(state, {
        type: 'settled',
        request: sent.get(step.settle)!,
        outcome: step.outcome,
        tier: step.tier,
      })
    } else {
      t = reduce(state, { type: 'tier', tier: step.tier })
    }
    state = t.state
    effects = t.effects
  }
  return { state, effects }
}

const FINISHED = ['accepted', 'no-response'] as const

const ROWS: Array<[string, Step[], Expected]> = [
  // ---------- S0: no selection, no pending ----------
  [
    'S0 × open: a new opening',
    ['open'],
    { opening: 1, lastOutcome: null, resultInOpening: false, effects: NONE },
  ],
  [
    'S0 × close: nothing to end',
    ['close'],
    { opening: null, resultInOpening: false, effects: NONE },
  ],
  [
    'S0 × tier to sm+: nothing',
    [{ tier: 'sm+' }],
    { opening: null, resultInOpening: false, effects: NONE },
  ],
  [
    'S0 × tier to xs: nothing',
    [{ tier: 'xs' }],
    { opening: null, resultInOpening: false, effects: NONE },
  ],

  // ---------- S1: sheet open, idle (xs) ----------
  [
    'S1 × close (mask, close button, Escape, Reset, interface change)',
    ['open', 'close'],
    { opening: null, resultInOpening: false, effects: NONE },
  ],
  [
    'S1 × submit: pending, no finished outcome',
    ['open', { send: 'xs', as: 'A' }],
    { opening: 1, lastOutcome: null, resultInOpening: false, effects: NONE },
  ],
  [
    'S1 × tier to sm+: the same opening, shown inline',
    ['open', { tier: 'sm+' }],
    { opening: 1, lastOutcome: null, resultInOpening: false, effects: NONE },
  ],
  [
    'S4 (no connect) × tier to xs (D3): the sheet opens on it',
    [{ tier: 'sm+' }, 'open', { tier: 'xs' }],
    { opening: 1, lastOutcome: null, resultInOpening: false, effects: NONE },
  ],

  // ---------- S1r: sheet open, showing its own rejection ----------
  [
    'S1r × close: the result goes to the page position',
    ['open', { send: 'xs', as: 'A' }, { settle: 'A', outcome: 'rejected', tier: 'xs' }, 'close'],
    { opening: null, resultInOpening: false, effects: NONE },
  ],
  [
    'S1r × tier to sm+: kept, the result beside the form',
    [
      'open',
      { send: 'xs', as: 'A' },
      { settle: 'A', outcome: 'rejected', tier: 'xs' },
      { tier: 'sm+' },
    ],
    { opening: 1, lastOutcome: 'rejected', resultInOpening: true, effects: NONE },
  ],
  [
    'S1r × tier to sm+ and back (D3, rejection): the sheet reopens with its result',
    [
      'open',
      { send: 'xs', as: 'A' },
      { settle: 'A', outcome: 'rejected', tier: 'xs' },
      { tier: 'sm+' },
      { tier: 'xs' },
    ],
    { opening: 1, lastOutcome: 'rejected', resultInOpening: true, effects: NONE },
  ],
  [
    'S1r × submit again: pending, the result still its own until it settles',
    [
      'open',
      { send: 'xs', as: 'A' },
      { settle: 'A', outcome: 'rejected', tier: 'xs' },
      { send: 'xs', as: 'B' },
    ],
    { opening: 1, lastOutcome: null, resultInOpening: true, effects: NONE },
  ],

  // ---------- S2: sheet open, pending from this opening (xs) ----------
  ...FINISHED.map((o): [string, Step[], Expected] => [
    `S2 × ${o}: the opening ends, the result under the summary row`,
    ['open', { send: 'xs', as: 'A' }, { settle: 'A', outcome: o, tier: 'xs' }],
    { opening: null, resultInOpening: false, effects: END_AND_SCROLL },
  ]),
  [
    'S2 × rejection: kept, with the password, the result in the sheet',
    ['open', { send: 'xs', as: 'A' }, { settle: 'A', outcome: 'rejected', tier: 'xs' }],
    { opening: 1, lastOutcome: 'rejected', resultInOpening: true, effects: NONE },
  ],
  [
    'S2 × close: the opening ends, the request goes on',
    ['open', { send: 'xs', as: 'A' }, 'close'],
    { opening: null, resultInOpening: false, effects: NONE },
  ],

  // ---------- S2x: sheet open on another opening, an earlier one's request pending ----------
  ...(['accepted', 'rejected', 'no-response'] as const).map((o): [string, Step[], Expected] => [
    `S2x × ${o} of the earlier opening: the reopened sheet is left alone (any network, the same one included)`,
    ['open', { send: 'xs', as: 'A' }, 'close', 'open', { settle: 'A', outcome: o, tier: 'xs' }],
    { opening: 2, lastOutcome: null, resultInOpening: false, effects: SCROLL_ONLY },
  ]),
  [
    'S2x × earlier rejection while this opening shows its own: its result leaves the sheet',
    [
      'open',
      { send: 'xs', as: 'A' },
      'close',
      'open',
      { send: 'xs', as: 'B' },
      { settle: 'B', outcome: 'rejected', tier: 'xs' },
      { settle: 'A', outcome: 'rejected', tier: 'xs' },
    ],
    { opening: 2, lastOutcome: 'rejected', resultInOpening: false, effects: SCROLL_ONLY },
  ],

  // ---------- S2i: sent inline at sm+, rotated to xs, settles there (D2) ----------
  ...FINISHED.map((o): [string, Step[], Expected] => [
    `S2i × ${o} (D2): the opening ends, the sheet closes, the result under the summary row`,
    [
      { tier: 'sm+' },
      'open',
      { send: 'sm+', as: 'A' },
      { tier: 'xs' },
      { settle: 'A', outcome: o, tier: 'xs' },
    ],
    { opening: null, resultInOpening: false, effects: END_AND_SCROLL },
  ]),
  [
    'S2i × rejection (D2): kept, with the password, the result in the sheet',
    [
      { tier: 'sm+' },
      'open',
      { send: 'sm+', as: 'A' },
      { tier: 'xs' },
      { settle: 'A', outcome: 'rejected', tier: 'xs' },
    ],
    { opening: 1, lastOutcome: 'rejected', resultInOpening: true, effects: NONE },
  ],
  [
    'S5 × tier to xs while pending: never ended (nothing has finished)',
    [{ tier: 'sm+' }, 'open', { send: 'sm+', as: 'A' }, { tier: 'xs' }],
    { opening: 1, lastOutcome: null, resultInOpening: false, effects: NONE },
  ],

  // ---------- S3: no selection, pending ----------
  ...(['accepted', 'rejected', 'no-response'] as const).map((o): [string, Step[], Expected] => [
    `S3 × ${o} at xs: the result under the summary row, brought into view`,
    ['open', { send: 'xs', as: 'A' }, 'close', { settle: 'A', outcome: o, tier: 'xs' }],
    { opening: null, resultInOpening: false, effects: SCROLL_ONLY },
  ]),
  ...(['accepted', 'rejected', 'no-response'] as const).map((o): [string, Step[], Expected] => [
    `S3 × ${o} at sm+: the result card, nothing else`,
    [
      { tier: 'sm+' },
      'open',
      { send: 'sm+', as: 'A' },
      'close',
      { settle: 'A', outcome: o, tier: 'sm+' },
    ],
    { opening: null, resultInOpening: false, effects: NONE },
  ]),

  // ---------- S4 / S5: inline at sm+, sent and settled at sm+ (sm+ unchanged) ----------
  ...FINISHED.map((o): [string, Step[], Expected] => [
    `S5 × ${o} at sm+: the form stays, as today`,
    [{ tier: 'sm+' }, 'open', { send: 'sm+', as: 'A' }, { settle: 'A', outcome: o, tier: 'sm+' }],
    { opening: 1, lastOutcome: o, resultInOpening: false, effects: NONE },
  ]),
  [
    'S5 × rejection at sm+: the form stays, with the password',
    [
      { tier: 'sm+' },
      'open',
      { send: 'sm+', as: 'A' },
      { settle: 'A', outcome: 'rejected', tier: 'sm+' },
    ],
    { opening: 1, lastOutcome: 'rejected', resultInOpening: true, effects: NONE },
  ],
  ...(['accepted', 'rejected', 'no-response'] as const).map((o): [string, Step[], Expected] => [
    `S6 × ${o} of the earlier opening at sm+: the other row's form is left alone`,
    [
      { tier: 'sm+' },
      'open',
      { send: 'sm+', as: 'A' },
      'open',
      { settle: 'A', outcome: o, tier: 'sm+' },
    ],
    { opening: 2, lastOutcome: null, resultInOpening: false, effects: NONE },
  ]),

  // ---------- D3: a finished inline opening rotated onto a phone ----------
  ...FINISHED.map((o): [string, Step[], Expected] => [
    `S4 after ${o} × tier to xs (D3): the opening ends; no sheet; the result under the summary row`,
    [
      { tier: 'sm+' },
      'open',
      { send: 'sm+', as: 'A' },
      { settle: 'A', outcome: o, tier: 'sm+' },
      { tier: 'xs' },
    ],
    { opening: null, resultInOpening: false, effects: END_AND_SCROLL },
  ]),
  [
    'S4 after a rejection × tier to xs (D3): the sheet opens with its result',
    [
      { tier: 'sm+' },
      'open',
      { send: 'sm+', as: 'A' },
      { settle: 'A', outcome: 'rejected', tier: 'sm+' },
      { tier: 'xs' },
    ],
    { opening: 1, lastOutcome: 'rejected', resultInOpening: true, effects: NONE },
  ],
  [
    'S4 after accepted, sent again, × tier to xs: pending, so not ended',
    [
      { tier: 'sm+' },
      'open',
      { send: 'sm+', as: 'A' },
      { settle: 'A', outcome: 'accepted', tier: 'sm+' },
      { send: 'sm+', as: 'B' },
      { tier: 'xs' },
    ],
    { opening: 1, lastOutcome: null, resultInOpening: false, effects: NONE },
  ],

  // ---------- S5s: sent from the sheet, rotated to sm+, settles there (D1) ----------
  ...FINISHED.map((o): [string, Step[], Expected] => [
    `S5s × ${o} (D1): the opening ends, the inline form disappears, the result in the card`,
    ['open', { send: 'xs', as: 'A' }, { tier: 'sm+' }, { settle: 'A', outcome: o, tier: 'sm+' }],
    { opening: null, resultInOpening: false, effects: END_ONLY },
  ]),
  [
    'S5s × rejection (D1): kept, with the password, the result beside the form',
    [
      'open',
      { send: 'xs', as: 'A' },
      { tier: 'sm+' },
      { settle: 'A', outcome: 'rejected', tier: 'sm+' },
    ],
    { opening: 1, lastOutcome: 'rejected', resultInOpening: true, effects: NONE },
  ],
  ...FINISHED.map((o): [string, Step[], Expected] => [
    `S5s × tier back to xs, then ${o}: the opening ends, the result under the summary row`,
    [
      'open',
      { send: 'xs', as: 'A' },
      { tier: 'sm+' },
      { tier: 'xs' },
      { settle: 'A', outcome: o, tier: 'xs' },
    ],
    { opening: null, resultInOpening: false, effects: END_AND_SCROLL },
  ]),
  [
    'S5s × tier back to xs, then rejection: kept, the result in the sheet',
    [
      'open',
      { send: 'xs', as: 'A' },
      { tier: 'sm+' },
      { tier: 'xs' },
      { settle: 'A', outcome: 'rejected', tier: 'xs' },
    ],
    { opening: 1, lastOutcome: 'rejected', resultInOpening: true, effects: NONE },
  ],
  ...FINISHED.map((o): [string, Step[], Expected] => [
    `S5s × ${o} at sm+, then tier back to xs: no sheet comes back`,
    [
      'open',
      { send: 'xs', as: 'A' },
      { tier: 'sm+' },
      { settle: 'A', outcome: o, tier: 'sm+' },
      { tier: 'xs' },
    ],
    { opening: null, resultInOpening: false, effects: NONE },
  ]),

  // ---------- The token: only the latest request may settle the opening ----------
  [
    'token × an older request settles after a newer one was sent from the same opening',
    [
      'open',
      { send: 'xs', as: 'A' },
      { send: 'xs', as: 'B' },
      { settle: 'A', outcome: 'accepted', tier: 'xs' },
    ],
    { opening: 1, lastOutcome: null, resultInOpening: false, effects: SCROLL_ONLY },
  ],
  [
    'token × the newer request then settles: handled',
    [
      'open',
      { send: 'xs', as: 'A' },
      { send: 'xs', as: 'B' },
      { settle: 'A', outcome: 'accepted', tier: 'xs' },
      { settle: 'B', outcome: 'rejected', tier: 'xs' },
    ],
    { opening: 1, lastOutcome: 'rejected', resultInOpening: true, effects: NONE },
  ],
]

describe('connectOwnership', () => {
  it.each(ROWS)('%s', (_cell, steps, expected) => {
    const { state, effects } = run(steps)
    expect(state.current?.id ?? null, 'the opening on screen').toBe(expected.opening)
    expect(state.current?.lastOutcome ?? null, 'its last outcome').toBe(
      expected.lastOutcome ?? null,
    )
    expect(resultBelongsToCurrent(state), 'the result belongs to the opening on screen').toBe(
      expected.resultInOpening,
    )
    expect(effects, 'the effects of the last step').toEqual(expected.effects)
  })

  it('sends record the opening, the origin from the tier, and a new token', () => {
    let state = reduce(initialOwnership(), { type: 'open' }).state
    const first = reduce(state, { type: 'sent', tier: 'xs' })
    expect(first.request).toEqual({ token: 1, opening: 1, origin: 'sheet' })
    state = first.state
    const second = reduce(state, { type: 'sent', tier: 'sm+' })
    expect(second.request).toEqual({ token: 2, opening: 1, origin: 'inline' })
  })
})
