# Items, meals, charms, gear and activities

## 1. Overview
Items carry weight (18 kg pack, more with the satchel and vigour). Meals give timed buffs (two at most). Charms
(one worn). Gear is permanent. Activities turn time into goods: fishing, mining, gathering; services turn crowns
into body: the bathhouse, the inn, the chapel.

## 2. Player fantasy
A practical life: you eat what you caught, sell what you found, and plan a trip by what is in your pack.

## 3. Detailed rules
1. Meals (cook at a hearth): stew (hearty), tea (clear head), honey cakes (sweet tooth), fish supper (warm belly),
   mushroom stew (forager), roast boar (stout), grilled trout (keen eye), omelette (hearty), berry tart (fleet).
2. Buffs: at most two; a third replaces the one closest to running out; cooking skill lengthens them 6% per level.
3. Charms: hare's foot (+6% speed), iron nail (shades, drowned, hollowed, wraith, engine hit 15% softer), owl feather
   (+20% mana regen at night), copper coil (Spark −25% mana, +1 jump), salt locket (fewer wounds, no soaking),
   four-leaf clover (+15% loot, longer fish bite).
4. Fishing: needs a rod; cast; a bite comes after 4–12 s (quicker at dawn, dusk and in rain); click within the
   window (0.75 s + 0.06 per Woodcraft level) to land trout, eel or bream.
5. Mining: needs a pick; 12 game minutes; 1 copper (+1 with forager or a Woodcraft roll); deep seams 30% ward-copper.
6. Gathering: herbs and moonpetal (Vale), mushrooms and thornberries (Thornwood), windfall apples (once a day).
7. Services: bath 4 crowns (hygiene 100, comfort +25, stress −15, steamed buff), inn bed 3, coach 6.

8. v0.8: lake and marsh fishing (perch, eel, pike), heather and bilberry gathering, four meals (fried perch, pike pie, bilberry cake, heather tea), two buffs (*Night eyes*, *Grounded*), three charms (rowan sprig, hag stone, Orm's circlet), barrow gold, fen waders; the Heron and Reed (bed free after *The Drowned Road*). Numbers in `westmarch.md` §4.

## 4. Formulas
- Fish wait = `(4 + rand × 8) × (dawn/dusk 0.6) × (rain/overcast 0.8)` s; window = `0.75 + 0.06·survival (+0.1 clover)` s.
- Extra find chance = `0.08 + 0.04·survival` (gathering), `0.1 + 0.03·survival` (mining).
- Carry cap = `18 + (satchel 6) + 0.6·vigor` kg.

## 5. Edge cases
- Fishing ends if you move; a missed bite still costs 8 minutes.
- Nodes regrow each morning; moonpetal shows only at night.

## 6. Dependencies
Body (meals), economy (prices), skills (Woodcraft, cooking), world (spots and nodes).

## 7. Tuning knobs
`B.ITEMS` weights, `MEALS` values, `BUFFS` durations, `B.SHOPS`, fish/mine/gather yields, `BATH_COST`, `INN_ROOM_COST`.

## 8. Acceptance criteria
- Fishing, mining, gathering, meals, services → tests "fishing: …", "mining needs a pick…", "new meals give their buffs…",
  "Ashford services…"; browser "striking on the bite lands a fish", "a pick works the copper seam…", "picking Thornwood mushrooms".
