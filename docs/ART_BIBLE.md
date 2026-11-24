# Wards of Millbrook — art bible

The visual rules for procedural art. Every model is built in code from primitives (ADR-003), so this bible is
about shapes, proportions, colour and light rather than textures.

## 1. Pillars

1. **Lamplight against the dark.** Warm lamps, hearths and windows against cool dusk and black interiors. Night must
   feel dangerous outdoors and safe indoors.
2. **Hand-made frontier.** Timber, plaster, stone and thatch; nothing machined except the Reach's copper and the
   Engine's brass. Slight irregularity (rotated rocks, leaning posts) beats grids.
3. **Readable at a glance.** Flat-shaded faces, strong silhouettes, one dominant colour per object. A player should
   tell a crossbowman from a miner at 30 m.

## 2. Shape and scale

| Thing | Rule |
|---|---|
| People | 1.75 m tall, 17 joints. Silhouette carried by hat, coat, apron, cape or robe |
| Doors | 1.2–1.6 m wide, 2.2 m tall; always a visible frame or lintel |
| Houses | Walls 3–4 m, roofs pitched 30–40°, overhang 0.3–0.5 m; chimneys on hearth walls |
| Town halls, inns | Two storeys (6–7 m), a sign by the door |
| Paths | Lighter than grass; towns paved, roads packed earth |
| Trees | Instanced; trunk plus 2–3 stacked cones or blobs; canopies block the third-person camera |
| Interiors | Ceiling 3.2 m or more so the third-person camera fits |

## 3. Palette

Shared materials live in `MAT` (`render/world.ts`). Use these before inventing a colour.

| Material | Hex | Use |
|---|---|---|
| stone / stoneDark | `#8d8676` / `#5f5a50` | Walls, wells, bridges |
| plaster | `#d8cdb4` | House walls |
| timber / wood / woodLight | `#5a3d26` / `#8a6240` / `#a98258` | Frames / furniture / new planks |
| roof / roofSlate / thatch | `#7a3b2a` / `#4a5260` / `#b8964f` | Tile (Millbrook), slate (Ashford), thatch (farms) |
| cloth / clothBlue / linen | `#7d2f2f` / `#2f4f7d` / `#e8e0cc` | Awnings, banners, sheets |
| grass / path | `#5f7d3c` / `#9c8a68` | Ground |
| leaf / leafDark / bark | `#3f6b30` / `#2f5426` / `#4a3524` | Trees |
| water | `#3d6f8f` (rough 0.2) | Wells, river, lake |
| iron / brass | `#3b3d40` / `#b08a3c` (metallic) | Tools, guns / fittings, the Engine |
| glow / fire / rune | `#ffd27a` / `#ff9a3a` / `#8fd0ff` (unlit) | Lamp glass, flames, wards |

Regions each own an accent: Millbrook red tile and plaster; the Vale moss and grey stone; the Eastern Reach slate,
copper (`#b87333`) and river teal; the West (v0.8) heather purple, barrow turf and lake blue.

## 4. Light

- Sun warm at dawn and dusk, white at noon, off at night; hemisphere light keeps shadows from going black.
- Point lights come from the pool of six (ADR-004). Every lamp model has emissive glass so it reads as lit even
  when no pool light serves it.
- Interiors: no sun, close fog, torch colour `#ffb060`–`#ff9040`; the chapel cold green-blue; the mine amber.

## 5. Motion

See `docs/gdd/animation.md`. Bodies have weight: lean into turns, plant feet, flinch when hit, settle after landing.

## 6. Naming

- Shared materials: `MAT.<name>`. One-off materials: `M(hex, opts)` inside the builder that uses them.
- Builders: `build<Place>(world)` in `render/<place>.ts`, returning the references the game animates.
- Instanced props: `put('<region>:<prop>', …)` keys, so one kind of prop is one draw call.

## 7. Review

Every new place gets scripted screenshots (day and night where it matters) in `docs/qa/evidence/<version>/`,
checked against this bible: silhouettes readable, palette respected, lamps glowing, nothing floating or sunk.
