# Stealth-Learning Swipe (PRD v6.3)

This repo contains a simple prototype webpage implementing the PRD's core interaction model:
- Full-screen feed feel (TikTok-style)
- Permanent word + pinyin overlay
- Gestures: tap (L1 meaning), double-tap (like), long-press (breakdown), swipe left/right (scoring)
- 20-video adaptive alpha proxy + localStorage memory state (demo)

## Run

```bash
npm install
npm run dev
```

Open the URL shown in the terminal (usually `http://localhost:5173`).

## Notes

The source `.docx` couldn't be parsed directly by the editor, so I extracted it via `python-docx` into `prd_extracted.txt` for reference.

Some numeric placeholders/equation pieces were blank in the extracted text, so the MVP uses calibrated, demo-safe constants for decay and consistency multipliers.

