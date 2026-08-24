/**
 * Warroom client half — the 两区指挥中心 as a SHELL surface (the sovereign's
 * operating-form call: the war room is cross-workspace, so it enters through
 * a sidebar row and takes over the center column, never
 * living inside any conversation), plus a composer-dock home pill. v3: the
 * workspaces inject left with the HQ-create button — the only host service
 * the board still needs is sessions.open for thread jumps.
 * @module dsh-plugin-warroom/client
 */

import type { ReactNode } from 'react'
import { ensureWarStyles } from './styles.ts'
import { warView, WarDockPill, type ClientServicesFace } from './views.tsx'
import { mountWarroomShell } from './shell-entry.ts'

export const inject = ['slots', 'sessions']

interface SlotsFace {
  inject(slot: string, register: () => () => void): unknown
  register(def: { name: string; id?: string; order?: number; label?: () => string; key?: string }, component: (props: unknown) => ReactNode): () => void
}

export function apply(ctx: unknown): void {
  ensureWarStyles()
  const services = ctx as ClientServicesFace
  // The war room rides the shell: sidebar row in, center-column board out.
  // warView(services) IS the WarView component — hand it over as the element
  // type the shell entry will createElement with.
  const shell = mountWarroomShell(warView(services))
  // Session navigation hands the center column back: when the CURRENT session
  // CHANGES (a session card's sessions.open, or any other navigation), the
  // board closes (the panel hand-back paradigm). Neither the
  // initial snapshot nor the hydration flip (undefined → first current)
  // counts — only a real session-to-session switch closes the board (live v3
  // catch: opening the board within the first second of app load used to get
  // closed by the hydration transition).
  const sessions = services.sessions
  if (sessions?.list !== undefined) {
    let lastCurrent = sessions.list.getSnapshot().current
    sessions.list.subscribe(() => {
      const next = sessions.list?.getSnapshot().current
      if (next !== lastCurrent) {
        const wasHydration = lastCurrent === undefined
        lastCurrent = next
        if (!wasHydration) shell.close()
      }
    })
  }
  const slots = (ctx as { slots?: SlotsFace }).slots
  if (slots === undefined) {
    shell.dispose()
    return
  }
  slots.inject('conversation.composer.dock', () => slots.register(
    { name: 'conversation.composer.dock', id: 'warroom-status', order: 10 },
    WarDockPill,
  ))
}
