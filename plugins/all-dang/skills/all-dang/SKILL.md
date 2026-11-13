---
name: all-dang
description: "Compact core brief for building an Age Evolution character (all -dang rules in one small skill); load first in every character chat, then load full stage skills only when needed."
author: "test"
---

# all-dang: core brief (formerly dang-all) (Age Evolution chibi character, `clo_t{t}_a{a}_lv{L}`)
Enough for a normal build. Load a full `-dang` skill ONLY when its stage starts or a detail is missing. Never reload loaded skills. Model routing: skill work = Sonnet; 3D = Opus medium.

## 1. Start of chat
1. Read project doc `claude/HANDOFF-start-here.md` (new chat). Check Blender MCP reachable. In the blend run `exec(open(r"D:\AI - Dang\SkillSet\_lib\dang_load.py").read())` (fixes BODY_base rotation, loads builders).
2. Kick-off checklist, ONE AskUserQuestion, once: asset name; concept + style ref/close-ups/library parts; tri budget; hero meshes (Tripo FBX); parts reused from previous level.
3. New-part gate before any modelling: score each concept component vs closest library part with `D:\AI - Dang\MODEL LIBRARY\_parts\gate_score.py` (`gate_obj`, `score_masks`). >=85 % reuse/adapt library part. <85 % = NEW OBJECT: do not build; one table (component, closest, score, why, crop) + one batched AskUserQuestion (max 4): (a) Claude builds it; (b) Tripo: short prompt + crop; user drops FBX in `D:\AI - Dang\`; then mirror +x half, collapse decimate X-sym (`lh_collapse_sym`, IoU >=0.97), colour class transfer from full-res mesh (3-nearest vote, mirrored).
4. One NEW chat per character; era in order lv1->lv11, each a visible upgrade, reusing previous parts; lv11 colours match lv12 weapon.

## 2. Stage map (load full skill only when)
| Stage | Skill | Load when |
|---|---|---|
| 1 Manifest + gate | concept-analyze-dang | manifest needs detail |
| 2 Build | character-outfit-loops-dang | part type not in section 6 (recipes A-X) |
| 2-3 Topology flow + density | topology-flow-density-dang | before first review, before export, or when the user marks topology |
| 3 Tri optimise | mesh-tri-optimize-dang | stage starts |
| 4 Colour | texture-shading-calibrate-dang | stage starts |
| 5 Export | character-unity-export-dang | user calls it |
| Library | model-library-train-dang | only when ingesting train data |
| Numbers | character-outfit-standards-dang | numeric lookup missing here |
Atlas manifest: `claude/atlas-color2-manifest.md`. Export early, iterate on Unity screenshots.

## 3. Paths and work root
- Work ONLY in `D:\AI - Dang\`. Never E: (full) or `C:\Users\HorusPC\Documents\zeus_backup\`; map old E:/C: paths to D:. Verify size > 0 after every save.
- Blends `D:\AI - Dang\BLENDER AI RESEARCH\<asset>\`; backups `...\_unity_backup\`; also `Bodybase Model\`, `Trained Model\`, `MODEL LIBRARY\` (`_parts\library_parts.json`), `SkillSet\_lib\`.
- Unity mesh `D:\UNITY PROJECT\runner-hybrid\Assets\Kho\Main_charater\mesh\`; atlas `D:\UNITY PROJECT\runner-hybrid\Assets\Kho\Assets\texture\color2.tga`.
- Remap: `body_MAT`->`M_body_lv1` guid 11f280544c5822642a25592daf49f256; `cloth_MAT`->`M_clo_color2` guid 7b21236d9decbc54292f3337be38e1ee.
- Versions: save `<file>_vNN_<topic>.blend` as copies, never overwrite; backup parts as fake-user meshes; backup `.fbx`+`.fbx.meta` before overwriting Unity files, keep existing meta.
- Structure: Empty `clo_t{t}_a{a}_lv{L}` (0,0,0) -> `body_lv{L}` (`body_MAT`) + ONE joined `qa_t{t}_a{a}_lv{L}` (`cloth_MAT`), one UV `UVMap`, origins (0,0,0), feet Z=0, faces -Y, exact names no `.001`.

## 4. Non-negotiable rules (run automatically BEFORE first review)
- Symmetric parts mirror-exact (build +x, mirror). Emblems copied by ROTATION, never mirrored; ONE reusable emblem part everywhere.
- Every ornament/stud/gem attached (embed 2-4 mm), nothing floating; 0 BVH overlaps except intended; delete faces hidden under other parts.
- Normals outside (`fix_normals_outside`) + render backface pass (`fid_pass`, once).
- Body: never delete anim body faces z 0.30-0.72 (thigh/knee/hip) + arms + any face with `LOOP_KEY` verts; never delete sole bottoms; never cull boots/knee ornaments (qa face z<0.47) or |x|>0.30 (arms). Deletable: faces fully inside closed boots (z<0.30), soles under boots+sandals, head under hood.
- Skirt hem shows boots in game camera; skirts end at knee; capes only if identity. One flat atlas tone per colour class on small faceted ornaments, no lit gradients.
- Exclude parts/bodybase collections from viewport after qa rebuild. Change ONLY what user names; keep accepted values. "Revert" = restore saved blend at once. After 2 failed attempts: library part or ask once for guide strokes/close-up.
- First check if user edited qa (compare with last `_act` export: vertex count, moved verts, sharp flags). Topology changed -> delivered qa is the source from then on: export as is, no rebuild from parts, fix directly on qa (back it up first).
- Layer order outward: body < dress < sleeves < cape < gold trims; sash/belt/brooch over dress. Body never shows (push dress+sleeves 3 mm out near ray-visible body). Overlap resolve = BVH pairs, push moving layer along fixed face normals 2-3 mm steps, mirror each step; 0 overlaps. ONE cape layer, gold border strips ON TOP of red (lift gold along normal / red >=7 mm under; ray-scan counts front-facing only). Mirror +x->-x by KDTree after every edit; merge centre verts, collapse slivers on x=0.
- Wrapping strips (sash, scarf ends): no edge >3-4 cm off dress (camera looks down, view ~(0,-0.6,1)); move whole cross-section rows, never one vertex; reset custom normals after moving verts. Line feedback on a silhouette: clamp verts to it, mirror, re-resolve, keep profile monotonic.
- Borders = straight constant-width strips on both edges; limb armour hugs limb (+6-8 mm); no tiny details/chains/bolts/engraving; painted detail never modelled; gems = faceted pyramid in bevelled frame; gold on gold does not read.
- Never decimate/remesh body or loop garments; never modify `Body_base.fbx` / `BodyBase_locked.blend`. Optimise by rebuilding with fewer segments or game-camera cull with frozen normals (front AND back), never uniform decimate.

## 5. Body base (`D:\AI - Dang\Bodybase Model\BodyBase_locked.blend`, obj `BODY_base`)
Height 1.85 (feet Z=0), span 1.756, faces -Y, left=+X, Z up; 656 verts, 1,308 tris; no armature/UV (copy `UVMap` from `BODY_v2`). verify 30 `LOOP_*` groups + `ZONE_hip` (39 verts, Z 0.50-0.66) + `LOOP_LOCK`; mismatch -> stop and tell user. After reload matrix may be identity: re-apply Rotation(+90 deg, X) (`dang_load` does). Key loops `LOOP_KEY`: elbow_a/b, knee_a/b/c (L,R) always survive on body or covering garment.
Clothes sit 0.03-0.06 off body (armour <=0.08). Garment: duplicate covered body faces into `OUT_<part>`, push out; parametric builders (face attr `comp`; copy `_lib` modules, never rewrite). Library first: look up piece type in `library_parts.json`.

## 6. Budgets and construction
- Level bands (total tris): lv11 4,600-6,000 (median ~5,000); lv9 3,750-5,100; lv5-7 3,750-4,750; classes clean 2,100-2,600, gear 2,900-3,600, layered 3,600-4,800; t10 ceiling 4,800. Body 126-792. User-set budget wins (record it; lv5 was cut <7K -> <=4K, final 3,457).
- Zone medians: head gear 940 - chest 880 - skirt/thigh 540 - boots 520 - hands/bracers 400 - shoulders 310 - belt 310 - knee/shin 220; optimise the furthest above first.
- Density follows part size (`claude/topology-density-library.md`): XL >0.4 m2 ~437 tris/m2 (edge ~6.9 cm), L ~746, M ~891, S ~1,784, XS stud ~10 tris. Big parts (dress, sleeves, cape) keep silhouette loops, even with each other, uniform arc-length columns; small parts minimal; tiny invisible ones deleted; even quads, no fans/slivers; check bands per part before first review.
- Good topology LOOKS clean in wire view (user judges front/back wire): every loop/column a straight (or smoothly curved) continuous line with even spacing; no kinked/zigzag vertex, no diagonal fans or poles mid-surface. Fix a bent loop: put its inner verts on the line between its end verts (keep each row height), project onto the surface, mirror, re-check overlaps, reset custom normals there (lv5 v85 sleeve back column).
- Topology: quads ~0.84 (>=0.75 armour), valence-4 >=0.55, n-gons <=3.5 %, all smooth; sharp: gems/frames/emblems >20 deg, gold/rims >30, leather >50, faceted >1; cloth/body never.
- Piece tri bands (median): boot 196 (128-522) - shoulder_pad 153 - bracer 144 - skirt_flap 116 - sleeve 80 - shoulder_blade 70 - strap 58 - gem 46 (22-60) - horn 44 - pants 288 - torso_shirt 386 (239-662) - belt_band 180 - helmet_hood 368 (96-508) - chest_plate 178 .
- Construction (T2): one piece = one shell = one atlas strip; L/R exact mirrors; trims/gems/frames/studs separate shells (no boolean). Shirt = open shell, sleeves grow from armhole ring. Head gear: delete body head, cap 12-16 seg; hood/helmet ONE open shell, spikes separate. Boot = one open shell + separate toe cap/cuff; sandal sole from foot hull +16 mm. Bracer = ring 8 + flared plate. Shoulder = frame plate + 3-4 blade fan. Gem = double pyramid; stud = 3-tri pyramid; horn = 4-6-sided tube sunk 4 cm. Ragged hem = zigzag.
- Segment floors: armour shells/boots/ankle 10 sides; arm bands 8; medallion/buckle/emblem 12 seg (rim torus 5; sunburst divisible by 4); belt 12; collar 10x4; animated cloth 2 loops waist->hem.
- Game-camera cull (stage 3 skill): all azimuths x elev 30-85, frozen normals, run LAST.
- Game camera above; player sees front AND back; check both; legs/feet visible.

## 7. Colour essentials
- Atlas `color2.tga` fixed: only UVs move, never paint/bake/extend. One material, one UV map, islands inside the region `uv_rect`, >=1 px margin.
- `Vt(reg,t)`: t=0 BRIGHT end, t=1 dark; bright end up for cloth. Gradient strips for everything; short slice per part (16-36 % of strip); one region per shell. Narrow strips: U at centre (`flatten_u78`).
- Strips (bright->dark): gold D38 #fdfad2->#7a380c - leather/cream C29 - silver A18 - dark bronze/black D29 - sand E16 - white metal/fur D24 - cyan gem D35 - dark red-brown D30 - red D13 - teal steel A30 - purple D11 - cream cloth C31 - blue D34 - fire A16 - dark cloth/steel E22 - white cloth D31.
- Cloth: gradient + AO, gems/emblems no AO. Metal by orientation (`metal_shade78`), not height gradient (skulls D38 t_hi 0.56/t_lo 0.99/p 1.3; dark horns E22 0.40/1.0/2.2; dark panels uniform E22 0.80->0.93).
- Lion/faceted style (user): one flat atlas tone per colour class + one darker tone for faces pointing down in the ornament's OWN up axis; no AO, no gradients; same mesh+texture on every instance.
- Unity brightens ~2.5x: gold ~76 L* in Unity (~52 flat), white 80-92 (never clip). "A bit brighter" = 0.05-0.1 in t, re-export, wait for Unity screenshot.

## 8. Export: `finish(root, qa, body_dl, parts_coll, hide_colls, changed, export_path, blend_copy)`
ONE call from finished parts to FBX in Unity: normals outside -> edge rules -> rebuild qa -> backups -> game-camera cull (protects anim body, soles, boots, arms) -> backface pass -> ACT export (name swap, origin snap <=1 mm to 0,0,0, fbx+meta backup, remap check). Re-exports keep the `.meta`; a new FBX has none until Unity imports (user focuses Unity once). Verify mtime changed, size > 0. Materials from another blend (`bpy.data.libraries.load`) make `*.001`: remove loaded meshes, purge orphans, confirm materials are exactly body_MAT/cloth_MAT; after export FBX bytes contain cloth_MAT+body_MAT and no "MAT.001". Re-export of user-edited qa (no rebuild): `act_export(root, body, qa, export_path, blend_copy)` from `D:\AI - Dang\SkillSet\_lib\dang_finish.py`; save `_vNN_user_edit.blend` + `_act` copies; main file keeps only root/body/qa, parts in `_parts.blend`.

## 9. Token-lean rules
- ONE review sheet per round (<=2 JPG, <=1800 px wide, views <=300 px): concept | front | back | 3/4 | game cam front+back | close-ups; only after automatic checks pass. FLAT render for colour.
- Ask user to send ALL feedback of a round in one message (numbered list or one marked screenshot); never fix one item per message; several valid readings -> one short multiple-choice question.
- Short outputs, small renders, <=1 image per check.
- New chat per character AND per phase (build -> optimise/export -> fix rounds) with a short handoff note; never let one chat reach ~800K context (every call re-reads it). Target <=150M tokens/character; log time per round.
- Cost lesson: lv5 ~650M processed tokens (~98 % cache re-reads), ~$215, 84 versions, ~8.5 h = 2x lv11 (300-400M, ~5 h, 25 versions). Half the time (v56-v84) was post-export fix rounds. Run the full check set BEFORE the first export: 0 overlaps, body covered, symmetry, gold over red, density bands, top-down game-camera render, front/back.
- End of asset: project note, ingest to library, propose <=3 skill updates.