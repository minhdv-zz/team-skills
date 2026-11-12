---
name: setship_hoidz
description: Setup CannonSlot cho ship skin bản _new trong Unity (project pirate-wars) bằng UnityMCP - đặt CannonSlot làm con của mesh osung gốc, clone mesh osung + slot sang các bản mirror (scale -1) với đúng slotId. Dùng khi người dùng gọi /setship_hoidz, "setup thuyền", "setup slot thuyền", hoặc đưa prefab s_XXXX_new cần setup ô súng.
---

# Setup ô súng cho ship skin `_new`

Làm việc với prefab `Assets/_Game/Prefabs/ShipSkins/s_XXXX_new.prefab` (ví dụ `s_0201_new`, `s_0202_new`). Bản `_new` dùng mesh thuyền mới. Khác bản cũ `s_XXXX`: `CannonSlot` là **con của chính mesh `osung`** chứ không nằm trong nhóm `CannonSlots`, nên slot tự mirror theo scale của mesh cha.

## Cấu trúc chuẩn (đối chiếu s_0201_new, s_0202_new, bản cũ s_0202)

- Root là variant của `ShipSkinBase.prefab`, layer 8. Có 4 collider (`CannonHitBox`, `MovementCollider`, `BowCollider` có `ShipRamming`, `AimCollider` layer 9). Ở s_0201_new và s_0202_new giá trị khớp bản cũ `s_XXXX` (đã đo).
- Mesh thuyền là con root, tên `ship_XXX_new` (layer 0), chứa các mesh `base`, `co`, và các cấp ô súng `osung101`, `osung201`, ... `osung501`.
- **`osungN01` không có hậu tố là bản gốc.** Người dùng đặt `CannonSlot` gốc làm con của nó, ở đúng lỗ súng. Các bản `osungN01 (1)`, `(2)`, `(3)` là clone của gốc, mirror qua scale:

| Bản | Scale mesh | Slot | slotId | Scale local của slot | Rot Y của slot (local) | Hướng bắn (thế giới) |
|---|---|---|---|---|---|---|
| `osungN01` (gốc) | (1,1,1) | `CannonSlot_R1` | 2 | (1,1,1) | 90 | +X |
| `osungN01 (1)` | (-1,1,1) | `CannonSlot_L1` | 1 | (-1,1,1) | 90 | -X |
| `osungN01 (2)` | (1,1,-1) | `CannonSlot_R2` | 4 | (1,1,-1) | 270 | +X |
| `osungN01 (3)` | (-1,1,-1) | `CannonSlot_L2` | 3 | (-1,1,-1) | 270 | -X |

- Scale local của slot **bằng scale của mesh cha** (đã đo trong s_0201_new và s_0202_new). Phải đặt `slot.localScale = parent.localScale`, nếu để (1,1,1) thì hướng bắn của slot sai.
- Slot trên các bản clone **cùng local position** với slot gốc. Thế giới mirror nhờ scale của mesh cha: R1/L1 đối xứng qua x, R2/L2 là mirror theo z.
- Tên slot không quan trọng với code, quan trọng là `slotId`. Prefab thật có chỗ để hậu tố Unity (`CannonSlot_L1 (3)`), có chỗ tên gọn (`CannonSlot_R2`). Dùng tên gọn R1/L1/R2/L2 cho clone mới.
- Thuyền 2 slot (như s_0201) chỉ có gốc và `(1)`. Thuyền 4 slot (như s_0202) có đủ `(1)`, `(2)`, `(3)`. Số slot lấy từ bản cũ `s_XXXX` (đếm `CannonSlot`).
- **Thuyền 6 slot (như s_0203_new)**: mỗi cấp có **2 mesh gốc** trong FBX, không phải 1:
  - `osungN01.001` nằm giữa thuyền (z≈0): chỉ gốc + `(1)` → 2 slot, `R1` id 2 và `L1` id 1.
  - `osungN01` nằm lệch z (≈+0.88): gốc + `(1)`, `(2)`, `(3)` → 4 slot, `R2` id 4, `L2` id 3, `R3` id 6, `L3` id 5 (clone `(2)`, `(3)` lật z, rot Y 270). Quy ước id: R chẵn, L lẻ, theo thứ tự cặp 1, 2, 3 (lấy từ id slot trong bản cũ `s_XXXX`, kiểm tra lại trước khi đặt).
  - Nhận biết: so `mesh.bounds.center.z` của hai mesh; mesh có |z|≈0 là cặp giữa, mesh còn lại là cặp trước/sau. Người dùng nói mesh nào là gốc thì làm đúng mesh đó, người dùng nói "có 6 slot" thì làm cả hai mesh của cấp.
  - Khi chưa có slot gốc, vị trí lấy từ `mesh.bounds.center` (y, z giữ nguyên, x lùi ~0.05), copy component từ slot đã có của `s_XXXX_new` khác, và phải báo người dùng chỉnh lại bằng tay.
  - `CannonSlots` cũ (copy từ bản cũ `s_XXXX`) còn slot sẽ trùng `slotId` với slot mới: **tự xóa luôn, không cần hỏi** (người dùng đã chốt quy tắc này). Xóa các slot con trong `CannonSlots`, **rồi xóa luôn chính nhóm `CannonSlots`** (nhóm này không bắt buộc: `SkinPrefabValidator` không đòi, `ShipSkinHost` chỉ bỏ qua nếu có, và `s_0201_new` đã không có nhóm này). Chỉ xóa nhóm khi nó đã trống, nếu còn con không phải slot cũ thì dừng và hỏi. Làm ngay sau khi tạo xong slot mới, trong cùng prefab stage, rồi kiểm lại tổng số `CannonSlot` bằng đúng số slot mới (ví dụ 18 cho 3 cấp × 6 slot) và prefab không còn nhóm `CannonSlots`. Báo trong kết quả là đã xóa.
- `CannonSlot` clone giữ nguyên các field của slot gốc (`previewConfig`, các material preview, `showAimPreview`...). Chỉ đổi `slotId`.
- **Slot mẫu copy từ prefab khác có thể mang theo con** (người dùng hay kéo cannon `c_XXXX_new` vào slot để test tay). Sau mỗi `Instantiate` của slot mẫu, **xóa hết con của slot mới** (`for i = childCount-1..0: DestroyImmediate(child)`), vì slot chuẩn không có con. Cuối quy trình kiểm: mọi `CannonSlot` mới có `childCount == 0` trong asset đã lưu. Không đụng cannon người dùng tự kéo vào slot của prefab khác.

## Quy trình

1. **Xác nhận đầu vào.** Cần: tên prefab `s_XXXX_new`, và cấp `osung` cần setup (mặc định chỉ cấp người dùng đặt slot gốc, ví dụ `osung201`). Chỉ làm với prefab và cấp người dùng đưa tên hoặc đánh dấu trong ảnh. Mơ hồ thì hỏi.
2. **Kết nối.** Đọc `mcpforunity://instances` và `mcpforunity://editor/state`, `ready_for_tools` mới làm. Unity chưa kết nối thì dừng và báo. Không sửa file `.prefab` bằng tay.
3. **Đọc hiện trạng.** Bằng `execute_code` liệt kê cây của `s_XXXX_new` (tên, active, scale, rot, vị trí, component) và của bản cũ `s_XXXX` (số `CannonSlot`, `slotId`). Xác định: `osung` gốc đã có slot con chưa, đã có clone nào chưa, số slot cần có.
4. **Kiểm tra slot gốc.** Slot gốc phải có `CannonSlot` con. Thiếu thì dừng và hỏi vị trí, không tự đoán vị trí lỗ súng. Nếu `slotId` hoặc rotation của slot gốc khác bảng (ví dụ không phải 2 và `(0,90,0)`) thì báo và hỏi người dùng, không tự ép.
5. **Tạo clone trong một lần `execute_code`** (`LoadPrefabContents` → sửa → `ApplyModifiedPropertiesWithoutUndo` → `SaveAsPrefabAsset` → `UnloadPrefabContents` trong `finally`). Project không có Roslyn nên dùng `compiler="codedom"` (C# 6: không `$""`, `?.`, tuple), ghi đầy đủ `UnityEngine.Object.Instantiate`/`DestroyImmediate`:
   - Clone `osungN01` gốc (kèm slot con) bằng `UnityEngine.Object.Instantiate(gốc, gốc.parent)`, rồi đặt tên `osungN01 (k)` đúng thứ tự `(1)`, `(2)`, `(3)` theo số slot. Sau Instantiate đặt lại mesh clone: `localPosition = (0,0,0)`, `localRotation = identity`, `localScale` theo bảng.
   - Với slot con của clone: `localPosition` = slot gốc, `localRotation = Euler(0, 90|270, 0)`, `localScale = scale của mesh cha`, tên theo bảng. Đặt `slotId` bằng `SerializedObject.FindProperty("slotId")` rồi `ApplyModifiedPropertiesWithoutUndo` trước khi save.
   - Clone đã có sẵn (đúng tên, đúng scale) thì chỉ cập nhật slot cho khớp bảng, không tạo trùng.
   - Trạng thái active của mesh `osung` và các mesh khác **không đổi** (clone kế thừa active của gốc). Người dùng tự bật/tắt theo cấp.
6. **Kiểm tra bằng dữ liệu.** Đọc lại prefab: mỗi `osung` setup có đủ bản, mỗi slot có `slotId` duy nhất trong cả prefab (1, 2, và 3, 4 nếu 4 slot), `worldPos` mirror đúng (x đảo dấu giữa R và L, z đảo dấu giữa slot 1/2 và 3/4 nếu cùng cặp), `worldFwd` R = +X và L = -X.
7. **Kiểm tra bằng mắt.** Mở prefab stage, bật tạm hoặc chọn các slot, chụp Scene view (`manage_camera` screenshot `capture_source=scene_view`, `output_folder="Temp"`), xác nhận các slot nằm đúng lỗ súng hai bên. Không lưu thay đổi bật/tắt tạm. Xong thì đóng prefab stage.
8. **Console.** `read_console` lọc Error/Warning, báo nguyên văn.
9. **Dọn dẹp.** Trả `Tools.pivotMode` về `Center`, bỏ chọn, đóng prefab stage, xóa ảnh chụp tạm (nếu lỡ tạo `Assets/Screenshots` thì xóa file `.png`, `.meta` và thư mục).

## Phản hồi từ người dùng, phải tuân thủ

- **Prefab stage đang mở thì sửa trên stage.** Trước khi sửa, kiểm tra `PrefabStageUtility.GetCurrentPrefabStage()`: nếu `assetPath` trùng prefab đang làm thì thao tác trên `stage.prefabContentsRoot` rồi `SaveAsPrefabAsset`, **không** dùng `LoadPrefabContents` (Auto Save của stage sẽ ghi đè bản vừa sửa, hierarchy người dùng thấy vẫn là bản cũ). Sau khi sửa báo người dùng đóng rồi mở lại stage nếu hierarchy chưa cập nhật.
- **Thay mesh trước khi setup slot** (khi người dùng nói "thay mesh `ship_XXX_new` vào prefab"): thay nhóm mesh cũ `ship_XXX` bằng `PrefabUtility.InstantiatePrefab(fbx, root)` đặt tên `ship_XXX_new`, layer 0, vị trí/rot/scale gốc, cùng sibling index; xóa nhóm cũ; không xóa `CannonSlots`. Material: `base*` và `osung*` dùng `M_ship_XXX`, `co*` dùng `M_Pirate_Flag` (FBX import Materials = None nên phải gán tay). Nhớ đối chiếu với `s_0202_new`.
- **"Em làm hết / copy sang hết"** nghĩa là làm tất cả cấp `osung` (201, 301, 401), đủ cả hai mesh `osungN01` và `osungN01.001` nếu thuyền 6 slot. Đã làm rồi thì không làm lại, đọc hiện trạng trước.
- **Mesh trùng tên không do skill tạo** (người dùng có thể vừa nhân bản tay, thường là clone không có slot con): báo và hỏi trước khi xóa, đừng tự xóa. Khi được đồng ý chỉ xóa đúng các mesh trùng tên không có slot, giữ bản có slot.
- **Ảnh người dùng gửi** chỉ danh sách mesh/hierarchy: đối chiếu với hiện trạng prefab trước, nếu đã làm xong thì nói rõ là đã làm, không làm lại.
- Cuối mỗi lượt, kiểm `slotId` trong từng cấp phải duy nhất (id lặp giữa các cấp là bình thường vì mỗi lúc chỉ bật một cấp).

## Cấp `osung` khác (301, 401, 501...)

Người dùng nêu cấp nào thì làm cấp đó, các cấp còn lại để nguyên. Mỗi cấp tự có slot gốc và clone riêng (như `s_0201_new`), vị trí slot gốc của từng cấp có thể khác nhau chút vì mesh lỗ súng mỗi cấp khác (ví dụ trong s_0201_new y dao động 0.564 đến 0.680), nên không coi đó là quy tắc cố định. Cấp chưa có slot gốc: có thể copy slot từ cấp đã đặt làm điểm xuất phát, nhưng phải nói rõ trong kết quả để người dùng chỉnh lại bằng tay.

## Báo kết quả

Nêu ngắn gọn bằng tiếng Việt: prefab, cấp `osung` đã làm, danh sách clone mới tạo, bảng `slotId` / `worldPos` / `worldFwd`, kết quả `read_console`. Nói rõ điểm nào người dùng cần nhìn lại (vị trí slot của cấp được copy, không đo lại từ mesh).

## Không làm

- Không động vào prefab hoặc cấp `osung` ngoài danh sách người dùng đưa.
- Không đổi collider, `ShipSkinBase`, FBX, material. Nếu 4 collider của bản `_new` khác bản cũ `s_XXXX` thì chỉ báo, không tự sửa.
- Không bật/tắt hay xóa mesh `osung` có sẵn.
- Không gán skin vào Skin Catalog hay prefab khác.


ARGUMENTS: s_0301_new nhé cái trên anh nhầm