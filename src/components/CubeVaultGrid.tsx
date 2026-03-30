import React from 'react'
import type { WordMetadata, WordState } from '../lib/types'
import { MasteryCube } from './MasteryCube'

type Props = {
  words: WordMetadata[]
  wordStates: Record<string, WordState | undefined>
  onPickWord: (w: WordMetadata) => void
}

export function CubeVaultGrid({ words, wordStates, onPickWord }: Props) {
  return (
    <div className="grid grid-cols-3 justify-items-center gap-x-2 gap-y-5 min-[400px]:grid-cols-4">
      {words.map((w) => (
        <MasteryCube
          key={w.word_id}
          word={w}
          wordState={wordStates[w.word_id]}
          onClick={() => onPickWord(w)}
        />
      ))}
    </div>
  )
}
