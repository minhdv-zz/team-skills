---
name: copysize_hoidz
description: Chỉnh khung ô súng (osungXXX / osungXXX.001, đôi khi tên base.00x) trên thân thuyền Blender cho vừa cannon_tXXX_g, bằng thông số đã chốt (margin, mép trên cố định, căn tâm y theo súng, kiểm tra lẹm bằng BVH). Dùng khi người dùng gọi /copysize_hoidz, "copy size hoidz", đưa tên khung + "theo súng XXX_g", hoặc nhờ đổi tên base.001/base.002 thành osungXXX theo ship trước.
---

# copysize_hoidz — Chỉnh size khung ô súng theo cannon `_g`

Mỗi ship có 2 vị trí ô súng, mỗi tier súng (201, 301, 401, ...) có 2 khung:
- `osungXXX` — slot y ≈ -1.06 (có thể y ≈ -0.88 tùy ship), súng `cannon_tXXX_g` nằm ở slot này.
- `osungXXX.001` — slot y = 0.
Tên theo quy ước ship 203: `osung201, osung201.001, osung301, osung301.001, osung401, osung401.001`. Khi người dùng đưa `base.001/base.002` của ship mới: `base.002` (slot y≈-1.06) → `osungXXX`, `base.001` (slot y=0) → `osungXXX.001`; tier đầu dùng chính object gốc (đổi tên), các tier sau `copy()` object + link cùng collection + cùng parent + `matrix_parent_inverse`.

## 1. Xác định đối tượng
- Người dùng đưa tên hoặc ảnh có mũi tên. **Không đoán theo màu** (màu viewport là màu object, tên có thể đã bị đổi/đảo). Liệt kê bằng `execute_blender_code`: tên, tên mesh data, số vert, bbox world, parent, `visible_get()` của các `osung*`, `base.00x` mesh nhỏ và `cannon_t*_g`. Chưa chắc đâu là mẫu/đích → hỏi lại. Scene có thể bị undo/đổi tên giữa chừng: đọc lại trước khi sửa.
- **Súng `cannon_tXXX_g` đang ẩn thì tự bật lên để đo và kiểm tra** (không cần hỏi): `hide_set(False)`, thêm `hide_viewport=False` nếu cần, và bật collection chứa nó nếu bị ẩn/exclude. Chỉ bật các tier đang làm (201_g, 301_g, 401_g...). Ghi lại trạng thái ẩn ban đầu của từng súng; xong `look` + BVH thì trả về đúng trạng thái cũ, trừ khi người dùng bảo để hiện. Báo trong kết quả súng nào đã bật tạm.
- Nếu súng nằm ngoài ship (không parent, lệch y≈-1) thì không giả định vị trí trong khung: BVH chỉ đáng tin khi súng đã nằm đúng slot. Chưa có vị trí đúng thì báo rõ số BVH chỉ là ước lượng và hỏi người dùng vị trí/mép trên slot kia, không tự đoán.
- Object cha thường scale 0.01 + xoay 90° → **mọi tính toán trong world**, ghi về local bằng `Wi @ co`.
- Có thể có nhiều ship (ship_203_new, ship_204...) trong cùng file; chỉ động vào frame thuộc ship được nhắc.

## 2. THÔNG SỐ ĐÃ CHỐT (người dùng xác nhận bằng bản `osung401` chỉnh tay; áp cho mọi tier)
Với khung ứng với súng `C = cannon_tXXX_g` (bbox world: `cy0,cy1` theo y; `cz0` đáy z):
- **Rộng (y):** `cy1 - cy0 + 0.071` (mỗi bên +0.0355), **tâm y = tâm y của súng** (slot y=0: tâm y = 0).
- **Mép trên z = cố định theo slot, KHÔNG đổi theo size súng** (đường nối mép trên các khung phải ngang nhau; thân tàu dốc lên mũi nên 2 slot có mép trên khác nhau). Ship 204: slot y≈-1.06 → 1.194, slot y=0 → 1.152.
- **Mép dưới z:** `cz0 - 0.030` (cho slot y=0 trừ thêm chênh mép trên giữa 2 slot, tức 0.042 ở ship 204, vì súng đo ở slot kia). Khung lớn hơn chỉ mở rộng xuống dưới.
- Độ dày thanh, góc vát: giữ nguyên.
- Độ nghiêng theo thân tàu giữ nguyên: đo slope `dx/dy` bằng bình phương tối thiểu trên vert world, khi dời vert `x += slope*(ny - y)`.
- Mẫu tham chiếu ship 204: súng 401 (0.691×0.338) → khung 0.762×0.386; súng 201 (0.36×0.349) → 0.431×0.391; súng 301 (0.515×0.524) → 0.586×0.576.

## 3. Thực hiện (kéo giãn, không scale cả khối)
1. Backup mesh data của đích: `old.name = <tên>_before_param`, `use_fake_user=True`; `new = old.copy()`; gán cho object.
2. Tính `y0,y1,z0,z1` của khung hiện tại, `yc,zm` là tâm. Với từng vert world `w`:
   - `ny = ty1-(y1-w.y)` nếu `w.y>yc` else `ty0+(w.y-y0)`.
   - `nz = tz1-(z1-w.z)` nếu `w.z>zm` else `tz0+(w.z-z0)`.
   - `v.co = Wi @ Vector((w.x + slope*(ny-w.y), ny, nz))`.
   Nhờ vậy mỗi nửa dịch rigid, độ dày thanh và góc vát không đổi.
3. Nếu khung thiếu mesh/khác hình (vd ship 204 là bát giác kín, ship 203 là chữ U hở đáy) thì giữ hình của khung đích, không đổi sang hình khác trừ khi người dùng bảo.
4. Khung tier tạo mới (copy) lấy hình từ mesh gốc đã backup, không lấy từ khung đã giãn.

## 4. Kiểm tra lẹm mesh (bắt buộc)
Khi súng nằm trong khung (vòng to nhất của nòng có thể ở cùng độ sâu x với khung), chạy BVH overlap giữa `cannon_tXXX_g` và khung (bmesh, `transform(matrix_world)`, `triangulate`, `faces.ensure_lookup_table()`, `BVHTree.FromBMesh(...).overlap(...)`):
- Kết quả phải = **0**. Nếu > 0: in tâm các tam giác giao nhau để biết chân trái/phải hay thanh đáy; tăng dần ra ngoài (chân dịch ra theo y, đáy hạ theo z) tới khi 0. Không ước lượng theo bbox cả súng (vòng nòng quá rộng làm khung bành ra chạm gờ thân, lần trước phải hoàn tác).
- Không hạ mép trên; chỉ mở ra phía bên và phía dưới.

## 5. Báo cáo
- `look` với target = khung + cannon, góc nhìn từ phía thân có khung, distance 2–3, xác nhận hết lẹm, mép trên ngang nhau, không chạm gờ/đinh tán thân.
- Báo: kích thước mới từng khung, mép trên dùng, tên mesh backup, cảnh báo khung gần gờ thân (vd khung 401 rộng ~0.76).
- Không đụng mesh súng, không xóa backup. Các khung tier khác mặc định để hiện; người dùng tự ẩn.


ARGUMENTS: này anh thấy hơi sai rồi, em update theo như anh sửa nhé, em check trong blender đi