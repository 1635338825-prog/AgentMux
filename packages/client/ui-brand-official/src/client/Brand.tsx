import type { SidebarBrandMarkOwnerProps } from '@deepseek-ai/dsh-client-ui-sidebar/client'

/**
 * Render the official mark with the presentation requested by its host surface.
 * @param props - Host-supplied mark presentation.
 * @returns the official whale mark.
 */
export function OfficialBrandMark({ size }: SidebarBrandMarkOwnerProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" fill="none" aria-hidden="true">
      <rect x="3" y="3" width="26" height="26" rx="8" fill="currentColor" opacity="0.1" />
      <path d="M10 11.5 16 8l6 3.5v9L16 24l-6-3.5v-9Z" stroke="currentColor" strokeWidth="1.7" />
      <circle cx="10" cy="11.5" r="2.25" fill="currentColor" />
      <circle cx="22" cy="11.5" r="2.25" fill="currentColor" />
      <circle cx="16" cy="24" r="2.25" fill="currentColor" />
      <circle cx="16" cy="15.6" r="3.1" fill="#F97316" />
    </svg>
  )
}

/**
 * Render the official name artwork without its independently slotted mark.
 * @returns the official name wordmark.
 */
export function OfficialBrandName() {
  return (
    <span aria-label="AgentMux" style={{ fontFamily: 'Bahnschrift, Segoe UI, sans-serif', fontSize: 19, fontWeight: 650, letterSpacing: '-0.035em' }}>
      Agent<span style={{ color: '#F97316' }}>Mux</span>
    </span>
  )
}
