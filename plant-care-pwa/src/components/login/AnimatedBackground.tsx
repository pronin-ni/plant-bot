import { motion } from 'framer-motion';

export function AnimatedBackground() {
  return (
    <div className="pointer-events-none fixed inset-0 -z-10 overflow-hidden">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_20%_15%,rgba(52,199,89,0.24),transparent_40%),radial-gradient(circle_at_80%_10%,rgba(96,165,250,0.22),transparent_42%),radial-gradient(circle_at_50%_85%,rgba(34,197,94,0.16),transparent_52%),linear-gradient(180deg,#0f1418_0%,#101a14_45%,#0e1511_100%)] dark:bg-[radial-gradient(circle_at_20%_15%,rgba(52,199,89,0.26),transparent_40%),radial-gradient(circle_at_80%_10%,rgba(96,165,250,0.20),transparent_42%),radial-gradient(circle_at_50%_85%,rgba(34,197,94,0.20),transparent_52%),linear-gradient(180deg,#090c10_0%,#0b120f_45%,#090f0c_100%)]" />

      <motion.div
        className="absolute -left-10 top-[16%] h-44 w-44 rounded-full bg-emerald-400/20 blur-3xl"
        animate={{ x: [0, 24, -8, 0], y: [0, -14, 10, 0] }}
        transition={{ duration: 14, repeat: Infinity, ease: 'easeInOut' }}
      />
      <motion.div
        className="absolute right-[-18px] top-[10%] h-40 w-40 rounded-full bg-sky-400/20 blur-3xl"
        animate={{ x: [0, -18, 8, 0], y: [0, 12, -10, 0] }}
        transition={{ duration: 16, repeat: Infinity, ease: 'easeInOut' }}
      />
      <motion.div
        className="absolute left-[20%] bottom-[8%] h-48 w-48 rounded-full bg-lime-400/18 blur-3xl"
        animate={{ x: [0, -20, 14, 0], y: [0, 14, -8, 0] }}
        transition={{ duration: 18, repeat: Infinity, ease: 'easeInOut' }}
      />

      {[0, 1, 2, 3].map((index) => (
        <motion.span
          key={index}
          className="absolute h-16 w-7 rounded-[100%_60%_100%_60%] border border-emerald-300/25 bg-emerald-400/8"
          style={{
            left: `${12 + index * 22}%`,
            top: `${48 + (index % 2) * 10}%`,
            transform: `rotate(${index % 2 === 0 ? -12 : 14}deg)`
          }}
          animate={{ y: [0, -8, 0], rotate: [index % 2 === 0 ? -12 : 14, index % 2 === 0 ? -6 : 20, index % 2 === 0 ? -12 : 14] }}
          transition={{ duration: 4.8 + index * 0.7, repeat: Infinity, ease: 'easeInOut' }}
        />
      ))}
    </div>
  );
}
