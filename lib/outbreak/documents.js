import { validDate } from './data.js';

export const MAX_DOCUMENT_TEXT = 200000;
export const MAX_DOCUMENT_BYTES = 20 * 1024 * 1024;

function xml(text) {
  const doc = new DOMParser().parseFromString(text, 'application/xml');
  if (doc.getElementsByTagName('parsererror').length) throw new Error('The document contains invalid XML.');
  return doc;
}
const elements = (node, name) => Array.from(node.getElementsByTagNameNS('*', name));
function paragraphs(doc) {
  return elements(doc, 'p').map(p => {
    const walk = node => Array.from(node.childNodes).map(child => {
      if (child.localName === 't') return child.textContent;
      if (child.localName === 'tab') return '\t';
      if (['br', 'cr'].includes(child.localName)) return '\n';
      return walk(child);
    }).join('');
    return walk(p);
  }).join('\n');
}

// Extraction runs locally. Only text is read; macros and embedded objects are ignored.
export async function extractRcceDocument(name, bytes) {
  if (bytes.byteLength > MAX_DOCUMENT_BYTES) throw new Error('Maximum upload size is 20 MB.');
  let text = '';
  if (/\.txt$/i.test(name)) text = new TextDecoder().decode(bytes);
  else if (/\.pdf$/i.test(name)) {
    const {extractPdfTextInBrowser} = await import('../clientPdfText.js');
    const result = await extractPdfTextInBrowser(bytes.slice(0), {maxPages:80, maxCharacters:MAX_DOCUMENT_TEXT, includePageNumbers:true, preserveLineBreaks:true});
    if (result.truncatedPages) throw new Error('PDFs may contain up to 80 pages. Split the report before importing.');
    text = result.text.replace(/[ \t]+/g, ' ').replace(/ *\n */g, '\n');
  }
  else if (/\.xlsx?$/i.test(name)) {
    const XLSX = await import('xlsx');
    const book = XLSX.read(bytes, {type:'array', cellDates:true, sheetRows:10001});
    const parts = [];
    for (const name of book.SheetNames) {
      const sheet = book.Sheets[name];
      if (sheet['!fullref']) throw new Error('A worksheet exceeds 10,000 rows. Split the workbook before importing.');
      const rows = XLSX.utils.sheet_to_json(sheet, {header:1, raw:false, defval:'', blankrows:false});
      parts.push(`Worksheet: ${name}\n${rows.map(row => row.join('\t')).join('\n')}`);
    }
    text = parts.join('\n\n');
    if (!book.SheetNames.some(name => XLSX.utils.sheet_to_json(book.Sheets[name], {header:1, blankrows:false}).length)) text = '';
  } else if (/\.(docx|pptx)$/i.test(name)) {
    const {default:JSZip} = await import('jszip');
    const zip = await JSZip.loadAsync(bytes);
    const entries = Object.values(zip.files);
    if (entries.length > 5000 || entries.reduce((sum, entry) => sum + (entry._data?.uncompressedSize || 0), 0) > 50 * 1024 * 1024) throw new Error('The expanded document is too large. Split it before importing.');
    const read = async path => {
      const entry = zip.file(path);
      if (!entry) throw new Error('The Office document is missing required content. Save it again and retry.');
      return xml(await entry.async('string'));
    };
    if (/\.docx$/i.test(name)) text = paragraphs(await read('word/document.xml'));
    else {
      const presentation = await read('ppt/presentation.xml');
      const rels = elements(await read('ppt/_rels/presentation.xml.rels'), 'Relationship');
      const slides = [];
      // PowerPoint sections also contain sldId elements; only the main list
      // defines the deck order and has relationships to the slide files.
      const slideList = Array.from(presentation.documentElement.children).find(node => node.localName === 'sldIdLst');
      for (const slide of Array.from(slideList?.children || []).filter(node => node.localName === 'sldId')) {
        const id = Array.from(slide.attributes).find(attr => attr.localName === 'id' && attr.namespaceURI)?.value;
        const rel = rels.find(rel => rel.getAttribute('Id') === id && rel.getAttribute('TargetMode') !== 'External');
        const target = rel?.getAttribute('Target') || '';
        const path = target.startsWith('/') ? target.slice(1) : `ppt/${target.replace(/^\.\//, '')}`;
        if (!/^ppt\/slides\/slide[^/]+\.xml$/.test(path)) throw new Error('The presentation has an unsupported slide reference.');
        slides.push(paragraphs(await read(path)));
        if (slides.join('').length > MAX_DOCUMENT_TEXT) throw new Error('Extracted text exceeds 200,000 characters. Split the document before importing.');
      }
      text = slides.some(s => s.trim()) ? slides.map((s, i) => `Slide ${i + 1}\n${s}`).join('\n\n') : '';
    }
  } else throw new Error('Choose PDF, DOCX, PPTX, XLSX, XLS or TXT. Save older Word/PPT files as DOCX/PPTX first.');
  text = text.replace(/\u0000/g, '').trim();
  if (!text) throw new Error('No readable text found. Images and scanned text need transcription first.');
  if (text.length > MAX_DOCUMENT_TEXT) throw new Error('Extracted text exceeds 200,000 characters. Split the document before importing.');
  return text;
}

export function rcceDocumentErrors(document) {
  const errors={};
  if (!document.text?.trim() || document.text.length > MAX_DOCUMENT_TEXT) errors.text='Readable document text is required (up to 200,000 characters).';
  if (!validDate(document.date) && !(document.date === '' && document.findings?.length)) errors.date='Enter a valid reporting date.';
  for (const [key, limit] of [['title',200],['source',200],['location',200],['summary',4000]]) {
    const label={title:'a report title',source:'the source / reporting organization',location:'the location / scope',summary:'a summary for the briefing'}[key];
    if (!document[key]?.trim() || document[key].length > limit) errors[key]=`Enter ${label} (up to ${limit} characters).`;
  }
  return errors;
}

export function validateRcceDocument(document) {
  const errors=rcceDocumentErrors(document);
  if(Object.keys(errors).length)throw new Error(Object.values(errors)[0]);
  return document;
}

export function rcceAtCutoff(documents, asOf) {
  return documents.filter(document => validDate(document.date) && document.date <= asOf);
}
