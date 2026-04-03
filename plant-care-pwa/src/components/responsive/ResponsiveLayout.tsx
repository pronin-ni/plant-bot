import type { ReactNode } from 'react';

type LayoutType = 'narrow' | 'standard' | 'split' | 'list';

interface ResponsiveLayoutProps {
  type: LayoutType;
  children: ReactNode;
  className?: string;
}

const layoutConfigs: Record<LayoutType, { mobile: string; tablet: string; wide: string }> = {
  narrow: {
    mobile: 'max-w-sm',
    tablet: 'md:max-w-md',
    wide: 'lg:max-w-lg'
  },
  standard: {
    mobile: 'max-w-full',
    tablet: 'md:max-w-3xl',
    wide: 'lg:max-w-4xl'
  },
  split: {
    mobile: 'max-w-full',
    tablet: 'md:max-w-4xl',
    wide: 'lg:max-w-5xl'
  },
  list: {
    mobile: 'max-w-full',
    tablet: 'md:max-w-3xl',
    wide: 'lg:max-w-4xl'
  }
};

export function ResponsiveLayout({ type, children, className = '' }: ResponsiveLayoutProps) {
  const config = layoutConfigs[type];
  
  return (
    <div className={`mx-auto w-full px-4 md:px-6 lg:px-8 ${config.mobile} ${config.tablet} ${config.wide} ${className}`}>
      {children}
    </div>
  );
}

export function useResponsiveContainer(type: LayoutType) {
  const config = layoutConfigs[type];
  return `${config.mobile} ${config.tablet} ${config.wide}`;
}

export const breakpoints = {
  mobile: 'max-w-full',
  tablet: 'md:max-w-3xl',
  wide: 'lg:max-w-4xl',
  ultra: 'xl:max-w-6xl'
} as const;

export { layoutConfigs };
