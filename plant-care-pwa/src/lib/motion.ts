import { useEffect, useState } from 'react';
import { useReducedMotion } from 'framer-motion';

export function useMotionGuard() {
  const prefersReducedMotion = useReducedMotion();
  const [isVisible, setIsVisible] = useState(() => !document.hidden);

  useEffect(() => {
    const onVisibility = () => {
      setIsVisible(!document.hidden);
    };

    document.addEventListener('visibilitychange', onVisibility, { passive: true });
    return () => {
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, []);

  const reduceMotion = Boolean(prefersReducedMotion) || !isVisible;
  return {
    isVisible,
    reduceMotion,
    canAnimate: !reduceMotion
  };
}

