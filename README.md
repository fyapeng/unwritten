# Unwritten

`unwritten` 是《迟迟》（Still Unwritten）的网页阅读器。公开仓库应只包含前端、封面和必要静态资源；完整正文应由私有 API 按章节返回。

## 推荐发布结构

- 私有仓库：保存完整书稿源文件，例如 `.tex`、`.md`、`.pdf`、修订报告和生成脚本。
- 公开仓库：只保存 `unwritten/` 这类前端发布物，不提交完整正文 JSON。
- GitHub Pages：把公开仓库发布到 `fyapeng.github.io/unwritten` 或绑定到 `fyapeng.com` / `www.fyapeng.com`。

## 内容保护边界

静态网页无法彻底阻止复制。只要正文显示在浏览器里，读者就可以通过浏览器工具、缓存或截图取得显示内容。

可行的保护方式是：

- 不把完整 `.tex`、`.md`、`.pdf` 放进公开仓库。
- 如果发布完整正文，不提供 `.tex`、`.md`、PDF、整本 JSON 或整站源码下载入口。
- 公开站只放试读章节、片段、目录、人物关系、时间线等可公开材料。
- 如果要完整在线阅读但限制访问，需要后端登录、权限校验和服务端按权限下发章节。
- `robots.txt` 已经限制合规爬虫访问 `/content/` 和 `/assets/`，并拒绝常见 AI 抓取机器人；这能提高批量抓取成本，但不能替代后端权限控制。

## 正文生成与 API

从项目根目录运行：

```bash
python unwritten/scripts/build-content.py
```

脚本会读取根目录的 `迟迟.tex`，按照其中的 `\part{}` 和 `\input{}` 顺序解析 `chapters/` 与 `backmatter/`，生成：

```text
unwritten/content/book.json
```

网页端只读取这个 JSON。标题以真实 `.tex` 中的 `\chapter{}`、`\Prologue{}` 或 `\Interlude{}` 为准，例如 `10-xiaoyi.tex` 会显示为“小衣”。

生产环境不要把 `content/book.json` 提交到公开仓库。本目录的 `.gitignore` 已经忽略它。

推荐 API 形态：

```text
GET /index
返回书名、分卷、章节 id、章节标题、时间地点等目录信息，不返回 paragraphs。

GET /chapter?id=chapters/10-xiaoyi
只返回单章正文 paragraphs。
```

前端会优先读取 `window.UNWRITTEN_API_BASE`：

```html
<script>
  window.UNWRITTEN_API_BASE = "https://your-private-api.example.com";
</script>
```

如果没有配置 API 地址，则本地预览时会读取 `./content/book.json`。

API 仓库建议保持 private。可以用 Node.js、Python、Cloudflare Workers、Vercel Functions 或 Supabase Edge Functions 实现；你本机已有 Node、Python、GitHub CLI，足够完成本地生成、测试、建仓库和部署。

## 后续路线

1. 主界面：封面、目录、阅读器、字号、夜间模式、阅读进度。
2. 试读版：从私有书稿生成少量公开章节 JSON，只发布试读内容。
3. 资料层：人物关系、年代线、地点、物件线索、章节伏笔索引。
4. 同步层：接入 Supabase、Firebase 或自建 API，同步阅读位置、书签和批注。
5. 权限层：登录后按授权加载完整正文；GitHub Pages 仅托管前端，正文由后端服务提供。

## 阅读模式

阅读器支持两种正文模式：

- 滚动：常规网页长卷阅读。
- 翻页：桌面双栏、窄屏单栏，支持上一页/下一页按钮、点击正文左右半区翻页，以及键盘 `ArrowLeft`、`ArrowRight`、`PageUp`、`PageDown`、空格控制。

翻页模式的阅读区会根据设备视口自动调整高度。鼠标滚轮和触控板横向滚动会被吸附成整页翻动，避免停在半页位置。

字号、主题、阅读模式、每章读到的页码和手动书签会保存在浏览器本地。

## 本地预览

直接打开 `index.html` 可以预览。也可以在本目录运行：

```bash
python -m http.server 4180 --bind 127.0.0.1
```

然后访问 `http://127.0.0.1:4180/`。
