import { useCallback } from 'react'

type RevisionPath = 'buy' | 'invite' | 'tomorrow'

type Props = {
  path: RevisionPath
  inviteUrl: string
  onCopyInvite: () => void
  onOpenShop: () => void
}

export function RevisionModeBanner({ path, inviteUrl, onCopyInvite, onOpenShop }: Props) {
  const copyInvite = useCallback(async () => {
    const text = inviteUrl.trim() || window.location.origin + '/'
    try {
      await navigator.clipboard.writeText(text)
    } catch {
      try {
        const ta = document.createElement('textarea')
        ta.value = text
        ta.setAttribute('readonly', '')
        ta.style.position = 'fixed'
        ta.style.left = '-9999px'
        document.body.appendChild(ta)
        ta.select()
        document.execCommand('copy')
        document.body.removeChild(ta)
      } catch {
        /* ignore */
      }
    }
    onCopyInvite()
  }, [inviteUrl, onCopyInvite])

  return (
    <div
      role="status"
      className="pointer-events-auto relative z-[80] w-full border-b border-white/10 bg-zinc-900/95 px-4 py-2.5 backdrop-blur-sm"
    >
      {path === 'buy' ? (
        <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
          <p className="text-xs leading-snug text-white/70">
            Revising your characters \u2014 enter your activation code in the Library tab to unlock 100 new ones.
          </p>
          <button
            type="button"
            onClick={() => window.dispatchEvent(new CustomEvent('tiktokchinese:go-to-library'))}
            className="shrink-0 text-xs font-semibold text-indigo-300 underline-offset-2 hover:underline"
          >
            Go to Library \u2192
          </button>
        </div>
      ) : path === 'invite' ? (
        <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
          <p className="text-xs leading-snug text-white/70">
            Revising your characters \u2014 new ones unlock the moment your friend joins.
          </p>
          <button
            type="button"
            onClick={() => void copyInvite()}
            className="shrink-0 text-xs font-semibold text-sky-300 underline-offset-2 hover:underline"
          >
            Copy link again \u2192
          </button>
        </div>
      ) : (
        <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
          <p className="text-xs leading-snug text-white/70">
            Revising your characters \u2014 10 new ones arrive tomorrow.
          </p>
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => void copyInvite()}
              className="shrink-0 text-xs font-semibold text-sky-300 underline-offset-2 hover:underline"
            >
              Invite a friend \u2192
            </button>
            <button
              type="button"
              onClick={onOpenShop}
              className="shrink-0 text-xs font-semibold text-amber-300 underline-offset-2 hover:underline"
            >
              Buy now \u2192
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
