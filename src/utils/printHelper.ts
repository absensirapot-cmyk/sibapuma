/**
 * Print Utility for Isolated Document Printing with Custom Paper Size & Orientation.
 * Ensures ONLY the document area is printed, NEVER the full application or web page.
 */

export interface PrintDocumentOptions {
  title?: string;
  paperSize?: 'A4' | 'F4' | 'Legal' | 'Letter';
  orientation?: 'portrait' | 'landscape';
  margin?: 'minimal' | 'sempit' | 'normal';
}

export const PAPER_SIZE_DIMENSIONS = {
  A4: { width: '210mm', height: '297mm', label: 'A4 (210 × 297 mm)' },
  F4: { width: '215mm', height: '330mm', label: 'F4 / Folio (215 × 330 mm)' },
  Legal: { width: '216mm', height: '356mm', label: 'Legal (216 × 356 mm)' },
  Letter: { width: '216mm', height: '279mm', label: 'Letter (216 × 279 mm)' },
};

export const MARGIN_VALUES = {
  minimal: '6mm 8mm 6mm 8mm',
  sempit: '10mm 12mm 10mm 12mm',
  normal: '14mm 15mm 14mm 15mm',
};

/**
 * Prints ONLY the specified document element in complete isolation using an invisible iframe.
 * Prevents the application background, navigation, sidebar, or other tabs from ever being printed.
 */
export async function printDocumentArea(
  target: HTMLElement | string,
  options: PrintDocumentOptions = {}
): Promise<void> {
  const {
    title = 'Dokumen Resmi',
    paperSize = 'A4',
    orientation = 'portrait',
    margin = 'minimal',
  } = options;

  let sourceElement: HTMLElement | null = null;
  if (typeof target === 'string') {
    sourceElement = document.querySelector(target) as HTMLElement;
  } else {
    sourceElement = target;
  }

  if (!sourceElement) {
    console.error('Target printable element not found:', target);
    window.print();
    return;
  }

  // Determine size string for @page (explicitly swap width/height for custom mm sizes like F4 when landscape)
  const sizeValue =
    paperSize === 'F4'
      ? orientation === 'landscape'
        ? '330mm 215mm'
        : '215mm 330mm'
      : `${paperSize.toLowerCase()} ${orientation}`;
  const marginValue = MARGIN_VALUES[margin] || '6mm 8mm 6mm 8mm';

  // Gather all style elements and stylesheets from the main document
  const headStyles: string[] = [];
  document.querySelectorAll('link[rel="stylesheet"]').forEach((link) => {
    headStyles.push((link as HTMLLinkElement).outerHTML);
  });
  document.querySelectorAll('style').forEach((style) => {
    headStyles.push((style as HTMLStyleElement).outerHTML);
  });

  // Create isolated hidden iframe
  const iframe = document.createElement('iframe');
  iframe.style.position = 'fixed';
  iframe.style.right = '0';
  iframe.style.bottom = '0';
  iframe.style.width = '0';
  iframe.style.height = '0';
  iframe.style.border = '0';
  iframe.style.visibility = 'hidden';
  iframe.setAttribute('aria-hidden', 'true');
  document.body.appendChild(iframe);

  const iframeDoc = iframe.contentWindow?.document;
  if (!iframeDoc) {
    document.body.removeChild(iframe);
    window.print();
    return;
  }

  // Construct printable document HTML
  const contentHtml = sourceElement.outerHTML;

  const printCss = `
    @page {
      size: ${sizeValue};
      margin: ${marginValue};
    }
    *, *::before, *::after {
      box-sizing: border-box;
      -webkit-print-color-adjust: exact !important;
      print-color-adjust: exact !important;
    }
    html, body {
      background: #ffffff !important;
      color: #000000 !important;
      margin: 0 !important;
      padding: 0 !important;
      width: 100% !important;
      height: auto !important;
      min-height: 0 !important;
      overflow: visible !important;
      font-family: system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
    }
    .no-print, .print\\:hidden, button, input, select, textarea {
      display: none !important;
    }
    .exam-print-root {
      width: 100% !important;
      max-width: 100% !important;
      min-height: 0 !important;
      margin: 0 !important;
      padding: 0 !important;
      border: none !important;
      border-radius: 0 !important;
      box-shadow: none !important;
      background: #ffffff !important;
      color: #000000 !important;
    }
    .raport-print-card {
      page-break-after: always !important;
      break-after: page !important;
      margin: 0 !important;
      padding: 0 !important;
      border: none !important;
      box-shadow: none !important;
      background: white !important;
      color: black !important;
      width: 100% !important;
      max-width: 100% !important;
    }
    .raport-print-card:last-child {
      page-break-after: auto !important;
      break-after: auto !important;
    }
    .raport-header-group,
    .raport-identity-group,
    .raport-section-avoid,
    .raport-signature-group,
    .print-break-inside-avoid,
    .page-break-inside-avoid,
    .exam-question-item,
    .kop-surat-container,
    .ppdb-section-box,
    .signature-section {
      break-inside: avoid !important;
      page-break-inside: avoid !important;
      -webkit-column-break-inside: avoid !important;
    }
    .exam-question-item {
      display: block !important;
    }
    .page-break-before,
    .print-break-before {
      break-before: page !important;
      page-break-before: always !important;
    }
    .raport-header-group,
    .kop-surat-container,
    .exam-section-header {
      break-after: avoid !important;
      page-break-after: avoid !important;
    }
    .exam-section-header {
      column-span: all !important;
    }
    .exam-two-columns {
      column-count: 2 !important;
      column-gap: 7mm !important;
      column-rule: 0.6pt solid #cbd5e1 !important;
      column-fill: balance !important;
    }
    /* Ensure Kop Surat logo and text fit on A4/F4 without being truncated */
    .kop-surat-container * {
      overflow: visible !important;
    }
    table {
      width: 100% !important;
      border-collapse: collapse !important;
      page-break-inside: auto !important;
    }
    tr {
      break-inside: avoid !important;
      page-break-inside: avoid !important;
    }
    thead {
      display: table-header-group !important;
    }
    tfoot {
      display: table-footer-group !important;
    }
    img, svg {
      max-width: 100% !important;
    }
    /* Remove unnecessary large spacing and shadow */
    .shadow-sm, .shadow-md, .shadow-lg, .shadow-2xl, .shadow-xs {
      box-shadow: none !important;
    }
    .border-slate-200, .border-slate-300 {
      border-color: #94a3b8 !important;
    }
  `;

  iframeDoc.open();
  iframeDoc.write(`
    <!DOCTYPE html>
    <html lang="id">
      <head>
        <meta charset="utf-8" />
        <title>${title}</title>
        ${headStyles.join('\n')}
        <style>${printCss}</style>
      </head>
      <body>
        ${contentHtml}
      </body>
    </html>
  `);
  iframeDoc.close();

  // Wait for all images inside iframe to load (capped with a 750ms safety timeout to prevent hanging)
  const images = Array.from(iframeDoc.images);
  if (images.length > 0) {
    const imagesLoadedPromise = Promise.all(
      images.map(
        (img) =>
          new Promise<void>((resolve) => {
            if (img.complete) {
              resolve();
            } else {
              img.onload = () => resolve();
              img.onerror = () => resolve();
            }
          })
      )
    );
    const timeoutPromise = new Promise<void>((resolve) => setTimeout(resolve, 750));
    await Promise.race([imagesLoadedPromise, timeoutPromise]);
  }

  // Small delay to ensure styles and fonts render
  await new Promise((resolve) => setTimeout(resolve, 150));

  try {
    iframe.contentWindow?.focus();
    iframe.contentWindow?.print();
  } catch (err) {
    console.error('Iframe print error:', err);
    window.print();
  } finally {
    // Cleanup iframe after a brief delay
    setTimeout(() => {
      if (document.body.contains(iframe)) {
        document.body.removeChild(iframe);
      }
    }, 2000);
  }
}
