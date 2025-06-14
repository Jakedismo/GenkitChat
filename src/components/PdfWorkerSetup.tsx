// src/components/PdfWorkerSetup.tsx
'use client';

import { useEffect } from 'react';

export default function PdfWorkerSetup() {
  useEffect(() => {
    const setupPdfWorker = async () => {
      try {
        const { pdfjs } = await import('react-pdf');
        const workerSrc = new URL('pdfjs-dist/build/pdf.worker.min.mjs', import.meta.url).toString();
        
        if (pdfjs.GlobalWorkerOptions.workerSrc !== workerSrc) {
          pdfjs.GlobalWorkerOptions.workerSrc = workerSrc;
          console.log('PDF.js worker source set to package worker:', workerSrc);
        }
      } catch (error) {
        console.error("Failed to load or configure PDF.js worker:", error);
      }
    };

    setupPdfWorker();
  }, []);

  return null;
}