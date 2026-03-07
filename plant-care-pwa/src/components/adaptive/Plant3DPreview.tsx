import { motion } from 'framer-motion';

import type { PlantCategory } from '@/types/plant';

function paletteByCategory(category: PlantCategory) {
  if (category === 'OUTDOOR_GARDEN') {
    return {
      glow: 'from-emerald-300/30 via-lime-300/10 to-transparent',
      leaf: 'bg-emerald-500/70',
      stem: 'bg-emerald-700/70'
    };
  }
  if (category === 'OUTDOOR_DECORATIVE') {
    return {
      glow: 'from-teal-300/25 via-cyan-300/10 to-transparent',
      leaf: 'bg-teal-500/70',
      stem: 'bg-teal-700/70'
    };
  }
  return {
    glow: 'from-green-300/30 via-emerald-300/10 to-transparent',
    leaf: 'bg-green-500/70',
    stem: 'bg-green-700/70'
  };
}

export function Plant3DPreview({ category }: { category: PlantCategory }) {
  const palette = paletteByCategory(category);

  return (
    <div className="relative mx-auto h-40 w-full max-w-[360px] overflow-hidden rounded-ios-card border border-ios-border/50 bg-white/40 backdrop-blur-[24px] dark:bg-zinc-900/40">
      <motion.div
        className={`absolute inset-0 bg-gradient-to-br ${palette.glow}`}
        animate={{ opacity: [0.55, 0.9, 0.55] }}
        transition={{ duration: 3, repeat: Infinity, ease: 'easeInOut' }}
      />

      <div className="absolute inset-0 flex items-center justify-center [perspective:1100px]">
        <motion.div
          className="relative h-28 w-24"
          animate={{ rotateY: [-8, 8, -8], rotateX: [5, -3, 5], y: [0, -3, 0] }}
          transition={{ duration: 4.6, repeat: Infinity, ease: 'easeInOut' }}
          style={{ transformStyle: 'preserve-3d' }}
        >
          <div className={`absolute bottom-0 left-1/2 h-12 w-1.5 -translate-x-1/2 rounded-full ${palette.stem}`} />

          <motion.div
            className={`absolute left-0 top-7 h-10 w-10 rounded-full ${palette.leaf} blur-[0.2px]`}
            animate={{ rotate: [-10, 6, -10] }}
            transition={{ duration: 2.8, repeat: Infinity, ease: 'easeInOut' }}
          />
          <motion.div
            className={`absolute right-0 top-5 h-11 w-11 rounded-full ${palette.leaf}`}
            animate={{ rotate: [10, -6, 10] }}
            transition={{ duration: 3.2, repeat: Infinity, ease: 'easeInOut' }}
          />
          <motion.div
            className={`absolute left-1/2 top-0 h-12 w-12 -translate-x-1/2 rounded-full ${palette.leaf}`}
            animate={{ scale: [0.96, 1.04, 0.96] }}
            transition={{ duration: 3, repeat: Infinity, ease: 'easeInOut' }}
          />

          <div className="absolute bottom-0 left-1/2 h-8 w-14 -translate-x-1/2 rounded-[14px] border border-ios-border/60 bg-white/70 shadow-[0_8px_18px_rgba(0,0,0,0.12)] dark:bg-zinc-800/70" />
        </motion.div>
      </div>
    </div>
  );
}
