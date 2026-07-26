'use client';

import { useEffect } from 'react';

/** Fires the browser print dialog once, right after the receipt paints. */
export function ReceiptAutoPrint() {
  useEffect(() => {
    const id = setTimeout(() => window.print(), 200);
    return () => clearTimeout(id);
  }, []);
  return null;
}
