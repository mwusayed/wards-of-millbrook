# Economy and the debt

## 1. Overview
Aunt Ysolde left you a house and 300 crowns owed to Aldric Voss (Ledger & Ward), paid weekly as in Mercenary
Maintenance. Crowns come from work, loot and quests; they go on food, rounds, gear, services and the debt.

## 2. Player fantasy
Always slightly short. Every purchase is a decision; paying an instalment early feels like a victory.

## 3. Detailed rules
1. Debt starts at 300; 60 is due by the end of each 7-day cycle at Aldric's clerk.
2. Missing an instalment adds 15 to the debt, −15 Tower standing, +20 stress. Two misses: Debt Called (game over).
3. Shops: Millbrook market (Sera/Bram), Dorran's forge (gear), the Tankard, the Chapel; in the Reach: farm gate,
   apothecary, gunsmith, fishmonger, charm shop, pedlar, Lodge stores (`B.SHOPS`).
4. Selling: every trader buys; each pays 25% more for the goods they want (`buys` list).
5. The Millbrook Trust holds savings at 3% a week, safe from collapse fees.
6. Debt relief: stones to the Tower (50/60), the audit (120–150), the seam's heart (80), Aldric's verdict.

## 4. Formulas
- Market price = `round(base × (1 − town/400))` (`priceOf`); Reach price = `round(base × (1 − faction/400) × marketDay 0.85 × scarred 1.05)` (`shopPrice`).
- Sell price = `SELL[id] × (1 + town/400)` (`sellPrice`); at a Reach trader × 1.25 if wanted × `(1 + faction/400)` (`sellPriceAt`).
- Contract pay = `pay × (1 + issuerStanding/200) × (scouted 1.15)` (`contractPay`).
- Interest = `max(1, round(savings × 0.03))` weekly.

## 5. Edge cases
- Selling your worn charm unequips it.
- Debt reaching 0 at any time triggers "debt cleared" and the free-and-clear ending path.

## 6. Dependencies
Factions (prices), work (income), story (relief), body (collapse fee).

## 7. Tuning knobs
`START_DEBT 300`, `INSTALMENT 60`, `MISSED_INSTALMENT_PENALTY 15`, `MISSES_TO_GAMEOVER 2`, `SAVINGS_INTEREST 0.03`, every `SHOP`/`SHOPS` price, `SELL` table.

## 8. Acceptance criteria
- Traders: standing lowers prices, wanted goods pay more, charms worn one at a time → test "traders: standing lowers prices…".
- Bank deposits survive a collapse and earn interest → test "bank: deposits survive a collapse and earn weekly interest".
