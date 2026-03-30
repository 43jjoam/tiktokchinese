import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import './index.css'
import { initSyncOutbox } from './lib/syncOutbox'

initSyncOutbox()

type SrsDebug = {
  log: (wordId: string, label?: string) => number | undefined
  mScore: (wordId: string) => number | undefined
  word: (wordId: string) => Record<string, unknown> | undefined
}

/** Dev-only: SRS / mScore checks from the console. */
if (import.meta.env.DEV) {
  const WS_KEY = 'stealthSwipe.wordStates.v1'
  function readWordStates(): Record<string, Record<string, unknown>> {
    try {
      return JSON.parse(localStorage.getItem(WS_KEY) || '{}')
    } catch {
      return {}
    }
  }
  const api: SrsDebug = {
    log(wordId: string, label?: string) {
      const st = readWordStates()[wordId] as { mScore?: number; sessionsSeen?: number; lastSeenAt?: number } | undefined
      const m = st?.mScore
      console.log(
        `[SRS]${label ? ` ${label}:` : ''}`,
        wordId,
        'mScore =',
        m,
        st ? { sessionsSeen: st.sessionsSeen, lastSeenAt: st.lastSeenAt } : '',
      )
      return m
    },
    mScore(wordId: string) {
      return (readWordStates()[wordId] as { mScore?: number } | undefined)?.mScore
    },
    word(wordId: string) {
      return readWordStates()[wordId]
    },
  }
  ;(window as unknown as { __srsDebug: SrsDebug }).__srsDebug = api
  console.info('[SRS] Dev: __srsDebug.log("WORD_ID","before|after") · .mScore .word')
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)

