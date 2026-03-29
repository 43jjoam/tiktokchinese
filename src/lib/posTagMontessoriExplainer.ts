import type { PosTag } from './posTag'

/** Main screen heading */
export const GRAMMAR_PAGE_INTRO_TITLE = 'Word types in Chinese'

/** One short lead — colors are only a visual tag */
export const GRAMMAR_PAGE_INTRO_LEAD =
  'Mandarin groups words by jobs in a sentence: naming things, doing actions, measuring, linking, and so on. Colors match those jobs so lists and tiles are easy to scan (same spirit as Montessori grammar colors, without the extra theory).'

/** What this role means for learners of Chinese — one tight sentence each */
export const POS_TAG_ROLE_IN_CHINESE: Record<PosTag, string> = {
  noun:
    '名词 (míngcí): names a person, thing, place, or idea — the “who / what” in a sentence (e.g. 书, 水, 家).',
  verb:
    '动词 (dòngcí): the action or change — what happens or what someone does (e.g. 读, 吃, 去).',
  adjective:
    '形容词 (xíngróngcí): describes a noun — size, feeling, quality (e.g. 大, 冷, 好).',
  classifier:
    '量词 (liàngcí): the “measure word” Chinese puts between a number and many nouns — 一本书, 一个人 (e.g. 本, 个).',
  adverb:
    '副词 (fùcí): narrows a verb or adjective — degree, negation, or manner (e.g. 很, 不, 都).',
  conjunction:
    '连词 (liáncí): hooks words or short phrases together (e.g. 和 “and” when we tag it that way).',
  preposition:
    '介词 (jiècí): shows relationship in space, time, or logic — “at / from / to” style roles (e.g. 在, 对) when tagged here.',
  pronoun:
    '代词 (dàicí): points to someone or something without naming it again (e.g. 我, 你, 他, 她).',
  interjection:
    '感叹词 (gǎntàncí): a quick reaction or call — exclamations and fillers (e.g. 啊, 哎).',
  multi_class:
    '多功能 / 兼类: grammar-heavy or mixed-role items — e.g. structural particles (的), or one character that acts as more than one part of speech depending on context.',
}

/** Optional tiny footer links (no long notes) */
export const GRAMMAR_PAGE_FOOTER_LINKS: { label: string; url: string }[] = [
  { label: 'Montessori AMI', url: 'https://www.montessori-ami.org/' },
  { label: 'AMS — About Montessori', url: 'https://amshq.org/About-Montessori' },
]
