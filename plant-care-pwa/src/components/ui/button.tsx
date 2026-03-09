import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';

import { cn } from '@/lib/cn';

const buttonVariants = cva(
  'touch-target android-ripple relative inline-flex items-center justify-center overflow-hidden whitespace-nowrap rounded-ios-button text-ios-body font-medium transition-all duration-200 disabled:pointer-events-none disabled:opacity-50 active:scale-[0.97] android:rounded-[18px]',
  {
    variants: {
      variant: {
        // iOS-overrides: glass + vibrancy + мягкая глубина.
        default: 'ios:bg-ios-accent ios:text-white ios:shadow-ios ios:hover:brightness-95 android:bg-[#4CAF50] android:text-white android:shadow-[0_2px_8px_rgba(76,175,80,0.35)] android:hover:brightness-95',
        ghost: 'ios:bg-white/35 ios:text-ios-text ios:backdrop-blur-[24px] ios:border ios:border-white/35 android:bg-transparent android:text-ios-text android:border android:border-ios-border/70',
        secondary: 'ios:bg-ios-card/55 ios:text-ios-text ios:border ios:border-ios-border/50 ios:backdrop-blur-[26px] ios:shadow-[0_4px_24px_rgba(0,0,0,0.08)] android:bg-[#E8F5E9] android:text-[#1B5E20] android:border android:border-[#C8E6C9] android:shadow-[0_1px_3px_rgba(0,0,0,0.15)]',
        destructive: 'ios:bg-rose-500 ios:text-white ios:shadow-[0_10px_24px_rgba(244,63,94,0.24)] android:bg-[#D32F2F] android:text-white android:shadow-[0_2px_8px_rgba(211,47,47,0.35)]'
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
