Original prompt: redesign the coin, make it nicer and more realistic looking but still clean and slightly abstract; take
insp[iration from the design of the dices to make it match the design; keep it still gold; make sure the head side has
actual head and tails have eagle; the head and tail details do not need to be detailed but they need to have resemblence
of the head and eagle; the head and tail need to be slightly step out of the coin just like real coin

- Inspected `src/pages/coin-page.tsx` and `src/pages/dice-page.tsx` to align the coin with the dice material language.
- Plan: replace the flat cylinder with a beveled coin body, add a reeded edge, and build raised head/eagle relief
  geometry for each side.

- Implemented the coin redesign with a beveled body, raised relief artwork, layered face rings, and reeded edge
  geometry.
- Validation: `deno task check` passed; next step is browser inspection and visual tuning.
- Visual validation completed in a browser on `http://127.0.0.1:4173/`: heads and tails both render as raised reliefs,
  with the final tuning focused on brighter gold response and clearer face silhouettes.
- Follow-up pass requested: increased relief readability by adding stepped facial/eagle detail bands, shifting the marks
  off the hottest highlight, and softening the relief gloss so the icons read more clearly in-browser.

- Pulled external public-domain vector references for a head profile and eagle silhouette to rebuild the relief from
  clearer source landmarks.
- Replaced the hand-built relief blobs with SVG-derived shapes, switched the tails side to a clearer perching eagle
  reference, and added a secondary portrait step plus darker profile accents so the heads side reads more like a minted
  bust in-browser.
