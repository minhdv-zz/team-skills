---
name: team-skills-contribute
description: Dùng khi người dùng muốn đóng góp, chia sẻ, đăng hoặc gửi một skill Claude hoặc một addon Blender lên Team Skills (kho chung của team). Kiểm tra nội dung, đăng nhập GitHub và tự tạo Pull Request qua plugin Paseo team-skills.
author: hoidz
---

# Đóng góp skill hoặc addon lên Team Skills

Mọi việc làm qua plugin Paseo `team-skills` đang chạy trên máy này, nghe ở `http://127.0.0.1:47653`. Plugin kiểm tra nội dung, đăng nhập GitHub của người dùng (mở trang đăng nhập, người dùng nhập mã) và tự mở Pull Request. Chủ repo duyệt, không có gì tự gộp.

Mọi lệnh `curl` dưới đây **bắt buộc** có header `X-Team-Skills: 1`.

## Quy tắc

- **Không gửi khi người dùng chưa đồng ý rõ ràng.** Nội dung sẽ được công khai trong kho chung của team.
- Với addon: phải hỏi thêm addon có **miễn phí và giấy phép cho phép chia sẻ lại** không. Addon trả phí thì không gửi.
- Không sửa file gốc của người dùng khi chưa hỏi. Muốn dọn nội dung (xem bước 3), hãy làm trên **bản sao** trong thư mục tạm.
- Không tự đăng nhập hay xin token. Việc đăng nhập do người dùng làm trên trang GitHub được mở ra.
- Nói chuyện với người dùng bằng tiếng Việt, ngắn gọn.

## Bước 0: kiểm tra plugin đang chạy

```
curl -s -H "X-Team-Skills: 1" http://127.0.0.1:47653/agent/list
```

Lỗi kết nối, 403 hoặc 404 (Not found) thì plugin chưa chạy hoặc là bản cũ: báo người dùng mở Paseo, chạy `paseo plugin update team-skills` rồi thử lại. Lệnh này cũng liệt kê skill trong `~/.claude/skills` và addon Blender trên máy.

## Bước 1: xác định thư mục cần gửi

- Skill nằm trong `~/.claude/skills` hoặc `~/.claude-api/skills`: chỉ cần `name`.
- Skill nằm trong `.claude/skills` của một **dự án**: dùng `path`, là đường dẫn tuyệt đối của thư mục skill (có `SKILL.md`). Dùng dấu `/` thay cho `\` (ví dụ `E:/Du_an/.claude/skills/ten_skill`).
- Addon Blender: `name` là tên thư mục addon (có `__init__.py` hoặc `blender_manifest.toml`), hoặc `path`.

## Bước 2: kiểm tra thử (không gửi gì)

Ghi nội dung JSON ra một file tạm rồi gửi bằng `--data-binary @file` để khỏi lỗi dấu ngoặc và dấu `\`:

```
curl -s -X POST -H "X-Team-Skills: 1" -H "Content-Type: application/json" --data-binary @body.json http://127.0.0.1:47653/agent/contribute
```

với `body.json`:

```
{"kind":"skill","path":"E:/Du_an/.claude/skills/ten_skill","dry_run":true}
```

(`kind` là `skill` hoặc `addon`. Dùng `name` thay `path` khi skill ở thư mục chung.) Kết quả là văn bản tiếng Việt gồm **LỖI** (bắt buộc sửa) và **CẢNH BÁO** (nên dọn).

## Bước 3: sửa lỗi và dọn nội dung (hỏi người dùng trước)

- Thiếu `author:` ở đầu `SKILL.md`: hỏi tên người dùng muốn hiển thị rồi thêm. `name` trong tiêu đề phải trùng tên thư mục.
- Chứa khóa, token, mật khẩu hoặc file `.exe`/`.dll`: bỏ ra.
- **Đường dẫn riêng của máy** (ví dụ `D:/Project/...`, `C:/Users/ten/...`): đề nghị thay bằng đường dẫn chung hoặc để skill hỏi người dùng khi chạy.
- Phần đã ghi là lịch sử hoặc không còn dùng: đề nghị bỏ cho gọn.

Cách an toàn: sao chép thư mục skill sang thư mục tạm, sửa trên bản sao, rồi gửi `path` của bản sao (giữ **nguyên tên thư mục**). Sau mỗi lần sửa, chạy lại bước 2 đến khi hết lỗi.

## Bước 4: xin xác nhận

Hỏi người dùng: có đồng ý công khai nội dung này không (và với addon: miễn phí, được phép chia sẻ lại). Chỉ khi họ đồng ý rõ ràng mới sang bước 5.

## Bước 5: gửi

Giống bước 2 nhưng bỏ `dry_run` và thêm `"share_confirmed":true`:

```
{"kind":"skill","path":"E:/Du_an/.claude/skills/ten_skill","share_confirmed":true}
```

- Nếu chưa đăng nhập GitHub, kết quả chứa **mã đăng nhập** và trình duyệt tự mở `github.com/login/device`. Nói người dùng nhập mã đó rồi bấm **Authorize**, sau đó **chạy lại đúng lệnh này** (lệnh chờ tối đa khoảng 90 giây mỗi lần).
- Tên đã có trong kho chung: báo người dùng, hỏi có muốn gửi bản cập nhật không, nếu có thì thêm `"replace_existing":true`.
- Thành công: kết quả có link **Pull Request**. Gửi link cho người dùng và nói chủ repo sẽ duyệt.

## Bước 6 (tùy chọn): đăng xuất

```
curl -s -X POST -H "X-Team-Skills: 1" http://127.0.0.1:47653/agent/logout
```

Token chỉ nằm trong bộ nhớ plugin và hết hạn sau khoảng 8 giờ.
