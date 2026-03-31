import { describe, expect, it } from 'vitest'
import { hsk1Words } from '../../data/hsk1Words'

describe('HSK 1 catalog (Library solid/gold cube → EngagementWordPlayer)', () => {
  it('every row has Supabase Storage fields + static video_url (matches missingVideo / signing path)', () => {
    expect(hsk1Words.length).toBeGreaterThan(0)
    const bad: string[] = []
    for (const w of hsk1Words) {
      const ok =
        w.use_video_url === true &&
        Boolean(w.video_storage_path?.trim()) &&
        Boolean(w.video_storage_bucket?.trim()) &&
        Boolean(w.video_url?.trim())
      if (!ok) bad.push(w.word_id)
    }
    expect(bad, `Rows missing Storage or video_url: ${bad.join(', ')}`).toEqual([])
  })

  it('every row has youtube_url from the HSK1 video log (Shorts fallback)', () => {
    const bad: string[] = []
    for (const w of hsk1Words) {
      if (!w.youtube_url?.trim()) bad.push(w.word_id)
    }
    expect(bad, `Rows missing youtube_url: ${bad.join(', ')}`).toEqual([])
  })
})
