import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  ENGAGEMENT_LOCAL_CHANGED_EVENT,
  getLocalSavedWordIds,
  recordLocalShare,
} from '../engagementService'

describe('engagement local lists', () => {
  afterEach(() => {
    localStorage.clear()
    vi.restoreAllMocks()
  })

  it('recordLocalShare prepends word id', () => {
    const spy = vi.spyOn(window, 'dispatchEvent').mockImplementation((ev: Event) => {
      void ev
      return true
    })
    recordLocalShare('a')
    recordLocalShare('b')
    const raw = localStorage.getItem('tiktokchinese_engagement_shared_recent_v1')
    expect(raw).toBeTruthy()
    expect(JSON.parse(raw!)).toEqual(['b', 'a'])
    spy.mockRestore()
  })

  it('fires local-changed event on share', () => {
    const types: string[] = []
    const spy = vi.spyOn(window, 'dispatchEvent').mockImplementation((ev: Event) => {
      types.push(ev.type)
      return true
    })
    recordLocalShare('x')
    expect(types).toContain(ENGAGEMENT_LOCAL_CHANGED_EVENT)
    spy.mockRestore()
  })

  it('getLocalSavedWordIds is empty by default', () => {
    expect(getLocalSavedWordIds()).toEqual([])
  })
})
