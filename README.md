# 照顧計畫產生器

長照 A 個管家訪用：點選訪視評估表，產出可貼進 CMS 的「計畫目標」「計畫執行規劃」。單一 HTML、完全離線。

## 給同事的成品
- `dist/照顧計畫產生器.zip`：整包壓縮檔，解壓縮後用 Chrome / Edge 開啟 `照顧計畫產生器.html`
- `dist/照顧計畫產生器/`：同上，未壓縮版（含 `個案存檔/115年度/1月～12月`、`使用說明.txt`）

## 專案結構
| 路徑 | 內容 |
|---|---|
| `src/catalog.js` | 官方服務碼別 166 項與輔具評估分類（由 `tools/` 產生，勿手改） |
| `src/data.js` | 服務選單分組、照顧問題 34 項、額度、身障類別、預設設定 |
| `src/schema.js` | 評估表欄位結構（壹～貳-6） |
| `src/narrative.js` | 文字產生器：各段句型、照顧問題、目標三種寫法、複評比對、異動段落、檢核 |
| `src/pdf.js` | PDF 產生器：用 html2canvas 逐頁轉圖、自行組成 A4 PDF，並夾帶個案資料供匯入 |
| `src/vendor/html2canvas.min.js` | html2canvas 1.4.1（MIT），建置時內嵌，維持完全離線 |
| `src/ui.js` | 表單控制項、存檔／分享、對話框 |
| `src/app.js` | 主程式：個案清單、分頁、服務規劃、產出、存檔資料夾、列印、設定 |
| `src/style.css` | 樣式（iOS 風格卡片、毛玻璃頂列、明曜 logo 浮水印） |
| `src/assets/` | 明曜 logo 裁切檔（浮水印、標誌）與主畫面圖示；建置時以 data URI 內嵌。原始檔：`明曜長照LOGO-02.png` |
| `docs/使用說明.txt` | 使用說明原稿（打包時放進成品資料夾） |
| `tools/official_codes.json`, `tools/aids_eval.json` | 從全國法規資料庫附表四、四之一解析的原始資料 |
| `test/` | 文字產生器與瀏覽器自動測試（測試個案皆為虛構） |

## 雲端同步
- Firebase 專案 `mingyauaunit-8bd6d`（Authentication 電子郵件/密碼＋Firestore，機房 asia-east1 台灣），設定在 `src/cloud.js`。
- 帳號 `mya001` 對應雲端信箱 `mya001@mingyauaunit-8bd6d.firebaseapp.com`，由管理者在 Firebase 後台建立，密碼與登入密碼相同；已關閉自行註冊。
- Firestore 規則：只能讀寫 `users/{自己的 uid}/…`。
- 個案與設定以 AES-GCM 加密後才上傳；每個帳號一把資料金鑰，以「登入密碼＋隨機鹽」導出的金鑰包裝後存在 `users/{uid}`。雲端與本機快取都只有密文。
- 離線：Firestore 離線快取（密文）＋ `web/sw.js` 快取網頁本身。
- 測試一律使用 `test/fake_firebase.js` 模擬雲端（`test/helpers.js` 自動注入），不會連到正式專案。

## 建置與測試
```bash
py package.py               # 合併 src/ → dist/，並打包 zip（Windows 用 py；其他系統用 python3）
node test/gen_test.js       # 文字產生器輸出
node test/ui_test.js        # 點選、草稿、存取、各尺寸版面
node test/flow_test.js      # 存檔兩個 PDF 與年度月份資料夾、PDF／舊 html 匯入、設定、複評
node test/aa01_test.js      # AA01：建立、各分頁文字、三段產出、PDF 存檔與匯入
node test/grid_test.js      # 週間排程表
node test/age_test.js       # 出生年次換算年齡
node test/cloud_test.js     # 雲端：加密存放、舊資料上傳、換裝置、離線、密碼更換、刪除、登出
node test/new_test.js       # 額度帶入、目標換寫法、跳到未填欄位、身障選項、複評比對、交通單位簡稱轉換
```
瀏覽器測試需要 Playwright：`npm install`（依 package.json）後執行 `npx playwright install chromium`。`node_modules/` 只供本機測試，不會打包進成品。

## 版權
© 明曜居家長照機構 版權所有，未經授權不得複製、修改或散布。詳見 `LICENSE`。
