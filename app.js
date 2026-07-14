const state = {
  chapterId: localStorage.getItem("unwritten.chapterId") || "",
  fontSize: Number(localStorage.getItem("unwritten.fontSize") || 19),
  theme: localStorage.getItem("unwritten.theme") || "paper",
  layout: localStorage.getItem("unwritten.layout") || "scroll",
};

let book = null;
let chapterById = new Map();
let chapterCache = new Map();
let wheelLocked = false;

const params = new URLSearchParams(window.location.search);
const apiFromQuery = params.get("api");
if (apiFromQuery) {
  localStorage.setItem("unwritten.apiBase", apiFromQuery);
}

const API_BASE = (window.UNWRITTEN_API_BASE || localStorage.getItem("unwritten.apiBase") || "").replace(/\/$/, "");

const toc = document.querySelector(".toc");
const title = document.querySelector("#chapter-title");
const partName = document.querySelector("#part-name");
const chapterCount = document.querySelector("#chapter-count");
const progressLabel = document.querySelector("#progress-label");
const progressBar = document.querySelector("#progress-bar");
const lede = document.querySelector("#chapter-lede");
const sampleText = document.querySelector("#sample-text");
const pageStatus = document.querySelector("#page-status");
const backdrop = document.querySelector(".drawer-backdrop");
const copyrightYear = document.querySelector("#copyright-year");

if (copyrightYear) {
  copyrightYear.textContent = String(new Date().getFullYear());
}

function renderToc() {
  if (!book) return;

  toc.textContent = "";
  book.parts.forEach((part, index) => {
    const section = document.createElement("button");
    const list = document.createElement("ol");
    const listId = `part-${index}`;
    section.className = `toc-section${index < 2 ? " is-open" : ""}`;
    section.type = "button";
    section.dataset.target = listId;
    section.innerHTML = `<span>${part.name}</span><span>${part.chapters.length}</span>`;

    list.id = listId;
    list.hidden = index >= 2;
    part.chapters.forEach((chapterId) => {
      const chapter = chapterById.get(chapterId);
      if (!chapter) return;
      const item = document.createElement("li");
      const button = document.createElement("button");
      button.type = "button";
      button.dataset.chapterId = chapter.id;
      button.textContent = chapter.title;
      item.append(button);
      list.append(item);
    });

    toc.append(section, list);
  });
}

async function getChapter(chapterId) {
  const cached = chapterCache.get(chapterId);
  if (cached?.paragraphs) return cached;

  if (!API_BASE) {
    return cached;
  }

  const response = await fetch(`${API_BASE}/chapter?id=${encodeURIComponent(chapterId)}`, {
    cache: "no-store",
  });
  if (!response.ok) throw new Error(`Chapter API returned HTTP ${response.status}`);

  const chapter = await response.json();
  const merged = { ...cached, ...chapter };
  chapterCache.set(chapterId, merged);
  return merged;
}

function scrollReaderIntoView(behavior = "smooth") {
  const page = document.querySelector(".reader-page");
  const toolbar = document.querySelector(".reader-toolbar");
  if (!page) return;

  const toolbarHeight = toolbar?.getBoundingClientRect().height || 0;
  const gap = window.matchMedia("(max-width: 900px)").matches ? 12 : 24;
  const top = page.getBoundingClientRect().top + window.scrollY - toolbarHeight - gap;
  window.scrollTo({ top: Math.max(0, top), behavior });
}

async function setChapter(chapterId, options = {}) {
  if (!book) return;
  const chapter = await getChapter(chapterId || book.chapters[0]?.id);
  if (!chapter) return;

  state.chapterId = chapter.id;
  localStorage.setItem("unwritten.chapterId", chapter.id);
  title.textContent = chapter.title;
  partName.textContent = chapter.part;
  chapterCount.textContent = `${book.chapters.length} 篇`;

  const meta = [chapter.time, chapter.place].filter(Boolean).join("｜");
  lede.textContent = meta || "《迟迟》正文";
  sampleText.textContent = "";
  const blocks = chapter.blocks || (chapter.paragraphs || ["本章正文暂时无法加载。"]).map((text) => ({
    type: "paragraph",
    text,
  }));
  let firstScene = true;
  blocks.forEach((block) => {
    if (
      block.type === "scene" &&
      firstScene &&
      block.time === chapter.time &&
      block.place === chapter.place
    ) {
      firstScene = false;
      return;
    }
    if (block.type === "scene") firstScene = false;

    if (block.type === "record" || block.type === "notice") {
      const element = document.createElement("aside");
      element.className = `reader-block reader-document reader-${block.type}`;
      const heading = document.createElement("h3");
      heading.textContent = block.title || (block.type === "record" ? "旧记录" : "通知");
      element.append(heading);
      (block.paragraphs || []).forEach((text) => {
        const p = document.createElement("p");
        p.textContent = text;
        element.append(p);
      });
      sampleText.append(element);
      return;
    }

    let element;
    if (block.type === "scene") {
      element = document.createElement("div");
      element.textContent = [block.time, block.place].filter(Boolean).join("　｜　");
    } else if (block.type === "scene-break") {
      element = document.createElement("div");
      element.textContent = "※";
    } else {
      element = document.createElement(block.type === "paragraph" ? "p" : "h3");
      element.textContent = block.text;
    }
    element.className = `reader-block reader-${block.type}`;
    sampleText.append(element);
  });

  document.querySelectorAll("[data-chapter-id]").forEach((button) => {
    button.classList.toggle("is-active", button.dataset.chapterId === chapter.id);
  });

  const index = Math.max(0, book.chapters.findIndex((item) => item.id === chapter.id));
  const progress = Math.round((index / Math.max(1, book.chapters.length - 1)) * 100);
  progressLabel.textContent = `${progress}%`;
  progressBar.style.width = `${progress}%`;
  document.body.classList.remove("drawer-open");
  backdrop.hidden = true;
  syncPagedPosition("saved");

  if (options.scroll) {
    scrollReaderIntoView("smooth");
  }
}

function setTheme(theme) {
  state.theme = theme;
  localStorage.setItem("unwritten.theme", theme);
  document.body.classList.toggle("theme-night", theme === "night");
  document.querySelectorAll("[data-theme]").forEach((button) => {
    button.classList.toggle("is-active", button.dataset.theme === theme);
  });
}

function setLayout(layout) {
  state.layout = layout;
  localStorage.setItem("unwritten.layout", layout);
  document.body.classList.toggle("layout-paged", layout === "paged");
  document.body.classList.toggle("layout-scroll", layout !== "paged");
  document.querySelectorAll("[data-layout]").forEach((button) => {
    button.classList.toggle("is-active", button.dataset.layout === layout);
  });
  syncPagedPosition("saved");

  if (layout === "paged") {
    requestAnimationFrame(() => scrollReaderIntoView("smooth"));
  }
}

function setFont(delta) {
  state.fontSize = Math.min(24, Math.max(16, state.fontSize + delta));
  localStorage.setItem("unwritten.fontSize", String(state.fontSize));
  document.documentElement.style.setProperty("--reader-size", `${state.fontSize}px`);
  syncPagedPosition("current");
}

setTheme(state.theme);
setLayout(state.layout);
document.documentElement.style.setProperty("--reader-size", `${state.fontSize}px`);

function getPageMetrics() {
  const styles = getComputedStyle(sampleText);
  const columnGap = Number.parseFloat(styles.columnGap) || 0;
  const pageWidth = Math.max(1, sampleText.clientWidth);
  const pageStride = pageWidth + columnGap;
  const maxScrollLeft = Math.max(0, sampleText.scrollWidth - pageWidth);
  const pageCount = Math.max(1, Math.ceil(maxScrollLeft / pageStride) + 1);
  const pageIndex = Math.min(pageCount - 1, Math.max(0, Math.round(sampleText.scrollLeft / pageStride)));
  return { pageWidth, pageStride, pageCount, pageIndex };
}

function pageStorageKey(chapterId = state.chapterId) {
  return `unwritten.page.${chapterId}`;
}

function getSavedPageIndex() {
  const value = Number(localStorage.getItem(pageStorageKey()) || 0);
  return Number.isFinite(value) ? Math.max(0, value) : 0;
}

function savePageIndex(pageIndex) {
  if (!state.chapterId) return;
  localStorage.setItem(pageStorageKey(), String(pageIndex));
}

function updatePageStatus() {
  if (!pageStatus) return;
  const { pageCount, pageIndex } = getPageMetrics();
  pageStatus.textContent = `${pageIndex + 1} / ${pageCount}`;
  if (state.layout === "paged") {
    savePageIndex(pageIndex);
  }
}

function goToPage(pageIndex, behavior = "smooth") {
  if (state.layout !== "paged") return;
  const { pageStride, pageCount } = getPageMetrics();
  const nextPage = Math.min(pageCount - 1, Math.max(0, pageIndex));
  sampleText.scrollTo({ left: nextPage * pageStride, behavior });
  window.setTimeout(updatePageStatus, behavior === "smooth" ? 220 : 40);
}

function syncPagedPosition(mode = "saved") {
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      if (state.layout !== "paged") {
        sampleText.scrollLeft = 0;
        updatePageStatus();
        return;
      }

      const { pageIndex } = getPageMetrics();
      const targetPage = mode === "current" ? pageIndex : getSavedPageIndex();
      goToPage(targetPage, "auto");
    });
  });
}

function turnPage(direction) {
  if (state.layout !== "paged") return;
  const { pageIndex } = getPageMetrics();
  goToPage(pageIndex + direction);
}

function saveBookmark() {
  if (!state.chapterId) return;
  const { pageIndex } = getPageMetrics();
  const bookmark = {
    chapterId: state.chapterId,
    pageIndex,
    savedAt: new Date().toISOString(),
  };
  localStorage.setItem("unwritten.bookmark", JSON.stringify(bookmark));
  savePageIndex(pageIndex);
  if (pageStatus) {
    const original = pageStatus.textContent;
    pageStatus.textContent = "书签已保存";
    window.setTimeout(() => {
      pageStatus.textContent = original;
    }, 1000);
  }
}

function openBookmark() {
  const raw = localStorage.getItem("unwritten.bookmark");
  if (!raw) return;

  try {
    const bookmark = JSON.parse(raw);
    if (!chapterById.has(bookmark.chapterId)) return;
    localStorage.setItem(pageStorageKey(bookmark.chapterId), String(bookmark.pageIndex || 0));
    setLayout("paged");
    setChapter(bookmark.chapterId, { scroll: true });
  } catch {
    localStorage.removeItem("unwritten.bookmark");
  }
}

async function loadBook() {
  try {
    let response;
    if (API_BASE) {
      response = await fetch(`${API_BASE}/index`, { cache: "no-store" });
    } else {
      response = await fetch("./content/book.json", { cache: "no-store" });
      if (!response.ok) {
        response = await fetch("./content/index.json", { cache: "no-store" });
      }
    }

    if (!response.ok) throw new Error(`Book index returned HTTP ${response.status}`);
    book = await response.json();
    chapterById = new Map(book.chapters.map((chapter) => [chapter.id, chapter]));
    chapterCache = new Map(book.chapters.map((chapter) => [chapter.id, chapter]));
    renderToc();
    await setChapter(chapterById.has(state.chapterId) ? state.chapterId : book.chapters[0]?.id || "");
  } catch (error) {
    title.textContent = "正文暂时无法加载";
    partName.textContent = API_BASE ? "API 状态" : "离线状态";
    lede.textContent = API_BASE
      ? "请检查 API 服务是否在线，或确认 CORS 设置允许当前站点访问。"
      : "当前公开站点未配置正文 API。目录可以浏览，正文需要 API 按章节加载。";
    sampleText.textContent = "";
    const p = document.createElement("p");
    p.textContent = "本地预览命令：python -m http.server 4180 --bind 127.0.0.1";
    sampleText.append(p);
  }
}

document.addEventListener("click", (event) => {
  const section = event.target.closest(".toc-section");
  if (section) {
    const list = document.querySelector(`#${section.dataset.target}`);
    const isHidden = list.hidden;
    list.hidden = !isHidden;
    section.classList.toggle("is-open", isHidden);
    return;
  }

  const chapterButton = event.target.closest("[data-chapter-id]");
  if (chapterButton) {
    setChapter(chapterButton.dataset.chapterId, { scroll: true });
    return;
  }

  const themeButton = event.target.closest("[data-theme]");
  if (themeButton) {
    setTheme(themeButton.dataset.theme);
    return;
  }

  const layoutButton = event.target.closest("[data-layout]");
  if (layoutButton) {
    setLayout(layoutButton.dataset.layout);
    return;
  }

  const fontButton = event.target.closest("[data-font]");
  if (fontButton) {
    setFont(Number(fontButton.dataset.font));
    return;
  }

  const pageButton = event.target.closest("[data-page]");
  if (pageButton) {
    turnPage(pageButton.dataset.page === "next" ? 1 : -1);
    return;
  }

  const bookmarkButton = event.target.closest("[data-bookmark]");
  if (bookmarkButton) {
    if (bookmarkButton.dataset.bookmark === "save") {
      saveBookmark();
    } else {
      openBookmark();
    }
    return;
  }

  if (event.target.closest(".mobile-menu")) {
    document.body.classList.add("drawer-open");
    backdrop.hidden = false;
    return;
  }

  if (event.target === backdrop) {
    document.body.classList.remove("drawer-open");
    backdrop.hidden = true;
    return;
  }

  if (event.target.closest("[data-start-reading]")) {
    setChapter(book?.chapters[0]?.id || "", { scroll: true });
    return;
  }

  if (event.target.closest("[data-open-map]")) {
    document.querySelector(".library-panel").scrollIntoView({ behavior: "smooth", block: "start" });
    document.body.classList.add("drawer-open");
    backdrop.hidden = false;
  }
});

loadBook();

sampleText.addEventListener("scroll", updatePageStatus);

sampleText.addEventListener(
  "wheel",
  (event) => {
    if (state.layout !== "paged" || event.ctrlKey) return;

    const delta = Math.abs(event.deltaX) > Math.abs(event.deltaY) ? event.deltaX : event.deltaY;
    if (Math.abs(delta) < 6) return;

    event.preventDefault();
    if (wheelLocked) return;

    wheelLocked = true;
    turnPage(delta > 0 ? 1 : -1);
    window.setTimeout(() => {
      wheelLocked = false;
    }, 320);
  },
  { passive: false }
);

sampleText.addEventListener("click", (event) => {
  if (state.layout !== "paged") return;
  if (window.getSelection()?.toString()) return;
  const bounds = sampleText.getBoundingClientRect();
  turnPage(event.clientX > bounds.left + bounds.width / 2 ? 1 : -1);
});

window.addEventListener("resize", () => syncPagedPosition("current"));

document.addEventListener("keydown", (event) => {
  if (state.layout !== "paged") return;
  if (event.target && ["INPUT", "TEXTAREA", "SELECT"].includes(event.target.tagName)) return;

  if (["ArrowRight", "PageDown", " "].includes(event.key)) {
    event.preventDefault();
    turnPage(1);
  }

  if (["ArrowLeft", "PageUp"].includes(event.key)) {
    event.preventDefault();
    turnPage(-1);
  }
});

document.addEventListener("copy", (event) => {
  const selection = window.getSelection();
  const selectedText = selection ? selection.toString().trim() : "";

  if (!selectedText || !event.clipboardData) {
    return;
  }

  const notice = [
    "",
    "",
    "——",
    "摘自《迟迟》",
    "版权所有 © fyapeng.com / fyapeng。未经许可，不得转载、改编、批量抓取或商业使用。",
    `来源：${window.location.href}`,
  ].join("\n");

  event.clipboardData.setData("text/plain", `${selectedText}${notice}`);
  event.preventDefault();
});
