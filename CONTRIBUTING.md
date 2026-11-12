# Đóng góp skill

Ai cũng đóng góp được, cần một tài khoản GitHub. Mọi đóng góp đi qua **Pull Request** và được chủ repo duyệt trước khi gộp.

## Cách nhanh nhất (trên trang web)

Mở https://minhdv-zz.github.io/team-skills/ → tab **Đóng góp** → nhập tên skill → bấm **Tạo SKILL.md trên GitHub**.

Nếu bạn chưa có quyền ghi vào repo, GitHub sẽ hỏi tạo bản sao (fork). Bấm đồng ý, chỉnh nội dung, rồi bấm **Propose new file** và **Create pull request**.

## Cấu trúc một skill

```
plugins/<ten-skill>/skills/<ten-skill>/SKILL.md
```

`SKILL.md` phải bắt đầu bằng phần tiêu đề:

```
---
name: ten-skill
description: Skill làm gì và khi nào dùng
author: Tên của bạn
---

# Nội dung hướng dẫn cho Claude
```

- `name` phải **trùng tên thư mục**.
- `author` là **bắt buộc**: ghi tên bạn để mọi người biết skill của ai. Tên này hiện trên thẻ skill ở trang web.
- Tên thư mục: 2-64 ký tự gồm chữ, số, `-` hoặc `_`.
- Có thể thêm script hoặc tài liệu trong cùng thư mục `skills/<ten-skill>/`.
- Bạn **không cần** tạo `plugin.json`, `marketplace.json` hay sửa `docs/skills.json`. Bot tự tạo sau khi gộp. Muốn tiêu đề tiếng Việt đẹp hơn, hãy chỉnh `docs/skills.json` trong cùng Pull Request.

## Kiểm tra tự động

Mỗi Pull Request chạy `scripts/validate.py`:

- có `SKILL.md` với `name`, `description` và `author`, `name` trùng tên thư mục;
- không có file chạy hoặc cài đặt (`.exe`, `.dll`, `.bat`...), không file quá 5 MB;
- không có khóa, token, mật khẩu;
- các file `.json` hợp lệ.

Đường dẫn riêng như `C:\Users\ten\...` chỉ bị cảnh báo.

Kiểm tra trên máy trước khi gửi: `python scripts/validate.py`.

## Sau khi gộp

Một bot (`scripts/sync.py`, chạy qua GitHub Action) tự tạo `plugin.json`, cập nhật `marketplace.json` và `docs/skills.json`, rồi trang web hiện skill mới. Việc này mất vài phút.

## Addon Blender

Gửi vào repo https://github.com/minhdv-zz/team-blender-addons (xem `CONTRIBUTING.md` ở đó). Danh sách addon trên trang web tự lấy từ repo đó. Chỉ nhận addon **miễn phí và được phép chia sẻ lại**.

## Lưu ý an toàn

Skill và addon là mã/hướng dẫn chạy trên máy người cài (qua Claude, Blender, plugin Paseo). Chủ repo sẽ đọc kỹ trước khi gộp. Không gộp nội dung chưa hiểu rõ.
