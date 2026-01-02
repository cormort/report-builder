# Pro Report Studio v9.3 - 公務報表專用版

專業報表設計工具，支援拖放式設計、PDF 底圖描圖、CSV 資料綁定與自動分頁列印。

---

## ✨ 功能特色

- 🎨 **拖放式設計** - 直覺的元件拖放與對齊輔助線
- 📄 **PDF 底圖** - 匯入 PDF 範本進行描圖設計
- 📊 **CSV 資料綁定** - 匯入資料並自動產生多頁報表
- 🖨️ **自動分頁列印** - 智慧分頁與列印優化
- 💾 **專案存檔** - 儲存/載入 `.prs` 專案檔

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
python -m http.server 8000
```

開啟瀏覽器訪問 `http://localhost:8000`

---

## ⌨️ 快捷鍵

| 按鍵 | 功能 |
|------|------|
| `Ctrl/Cmd + Z` | 復原 |
| `Delete` | 刪除選中元件 |
| `↑ ↓ ← →` | 微調位置 (1px) |
| `Shift + 方向鍵` | 快速移動 (10px) |

---

## 📝 License

MIT License
