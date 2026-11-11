# 作文小助手（學測國寫）— 開發計畫

> 純前端 PWA：貼上作文 → Gemini 評分 → 等第、四面向分數、逐句批改、改寫示範 → 存本機歷史。

---

## 1. 專案目標

| 項目 | 內容 |
|---|---|
| 使用者 | 高中生（自己用為主，也可給同學用） |
| 核心流程 | 貼上純文字作文 → 選題型 → 按「開始評分」→ 30 秒內看到結果 |
| 評分標準 | 高中國寫（學測知性題／情意題）四大評分原則 |
| 模型 | 預設 `gemini-3.5-flash-lite`，設定頁可切換 |
| 技術限制 | 純前端、無後端、無框架、無建置步驟、可安裝成 PWA |
| 資料存放 | 作文與評分存 IndexedDB；API Key 與設定存 localStorage；不上傳到任何自有伺服器 |

### 非目標（先不做）
- 帳號登入、雲端同步
- 圖片／手寫 OCR
- 後端代理、多人共用
- 自動偵測抄襲

---

## 2. 功能範圍

### 2.1 MVP（第一版一定要有）

1. **輸入區**
   - `<textarea>` 貼上純文字，即時顯示字數（中文字元，不含空白與標點）與段落數
   - 題型選擇：知性題 / 情意題 / 自由練習
   - 可選填「題目」與「寫作說明（引文）」，讓 AI 對題更準
   - 長度限制：50–3000 字；不足 50 字提示、超過 3000 字警告並截斷

2. **Gemini 評分**
   - 一次呼叫回傳結構化 JSON（`responseSchema` 強制格式，避免解析失敗）
   - 內容：總分、等第、四面向分數與評語、整體回饋、優點、待改進、逐句錯字／標點、段落改寫示範、下一步練習建議

3. **結果頁**
   - 大字總分 `82 / 100` + 等第徽章（A+ / A / B+ / B / C）
   - 四面向長條圖（純 CSS，不引入圖表庫）
   - 分區塊卡片：總評 → 優點 → 待改進 → 錯字標點表 → 改寫示範 → 練習建議
   - 一鍵複製全部評語、下載 `.txt`

4. **歷史紀錄**
   - IndexedDB 儲存每次：時間、題型、題目、原文、評分 JSON
   - 列表可回顧、重新評分、刪除單筆、清空全部
   - 顯示總分趨勢（最近 10 次）

5. **設定頁**
   - API Key 輸入（password 欄位、可顯示/隱藏、存在 localStorage）
   - 模型選擇：預設 `gemini-3.5-flash-lite`，可「重新偵測可用模型」取得清單
   - 溫度（創造性）滑桿，預設 0.4
   - 清除所有本機資料

6. **PWA**
   - `manifest.webmanifest` + 192/512 icon + `display: standalone`
   - Service Worker：App Shell 快取優先；Gemini API 請求一律走網路、不快取
   - 離線時顯示「目前離線，仍可查看歷史紀錄」

### 2.2 第二版（有時間再做）
- 計時器（學測國寫 90 分鐘倒數，時間到提示）
- 兩篇作文比較（進步幅度）
- 常見錯誤統計（哪類錯字最常犯）
- 深色模式跟隨系統

> 註：計時器你勾了「字數統計與計時器」，我會放進 MVP，跟輸入區放一起（可折疊，預設收起）。

---

## 3. 技術選型

| 層 | 選擇 | 理由 |
|---|---|---|
| 語言 | HTML + CSS + 原生 JavaScript（ES Modules） | 不用學框架、不用 npm、改了直接重新整理 |
| 建置 | 無（no build） | 雙擊打不開 Service Worker，但用 Live Server 或 `python -m http.server` 即可 |
| 儲存 | localStorage（設定）＋ IndexedDB（歷史） | 作文可能很長，IndexedDB 沒有 5MB 限制問題 |
| API | Gemini REST `v1beta/models/{model}:generateContent` | 直接 `fetch`，不需 SDK |
| 圖表 | 純 CSS `width: %` 長條 | 少一個依賴 |
| 部署 | GitHub Pages / Netlify / Cloudflare Pages | 免費、HTTPS（PWA 必要） |

### 為什麼不用 React / Vue
這個專案畫面只有 4 個（輸入、結果、歷史、設定），原生 JS 約 600–800 行就能完成；不用建置也代表你隨時能改一行字就看到結果，對高中生維護最友善。

---

## 4. 檔案結構

```
67/
├─ index.html              # 四個畫面的容器（用 hidden 切換，不換頁）
├─ manifest.webmanifest
├─ sw.js                   # Service Worker（版本號手動遞增）
├─ css/
│  └─ style.css            # 設計變數、版面、卡片、長條圖、響應式
├─ js/
│  ├─ app.js               # 啟動、畫面切換、事件綁定
│  ├─ gemini.js            # API 呼叫、模型探測、錯誤轉中文訊息
│  ├─ prompt.js            # system prompt + responseSchema
│  ├─ storage.js           # settings(localStorage) / history(IndexedDB)
│  ├─ ui.js                # 結果渲染、歷史列表、Toast
│  ├─ text.js              # 字數計算、段落、計時器
│  └─ export.js            # 複製、下載 txt、組文字格式
├─ icons/
│  ├─ icon-192.png
│  ├─ icon-512.png
│  └─ maskable-512.png
└─ plan.md
```

---

## 5. 評分設計（重點）

### 5.1 四面向（各 25 分，總分 100）

| 面向 | 看什麼 | 學測對應 |
|---|---|---|
| 立意取材 | 是否扣題、材料是否具體、有無個人觀點 | 立意取材 |
| 結構組織 | 段落安排、開頭結尾、轉折與照應 | 結構組織 |
| 遣詞造句 | 用詞精準、句式變化、語病 | 遣詞造句 |
| 錯別字與標點 | 錯字、缺字、標點誤用、格式 | 錯別字與標點 |

### 5.2 等第換算（練習用，非官方分數）

| 總分 | 等第 |
|---|---|
| 90–100 | A+ |
| 80–89 | A |
| 70–79 | B+ |
| 60–69 | B |
| 0–59 | C |

### 5.3 AI 回傳格式（`responseSchema`）

```json
{
  "total": 82,
  "grade": "A",
  "dimensions": [
    { "key": "idea", "name": "立意取材", "score": 21, "comment": "…" }
  ],
  "summary": "兩到三句總評",
  "strengths": ["具體優點，引用原文片段"],
  "improvements": [
    { "issue": "問題", "suggestion": "怎麼改", "example": "示範句" }
  ],
  "corrections": [
    { "original": "原文片段", "corrected": "修正", "type": "錯字|標點|用詞|語法", "explanation": "說明" }
  ],
  "rewrite": {
    "originalParagraph": "最需要改寫的一段（原文）",
    "rewritten": "改寫版本",
    "rationale": "改了什麼、為什麼"
  },
  "nextSteps": ["下一次寫作可以練的三件事"]
}
```

### 5.4 System Prompt 要點

1. 角色：臺灣高中國文老師，熟悉大考中心國寫評分原則。
2. 先判斷題型（知性／情意），再針對該題型調整評語語氣與重點。
3. 嚴格遵守：**所有引用必須是原文真的有的句子**，不可編造；找不到錯字就回空陣列。
4. 分數要「嚴但不刻薄」：以同年級前三志願學生的水準為 80 分基準。
5. 建議必須可執行（給方法，不只說「要多練習」）。
6. 全部使用繁體中文、臺灣用語。
7. 只輸出 JSON，不要 markdown 圍籬。

---

## 6. API 串接細節

### 呼叫
```
POST https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent?key={API_KEY}
Content-Type: application/json

{
  "systemInstruction": { "parts": [{ "text": "<system prompt>" }] },
  "contents": [{ "role": "user", "parts": [{ "text": "<題型/題目/作文>" }] }],
  "generationConfig": {
    "temperature": 0.4,
    "responseMimeType": "application/json",
    "responseSchema": { ... }
  }
}
```

### 模型探測（解決「3.5 flash lite 不存在的話」）
```
GET https://generativelanguage.googleapis.com/v1beta/models?key={API_KEY}
```
- 篩選 `supportedGenerationMethods` 含 `generateContent`
- 設定頁下拉選單顯示，並標記 `lite` 系列
- 預設值仍是 `gemini-3.5-flash-lite`；發生 404 時：
  1. 顯示「此模型不存在或你的 Key 無權限」
  2. 自動列出可用模型，請使用者選一個
  3. 記住選擇，下次直接用

### 錯誤對照表

| 狀態 | 原因 | 顯示訊息 |
|---|---|---|
| 400 `API_KEY_INVALID` | Key 打錯 | 請到設定頁重新貼上 API Key |
| 403 | Key 沒開通／地區限制 | 請確認 Key 已啟用 Generative Language API |
| 404 | 模型不存在 | 此模型無法使用，請到設定頁換模型 |
| 429 | 額度用完 | 今日免費額度已滿，請稍後再試 |
| 5xx | Google 端問題 | 伺服器忙線，請 1 分鐘後重試 |
| `finishReason: SAFETY` | 內容被安全機制擋 | 這段內容無法評分，請調整用詞 |

### 時間與成本
- 2000 字作文 + 完整評分 ≈ 3000–5000 tokens 輸出，`flash-lite` 通常 5–15 秒
- 前端加「評分中」骨架動畫與 60 秒 timeout（`AbortController`）

---

## 7. 畫面與操作流程

```
[輸入頁]
  ├─ 設定齒輪 → [設定頁]（Key、模型、清除資料）
  ├─ 歷史按鈕 → [歷史頁] → 點一筆 → [結果頁]
  └─ 開始評分 → loading → [結果頁]
                              ├─ 複製評語
                              ├─ 下載 txt
                              ├─ 重新評分
                              └─ 回輸入頁
```

### 視覺方向
- 手機優先（單欄、按鈕大、拇指好按），桌機置中最大 820px
- 色系：米白底 `#FAF7F2`、墨綠主色 `#2F5D50`、 accent `#C9A227`
- 字體：`"Noto Serif TC", "PingFang TC", serif`（作文感）；UI 用小字 sans
- 等第徽章顏色：A+ 金、A 綠、B+ 藍、B 灰、C 橘
- 所有互動都有明確 loading / 成功 / 錯誤狀態，不用 alert

---

## 8. 隱私與安全

- API Key 只存在 `localStorage`，只會送到 `generativelanguage.googleapis.com`
- 不在 console 印出 Key，錯誤訊息遮蔽 Key
- 首次使用顯示一次性說明：
  > 「Key 存在這台裝置的瀏覽器裡。共用電腦請用完按『清除資料』。」
- 歷史紀錄預設只存本機；提供「不儲存歷史」開關
- 若未來公開網站：在 README 明確寫「請使用自己的 Key」，並在 Google Cloud 設定 API 限制

---

## 9. PWA 設定

```json
{
  "name": "作文小助手",
  "short_name": "作文助手",
  "start_url": "./index.html",
  "display": "standalone",
  "background_color": "#F7F3EC",
  "theme_color": "#2F5D50",
  "icons": [
    { "src": "icons/icon-192.png", "sizes": "192x192", "type": "image/png" },
    { "src": "icons/icon-512.png", "sizes": "512x512", "type": "image/png" },
    { "src": "icons/maskable-512.png", "sizes": "512x512", "type": "image/png", "purpose": "maskable" }
  ]
}
```

Service Worker 策略：
- `install`：快取 `index.html`、`style.css`、所有 `js/*.js`、icons
- `fetch`：同源 → cache-first 並背景更新；`generativelanguage.googleapis.com` → 直接放行（不攔截）
- 改版時把 `CACHE_VERSION` 加一，`activate` 清舊快取

---

## 10. 開發里程碑

| 階段 | 內容 | 完成標準 |
|---|---|---|
| M1 骨架 | index.html + CSS + 畫面切換 + 字數統計 | 可貼文、四個畫面能切 |
| M2 API | 設定頁存 Key、gemini.js、prompt.js、JSON 解析 | 真的拿到一份評分 JSON |
| M3 結果頁 | 分數、等第、長條圖、各卡片、複製/下載 | 結果完整好看、手機可讀 |
| M4 歷史 | IndexedDB 讀寫、列表、回顧、刪除 | 重開瀏覽器資料還在 |
| M5 PWA | manifest、SW、icon、離線頁 | Lighthouse PWA 可安裝、離線可開 |
| M6 打磨 | 錯誤處理、loading、RWD、無障礙、實測 3 篇作文 | 3 篇不同題型都給出合理評語 |

---

## 11. 驗收標準

- [ ] 貼上 800 字作文，60 秒內出現完整評分
- [ ] 分數與評語一致（不會 90 分卻說「結構鬆散」）
- [ ] 錯字表只引用原文存在的字句
- [ ] 重新整理後歷史紀錄仍在
- [ ] 手機可「加到主畫面」，開啟無網址列
- [ ] 飛航模式下可開啟 App 並看歷史
- [ ] 錯誤 Key / 不存在的模型都有清楚中文提示
- [ ] 無任何 console error

---

## 12. 風險與備案

| 風險 | 影響 | 備案 |
|---|---|---|
| `gemini-3.5-flash-lite` 型號不存在 | 無法評分 | 模型探測 + 下拉選單（已設計） |
| 免費額度低（RPM/RPD 限制） | 連續測試會 429 | 快取同一篇作文的評分、顯示剩餘等待時間 |
| AI 幻覺引用不存在的句子 | 批改不可信 | prompt 明令禁止 + 前端比對原文，對不到就標「參考」 |
| JSON 被截斷 | 解析失敗 | `maxOutputTokens` 拉高 + `responseSchema` + 失敗自動重試一次 |
| 純前端 Key 外洩 | 額度被盜 | 只存本機、不寫死、README 警告、建議設 API 限制 |

---

## 13. 已確認的設定（2026-11-04）

| 項目 | 決定 |
|---|---|
| 介面語言 | 繁體中文（臺灣用語） |
| 歷史紀錄 | 預設儲存，設定頁可關閉 |
| App 圖示 | 先用程式產生的佔位圖（之後可換） |
| 執行方式 | 本機可開 + GitHub Pages（含 Actions workflow） |
| API Key | 使用者自貼，存 localStorage |
| 模型 | 預設 `gemini-3.5-flash-lite`，設定頁可切換／偵測 |

---

## 14. 實作狀態（2026-11-04）

| 里程碑 | 狀態 | 說明 |
|---|---|---|
| M1 骨架 | ✅ | 四個畫面、字數／段落統計、草稿自動儲存 |
| M2 API | ✅ | 設定頁、Gemini 呼叫、JSON schema、模型偵測、中文錯誤訊息 |
| M3 結果頁 | ✅ | 總分、等第、四面向長條圖、總評、優缺點、錯字表、改寫、下一步 |
| M4 歷史 | ✅ | IndexedDB（含 localStorage 備援）、列表、趨勢圖、刪除／清空 |
| M5 PWA | ✅ | manifest、Service Worker、離線可開、可安裝 |
| M6 打磨 | 🔶 | 已做手機／桌面實測、404／429／逾時處理；尚未用真實 API Key 實測 |

補充：

- 入口檔案：`index.html`；操作說明：`README.md`
- 圖示為程式產生的佔位圖，可執行 `node tools/generate-icons.mjs` 重產
- 已用 Chrome 無頭瀏覽器驗證：輸入、設定、評分（模擬回應）、歷史、離線重新載入、404 錯誤導向設定頁
- 待你實測：貼一篇真的作文，確認 `gemini-3.5-flash-lite` 在你的 Key 下可用；若不行，用設定頁的「偵測可用模型」切換
- 已知限制：純前端無法隱藏 Key，請使用自己的 Key；AI 評分僅供練習參考
