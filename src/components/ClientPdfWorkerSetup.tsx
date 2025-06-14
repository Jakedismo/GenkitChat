'use client';

import dynamic from 'next/dynamic';

// Dynamically import PdfWorkerSetup only on the client-side
const PdfWorkerSetup = dynamic(() => import('@/components/PdfWorkerSetup'), { ssr: false });

export default function ClientPdfWorkerSetup() {
  return <PdfWorkerSetup />;
}