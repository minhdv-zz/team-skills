---
name: "game-ready-mesh"
description: "Fix/optimize an existing 3D model (Tripo/Meshy/AI mesh, GLB/FBX/OBJ) into a clean game-ready mesh in Blender: topology, edge loops, tri budget, holes, n-gons, pivots, UV, Unity export."
author: Kienkhooc
---

# Game-Ready Mesh

Use this skill whenever the user mentions retopology, cleaning up a Tripo/AI model, game-ready, low-poly optimization, tri budget, edge loops, topology, non-manifold or holes, n-gons, pivot/origin/axis problems, or preparing a model for Unity/Unreal/web, even if they do not say "game-ready" (Vietnamese triggers: "sửa model", "sửa tổng thể", "tối ưu mesh", "retopo", "dọn topology", "giảm poly", "lỗ thủng", "xuất Unity").

Goal: take a model that already exists (Tripo output) and bring it to a measurable "game-ready" standard. Work is **audit -> plan -> fix -> re-audit -> export**. Never declare done without a passing re-audit.

Blender is driven through the Blender MCP tools (execute_blender_code etc.). The helper code from the original skill folder is embedded at the end of this file (Appendix C, D); paste it into execute_blender_code before calling its functions.

Reference baselines: two accepted ships (`Marine_01_ct`, `Pirate_01_ct`). Measured stats and known gaps are in Appendix B. Treat them as the quality bar for *style and density*, not as perfect examples.

## Reference images
Reference images are optional and are not bundled with this skill. If the user provides an `assets/` folder (loop_flow_hull.png, pirate_wire_*.png, bad_vs_good_topology_*.png), open the relevant ones with Read; otherwise rely on the written standard and the numbers in the appendices.

- **Request is a whole-model fix** ("sửa tổng thể", "fix this model", "make it game-ready", full cleanup): read **all** images in `assets/` first, then audit.
- **Otherwise read only the images relevant to the request**:
  | Request touches | Read |
  |---|---|
  | loop flow, edge density, hull/curved shapes | `loop_flow_hull.png`, `pirate_wire_side.png` |
  | front silhouette, symmetry, mast/flag alignment | `pirate_wire_front.png` |
  | deck layout, top view, bottom faces, top-down camera | `pirate_wire_top.png`, `bad_vs_good_topology_top.png` |
  | what "bad vs good" looks like, n-gons, cleanup quality | `bad_vs_good_topology_font.png` (front), `bad_vs_good_topology_side.png`, `bad_vs_good_topology_top.png` |
  | overall quality bar or style/density | `loop_flow_hull.png` + the three `pirate_wire_*.png` |
  If no image matches, read none and rely on the written standard.
- Images = target look (silhouette, loop direction, density); numbers in the appendices = target metrics.
- `bad_vs_good_topology_font.png` is spelled "font" on disk (meant "front").
- Image contents: `loop_flow_hull.png` hull loop flow, good density; `pirate_wire_front/side/top.png` wireframe ortho views of Pirate; `bad_vs_good_topology_*` Tripo source vs cleaned result.

## Axis convention (Unity)
- Unity: Y up, +Z forward, left-handed, 1 unit = 1 m. In Blender work Z up with the model's front facing -Y.
- Export FBX: Forward `-Z`, Up `Y`, Apply Scalings `FBX Units Scale`, Apply Transform on; export glTF with +Y up. After import in Unity the root must show rotation (0,0,0), scale (1,1,1) and the bow/front facing +Z. Verify by importing, do not assume.
- The baseline ships carry a 90 deg X rotation on the root empty while their local geometry is already Y-up/Z-length (Unity-style). That rotation is a Blender display compensation; keep this setup only if the export check passes, otherwise bake it into the geometry.

## 0. Before touching anything
1. Ask or infer: asset class (budget table, Appendix A), will it be animated/rigged, camera type (free 3D vs fixed top view: decides bottom faces). Target engine defaults to **Unity**.
2. Save a copy (`<name>_pre_fix`). Keep the original Tripo mesh hidden in a `_source` collection as the shape reference.
3. Run `audit()` (Appendix C, read-only) on every mesh object. Record the report; it is the "before".

## 1. The standard (what "done" means)
1. **Budget**: tris <= budget for the asset class. Count tris, not quads.
2. **Clean topology**: quads by default. No n-gons on the final mesh. Triangles only where unavoidable (pole closures, tapering ends, flat caps) and < ~25% of faces. Poles (valence != 4) sit on flat or hidden areas, never in the middle of a curved silhouette.
3. **Even loop flow**: edge loops follow the form (hull ribs, around mast, around barrel), quads roughly square, uniform density across a surface unless intentionally graded. Loops continue across part boundaries instead of dead-ending.
4. **Curvature-driven density**: count loops from arc angle, not by eye (Appendix A). Flat areas get few loops; tight curvature gets more; silhouette edges get priority over interior ones.
5. **No visible holes**: judged from the outside, not by raw boundary-edge count.
   - Faces hidden inside the model (cannot be seen when orbiting around the outside) are **deleted on purpose**; the resulting open edges are fine.
   - A hole you can see through, or a face showing its **red back side (Face Orientation overlay) from the outside**, is a defect: flip normals or fill the hole.
   - No non-manifold edges (3+ faces on one edge), no loose verts, no internal floating faces that are visible.
   - Single-sided sheets (sail, flag, thin plank) may stay open; list them in the report.
   - **Bottom faces**: if the game uses a fixed top-down camera the team deletes bottom faces. This is a project decision: **ask the user before deleting or keeping the bottom**, never decide silently.
6. **Consistent part orientation**: all parts of one asset share the same local axes as the root. Repeated parts (guns, oars, wheels, hatches) are identical shapes with the same orientation, ideally **linked duplicates** (same mesh data).
7. **Rig/anim-ready pivots**: object origin at the real pivot (turret ring, hinge, mast base, wheel center). Scale (1,1,1) and rotation (0,0,0) applied on every child. Parent root has no leftover import rotation (the 90 deg X-rotation must be baked or declared). Moving parts are separate objects or clearly separated shells; names clean and consistent.
8. **Symmetry**: if the form is symmetric, it is *exactly* symmetric on one declared axis (>= 98% mirror-matched verts); consider a mirror-modifier workflow while editing.
9. **UV / material**: one non-overlapping UV layout (or deliberate overlap for tiling), consistent texel density, no stretched islands, seams on hidden or hard edges, <= 4 material slots, textures present on disk and packed/relinked. Missing image = fail.
10. **Normals / shading**: face normals consistent per shell; hard edges marked (sharp_edge or custom normals) rather than extra geometry; no shading artifacts at the default camera.
11. **Naming & hierarchy**: `<Asset>_<Part>` pattern, root empty/group at world origin, axis convention documented in the export report.

## 2. Workflow

### Step A - Audit
Run `audit()` per object, then the visual pass: wireframe overlay, Face Orientation overlay, Statistics overlay, front/side/top vs the `_source` shape (use viewport screenshots/renders). Summarise: fail / warn / info list, tri count vs budget.

### Step B - Plan (write it down before editing)
- Which parts are kept as-is, rebuilt, merged/split.
- Target tri budget per part (by visual importance and silhouette).
- Orientation and pivot decisions per part.
Present the plan to the user if any part would change shape noticeably.

### Step C - Fix (least destructive first)
1. Mechanical cleanup: `fix_basics()` (Appendix D). Re-audit.
2. Decide per part: **keep + clean**, **decimate-then-clean** (only if topology is chaotic and shape is simple), or **retopo** (new clean mesh wrapping the source with Shrinkwrap; preferred for hulls and organic shapes). Decimate is never the final answer on a visible mesh.
3. Rebuild loops for curved surfaces using the density table. Add loops at silhouette-critical curves, remove loops in flat zones (Dissolve Edges / limited dissolve, then re-fix poles).
4. Holes: delete faces hidden from every outside view (intentional); fill or flip anything visible from outside. Ask about bottom faces if the camera is unknown. Re-verify no non-manifold edges.
5. Orientation and pivots: apply scale/rotation, fix the root rotation, set origins (`set_origin_to_point`), convert identical parts to linked duplicates (Object > Link/Transfer Data > Link Object Data) and re-place them.
6. UV: unwrap with seams on hidden/hard edges, pack with consistent texel density, relink textures.
7. Normals: mark sharp edges (~30-45 deg), keep custom normals only if the exporter preserves them.

### Step D - Re-audit and compare
Re-run the audit. Compare silhouette against `_source` from front/side/top. If the silhouette drifted visibly, undo the last destructive step.

### Step E - Export
glTF/GLB for web/runtime, FBX for rigged/animated in Unity/Unreal (Appendix A, Export). Transforms applied, one declared axis convention. Re-import the exported file and run the audit once more on it.

Suggested output layout on the user's computer: `E:\AI_nghiencuu\SKILL\game-ready-mesh\output\<asset>\` with `<asset>_pre_fix.blend`, `<asset>_game_ready.blend`, the export file, `before.json`, `after.json`, `reimport.json`, and before/after/normals screenshots (front, side, top, perspective).

## 3. Reporting back to the user
Always finish with a short table: check | before | after | status, plus a list of intentional exceptions (e.g. "sail_L is an open single-sided sheet, kept"). Do not claim "game-ready" if any `fail` remains. Reply in Vietnamese if the user writes in Vietnamese.

## 4. Things Claude should NOT do
- Do not run Decimate/Remesh on a final mesh and call it done.
- Do not apply modifiers or merge objects without consent when parts are meant to animate separately.
- Do not "fix" a visible hole by deleting the faces around it, and do not delete bottom faces without asking about the camera.
- Do not change dimensions or world-space position of parts without telling the user.
- Do not trust poly counts alone; many Tripo meshes are within budget but have bad topology.

---

## Appendix A - Budgets, density, export (starting points, calibrate per project)

### Triangle budgets by asset class (final LOD0)
| Class | Tris |
|---|---|
| Background prop | < 500 |
| Mid prop | 500 - 5,000 |
| Large vehicle / ship / building hero | 5,000 - 15,000 (baseline ships ~7-8k body+parts) |
| Mobile hero character | 15,000 - 30,000 |
| PC/console hero character | 50,000 - 150,000 |

Budget is distributed by silhouette importance: main form first, small details last. Details < ~1% of screen size at the default camera should be texture, not geometry.

### Loop count from curvature
- Background / small: ~45 deg per segment (8 segs per full circle)
- Standard: ~22.5 deg per segment (16 per circle)
- Hero / close-up silhouette: ~15 deg per segment (24 per circle)
- A 90 deg rounded corner: 2 segments (standard) to 4 (hero)
- Flat panel: 0 interior loops; only border loops needed for UV/shading
- Hard edge: bevel with 1 segment *or* sharp marking; no support loops if the engine uses normal maps/baked shading
- Deforming bend points (limbs, rope): 3 loops at the joint
Silhouette edges get the density; interior curved faces can use one step lower.

### Topology rules
- Quads first. Triangle OK at a pole, taper tip or flat cap. Never an n-gon in the final.
- Poles: valence 3 and 5 allowed; >= 6 only on flat or hidden spots, off the main silhouette.
- Loops terminate at natural features (plank edges, hull rim, mast base), not mid-face.
- Quads roughly square; stretch < 2:1 unless intentionally elongated.
- Avoid thin slivers and coplanar internal faces.

### Holes / watertightness
- Each solid shell: zero boundary edges, zero non-manifold edges, zero loose verts.
- Allowed open shells: single-sided sheets (sail, flag, banner, leaf). Document them; back-face culling off or 0.01-0.02 thickness.
- Bridge or Grid Fill to close; no internal faces.

### Orientation and rig-readiness
- One convention per project (e.g. Z up, -Y forward in Blender -> Y up, +Z forward in Unity). Write it in the export report.
- Root empty at world origin, rotation 0, scale 1. No leftover 90 deg X-rotation unless the exporter is configured for it.
- Children: rotation and scale applied, origin at pivot.
- Mirrored parts made from one source; repeated parts share mesh data; variants get a suffix.

### UV / texture
- UVs in 0-1, no unintended overlaps, padding >= 4 px at 1024, consistent texel density.
- Seams on hidden or hard edges.
- Textures next to the .blend or packed; absolute paths to a missing drive = fail.
- sRGB for color, Non-Color for normal/ORM.

### Export
- GLB/glTF: web, runtime, mobile. Apply transforms, +Y up, only needed attributes (position, normal, UV).
- FBX: rigged/animated for Unity/Unreal. Apply scale = FBX All, forward/up per convention, no leaf bones when rigged.
- Always re-import the exported file in a clean scene and rerun the audit.

## Appendix B - Baseline: Marine_01_ct and Pirate_01_ct (measured in Blender)

### Scene structure
- Each ship = one empty root rotated 90 deg on X, children: hull/body mesh, `co` mesh (flag/ensign part), `gun1`, `gun2`, `gun3`.
- Children: scale 1, rotation 0, origins at (0,0,0), parts positioned by location offsets.
- Marine hull `base`: 4,376 verts / 4,446 faces / 7,682 tris. Pirate hull `body`: 4,134 verts / 4,149 faces / 7,068 tris. Dimensions ~5.8 x 12.1 x 13.06 (local X x Y x Z; Y = height incl. masts, Z = length).
- Guns: 61 verts / 60 faces / 108 tris each (identical across ships; gun2 mirrored in Z).
- `co`: 108 tris (Marine) / 428 tris (Pirate).
- UV: 1 layer per mesh. Custom normals present. 1 material per ship referencing `color.tga`.

### Topology numbers (Pirate hull `body`)
- 2,827 quads, 1,296 tris (31%), 26 n-gons (5, 8, 9, 16 sides).
- Valence 4 = 2,421 verts, 3 = 1,106, 5 = 294, 6+ ~ 240 (7.6% outside 3-5).
- 85 shells; 69 have boundary edges (planks/sails/rigging sheets, open hull parts).
- No non-manifold edges, no loose verts.
- Mirror-match on local X: 86% (Pirate), 93% (Marine hull).

### Copy this style
- Moderate density: ~7k tris for a 13-unit ship.
- Clean small parts (guns): quads, no n-gons, consistent orientation.
- Hull built from many separate shells: selective edits and per-part pivots possible.

### Known gaps (do not treat as acceptable)
1. n-gons (26 on hull). Standard: 0.
2. Tri ratio ~31%. Standard: <= 25%.
3. 69/85 open shells. Hidden interior faces deleted on purpose is fine; only holes/red back-faces visible from outside are defects. Bottom faces removed only for fixed top-view games.
4. Root 90 deg X rotation; keep only if the Unity import check passes.
5. `color.tga` not loaded (0x0): relink/pack before judging materials.
6. gun1/gun2/gun3 and .001 copies own separate mesh data, not linked duplicates.
7. Hull symmetry not exact.

## Appendix C - audit_mesh.py (read-only; run via execute_blender_code)

```python
import bpy, bmesh, math
from collections import Counter
from mathutils import Vector

CFG = dict(
    tri_budget=None,          # set per asset class, e.g. 8000 for a hero ship
    max_ngon_ratio=0.0,
    max_tri_ratio=0.25,
    max_pole_ratio=0.10,      # verts with valence not in (3,4,5)
    sym_tol=0.005,
    min_sym=0.98,
    scale_tol=1e-4,
)

def _islands(bm):
    seen, comps = set(), []
    for v in bm.verts:
        if v.index in seen:
            continue
        st, comp = [v], []
        while st:
            x = st.pop()
            if x.index in seen:
                continue
            seen.add(x.index); comp.append(x)
            st += [e.other_vert(x) for e in x.link_edges]
        comps.append(comp)
    return comps

def _mirror_ratio(bm, axis):
    from mathutils.kdtree import KDTree
    kd = KDTree(len(bm.verts))
    for v in bm.verts:
        kd.insert(v.co, v.index)
    kd.balance()
    ok = 0
    for v in bm.verts:
        m = v.co.copy(); m[axis] = -m[axis]
        if kd.find(m)[2] < CFG["sym_tol"]:
            ok += 1
    return ok / max(1, len(bm.verts))

def audit(obj, cfg=None):
    c = dict(CFG); c.update(cfg or {})
    r = {"object": obj.name, "checks": {}}
    chk = r["checks"]
    def put(key, status, detail):
        chk[key] = {"status": status, "detail": detail}
    me = obj.data
    bm = bmesh.new(); bm.from_mesh(me)
    nf = len(bm.faces)
    tris = sum(len(f.verts) - 2 for f in bm.faces)
    sides = Counter(len(f.verts) for f in bm.faces)
    if c["tri_budget"]:
        put("tri_budget", "pass" if tris <= c["tri_budget"] else "fail", f"{tris}/{c['tri_budget']} tris")
    else:
        put("tri_budget", "info", f"{tris} tris (no budget set)")
    ngon = sum(v for k, v in sides.items() if k > 4) / max(1, nf)
    tri = sides.get(3, 0) / max(1, nf)
    put("ngons", "pass" if ngon <= c["max_ngon_ratio"] else "fail", f"{ngon:.1%} n-gons {dict(sides)}")
    put("tri_ratio", "pass" if tri <= c["max_tri_ratio"] else "warn", f"{tri:.1%} triangles")
    val = Counter(len(v.link_edges) for v in bm.verts)
    odd = sum(n for k, n in val.items() if k not in (3, 4, 5)) / max(1, len(bm.verts))
    put("poles", "pass" if odd <= c["max_pole_ratio"] else "warn",
        f"{odd:.1%} verts outside valence 3-5; {dict(sorted(val.items()))}")
    isl = _islands(bm)
    open_shells = sum(1 for comp in isl if any(e.is_boundary for v in comp for e in v.link_edges))
    nonman = sum(1 for e in bm.edges if not e.is_manifold and not e.is_boundary)
    loose = sum(1 for v in bm.verts if not v.link_edges)
    put("shells", "info", f"{len(isl)} shells, {open_shells} open (have boundary edges). "
        "Open is OK only for intentional single-sided sheets (sail, flag, plank) - confirm per shell.")
    put("non_manifold", "pass" if nonman == 0 and loose == 0 else "fail",
        f"{nonman} non-manifold (3+ faces/edge) edges, {loose} loose verts")
    cen = sum((v.co for v in bm.verts), Vector()) / max(1, len(bm.verts))
    inward = sum(1 for f in bm.faces if f.normal.dot(f.calc_center_median() - cen) < 0)
    put("normals_hint", "info", f"{inward}/{nf} faces point toward centroid. Not an error for concave hulls - verify with Face Orientation overlay.")
    s_ok = all(abs(s - 1) < c["scale_tol"] for s in obj.scale)
    r_ok = all(abs(a) < c["scale_tol"] for a in obj.rotation_euler)
    put("applied_transform", "pass" if s_ok and r_ok else "warn",
        f"scale={tuple(round(s,3) for s in obj.scale)} rot_deg={tuple(round(math.degrees(a),1) for a in obj.rotation_euler)}")
    p = obj.parent
    if p is not None:
        pr = tuple(round(math.degrees(a), 1) for a in p.rotation_euler)
        put("parent_rotation", "pass" if all(abs(a) < 0.1 for a in pr) else "warn",
            f"parent '{p.name}' rot_deg={pr} (import leftover? fix on the root, then export with a documented axis)")
    sym = {a: round(_mirror_ratio(bm, i), 3) for i, a in enumerate("XYZ")}
    put("symmetry", "pass" if max(sym.values()) >= c["min_sym"] else "warn",
        f"mirror-match {sym} (needs >= {c['min_sym']} on the intended axis)")
    put("uv", "pass" if me.uv_layers else "fail", f"{len(me.uv_layers)} UV layer(s)")
    put("materials", "pass" if len(obj.material_slots) <= 4 else "warn", f"{len(obj.material_slots)} slot(s)")
    for slot in obj.material_slots:
        if slot.material and slot.material.use_nodes:
            for n in slot.material.node_tree.nodes:
                if n.type == "TEX_IMAGE" and (n.image is None or n.image.size[0] == 0):
                    put("texture_" + slot.material.name, "fail",
                        f"image '{n.image.name if n.image else None}' missing/unloaded")
    r["mesh_data"] = {"name": me.name, "users": me.users}
    r["summary"] = {"fail": [k for k, v in chk.items() if v["status"] == "fail"],
                    "warn": [k for k, v in chk.items() if v["status"] == "warn"],
                    "tris": tris, "verts": len(bm.verts)}
    bm.free()
    return r

def audit_selected(cfg=None):
    return [audit(o, cfg) for o in bpy.context.selected_objects if o.type == "MESH"]
```

## Appendix D - fix_basics.py (safe mechanical fixes only; one object at a time)

```python
import bpy, bmesh

def fix_basics(obj, merge_dist=0.0005, recalc_normals=True, delete_loose=True):
    me = obj.data
    bm = bmesh.new(); bm.from_mesh(me)
    log = {}
    n0 = len(bm.verts)
    bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=merge_dist)
    log["merged_verts"] = n0 - len(bm.verts)
    if delete_loose:
        loose = [v for v in bm.verts if not v.link_edges]
        bmesh.ops.delete(bm, geom=loose, context="VERTS")
        log["deleted_loose"] = len(loose)
    degenerate = [f for f in bm.faces if f.calc_area() < 1e-10]
    if degenerate:
        bmesh.ops.delete(bm, geom=degenerate, context="FACES")
    log["deleted_zero_area_faces"] = len(degenerate)
    if recalc_normals:
        bmesh.ops.recalc_face_normals(bm, faces=bm.faces)  # verify closed hulls visually afterwards
    bm.to_mesh(me); bm.free(); me.update()
    return log

def apply_scale_rotation(obj):
    bpy.ops.object.select_all(action="DESELECT")
    obj.select_set(True); bpy.context.view_layer.objects.active = obj
    bpy.ops.object.transform_apply(location=False, rotation=True, scale=True)

def set_origin_to_point(obj, world_point):
    """Put origin at a pivot (turret ring, hinge, mast base) without moving geometry."""
    cursor = bpy.context.scene.cursor.location.copy()
    bpy.context.scene.cursor.location = world_point
    bpy.ops.object.select_all(action="DESELECT")
    obj.select_set(True); bpy.context.view_layer.objects.active = obj
    bpy.ops.object.origin_set(type="ORIGIN_CURSOR")
    bpy.context.scene.cursor.location = cursor
```