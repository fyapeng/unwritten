from __future__ import annotations

import json
import re
from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / "unwritten" / "content" / "book.json"


def read_text(path: Path) -> str:
    return path.read_text(encoding="utf-8-sig")


def extract_group(text: str, command: str) -> str | None:
    match = re.search(rf"\\{command}\{{([^}}]+)\}}", text)
    return match.group(1).strip() if match else None


def clean_inline(text: str) -> str:
    replacements = {
        r"\quad": " ",
        r"\qquad": " ",
        r"\textbar": "|",
        r"\%": "%",
        r"\#": "#",
        r"\&": "&",
        r"\_": "_",
        r"~": " ",
    }
    for old, new in replacements.items():
        text = text.replace(old, new)

    text = re.sub(r"\\textbf\{([^{}]*)\}", r"\1", text)
    text = re.sub(r"\\emph\{([^{}]*)\}", r"\1", text)
    text = re.sub(r"\\[a-zA-Z]+\{([^{}]*)\}", r"\1", text)
    text = re.sub(r"\\[a-zA-Z]+\*?(?:\[[^\]]*\])?", "", text)
    text = text.replace("{", "").replace("}", "")
    text = re.sub(r"[ \t]+", " ", text)
    return text.strip()


def tex_to_paragraphs(text: str) -> list[str]:
    lines: list[str] = []
    for raw_line in text.splitlines():
        line = re.sub(r"(?<!\\)%.*$", "", raw_line).strip()
        if not line:
            lines.append("")
            continue

        if re.match(r"\\(?:chapter|Prologue|Interlude)\{", line):
            continue
        if re.match(r"\\(?:ChapterTimePlace|thispagestyle|addcontentsline|markboth)", line):
            continue
        if line.startswith(r"\begin{center}") or line.startswith(r"\end{center}"):
            continue

        section = re.match(r"\\section\*?\{([^}]+)\}", line)
        if section:
            lines.extend(["", clean_inline(section.group(1)), ""])
            continue

        scene = re.match(r"\\SceneTimePlace\{([^}]+)\}\{([^}]+)\}", line)
        if scene:
            lines.extend(["", f"{clean_inline(scene.group(1))}｜{clean_inline(scene.group(2))}", ""])
            continue

        block = re.match(r"\\begin\{(?:RecordBlock|NoticeBlock)\}(?:\[([^\]]+)\])?", line)
        if block:
            title = block.group(1)
            if title:
                lines.extend(["", f"【{clean_inline(title)}】", ""])
            continue

        if re.match(r"\\end\{(?:RecordBlock|NoticeBlock)\}", line):
            lines.append("")
            continue

        cleaned = clean_inline(line)
        if cleaned:
            lines.append(cleaned)

    paragraphs: list[str] = []
    current: list[str] = []
    for line in lines:
        if line:
            current.append(line)
        elif current:
            paragraphs.append("".join(current).strip())
            current = []
    if current:
        paragraphs.append("".join(current).strip())

    return [paragraph for paragraph in paragraphs if paragraph]


def title_for(path: Path, text: str) -> str:
    for command in ("chapter", "Prologue", "Interlude"):
        title = extract_group(text, command)
        if title:
            return title
    if path.name == "quanshuwan.tex":
        return "全书完"
    if path.name == "renwu-jianbiao.tex":
        return "人物简表"
    return path.stem


def time_place(text: str) -> tuple[str, str]:
    match = re.search(r"\\ChapterTimePlace\{([^}]+)\}\{([^}]+)\}", text)
    if not match:
        return "", ""
    return clean_inline(match.group(1)), clean_inline(match.group(2))


def build_book() -> dict:
    main_path = ROOT / "迟迟.tex"
    main = read_text(main_path)
    current_part = "序"
    part_order: list[str] = [current_part]
    parts: dict[str, list[str]] = {current_part: []}
    chapters: list[dict] = []

    for match in re.finditer(r"\\(part|input)\{([^}]+)\}", main):
        kind, value = match.group(1), match.group(2)
        if kind == "part":
            current_part = clean_inline(value)
            if current_part not in parts:
                parts[current_part] = []
                part_order.append(current_part)
            continue

        source = ROOT / f"{value}.tex"
        if not source.exists():
            continue

        raw = read_text(source)
        chapter_id = source.with_suffix("").relative_to(ROOT).as_posix()
        title = title_for(source, raw)
        time, place = time_place(raw)
        paragraphs = tex_to_paragraphs(raw)

        chapter = {
            "id": chapter_id,
            "part": current_part,
            "title": title,
            "time": time,
            "place": place,
            "paragraphs": paragraphs,
        }
        chapters.append(chapter)
        parts.setdefault(current_part, []).append(chapter_id)

    return {
        "title": "迟迟",
        "subtitle": "Still Unwritten",
        "author": "申椿 Sencium",
        "site": "fyapeng.com",
        "copyright": "© fyapeng.com / fyapeng. All rights reserved.",
        "parts": [{"name": name, "chapters": parts[name]} for name in part_order if parts.get(name)],
        "chapters": chapters,
    }


def main() -> None:
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(build_book(), ensure_ascii=False, indent=2), encoding="utf-8")
    print(OUT)


if __name__ == "__main__":
    main()
