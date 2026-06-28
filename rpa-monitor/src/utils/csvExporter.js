/**
 * csvExporter.js
 * Handles client-side, non-blocking CSV compilation using an inline Web Worker.
 * Fits 100% within client-side constraints (no server side processing).
 */

const workerCode = `
self.onmessage = function(e) {
  const { rows, headers } = e.data;
  const total = rows.length;
  
  let csv = headers.join(',') + '\\n';
  
  for (let i = 0; i < total; i++) {
    const row = rows[i];
    const line = headers.map(h => {
      let val = String(row[h] ?? '');
      // Escape double quotes
      if (val.includes('"')) {
        val = val.replace(/"/g, '""');
      }
      // Wrap in double quotes if there are commas, newlines, or quotes
      if (val.includes(',') || val.includes('\\n') || val.includes('"')) {
        val = '"' + val + '"';
      }
      return val;
    }).join(',');
    
    csv += line + '\\n';
    
    // Post progress updates for visual feedback
    if (i % 2500 === 0 || i === total - 1) {
      self.postMessage({ type: 'progress', progress: Math.round((i / total) * 100) });
    }
  }
  
  self.postMessage({ type: 'complete', csvString: csv });
};
`;

/**
 * Triggers background CSV compilation and schedules browser download.
 *
 * @param {Array<Object>} rows       Data array
 * @param {Array<string>} headers    Column keys to export
 * @param {Function}      onProgress Callback for progress percentage updates
 * @param {Function}      onComplete Callback when finished
 */
export function exportCsvInBackground(rows, headers, onProgress, onComplete) {
  const blob = new Blob([workerCode], { type: 'application/javascript' });
  const workerUrl = URL.createObjectURL(blob);
  const worker = new Worker(workerUrl);

  worker.onmessage = function(e) {
    const { type, progress, csvString } = e.data;
    if (type === 'progress') {
      if (onProgress) onProgress(progress);
    } else if (type === 'complete') {
      const csvBlob = new Blob([csvString], { type: 'text/csv;charset=utf-8;' });
      if (onComplete) onComplete(csvBlob);
      worker.terminate();
      URL.revokeObjectURL(workerUrl);
    }
  };

  worker.postMessage({ rows, headers });
}
