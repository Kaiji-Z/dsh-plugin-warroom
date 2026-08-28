/**
 * Warroom shell entry — the panel-entry doctrine, per the sovereign's
 * operating-form call: the war room is a CROSS-WORKSPACE view, so
 * it must not live inside any conversation. A sidebar row (DOM-injected next
 * to the sibling plugin family, self-healing under React re-renders) toggles
 * a board that takes over the center column; per-task workspaces stay where
 * they belong — on the tasks.
 *
 * The conversation slot family is single-occupant and external plugins
 * cannot declare shell slots, so both the row and the view are DOM-level:
 * plain-DOM button (never disturbs the shell's reconciliation) + a container
 * appended to the center column as an extra trailing child React never
 * manages. Visibility toggles via an <html> data attribute; sibling panels
 * evict each other through the dsh-panel-activate event.
 * @module dsh-plugin-warroom/client/shell-entry
 */

import { createElement } from 'react'
import { activeCopy, subscribeSkin } from './copy.ts'
import { createRoot } from 'react-dom/client'
import type { ReactNode } from 'react'

const ROW_ATTRIBUTE = 'data-dsh-warroom-entry'
const ROW_SELECTOR = `[${ROW_ATTRIBUTE}]`
const VIEW_ATTRIBUTE = 'data-dsh-warroom-view'
const ACTIVE_ATTR = 'data-dsh-warroom-active'
/** Sibling panels' activation attributes, evicted when the war room opens. */
const OTHER_ACTIVE_ATTRS = ['data-dsh-taskboard-active', 'data-dsh-ssh-active'] as const
/** Cross-plugin activation event; detail is the activating panel name. */
const ACTIVATE_EVENT = 'dsh-panel-activate'
const PANEL_NAME = 'warroom'
/** Family rows we order against (the sibling-panel entry block). */
const FAMILY_SELECTORS = ['[data-dsh-ssh-entry]', '[data-dsh-taskboard-entry]', ROW_SELECTOR] as const

const SIDEBAR_COLUMN_SELECTOR = '[data-pane="sidebar"], [class*="sidebarCol"]'
const CENTER_COLUMN_SELECTOR = '[data-pane="conversation"], [class*="centerCol"]'
const SIDEBAR_ROW_SELECTOR = '[class*="sessionRow"], [class*="projectRow"], [class*="searchResultRow"], [class*="searchResultWorkspace"], [class*="newSession"]'

/** Minimal mounting face (kept for testability of the wiring). */
interface SidebarMountDeps {
  createRoot(container: HTMLElement): { render(node: ReactNode): void; unmount(): void }
}

/** The open/close state shared by the sidebar row and the view. */
class ShellOpenState {
  private open = false
  private readonly listeners = new Set<() => void>()
  isOpen(): boolean { return this.open }
  setOpen(next: boolean): void {
    if (this.open === next) return
    this.open = next
    for (const l of this.listeners) l()
  }
  subscribe(listener: () => void): () => void {
    this.listeners.add(listener)
    return () => { this.listeners.delete(listener) }
  }
}

function sidebarRoot(doc: Document): HTMLElement | undefined {
  const column = doc.querySelector<HTMLElement>(SIDEBAR_COLUMN_SELECTOR)
  if (column === null) return undefined
  const logoOwner = column.querySelector<HTMLElement>('[class*="logoRow"]')?.parentElement
  return logoOwner ?? (column.firstElementChild as HTMLElement | undefined)
}

function newSessionButton(root: HTMLElement): HTMLButtonElement | undefined {
  const nested = root.querySelector<HTMLButtonElement>('button[class*="newSession"]')
  if (nested !== null) return nested
  for (const child of root.children) {
    if (child.tagName === 'BUTTON') return child as HTMLButtonElement
  }
  return undefined
}

/** A 16px strategic-map pin (matches the shell's inline nav-icon look). */
const WAR_ICON = '<svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true"><path d="M8 1.5l5 2v4.2c0 3.1-2.1 5.6-5 6.8-2.9-1.2-5-3.7-5-6.8V3.5l5-2z" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round"/><circle cx="8" cy="7.4" r="1.7" fill="currentColor"/></svg>'

/** The shell surface handle: dispose unmounts everything, close yields the
 * center column back (session navigation does this — see client/index.ts). */
export interface WarroomShellHandle {
  dispose(): void
  close(): void
}

/**
 * Mount the war-room shell surface: sidebar row + center-column board.
 * @param view - the board COMPONENT (an element factory, e.g. warView(services)).
 * @param dom - the DOM mounting faces (injectable for tests).
 * @returns the handle removing row, view, and listeners (dispose) and
 *          closing the board without unmounting (close).
 */
export function mountWarroomShell(view: () => ReactNode, dom?: SidebarMountDeps): WarroomShellHandle {
  if (typeof document === 'undefined') return () => {}
  // DOM-level idempotency: an HMR re-injection must not double-mount.
  if (document.querySelector(ROW_SELECTOR) !== null) return () => {}

  const state = new ShellOpenState()

  // --- Sidebar row -------------------------------------------------------
  const row = document.createElement('button')
  row.type = 'button'
  row.setAttribute(ROW_ATTRIBUTE, '')
  row.setAttribute('data-dsh-plugin', 'warroom')
  row.setAttribute('data-dsh-part', 'sidebar-entry')
  row.className = 'war-sidebar-row'
  // V16 术语随皮肤：标签取词典（trek=舰桥/军事=舰桥），订阅切换即时换词。
  const paintRow = (): void => {
    const label = activeCopy().head.title
    row.setAttribute('aria-label', label)
    row.setAttribute('title', `${label} · 战略任务栏（跨工作区）`)
    row.innerHTML = `<span class="war-sidebar-icon">${WAR_ICON}</span><span class="war-sidebar-label">${label}</span>`
  }
  paintRow()
  row.addEventListener('click', () => state.setOpen(!state.isOpen()))

  const offSkin = subscribeSkin(paintRow)

  const placeRow = (): boolean => {
    const root = sidebarRoot(document)
    if (root === undefined) return false
    const button = newSessionButton(root)
    if (button === undefined) return false
    if (row.parentElement !== root) {
      const logoRow = button.closest('[class*="logoRow"]')
      const base = (logoRow !== null && logoRow.parentElement === root) ? logoRow : button
      const family = Array.from(root.children).filter(
        el => el instanceof HTMLElement && (el as HTMLElement).matches(FAMILY_SELECTORS.join(', ')),
      )
      const anchor = family.length > 0 ? family[family.length - 1]!.nextElementSibling : base.nextElementSibling
      root.insertBefore(row, anchor)
    }
    return true
  }

  // --- Center-column view ------------------------------------------------
  let container: HTMLElement | undefined
  let root: { render(node: ReactNode): void; unmount(): void } | undefined
  const roots = dom ?? { createRoot: (el: HTMLElement) => createRoot(el) }
  const ensureView = (): void => {
    if (container !== undefined) return
    const column = document.querySelector<HTMLElement>(CENTER_COLUMN_SELECTOR)
    if (column === null) return
    container = document.createElement('div')
    container.setAttribute(VIEW_ATTRIBUTE, '')
    container.setAttribute('data-dsh-plugin', 'warroom')
    container.className = 'war-shell-view'
    column.appendChild(container)
    // view is the board COMPONENT; createRoot needs an element — wrap once.
    root = roots.createRoot(container)
    root.render(createElement(view))
  }

  // --- Visibility + sibling-panel mutual exclusion -----------------------
  const applyActive = (): void => {
    if (state.isOpen()) {
      for (const attr of OTHER_ACTIVE_ATTRS) document.documentElement.removeAttribute(attr)
      document.documentElement.setAttribute(ACTIVE_ATTR, '')
      document.dispatchEvent(new CustomEvent(ACTIVATE_EVENT, { detail: PANEL_NAME }))
    } else {
      document.documentElement.removeAttribute(ACTIVE_ATTR)
    }
    if (state.isOpen()) row.dataset.active = 'true'
    else delete row.dataset.active
  }
  const onOtherActivate = (event: Event): void => {
    const detail = (event as CustomEvent).detail
    if (detail !== PANEL_NAME) state.setOpen(false)
  }
  // Sidebar context clicks hand the center column back to the conversation
  // (capture phase: close before the shell processes the click).
  const onClickSidebarRow = (event: MouseEvent): void => {
    if (!state.isOpen()) return
    const target = event.target as HTMLElement | null
    if (target === null) return
    if (target.closest(SIDEBAR_ROW_SELECTOR) !== null) state.setOpen(false)
  }

  // The dock pill's home button (React side) asks the shell (DOM side) to
  // reopen the board — a document event, never shared module state (the
  // React/DOM boundary rule). Opening the board also refreshes the dock
  // pill's lastSeen marker (unread badge degrades silently without storage).
  const onOpenRequest = (): void => {
    state.setOpen(true)
    try { localStorage.setItem('warroom-last-seen', new Date().toISOString()) } catch { /* storage unavailable */ }
  }
  document.addEventListener('warroom-open-request', onOpenRequest)

  const bodyObserver = new MutationObserver(() => { placeRow(); ensureView() })
  bodyObserver.observe(document.body, { childList: true, subtree: true })
  document.addEventListener('click', onClickSidebarRow, true)
  document.addEventListener(ACTIVATE_EVENT, onOtherActivate)
  const unsubscribe = state.subscribe(applyActive)
  placeRow()
  ensureView()
  applyActive()

  return {
    close: () => state.setOpen(false),
    dispose: () => {
      bodyObserver.disconnect()
      document.removeEventListener('click', onClickSidebarRow, true)
      document.removeEventListener(ACTIVATE_EVENT, onOtherActivate)
      document.removeEventListener('warroom-open-request', onOpenRequest)
      unsubscribe()
      offSkin()
      document.documentElement.removeAttribute(ACTIVE_ATTR)
      root?.unmount()
      container?.remove()
      row.remove()
    },
  }
}
