/**
 * Per-user randomised CC1 character sequence.
 *
 * Each user gets a weighted shuffle of all CC1 word_ids generated once and
 * persisted to localStorage + Supabase `user_learning_profiles.character_sequence`.
 * Characters are revealed in this order as the user's available quota grows.
 *
 * Rarity controls population-level discovery order — common characters cluster
 * near the front of most users' sequences; rare characters tend toward the back.
 * This is social rarity: almost everyone shares common characters, while rare
 * characters feel like lucky discoveries.
 */
import { getSupabaseClient } from './deckService'
import type { AppMeta } from './storage'
import type { WordMetadata, WordState } from './types'

const CHAR_SEQ_LOCAL_KEY = 'tiktokchinese_cc1_character_sequence'

// ─── Rarity tiers ────────────────────────────────────────────────────────────

export type Cc1Rarity = 'common' | 'moderate' | 'rare'

/**
 * Rarity tier for each CC1 word_id.
 *
 * common   (weight 3) — everyday vocabulary; clusters near the front of most
 *                       users' sequences so almost everyone shares them.
 * moderate (weight 2) — known but not universal; spread across the first half.
 * rare     (weight 1) — specialised or unusual; clusters toward the back.
 *                       Finding one early feels like a lucky discovery.
 */
export const CC1_RARITY: Record<string, Cc1Rarity> = {
  // ── Common (weight 3) ── 21 characters ──────────────────────────────────
  'M-dad-01__爸': 'common',   // 爸 dad
  'M-sendout-04': 'common',   // 发 send / emit
  'M-hair-05':    'common',   // 发 hair
  'M-hitdrum-06': 'common',   // 打 hit / play
  'M-big-07':     'common',   // 大 big
  'M-horse-08':   'common',   // 马 horse
  'M-of-22':      'common',   // 的 possessive particle — most frequent Chinese character
  'M-rice-37':    'common',   // 米 rice
  'M-no-46':      'common',   // 不 no / not — second-most-frequent Chinese character
  'M-step-47':    'common',   // 步 step
  'M-cloth-48':   'common',   // 布 cloth
  'M-mother-51':  'common',   // 母 mother
  'M-eyecontact-53': 'common', // 目 eye / objective
  'M-wood-54':    'common',   // 木 wood — fundamental radical
  'M-topay-56':   'common',   // 付 pay
  'M-father-57':  'common',   // 父 father
  'M-rich-59':    'common',   // 富 rich
  'M-blessing-61': 'common',  // 福 blessing — highly culturally significant
  'M-clothes-63': 'common',   // 服 clothes / serve
  'M-toread-70':  'common',   // 读 read
  'M-measure-66': 'common',   // 度 degree / measure

  // ── Moderate (weight 2) ── 25 characters ────────────────────────────────
  'M-fear-03':    'moderate',  // 怕 fear
  'M-climb-09':   'moderate',  // 爬 climb
  'M-silent-20':  'moderate',  // 默 silent
  'M-morals-24':  'moderate',  // 德 virtue / morals
  'M-budda-25':   'moderate',  // 佛 buddha
  'M-compel-26':  'moderate',  // 逼 compel / force
  'M-pen-28':     'moderate',  // 笔 pen / writing brush
  'M-close-29':   'moderate',  // 闭 close
  'M-criticize-30': 'moderate', // 批 criticize / batch
  'M-skin-31':    'moderate',  // 皮 skin
  'M-tired-33':   'moderate',  // 疲 tired
  'M- lost-36':   'moderate',  // 迷 lost / fascinated
  'M-dense-38':   'moderate',  // 密 dense / secret
  'M-secret-39':  'moderate',  // 秘 secret
  'M-drop-40':    'moderate',  // 滴 drop
  'M-bottom-42':  'moderate',  // 底 bottom
  'M-brother-43': 'moderate',  // 弟 younger brother
  'M-throwoneself-49': 'moderate', // 扑 pounce / throw oneself
  'M-woman-58':   'moderate',  // 妇 woman
  'M-tocarry-60': 'moderate',  // 负 carry / bear
  'M-tohelpup-62': 'moderate', // 扶 support / help up
  'M-rotten-64':  'moderate',  // 腐 rotten
  'M-belly-67':   'moderate',  // 肚 belly
  'M-poison-68':  'moderate',  // 毒 poison
  'M-toblock-71': 'moderate',  // 堵 block

  // ── Rare (weight 1) ── 20 characters ────────────────────────────────────
  'M-scold-10':   'rare',      // 骂 scold
  'M-brodcast-11': 'rare',     // 播 broadcast
  'M-uncle-12':   'rare',      // 伯 paternal uncle (father's elder brother)
  'M-splash-13':  'rare',      // 泼 splash
  'M-oldwoman-14': 'rare',     // 婆 old woman / mother-in-law
  'M-tobreak-15': 'rare',      // 破 break / worn
  'M-totouch-16': 'rare',      // 摸 touch / feel
  'M-rub-17':     'rare',      // 摩 rub / friction
  'M-apply-18':   'rare',      // 抹 apply
  'M-wipe-19':    'rare',      // 抹 wipe
  'M-foam-21':    'rare',      // 沫 foam / bubbles
  'M- nose-27':   'rare',      // 鼻 nose
  'M-rogue-32':   'rare',      // 痞 ruffian / rogue
  'M-fart-34':    'rare',      // 屁 fart
  'M-meow-35':    'rare',      // 咪 meow
  'M-flute-41':   'rare',      // 笛 flute
  'M-waterfall-50': 'rare',    // 瀑 waterfall
  'M-unitofarea-52': 'rare',   // 亩 unit of area (mǔ)
  'M-curtain-55': 'rare',      // 幕 curtain / act
  'M-tostroke-65': 'rare',     // 抚 stroke / comfort
}

const RARITY_WEIGHT: Record<Cc1Rarity, number> = {
  common: 3,
  moderate: 2,
  rare: 1,
}

function getRarityWeight(id: string): number {
  const tier = CC1_RARITY[id]
  return tier ? RARITY_WEIGHT[tier] : 1
}

// ─── Weighted shuffle ─────────────────────────────────────────────────────────

/**
 * Weighted shuffle using the Efraimidis–Spirakis algorithm.
 *
 * Each item receives key = random ^ (1 / weight). Items with higher weights
 * produce larger expected keys and therefore sort to the front. This preserves
 * randomness within each tier while biasing common characters toward early
 * positions across the user population.
 *
 * Does not mutate input.
 */
export function weightedShuffleIds(ids: string[], getWeight: (id: string) => number): string[] {
  return ids
    .map((id) => ({ id, key: Math.random() ** (1 / getWeight(id)) }))
    .sort((a, b) => b.key - a.key)
    .map((x) => x.id)
}

// ─── Quota ───────────────────────────────────────────────────────────────────

/**
 * Available free CC1 character quota:
 * 20 (base) + bonus_cards_unlocked (referral/server bonus) + streak_bonus_cards (local streak bonus).
 */
export function getAvailableQuota(meta: AppMeta): number {
  return 20 + (meta.bonusCardsUnlocked ?? 0) + (meta.streakBonusCards ?? 0)
}

// ─── localStorage persistence ─────────────────────────────────────────────────

export function loadLocalCc1Sequence(): string[] | null {
  try {
    const raw = localStorage.getItem(CHAR_SEQ_LOCAL_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as unknown
    if (!Array.isArray(parsed) || parsed.some((x) => typeof x !== 'string')) return null
    return parsed as string[]
  } catch {
    return null
  }
}

export function saveLocalCc1Sequence(seq: string[]): void {
  try {
    localStorage.setItem(CHAR_SEQ_LOCAL_KEY, JSON.stringify(seq))
  } catch {
    /* ignore */
  }
}

// ─── Cloud persistence ────────────────────────────────────────────────────────

async function persistSeqToCloud(seq: string[]): Promise<void> {
  const supabase = getSupabaseClient()
  if (!supabase) return
  try {
    const {
      data: { session },
    } = await supabase.auth.getSession()
    if (!session?.user?.id) return
    await supabase
      .from('user_learning_profiles')
      .update({ character_sequence: seq })
      .eq('user_id', session.user.id)
  } catch {
    /* ignore */
  }
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Synchronous: return the CC1 sequence immediately.
 * Reads localStorage first; if absent, generates a new weighted shuffle,
 * saves locally, and fires a background cloud persist (fire-and-forget).
 */
export function ensureCc1Sequence(cc1WordIds: string[]): string[] {
  const local = loadLocalCc1Sequence()
  if (local && local.length > 0) return local
  const seq = weightedShuffleIds(cc1WordIds, getRarityWeight)
  saveLocalCc1Sequence(seq)
  void persistSeqToCloud(seq)
  return seq
}

/**
 * Called after sign-in: bidirectional sync between localStorage and Supabase.
 * - Supabase has sequence  → write to localStorage (cloud is authoritative).
 * - Supabase has no sequence → write local (or freshly generated) to Supabase.
 */
export async function syncCc1SequenceFromCloud(cc1WordIds: string[]): Promise<void> {
  const supabase = getSupabaseClient()
  if (!supabase) return
  try {
    const {
      data: { session },
    } = await supabase.auth.getSession()
    if (!session?.user?.id) return

    const { data } = await supabase
      .from('user_learning_profiles')
      .select('character_sequence')
      .eq('user_id', session.user.id)
      .maybeSingle()

    const cloudSeq = data?.character_sequence
    if (Array.isArray(cloudSeq) && cloudSeq.length > 0 && cloudSeq.every((x) => typeof x === 'string')) {
      // Cloud is authoritative — overwrite local
      saveLocalCc1Sequence(cloudSeq as string[])
      return
    }

    // Cloud has no sequence — push local (or generate) to cloud
    const local = loadLocalCc1Sequence()
    const seq = local && local.length > 0 ? local : weightedShuffleIds(cc1WordIds, getRarityWeight)
    saveLocalCc1Sequence(seq)
    await supabase
      .from('user_learning_profiles')
      .update({ character_sequence: seq })
      .eq('user_id', session.user.id)
  } catch {
    /* ignore */
  }
}

/**
 * Filter CC1 words to those within the user's available quota, ordered by their
 * sequence position. Words the user has already watched (sessionsSeen > 0) are
 * always included even if outside the quota window.
 */
export function filterCc1WordsByQuota(
  cc1Words: WordMetadata[],
  sequence: string[],
  quota: number,
  wordStates: Record<string, WordState | undefined>,
): WordMetadata[] {
  const clampedQuota = Math.max(0, quota)
  const byId = new Map(cc1Words.map((w) => [w.word_id, w]))
  const added = new Set<string>()
  const result: WordMetadata[] = []

  // Primary: words within quota, in sequence order
  for (const id of sequence.slice(0, clampedQuota)) {
    const w = byId.get(id)
    if (w && !added.has(id)) {
      result.push(w)
      added.add(id)
    }
  }

  // Secondary: any watched words that fell outside the quota window
  for (const w of cc1Words) {
    if (!added.has(w.word_id)) {
      const st = wordStates[w.word_id]
      if (st && st.sessionsSeen > 0) {
        result.push(w)
        added.add(w.word_id)
      }
    }
  }

  return result
}
