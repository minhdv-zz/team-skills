# team-skills

Skill dùng chung của team (pipeline Blender → Unity cho pirate-wars).

## Danh sách skill

| Skill | Việc |
|---|---|
| `copymau-hoidz` | Copy màu giữa các model Blender (palette/UV) |
| `copysize_hoidz` | Chỉnh khung ô súng osungXXX cho vừa cannon_tXXX_g |
| `export_hoidz` | Xuất mesh Blender sang Unity (FBX, add-on ACT) |
| `fixship_hoidz` | Quy trình trọn gói ship skin mới |
| `fixsung_hoidz` | Quy trình trọn gói súng skin mới |
| `setcannon_hoidz` | Setup cannon prefab trong Unity |
| `setship_hoidz` | Setup CannonSlot cho ship `_new` |
| `tb-hoidz`, `thoidz` | Texture model bằng palette-strip gradient UV |

## Cài đặt

### Cách 1: plugin của Claude Code (khuyên dùng), mỗi skill một plugin
Thêm kho một lần:
```
/plugin marketplace add minhdv-zz/team-skills
```
Rồi chỉ cài skill cần dùng (tên plugin viết gạch ngang):
```
/plugin install fixship-hoidz@team-skills-marketplace
/plugin install setship-hoidz@team-skills-marketplace
```
Các plugin: `copymau-hoidz`, `copysize-hoidz`, `export-hoidz`, `fixship-hoidz`, `fixsung-hoidz`, `setcannon-hoidz`, `setship-hoidz`, `tb-hoidz`, `thoidz`.
Lưu ý: `fixship-hoidz` và `fixsung-hoidz` có bước xuất FBX, nên cài kèm `export-hoidz`.
Cập nhật khi có bản mới: `/plugin` → update.
(Repo private thì máy phải đăng nhập Git có quyền đọc repo.)

### Cách 2: một dòng PowerShell (nhanh nhất, không cần git)
Dán vào PowerShell, thay `copymau-hoidz` bằng tên skill cần cài:
```
& ([scriptblock]::Create((irm https://raw.githubusercontent.com/minhdv-zz/team-skills/main/install.ps1))) copymau-hoidz
```
- Cài nhiều skill: thêm tên phía sau (`... copymau-hoidz thoidz`).
- Cài tất cả: thêm `-All`. Xem danh sách: thêm `-List`.
- Skill được chép vào `%USERPROFILE%\.claude\skills`. Mở lại Claude Code để nhận skill mới.
- Cập nhật skill: chạy lại đúng dòng đó.

## Yêu cầu môi trường
- Skill Blender cần Blender MCP; skill Unity cần Unity MCP (`com.coplaydev.unity-mcp`).
- Một số skill ghi sẵn đường dẫn dự án `D:\Horus\pirate-wars\...`. Máy khác để project ở chỗ khác thì sửa đường dẫn tương ứng.

## Quy tắc đóng góp
- Mỗi skill một plugin: `plugins/<tên>/skills/<tên>/SKILL.md` + `plugins/<tên>/.claude-plugin/plugin.json`, và thêm vào `.claude-plugin/marketplace.json`. Giữ hậu tố tên người để khỏi trùng tên.
- Sửa trên nhánh riêng, mở Pull Request, có người xem rồi mới gộp vào `main`.
- Không đưa token/key, file nặng (FBX, ảnh lớn) vào repo.
