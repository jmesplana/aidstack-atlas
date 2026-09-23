// Shared by the on-screen paper preview and standalone HTML/PDF. All selectors
// are scoped so report typography never changes the application shell.
export const SITREP_CSS = `
.sitrep{box-sizing:border-box;background:#fff;color:#202932;font:10pt/1.32 Arial,sans-serif;max-width:210mm;margin:0 auto;padding:15mm;overflow-wrap:anywhere}
.sitrep *{box-sizing:border-box}.sitrep h1{font-size:18pt;line-height:1.15;color:#bb202b;margin:6pt 0}
.sitrep h2{font-size:12pt;color:#bb202b;border-bottom:1.5pt solid #d33742;padding:0 0 5pt;margin:14pt 0 7pt;break-after:avoid}
.sitrep h3{font-size:10.5pt;color:#214f70;margin:10pt 0 6pt;break-after:avoid}.sitrep h4{font-size:11pt;margin:10pt 0 5pt;break-after:avoid}
.sitrep p{margin:5pt 0;orphans:3;widows:3}.sitrep small,.sitrep figcaption{display:block;color:#52616d;font-size:8pt;line-height:1.3;margin:4pt 0}
.sitrep a{color:#214f70;text-decoration:underline}.sitrep ul,.sitrep ol{padding-left:18pt}.sitrep li{margin:5pt 0;break-inside:avoid}
.sitrep .report-kicker{display:flex;justify-content:space-between;gap:12pt;color:#214f70;font-size:9pt;font-weight:bold}
.sitrep .report-subtitle{font-weight:bold;border-bottom:1.5pt solid #bb202b;padding-bottom:6pt}
.sitrep .report-meta{font-size:9pt;color:#52616d}.sitrep .report-summary{background:#fcf0f0;border-left:3pt solid #bb202b;padding:8pt 10pt;margin:9pt 0;break-inside:avoid}
.sitrep .report-summary h2{margin:0;border:0;padding:0;font-size:12pt}.sitrep .report-summary p{margin-bottom:0}
.sitrep .report-metrics{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:0;margin:9pt 0 4pt;border-top:1.5pt solid #214f70;border-bottom:1pt solid #d6e0e6}
.sitrep .report-metrics article{padding:6pt 7pt;border-right:1pt solid #d6e0e6;break-inside:avoid}.sitrep .report-metrics article:last-child{border-right:0}
.sitrep .report-metrics span{display:block;font-size:8pt;line-height:1.2;min-height:2.4em}.sitrep .report-metrics strong{display:block;font-size:16pt;line-height:1.1;color:#214f70;margin:3pt 0}.sitrep .report-metrics small{font-size:7.5pt;margin:0}.sitrep .report-priorities{font-size:9pt;margin:6pt 0 0;padding-left:13pt}.sitrep .report-priorities li{margin:4pt 0}
.sitrep table{border-collapse:collapse;width:100%;font-size:9pt;table-layout:fixed;margin:9pt 0;break-inside:auto}.sitrep caption{text-align:left;color:#52616d;font-size:8.5pt;margin:5pt 0}
.sitrep th,.sitrep td{padding:4pt;text-align:left;vertical-align:top;border-bottom:1pt solid #dce3e9;overflow-wrap:anywhere}
.sitrep th{background:#214f70;color:#fff;font-weight:bold}.sitrep tbody tr:nth-child(even){background:#f3f5f7}.sitrep thead{display:table-header-group}.sitrep tr{break-inside:avoid}
.sitrep figure{margin:9pt 0;break-inside:avoid}.sitrep .report-weekly svg{max-height:62mm}.sitrep svg{display:block;width:100%;height:auto;max-height:115mm;min-width:0!important;break-inside:avoid}
.sitrep .report-note{padding:6pt 8pt;background:#f3f5f7;font-size:9pt}.sitrep .report-unavailable{color:#52616d;font-style:italic;font-size:10pt}
.sitrep .report-horizon-legend{display:flex;flex-wrap:wrap;gap:12px;font-size:8pt;margin:10px 0 15px}.sitrep .report-horizon-scroll{overflow-x:auto;max-width:100%}.sitrep .report-horizon svg{max-height:none}.sitrep .report-horizon-detail{font-size:8pt;min-height:2.6em;background:#f3f5f7;padding:6px}.sitrep .report-horizon [tabindex]:focus{outline:2px solid #214f70;outline-offset:-2px}
@media(max-width:700px){.sitrep .report-horizon svg{width:900px;max-width:none}}
@media print{.sitrep .report-horizon-scroll{overflow:visible}.sitrep .report-horizon svg{width:100%;max-width:100%}.sitrep .report-horizon-detail{display:none}}
.sitrep .report-text{white-space:pre-wrap}.sitrep .report-sources p{font-size:8.5pt}.sitrep .report-footer{margin-top:18pt;border-top:1pt solid #d6e0e6;padding-top:8pt;font-size:8.5pt;color:#52616d}
.sitrep button,.sitrep label,.sitrep [data-print-hide],.sitrep .outbreak-print-hidden{display:none!important}
.sitrep [class*="tableWrap"],.sitrep [class*="chartViewport"]{max-height:none!important;overflow:visible!important}
.sitrep [class*="panel"],.sitrep [class*="chartCard"]{margin:9pt 0;padding:0;border:0;background:transparent;border-radius:0}
.sitrep [class*="chartGrid"]{display:block}.sitrep [class*="printOnly"]{display:inline!important}
.sitrep details{display:block}.sitrep summary{font-size:11pt;font-weight:bold;margin-top:12pt;list-style:none}
@media(max-width:700px){.sitrep{padding:18px;width:100%;font-size:10pt}.sitrep .report-metrics{grid-template-columns:repeat(2,minmax(0,1fr))}.sitrep table{font-size:8pt}.sitrep th,.sitrep td{padding:4pt}}
@media print{.sitrep{max-width:none;width:auto;padding:0;margin:0;font-size:9.5pt;print-color-adjust:exact;-webkit-print-color-adjust:exact}.sitrep .report-metrics{grid-template-columns:repeat(5,minmax(0,1fr))}.sitrep table{font-size:9pt}.sitrep th,.sitrep td{padding:4pt}.sitrep .report-section{break-before:auto}.sitrep .report-section>h2+p{break-after:avoid}.sitrep table+small{break-before:avoid}.sitrep h2{margin-top:14pt}.sitrep .report-annex{break-before:page}}
@page{size:A4;margin:17mm 15mm 18mm;@top-left{content:"OUTBREAK SITUATION REPORT";font:8pt Arial;color:#52616d}@bottom-right{content:"Page " counter(page) " of " counter(pages);font:8pt Arial;color:#52616d}}
`;

const escape = value => String(value).replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));

export function sitrepHTML(element) {
  if (!element) throw new Error('Open the Sitrep preview before exporting.');
  const copy = element.cloneNode(true);
  copy.querySelectorAll('button,label,[data-print-hide],.outbreak-print-hidden,style').forEach(node => node.remove());
  copy.querySelectorAll('details').forEach(node => node.setAttribute('open',''));
  const title = copy.querySelector('h1')?.textContent || 'Outbreak situation report';
  const week = copy.dataset.week || '';
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escape(title)}</title><style>body{margin:0;background:white}${SITREP_CSS}@page{@top-right{content:"${week.replace(/[^a-zA-Z0-9-]/g,'')}";font:8pt Arial;color:#214f70}}</style></head><body>${copy.outerHTML}</body></html>`;
}

// Generate the text export from the same reviewed report, preserving its order,
// tables and source links. SVGs have a named placeholder instead of raw markup.
export function sitrepMarkdown(element) {
  function walk(node) {
    if (node.nodeType === 3) return node.textContent;
    if (node.nodeType !== 1 || node.matches('style,button,label,[data-print-hide],.outbreak-print-hidden')) return '';
    if (node.tagName.toUpperCase() === 'SVG') return `\n\n[Figure: ${node.getAttribute('aria-label') || node.querySelector('title')?.textContent || 'See HTML/PDF report'}]\n\n`;
    if (node.tagName === 'BR') return '\n';
    if (node.classList.contains('report-kicker')) return [...node.children].map(child=>child.textContent).join(' · ')+'\n\n';
    if (node.tagName === 'TABLE') {
      const rows = [...node.querySelectorAll('tr')].map(row => '| ' + [...row.cells].map(cell => (cell.innerText || cell.textContent).trim().replace(/\|/g,'\\|').replace(/\s+/g,' ')).join(' | ') + ' |');
      if (rows.length) rows.splice(1,0,'| ' + [...node.querySelector('tr').cells].map(()=>'---').join(' | ') + ' |');
      return `\n\n${node.querySelector('caption')?.textContent || ''}\n${rows.join('\n')}\n\n`;
    }
    const text = [...node.childNodes].map(walk).join('');
    if (node.tagName === 'SPAN' && node.closest('.report-metrics')) return `${text}\n\n`;
    if (/^H[1-6]$/.test(node.tagName)) return `\n\n${'#'.repeat(Number(node.tagName[1]))} ${text}\n\n`;
    if (node.tagName === 'A') return `[${text}](${node.getAttribute('href')})`;
    if (node.tagName === 'LI') return `\n- ${text.trim()}\n`;
    if (['P','DIV','SECTION','ARTICLE','HEADER','FOOTER','SMALL','FIGCAPTION'].includes(node.tagName)) return `\n\n${text}\n\n`;
    if (node.tagName === 'STRONG') return `**${text}**`;
    return text;
  }
  return walk(element).replace(/\n[ \t]+/g,'\n').replace(/\n{3,}/g,'\n\n').trim() + '\n';
}
