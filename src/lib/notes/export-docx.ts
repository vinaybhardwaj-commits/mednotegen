import { Document, Packer, Paragraph, HeadingLevel, TextRun } from "docx";

/**
 * Minimal markdown→docx renderer matching the golden-note layout.
 * TODO(P1-C7): header identity table, signature block, EVEN letterhead, bold/runs from inline md.
 */
export async function toDocx(markdown: string, meta: Record<string, string>): Promise<Buffer> {
  const children: Paragraph[] = [
    new Paragraph({ text: meta.title ?? "Operative Note", heading: HeadingLevel.HEADING_1 }),
  ];

  for (const line of markdown.split("\n")) {
    const t = line.trim();
    if (!t) {
      children.push(new Paragraph({ text: "" }));
    } else if (t.startsWith("### ")) {
      children.push(new Paragraph({ text: t.slice(4), heading: HeadingLevel.HEADING_3 }));
    } else if (t.startsWith("## ")) {
      children.push(new Paragraph({ text: t.slice(3), heading: HeadingLevel.HEADING_2 }));
    } else if (t.startsWith("- ")) {
      children.push(new Paragraph({ text: t.slice(2), bullet: { level: 0 } }));
    } else {
      children.push(new Paragraph({ children: [new TextRun(t)] }));
    }
  }

  const doc = new Document({ sections: [{ children }] });
  return Packer.toBuffer(doc);
}
