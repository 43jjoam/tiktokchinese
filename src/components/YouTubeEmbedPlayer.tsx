import React, { useEffect, useRef } from 'react'

let ytApiLoaded = false
const ytApiQueue: (() => void)[] = []

function suggestedYoutubeQuality(): string {
  if (typeof window === 'undefined') return 'medium'
  try {
    return window.matchMedia('(max-width: 480px)').matches ? 'small' : 'medium'
  } catch {
    return 'medium'
  }
}

/** Single-short infinite loop (TikTok-style) — IFrame API + ENDED fallback. */
function applyYoutubeLoop(player: any) {
  try {
    if (typeof player.setLoop === 'function') player.setLoop(true)
  } catch {}
  try {
    if (suggestedYoutubeQuality() === 'small' && typeof player.setPlaybackQuality === 'function') {
      player.setPlaybackQuality('small')
    }
  } catch {}
}

export function prefetchYouTubeIframeApi(): Promise<void> {
  return ensureYouTubeAPI()
}

function ensureYouTubeAPI(): Promise<void> {
  const YT = (window as any).YT
  if (YT?.Player) {
    ytApiLoaded = true
    return Promise.resolve()
  }
  return new Promise((resolve) => {
    ytApiQueue.push(resolve)
    if (document.querySelector('script[src*="youtube.com/iframe_api"]')) return
    const s = document.createElement('script')
    s.src = 'https://www.youtube.com/iframe_api'
    document.head.appendChild(s)
    const prev = (window as any).onYouTubeIframeAPIReady
    ;(window as any).onYouTubeIframeAPIReady = () => {
      try {
        prev?.()
      } catch {}
      ytApiLoaded = true
      for (const cb of ytApiQueue) cb()
      ytApiQueue.length = 0
    }
  })
}

type Props = {
  videoId: string
  onPlaying?: () => void
}

/** YouTube Shorts / watch embed: autoplay muted, loop, no controls. */
export function YouTubeEmbedPlayer({ videoId, onPlaying }: Props) {
  const hostRef = useRef<HTMLDivElement>(null)
  const playerRef = useRef<any>(null)
  const onPlayingRef = useRef(onPlaying)
  onPlayingRef.current = onPlaying
  const videoIdRef = useRef(videoId)
  videoIdRef.current = videoId
  const firedRef = useRef(false)

  useEffect(
    () => () => {
      if (playerRef.current) {
        try { playerRef.current.destroy() } catch {}
        playerRef.current = null
      }
    },
    [],
  )

  useEffect(() => {
    let cancelled = false
    let playingFallbackTimer: number | null = null
    let endedPollId: number | null = null

    const clearEndedPoll = () => {
      if (endedPollId !== null) {
        window.clearInterval(endedPollId)
        endedPollId = null
      }
    }

    const startEndedPoll = () => {
      if (endedPollId !== null) return
      endedPollId = window.setInterval(() => {
        if (cancelled || !playerRef.current) return
        try {
          const YT = (window as any).YT
          const p = playerRef.current
          if (p.getPlayerState?.() === YT.PlayerState.ENDED) {
            applyYoutubeLoop(p)
            p.seekTo(0, true)
            p.playVideo()
          }
        } catch {}
      }, 700)
    }

    const clearFallback = () => {
      if (playingFallbackTimer !== null) {
        window.clearTimeout(playingFallbackTimer)
        playingFallbackTimer = null
      }
    }

    const styleIframe = () => {
      const iframe = hostRef.current?.querySelector('iframe')
      if (iframe) {
        iframe.style.pointerEvents = 'none'
        iframe.style.width = '100%'
        iframe.style.height = '100%'
        iframe.style.border = '0'
      }
    }

    const firePlayingOnce = () => {
      if (cancelled || firedRef.current) return
      firedRef.current = true
      clearFallback()
      onPlayingRef.current?.()
    }

    const armFallback = () => {
      clearFallback()
      firedRef.current = false
      playingFallbackTimer = window.setTimeout(() => firePlayingOnce(), 1500)
    }

    const matchesCurrentVideo = (player: any) => {
      try {
        const vid = player?.getVideoData?.()?.video_id
        return !vid || vid === videoIdRef.current
      } catch {
        return true
      }
    }

    ;(async () => {
      await ensureYouTubeAPI()
      if (cancelled || !hostRef.current) return

      if (!playerRef.current) {
        const holder = document.createElement('div')
        hostRef.current.innerHTML = ''
        hostRef.current.appendChild(holder)

        const origin =
          typeof window !== 'undefined' && window.location?.origin
            ? window.location.origin
            : undefined

        playerRef.current = new (window as any).YT.Player(holder, {
          videoId,
          playerVars: {
            autoplay: 1,
            mute: 1,
            controls: 0,
            playsinline: 1,
            modestbranding: 1,
            rel: 0,
            fs: 0,
            iv_load_policy: 3,
            loop: 1,
            playlist: videoId,
            ...(origin ? { origin } : {}),
          },
          events: {
            onReady: (e: any) => {
              if (cancelled) return
              try {
                applyYoutubeLoop(e.target)
                e.target.mute()
                e.target.playVideo()
              } catch {}
              armFallback()
              styleIframe()
            },
            onStateChange: (e: any) => {
              if (cancelled) return
              const YT = (window as any).YT
              const st = e.data
              if (st === YT.PlayerState.PLAYING && matchesCurrentVideo(e.target)) {
                firePlayingOnce()
              }
              if (st === YT.PlayerState.ENDED) {
                try {
                  applyYoutubeLoop(e.target)
                  e.target.seekTo(0, true)
                  e.target.playVideo()
                } catch {}
              }
            },
            onError: () => {
              if (!cancelled) firePlayingOnce()
            },
          },
        })
        styleIframe()
        startEndedPoll()
      } else {
        armFallback()
        try {
          playerRef.current.loadVideoById({
            videoId,
            suggestedQuality: suggestedYoutubeQuality(),
          })
          applyYoutubeLoop(playerRef.current)
          playerRef.current.mute()
          playerRef.current.playVideo()
        } catch {
          firePlayingOnce()
        }
        styleIframe()
        startEndedPoll()
      }
    })()

    return () => {
      cancelled = true
      clearFallback()
      clearEndedPoll()
    }
  }, [videoId])

  return <div ref={hostRef} className="h-full w-full" />
}
