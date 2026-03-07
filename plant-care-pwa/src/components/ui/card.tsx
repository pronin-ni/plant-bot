import * as React from 'react';

import { cn } from '@/lib/cn';

export function Card({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        'rounded-ios-card border border-ios-border/55 bg-ios-card/60 backdrop-blur-[26px] shadow-[0_8px_30px_rgba(0,0,0,0.10)] android:rounded-[20px] android:bg-[#FFFBFE] android:backdrop-blur-none android:border-[#E7E0EC] android:shadow-[0_1px_3px_rgba(0,0,0,0.16),0_1px_2px_rgba(0,0,0,0.10)]',
        className
      )}
      {...props}
    />
  );
}

export function CardHeader({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('space-y-1.5 p-5', className)} {...props} />;
}

export function CardTitle({ className, ...props }: React.HTMLAttributes<HTMLHeadingElement>) {
  return <h3 className={cn('text-ios-title-2 font-semibold tracking-tight', className)} {...props} />;
}

export function CardDescription({ className, ...props }: React.HTMLAttributes<HTMLParagraphElement>) {
  return <p className={cn('text-ios-caption text-ios-subtext', className)} {...props} />;
}

export function CardContent({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('px-5 pb-5 pt-0', className)} {...props} />;
}

export function CardFooter({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('flex items-center px-5 pb-5 pt-0', className)} {...props} />;
}
