---
name: "gm3d-tudn"
author: "TuDN"
description: "Gradient-map UV texturing for Blender game props/gates on the color2/T_Colorpalette strips with TuDN's 3D lighting and color rules (cylinder shading, 3-level white, Unity-aware values). Use for /gm3d-tudn, GM3D-TUDN, or texturing end-game gates."
---

# GM3D-TUDN — Gradient mapping + ánh sáng 3D cho cổng/prop (Blender → Unity)

Skill này = quy trình gm-minh (gradient mapping bằng palette strip) + 5 quy tắc ánh sáng học từ nhóm "CỔNG CUỐI TRẬN" trên Figma FEGMU-3D + 6 nguyên tắc từ feedback trực tiếp của TuDN + kỹ thuật viền sáng mặt vát. Trả lời bằng ngôn ngữ của user (thường là tiếng Việt).

## 0. Phạm vi và an toàn
- Gọi skill = được phép chuẩn bị, phân vùng, map base, so sánh ref và QA. Báo kế hoạch ngắn gọn một lần ở đầu (vùng màu + dải palette dự định), rồi làm tiếp, không hỏi giữa chừng trừ khi bị chặn.
- DỪNG sau khi xong base để user duyệt trước khi làm chi tiết. Cắt thêm lưới (tăng tris) chỉ khi user chọn rõ chi tiết nào, cách cắt và chấp nhận tăng tris.
- Dùng ref/concept và model user cung cấp; nếu thiếu thì hỏi. Không tự bịa concept, không thay asset, không import trùng.
- Ghi lại `bpy.data.filepath` lúc bắt đầu làm đích lưu. Sửa trực tiếp object đang mở.
- Nếu model đã có màu sẵn: hỏi user muốn map lại toàn bộ hay chỉ sửa chỗ lệch ref. Khi "chỉ sửa chỗ lệch": giữ UV cũ, chỉ dời U sang dải mới và remap V tỉ lệ để giữ gradient sẵn có.
- Hỏi lại user điều chưa rõ bằng câu hỏi trắc nghiệm ngắn (tối đa 3–4 câu/lần), luôn có phương án đề xuất.

## 1. Kết nối và chuẩn bị
1. Kiểm tra Blender MCP: phiên bản, file đang mở, is_dirty, danh sách mesh (tên, số mặt/tris, bounds world, material, UV layer, modifier — chú ý MIRROR).
2. Nếu ref/palette nằm trên máy user: xin quyền thư mục, stage file về cloud để đọc ảnh và lấy mẫu pixel (PIL).
3. Palette: `color2.tga` (512×512) qua material `T_Colorpalette`. Kiểm tra ảnh trong .blend giống bản trong thư mục (so pixel). Không đổi material dùng chung trừ khi user yêu cầu.
4. Helper `gm_core.py` của gm-minh: nếu có thì dùng (import từ thư mục scripts của skill, in path/version 1 lần). Nếu KHÔNG có (thường gặp), làm trực tiếp bằng bpy/bmesh theo các bước dưới — vẫn giữ nguyên nguyên tắc gm-minh.
5. Nếu Blender đang ở Edit Mode, chuyển sang Object Mode trước khi đọc/ghi UV (UV layer rỗng trong Edit Mode). User có thể đang chỉnh model cùng lúc (Edit Mode/Local View) → luôn tìm mặt theo vị trí world thay vì số thứ tự cũ.

## 2. Bản đồ palette color2.tga (dòng pixel tính từ trên xuống, V = 1 − dòng/512)
Các băng ngang: band1 dòng 0–85, band2 86–170, band3 171–255, band4 256–335, band5 336–415. Mỗi băng chia các cột dọc (strip) 10–35 px; trong 1 strip màu chuyển từ sáng (trên) xuống tối (dưới).
Dò strip bằng cách lấy mẫu hàng giữa băng, cắt chỗ đổi màu > ngưỡng. Strip hay dùng cho cổng:
- Cam (giữ tông cam): band1 u≈0.5166 (cột 256–273), dòng 4 #fb954e → dòng 30 #ea523b. Không dùng dưới dòng 34 (ngả đỏ thẫm).
- Cam ván cửa: band1 u≈0.0830, dòng 56–83 (#f78f40 → #e94d39).
- Trắng chuẩn t8_a5: band1 u≈0.580 (cột ~297, dải 273–307): highlight dòng 6–18, neutral 22–34, shadow 40–56; xám tối/đen các dòng dưới (khối nền xám dùng V 0.840–0.901).
- Vàng cam/emblem: band2 u≈0.8838 (#ffc552 → #b47259).
- Thép tương phản cao: band3 u≈0.7393 (#b0bacb → #7f8899 → #3b414c), V 0.506–0.625.
- Sắt tối tím xám: band2 u≈0.6162 (#716d76 → #5a565c).
- Gỗ nâu: band3 u≈0.6787 (#b06c3e → #61311d).
- Dây thừng be: band3 u≈0.8242 (#fdd68b → #a46934), V 0.541–0.662.
- Đỏ cờ/vải: band4 u≈0.5078, dòng 258 (#ed3a31) → 270 (#da342d) cho mặt cờ; nếp gấp tối ở dòng 302 (≈#a8231f) — tối xuống mà vẫn giữ tông đỏ.
- Be vải/cờ: band3 u≈0.8984 (#fdf5c6 → #cfbf99 → #a99272), V 0.575–0.638; nếp gấp V ≈ 0.53.
- Nâu rất tối (dấu X, chi tiết đậm): band4 u≈0.8398, V 0.414–0.492.
- Đá xám: band3 u≈0.0469 (#cbc5c3 → #5d5c67).
Luôn chừa lề ≥ 2 px trong U và V của strip. Khi lọc mặt theo dải, luôn lọc thêm theo vị trí vì nhiều vùng có thể dùng chung một dải.

## 3. Phân vùng vật liệu trước khi map (như gm-minh)
- Gom mặt theo đảo nối (connected islands) + bucket U hiện tại; ghi bounds world, số mặt, màu hiện tại (lấy mẫu palette tại UV). Chỉ báo tóm tắt các vùng quan trọng (≤12 dòng).
- Gán ngữ nghĩa bằng vị trí so với ref (chóp, vành, dây thừng, cờ, emblem, ván cửa, nẹp sắt, đá chân, khối nền...). Kiểm tra vùng mơ hồ trước khi gán; chi tiết nhỏ không được bỏ qua.
- Lưu ý MIRROR modifier: lưới chỉ có một nửa (thường x ≥ 0); UV áp cho cả hai bên.
- Mỗi mặt thuộc đúng một vùng; mỗi vùng một strip; U gom về tâm strip.

## 4. Đo màu ref
- Lấy mẫu pixel ở vùng ref (median 5×5), crop phóng to vùng chi tiết để nhìn. Ước lượng màu sáng/trung tính/tối cho từng vùng.
- Chọn strip có đoạn chuyển màu khớp nhất (lấy mẫu dọc strip mỗi 4–8 dòng để so). Nếu palette không có dải khớp (vd. đỏ san hô), chọn dải gần nhất và báo rõ giới hạn.

## 5. 5 quy tắc ánh sáng (học từ Figma FEGMU-3D, nhóm CỔNG CUỐI TRẬN)
1. **Ánh sáng từ trên chiếu xuống, hơi lệch ra trước.** Mặt hướng lên sáng nhất, mặt trước sáng vừa, mặt hông và mặt dưới tối dần. Không có bóng đổ cứng.
2. **Bóng tạo bằng chuyển màu.** Màu chuyển mượt theo chiều cao và hướng mặt, kiểu gradient map (sáng trên, tối dưới).
3. **Đáy khối nền luôn tối hẳn.** Khối nền dưới cổng có mặt trên sáng, cạnh trên có viền sáng (xem 7.7), mặt hông và mặt dưới rất tối → cổng trông như nổi lên.
4. **Kim loại có độ tương phản cao.** Bạc và vàng sáng gần trắng ở đỉnh, tối sâu ở dưới. Đá và tường chuyển nhẹ hơn.
5. **Chi tiết phát sáng là sáng nhất cảnh.** Neon, cổng dịch chuyển, đá quý, cửa vàng: sáng và bão hòa hơn mọi thứ xung quanh.

Bối cảnh game: camera sau lưng, trên cao, nhìn dọc đường chạy xám nhạt có sọc tới cổng; nền xanh navy phẳng (~#3A4A7A). Quy tắc màu kèm theo: tâm cổng (cửa/emblem) là điểm nhấn sáng và rực nhất; mỗi cổng 1 màu chủ đạo + 1 màu nhấn; có viền/trang trí vàng; màu tươi, bão hòa kiểu kẹo ngọt; tránh navy/xám cho mảng lớn; khối nền theo màu chủ đề cổng.

## 6. 6 nguyên tắc từ feedback của TuDN (ưu tiên cao nhất)
1. **Ánh sáng phải tạo cảm giác khối 3D, không tô phẳng.** Mỗi khối cần vùng sáng, trung tính và tối. Khối tròn (chóp nón, cột tròn): giữa thân (hướng ra camera) sáng, hai bên tối dần.
2. **Bóng tối không được làm đổi tông màu chính.** Vùng tối chỉ là phiên bản đậm hơn của chính màu đó (cam sáng → cam đậm), không trượt sang màu khác (vd. không ngả đỏ thẫm/đỏ tím).
3. **Màu trắng có 3 mức, không dùng trắng tinh cả mảng.** Highlight (mép hứng sáng, gần trắng tinh) / Neutral (mặt chính, chiếm đa số, xám rất nhạt) / Shadow (mặt khuất, vát trong, xám trung bình). Hai bên khối trắng phải tối rõ ràng.
4. **Màu trên texture phải tính trước ánh sáng của Unity.** Unity có môi trường ánh sáng bổ trợ → texture trong Blender phải hơi trầm hơn kết quả cuối mong muốn, tránh cháy trắng trong game.
5. **Lấy model đã đạt chuẩn trong team làm thước đo** (vd. Gate t8_a5). Đo trực tiếp UV/màu của model chuẩn nếu có trong file, không tự đặt màu theo cảm giác.
6. **Phân vùng màu đúng ref và giữ chi tiết user chỉ định** (vd. vị trí dải trắng trên chóp, phần sau dây thừng giữ cam, dây thừng giữ màu be, vành chóp cùng màu cam đậm thân chóp).

Nguyên tắc gộp: **mỗi khối cần sáng – trung tính – tối rõ ràng nhưng vẫn giữ đúng tông màu gốc; màu texture hơi trầm hơn kết quả cuối vì Unity thêm sáng; lấy model đạt chuẩn của team làm mốc.**

## 7. Kỹ thuật map
### 7.1 Remap giữ gradient (sửa màu vùng có sẵn)
Với tập mặt của vùng: tìm vmin/vmax hiện tại; mỗi loop: t = (v − vmin)/(vmax − vmin); đặt UV = (u_strip_mới, V0 + t·(V1 − V0)). U gom một giá trị cho cả vùng.

### 7.2 Ánh sáng tổng cho khối hộp/gỗ/sắt/đá/dây thừng (đã áp cho t10_a2)
- Giữ nguyên dải (U) và khoảng V đã chọn của từng vùng; chỉ phân bổ lại V theo ánh sáng.
- Hướng sáng L = chuẩn hoá(0, −0.5, 0.85) (từ trên, hơi lệch ra trước, camera −Y).
- Mỗi loop: k = 0.72·max(0, n_mặt·L) + 0.28·h (h = chiều cao chuẩn hoá trong đảo lưới đó); V = V_tối + k·(V_sáng − V_tối).
- Kết quả: mặt trên sáng nhất, mặt trước sáng vừa, mặt hông/dưới tối; cột dài sáng trên tối dưới.
- Không áp cho: mặt phát sáng, khối tròn đã đổ bóng hình trụ, vải đã làm nếp gấp, chi tiết user bảo giữ nguyên.

### 7.3 Đổ bóng hình trụ cho khối tròn (đã được TuDN duyệt)
- Giữ U gom theo mặt; đặt V riêng cho từng loop.
- Tìm TRỤC THẬT của khối tròn từ các vòng đỉnh (không lấy tâm bounding box; khối có thể là nửa nón với trục ở mép, vd. y = 0).
- Mỗi đỉnh: r̂ = hướng ngang từ trục tới đỉnh; facing = max(0, dot(r̂, −Y)) (−Y là hướng camera); h = chiều cao chuẩn hóa 0–1.
  - Mặt bên: k = 0.85·facing^1.2 + 0.15·h
  - Mặt hướng lên (normal.z > 0.7): k = 0.9 + 0.1·facing
  - Mặt hướng xuống (normal.z < −0.4): k = 0
- Cam: dòng pixel = 30 − 26·k trên band1 u≈0.5166. Trắng: dòng = 56 − 40·k trên band1 u≈0.580 (k=1 #f5f5f5, k=0.5 ≈#b8b8b8, k=0 ≈#7a7b7c).

### 7.4 Phát sáng chỉ cho vùng nhỏ
Không bật emission trên T_Colorpalette dùng chung. Tạo `T_Colorpalette_Glow` (bản sao, nối Color texture → Emission Color, Strength ≈ 0.6), thêm slot và gán chỉ cho mặt cần phát sáng; đồng thời kéo UV lên đầu sáng nhất của strip. Báo user: model có thêm 1 material, cần bật Emission trong Unity; nếu team bắt buộc 1 material thì chỉ dùng UV sáng.

### 7.5 Nếp gấp vải (cờ, băng rôn) — user duyệt
- User kẻ sẵn đường nếp gấp (thường là ranh giới đỏ/be hoặc đường giữa cờ đuôi nheo).
- Chỉ kéo V các đỉnh NẰM TRÊN đường nếp gấp xuống đầu tối của dải (đỏ: dòng 302 band4 u≈0.5078; be: V 0.53); các đỉnh khác giữ nguyên → màu chuyển dần từ mép sáng vào nếp tối, cờ có chiều sâu/chuyển động.
- Tìm đường nếp gấp bằng các đỉnh dùng chung giữa mặt đỏ và mặt be, hoặc theo toạ độ user chỉ.

### 7.6 Đổi chỗ hai màu trong một chi tiết
Giữ nguyên tông hai màu, chỉ đổi vùng: mặt chuyển sang màu kia lấy U của dải màu kia, V tính theo t của chính nó trong khoảng cũ → ánh xạ sang khoảng của dải mới (giữ độ sáng tương đối).

### 7.7 Viền sáng mặt vát (rim highlight) — học từ khối nền Gate_Around
Mục đích: tạo một đường viền sáng mảnh dọc mép trên của khối (khối nền, đá, nẹp sắt, đầu xà...) để khối trông dày và có chiều sâu (đúng quy tắc ánh sáng 3).
- **Điều kiện hình học:** giữa mặt trên và mặt hông phải có một vòng mặt vát riêng (mặt nghiêng ~45°, vừa hướng lên vừa hướng ra ngoài; normal kiểu (0, −0.71, 0.71)). Không có mặt vát thì mép chỉ là một cạnh, không tô được viền → cần user duyệt cắt/bevel lưới (tăng tris). Chi tiết đã có cạnh vát sẵn thì làm ngay được.
- **Nhận diện mặt vát:** mặt hẹp nằm sát mép trên của khối, normal.z trong khoảng ~0.4–0.9 và có thành phần hướng ra ngoài (−Y hoặc ±X); nối mặt trên (normal.z ≈ 1) với mặt hông (normal.z ≈ 0).
- **Gán UV:** cùng dải (U) với cả khối; mặt vát được kéo lên ĐẦU SÁNG NHẤT của đoạn V, sáng hơn cả mặt trên lẫn mặt hông kề bên. Mép dưới mặt vát ≈ màu mặt trên, mép trên (cạnh hứng sáng) = đỉnh sáng → vệt sáng mảnh nổi lên.
- **Thứ tự độ sáng mẫu (Gate_Around, band1 u≈0.583):**
  - Mép trên mặt vát: V 0.901 (#8c8d8e) — sáng nhất
  - Mép dưới mặt vát = mặt trên: V 0.873 (#616264)
  - Mặt hông trước: V 0.857 → 0.870 (#454748 → #5b5c5e)
  - Đáy thu nhỏ: V 0.840 → 0.856 (#292b2d → #454748) — tối nhất
- **Đánh đổi có chủ đích:** với khối nền mà mặt trên phần lớn bị cổng che, được phép hạ mặt trên xuống tối hơn mặt vát để viền sáng nổi bật (ngoại lệ có chủ đích của quy tắc 1). Với khối mà mặt trên lộ rõ, giữ mặt trên sáng và cho mặt vát sáng hơn một bậc.
- Với màu trắng: viền vát dùng mức highlight chuẩn t8_a5 (dòng 6–18), mặt chính dùng neutral.
- Kiểm tra sau khi gán: zoom vào mép, viền phải là vệt sáng liền mạch, sáng hơn hai mặt kề; không lan sang mặt hông.

## 8. Xem trước và so sánh
- Viewport: Solid + Texture + Flat, Ortho, nhìn từ −Y (camera game). Ẩn overlay khi cần. Chụp 1 ảnh tổng sau khi map; ảnh thêm chỉ để xử lý vấn đề cụ thể hoặc xác minh chỉnh sửa (zoom vào vùng sửa).
- Material Preview chỉ để kiểm tra phát sáng (chờ shader compile).
- So với ref theo checklist bên dưới; sửa đúng vùng ảnh hưởng, kiểm tra vùng lân cận.

## 9. QA và lưu
Sau thay đổi cuối, với mọi mesh mục tiêu:
- U collapse trong từng mặt (max−min U ≤ 1e-4); V nằm trong một băng, lề ≥ 2 px; UV active = render; số mặt/tris không đổi (trừ khi user duyệt cắt lưới); material slot đúng.
- Đóng gói palette nếu cần (`image.pack()`), lưu bằng `bpy.ops.wm.save_mainfile(filepath=đích)`, rồi kiểm tra lại `is_dirty == False` ở lần gọi riêng (lưu lại nếu vẫn dirty).
- Data QA không chứng minh giống ref: báo riêng phần so sánh trực quan và giới hạn (chi tiết cần cắt lưới, khác biệt màu do palette).

## 10. Checklist cổng / prop
- [ ] Tâm cổng (cửa/emblem) là vùng sáng + bão hòa nhất?
- [ ] 1 màu chủ đạo + 1 màu nhấn rõ ràng, có viền vàng?
- [ ] Mỗi khối có sáng – trung tính – tối rõ ràng (không tô phẳng)?
- [ ] Vùng tối giữ đúng tông màu gốc (không trượt sang màu khác)?
- [ ] Khối tròn: giữa sáng, hai bên tối, trục đặt đúng?
- [ ] Trắng theo 3 mức chuẩn t8_a5, không trắng tinh cả mảng?
- [ ] Vải/cờ có nếp gấp tối, không phẳng?
- [ ] Cạnh trên của khối nền/đá/sắt có viền sáng mặt vát (nếu có mặt vát)?
- [ ] Texture hơi trầm hơn kết quả cuối (tính trước ánh sáng Unity)?
- [ ] Mặt trên sáng, mặt dưới/đáy khối nền đủ tối?
- [ ] Kim loại có highlight mạnh ở đỉnh?
- [ ] Mảng lớn không trùng navy nền / xám đường chạy?
- [ ] Đã đối chiếu với model đạt chuẩn của team (vd. t8_a5)?

## 11. Báo cáo cuối
Một báo cáo ngắn: file đã lưu + trạng thái dirty, các vùng đã đổi (bảng ngắn trước/sau nếu nhiều vùng), kết quả QA, giới hạn còn lại (chi tiết cần cắt lưới, khác biệt do palette), rồi hỏi user duyệt base trước khi làm chi tiết. Nếu project TUDN có file `claude/EndGate_lighting_color_rules.md`, đọc nó trước khi làm và cập nhật nhật ký áp dụng sau khi xong.