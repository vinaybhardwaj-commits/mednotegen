/** Minimal, dependency-free markdown helpers for the editor (R5). Client-safe. */

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
function inline(s: string): string {
  return esc(s).replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>").replace(/\*(.+?)\*/g, "<em>$1</em>");
}

/** Convert composed markdown to HTML for TipTap setContent (headings, lists, bold, paragraphs). */
export function mdToHtml(md: string): string {
  const lines = (md || "").split("\n");
  let html = "";
  let inList = false;
  const closeList = () => { if (inList) { html += "</ul>"; inList = false; } };
  for (const raw of lines) {
    const l = raw.trim();
    if (!l) { closeList(); continue; }
    if (/^###\s+/.test(l)) { closeList(); html += `<h3>${inline(l.replace(/^###\s+/, ""))}</h3>`; }
    else if (/^##\s+/.test(l)) { closeList(); html += `<h2>${inline(l.replace(/^##\s+/, ""))}</h2>`; }
    else if (/^#\s+/.test(l)) { closeList(); html += `<h2>${inline(l.replace(/^#\s+/, ""))}</h2>`; }
    else if (/^[-*]\s+/.test(l)) { if (!inList) { html += "<ul>"; inList = true; } html += `<li>${inline(l.replace(/^[-*]\s+/, ""))}</li>`; }
    else if (/^\|/.test(l) || /^-{3,}$/.test(l)) { closeList(); html += `<p>${inline(l)}</p>`; }
    else { closeList(); html += `<p>${inline(l)}</p>`; }
  }
  closeList();
  return html || "<p></p>";
}

/** Serialize a TipTap/ProseMirror doc (editor.getJSON()) to clean markdown.
 *  Used at sign-time so the stored note (and every export — docx/PDF/clipboard) carries
 *  real "### " headings, bullets and bold/italic rather than a flattened text dump. */
type PMNode = { type?: string; attrs?: Record<string, unknown>; content?: PMNode[]; text?: string; marks?: { type: string }[] };

function inlineMd(nodes: PMNode[] = []): string {
  return nodes.map((n) => {
    if (n.type === "hardBreak") return "\n";
    if (n.type !== "text") return "";
    let t = n.text ?? "";
    const has = (m: string) => (n.marks || []).some((x) => x.type === m);
    if (has("bold")) t = `**${t}**`;
    if (has("italic")) t = `*${t}*`;
    return t;
  }).join("");
}

export function editorJsonToMarkdown(doc: PMNode | null | undefined): string {
  const out: string[] = [];
  const liText = (li: PMNode) => inlineMd(li.content?.[0]?.content || []);
  const walk = (nodes: PMNode[] = []) => {
    for (const n of nodes) {
      switch (n.type) {
        case "heading": {
          const lvl = Math.min(Math.max(Number(n.attrs?.level) || 2, 1), 6);
          out.push("#".repeat(lvl) + " " + inlineMd(n.content));
          break;
        }
        case "paragraph": out.push(inlineMd(n.content)); break;
        case "bulletList": for (const li of n.content || []) out.push("- " + liText(li)); break;
        case "orderedList": { let i = 1; for (const li of n.content || []) out.push(`${i++}. ` + liText(li)); break; }
        case "horizontalRule": out.push("---"); break;
        default: if (n.content) walk(n.content);
      }
    }
  };
  walk(doc?.content || []);
  return out.join("\n\n").replace(/\n{3,}/g, "\n\n").trim();
}

export type DiffToken = { t: "same" | "add" | "del"; w: string };

/** LCS word-level diff (keeps whitespace tokens) for the compose before/after review. */
export function wordDiff(a: string, b: string): DiffToken[] {
  const A = (a || "").split(/(\s+)/);
  const B = (b || "").split(/(\s+)/);
  const m = A.length, n = B.length;
  const dp: number[][] = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));
  for (let i = m - 1; i >= 0; i--)
    for (let j = n - 1; j >= 0; j--)
      dp[i][j] = A[i] === B[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
  const out: DiffToken[] = [];
  let i = 0, j = 0;
  while (i < m && j < n) {
    if (A[i] === B[j]) { out.push({ t: "same", w: A[i] }); i++; j++; }
    else if (dp[i + 1][j] >= dp[i][j + 1]) { out.push({ t: "del", w: A[i] }); i++; }
    else { out.push({ t: "add", w: B[j] }); j++; }
  }
  while (i < m) { out.push({ t: "del", w: A[i] }); i++; }
  while (j < n) { out.push({ t: "add", w: B[j] }); j++; }
  return out;
}
