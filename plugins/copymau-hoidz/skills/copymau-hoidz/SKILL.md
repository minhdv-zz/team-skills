---
name: copymau-hoidz
description: Copy colors between Blender models or selected parts, especially palette-texture models whose colors are controlled by UVs. Use for /copymau-hoidz, "copy màu hoidz", or copying wheel, rim, hub, and other component colors while preserving geometry.
author: hoidz
---

# Copy màu hoidz trong Blender

Nhận model nguồn, model đích và bộ phận cần copy từ lời người dùng hoặc ảnh đánh dấu. Ví dụ: `/copymau-hoidz từ cannon_t204 sang cannon_t401.002, bánh xe và đai kim loại`. Suy ra phạm vi từ ảnh; chỉ hỏi khi còn mơ hồ.

## Kết nối và giảm số lượt gọi

Ưu tiên Blender MCP hiện có. Gộp kiểm tra file, scene, PID, hai object, material và các component vào một lượt bằng `inspect_models(source, target)`. Không đọc toàn bộ danh sách object, source addon hoặc cấu hình MCP lại mỗi lần nếu kết nối đã được xác nhận trong phiên. Luôn xác nhận đang làm trong đúng file; không suy ra kết nối từ tiêu đề cửa sổ.

Nếu thiếu công cụ MCP, dùng [scripts/blender_request.ps1](scripts/blender_request.ps1) sau khi xác nhận addon cài trên máy hỗ trợ JSON kết thúc bằng byte null (`type=execute`, `strict_json=true`). Script nhận `-CodePath`, `-Port` (mặc định 9876) và `-TimeoutMs` (mặc định 20000). Python đặt kết quả nhỏ vào `result`.

**Mặc định script gửi đường dẫn file code đã có trên cùng máy**, Blender tự đọc file. Giữ file ở nguyên đường dẫn đến khi nhận xong phản hồi. Cách này tránh gửi lại mã dài hoặc UV qua socket. Chỉ dùng `-Inline` nếu Blender không đọc được file; chế độ này giới hạn 64 KiB. Không nhúng bản backup UV vào code gửi đi. Không tự đổi sang Inline rồi chạy lại một lệnh sửa scene có kết quả chưa rõ.

Nếu nhiều Blender dùng chung cổng, xác định PID/file trước khi chuyển cổng; không đóng Blender, ngắt phiên khác hoặc đổi cấu hình toàn cục theo phỏng đoán. Nếu cần UI, đọc kỹ năng computer-use trước.

## Nạp helper một lần

[scripts/transfer_uv.py](scripts/transfer_uv.py) định nghĩa các hàm và giữ mapping, plan, backup trong tiến trình Blender. Dùng importlib để nạp thành module, rồi tái sử dụng module ở các lượt sau. Ví dụ dưới đây dùng thư mục skill mặc định của tài khoản hiện tại. Nếu cài ở CODEX_HOME tùy chỉnh hoặc nơi khác, lấy đường dẫn thư mục chứa SKILL.md đang được nạp và trỏ tới scripts/transfer_uv.py trong thư mục đó; không dùng đường dẫn của máy cũ:

```python
import importlib.util, os, sys
path = os.path.join(os.path.expanduser('~'), '.codex', 'skills', 'copymau-hoidz', 'scripts', 'transfer_uv.py')
stamp = os.stat(path).st_mtime_ns
color = sys.modules.get('copymau_hoidz_uv_v2')
if color is None or getattr(color, '_loaded_stamp', None) != stamp:
    spec = importlib.util.spec_from_file_location('copymau_hoidz_uv_v2', path)
    color = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(color)
    color._loaded_stamp = stamp
    sys.modules['copymau_hoidz_uv_v2'] = color
```

## Quy trình nhanh

1. Nạp module và gọi `inspect_models` trong cùng lượt. Dữ liệu nhỏ gồm file, scene, PID, Object Mode, material/shader và bounding box component.
2. Ghép bộ phận theo vai trò và vị trí. Gọi `prepare_transfer` để tạo plan + backup trong Blender và nhận **token**, không xuất UV. Nếu phạm vi và phép ghép đã rõ từ dữ liệu vừa kiểm tra, gộp lập plan với các kiểm tra còn lại trong cùng lượt.
3. Gọi `commit_transfer(token)`: áp dụng, kiểm tra và trả kết quả ngắn. Không cần hỏi xác nhận lại thao tác copy màu mà người dùng đã yêu cầu.

```python
# Lượt kiểm tra
result = color.inspect_models('MODEL_NGUON', 'MODEL_DICH')
# Lượt chuẩn bị, sau khi đã chọn đúng component
result = color.prepare_transfer('MODEL_NGUON', 'MODEL_DICH', [(source_id, target_id)])
# Lượt áp dụng: giữ nguyên token nhận được
result = color.commit_transfer('TOKEN')
```

`plan_transfer` ghép đỉnh bằng KD-tree và xác minh topology mặt. Mapping được cache theo **object/mesh, hình học, cạnh/mặt/loop, hướng rotation/scale, UV layer, material slots và cặp component**. Cache hit chỉ tái sử dụng phép ghép; màu/UV nguồn luôn được đọc mới. Mesh hoặc các dữ liệu này đổi thì tính lại. Không lấy ID component của model khác hoặc một lần trước theo phỏng đoán. Cache hiện tại không chứa nhãn ngữ nghĩa của bộ phận; vẫn phải chọn đúng phạm vi.

## Giữ đúng màu và phạm vi

- Chung palette material: copy UV đúng mặt; chỉ link material sẽ không đổi màu. Khác palette/material hoặc dùng vertex color: chọn phương pháp phù hợp, không ép dùng UV helper.
- Không thay mesh, transform, modifier hoặc màu ngoài phạm vi. Mesh đích phải có một user; không tự sửa các object dùng chung mesh.
- Helper yêu cầu cùng topology và hướng tương ứng. Có thể truyền `source_basis`/`target_basis` 3×3 khi cần. Không tăng tolerance để che phép ghép sai. Bộ phận khác hình học cần đối chiếu riêng và xác minh từng mặt.
- Đai kim loại có thể nằm cùng component với gỗ: chỉ lọc những mặt/loop thực sự là kim loại. Dùng `plan_transfer`, lọc `plan['changes']` trong Blender rồi `retain_plan(plan)` để lấy token. Không copy toàn bộ component nếu làm đổi gỗ. Không hardcode tọa độ palette vàng/tím của một model cho model khác.

## Backup, lỗi và kiểm tra

UV được lưu dạng buffer trong Blender; commit so sánh toàn bộ UV đích với kết quả kỳ vọng nên cũng kiểm tra phần ngoài phạm vi giữ nguyên. Helper kiểm tra UV nguồn, hình học đích, dữ liệu chưa đổi từ lúc lập plan, và tạo Undo. Lỗi áp dụng được rollback.

Backup nằm trong RAM, **không tồn tại qua việc đóng Blender**; không thay thế lưu file. Nếu cần backup bền vững, xuất ra file workspace một lần bằng `snapshot_uv`, không đưa mảng UV trở lại request. Giữ tối đa 16 operation; chỉ `release_transfer(token)` khi chắc không cần plan/backup đó nữa, không tự xóa backup cũ để chạy tiếp.

- Timeout hoặc mất phản hồi: **không chạy lại mutation ngay**. Gọi `transfer_status(token)`; kết quả cho biết trạng thái và `target_still_matches`. `commit_transfer` với token đã áp dụng chỉ đọc lại trạng thái, không sửa lần hai.
- Khi người dùng yêu cầu hoàn tác, dùng Undo hoặc `restore_transfer(token)`. Restore từ chối ghi đè nếu model đã có chỉnh sửa tiếp sau.
- Kết quả có `cache_hit`, `plan_ms`, `apply_ms` để đánh giá thời gian thực tế. Không hứa một số giây cố định.

Báo ngắn gọn nguồn → đích và bộ phận đã đổi. Phân biệt áp dụng trong scene với lưu `.blend`; chỉ lưu file khi người dùng yêu cầu. Không tự lưu đè các chỉnh sửa khác.
