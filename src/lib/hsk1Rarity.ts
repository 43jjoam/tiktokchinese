/**
 * HSK 1 rarity tiers and earliest-appearance-day assignments.
 *
 * Rarity controls population-level discovery order via weighted shuffle
 * (Efraimidis–Spirakis, same algorithm as CC1). Common characters cluster
 * near the front of most users' sequences; rare ones tend toward the back.
 *
 * earliest_appearance_day controls when after purchase a character enters
 * the user's feed — creating a gradual "drip" that rewards continued use.
 *
 * Weights: common = 3, moderate = 2, rare = 1.
 */
import type { Cc1Rarity } from './characterSequence'

// ─── Rarity tiers ────────────────────────────────────────────────────────────

/**
 * Rarity tier for each HSK 1 word_id.
 *
 * common   (35 words) — foundational everyday vocabulary; available from day 1.
 * moderate (34 words) — regularly used; unlocks on days 3–5 after purchase.
 * rare     (30 words) — specialised or complex; unlocks on days 7–14.
 */
export const HSK1_RARITY: Record<string, Cc1Rarity> = {
  // ── Common (weight 3) — 35 words ───────────────────────────────────────────
  // Highest-frequency Mandarin vocabulary; foundational from lesson 1.
  'hsk1-person-22':           'common',   // 人 rén   — person
  'hsk1-one-2':               'common',   // 一 yī    — one
  'hsk1-he-him-25':           'common',   // 他 tā    — he / him
  'hsk1-sheher-77':           'common',   // 她 tā    — she / her
  'hsk1-sky-74':              'common',   // 天 tiān  — sky / day
  'hsk1-small-87':            'common',   // 小 xiǎo  — small
  'hsk1-down-6':              'common',   // 下 xià   — down / below
  'hsk1-to-go-50':            'common',   // 去 qù    — to go
  'hsk1-to-come-114':         'common',   // 来 lái   — to come
  'hsk1-to-eat-53':           'common',   // 吃 chī   — to eat
  'hsk1-to-drink-65':         'common',   // 喝 hē    — to drink
  'hsk1-to-look-137':         'common',   // 看 kàn   — to look / watch
  'hsk1-to-speak-158':        'common',   // 说 shuō  — to speak / say
  'hsk1-to-learn-83':         'common',   // 学 xué   — to learn / study
  'hsk1-correct-86':          'common',   // 对 duì   — correct / right
  'hsk1-many-72':             'common',   // 多 duō   — many / much
  'hsk1-water-123':           'common',   // 水 shuǐ  — water
  'hsk1-home-family-85':      'common',   // 家 jiā   — home / family
  'hsk1-country-68':          'common',   // 国 guó   — country
  'hsk1-electricity-135':     'common',   // 电 diàn  — electricity (电话 电视 电脑)
  'hsk1-old-143':             'common',   // 老 lǎo   — old (老师 老板)
  'hsk1-to-be-born-134':      'common',   // 生 shēng — born / life (学生 先生 生活)
  'hsk1-year-92':             'common',   // 年 nián  — year
  'hsk1-moon-107':            'common',   // 月 yuè   — moon / month
  'hsk1-sun-101':             'common',   // 日 rì    — sun / day
  'hsk1-today-now-24':        'common',   // 今 jīn   — today / now
  'hsk1-hot-129':             'common',   // 热 rè    — hot
  'hsk1-cold-41':             'common',   // 冷 lěng  — cold
  'hsk1-high-tall-178':       'common',   // 高 gāo   — high / tall
  'hsk1-canbe-able-to-144':   'common',   // 会 huì   — can / be able to
  'hsk1-to-wantto-think-98':  'common',   // 想 xiǎng — to want / think
  'hsk1-to-return-67':        'common',   // 回 huí   — to return
  'hsk1-woman-76':            'common',   // 女 nǚ    — woman
  'hsk1-character-82':        'common',   // 字 zì    — character / word
  'hsk1-to-doto-make-32':     'common',   // 做 zuò   — to do / make

  // ── Moderate (weight 2) — 34 words ─────────────────────────────────────────
  // Regularly used vocabulary; introduced gradually over days 3–5.
  'hsk1-air-122':                    'moderate', // 气 qì    — air / weather
  'hsk1-book-14':                    'moderate', // 书 shū   — book
  'hsk1-car-vehicle-164':            'moderate', // 车 chē   — car / vehicle
  'hsk1-to-divide-44':               'moderate', // 分 fēn   — divide / minute
  'hsk1-fire-127':                   'moderate', // 火 huǒ   — fire
  'hsk1-fruit-116':                  'moderate', // 果 guǒ   — fruit
  'hsk1-happy-joy-64':               'moderate', // 乐 lè    — happy / joy
  'hsk1-language-157':               'moderate', // 语 yǔ    — language
  'hsk1-machine-113':                'moderate', // 机 jī    — machine (手机 飞机)
  'hsk1-money-170':                  'moderate', // 钱 qián  — money
  'hsk1-noodles-174':                'moderate', // 面 miàn  — noodles / face
  'hsk1-noon-49':                    'moderate', // 午 wǔ    — noon
  'hsk1-oclock-to-order-dot-128':    'moderate', // 点 diǎn  — o'clock / dot
  'hsk1-older-sister-80':            'moderate', // 姐 jiě   — older sister
  'hsk1-period-of-time-111':         'moderate', // 时 shí   — time (时间)
  'hsk1-please-or-to-invite-159':    'moderate', // 请 qǐng  — please / invite
  'hsk1-rain-172':                   'moderate', // 雨 yǔ    — rain
  'hsk1-school-117':                 'moderate', // 校 xiào  — school
  'hsk1-son-33':                     'moderate', // 儿 ér    — son / child
  'hsk1-star-104':                   'moderate', // 星 xīng  — star
  'hsk1-store-93':                   'moderate', // 店 diàn  — store / shop
  'hsk1-tea-147':                    'moderate', // 茶 chá   — tea
  'hsk1-teacher-91':                 'moderate', // 师 shī   — teacher (老师)
  'hsk1-to-appear-133':              'moderate', // 现 xiàn  — appear / now (现在)
  'hsk1-to-get-up-163':              'moderate', // 起 qǐ    — to get up
  'hsk1-to-live-28':                 'moderate', // 住 zhù   — to live (reside)
  'hsk1-to-thank-162':               'moderate', // 谢 xiè   — to thank
  'hsk1-to-write-40':                'moderate', // 写 xiě   — to write
  'hsk1-vegetable-dish-148':         'moderate', // 菜 cài   — vegetable / dish
  'hsk1-year-of-age-89':             'moderate', // 岁 suì   — year of age
  'hsk1-same-alike-54':              'moderate', // 同 tóng  — same / alike
  'hsk1-bright-light-21':            'moderate', // 明 míng  — bright / clear (明天)
  'hsk1-to-read-160':                'moderate', // 读 dú    — to read
  'hsk1-sleep-153':                  'moderate', // 睡 shuì  — to sleep

  // ── Rare (weight 1) — 30 words ─────────────────────────────────────────────
  // Specialised or complex vocabulary; scattered across days 7–14. Finding one
  // early feels like a lucky discovery worth sharing.
  'hsk1-appearance-or-type-118':     'rare',     // 样 yàng  — appearance / kind
  'hsk1-brain-145':                  'rare',     // 脑 nǎo   — brain (电脑)
  'hsk1-bright-103':                 'rare',     // 亮 liàng — bright (漂亮)
  'hsk1-capital-city-20':            'rare',     // 京 jīng  — capital (北京)
  'hsk1-chair-120':                  'rare',     // 椅 yǐ    — chair
  'hsk1-clothes-149':                'rare',     // 衣 yī    — clothes
  'hsk1-commerce-62':                'rare',     // 商 shāng — commerce / business
  'hsk1-cooked-rice-176':            'rare',     // 米 mǐ    — rice (cooked)
  'hsk1-courtyard-171':              'rare',     // 院 yuàn  — courtyard / yard
  'hsk1-doctor-47':                  'rare',     // 医 yī    — doctor / medicine
  'hsk1-dog-131':                    'rare',     // 狗 gǒu   — dog
  'hsk1-friend-109':                 'rare',     // 朋 péng  — friend (朋友)
  'hsk1-guest-84':                   'rare',     // 客 kè    — guest
  'hsk1-han-chinese-124':            'rare',     // 汉 hàn   — Han / Chinese (汉语)
  'hsk1-interest-excitement-38':     'rare',     // 兴 xìng  — interest / excitement
  'hsk1-know-how-to-27':             'rare',     // 懂 dǒng  — to understand
  'hsk1-measure-word-for-books-112': 'rare',     // 本 běn   — measure word (books)
  'hsk1-name-55':                    'rare',     // 名 míng  — name
  'hsk1-practice-13':                'rare',     // 练 liàn  — to practice
  'hsk1-shadow-95':                  'rare',     // 影 yǐng  — shadow / film (电影)
  'hsk1-table-119':                  'rare',     // 桌 zhuō  — table
  'hsk1-to-float-126':               'rare',     // 漂 piāo  — to float (漂亮)
  'hsk1-to-fly-175':                 'rare',     // 飞 fēi   — to fly
  'hsk1-to-make-29':                 'rare',     // 作 zuò   — to make / do (工作)
  'hsk1-to-rent-139':                'rare',     // 租 zū    — to rent
  'hsk1-to-sit-70':                  'rare',     // 坐 zuò   — to sit
  'hsk1-to-sleep-138':               'rare',     // 眠 mián  — to sleep (睡眠)
  'hsk1-to-tieto-fasten-142':        'rare',     // 系 jì    — to tie / fasten
  'hsk1-west-150':                   'rare',     // 西 xī    — west
  'hsk1-yesterday-105':              'rare',     // 昨 zuó   — yesterday
}

// ─── Earliest-appearance-day ──────────────────────────────────────────────────

/**
 * Day after purchase on which each character first becomes available in the
 * user's HSK 1 feed.
 *
 * common   → always day 1
 * moderate → day 3, 4, or 5 (fixed per character, randomised at authoring time)
 * rare     → day 7 through 14  (fixed per character, randomised at authoring time)
 *
 * Days are authored once and frozen so all users share the same unlock schedule.
 */
export const HSK1_EARLIEST_APPEARANCE_DAY: Record<string, number> = {
  // Common — all day 1
  'hsk1-person-22': 1, 'hsk1-one-2': 1, 'hsk1-he-him-25': 1,
  'hsk1-sheher-77': 1, 'hsk1-sky-74': 1, 'hsk1-small-87': 1,
  'hsk1-down-6': 1, 'hsk1-to-go-50': 1, 'hsk1-to-come-114': 1,
  'hsk1-to-eat-53': 1, 'hsk1-to-drink-65': 1, 'hsk1-to-look-137': 1,
  'hsk1-to-speak-158': 1, 'hsk1-to-learn-83': 1, 'hsk1-correct-86': 1,
  'hsk1-many-72': 1, 'hsk1-water-123': 1, 'hsk1-home-family-85': 1,
  'hsk1-country-68': 1, 'hsk1-electricity-135': 1, 'hsk1-old-143': 1,
  'hsk1-to-be-born-134': 1, 'hsk1-year-92': 1, 'hsk1-moon-107': 1,
  'hsk1-sun-101': 1, 'hsk1-today-now-24': 1, 'hsk1-hot-129': 1,
  'hsk1-cold-41': 1, 'hsk1-high-tall-178': 1, 'hsk1-canbe-able-to-144': 1,
  'hsk1-to-wantto-think-98': 1, 'hsk1-to-return-67': 1, 'hsk1-woman-76': 1,
  'hsk1-character-82': 1, 'hsk1-to-doto-make-32': 1,

  // Moderate — days 3, 4, or 5
  'hsk1-air-122': 3,
  'hsk1-book-14': 4,
  'hsk1-car-vehicle-164': 5,
  'hsk1-to-divide-44': 3,
  'hsk1-fire-127': 4,
  'hsk1-fruit-116': 5,
  'hsk1-happy-joy-64': 3,
  'hsk1-language-157': 4,
  'hsk1-machine-113': 5,
  'hsk1-money-170': 3,
  'hsk1-noodles-174': 4,
  'hsk1-noon-49': 5,
  'hsk1-oclock-to-order-dot-128': 3,
  'hsk1-older-sister-80': 4,
  'hsk1-period-of-time-111': 5,
  'hsk1-please-or-to-invite-159': 3,
  'hsk1-rain-172': 4,
  'hsk1-school-117': 5,
  'hsk1-son-33': 3,
  'hsk1-star-104': 4,
  'hsk1-store-93': 5,
  'hsk1-tea-147': 3,
  'hsk1-teacher-91': 4,
  'hsk1-to-appear-133': 5,
  'hsk1-to-get-up-163': 3,
  'hsk1-to-live-28': 4,
  'hsk1-to-thank-162': 5,
  'hsk1-to-write-40': 3,
  'hsk1-vegetable-dish-148': 4,
  'hsk1-year-of-age-89': 5,
  'hsk1-same-alike-54': 3,
  'hsk1-bright-light-21': 4,
  'hsk1-to-read-160': 5,
  'hsk1-sleep-153': 3,

  // Rare — days 7 through 14
  'hsk1-appearance-or-type-118':      7,
  'hsk1-brain-145':                   9,
  'hsk1-bright-103':                  11,
  'hsk1-capital-city-20':             14,
  'hsk1-chair-120':                   8,
  'hsk1-clothes-149':                 12,
  'hsk1-commerce-62':                 10,
  'hsk1-cooked-rice-176':             7,
  'hsk1-courtyard-171':               13,
  'hsk1-doctor-47':                   9,
  'hsk1-dog-131':                     11,
  'hsk1-friend-109':                  7,
  'hsk1-guest-84':                    14,
  'hsk1-han-chinese-124':             8,
  'hsk1-interest-excitement-38':      12,
  'hsk1-know-how-to-27':              10,
  'hsk1-measure-word-for-books-112':  7,
  'hsk1-name-55':                     13,
  'hsk1-practice-13':                 9,
  'hsk1-shadow-95':                   11,
  'hsk1-table-119':                   7,
  'hsk1-to-float-126':                14,
  'hsk1-to-fly-175':                  8,
  'hsk1-to-make-29':                  12,
  'hsk1-to-rent-139':                 10,
  'hsk1-to-sit-70':                   7,
  'hsk1-to-sleep-138':                13,
  'hsk1-to-tieto-fasten-142':         9,
  'hsk1-west-150':                    11,
  'hsk1-yesterday-105':               7,
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const RARITY_WEIGHT_MAP: Record<Cc1Rarity, number> = {
  common: 3,
  moderate: 2,
  rare: 1,
}

/** Weight for use with `weightedShuffleIds`. Defaults to 1 for unknown ids. */
export function getHsk1RarityWeight(wordId: string): number {
  const tier = HSK1_RARITY[wordId]
  return tier ? RARITY_WEIGHT_MAP[tier] : 1
}

/**
 * Day after purchase on which this HSK 1 word first becomes available.
 * Defaults to 1 for unknown ids.
 */
export function getHsk1EarliestAppearanceDay(wordId: string): number {
  return HSK1_EARLIEST_APPEARANCE_DAY[wordId] ?? 1
}
