import type { SimpleIcon } from 'simple-icons'
import { siFacebook, siGmail, siGooglemessages, siImessage, siInstagram, siWhatsapp } from 'simple-icons'

const box = 'h-12 w-12 shrink-0 rounded-2xl flex items-center justify-center bg-white shadow-sm'

/** Renders a [Simple Icons](https://simpleicons.org/) mark (CC0) on a white tile. */
function SimpleBrandIcon({ icon, className }: { icon: SimpleIcon; className?: string }) {
  return (
    <div className={`${box} ${className ?? ''}`} aria-hidden>
      <svg viewBox="0 0 24 24" width={26} height={26} aria-hidden>
        <path fill={`#${icon.hex}`} d={icon.path} />
      </svg>
    </div>
  )
}

export function IconFacebook({ className }: { className?: string }) {
  return <SimpleBrandIcon icon={siFacebook} className={className} />
}

export function IconInstagram({ className }: { className?: string }) {
  return <SimpleBrandIcon icon={siInstagram} className={className} />
}

export function IconSms({ className }: { className?: string }) {
  const icon =
    typeof navigator !== 'undefined' && /Android/i.test(navigator.userAgent) ? siGooglemessages : siImessage
  return <SimpleBrandIcon icon={icon} className={className} />
}

export function IconWhatsApp({ className }: { className?: string }) {
  return <SimpleBrandIcon icon={siWhatsapp} className={className} />
}

export function IconEmail({ className }: { className?: string }) {
  return <SimpleBrandIcon icon={siGmail} className={className} />
}

const neutralBox = 'h-12 w-12 shrink-0 rounded-2xl flex items-center justify-center bg-white/15 ring-1 ring-white/20 shadow-sm'

export function IconSystemShare({ className }: { className?: string }) {
  return (
    <div className={`${neutralBox} ${className ?? ''}`} aria-hidden>
      <svg viewBox="0 0 24 24" width={24} height={24} fill="none" stroke="#fff" strokeWidth="1.75" strokeLinecap="round" aria-hidden>
        <path d="M12 3v10M8 7l4-4 4 4" />
        <rect x="5" y="11" width="14" height="10" rx="2" />
      </svg>
    </div>
  )
}

export function IconLink({ className }: { className?: string }) {
  return (
    <div className={`h-12 w-12 shrink-0 rounded-2xl flex items-center justify-center bg-white/[0.06] ring-1 ring-white/15 ${className ?? ''}`} aria-hidden>
      <svg viewBox="0 0 24 24" width={22} height={22} fill="none" stroke="rgba(255,255,255,0.85)" strokeWidth="1.75" aria-hidden>
        <path d="M10 13a5 5 0 0 1 0-7l1-1a5 5 0 0 1 7 7l-1 1" />
        <path d="M14 11a5 5 0 0 1 0 7l-1 1a5 5 0 0 1-7-7l1-1" />
      </svg>
    </div>
  )
}
