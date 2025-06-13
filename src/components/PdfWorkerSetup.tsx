'use client';

import { useEffect } from 'react';
import { pdfjs } from 'react-pdf';

// This component sets up the PDF.js worker for react-pdf on the client side.
// It uses a local copy of the worker file hosted in the '/public' directory.

export default function PdfWorkerSetup() {
  useEffect(() => {
    // Use local version of PDF.js worker to avoid CDN dependencies
    // The worker file has been copied to the public directory during build
    const workerSrc = '/pdf.worker.min.mjs';

    // Check if the worker source is already set to avoid re-setting it unnecessarily
    if (pdfjs.GlobalWorkerOptions.workerSrc !== workerSrc) {
      pdfjs.GlobalWorkerOptions.workerSrc = workerSrc;
      console.log('PDF.js worker source successfully set to local file:', workerSrc);
    }
  }, []); // Runs once on component mount

  return null; // This component does not render any UI.
}