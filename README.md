# 作文小助手（學測國寫 AI 批改 PWA）

純前端、免建置、可離線瀏覽歷史紀錄的高中國寫（知性題／情意題／自由練習）自主練習與 AI 批改工具。

---

## 功能特色

1. **貼上即評**：支援知性題、情意題、自由練習三種模式，即時統計有效中文字數（不含空白與標點，限制 50–3000 字）與段落數，並附 **90 分鐘學測國寫倒數計時器**。
2. **學測國寫四大面向評分**：
   - **立意取材**（25 分）
   - **結構組織**（25 分）
   - **遣詞造句**（25 分）
   - **錯別字與標點**（25 分）
   - 提供總分（0–100）、等第徽章（A+ / A / B+ / B / C）、整體總評、具體優點、待改進示範、逐句錯字標點修正表、段落升等改寫示範與下一步練習建議。
3. **防幻覺原文比對**：自動比對 AI 引用的錯字與段落是否逐字存在於學生原文，若非逐字匹配會主動標示「參考」。
4. **本機歷史紀錄與趨勢圖**：使用 `IndexedDB`（含 `localStorage` 備援）儲存批改紀錄與最近 10 次總分趨勢圖，飛航模式／離線狀態下仍可隨時開啟回顧。
5. **模型自動探測**：預設使用 `gemini-3.5-flash-lite`，若遇到 `404` 或想切換其他模型，可在設定頁點擊「重新偵測可用模型」自動拉取帳號支援的 Gemini 模型清單。
6. **匯出與分享**：一鍵複製完整評閱報告，或下載 `.txt` 檔案。

---

## 本機執行方式

由於專案使用 ES Modules (`<script type="module">`) 與 Service Worker (`sw.js`)，請使用任一靜態伺服器開啟（直接雙擊 `file://` 無法載入模組與 Service Worker）：

### 方式 A：使用 Python（推薦）
```bash
python -m http.server 8080
```
接著打開瀏覽器前往 `http://localhost:8080`。

### 方式 B：使用 Node.js
```bash
npx serve .
```

### 方式 C：VS Code Live Server
安裝 **Live Server** 擴充功能後，對 `index.html` 按右鍵選擇 **Open with Live Server**。

---

## API Key 申請與隱私安全說明

1. 前往 [Google AI Studio](https://aistudio.google.com/app/apikey) 免費取得一組 Gemini API Key。
2. 打開本應用程式 → 點選右上角「**⚙ 設定**」→ 貼上您的 API Key 並儲存。
3. **安全提醒（請務必閱讀）**：
   - **請使用自己的 API Key**：本專案為純前端應用，API Key 僅儲存在您個人裝置瀏覽器的 `localStorage` 中，並直接連線至 `generativelanguage.googleapis.com`，不會經過任何第三方伺服器。
   - **共用電腦請清除資料**：在學校電腦、圖書館或他人裝置使用完畢後，請務必到「設定」頁底部點擊「**清除所有本機資料**」。
   - **公開部署建議**：若將此專案部署至公開網址（如 GitHub Pages），請勿將任何 API Key 寫死在程式碼中，並建議在 Google Cloud Console 為您的 API Key 設定 HTTP Referrer 網域限制與每日額度上限。

---

## 重新產生 PWA 圖示

若需重新產生 `icons/` 目錄下的佔位圖示，可執行：

```bash
node tools/generate-icons.mjs
```
