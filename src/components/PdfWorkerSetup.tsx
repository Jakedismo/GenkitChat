// src/components/PdfWorkerSetup.tsx
'use client';

import { useEffect } from 'react';
import { pdfjs } from 'react-pdf';

export default function PdfWorkerSetup() {
  useEffect(() => {
    // Use the worker from the pdfjs-dist package
    // pdfjs-dist v5.x uses .mjs for its worker
    const workerSrc = new URL('pdfjs-dist/build/pdf.worker.min.mjs', import.meta.url).toString();

    if (pdfjs.GlobalWorkerOptions.workerSrc !== workerSrc) {
      pdfjs.GlobalWorkerOptions.workerSrc = workerSrc;
      console.log('PDF.js worker source set to package worker:', workerSrc);
    } else {
      console.log('PDF.js worker source already set to package worker:', workerSrc);
    }
  }, []);

  return null;
}