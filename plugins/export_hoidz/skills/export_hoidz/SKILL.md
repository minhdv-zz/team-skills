---
name: export_hoidz
description: Xuất mesh từ Blender sang Unity dạng FBX bằng add-on ACT (Import/Export Tools → Export FBX to Unity), điều khiển qua Blender MCP. Người dùng đưa tên mesh hoặc ảnh có mũi tên chỉ mesh cần xuất; ACT dùng cài đặt mặc định cố định; Export Path luôn hỏi người dùng. Dùng khi người dùng gọi /export_hoidz, "export hoidz", "xuất sang Unity bằng ACT".
author: hoidz
---

# export_hoidz — Xuất FBX sang Unity bằng ACT

## 1. Xác định mesh cần xuất

Người dùng cung cấp **một trong hai**:
- **Tên mesh** (một hoặc nhiều tên, ví dụ `cannon_t101`, `cannon_t101_g`).
- **Ảnh có mũi tên** chỉ vào mesh cần xuất (ảnh viewport hoặc Outliner). Đọc ảnh, xác định tên object được chỉ; nếu ảnh là viewport không thấy tên thì đối chiếu với `get_scene_info` / `look` để tìm đúng object.

Sau đó kiểm tra trong scene bằng `mcp__blender__execute_blender_code`:
- Mọi tên đều tồn tại. Object con phải là `MESH`; object tổng (cha) có thể là `EMPTY` (ví dụ `ship_201`) vẫn hợp lệ, xuất cả cây như bên dưới. Tên nào không có hoặc không chắc (ảnh mờ, mũi tên chỉ chỗ có nhiều object) → **hỏi lại**, không đoán.
- **Tên được đưa là object tổng (cha) → xuất cả cây:** object đó cùng toàn bộ con cháu (`children_recursive`) đều được chọn và xuất chung vào 1 FBX theo tên object tổng. Không chỉ chọn mỗi object tổng (ACT chỉ xuất object đang được chọn, nên con không được chọn sẽ bị bỏ).
- Object con nào đang ẩn hoặc nằm ngoài view layer thì báo người dùng trước khi xuất.
- Báo lại danh sách mesh sẽ xuất cho người dùng (gồm cả object con).

## 2. Hỏi Export Path — CHỜ người dùng cung cấp rồi mới xuất

- Mỗi lần chạy skill, **hỏi người dùng đường dẫn thư mục xuất** (Custom Export Path) rồi **dừng lại chờ trả lời**.
- Nếu `scene.act.export_path` đã có đường dẫn cũ: đưa đường dẫn đó ra hỏi người dùng "dùng đường dẫn này hay đổi?" và **chờ người dùng xác nhận** hoặc gửi đường dẫn mới. Không tự dùng khi chưa được xác nhận.
- Nếu chưa có đường dẫn cũ: hỏi người dùng gửi đường dẫn.
- **Luôn hỏi bằng tool `AskUserQuestion`** (hiện ô cho người dùng chọn), không hỏi bằng chữ thường. Dự án hiện tại (pirate-wars) có **2 thư mục xuất hay dùng cố định**, luôn đưa cả 2 làm lựa chọn:
  - `D:\Horus\pirate-wars\Assets\3D_kho\cannon\mesh\g` — cho mesh cannon `_g` (cannon_t101_g…).
  - `D:\Horus\pirate-wars\Assets\3D_kho\Ship\model` — cho ship (ship_201…).
  Đánh dấu **Recommended** cho thư mục hợp với tên mesh (`cannon_*_g` → `cannon\mesh\g`, `ship_*` → `Ship\model`); nếu không rõ thì Recommended là đường dẫn cũ trong `scene.act.export_path` nếu trùng 1 trong 2. Ghi đủ đường dẫn trong description. Nếu đường dẫn cũ khác cả 2 thư mục trên thì thêm nó làm lựa chọn thứ 3 (tối đa 4 lựa chọn). Người dùng tự gõ đường dẫn khác qua ô "Other".
- **Chưa được người dùng xác nhận/cung cấp đường dẫn thì tuyệt đối không chạy bước 4** (không gọi `multi_fbx_export`).
- Thư mục phải tồn tại; nếu chưa có thì hỏi người dùng có muốn tạo không.

## 3. Cài đặt ACT mặc định (cố định, không hỏi)

Đặt đúng như panel Import/Export Tools chuẩn:

| Mục trên panel | Thuộc tính `bpy.context.scene.act` | Giá trị |
|---|---|---|
| Export Mode: By Parent | `fbx_export_mode` | `'PARENT'` |
| File Format: FBX | `export_format` | `'FBX'` |
| Target Engine: Unity (Legacy) | `export_target_engine` | `'UNITY'` (không phải `UNITY2023`) |
| Apply Rotation | `apply_rot` | `True` |
| Apply Scale | `apply_scale` | `True` |
| Apply Location | `apply_loc` | `True` |
| Apply for Rotated Objects | `apply_rot_rotated` | `True` |
| Delete All Materials | `delete_mats_before_export` | `False` |
| Combine All Meshes | `export_combine_meshes` | `False` |
| Triangulate Meshes | `triangulate_before_export` | `False` |
| Custom Export Options | `export_custom_options` | `False` |
| Custom Export Path | `custom_export_path` | `True` |
| Export Path | `export_path` | đường dẫn người dùng vừa xác nhận ở bước 2 |

## 4. Chọn mesh và xuất

```python
import bpy
names = [...]            # danh sách mesh ở bước 1
path  = r"..."           # đường dẫn ở bước 2
act = bpy.context.scene.act
act.fbx_export_mode = 'PARENT'; act.export_format = 'FBX'; act.export_target_engine = 'UNITY'
act.apply_rot = act.apply_scale = act.apply_loc = act.apply_rot_rotated = True
act.delete_mats_before_export = act.export_combine_meshes = act.triangulate_before_export = False
act.export_custom_options = False
act.custom_export_path = True; act.export_path = path

if bpy.context.object and bpy.context.object.mode != 'OBJECT':
    bpy.ops.object.mode_set(mode='OBJECT')
bpy.ops.object.select_all(action='DESELECT')
for n in names:
    o = bpy.data.objects[n]
    for x in [o, *o.children_recursive]:   # object tổng + toàn bộ con cháu
        x.hide_set(False); x.select_set(True)
bpy.context.view_layer.objects.active = bpy.data.objects[names[0]]

# Nút "Export FBX to Unity" = bpy.ops.object.multi_fbx_export
win = bpy.context.window_manager.windows[0]
area = next(a for a in win.screen.areas if a.type == 'VIEW_3D')
region = next(r for r in area.regions if r.type == 'WINDOW')
with bpy.context.temp_override(window=win, area=area, region=region):
    print(bpy.ops.object.multi_fbx_export())
```

## 5. Kiểm tra file đã xuất

- Liệt kê file `.fbx` trong thư mục xuất, so thời gian sửa đổi để xác nhận file vừa được ghi (By Parent: mỗi object gốc → 1 FBX theo tên object).
- Xuất lại cùng tên sẽ ghi đè file cũ (Unity giữ nguyên GUID/.meta).

## 6. Đặt Import Settings trong Unity (giống file mẫu)

File mẫu: `Assets/3D_kho/cannon/mesh/cannon_t101.fbx` (project `D:\Horus\pirate-wars`). Mọi FBX vừa xuất phải có Import Settings giống file này:

| Tab | Thiết lập | Giá trị |
|---|---|---|
| Model | Scale Factor / Use File Scale | 1 / bật |
| Model | Mesh Compression | **Low** |
| Model | Read/Write | tắt |
| Model | Import BlendShapes / Visibility / Cameras / Lights | **tắt hết** |
| Model | Normals / Tangents | Import / Calculate Mikktspace (mặc định) |
| Rig | Animation Type | **None** |
| Animation | Import Constraints | **tắt** |
| Animation | Import Animation | **tắt** |
| Materials | Material Creation Mode | **None** (tắt import material, không remap) |

Chạy bằng Unity MCP (`mcp__UnityMCP__execute_code`), đổi đường dẫn Windows ở bước 2 thành đường dẫn `Assets/...`:

```csharp
UnityEditor.AssetDatabase.Refresh();
var paths = new[] { "Assets/3D_kho/cannon/mesh/<ten>.fbx" };
foreach (var p in paths) {
    var mi = (UnityEditor.ModelImporter)UnityEditor.AssetImporter.GetAtPath(p);
    if (mi == null) { UnityEngine.Debug.LogError("Không thấy " + p); continue; }
    mi.globalScale = 1; mi.useFileScale = true;
    mi.meshCompression = UnityEditor.ModelImporterMeshCompression.Low;
    mi.isReadable = false;
    mi.importBlendShapes = false; mi.importVisibility = false;
    mi.importCameras = false; mi.importLights = false;
    mi.importBlendShapeDeformPercent = false;
    mi.importNormals = UnityEditor.ModelImporterNormals.Import;
    mi.importTangents = UnityEditor.ModelImporterTangents.CalculateMikk;
    mi.animationType = UnityEditor.ModelImporterAnimationType.None;
    mi.importConstraints = false;
    mi.importAnimation = false;
    mi.materialImportMode = UnityEditor.ModelImporterMaterialImportMode.None;
    mi.SaveAndReimport();
}
```

Sau đó kiểm tra: đọc file `.fbx.meta` vừa xuất, so với `cannon_t101.fbx.meta` (bỏ 2 dòng đầu chứa guid, và bỏ ký tự CR khi so: `diff <(tail -n +3 A | tr -d '\r') <(tail -n +3 B | tr -d '\r')`, vì hai file có thể khác kiểu xuống dòng nên diff báo khác toàn bộ). Chỉ được khác ở `materialImportMode: 0` (Materials = None) và `externalObjects` phải rỗng. Đọc `read_console` để chắc không có lỗi import.

## 7. Báo cáo

Báo người dùng: mesh đã xuất, đường dẫn từng file FBX, Import Settings đã đặt, kết quả so với file mẫu.

## Lưu ý

- Không tự đổi tên, đổi origin, apply transform hay sửa mesh trước khi xuất, trừ khi người dùng yêu cầu.
- Không đổi cài đặt ACT khác bảng ở bước 3.
- Chỉ xuất mesh được chỉ định, không xuất cả scene.


ARGUMENTS: ship_204_new, sau đó em thay mesh ship_204_new vào prefab s_0204_new xong /setship_hoidz  cho anh nhé