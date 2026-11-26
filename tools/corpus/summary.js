/**
 * Markdown summary of a corpus run. Pure so it can be tested without the
 * private corpus.
 * @module tools/corpus/summary
 */

/**
 * Finding codes that may indicate a library defect rather than a data
 * problem, and therefore deserve investigation first.
 */
export const LIBRARY_CODES = Object.freeze([
  'runner-failed', 'round-trip', 'load-failed', 'projection-failed', 'timeline-failed',
  'decode-failed', 'demux-failed', 'video-no-frame'
]);

/**
 * @typedef {object} SummaryFinding
 * @property {'error' | 'warning' | 'info'} severity
 * @property {string} code
 * @property {string} message
 * @property {string} [reference]
 * @property {string[]} [candidates] Same-named files found elsewhere in the folder.
 */

/**
 * @typedef {object} SummaryDocument
 * @property {string} document Path relative to the corpus root.
 * @property {boolean} strictValid
 * @property {boolean} projected
 * @property {{status: string}[]} media
 * @property {SummaryFinding[]} findings
 */

/**
 * Render a corpus report as Markdown: totals, findings by category,
 * possible library issues, and per-document details.
 * @param {{generated: string, browser: string, elapsedSeconds: number, documents: SummaryDocument[]}} result
 * @returns {string}
 */
export function summarize(result) {
  const docs = result.documents;
  const media = docs.flatMap((doc) => doc.media);
  /** @type {Map<string, {severity: string, documents: Set<string>, count: number}>} */
  const codes = new Map();
  for (const doc of docs) {
    for (const finding of doc.findings) {
      const entry = codes.get(finding.code) ?? { severity: finding.severity, documents: new Set(), count: 0 };
      entry.documents.add(doc.document);
      entry.count++;
      codes.set(finding.code, entry);
    }
  }
  /** @param {string} status */
  const mediaCount = (status) => media.filter((item) => item.status === status).length;
  const lines = [
    '# IEEE 1599 corpus report', '',
    `Generated ${result.generated} with ${result.browser} in ${result.elapsedSeconds} s.`,
    'Only files referenced by `file_name` were fetched. This report names private files; do not publish it.', '',
    '## Totals', '',
    '| Measure | Count |', '| --- | ---: |',
    `| Documents | ${docs.length} |`,
    `| DTD-valid documents | ${docs.filter((doc) => doc.strictValid).length} |`,
    `| Player projection succeeded | ${docs.filter((doc) => doc.projected).length} |`,
    `| Documents without errors | ${docs.filter((doc) => !doc.findings.some((finding) => finding.severity === 'error')).length} |`,
    `| Referenced files | ${media.length} |`,
    ...['ok', 'missing', 'unresolvable', 'unsupported', 'failed', 'remote'].map((status) => `| Referenced files: ${status} | ${mediaCount(status)} |`),
    '', '## Findings by category', '',
    '| Code | Severity | Documents | Occurrences |', '| --- | --- | ---: | ---: |',
    ...[...codes].sort((a, b) => b[1].documents.size - a[1].documents.size)
      .map(([code, entry]) => `| \`${code}\` | ${entry.severity} | ${entry.documents.size} | ${entry.count} |`),
    ''
  ];
  const suspects = docs.flatMap((doc) => doc.findings.filter((finding) => LIBRARY_CODES.includes(finding.code))
    .map((finding) => `- \`${doc.document}\` — \`${finding.code}\`: ${cell(finding.message)}${finding.reference ? ` (\`${cell(finding.reference)}\`)` : ''}`));
  lines.push('## Possible library issues', '', ...(suspects.length ? suspects : ['None.']), '');
  lines.push('## Documents', '', '| Document | DTD | Projection | Files OK | Errors | Warnings |', '| --- | --- | --- | ---: | ---: | ---: |');
  for (const doc of docs) {
    const count = (/** @type {string} */ severity) => doc.findings.filter((finding) => finding.severity === severity).length;
    lines.push(`| \`${cell(doc.document)}\` | ${doc.strictValid ? 'valid' : 'invalid'} | ${doc.projected ? 'ok' : 'failed'} | `
      + `${doc.media.filter((item) => item.status === 'ok').length}/${doc.media.length} | ${count('error')} | ${count('warning')} |`);
  }
  lines.push('', '## Details', '');
  for (const doc of docs) {
    const relevant = doc.findings.filter((finding) => finding.severity !== 'info');
    if (!relevant.length) continue;
    lines.push(`### ${doc.document}`, '');
    /** @type {Map<string, {finding: SummaryFinding, references: string[]}>} */
    const groups = new Map();
    for (const finding of relevant) {
      const key = `${finding.severity}\u0000${finding.code}\u0000${finding.message}`;
      const group = groups.get(key) ?? { finding, references: [] };
      if (finding.reference) {
        const hint = finding.candidates?.length ? ` → found ${finding.candidates.map((path) => `\`${cell(path)}\``).join(', ')}` : '';
        group.references.push(`\`${cell(finding.reference)}\`${hint}`);
      }
      groups.set(key, group);
    }
    for (const { finding, references } of groups.values()) {
      const shown = references.slice(0, 5).join(', ');
      const more = references.length > 5 ? ` and ${references.length - 5} more` : '';
      lines.push(`- **${finding.severity}** \`${finding.code}\`: ${cell(finding.message)}${shown ? ` — ${shown}${more}` : ''}`);
    }
    lines.push('');
  }
  return lines.join('\n');
}

/** Keep Markdown table cells and code spans intact. @param {string} text */
function cell(text) {
  return text.replace(/\|/g, '\\|').replace(/`/g, "'").replace(/\r?\n/g, ' ');
}
