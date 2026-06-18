import {
  Document, Packer, Paragraph, HeadingLevel, TextRun,
  Table, TableRow, TableCell, WidthType, BorderStyle,
} from "docx";

/**
 * Render the composed markdown note to .docx: markdown tables → docx tables,
 * headings, bullets, and **bold** inline. Matches the golden-note layout.
 */
export async function toDocx(markdown: string, meta: Record<string, string>): Promise<Buffer> {
  const lines = (markdown || "").split("\n");
  const children: (Paragraph | Table)[] = [
    new Paragraph({ text: meta.title || "Clinical Note", heading: HeadingLevel.HEADING_1 }),
  ];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const t = line.trim();

    // Markdown table block
    if (t.startsWith("|") && t.endsWith("|")) {
      const block: string[] = [];
      while (i < lines.length && lines[i].trim().startsWith("|")) { block.push(lines[i].trim()); i++; }
      i--; // step back; for-loop will advance
      const rows = block
        .filter((r) => !/^\|[\s:|-]+\|$/.test(r)) // drop separator row
        .map((r) => r.slice(1, -1).split("|").map((c) => c.trim()));
      if (rows.length) {
        children.push(new Table({
          width: { size: 100, type: WidthType.PERCENTAGE },
          rows: rows.map((cells) => new TableRow({
            children: cells.map((c) => new TableCell({
              children: [new Paragraph({ children: inlineRuns(c) })],
              margins: { top: 40, bottom: 40, left: 80, right: 80 },
            })),
          })),
        }));
        children.push(new Paragraph({ text: "" }));
      }
      continue;
    }

    if (!t) { children.push(new Paragraph({ text: "" })); continue; }
    if (t.startsWith("### ")) { children.push(new Paragraph({ text: t.slice(4), heading: HeadingLevel.HEADING_3 })); continue; }
    if (t.startsWith("## ")) { children.push(new Paragraph({ text: t.slice(3), heading: HeadingLevel.HEADING_2 })); continue; }
    if (t.startsWith("# ")) { children.push(new Paragraph({ text: t.slice(2), heading: HeadingLevel.HEADING_1 })); continue; }
    if (t === "---") {
      children.push(new Paragraph({ border: { bottom: { color: "999999", space: 1, style: BorderStyle.SINGLE, size: 6 } }, children: [] }));
      continue;
    }
    if (t.startsWith("- ") || t.startsWith("* ")) {
      children.push(new Paragraph({ children: inlineRuns(t.slice(2)), bullet: { level: 0 } }));
      continue;
    }
    children.push(new Paragraph({ children: inlineRuns(t) }));
  }

  const doc = new Document({ sections: [{ children }] });
  return Packer.toBuffer(doc);
}

/** Split a string on **bold** markers into TextRuns. */
function inlineRuns(text: string): TextRun[] {
  const parts = text.split(/\*\*/);
  return parts.map((p, idx) => new TextRun({ text: p, bold: idx % 2 === 1 }));
}
