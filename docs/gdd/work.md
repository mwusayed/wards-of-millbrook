# Work: contracts, the Lodge, ledger shifts, cases and the audit

## 1. Overview
Two ways to earn: the contract board (sweeps, couriers, recoveries, bounties; Mercenary Maintenance archetypes)
and clerk work at the Counting House (real debit/credit postings; Home Office Tycoon) with Boss Attention
(Ledger & Ward). From v0.7 the Wardens' Lodge in Ashford posts harder work in the Reach.

## 2. Player fantasy
A mercenary by day and a bookkeeper by morning: the gun pays better, the ledger is safer.

## 3. Detailed rules
1. Boards refresh each morning: Millbrook (3 sweeps, courier, recovery, a bounty every other day) and the Lodge
   (3 sweeps in the Reach, a courier, a bounty every third day) (`generateBoard`, `generateLodgeBoard`).
2. One active notice at a time, from either board; you are paid at the board that posted it.
3. Prep (MM): armour up (−25% damage), pack supplies (no extra drain), scout (+15% pay).
4. Sweeps spawn their enemies at the site; recoveries put guarded goods at the site's cairn (carry back, no sprinting).
5. Ledger shift: 5 entries in 4 hours, 11 crowns per correct posting; errors raise Boss Attention (80 review, 100 fired).
6. Cases (reconciliation, invoice investigation) and the Red Ink audit pay more and feed the story.

## 4. Formulas
- Lodge sweep pay = `34 + 11·n + (bandit 14 | boar 10) + rand(0..12)`; Millbrook = `20 + 9·n + (shade 10) + rand(0..10)`.
- Shift pay = `correct × 11 × ledgerPayMult` where `ledgerPayMult = (1 + 0.04·ledger) × (clean hands 1.1)`.
- Attention: +5 per error, +8 filthy, +8 injured, −2 per day.

## 5. Edge cases
- Notices expire at the end of their day; expiry costs −4 standing with the issuer.
- Lodge enemies spawn only when you are more than 30 m from the site, so they are never created in view.

## 6. Dependencies
Economy, factions, enemies, world sites and cairns.

## 7. Tuning knobs
Pay formulas, counts per notice, `SHIFT_ENTRIES 5`, `PAY_PER_CORRECT 11`, attention thresholds.

## 8. Acceptance criteria
- The Lodge posts east notices daily with a bounty every third day → test "the Lodge posts east notices…".
- Taking a Lodge notice spawns its enemies → browser "the Lodge board offers east notices and spawns them".
