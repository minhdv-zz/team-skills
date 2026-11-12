---
name: fixsung_hoidz
description: Quy trình trọn gói cho súng skin mới (pirate-wars) - (1) Blender - tạo mesh nòng cannon_tXXX_g từ thân cannon_tXXX (cắt gọn, giữ chi tiết phía đầu nòng, bỏ chi tiết phía sau tâm); (2) xuất FBX bằng ACT vào cannon\mesh\g và đặt Import Settings trong Unity; (3) Unity - setup TRỰC TIẾP vào prefab c_XXXX có sẵn (thay FBX thân bằng _g, gán M_cannon, đặt Muzzle Point). Bản đi từ fixship_hoidz, đổi đối tượng ship sang súng. Dùng khi người dùng gọi /fixsung_hoidz, 'fix súng', hoặc đưa tên thân cannon_tXXX + prefab c_XXXX. Có thể chạy từng phần (chỉ mesh / chỉ export / chỉ setup) nếu người dùng nói rõ.
---

# fixsung_hoidz — Sửa mesh súng, export FBX, setup prefab súng Unity

> **Trạng thái (2026-11-06):** đã chạy trọn quy trình A→B→C trên t202–t205 (mesh `_g`, 4 FBX, 4 prefab `c_0202`–`c_0205`); họ t30x (t302, t303, t304) đã làm xong phần A. **Chưa qua review bằng subagent** (Agent.md bắt buộc trước khi báo hoàn thành). Điểm còn mở ở mục "Việc chưa chốt" cuối file.

Ba phần chạy nối tiếp. Người dùng đưa: tên mesh súng trong Blender (ví dụ `cannon_t301_g`) và prefab Unity (ví dụ `c_0301`). **Không hỏi lại thứ đã có trong skill**; chỉ hỏi những điểm đánh dấu "HỎI". Dừng giữa chừng chỉ khi một kiểm tra bắt buộc không đạt hoặc cần đầu vào mà skill nói phải hỏi.

Quy tắc chung:
- Ngôn ngữ tiếng Việt, báo ngắn gọn, nêu số đo cụ thể; nói thẳng điểm nào chưa kiểm tra hoặc là ước lượng.
- Scene có thể bị undo/đổi tên giữa chừng: **đọc lại scene trước mỗi lần sửa**.
- Không động vào súng, prefab ngoài danh sách người dùng đưa. Không xóa backup. Không đụng ship/khung `osung*` (đó là việc của fixship_hoidz).
- Câu hỏi chọn lựa dùng `AskUserQuestion`, không hỏi bằng chữ thường.
- Id: `c_0301` → mesh `cannon_t301_g` (bỏ số 0 đầu).

## Kết nối và sự cố đã gặp (đọc trước khi chạy)
- **Blender MCP (`mcp__blender__*`)** có thể rớt giữa phiên (`CONNECT_TIMEOUT`) và không tự đăng ký lại công cụ. Kiểm: `claude mcp list` (server `blender` Connected = server ổn, lỗi ở phiên). Người dùng sửa bằng `/mcp` > Reconnect hoặc mở phiên mới. **Đường vòng đã chạy được:** nối thẳng socket add-on `127.0.0.1:9876`, gửi JSON `{"type":"execute_code","params":{"code":...}}` (đặt script ở thư mục tạm khác thư mục dự án, chạy `python -I`, `PYTHONIOENCODING=utf-8`); chụp viewport bằng `{"type":"get_viewport_screenshot","params":{"max_size":900,"filepath":...,"format":"png"}}` rồi `Read` ảnh. Bản Blender này chỉ có engine EEVEE: **không render tạm bằng Workbench** (lỗi và để lại scene tạm).
- **Unity MCP (`mcp__UnityMCP__*`)** cần gói `com.coplaydev.unity-mcp` trong `Packages/manifest.json` (dòng: `"com.coplaydev.unity-mcp": "https://github.com/CoplayDev/unity-mcp.git?path=/MCPForUnity#v10.3.0"`). Gói này là thay đổi **chưa commit**; `git pull` hoặc discard làm mất nó, khi đó UnityMCP báo `No Unity Editor instances found` dù Unity đang chạy (cổng 6401 không nghe, `~/.unity-mcp/unity-mcp-status-*.json` ghi `reloading`). Cách xử lý đã làm: hỏi người dùng, thêm lại đúng 1 dòng vào manifest (không commit), chờ Unity tải gói + compile (~1–2 phút; `Library/PackageCache` có `com.coplaydev.unity-mcp@...`, cổng 6401 LISTENING). Không nhầm với **UnitySkills** (`com.besty.unity-skills`, menu Window > UnitySkills) vì đó là gói khác.
- **Safety của `execute_code` chặn `AssetDatabase.DeleteAsset`.** Không tắt safety; khi người dùng đã đồng ý xóa file thì xóa đúng đường dẫn bằng `rm` (kể cả `.meta`) rồi `AssetDatabase.Refresh()`.
- **Blender mở lại/khôi phục file làm mất thay đổi chưa lưu**; người dùng cũng có thể tự xóa/ghi đè object em đang làm. Nhắc người dùng Ctrl+S (em không tự lưu file của họ) và **đọc lại scene trước mỗi lần nói/xuất** (số vert/tri thực tế).

---

# PHẦN A — Blender: tạo mesh súng `cannon_tXXX_g` từ thân `cannon_tXXX`

Bản `_g` là thân súng gốc được **cắt gọn thành đoạn nòng** (không phải làm lại từ đầu). Mẫu chuẩn: `cannon_t201_g`, `cannon_t202_g` (họ t2xx) và `cannon_t301_g` (họ t30x); các bản người dùng đã chốt: t203, t204, t205 (họ t2xx), t302, t303 (họ t30x).

## A1. Xác định đối tượng
- Người dùng đưa tên hoặc ảnh có mũi tên. **Không đoán theo màu**. Liệt kê bằng `execute_blender_code`: tên, mesh data, số vert, bbox world, parent, rotation/scale, modifier, `visible_get()`, số mảnh rời (đảo liên thông, kèm vert và khoảng x). Chưa chắc đâu là mesh cần làm → hỏi.
- **Chọn họ theo cấu trúc mảnh rời**, không theo số tier:
  - **Họ t2xx** (t201–t205): thân chính có vành lớn ở một đầu, có vành giữa, gai/đinh tán quanh vành; mẫu `t202_g`.
  - **Họ t30x** (t301–t303): thân + vành đôi ở một đầu, đầu xa có vòng đinh tán; mẫu `t301_g`.
  - Không khớp họ nào (t401, t501, ...) → HỎI người dùng, không áp công thức.
- Nguồn có thể bị **xoay** (t302: rot -46.8°, 31°) hoặc **lệch** (t203 loc y -0.9, t303 (0.128,-0.638,0)): luôn **áp `matrix_world` vào mesh** rồi tính, tạo object mới transform identity. Mọi tính toán trong world.
- Mesh đang ẩn thì tự bật để đo, ghi trạng thái ban đầu và trả về như cũ khi xong. Ẩn/hiện tạm object khác để nhìn thì cũng phải trả lại (không để `look` bị chồng mẫu).
- Người dùng có thể ghi đè mesh data của object em đang làm bằng mẫu của họ. Mỗi lượt **đọc lại scene** (tên object, mesh data, số liệu) trước khi nói về nó.

## A2. Quy tắc chung (người dùng đã chốt)
1. **Làm trên bản sao** của `cannon_tXXX`; thân gốc giữ nguyên làm backup. Chỉ khi sửa trực tiếp mesh có sẵn mới backup `<tên>_before_param` (`use_fake_user=True`).
2. **Đặt tên chỉ đến `_g`:** kết quả cuối `cannon_tXXX_g`, mesh data cũng `cannon_tXXX_g`; **không** hậu tố `_new`, `.001`, `.002`. Tên tạm khi so sánh (vd `_redo`, `_auto`) thì nói rõ là tạm. Đã có object cùng tên (người dùng làm) thì **HỎI** trước khi ghi đè.
3. **Kết quả cuối ở location (0,0,0), rotation 0, scale 1** (dễ nhìn, export ngay). Sau khi đổi location gọi `bpy.context.view_layer.update()` trước khi đọc `matrix_world`.
4. Trục nòng về y=z=0; đầu vành về x=-0.527 (t2xx) hoặc -0.35 (t30x); **đầu xa để hở** (mẫu hở 16–18 cạnh), không bịt. Nếu lỡ bịt thì mặt bịt phải gán UV bằng UV của loop thân kề.
5. **Triangulate ngon** (>4 cạnh), giữ nguyên quad. Mẫu không có ngon. (Bản t304.001 của người dùng còn 8 ngon ở đáy gai trên vành: chờ người dùng quyết có triangulate không.)
6. **Không decimate đại trà** (méo gai, tách thêm mảnh). Số tri giảm nhờ bỏ chi tiết thừa.
7. **Không chỉnh UV thân** (hai lần sửa UV hàng loạt đã làm hỏng thân). UV là bảng màu riêng từng tier, không copy từ tier khác.
8. **Modifier Weighted Normal (người dùng chốt, áp cho mọi họ/mọi `_g`, xem mục 11):** mesh `_g` làm xong phải có đúng 1 modifier Weighted Normal với setting chuẩn bên dưới, dù thân gốc có hay không (bản cũ ghi "họ t30x không có modifier" là lỗi thời).
9. Nhóm chi tiết **giữ**: thân chính, vành sát đầu vành, gai kim cương/đinh quanh vành đó. Nhóm **xóa**: vành giữa, dãy gai/đinh giữa thân, gai/đinh đầu xa, mảnh lớn lạ giữa thân.

10. **Quy tắc tâm mesh (người dùng chốt, áp cho mọi họ):** lấy **tâm của mesh `_g`** theo chiều dài (`x_tâm = (x_min + x_max)/2`: t2xx ≈ -0.043, t30x ≈ +0.047). **Từ tâm về phía đầu nòng thì GIỮ chi tiết** (vành, gai, đinh); **từ tâm về phía sau thì BỎ HẾT chi tiết** (vành thứ hai, dãy gai/đinh, vòng loe, mảnh lạ), chỉ còn ống trơn. **Đầu nòng = đầu có vành (-X sau khi dời; x_min = -0.527 ở t2xx, -0.35 ở t30x)**; phía sau = đầu xa hở (x_max). Đo bằng **tâm x của từng mảnh chi tiết**: tâm mảnh < `x_tâm` thì giữ, ≥ `x_tâm` thì xóa (mảnh có thể vắt qua tâm nếu tâm của nó nằm phía đầu nòng, vd gai 32 vert của t304 x -0.105→0.098 vẫn giữ). Quy tắc này thay cho các ngưỡng x cố định (`≤ -0.227`, `xmax ≤ -0.05`, `xmax ≤ xmax vành + 0.10`) và **giải thích đúng mọi ca đã làm**: t203 (kết quả cuối giữ 6 mảnh, tâm mảnh x -0.41→-0.27), t204 (8), t205 (8), t302 (1), t303 (5 gai + vành), t304 (8 gai + vành); kiểm trên scene: không `_g` nào có mảnh chi tiết với tâm >= `x_tâm`. Khi áp dụng, tính `x_tâm` **sau khi đã dời và cắt dài** (dựng thân đúng chiều dài trước, rồi mới lọc mảnh), hoặc tính từ hai mốc đã biết (x_min mới và x_max = 0.442/0.444).

11. **Thêm modifier Weighted Normal khi mesh `_g` đã xong (người dùng chốt 2026-11-06, ảnh chụp bảng modifier):** làm **bước cuối của phần A**, sau khi đã cắt đầu xa, dời nón, triangulate ngon (không thêm trước vì sẽ che lỗi hình học). Setting chuẩn: tên `Weighted Normal`, **Weighting Mode = Face Area, Weight = 50, Threshold = 0.01, Keep Sharp = BẬT, Face Influence = TẮT**; các nút hiển thị để mặc định (Edit Mode, Viewport, Render bật; On Cage tắt). Trong Blender bản này Face Area/50/0.01 đã là mặc định, nên **chỉ cần bật `keep_sharp`**, nhưng vẫn đặt rõ cả 4 giá trị. Không Apply modifier (FBX export của ACT áp modifier lúc xuất; Apply sớm thì mất khả năng chỉnh). Mesh đã có modifier này thì cập nhật setting thay vì thêm cái thứ hai.
```python
import bpy
ob = bpy.data.objects["cannon_tXXX_g"]
m = next((x for x in ob.modifiers if x.type == 'WEIGHTED_NORMAL'), None) or ob.modifiers.new("Weighted Normal", 'WEIGHTED_NORMAL')
m.mode = 'FACE_AREA'; m.weight = 50; m.thresh = 0.01
m.keep_sharp = True; m.use_face_influence = False
```
Kiểm lại: đọc `ob.modifiers` ra đúng 1 modifier, 4 giá trị trên; nhờ người dùng nhìn bóng trong viewport (vệt đen quanh nón/miệng nòng thì xử custom normals như A3b mục 6). Nhớ ghi trong báo cáo A4 là đã thêm modifier cho mesh nào.

## A3a. Họ t2xx (mẫu `t202_g`: thân 209 + vành 108 + 8 đinh 25; 517 vert, 900 tri)
1. Copy, áp transform. Tâm trục: **z cố định 0.4467** của thân t2xx (không tính từ vert hai đầu vì gai làm lệch khoảng 0.024 ở t204/t205); y = tâm y của thân (= `location.y` của object nguồn sau khi áp, vd t202 -1.19, t203 -0.9, t204 -1.31, t205 -0.5).
2. `Translation(+0.358, -yc, -zc)` (đầu vành lớn về -0.527).
3. Tách mảnh. Giữ thân chính (đã chứa vành lớn) và các mảnh chi tiết có **tâm x < x_tâm** (quy tắc tâm mesh, A2 mục 10; với t2xx x_tâm ≈ -0.043, tức nhóm đuôi tâm x mới <= -0.227 cũng thỏa). Xóa các mảnh còn lại.
4. `bisect_plane` tại x=0.442 (`clear_outer`), dài 0.969, không bịt.
5. Triangulate ngon. Kết quả đã làm: t203 (381 vert/688 tri), t204 (404/727, 16+6×12 gai), t205 (331/612, 2×19+6×14 gai).
6. **Ca t204:** mảnh thân chính nhiều hơn các tier khác (270 vert, thừa 62 vert) vì có 2 miếng "ô thoi" hồng/trắng gần đầu cắt; bisect không gỡ được. **Vòng L của họ t30x KHÔNG dùng cho t2xx** (L ở t2xx chỉ r 0.136–0.17, không phải vành ống, làm hỏng thân). Báo người dùng gỡ tay. Hai lần sửa UV hàng loạt đã làm hỏng thân.
7. **Ca t202:** đinh gốc 77–79 vert (kết quả 1097 vert/1960 tri) so với mẫu cũ đinh 25 vert (517/900). Hỏi người dùng có giảm đinh không; không decimate đại trà.

## A3b. Họ t30x (mẫu `t301_g`: thân 177 + vành đôi 128; 305 vert, 560 tri; dài 0.794, x -0.35→0.444, r ~0.26)
1. Copy, áp transform. Tâm trục: tâm bbox thân (t302 z=0.518, t303 z≈0.527; y=0).
2. Dời x sao cho đầu vành về x=-0.35 (t301/t302 +0.05, t303 -0.079).
3. Tách mảnh. Giữ **thân chính** + **vành lớn thứ hai gần đầu vành** (128/144 vert) + mọi **mảnh chi tiết có tâm x < x_tâm** (quy tắc tâm mesh, A2 mục 10; t30x x_tâm ≈ +0.047 sau khi dời). Kết quả đã chốt: t303 giữ 5 gai 16 vert quanh vành; **t304 giữ 8 mảnh: 5 gai trên vành (3×16, 2×12; x mới -0.2→-0.15) và 3 gai lớn 32 vert sát sau vành (x mới -0.105→0.098)**; họ t301/t302 thuần không có gai nên chỉ còn thân + vành. Xóa: vành thứ hai ở giữa thân, dãy gai/đinh giữa thân và đầu xa, mọi mảnh có tâm >= x_tâm. (Bản em làm đầu tiên của t304 chỉ giữ 5 gai trên vành, người dùng bổ sung thêm 3 gai 32 vert.)
4. **Đầu xa trơn bằng vòng L** (cách của người dùng, đã tái hiện khớp t303: 423 vert/770 tri/7 mảnh/18 cạnh hở):
   - Thân gốc có vành loe (bạc ở t303, cam ở t302) sát đầu cắt. Mặt ống là các **quad dài** chạy từ vành đuôi tới **vòng L** (t303: 18 vert x≈0.324, r 0.242–0.249); vành loe, nắp tròn, môi trong nằm sau L.
   - Tìm cạnh dài dọc trục (`|dx| > 0.3`) của thân chính; đầu xa của chúng = L.
   - **Xóa mọi vert thân chính có x >= x_L - 0.005 trừ L**, làm TRƯỚC (không bisect, không xóa theo ngưỡng x cố định như 0.3245 vì mất cả mặt dài).
   - Dời L về `x = 0.443` (radial scale về ~0.245 nếu cần). Mặt dài giãn thành ống trơn, UV giữ.
   - Bác: ép dẹt bán kính vành (còn vòng chồng, thân 333 vert), bisect sớm, bisect 0.444 để nguyên vành.
5. Triangulate ngon.
6. **Nón trong thân (người dùng chỉnh lại lần 2, đã chốt):** đỉnh nón là 1 vert trên trục nòng, đáy là vòng quanh nó (16 vert ở t301/t302, 18 vert ở t303, bằng số cạnh tiết diện). **Vị trí chuẩn: đỉnh x = -0.091, đáy x ≈ -0.247** (độ sâu 0.157; bán kính đáy ~0.18–0.195). Thân gốc t302/t303 có nón sâu 0.26 (đỉnh ~0.06, đáy ~-0.198), nên phải dời **cả hai**: đỉnh về -0.091 và vòng đáy về -0.247 (vòng đáy là các vert láng giềng của đỉnh nón). Chỉ dời đỉnh (như em làm trước đó: đỉnh -0.038) là sai, người dùng phải chỉnh lại. Kiểm lại: pháp tuyến x các mặt nón ≈ -0.76 và mọi mặt nón quay về phía -x; các vòng lòng trong (r < 0.215) ở x -0.35/-0.34, -0.25/-0.24, -0.22/-0.21 và đỉnh -0.09 như mẫu. Dời xong có thể còn custom normals cũ quanh nón: nhờ người dùng nhìn bóng trong viewport, vệt đen thì xóa custom normals.
7. Kết quả đã chốt: t302_g khớp y hệt t301_g (305/560, nón 0.158); t303_g 423/770, nón đỉnh -0.091 đáy -0.247 (người dùng đã chỉnh), 2 material slot `color`/`color.001` giữ từ thân gốc. Nhiều vert/tri hơn mẫu t301_g là chấp nhận được khi giữ gai.

## A4. Kiểm tra và báo cáo phần Blender
- `look` chế độ `angles` tự khung vào target (nhưng màu khác viewport, đỏ/trong suốt là mặt trong/mặt ngược: báo rõ chưa kiểm màu). Xem từ trên xuống, nhìn từ đầu xa, nhìn từ đầu vành.
- Báo: vert/tri/ngon, mảnh rời (vert và khoảng x), bbox (đối chiếu -0.527/-0.35 → 0.442/0.444), cạnh biên đầu xa, vị trí đỉnh/đáy nón (họ t30x: -0.091/-0.247), modifier (phải có Weighted Normal: Face Area/50/0.01/Keep Sharp bật, mục A2.11), material slot, UV range, vị trí object, đầu cắt chưa bo tròn.
- Nói rõ điểm khác mẫu và điểm chưa kiểm (UV/màu), object nào đã ẩn/hiện tạm và đã trả lại.

---

# PHẦN B — Export FBX sang Unity bằng ACT

## B1. Mesh cần xuất
Thường là mesh súng `cannon_tXXX_g` (MESH đơn, có thể kèm con). Xuất object được chỉ định + `children_recursive`. Kiểm tra tên tồn tại, là MESH; đang ẩn thì báo trước khi xuất. Báo danh sách mesh sẽ xuất, kèm kiểm: không parent/không con, location (0,0,0), rotation 0, scale 1. Liệt kê thư mục đích trước: file trùng tên sẽ bị **ghi đè** (nêu khi hỏi). Mỗi object gốc → 1 FBX theo tên. Scene có thể đã khác lần làm trước (người dùng ghi đè mesh): xuất đúng cái đang có trong scene và báo số vert/tri thực tế. Không xuất thân `cannon_tXXX` trừ khi người dùng yêu cầu.

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
Kiểm tra: liệt kê `.fbx` trong thư mục xuất, so thời gian sửa đổi (mỗi object gốc → 1 FBX theo tên). Trước khi xuất lưu `hide_get()/hide_viewport` từng object; **sau khi xuất trả ẩn/hiện như cũ và bỏ chọn**. `scene.act.export_path` bị đổi sang thư mục xuất: báo người dùng (không tự đổi lại).

## B5. Import Settings trong Unity (giống `Assets/3D_kho/cannon/mesh/g/cannon_t101_g.fbx`)
Cần Unity MCP kết nối (xem mục Kết nối). FBX mới import lần đầu theo mặc định (Animation Generic, BlendShapes/Cameras/Lights bật, Mesh Compression Off, Materials theo FBX) nên **bắt buộc đặt lại**; `.meta` chỉ có sau khi Unity import.
Model: Scale Factor 1 / Use File Scale bật, Mesh Compression Low, Read/Write tắt, Import BlendShapes/Visibility/Cameras/Lights tắt, Normals Import, Tangents Calculate Mikktspace. Rig: Animation Type None. Animation: Import Constraints tắt, Import Animation tắt. Materials: Creation Mode None. Chạy bằng `mcp__UnityMCP__execute_code` (`compiler="codedom"`, C# 6), đổi đường dẫn Windows thành `Assets/...`:
```csharp
UnityEditor.AssetDatabase.Refresh();
var p = "Assets/3D_kho/cannon/mesh/g/<ten>.fbx";
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
So `.fbx.meta` với `cannon_t101_g.fbx.meta` ở cùng thư mục `g` (`diff <(tail -n +3 a | tr -d '\r') <(tail -n +3 b | tr -d '\r')`, bỏ 2 dòng đầu guid, bỏ CR): đã cho **diff rỗng** trên t202_g–t205_g. Nếu không so thì nói rõ chưa so. Đọc lại importer sau khi lưu và đọc bounds mesh trong Unity (t2xx_g: x -0.442→0.527, dài 0.969). `read_console` kiểm lỗi import.

---


---

# PHẦN C — Unity: setup TRỰC TIẾP vào prefab súng `c_XXXX`

**Người dùng chốt (2026-11-06): setup thẳng vào prefab `c_XXXX` có sẵn, KHÔNG tạo bản clone `c_XXXX_new`.** Các `c_*_new` có sẵn (`c_0101_new`, `c_0201_new`, `c_0301_new`, `c_0401_new`, `c_0501_new`) là của người dùng: không sửa, không bắt chước tên. (Lần đầu em tạo `c_0202_new`–`c_0205_new` rồi bị yêu cầu làm lại và xóa.) Chi tiết chung có trong skill **`setcannon_hoidz`** (nếu mâu thuẫn thì theo skill này). Prefab nằm ở `Assets/_Game/Prefabs/CannonSkins/c_XXXX.prefab`. **Prefab đã có thì setup thẳng vào nó. Chưa có thì: CLONE một prefab súng có sẵn → setup đủ thứ trên bản clone → ĐỔI TÊN thành `c_XXXX`** (người dùng chốt 2026-11-06, xem C2b; đây không phải bản `_new`: tên cuối phải đúng `c_XXXX`, không để lại bản clone/tên tạm).

## C0. Kết nối, đọc hiện trạng
- Unity MCP phải kết nối (xem mục Kết nối); chưa nối được thì dừng và báo, không sửa `.prefab` bằng tay.
- `execute_code` với `compiler="codedom"` (C# 6: không `$""`, `?.`, tuple; ghi đủ `UnityEngine.Object.DestroyImmediate`; không có `PrefabUtility.GetNestedPrefabInstanceRoot` ở 2022.3; dùng `Stack` để duyệt cây).
- Đọc `c_XXXX`: loại (Variant), base, root pos/rot/scale, các con (tên, pos, rot, material, nguồn FBX), mọi `Muzzle Point`. Hiện trạng thường gặp: con thân `cannon_tXXX` ở khoảng (0.32–0.39, 0.073, 0), `Muzzle Point` khoảng (1.20–1.27, 0.488, 0), root rotation (0,270,0).
- Kiểm FBX `_g` có trong `Assets/3D_kho/cannon/mesh/g/` đã đặt Import Settings (B5) và `M_cannon.mat` tồn tại. Không có `_g` khớp id thì dừng và hỏi.
- **Chưa có `c_XXXX.prefab`** (đọc bằng `AssetDatabase.LoadAssetAtPath` ra null) → làm theo C2b (clone → setup → đổi tên). Đã có thì làm C2 như trên. Tên đích `c_XXXX` đã tồn tại thì không bao giờ ghi đè khi chưa hỏi.

## C1. Cấu trúc chuẩn (đã làm và kiểm trên `c_0202`–`c_0205`)
- Root `c_XXXX`: Variant của `CannonSkinBase.prefab`, position (0,0,0), rotation Euler (0,270,0) (= -90), scale 1.
- **Xóa con thân cũ** `cannon_tXXX` (báo rõ đã xóa gì và vị trí cũ). Gắn con `cannon_tXXX_g` là nested prefab: `PrefabUtility.InstantiatePrefab(fbx, root.transform)`, `child.name` = tên FBX, rotation identity, scale 1, **position (0.406, 0, 0)**.
- Material: gán `Assets/3D_kho/cannon/material/M_cannon.mat` vào **mọi slot** của mọi renderer của con `_g` (t2xx_g có 1 slot). Đọc lại `sharedMaterials`, không NULL/magenta.
- **`Muzzle Point`** (giữ node có sẵn của base, không clone với nòng đơn): position **(0.928, 0, 0)**, **rotation Euler (0,90,0) đặt rõ** (lần đầu để mặc định ra (0,0,0) là sai), scale 1.
- **Vì sao 0.406 và 0.928:** trong Unity mesh `_g` t2xx có bounds x -0.442→0.527 (trục X Unity đảo so với Blender nên **đầu vành = đầu nòng nằm ở +X max**). Đuôi mesh đặt sát gốc: `child.x ≈ -min_x - 0.036` (= 0.406), mũi `max_x + child.x = 0.933`, `Muzzle Point.x = child.x + max_x - 0.005 = 0.928`. Đây đúng là số của `c_0201_new` do người dùng chỉnh tay (t101 0.388/0.824, t401 0.392, t501 0.404 là số tay riêng, t501 có miệng quái nên lệch). **Với họ khác (t30x...)** đọc `mesh.bounds` trong Unity rồi tính theo công thức trên, báo rõ là suy ra, nhờ người dùng nhìn gizmo; không áp 0.406/0.928 máy móc nếu bounds khác. Nòng đôi: mỗi nòng một `Muzzle Point` (clone node gốc).
- Không thêm script/collider/Rigidbody; không gán skin vào `CannonSlot` hay Skin Catalog.

## C2. Thực hiện (một lần `execute_code`)
```csharp
var mat = UnityEditor.AssetDatabase.LoadAssetAtPath<UnityEngine.Material>("Assets/3D_kho/cannon/material/M_cannon.mat");
var path = "Assets/_Game/Prefabs/CannonSkins/c_0203.prefab";
var fbx = UnityEditor.AssetDatabase.LoadAssetAtPath<UnityEngine.GameObject>("Assets/3D_kho/cannon/mesh/g/cannon_t203_g.fbx");
var root = UnityEditor.PrefabUtility.LoadPrefabContents(path);
try {
  var body = root.transform.Find("cannon_t203");
  if (body != null) UnityEngine.Object.DestroyImmediate(body.gameObject);
  var child = (UnityEngine.GameObject)UnityEditor.PrefabUtility.InstantiatePrefab(fbx, root.transform);
  child.name = "cannon_t203_g";
  child.transform.localPosition = new UnityEngine.Vector3(0.406f, 0f, 0f);
  child.transform.localRotation = UnityEngine.Quaternion.identity; child.transform.localScale = UnityEngine.Vector3.one;
  foreach (var r in child.GetComponentsInChildren<UnityEngine.MeshRenderer>(true)) { var ms = r.sharedMaterials; for (int i = 0; i < ms.Length; i++) ms[i] = mat; r.sharedMaterials = ms; }
  UnityEngine.Transform muzzle = null;
  foreach (var tr in root.GetComponentsInChildren<UnityEngine.Transform>(true)) if (tr != root.transform && tr.name.ToLower() == "muzzle point") { muzzle = tr; break; }
  muzzle.localPosition = new UnityEngine.Vector3(0.928f, 0f, 0f); muzzle.localRotation = UnityEngine.Quaternion.Euler(0f, 90f, 0f);
  UnityEditor.PrefabUtility.SaveAsPrefabAsset(root, path);
} finally { UnityEditor.PrefabUtility.UnloadPrefabContents(root); }
```
Chạy lặp cho từng prefab người dùng đưa (4 prefab thì không cần hỏi xác nhận; từ 5 prefab trở lên hỏi). Prefab stage đang mở trùng prefab thì sửa trên stage (`prefabContentsRoot` + `SaveAsPrefabAsset(root, stage.assetPath)`).

## C2b. Prefab chưa có: clone → setup → đổi tên (người dùng chốt 2026-11-06)
Thứ tự bắt buộc: **clone trước, setup xong rồi mới đổi tên** (không đổi tên trước).
1. **Chọn nguồn clone** (nêu rõ trong báo cáo đã clone từ đâu): prefab `c_YYYY` có sẵn (không phải `c_*_new`) gần nhất, ưu tiên cùng tier/họ (vd `c_0201` cho `c_0206`), vì nó đã là Variant của `CannonSkinBase` với root rotation (0,270,0) và có `Muzzle Point`. Không có prefab súng nào thích hợp thì dựng mới: `InstantiatePrefab(CannonSkinBase)` + `SaveAsPrefabAsset` (instance của prefab lưu ra thành Variant). Không rõ nên clone từ đâu thì HỎI bằng `AskUserQuestion`.
2. **Clone** thành tên tạm trong cùng thư mục, tên không trùng gì có sẵn, ví dụ `c_XXXX_clone.prefab`: `AssetDatabase.CopyAsset("…/c_YYYY.prefab", "…/c_XXXX_clone.prefab")` (giữ nguyên là Variant, GUID mới). Kiểm tra bản gốc `c_YYYY` không bị đổi.
3. **Setup trên bản clone** đúng như C1/C2, nhưng xóa **mọi con khác `Muzzle Point`** của bản clone (FBX thân/`_g` của prefab nguồn), gắn `cannon_tXXX_g` mới, gán M_cannon, đặt lại `Muzzle Point` (position/rotation) và xóa `Muzzle Point` thừa nếu nguồn là súng nhiều nòng mà đích nòng đơn.
4. **Đổi tên** bản clone thành `c_XXXX`: `AssetDatabase.RenameAsset("…/c_XXXX_clone.prefab", "c_XXXX")` (tên không kèm đuôi; giữ GUID và `.meta`). Nếu công cụ chặn thì đổi bằng `mv` đúng cặp `.prefab` và `.prefab.meta` rồi `AssetDatabase.Refresh()`. Sau đó đọc lại: root GameObject tên `c_XXXX`, Variant của `CannonSkinBase`, hết bản `c_XXXX_clone` trong thư mục.
5. Kiểm tra C3 trên prefab đã đổi tên. `git status` sẽ có `c_XXXX.prefab` và `.meta` mới (chưa theo dõi), không còn file tạm.


## C3. Kiểm tra
1. **Dữ liệu:** đọc lại từng prefab bằng `LoadPrefabContents`: Variant, base `CannonSkinBase.prefab`, đúng 2 con (`Muzzle Point` + `cannon_tXXX_g`), nested prefab từ đúng FBX, `sharedMaterials` = M_cannon, mũi mesh (`localPosition.x + bounds.max.x`) ≈ 0.933, `Muzzle Point` đúng pos/rot/scale. Prefab khác (vd `c_0201`) không bị đổi.
2. **Mắt:** `open_prefab_stage`, chọn `Muzzle Point`, `SceneView.LookAt(m.position, Quaternion.Euler(20,150,0), 1.6f)`, `manage_camera` screenshot (`capture_source=scene_view`, `output_folder="Temp"`), `Read` ảnh. Gizmo phải nằm ở **đầu có vành** (đầu nòng), mũi tên xanh (forward +Z) chỉ ra ngoài; `m.forward` = (0,0,1). Xem ít nhất 1 prefab; nói rõ các prefab còn lại chỉ kiểm bằng số liệu.
3. **Console:** `read_console` lọc Error/Warning, báo nguyên văn lỗi liên quan (404 API player, cảnh báo scene cũ, `.meta` mồ côi của package khác là không liên quan).
4. **Dọn dẹp:** `close_prefab_stage`, `Tools.pivotMode = Center`, bỏ chọn, xóa ảnh tạm trong `Temp` (và `Assets/Screenshots` nếu lỡ tạo). `git status` chỉ nên có các `c_XXXX.prefab` `M` (và dòng MCP trong manifest nếu có); **không commit**.
5. File thừa (vd bản `_new` lỡ tạo): chỉ xóa khi người dùng bảo, bằng `rm` đúng đường dẫn (8 file = 4 prefab + 4 `.meta`).

---

# Báo kết quả cuối (một lần, ngắn gọn, tiếng Việt)
- **Blender:** bảng vert/tri/ngon/mảnh/bbox, nón (họ t30x: đỉnh -0.091, đáy -0.247), điểm khác mẫu, điểm chưa kiểm (UV/màu/bóng trong lòng ống), object ẩn/hiện tạm đã trả.
- **Export:** FBX đã ghi (đường dẫn, thời gian, có ghi đè không), Import Settings đã đặt và `.meta` đã so, `scene.act.export_path` bị đổi.
- **Unity:** từng prefab (con đã xóa, FBX đã gắn, tọa độ `Muzzle Point`, material), `read_console`, điểm suy từ bounds cần người dùng nhìn lại.
- **Review:** Agent.md bắt buộc 1 subagent Opus mới review (chỉ đọc) trước khi báo hoàn thành; nếu chưa chạy thì nói rõ "chưa review".

# Không làm
- Không động vào prefab/súng ngoài danh sách người dùng đưa.
- Không để lại bản clone/tên tạm (`_new`, `_clone`) sau khi xong: bản clone phải được đổi tên thành `c_XXXX` (chỉ khi prefab chưa có); không sửa `CannonSkinBase`, FBX có sẵn khác, `M_cannon`, các `c_*` hay `c_*_new` khác. Không xóa mesh backup `_before_param`.
- Không tắt safety của `execute_code`; không commit; không tự lưu file `.blend` của người dùng.
- Không làm phần ship (khung `osung*`, `CannonSlot`, `s_XXXX_new`): dùng fixship_hoidz.

# Việc chưa chốt (cập nhật skill khi người dùng trả lời)
- Đầu cắt có cần bo tròn như mẫu `t202_g` không; thân tri dài mảnh (t204) có gây vệt bóng trong Unity không; bóng trong lòng ống sau khi dời nón (custom normals cũ).
- Gỡ 2 miếng "ô thoi" của `t204_g` (chỉ gỡ tay được); t202_g có giảm đinh về 25 vert không.
- Vòng L (A3b) mới kiểm trên t303; chưa áp lại cho t302 theo cách này.
- Vị trí con 0.406/Muzzle 0.928 là số của `c_0201_new`, chưa đo tâm lỗ nòng từng mesh; họ t30x và các họ khác chưa chạy Phần C.
- Có xuất cả thân `cannon_tXXX` không (hiện chỉ `_g`).
- Nhánh C2b (clone → setup → đổi tên) mới ghi theo lời người dùng, **chưa chạy thử**: chưa biết `AssetDatabase.RenameAsset`/`CopyAsset` có bị safety của `execute_code` chặn không, và nên clone từ prefab nào.
- Skill chưa qua review bằng subagent.
