---
name: fixship_hoidz
description: Quy trình trọn gói cho ship skin mới (pirate-wars) - (1) Blender - chỉnh size khung ô súng osungXXX theo cannon_tXXX_g, kiểm tra lẹm bằng BVH; (2) xuất FBX sang Unity bằng ACT; (3) Unity - thay mesh ship_XXX_new vào prefab s_XXXX_new và setup CannonSlot + clone mirror. Gộp từ copysize_hoidz, export_hoidz, setship_hoidz. Dùng khi người dùng gọi /fixship_hoidz, "fix ship", hoặc đưa tên khung (base.001...) + tên prefab s_XXXX_new. Có thể chạy từng phần (chỉ size / chỉ export / chỉ setup) nếu người dùng nói rõ.
author: "Hoidz"
---

# fixship_hoidz — Chỉnh khung súng, export FBX, setup slot Unity

Ba phần chạy nối tiếp. Người dùng đưa: tên khung trong Blender (ví dụ `base.001`) và prefab Unity (ví dụ `s_0301_new`). **Không hỏi lại thứ đã có trong skill**; chỉ hỏi những điểm đánh dấu "HỎI". Dừng giữa chừng chỉ khi một kiểm tra bắt buộc không đạt hoặc cần đầu vào mà skill nói phải hỏi.

Quy tắc chung:
- Ngôn ngữ tiếng Việt, báo ngắn gọn, nêu số đo cụ thể; nói thẳng điểm nào chưa kiểm tra hoặc là ước lượng.
- Scene có thể bị undo/đổi tên giữa chừng: **đọc lại scene trước mỗi lần sửa**.
- Không động vào ship, prefab, cấp `osung` ngoài danh sách người dùng đưa. Không đụng mesh súng, không xóa backup.
- Câu hỏi chọn lựa dùng `AskUserQuestion` (hiện ô cho người dùng chọn), không hỏi bằng chữ thường.

---

# PHẦN A — Blender: chỉnh size khung ô súng theo cannon `_g`

Mỗi ship có tối đa 2 vị trí ô súng, mỗi tier súng (201, 301, 401, ...) có khung `osungXXX` (slot y ≈ -1.06, có thể -0.88) và/hoặc `osungXXX.001` (slot y ≈ 0). Hậu tố `.001` là quy ước hai vị trí, không phải lỗi. Blender tự thêm `.001/.002` khi tên bị trùng, nên nếu tên ra sai thì tìm cách đặt lại (ví dụ đổi qua tên tạm); nếu ship chỉ có **một** khung thì tên cuối theo người dùng (ship 301: `osung201`, `osung301`, `osung401`, không hậu tố). Khi người dùng đưa `base.001/base.002` của ship mới: `base.002` (slot y≈-1.06) → `osungXXX`, `base.001` (slot y≈0) → `osungXXX.001` hoặc tên người dùng chốt; tier đầu dùng chính object gốc (đổi tên), các tier sau `copy()` object + link cùng collection + cùng parent + `matrix_parent_inverse`. Tier làm: người dùng nêu (thường 201, 301, 401). Ship chỉ có `base.001` chưa có osung: đổi tên thành `osung201`, copy ra `osung301`/`osung401`, tính kích thước khung **từ bbox súng của chính ship đó** theo quy tắc A2 (không dùng số tuyệt đối của ship khác); đặt súng tạm: `location.x += 0.382` (về -0.674), tâm y súng = tâm y khung, đỉnh súng z = 0.830/0.828/0.813 cho 201/301/401; xong trả súng về vị trí và trạng thái ẩn ban đầu.

## A1. Xác định đối tượng
- Người dùng đưa tên hoặc ảnh có mũi tên. **Không đoán theo màu**. Liệt kê bằng `execute_blender_code`: tên, tên mesh data, số vert, bbox world, parent, `visible_get()` của các `osung*`, `base.00x` mesh nhỏ và `cannon_t*_g`. Chưa chắc đâu là mẫu/đích → hỏi lại.
- **Súng `cannon_tXXX_g` đang ẩn thì tự bật để đo và kiểm tra** (không hỏi): `hide_set(False)`, thêm `hide_viewport=False` nếu cần, bật collection chứa nó nếu bị ẩn. Chỉ bật tier đang làm. Ghi lại trạng thái ẩn ban đầu; xong `look` + BVH thì trả về như cũ, trừ khi người dùng bảo để hiện. Báo súng nào đã bật tạm.
- Nếu súng nằm ngoài ship (không parent, lệch y ≈ -1) thì BVH chỉ đáng tin khi súng đã nằm đúng slot. **HỎI** người dùng đặt súng vào slot (hoặc cho độ sâu x và mép trên súng) trước khi chạy BVH; không tự đoán rồi coi kết quả là chuẩn. Nếu người dùng bảo em tự đặt: đặt tâm y súng = tâm y khung, đỉnh súng bằng mép trong thanh trên của khung, và ghi rõ là ước lượng.
- Object cha thường scale 0.01 + xoay 90° → **mọi tính toán trong world**, ghi về local bằng `Wi @ co`.
- Có thể có nhiều ship (ship_203_new, ship_204, ship_301_new...) trong cùng file; chỉ động vào frame thuộc ship được nhắc.

## A2. Thông số đã chốt (người dùng xác nhận bằng bản chỉnh tay)
**QUY TẮC CHUNG (người dùng chốt): mỗi tàu một khác, KHÔNG có thông số kích thước cố định dùng chung giữa các ship.** Các bảng ship 301/204 bên dưới chỉ là *ví dụ tỉ lệ* (biên so với súng), **không được copy số tuyệt đối y/z sang ship khác** (lần ship 302 áp bảng 301 nên khung to hơn súng, bị người dùng bắt lỗi). Với ship mới:
- **Kích thước khung đặt theo NÒNG súng (tiết diện súng đi qua khung), KHÔNG theo bbox cả súng.** Bbox cả súng gồm cả vành miệng nòng phình ra ngoài (201: bbox 0.360×0.349 nhưng thân nòng chỉ 0.294×0.296; 301: 0.515×0.524 → 0.479×0.483; 401: 0.691×0.338 → 0.667×0.311) nên khung theo bbox bị to hơn súng (ship 302 bị người dùng bắt lỗi). Cách đo: đặt súng đúng slot, `bisect_plane` mesh súng (world) tại mặt phẳng x = tâm x của khung, lấy bbox y,z của tiết diện cắt (`sy0,sy1,sz0,sz1`).
- **MẪU CHỈNH TAY CỦA NGƯỜI DÙNG (ship 304, osung201.001, người dùng làm lại lần 2 — lần 1 là nhầm) — ĐÂY LÀ QUY TẮC CHUẨN:** người dùng KHÔNG quan tâm tổng thể khung dày bao nhiêu; chỉ **kéo các điểm của khung sát vào nòng súng**. **Giữ nguyên độ dày thanh (y ≈ 0.071, z ≈ 0.073) và độ dày x**, không nén thanh, không tính "hở trong"; chỉ dời hai nửa khung (như A3) sao cho **mép NGOÀI khung = tiết diện nòng + 0.035 mỗi phía cả 4 phía** và **MÉP TRÊN GIỮ NGUYÊN theo khung gốc** (1.152; đỉnh nòng = mép trên - 0.035). Mẫu: nòng y -0.147→0.147, z 0.822→1.118 (súng 201 đặt ở z 0.974) → khung y -0.184→0.183, z 0.787→1.152. Hệ quả: thanh khung chồng lên nòng ~0.035 mỗi phía, người dùng chấp nhận; **BVH khung↔súng > 0 là bình thường với ship thanh dày, KHÔNG được vì BVH mà phình khung hay nén thanh.** Các lần làm khung "to" bị bắt lỗi: ship 302 (theo bbox), ship 304 (cộng độ dày thanh vào biên; nén thanh); và một mẫu hạ mép trên là do người dùng nhầm, đã bỏ.
- Tâm y khung = tâm y nòng (tâm y slot của ship đó). Nếu người dùng đã đặt súng vào slot thì dùng đúng vị trí đó (ship 304 slot y=0: súng 201 ở (-1.094, 0, 0.974)).
- **QUY TRÌNH CHUẨN:** (1) lấy tiết diện nòng `sy0,sy1,sz0,sz1` bằng `bisect_plane` mesh súng tại x = tâm x khung (súng đặt tạm x = tâm x khung + 0.021, hoặc dùng súng người dùng đã đặt đúng slot); `hw=(sy1-sy0)/2`, `hh=(sz1-sz0)/2`. (2) `yc` = tâm y khung gốc; `z1` = mép trên khung gốc (cố định). (3) Đích: `ty0=yc-hw-0.035, ty1=yc+hw+0.035, tz1=z1, tz0=z1-2*hh-0.07` (tức đỉnh nòng = z1-0.035). (4) Dời hai nửa khung rigid như A3 (giữ độ dày thanh và x, chỉ cộng `slope*(ny-y)` cho x). (5) Không chạy BVH để phình/nén khung; chỉ báo số BVH.
- Mép trên z = mép trên khung gốc của ship đó, **cố định** (không lấy 0.857 hay giá trị ship khác).
- Xong **so lại từng khung với nòng**: in `(mép ngoài khung - nòng)` theo y và z cho từng tier, phải ≈ **0.035 mỗi phía** (mẫu người dùng 0.033–0.037). Lệch xa thì báo và sửa. Nếu không rõ súng nào ứng với khung nào (vd khác 201/301/401) thì **HỎI** người dùng.
- Không có mẫu chỉnh tay của ship đó thì ghi rõ trong báo cáo là kích thước tính theo tỉ lệ, chưa có mẫu tay.

Với khung ứng với súng `C = cannon_tXXX_g` (bbox world: `cy0,cy1` theo y; `cz0` đáy z):
- **Tâm y khung = tâm y của súng** (slot y≈0 ship 301: ≈ 0.10, không ép về 0 nếu súng/slot đang ở đó).
- *(Cũ, chỉ để tham khảo; đã thay bằng quy trình chuẩn A2 theo nòng)* Mép trên z cố định theo slot (mép trên các khung phải ngang nhau). Ship 204: slot y≈-1.06 → 1.194, slot y=0 → 1.152. Ship 301: 0.857.
- **Mép dưới z, rộng y:** công thức cũ rộng = `cy1-cy0+0.071`, đáy = `cz0-0.030` chỉ là điểm xuất phát. **Mẫu ship 301 do người dùng chỉnh tay mới là chuẩn tham chiếu** (BVH = 0 với súng đã ở đúng slot, `location` súng x = -0.674, y ≈ 0.102):

  | Súng (y × z bbox) | Khung chỉnh tay (y × z) | Biên mỗi bên y | Biên đáy | Biên đỉnh |
  |---|---|---|---|---|
  | 201_g 0.360 × 0.349 | 0.415 × 0.412 (y -0.103→0.313, z 0.445→0.857) | 0.025 / 0.031 | 0.037 | 0.027 |
  | 301_g 0.515 × 0.524 | 0.591 × 0.594 (y -0.194→0.398, z 0.262→0.857) | 0.038 / 0.039 | 0.043 | 0.029 |
  | 401_g 0.691 × 0.338 | 0.782 × 0.431 (y -0.302→0.480, z 0.426→0.857) | 0.046 / 0.045 | 0.049 | 0.044 |

  Rút ra: biên mỗi bên ≈ 7% bề rộng súng (không cố định 0.0355), biên đáy 0.037–0.049, mép trên giữ nguyên. Khung lớn hơn chỉ mở rộng xuống dưới và ra hai bên.
- Mẫu ship 204: súng 401 (0.691×0.338) → khung 0.762×0.386; súng 201 (0.36×0.349) → 0.431×0.391; súng 301 (0.515×0.524) → 0.586×0.576.
- Độ dày thanh, góc vát: giữ nguyên. Độ nghiêng theo thân tàu giữ nguyên: đo slope `dx/dy` bằng bình phương tối thiểu trên vert world, khi dời vert `x += slope*(ny - y)` (ship 301: slope ≈ 0.0156).

## A3. Thực hiện (kéo giãn, không scale cả khối)
1. Backup mesh data của đích: `old.name = <tên>_before_param`, `use_fake_user=True`; `new = old.copy()`; gán cho object.
2. Tính `y0,y1,z0,z1` của khung hiện tại, `yc,zm` là tâm. Với từng vert world `w`:
   - `ny = ty1-(y1-w.y)` nếu `w.y>yc` else `ty0+(w.y-y0)`.
   - `nz = tz1-(z1-w.z)` nếu `w.z>zm` else `tz0+(w.z-z0)`.
   - `v.co = Wi @ Vector((w.x + slope*(ny-w.y), ny, nz))`.
   Mỗi nửa dịch rigid, độ dày thanh và góc vát không đổi.
3. Khung thiếu mesh/khác hình (ship 204 bát giác kín, ship 203 chữ U hở đáy, ship 301 vòng kín 32 vert) thì giữ hình của khung đích.
4. Khung tier tạo mới (copy) lấy hình từ mesh gốc đã backup, không lấy từ khung đã giãn.

## A4. Kiểm tra lẹm mesh (bắt buộc)
Chạy BVH overlap giữa `cannon_tXXX_g` và khung (bmesh, `transform(matrix_world)`, `triangulate`, `faces.ensure_lookup_table()`, `BVHTree.FromBMesh(...).overlap(...)`) với súng đã ở đúng slot:
- Kết quả lý tưởng = **0** với ship thanh mỏng. Với ship thanh dày (xem mẫu A2) BVH > 0 là chấp nhận được, chỉ báo số. Nếu > 0 và khung KHÔNG theo mẫu A2 thì: in tâm các tam giác giao nhau để biết chân trái/phải hay thanh đáy/thanh trên; tăng dần ra ngoài (chân dịch ra theo y, đáy hạ theo z) tới khi 0. Không ước lượng theo bbox cả súng.
- Không hạ mép trên.

## A5. Báo cáo phần Blender
- `look` với target = khung + cannon, góc nhìn từ phía thân có khung, distance 2–3, xác nhận hết lẹm, mép trên ngang nhau, không chạm gờ/đinh tán thân.
- Báo: kích thước mới từng khung, mép trên dùng, tên mesh backup, cảnh báo khung gần gờ thân (khung rộng ≳ 0.76), súng nào đã bật tạm.

---

# PHẦN B — Export FBX sang Unity bằng ACT

## B1. Mesh cần xuất
Thường là object tổng của ship (`ship_XXX_new`, EMPTY): xuất **cả cây** (object cha + toàn bộ `children_recursive`, đều được chọn). Kiểm tra mọi tên tồn tại, con là MESH; object con đang ẩn thì báo trước khi xuất. Báo danh sách mesh sẽ xuất. Súng `_g`/cannon nằm ngoài cây ship thì không xuất chung (xuất riêng nếu người dùng yêu cầu).

## B2. Export Path — luôn `AskUserQuestion`
Mỗi lần chạy phần B, hỏi bằng `AskUserQuestion` rồi chờ trả lời (người dùng muốn tự chọn mỗi lần, dù có đường dẫn cũ). Luôn đưa 2 thư mục cố định của pirate-wars, đánh dấu Recommended thư mục hợp tên mesh (`ship_*` → Ship\model, `cannon_*_g` → cannon\mesh\g); thêm `scene.act.export_path` cũ làm lựa chọn thứ 3 nếu khác cả hai:
- `D:\Horus\pirate-wars\Assets\3D_kho\Ship\model` — ship.
- `D:\Horus\pirate-wars\Assets\3D_kho\cannon\mesh\g` — cannon `_g`.
Thư mục phải tồn tại; chưa có thì hỏi có tạo không. **Chưa xác nhận đường dẫn thì không chạy B4.** Xuất ghi đè file cùng tên: nếu file đã có từ bản trước thì nêu rõ là sẽ ghi đè khi hỏi.

## B3. Cài đặt ACT cố định (không hỏi)
`bpy.context.scene.act`: `fbx_export_mode='PARENT'`, `export_format='FBX'`, `export_target_engine='UNITY'` (không `UNITY2023`), `apply_rot/apply_scale/apply_loc/apply_rot_rotated=True`, `delete_mats_before_export=False`, `export_combine_meshes=False`, `triangulate_before_export=False`, `export_custom_options=False`, `custom_export_path=True`, `export_path=<đường dẫn đã xác nhận>`.

## B4. Chọn mesh và xuất
```python
import bpy
names = [...]; path = r"..."
act = bpy.context.scene.act
act.fbx_export_mode='PARENT'; act.export_format='FBX'; act.export_target_engine='UNITY'
act.apply_rot = act.apply_scale = act.apply_loc = act.apply_rot_rotated = True
act.delete_mats_before_export = act.export_combine_meshes = act.triangulate_before_export = False
act.export_custom_options = False
act.custom_export_path = True; act.export_path = path
if bpy.context.object and bpy.context.object.mode != 'OBJECT':
    bpy.ops.object.mode_set(mode='OBJECT')
bpy.ops.object.select_all(action='DESELECT')
for n in names:
    o = bpy.data.objects[n]
    for x in [o, *o.children_recursive]:
        x.hide_set(False); x.select_set(True)
bpy.context.view_layer.objects.active = bpy.data.objects[names[0]]
win = bpy.context.window_manager.windows[0]
area = next(a for a in win.screen.areas if a.type == 'VIEW_3D')
region = next(r for r in area.regions if r.type == 'WINDOW')
with bpy.context.temp_override(window=win, area=area, region=region):
    print(bpy.ops.object.multi_fbx_export())
```
Kiểm tra: liệt kê `.fbx` trong thư mục xuất, so thời gian sửa đổi (mỗi object gốc → 1 FBX theo tên).

## B5. Import Settings trong Unity (giống `Assets/3D_kho/cannon/mesh/cannon_t101.fbx`)
Model: Scale Factor 1 / Use File Scale bật, Mesh Compression Low, Read/Write tắt, Import BlendShapes/Visibility/Cameras/Lights tắt, Normals Import, Tangents Calculate Mikktspace. Rig: Animation Type None. Animation: Import Constraints tắt, Import Animation tắt. Materials: Creation Mode None. Chạy bằng `mcp__UnityMCP__execute_code` (`compiler="codedom"`, C# 6), đổi đường dẫn Windows thành `Assets/...`:
```csharp
UnityEditor.AssetDatabase.Refresh();
var p = "Assets/3D_kho/Ship/model/<ten>.fbx";
var mi = (UnityEditor.ModelImporter)UnityEditor.AssetImporter.GetAtPath(p);
mi.globalScale = 1; mi.useFileScale = true;
mi.meshCompression = UnityEditor.ModelImporterMeshCompression.Low;
mi.isReadable = false;
mi.importBlendShapes = false; mi.importVisibility = false;
mi.importCameras = false; mi.importLights = false;
mi.importBlendShapeDeformPercent = false;
mi.importNormals = UnityEditor.ModelImporterNormals.Import;
mi.importTangents = UnityEditor.ModelImporterTangents.CalculateMikk;
mi.animationType = UnityEditor.ModelImporterAnimationType.None;
mi.importConstraints = false; mi.importAnimation = false;
mi.materialImportMode = UnityEditor.ModelImporterMaterialImportMode.None;
mi.SaveAndReimport();
```
Có thể so `.fbx.meta` với `cannon_t101.fbx.meta` (bỏ 2 dòng đầu guid, bỏ CR); chỉ được khác `materialImportMode: 0` và `externalObjects` rỗng. Nếu không so thì nói rõ chưa so. `read_console` kiểm lỗi import.

---

# PHẦN C — Unity: thay mesh và setup CannonSlot cho `s_XXXX_new`

Prefab `Assets/_Game/Prefabs/ShipSkins/s_XXXX_new.prefab`. Bản `_new` dùng mesh thuyền mới; `CannonSlot` là **con của chính mesh `osung`** (không nằm trong nhóm `CannonSlots`), nên slot mirror theo scale của mesh cha.

## C0. Kết nối, đọc hiện trạng
- Đọc `mcpforunity://instances` và `mcpforunity://editor/state`; Unity chưa kết nối thì dừng và báo. `ready_for_tools=false` kèm `stale_status` chỉ cần đọc lại sau ~0.5 giây. Không sửa file `.prefab` bằng tay.
- **Prefab stage đang mở (`mcpforunity://editor/prefab-stage`, `assetPath` trùng prefab) thì sửa trên stage**: dùng `PrefabStageUtility.GetCurrentPrefabStage().prefabContentsRoot` rồi `SaveAsPrefabAsset(root, stage.assetPath)`, **không** dùng `LoadPrefabContents` (Auto Save của stage ghi đè). Sau khi sửa báo người dùng đóng rồi mở lại stage nếu hierarchy chưa cập nhật. Stage không mở thì dùng `LoadPrefabContents` → sửa → `SaveAsPrefabAsset` → `UnloadPrefabContents` trong `finally`.
- Dùng `execute_code` với `compiler="codedom"` (không Roslyn): C# 6, không `$""`, `?.`, tuple; ghi đủ `UnityEngine.Object.Instantiate`/`DestroyImmediate`; không dùng hàm tĩnh/local function (nhúng được thân hàm), dùng `Stack` để duyệt cây.
- Liệt kê cây của `s_XXXX_new` (tên, active, scale, rot, vị trí, component, `slotId`) và của bản cũ `s_XXXX` (số `CannonSlot`, `slotId`). Xác định: mesh hiện là `ship_XXX` hay `ship_XXX_new`, `osung` gốc đã có slot con chưa, đã có clone nào chưa. **Số slot cần có: hỏi người dùng bằng `AskUserQuestion` (2 / 4 / 6 slot), xem mục "Số slot" ở C2.**

## C1. Thay mesh (nếu prefab còn nhóm mesh cũ `ship_XXX`)
Làm luôn, không hỏi lại: sau khi FBX đã export và import settings đã đặt:
- `PrefabUtility.InstantiatePrefab(fbx, root.transform)` đặt tên `ship_XXX_new`, mọi con layer 0, vị trí/rot/scale và sibling index của nhóm cũ; xóa nhóm `ship_XXX` cũ; **không xóa `CannonSlots`** ở bước này.
- Material (FBX import Materials = None nên gán tay): `base*` và `osung*` dùng `Assets/3D_kho/Ship/material/M_ship_XXX.mat`; `co*` dùng `Assets/3D_kho/Ship/material/M_Pirate_Flag.mat`. Đối chiếu với `s_0202_new`.
- Trạng thái active của các mesh không đổi.

## C2. Cấu trúc chuẩn
- Root là variant của `ShipSkinBase.prefab`, layer 8. 4 collider (`CannonHitBox`, `MovementCollider`, `BowCollider` có `ShipRamming`, `AimCollider` layer 9) không đổi; nếu khác bản cũ chỉ báo.
- Mesh thuyền là con root, `ship_XXX_new` (layer 0), chứa `base`, `co`, các cấp `osung101..501`.
- **`osungN01` không có hậu tố là bản gốc**, mang `CannonSlot` gốc. Các bản `osungN01 (1)`, `(2)`, `(3)` là clone, mirror qua scale:

| Bản | Scale mesh | Slot | slotId | Scale local slot | Rot Y slot | Hướng bắn (thế giới) |
|---|---|---|---|---|---|---|
| `osungN01` (gốc) | (1,1,1) | `CannonSlot_R1` | 2 | (1,1,1) | 90 | +X |
| `osungN01 (1)` | (-1,1,1) | `CannonSlot_L1` | 1 | (-1,1,1) | 90 | -X |
| `osungN01 (2)` | (1,1,-1) | `CannonSlot_R2` | 4 | (1,1,-1) | 270 | +X |
| `osungN01 (3)` | (-1,1,-1) | `CannonSlot_L2` | 3 | (-1,1,-1) | 270 | -X |

- Scale local của slot **bằng scale mesh cha** (`slot.localScale = parent.localScale`). Lưu ý: `s_0201_new` đang có slot L1 scale (1,1,1) khác bảng; nếu hướng bắn L sai thì kiểm lại chỗ này.
- Slot clone **cùng local position** với slot gốc. Dùng tên gọn R1/L1/R2/L2 cho clone mới. `CannonSlot` clone giữ nguyên field của gốc, chỉ đổi `slotId` (qua `SerializedObject.FindProperty("slotId")`, `ApplyModifiedPropertiesWithoutUndo` trước khi save).
- Thuyền 2 slot: gốc + `(1)`. 4 slot: gốc + `(1)`, `(2)`, `(3)`.
- **Số slot: luôn HỎI bằng `AskUserQuestion` trước khi setup (đầu phần C, sau C0), không tự suy từ bản cũ `s_XXXX`.** 3 lựa chọn: **2 slot** (mỗi cấp 1 mesh gốc + `(1)`), **4 slot**, **6 slot**. Đưa số slot đếm được ở bản cũ `s_XXXX` làm gợi ý (đánh dấu Recommended), ghi rõ trong description số mesh gốc mỗi cấp trong FBX (đếm `osungN01` và `osungN01.001`, kèm `bounds.center.z`). Cách chia theo lựa chọn:
  - **2 slot:** mỗi cấp 1 mesh gốc + `(1)` → R1 id 2, L1 id 1. Nếu FBX có 2 mesh gốc mỗi cấp thì chỉ làm mesh người dùng chỉ định (hỏi thêm mesh nào) hoặc mesh `|z|` nhỏ nhất.
  - **4 slot:** nếu FBX có **2 mesh gốc mỗi cấp** (ship 302: z ≈ ±0.375): mỗi mesh gốc + `(1)`, mesh z dương = nhóm 1 (R1 id 2 / L1 id 1), mesh z âm = nhóm 2 (R2 id 4 / L2 id 3), cả hai rot Y 90. Nếu chỉ có **1 mesh gốc mỗi cấp**: gốc + `(1)`, `(2)`, `(3)` theo bảng mirror.
  - **6 slot:** như mục "Thuyền 6 slot" bên dưới.
  - Lựa chọn không khớp số mesh gốc trong FBX (vd chọn 6 slot mà chỉ có 1 mesh gốc/cấp) thì báo và hỏi lại, không tự ép.
- **Thuyền 6 slot (s_0203_new)**: mỗi cấp có 2 mesh gốc: `osungN01.001` giữa thuyền (|z|≈0, gốc + `(1)` → R1 id 2, L1 id 1) và `osungN01` lệch z (≈+0.88; gốc + `(1)`, `(2)`, `(3)` → R2 id 4, L2 id 3, R3 id 6, L3 id 5; clone `(2)`, `(3)` lật z, rot Y 270). Nhận biết bằng `mesh.bounds.center.z`. Người dùng nói mesh nào là gốc thì làm đúng mesh đó; nói "6 slot" thì làm cả hai mesh của cấp. Id: R chẵn, L lẻ (kiểm tra lại với bản cũ).
- **Slot gốc chưa có thì tự tạo, không dừng hỏi:** với mỗi cấp `osung` được làm, vị trí = `MeshFilter.sharedMesh.bounds.center` (local của mesh cha; z giữ nguyên). **x đặt đúng `bounds.center.x`, KHÔNG cộng/trừ offset nào (người dùng đã chốt: tự chỉnh x bằng tay; lần trước lùi -0.05 bị yêu cầu hoàn lại)**; báo người dùng chỉnh tay. **Người dùng có thể tự kéo slot ra ngoài (x) hoặc nhích y cho từng cấp** (ship 301: chỉ cấp 301 được kéo x 0.695 → 0.75, y 0.546 → 0.560; cấp 201 và 401 giữ x 0.645). Số này chỉ là ví dụ của riêng cấp đó: **không áp x 0.75 hay bất kỳ giá trị chỉnh tay nào cho cấp khác**, và không tự sửa slot người dùng đã chỉnh. Chỉ báo người dùng chỉnh tay), `localRotation = Euler(0,90,0)`, `slotId = 2`, tên `CannonSlot_R1`. Component: `Instantiate` một `CannonSlot` có sẵn (kiểu là `PirateWars.Ship.CannonSlot`, phải ghi đủ namespace với codedom; có thể dùng `CannonSlots/CannonSlot_R1` cũ của chính prefab làm mẫu trước khi xóa nhóm) của `s_XXXX_new` khác (ví dụ `CannonSlot_R1 (1)` của `s_0201_new`). **Sau mỗi `Instantiate` slot mẫu, xóa hết con của slot mới** (`for i=childCount-1..0: DestroyImmediate`). Cuối báo cáo **luôn ghi** các cấp có slot gốc do skill tự đặt (chưa đo theo lỗ súng thật) để người dùng chỉnh tay. Nếu slot gốc có sẵn mà `slotId`/rotation khác bảng thì báo và hỏi, không tự ép.
- **`CannonSlots` cũ**: slot trong đó trùng `slotId` với slot mới, **tự xóa luôn, không hỏi** (người dùng đã chốt), rồi xóa luôn chính nhóm `CannonSlots` (không bắt buộc: validator không đòi, `ShipSkinHost` chỉ bỏ qua nếu có). Chỉ xóa khi mọi con của nhóm đều là `CannonSlot`; còn con khác thì dừng và hỏi. Làm ngay sau khi tạo slot mới, cùng prefab stage, rồi kiểm tổng số `CannonSlot` = đúng số slot mới (vd 6 = 3 cấp × 2) và prefab không còn nhóm `CannonSlots`. Báo là đã xóa.

## C3. Tạo clone
- Clone `osungN01` gốc (kèm slot con) bằng `UnityEngine.Object.Instantiate(gốc, gốc.parent)`, tên `osungN01 (k)` đúng thứ tự `(1)`, `(2)`, `(3)`. Đặt lại mesh clone: `localPosition=(0,0,0)`, `localRotation=identity`, `localScale` theo bảng.
- Slot con của clone: `localPosition` = slot gốc, `localRotation = Euler(0, 90|270, 0)`, `localScale` = scale mesh cha, tên theo bảng, `slotId` theo bảng.
- Clone đã có sẵn (đúng tên, đúng scale) thì chỉ cập nhật slot cho khớp, không tạo trùng. Active của mesh clone kế thừa gốc; người dùng tự bật/tắt theo cấp.
- Mesh trùng tên không do skill tạo (người dùng nhân bản tay): báo và hỏi trước khi xóa; khi được đồng ý chỉ xóa mesh trùng tên không có slot, giữ bản có slot.
- Người dùng nói "làm hết/copy sang hết" → làm tất cả cấp `osung` (201, 301, 401), đủ hai mesh `osungN01` và `osungN01.001` nếu 6 slot. Đã làm rồi thì không làm lại, đọc hiện trạng trước. Cấp khác để nguyên.

## C4. Kiểm tra
1. **Dữ liệu:** đọc lại prefab đã lưu: mỗi `osung` có đủ bản; `slotId` duy nhất trong từng cấp; `worldPos` mirror đúng (x đảo dấu giữa R và L; z đảo giữa cặp 1/2 và 3/4); `worldFwd` R = +X, L = -X; mọi `CannonSlot` mới `childCount == 0`; không còn `CannonSlots`. Id lặp giữa các cấp là bình thường.
2. **Mắt:** chụp Scene view (`manage_camera` `screenshot`, `capture_source=scene_view`, `output_folder="Temp"`) xác nhận slot nằm đúng lỗ súng; không lưu thay đổi bật/tắt tạm; nếu không chụp được thì nói rõ chưa kiểm bằng mắt.
3. **Console:** `read_console` lọc Error/Warning, báo nguyên văn lỗi liên quan (lỗi của prefab/package khác thì ghi là không liên quan).
4. **Dọn dẹp:** `Tools.pivotMode` về `Center`, bỏ chọn, xóa ảnh chụp tạm (kể cả `Assets/Screenshots` nếu lỡ tạo).

---

# Báo kết quả cuối (một lần, ngắn gọn, tiếng Việt)
- **Blender:** bảng kích thước khung mới + mép trên + tên mesh backup + kết quả BVH (nói rõ nếu chỉ là ước lượng) + súng bật tạm.
- **Export:** file FBX đã ghi (đường dẫn, thời gian, có ghi đè không), Import Settings đã đặt.
- **Unity:** prefab, cấp đã làm, clone mới, bảng `slotId / worldPos / worldFwd`, kết quả `read_console`, điểm người dùng cần chỉnh tay (slot tự đặt, scale L1).

# Không làm
- Không động vào prefab/ship/cấp ngoài danh sách người dùng đưa.
- Không đổi collider, `ShipSkinBase`, FBX có sẵn khác, material ngoài mục C1. Không bật/tắt hay xóa mesh `osung` có sẵn (trừ mesh trùng tên đã được đồng ý).
- Không gán skin vào Skin Catalog hay prefab khác.
- Không xóa mesh backup `_before_param`.

# Lưu ý bổ sung (rút từ ship 301)
- Công cụ **Ship Cannon Preview** (cửa sổ trong Scene view) tạo con tạm `__CannonPreview_XXXX` (hideFlags DontSave) dưới `CannonSlot` trên prefab stage. Trước **mỗi** `SaveAsPrefabAsset`, duyệt mọi `CannonSlot`, `DestroyImmediate` mọi con, rồi sau khi lưu đọc lại asset kiểm `childCount == 0`.
- `AskUserQuestion`: chỉ truyền `questions` (mảng) với `header/question/multiSelect/options`; không thêm trường khác.
