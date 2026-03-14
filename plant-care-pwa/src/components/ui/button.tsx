import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';

import { cn } from '@/lib/cn';

const buttonVariants = cva(
  'touch-target android-ripple relative inline-flex items-center justify-center overflow-hidden whitespace-nowrap rounded-ios-button text-ios-body font-medium transition-all duration-200 disabled:pointer-events-none disabled:opacity-50 active:scale-[0.97] android:rounded-[18px]',
  {
    variants: {
      variant: {
        // iOS-overrides: glass + vibrancy + мягкая глубина.
        default: 'bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))] shadow-[0_10px_24px_hsl(var(--primary)/0.28)] hover:brightness-[0.98]',
        ghost: 'border border-[hsl(var(--border)/0.55)] bg-[hsl(var(--secondary)/0.4)] text-[hsl(var(--foreground))] backdrop-blur-[24px] hover:bg-[hsl(var(--secondary)/0.62)]',
        secondary: 'border border-[hsl(var(--border)/0.55)] bg-[hsl(var(--secondary)/0.82)] text-[hsl(var(--secondary-foreground))] shadow-[0_4px_24px_rgb(0_0_0/0.08)] backdrop-blur-[24px] hover:bg-[hsl(var(--secondary)/0.96)]',
        destructive: 'bg-[hsl(var(--destructive))] text-[hsl(var(--destructive-foreground))] shadow-[0_10px_24px_hsl(var(--destructive)/0.28)] hover:brightness-[0.98]'
      },
      size: {
        default: 'h-12 px-5',
        sm: 'h-11 px-4 text-sm',
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
    return (
      <button
        ref={ref}
        className={cn(buttonVariants({ variant, size, className }))}
        {...props}
      />
    );
  }
);
Button.displayName = 'Button';

export { Button, buttonVariants };
