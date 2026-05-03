const {
  Document, Packer, Paragraph, TextRun, AlignmentType, HeadingLevel,
  PageBreak, convertInchesToTwip
} = require('docx');

// Hollywood margins in twips (1 inch = 1440 twips)
const TWIP = {
  left: convertInchesToTwip(1.5),
  right: convertInchesToTwip(1),
  top: convertInchesToTwip(1),
  bottom: convertInchesToTwip(1),
  charLeft: convertInchesToTwip(3.7),   // character name indent
  dialLeft: convertInchesToTwip(2.5),   // dialogue indent
  dialRight: convertInchesToTwip(2.5),  // dialogue right margin
  parenLeft: convertInchesToTwip(3.1),
};

function blockToDocxParagraph(block) {
  const text = block.text || '';
  const type = block.type || 'action';

  const base = {
    spacing: { after: 0, before: 0, line: 240 }, // single space = 240 twips
  };

  switch (type) {
    case 'scene-heading':
      return new Paragraph({
        ...base,
        spacing: { ...base.spacing, before: 240 },
        children: [new TextRun({ text: text.toUpperCase(), bold: true, font: 'Courier New', size: 24 })],
        indent: { left: 0, right: 0 },
        border: { bottom: { color: '000000', size: 6, style: 'single', space: 1 } },
      });

    case 'action':
      return new Paragraph({
        ...base,
        spacing: { ...base.spacing, before: 120 },
        children: [new TextRun({ text, font: 'Courier New', size: 24 })],
      });

    case 'character':
      return new Paragraph({
        ...base,
        spacing: { ...base.spacing, before: 240 },
        children: [new TextRun({ text: text.toUpperCase(), font: 'Courier New', size: 24 })],
        indent: { left: TWIP.charLeft },
      });

    case 'dialogue':
      return new Paragraph({
        ...base,
        children: [new TextRun({ text, font: 'Courier New', size: 24 })],
        indent: { left: TWIP.dialLeft, right: TWIP.dialRight },
      });

    case 'parenthetical':
      return new Paragraph({
        ...base,
        children: [new TextRun({ text: `(${text})`, font: 'Courier New', size: 24 })],
        indent: { left: TWIP.parenLeft, right: TWIP.dialRight },
      });

    case 'transition':
      return new Paragraph({
        ...base,
        spacing: { ...base.spacing, before: 240, after: 240 },
        children: [new TextRun({ text: text.toUpperCase(), font: 'Courier New', size: 24 })],
        alignment: AlignmentType.RIGHT,
      });

    case 'shot':
      return new Paragraph({
        ...base,
        spacing: { ...base.spacing, before: 120 },
        children: [new TextRun({ text: text.toUpperCase(), font: 'Courier New', size: 24 })],
      });

    default:
      return new Paragraph({
        ...base,
        children: [new TextRun({ text, font: 'Courier New', size: 24 })],
      });
  }
}

async function exportToDocx(blocks, title) {
  const paragraphs = [];

  // Title page header
  paragraphs.push(new Paragraph({
    spacing: { before: 2880, after: 240, line: 240 },
    children: [new TextRun({ text: title.toUpperCase(), bold: true, font: 'Courier New', size: 28 })],
    alignment: AlignmentType.CENTER,
  }));

  paragraphs.push(new Paragraph({
    spacing: { after: 2880, line: 240 },
    children: [new TextRun({ text: 'Written with ScriptForge', font: 'Courier New', size: 24 })],
    alignment: AlignmentType.CENTER,
  }));

  // Page break after title page
  paragraphs.push(new Paragraph({ children: [new PageBreak()] }));

  // Script content
  for (const block of blocks) {
    paragraphs.push(blockToDocxParagraph(block));
  }

  const doc = new Document({
    sections: [{
      properties: {
        page: {
          margin: {
            top: TWIP.top,
            right: TWIP.right,
            bottom: TWIP.bottom,
            left: TWIP.left,
          }
        }
      },
      children: paragraphs,
    }],
    creator: 'ScriptForge',
    title,
  });

  return await Packer.toBuffer(doc);
}

module.exports = { exportToDocx };
