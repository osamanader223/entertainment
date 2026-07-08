'use client';

import { motion } from 'framer-motion';

/**
 * Decorative, non-interactive backdrop for the public big-screen venue
 * display — a few large blurred gold/dark blobs drifting slowly. Pure CSS
 * gradients animated via Framer Motion; no WebGL/3D library required.
 */
export function AmbientBackground() {
  return (
    <div className="fixed inset-0 -z-10 overflow-hidden pointer-events-none" aria-hidden>
      <motion.div
        className="absolute h-[36rem] w-[36rem] rounded-full bg-gold-500/10 blur-[120px]"
        style={{ top: '-10%', left: '-8%' }}
        animate={{ x: [0, 40, 0], y: [0, 30, 0] }}
        transition={{ duration: 22, repeat: Infinity, ease: 'easeInOut' }}
      />
      <motion.div
        className="absolute h-[30rem] w-[30rem] rounded-full bg-gold-600/10 blur-[120px]"
        style={{ bottom: '-12%', right: '-6%' }}
        animate={{ x: [0, -30, 0], y: [0, -40, 0] }}
        transition={{ duration: 26, repeat: Infinity, ease: 'easeInOut' }}
      />
      <motion.div
        className="absolute h-[24rem] w-[24rem] rounded-full bg-emerald-500/5 blur-[110px]"
        style={{ top: '30%', right: '20%' }}
        animate={{ x: [0, 25, 0], y: [0, -20, 0] }}
        transition={{ duration: 30, repeat: Infinity, ease: 'easeInOut' }}
      />
    </div>
  );
}
