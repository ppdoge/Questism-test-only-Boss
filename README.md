# Questism — Hành Trình Thống Nhất Gangbuk

Phiên bản: local workspace

Mô tả ngắn
-----------------
`Questism` là một trò chơi web đơn trang (vanilla HTML/CSS/JS) mô phỏng hành trình chiến đấu và tiến hóa nhân vật (MC) qua chuỗi nhiệm vụ (quests). Người chơi hoàn thành nhiệm vụ để nhận điểm, thẻ (cards), thành viên `crew`, và phần thưởng khác; các chỉ số chính gồm `strength`, `speed`, `durability`, `potential`, `intelligence` được quản lý theo hệ bậc (`STAT_TIERS`). Hệ thống còn có cơ chế `Breakthrough` (đột phá) và một cửa hàng (shop) mở ra bằng thẻ đặc biệt `Card Buffet`.

Chạy game
-----------------
- Mở file `index.html` trong trình duyệt (như Edge/Chrome). Không cần cài đặt server.
- Các tệp chính: `index.html`, `style.css`, `game.js`.

Luồng chính & tính năng
-----------------
- Quest system: danh sách nhiệm vụ, một số nhiệm vụ có boss/minions, phần thưởng được xử lý qua `processReward(reward, questId)`.
- Battle engine: bắt đầu bằng `startBattle()` / `startMinionBattle()`; trạng thái trận đấu lưu trong `battleState`.
- Cards / Inventory: thẻ chia thành `stat`, `skill`, `support`, `cultivation`, `special`; thẻ `stat` và `cultivation` tăng đơn vị (units) cho chỉ số.
- Stat progression: chỉ số chính dùng chỉ số bậc (`STAT_TIERS`), với cơ chế "card-units" để tăng bậc sau SSS (index 8). Hàm chính áp dụng units: `applyStatUnitsToCharacter` và `applyStat`.
- Stat caps: giới hạn tăng chỉ số tuỳ theo tiến trình (hàm `STAT_CONFIG.getStatCap(context)` trả về chỉ số tối đa hiện thời). Ghi chú: đã thêm logging debug để theo dõi các lần gọi `getStatCap` (xem console `[STAT_CAP] ...`).
- Breakthroughs: các mốc quest kích hoạt `Awakened`, `Ascendant`, `Transcendent` và gọi `applyBreakthroughGain(level, ...)` để áp dụng units cộng thêm.
- Shop: UI shop được thêm vào `index.html` (`#shopPanel`) và logic trong `game.js` (`SHOP_INVENTORY`, `toggleShop()`, `updateShop()`, `buyCard()`), có thể mở bằng thẻ `card_buffet`.
- Deduplication: có hàm `removeDuplicateQuests()` chạy lúc khởi tạo để loại bỏ quest trùng lặp.

Các tệp chính (tóm tắt)
-----------------
- `index.html`: giao diện, layout chính, modal, battle screen, shop panel.
- `style.css`: toàn bộ CSS (layout, battle, panels, shop, selects).
- `game.js`: logic game — quests, battle, inventory, rewards, stat progression, breakthroughs, shop, và ghi log debug mới cho stat caps.
- Các file markdown trong workspace: tài liệu thiết kế và hướng dẫn (ví dụ: `BATTLE_SYSTEM.md`, `README.md` cũ, `TASK_8_COMPLETION.md`, ...).

Kỹ thuật & debugging
-----------------
- Mở Developer Console (F12) để xem log runtime. Để theo dõi việc tính cap, tìm các dòng bắt đầu bằng `[STAT_CAP]` (log được thêm vào `STAT_CONFIG.getStatCap`).
- Nếu nghi ngờ bypass cap (ví dụ MC đạt `EX` ngoài dự kiến), hãy tái hiện hành động (hoàn thành quest hoặc đột phá) và gửi các dòng console `[STAT_CAP]` để trace.

Hành vi quan trọng của code
-----------------
- Reward application: `processReward(reward, questId)` tính `statCap` bằng `STAT_CONFIG.getStatCap({ questId, target:'player' })` rồi áp dụng `Math.min(..., statCap)` cho phần lớn hiệu ứng tăng chỉ số.
- Breakthrough: `applyBreakthroughGain(breakthroughLevel, ...)` gọi `applyStatUnitsToCharacter` cho 3 chỉ số chính; đảm bảo các code path này tôn trọng `getStatCap` (đã kiểm tra trong code hiện tại).
- Stat unit accumulation: ở trên SSS, mỗi unit có thể tích lũy trong `gameState.character.statProgress` cho tới khi đủ số unit yêu cầu để tăng một bậc.

Kiểm thử nhanh (how-to)
-----------------
1. Mở `index.html` trong trình duyệt.
2. Mở Console (DevTools) để xem log.
3. Hoàn thành nhiệm vụ có reward tăng stat; quan sát console `[STAT_CAP]` để xem cap được áp dụng như thế nào.
4. Kích hoạt mốc Breakthrough (ví dụ quest 180, 351, 498) và kiểm tra log, đồng thời quan sát thay đổi chỉ số trong UI.

Gợi ý cho người phát triển
-----------------
- Nếu muốn lockdown mọi đường thay đổi chỉ số vào một điểm (đề phòng bypass), cân nhắc thêm một helper `setCharacterStat(statName, newIndex, context)` dùng `getStatCap` trước khi ghi giá trị thực tế.
- Để theo dõi chi tiết hơn, có thể thêm log trước/sau trong `processReward` và `applyStatUnitsToCharacter` (nếu cần, tôi có thể thêm tạm thời).

Vấn đề hiện tại & theo dõi
-----------------
- Tình trạng báo cáo gần đây: MC đạt `EX` mặc dù kỳ vọng cap chặn ở mức thấp hơn. Đã thêm logging vào `getStatCap` để thu thập thông tin gọi hàm và quyết định cap.

Muốn tôi làm gì tiếp theo?
-----------------
- Tôi có thể:
    - Thêm logging tạm thời vào `processReward` và `applyStatUnitsToCharacter` để in giá trị trước/sau thay đổi chỉ số.
    - Thực hiện một pass để đảm bảo mọi nơi ghi `gameState.character.<stat>` đều qua một hàm setter trung tâm.
    - Viết file test nhỏ hoặc script mô phỏng chuỗi reward để repro nhanh lỗi cap.

---
Tệp đã cập nhật: `README.md` (bản này). Nếu bạn muốn, tôi có thể dịch sang tiếng Anh hoặc mở rộng phần dev-guide với ví dụ console và hướng dẫn sửa lỗi chi tiết.


# ⚔️ QUESTISM GAME - HƯỚNG DẪN HOÀN CHỈNH

## 🎯 Tóm Tắt Những Gì Đã Fix

Trước đó, game.js chỉ có **3 hàm** chính:
- `initGame()`
- `showIntro()`
- `initializeQuests()` (500 quests)

**Các vấn đề:**
1. ❌ Hàm `updateUI()` được gọi nhưng không tồn tại
2. ❌ Không có hàm để hiển thị quests
3. ❌ Không có hàm để xử lý hoàn thành quest
4. ❌ Không có hàm lọc/tìm kiếm quest
5. ❌ CSS thiếu nhiều class styling

## ✅ Những Gì Đã Thêm

### **A. JavaScript Functions (game.js)**

#### 1. UI Update Functions
```javascript
updateUI()                  // Cập nhật toàn bộ giao diện
updateCharacterPanel()      // Hiển thị nhân vật + stats
updateQuestList()          // Hiển thị danh sách quest
updateProgress()           // Cập nhật thanh tiến độ
updateInventory()          // Hiển thị kho đồ
updateCrew()              // Hiển thị đội hình
updateQuestTracker()      // Hiển thị quest tiếp theo
```

#### 2. Quest Management Functions
```javascript
filterQuests(filterType)    // Lọc quest (all/main/side)
completeQuest(questId)     // Hoàn thành quest
processReward(reward)      // Xử lý phần thưởng
checkForBreakthrough()     // Kiểm tra đột phá tầng độ
```

#### 3. UI Interaction Functions
```javascript
filterInventory()          // Lọc kho đồ
showRewardNotification()   // Hiển thị phần thưởng
showBreakthroughOverlay()  // Hiển thị animation đột phá
closeModal()              // Đóng modal
closeBattle()             // Đóng màn hình chiến đấu
```

### **B. CSS Classes (style.css)**

#### 1. Button Styles
```css
.btn-success     /* Nút hoạt động */
.btn-disabled    /* Nút vô hiệu hóa (quest đã làm) */
.btn-locked      /* Nút bị khóa (chưa đủ điều kiện) */
.btn-danger      /* Nút đóng/hủy */
```

#### 2. Quest Styling
```css
.quest-header      /* Header của quest (ID, name, type) */
.quest-description /* Mô tả quest */
.quest-info       /* Thông tin quest (arc, điểm, boss) */
.quest-type.main  /* Style cho quest chính */
.quest-type.side  /* Style cho quest phụ */
```

#### 3. Inventory Styling
```css
.card-item                    /* Card chung */
.card-item.rarity-bronze     /* Thẻ đồng */
.card-item.rarity-silver     /* Thẻ bạc */
.card-item.rarity-gold       /* Thẻ vàng */
.card-item.rarity-platinum   /* Thẻ bạch kim */
.card-item.rarity-diamond    /* Thẻ kim cương */
.card-item.rarity-master     /* Thẻ master */
.card-item.rarity-challenger /* Thẻ challenger */
```

#### 4. Crew & Tracker Styling
```css
.crew-member    /* Thành viên crew */
.crew-grid      /* Grid crew */
.tracker-item   /* Item trong quest tracker */
```

#### 5. Modal & Breakthrough
```css
.modal           /* Modal popup */
.modal.active    /* Modal đang hiển thị */
.breakthrough-overlay /* Overlay đột phá */
```

### **C. Giai Đoạn 4 - 20 Quests Mới**

**Quest 481-500** Trận Chiến Siêu Việt Cuối Cùng:
- 481: Phản công
- 482-485: Đối đầu No.3 Ma Jeongdu
- 486-490: Đối đầu Choyun
- 491: Daniel vs Choyun
- 492: Daniel thức tỉnh Ascendant
- 493: Đuổi theo Choyun
- 494: Hajun vs Daniel (Hajun thức tỉnh Transcendent)
- 495: Đội quân Choyun (MC stats lên EX)
- 496-497: Đụng độ Choyun
- 498: Sức mạnh No.1 Choyun (MC thức tỉnh Transcendent)
- 499: Trận chiến cuối cùng (MC dùng thẻ Đánh đổi)
- 500: CHỐT HẠ - THỐNG NHẤT GANGBUK 👑 (Boss cuối DX stats)

## 🚀 Cách Sử Dụng

### 1. **Mở Game**
```
1. Tìm file index.html
2. Nhấp chuột phải → Open with → Browser (hoặc kéo vào browser)
3. Hoặc: Gõ Ctrl+O → chọn index.html
```

### 2. **Giao Diện Game**

```
┌─────────────────────────────────────────────────────┐
│            ⚔️ QUESTISM ⚔️                           │
│        Hành Trình Thống Nhất Gangbuk              │
├─────────────────────────────────────────────────────┤
│ Arc 1/3 | Quests: 0/500 | Points: 0                │
│ [████░░░░░░░░░░░░░░] 0%                            │
├─────────────────────────────────────────────────────┤
│ QUEST TRACKER: 5 Quest tiếp theo khả dụng         │
├──────────────────┬──────────────────┬──────────────┤
│  👤 NHÂN VẬT    │  📜 DANH SÁCH    │  🎴 KHO ĐỒ  │
│                 │   NHIỆM VỤ        │              │
│ MC (Bạn)        │                   │              │
│ Level: None     │ [Tất cả] [Chính] │ 0 Cards      │
│                 │          [Phụ]   │              │
│ Stats:          │                   │              │
│ 💪 F | ⚡ F    │ Quest List        │ Inventory    │
│ 🛡️ F | 🔮 F    │ (Quests here)     │ (Cards here) │
│ 🧠 F            │                   │              │
│                 │                   │              │
│ Crew (0)        │                   │              │
│ (Empty)         │                   │              │
└──────────────────┴──────────────────┴──────────────┘
```

### 3. **Làm Nhiệm Vụ**

**Bước 1:** Xem Quest List
```
- Chọn filter: Tất cả / Chính / Phụ
- Xem Quest được highlight (chưa làm vs đã làm)
```

**Bước 2:** Kiểm Tra Điều Kiện
```
- 🟢 Nút xanh "▶️ Làm nhiệm vụ" = Có thể làm ngay
- 🔒 Nút đỏ "🔒 Chưa mở" = Cần hoàn thành quest trước
- ⚫ Nút xám "✅ Hoàn thành" = Đã làm xong
```

**Bước 3:** Nhấn Nút & Nhận Thưởng
```
- Nhấn "▶️ Làm nhiệm vụ"
- Thấy thông báo phần thưởng
- Quests xếp hạng trong danh sách
- Stats tăng lên
- Thẻ được thêm vào Kho Đồ
```

### 4. **Theo Dõi Tiến Độ**

- **Thanh Tiến Độ:** Hiển thị % hoàn thành (0-500 quests)
- **Character Panel:** Xem stats hiện tại
- **Quest Tracker:** Xem 5 quest tiếp theo có thể làm
- **Crew:** Xem các thành viên đã tuyển dụng
- **Inventory:** Xem tất cả thẻ / phần thưởng nhận được

## 📊 Hệ Thống Game

### Stat Tiers (19 Level)
```
F (mặc định)
↓
E, D, C, B, A
↓
S, SS, SSS
↓
SR, SSR
↓
UR, LR, MR
↓
X, XX, XXX
↓
EX, DX (cực đại)
```

### Breakthrough Stages (4 tầng)
```
None (mặc định)
↓
Awakened ⚡ (Quest 180)
↓
Ascendant ✨ (Quest 351)
↓
Transcendent 🌟 (Quest 498)
```

### Card Types (5 loại)
1. **Stat Cards** (Thẻ Chỉ số): Tăng chỉ số
2. **Skill Cards** (Thẻ Kỹ năng): Thêm kỹ năng
3. **Support Cards** (Thẻ Hỗ trợ): Hỗ trợ trong chiến đấu
4. **Cultivation Cards** (Thẻ Bồi dưỡng): Nâng crew
5. **Special Cards** (Thẻ Đặc biệt): Hiệu ứng đặc biệt

### Card Rarities (7 mức)
```
Bronze (đồng) → Silver (bạc) → Gold (vàng)
                ↓
            Platinum (bạch kim) → Diamond (kim cương)
                ↓
            Master (chủ nhân) → Challenger (chiến thủ)
```

## 🎮 Chế Độ Chơi

### 3 Arc (500 Quests)
- **Arc 1** (Quests 1-100): Chinh phục Phía Tây
- **Arc 2** (Quests 101-200): Thống nhất Đông & Nam  
- **Arc 3** (Quests 201-500): Lật đổ Đế chế Phía Bắc

### Arc 3 Có 4 Giai Đoạn
1. **Giai đoạn 1** (201-300): Quét sạch ngoại vi - 100 quests
2. **Giai đoạn 2** (301-400): Vùng trung tâm & Ngũ hổ tướng - 100 quests
3. **Giai đoạn 3** (401-480): Giới tinh hoa Top 10 - 80 quests
4. **Giai đoạn 4** (481-500): Trận chiến siêu việt cuối cùng - 20 quests

## 🐛 Troubleshooting

### ❌ "Nhiệm vụ không hiện ra"
```
Cách fix:
1. Bật DevTools (F12)
2. Xem Console tab
3. Kiểm tra có lỗi red text không
4. Refresh page (Ctrl+F5)
```

### ❌ "Không thể làm nhiệm vụ"
```
Có thể nguyên nhân:
1. Chưa hoàn thành quest tiên quyết
2. Nút bị khóa = không đủ điều kiện
3. Kiểm tra thứ tự: Quest phải làm theo thứ tự trước sau
```

### ❌ "Stats không tăng"
```
Cách fix:
1. Kiểm tra quest có phần thưởng stats không
2. Xem "Chi tiết phần thưởng" ở hộp thoại
3. Refresh page nếu display bị sai
```

### ❌ "Phần thưởng không hiện"
```
1. Nhấn "Làm nhiệm vụ" và xem hộp thoại alert
2. Kiểm tra Kho Đồ (Inventory)
3. Lọc filter thẻ để tìm các thẻ mới
```

## 📝 Ghi Chú

- **Game State:** Được lưu trong biến `gameState` toàn cục
- **Tự động Lưu:** Mỗi lần hoàn thành quest đều update UI
- **Không có Database:** Dữ liệu chỉ lưu trong RAM (reset khi reload)
- **Responsive:** Giao diện tự điều chỉnh theo màn hình

## 🎁 Tính Năng

✅ 500 Quests (Dài 20+ giờ chơi)  
✅ 4 Tầng Breakthrough  
✅ Hệ Thống Stat 19 Cấp Độ  
✅ Crew Members & Rewards  
✅ Inventory & Card Management  
✅ Quest Tracker & Progress Bar  
✅ Filter & Search Quests  
✅ Responsive Design  

## 📧 Support

Nếu gặp vấn đề:
1. Kiểm tra tệp `FIXES_SUMMARY.md`
2. Xem Console (F12) để tìm lỗi
3. Đảm bảo tất cả 4 file đang ở cùng thư mục:
   - `index.html`
   - `game.js` 
   - `style.css`
   - (Optional) `TEST.html`

---

**Phiên bản:** 1.0 Complete  
**Ngày cập nhật:** 27 Tháng 1, 2026  
**Trạng thái:** ✅ Sẵn Sàng Chơi
