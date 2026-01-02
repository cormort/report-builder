# Pro Report Studio v10.0 - 公務報表專用版

專業報表設計工具，支援拖放式設計、Excel/JSON/CSV 資料匯入、公式計算、PDF 直接下載與自動分頁列印。

---

## ✨ 功能特色

### 📊 資料匯入
- **Excel 原生支援** - 直接匯入 `.xlsx` / `.xls` 檔案 (SheetJS)
- **JSON 匯入** - 支援 JSON 陣列格式資料
- **CSV 資料綁定** - 匯入 CSV 並自動產生多頁報表
- **欄位類型推斷** - 自動辨識數字/日期/文字
- **條件格式** - 正值綠色、負值紅色顯示

### 🎨 報表設計
- **拖放式設計** - 直覺的元件拖放與對齊輔助線
- **公式引擎** - 支援 `=SUM()`, `=COUNT()`, `=AVG()` 計算
- **頁首/頁尾** - 支援變數 `{{PAGE}}`, `{{TOTAL}}`, `{{DATE}}`
- **多選對齊** - 6 方向對齊工具 + 全選功能
- **元件鎖定** - 防止誤操作

### 📁 專案管理
- **範本庫** - IndexedDB 儲存多個報表範本
- **專案存檔** - 儲存/載入 `.prs` 專案檔
- **浮水印** - 可自訂斜角浮水印文字

### 🖨️ 列印與輸出
- **PDF 底圖** - 匯入 PDF 範本進行描圖設計
- **PDF 直接下載** - jsPDF + html2canvas 產生 PDF
- **分頁預覽** - Modal 顯示每頁縮圖
- **自動分頁列印** - 智慧分頁與列印優化

### 🖥️ 介面優化
- **面板收合** - 左右側面板可收合，方便檢視橫向版面
- **橫向/直向切換** - 即時更新畫布尺寸

---

## 📁 專案結構

```
report-builder/
├── index.html          # 主頁面
├── css/
│   └── styles.css      # 樣式表
├── js/
│   └── app.js          # 應用邏輯
└── README.md           # 說明文件
```

---

## 🚀 GitHub Pages 部署

### 方法一：直接部署

1. 推送程式碼至 GitHub repository
2. 前往 **Settings** → **Pages**
3. **Source** 選擇 `main` branch，資料夾選 `/ (root)`
4. 點擊 **Save**，等待部署完成

### 方法二：使用 GitHub Actions

1. 在 repo 中建立 `.github/workflows/deploy.yml`：

```yaml
name: Deploy to GitHub Pages

on:
  push:
    branches: [main]

permissions:
  contents: read
  pages: write
  id-token: write

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/configure-pages@v4
      - uses: actions/upload-pages-artifact@v3
        with:
          path: '.'
      - uses: actions/deploy-pages@v4
```

---

## 🖥️ 本地開發

```bash
# 使用任意靜態伺服器
npx serve .

# 或使用 Python
python -m http.server 8080
```

開啟瀏覽器訪問 `http://localhost:8080`

---

## ⌨️ 快捷鍵

| 按鍵 | 功能 |
|------|------|
| `Ctrl/Cmd + A` | 全選所有元件 |
| `Ctrl/Cmd + Z` | 復原 |
| `Delete` | 刪除選中元件 |
| `Escape` | 取消選取 |
| `↑ ↓ ← →` | 微調位置 (1px) |
| `Shift + 方向鍵` | 快速移動 (10px) |
| `Shift + 點擊` | 多選元件 |

---

## 📝 License

MIT License
