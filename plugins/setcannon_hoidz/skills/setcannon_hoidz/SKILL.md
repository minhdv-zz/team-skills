---
name: setcannon_hoidz
description: Setup cannon skin prefab trong Unity (project pirate-wars) bằng UnityMCP - tạo Prefab Variant từ CannonSkinBase hoặc thay mesh FBX trong prefab c_XXXX có sẵn, gán material, đặt Muzzle Point ở tâm miệng nòng. Dùng khi người dùng gọi /setcannon_hoidz, "setup cannon", "thay mesh cannon", hoặc đưa FBX cannon_tXXX cần thành/vào prefab c_XXXX.
---

# Setup cannon skin trên Unity

Làm việc với prefab trong `Assets/_Game/Prefabs/CannonSkins/` (`c_0101`, `c_0201`...). Skin chỉ là phần nhìn. Logic bắn nằm ở prefab cannon khác và `CannonSlot` trên ship skin, nên không thêm script, collider hay Rigidbody vào skin.

Hai chế độ:
- **Thay mesh** (hay dùng nhất): prefab `c_XXXX` đã có, đổi FBX con sang FBX mới. Ví dụ `/setcannon_hoidz c_0101 dùng cannon_t301_g`.
- **Tạo mới**: chưa có `c_XXXX`, tạo variant từ `CannonSkinBase` rồi gắn FBX. Ví dụ `/setcannon_hoidz tạo c_0601 từ cannon_t601`.

## Cấu trúc chuẩn

- Root `c_XXXX` là **Prefab Variant của `CannonSkinBase.prefab`** (guid `09fc6036a0e903e40bf7c425395545ec`). Base chỉ có root và con `Muzzle Point` (layer 0, tag Untagged, không component).
- Override trên root variant: position `(0,0,0)`, rotation Euler `(0,-90,0)`, scale 1.
- `Muzzle Point`: con của root, rotation Euler `(0,90,0)`, scale 1. Mỗi node tên đúng `Muzzle Point` (code tìm đệ quy, không phân biệt hoa thường) là một điểm bắn, node đầu tiên dùng để ngắm. Cannon nhiều nòng thì có nhiều node cùng tên (c_0401 có 2 node, z lệch hai bên). **Súng 2 nòng: clone `Muzzle Point` gốc sang nòng thứ 2** (cùng tên, cùng rotation `(0,90,0)`, cùng parent), rồi đặt từng node vào tâm miệng nòng tương ứng. Nếu prefab đã có đủ node thì chỉ chỉnh vị trí, không clone thêm.
- FBX cannon là con của root, mỗi FBX là một nested prefab, tên con trùng tên FBX. **Chỉ gắn FBX mà người dùng chỉ định**, không tự thêm `_g` hay thân. FBX nằm ở `Assets/3D_kho/cannon/mesh/` (thân `cannon_tXXX.fbx`) và `Assets/3D_kho/cannon/mesh/g/` (nòng `cannon_tXXX_g.fbx`).

Giá trị tham chiếu (dùng để so, không áp dụng máy móc cho mesh mới). Cột "Đã setup" là kết quả đã làm và qua review, người dùng chưa xác nhận bằng mắt riêng `c_0501` và nòng phải của `c_0401`:

| Prefab | Trạng thái gốc | Đã setup: FBX con (vị trí) | Đã setup: Muzzle Point |
|---|---|---|---|
| c_0101 | `t101_g` | `t101_g` (0,0,0), mẫu chuẩn | (0.405, 0, 0) |
| c_0201 | `t201_g` + `t201` | `t201_g` (0,0,0) | (0.489, 0, 0) |
| c_0202..0205 | `t202`..`t205` (thân, ở (-0.066, 0.073, 0)), muzzle (0.774, 0.488, 0) | chưa làm (chưa có `_g` khớp id) | chưa làm |
| c_0301 | `t301` (thân) | `t301_g` (0,0,0) | (0.313, 0, 0) |
| c_0401 | `t401` (thân) | `t401_g` (0,0,0) | 2 node: (0.411, -0.035, -0.167) và (0.411, -0.035, 0.191) |
| c_0501 | `t501` (thân) | `t501_g` (0,0,0) | (0.625, 0, 0) |

## Chọn mesh đúng theo id

Mesh đúng được xác định bằng **id trong tên**: bỏ số `0` đầu ở id prefab thì ra id mesh. Ví dụ `c_0201` → id `201` → `cannon_t201_g`; `c_0101` → `cannon_t101_g`; `c_0301` → `cannon_t301_g`.

- Khi người dùng chỉ nói tên prefab (không nêu FBX), tự suy ra FBX theo id này trong `Assets/3D_kho/cannon/mesh/g/`, rồi nêu rõ FBX đã chọn trong kết quả.
- Khi có nhiều mesh con trong prefab, giữ đúng mesh có id trùng với id prefab, mesh có id khác thì không phải mesh đúng.
- Không có `_g` nào khớp id (ví dụ `c_0202..0205`, thư mục `g` chỉ có `t101/201/301/401/501`) thì dừng và hỏi người dùng, không đoán sang id gần nhất.
- Người dùng nêu FBX cụ thể thì dùng FBX đó, kể cả khi id không khớp.

## Prefab có FBX thân: đổi sang `_g`

Mục tiêu chuẩn của skin là chỉ có FBX `_g` đúng id, như c_0101. Áp dụng khi prefab người dùng đưa tên có FBX thân `cannon_tXXX`, và có `cannon_tXXX_g` khớp id (đã có sẵn trong prefab như c_0201, hoặc chưa có như c_0301/0401/0501 thì gắn mới từ `mesh/g/`). **Xóa FBX thân, giữ hoặc gắn `_g`.** Khi đó:
1. Xóa con `cannon_tXXX` (thân) khỏi prefab.
2. Đặt `cannon_tXXX_g` về position `(0,0,0)`, rotation identity.
3. `_g` mặc định hiện material `Lit` xám của URP. Gán override `M_cannon` (`Assets/3D_kho/cannon/material/M_cannon.mat`) vào `Element 0` của Mesh Renderer.
4. Tính lại `Muzzle Point` theo `_g`. Giá trị cũ (c_0201: `(0.764, 0.488, 0)`) được căn theo thân nên sẽ lệch.
5. Báo rõ trong kết quả đã xóa FBX nào.

Chỉ xóa đúng con FBX thân đó, không đụng con khác (chỉ chỉnh vị trí `Muzzle Point`). Nếu không có `_g` khớp id (c_0202..0205) thì không áp dụng, dừng và hỏi.

## Muzzle Point nằm ở đâu

Ở **tâm miệng nòng**, trong không gian local của root (root xoay -90° nên không dùng `Renderer.bounds` AABB thế giới: lấy vertex của `mesh`, đổi qua `localToWorldMatrix` của MeshFilter rồi `worldToLocalMatrix` của root; hướng bắn là +X của mesh).

Công thức đã dùng, hiệu chuẩn trên c_0101 (mẫu chuẩn của người dùng: mép ngoài nòng x = 0.442, Muzzle x = 0.405):
- **x = mép ngoài của nòng (max x của vertex) − 0.037**, tức nằm ngay sau mặt lỗ nòng.
- **y, z = trục nòng**: tâm bounds mặt cắt nòng. Với nòng đơn (t101/201/301/501 `_g`) trục là y = 0, z = 0. Nòng đôi (`t401_g`): lấy riêng từng nòng bằng bounds của các vertex ở sát mép ngoài (x > max − 0.012) theo dấu của z, ra y = -0.035, z = -0.167 và 0.191 (mesh hơi lệch nên không đối xứng).
- Không dùng trung bình vertex mặt cuối (bị lệch do vertex phân bố không đều) và không dùng tâm bounds toàn mesh khi mesh có gai/đầu quái (c_0501).

Mesh không có chỗ nào hiệu chuẩn (không phải loại `_g` ở trên) thì dùng công thức này làm điểm xuất phát rồi nhờ người dùng nhìn lại. Người dùng đưa tọa độ thì dùng tọa độ đó. Mesh mới cùng kích thước nòng với mesh cũ và người dùng nói vị trí không đổi thì giữ nguyên.

Gizmo của `Muzzle Point` phải nằm giữa lỗ nòng khi nhìn trong Scene view. Đầu quái thú như c_0501 khó xác định "tâm miệng": đặt ở mặt trước của miệng, trên trục giữa, và nói rõ để người dùng xem lại.

## Material

- FBX thân (`cannon_t201/301/401/501.fbx`): `.meta` đã remap slot "color" sang `M_cannon` (`Assets/3D_kho/cannon/material/M_cannon.mat`, guid `6175016f35bf3f84d8590b1667983341`). Kiểm tra `.meta` của FBX mới, nếu đã remap thì **không cần override**.
- FBX `_g` (`.meta` có `materialImportMode: 0`, không remap): gán override `M_cannon` trên từng slot của từng renderer, như c_0101.
- FBX thân khác (ví dụ `t202..205`, `materialImportMode: 2` không remap, c_0202 không có override): không override trước. Sau khi lưu đọc `sharedMaterials` của mọi renderer, slot trống hoặc magenta thì mới gán override `M_cannon`.

## Quy trình

1. **Xác nhận đầu vào.** Cần: chế độ (thay mesh hay tạo mới), tên prefab `c_XXXX`, FBX cần gắn. Thiếu thì hỏi. Tìm FBX bằng `manage_asset` action=search, không đoán đường dẫn.
2. **Kết nối.** Đọc `mcpforunity://instances`, `set_active_instance` nếu có nhiều Unity, đọc `mcpforunity://editor/state` xem editor sẵn sàng. Unity chưa kết nối thì dừng và báo người dùng mở project `pirate-wars`. Không sửa file `.prefab` bằng tay.
3. **Đọc hiện trạng.** `manage_prefabs` action=get_hierarchy trên prefab (thay mesh) để biết FBX con cũ, vị trí và các `Muzzle Point`. Tạo mới mà `c_XXXX.prefab` đã có thì hỏi có ghi đè không. Thay mesh trên 5 prefab trở lên cũng hỏi xác nhận trước.
4. **Sửa prefab trong một lần `execute_code`** (ít rủi ro nhất, và là cách chắc chắn đặt được override material). Dùng `PrefabUtility.LoadPrefabContents` hoặc, khi tạo mới, instantiate `CannonSkinBase` rồi `SaveAsPrefabAsset` (instance của prefab lưu ra sẽ thành variant). Trong cùng lần chạy:
   - Tạo mới: đặt tên root, root Euler `(0,-90,0)` (override trên root variant, đặt trước khi tính bounds).
   - Thay mesh: xóa FBX con cũ.
   - Gắn FBX mới bằng `PrefabUtility.InstantiatePrefab(fbx, root)` để giữ nested prefab, đặt tên con trùng tên FBX, position/rotation: FBX mới cùng loại với FBX cũ (thân thay thân, `_g` thay `_g`) thì giữ vị trí cũ. Khác loại hoặc không chắc thì dùng `(0,0,0)`, identity (như khi kéo FBX vào) và báo người dùng.
   - Gán material theo mục Material.
   - Tính bounds mesh trong không gian local của root, đặt `Muzzle Point` theo mục Muzzle Point. Cannon nhiều nòng thì mỗi nòng một node `Muzzle Point` (clone node gốc nếu thiếu).
   - `SaveAsPrefabAsset` hoặc `SaveAsPrefabAssetAndConnect`, rồi `UnloadPrefabContents` / `DestroyImmediate` instance tạm, không để lại object trong scene.
   Nếu `manage_prefabs` modify_contents với `create_child` + `source_prefab_path` tạo được nested prefab đúng thì có thể dùng thay, nhưng vẫn phải kiểm tra bước 5.
5. **Kiểm tra bằng dữ liệu.** `manage_prefabs` get_hierarchy: variant của `CannonSkinBase`, FBX con là nested prefab (`IsPartOfPrefabInstance`), có ít nhất một node `Muzzle Point`, không còn FBX cũ, `sharedMaterials` không trống.
6. **Kiểm tra bằng mắt.** `open_prefab_stage`, chọn `Muzzle Point` (nòng đôi thì chọn riêng từng node, chọn cả hai thì gizmo nằm giữa), chụp Scene view bằng `manage_camera` screenshot (`capture_source=scene_view`), xác nhận gizmo nằm giữa lỗ nòng. Hướng bắn trong thế giới là +Z, nên đặt camera `SceneView.LookAt(..., Quaternion.Euler(20,150,0), ~1.6)` để nhìn thẳng vào miệng nòng. Lệch thì chỉnh lại rồi lưu. Xong thì `close_prefab_stage`.
7. **Console.** `read_console` lọc Error/Warning. Báo lỗi nguyên văn, không giấu.
8. **Dọn dẹp.** Trả `Tools.pivotMode` về `Center`, bỏ chọn, đóng prefab stage. Lưu ảnh chụp vào `output_folder="Temp"` (ngoài `Assets`), xong xóa; nếu lỡ tạo `Assets/Screenshots` thì xóa cả file `.png`, `.meta` và thư mục.

## Mẹo kỹ thuật với `execute_code`

- Project không có Roslyn: dùng `compiler="codedom"` (C# 6, không dùng cú pháp mới). Gọi `UnityEngine.Object.DestroyImmediate` đầy đủ tên vì `Object` bị nhập nhằng với `object`.
- Đo mesh: instantiate FBX bằng `PrefabUtility.InstantiatePrefab(fbx, tempRoot.transform)`, đọc `sharedMesh.vertices`, rồi `DestroyImmediate` instance và `tempRoot`.
- Sửa prefab: `LoadPrefabContents` + `SaveAsPrefabAsset` trong `try`, `UnloadPrefabContents` trong `finally`. Chỉ đọc kiểm tra (không lưu) cũng phải `UnloadPrefabContents`.
- Đặt `sharedMaterials` của renderer trong prefab contents sẽ tự ghi thành override `m_Materials`.

## Báo kết quả

Nêu ngắn gọn bằng tiếng Việt: đường dẫn prefab, FBX đã gắn, tọa độ `Muzzle Point` (từng node nếu nhiều nòng), tình trạng material, kết quả `read_console`. Nói rõ điểm nào suy ra từ bounds (cần người dùng nhìn lại) và điểm nào lấy từ người dùng.

## Phạm vi

Chỉ làm với prefab người dùng đưa tên hoặc đánh dấu trong ảnh (mũi tên, gạch chân). Không tự quét thư mục để setup thêm, kể cả prefab cùng loại (ví dụ `c_0202..0205` chưa có `_g` khớp id thì để đó, không xử lý cho tới khi người dùng đưa tên). Ảnh đánh dấu mà còn mơ hồ thì hỏi lại.

## Không làm

- Không động vào prefab ngoài danh sách người dùng đưa.
- Không sửa `CannonSkinBase`, FBX, `M_cannon` hay các `c_*` khác ngoài prefab được yêu cầu.
- Không thêm component logic vào skin.
- Không gán skin vào `CannonSlot` hoặc Skin Catalog trừ khi người dùng yêu cầu.
