# Animation

## 1. Overview
Procedural rigged characters (17 joints) with hand-authored clips as pure functions of time or gait phase
(`src/render/rig.ts`), a spring-driven first-person viewmodel (`viewmodel.ts`), and beasts with their own gaits.

## 2. Player fantasy
Bodies with weight: feet that grip the ground, a lean into the turn, a flinch when hit, a gun that kicks and settles.

## 3. Detailed rules
1. Clips are followed exactly while they play; a change of clip (`key`) or a sudden joint jump starts an inertial
   blend: the old pose's offset decays with a critically damped spring.
2. Gait phase advances by distance travelled (stride length grows with speed); knees flex in swing and load at
   contact; ankles roll; hips yaw, roll and sway; chest counter-rotates; head stays level.
3. Strafing turns the hips toward the movement; backpedalling plays the cycle backwards; holstered characters face
   their direction of travel.
4. Additive layers: look-at (head, neck, chest), flinch (underdamped spring), lean (acceleration and turn rate),
   landing dip with leg compensation, cape trailing.
5. Townsfolk fidget every 7–19 s when idle and carry the tool for their work; heads turn to you within 7 m.
6. First person: figure-eight bob on the gait phase, inertial sway, sprint carry, landing dip, recoil and camera kick
   springs, draw/holster, staged reloads, idle inspect after 14 s.

## 4. Formulas
- Inertial blend: `x(t) = (x0 + (v0 + w·x0)·t)·e^(−w·t)`, `w = max(5, 0.8·sharp)` (`decay`).
- Stride length: walk `clamp(1.05 + 0.26·v, 1.1, 2.25)` m, run `2.5 + 0.02·v` m; phase += `2π·v·dt / length`.
- Lean target: pitch `clamp(−0.018·accel − 0.006·speed, −0.16, 0.12)`, roll `clamp(0.022·yawRate·min(speed,7), ±0.2)`.

## 5. Edge cases
- Far townsfolk (75 m) and enemies (120 m) skip animation.
- Robed characters have no leg meshes; their leg joints still exist so poses stay uniform.

## 6. Dependencies
Player controller, NPCs, enemies, bosses, viewmodel, camera.

## 7. Tuning knobs
Blend sharpness per caller (10–30), stride formula, lean gains, flinch spring (15/13 rad/s, ζ 0.42), bob amplitudes.

## 8. Acceptance criteria
- Gait phase advances with distance and joints stay finite → browser "gait phase advances with distance…".
- Side-on frames of walk, run, holstered walk, strafe, backpedal → evidence `anim-sheet.png`.
