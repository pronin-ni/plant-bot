import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';

import { cn } from '@/lib/cn';

const buttonVariants = cva(
  'inline-flex items-center justify-center whitespace-nowrap rounded-ios-button text-ios-body font-medium transition-transform duration-150 disabled:pointer-events-none disabled:opacity-50 active:scale-[0.98]',
  {
    variants: {
      variant: {
        default: 'bg-ios-accent text-white shadow-ios hover:brightness-95',
        ghost: 'bg-white/40 text-ios-text backdrop-blur-ios',
        secondary: 'bg-ios-card/80 text-ios-text border border-ios-border/60 backdrop-blur-ios'
      },
      size: {
        default: 'h-12 px-5',
        sm: 'h-10 px-4 text-sm',
        lg: 'h-14 px-6 text-lg'
      }
    },
    defaultVariants: {
      variant: 'default',
      size: 'default'
    }
  }
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, ...props }, ref) => {
    return <button className={cn(buttonVariants({ variant, size, className }))} ref={ref} {...props} />;
  }
);
Button.displayName = 'Button';

export { Button, buttonVariants };
