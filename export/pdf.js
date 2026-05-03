const PDFDocument = require('pdfkit');

// Hollywood screenplay format constants (in points, 72pt = 1 inch)
const PAGE_WIDTH = 612;   // 8.5"
const PAGE_HEIGHT = 792;  // 11"
const MARGIN_TOP = 72;    // 1"
const MARGIN_BOTTOM = 72; // 1"
const MARGIN_LEFT = 108;  // 1.5"
const MARGIN_RIGHT = 72;  // 1"
const FONT_SIZE = 12;
const LINE_HEIGHT = 14.4; // 12pt * 1.2
const CONTENT_WIDTH = PAGE_WIDTH - MARGIN_LEFT - MARGIN_RIGHT; // ~432pt

// Element-specific left offsets (from MARGIN_LEFT, in pts)
const OFFSETS = {
  'scene-heading': 0,
  'action': 0,
  'character': 144,   // ~2" from content left = centered-ish
  'dialogue': 72,     // ~1" indent from content left
  'parenthetical': 108, // ~1.5" indent
  'transition': 0,    // right-aligned
  'shot': 0,
};

// Max width for each element
const WIDTHS = {
  'scene-heading': CONTENT_WIDTH,
  'action': CONTENT_WIDTH,
  'character': CONTENT_WIDTH - 144,
  'dialogue': CONTENT_WIDTH - 144,  // 3" wide
  'parenthetical': CONTENT_WIDTH - 180,
  'transition': CONTENT_WIDTH,
  'shot': CONTENT_WIDTH,
};

function formatText(type, text) {
  switch (type) {
    case 'scene-heading':
    case 'character':
    case 'transition':
    case 'shot':
      return text.toUpperCase();
    default:
      return text;
  }
}

function exportToPdf(blocks, title, outputStream) {
  const doc = new PDFDocument({
    size: 'LETTER',
    margins: { top: MARGIN_TOP, bottom: MARGIN_BOTTOM, left: MARGIN_LEFT, right: MARGIN_RIGHT },
    bufferPages: true,
    info: { Title: title, Creator: 'ScriptForge' }
  });

  doc.pipe(outputStream);

  // Register Courier font (built-in PDFKit)
  doc.font('Courier').fontSize(FONT_SIZE);

  // ── Title Page ──
  doc.moveDown(8);
  doc.font('Courier-Bold').fontSize(14)
    .text(title.toUpperCase(), { align: 'center' });
  doc.font('Courier').fontSize(FONT_SIZE);
  doc.moveDown(2);
  doc.text('Written with ScriptForge', { align: 'center' });
  doc.addPage();

  // ── Script Pages ──
  let pageNum = 1;
  let y = MARGIN_TOP;

  function checkPageBreak(neededHeight = LINE_HEIGHT * 2) {
    if (y + neededHeight > PAGE_HEIGHT - MARGIN_BOTTOM) {
      doc.addPage();
      pageNum++;
      y = MARGIN_TOP;
      // Page number header
      doc.font('Courier').fontSize(FONT_SIZE)
        .text(`${pageNum}.`, PAGE_WIDTH - MARGIN_RIGHT - 30, MARGIN_TOP - 20, { lineBreak: false });
    }
  }

  function drawBlock(type, text) {
    if (!text || text.trim() === '') {
      y += LINE_HEIGHT;
      return;
    }

    const formatted = formatText(type, text);
    const x = MARGIN_LEFT + (OFFSETS[type] || 0);
    const maxWidth = WIDTHS[type] || CONTENT_WIDTH;
    const isRightAligned = type === 'transition';
    const isBold = type === 'scene-heading';

    doc.font(isBold ? 'Courier-Bold' : 'Courier').fontSize(FONT_SIZE);

    // Measure text height (line wrapping)
    const textHeight = doc.heightOfString(formatted, { width: maxWidth });
    checkPageBreak(textHeight + LINE_HEIGHT);

    // Extra space before scene headings
    if (type === 'scene-heading') y += LINE_HEIGHT;

    doc.text(formatted, x, y, {
      width: maxWidth,
      align: isRightAligned ? 'right' : 'left',
      lineBreak: true,
      lineGap: 2
    });

    y = doc.y + (type === 'scene-heading' ? 0 : LINE_HEIGHT * 0.2);

    // Extra space after scene headings and transitions
    if (type === 'scene-heading' || type === 'transition') y += LINE_HEIGHT * 0.5;
  }

  // Render blocks
  for (let i = 0; i < blocks.length; i++) {
    const block = blocks[i];
    if (!block) continue;

    drawBlock(block.type, block.text || '');
  }

  // Add page numbers to all pages
  const range = doc.bufferedPageRange();
  for (let i = range.start + 1; i < range.count; i++) {
    doc.switchToPage(i);
    doc.font('Courier').fontSize(FONT_SIZE)
      .text(`${i}.`, PAGE_WIDTH - MARGIN_RIGHT - 30, MARGIN_TOP - 24, { lineBreak: false });
  }

  doc.end();
}

module.exports = { exportToPdf };
