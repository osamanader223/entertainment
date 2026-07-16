import * as React from 'react';
import { cn } from '@/lib/utils';

interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  /**
   * Poster design system (dashboard proof-of-concept only): flat fill, thick
   * black border, hard offset "print registration" shadow — no blur, no
   * soft shadow, no gradient. Every other Card usage across the app omits
   * this prop and is completely unaffected.
   */
  poster?: boolean;
}

const Card = React.forwardRef<HTMLDivElement, CardProps>(
  ({ className, poster, ...props }, ref) => (
    <div
      ref={ref}
      className={cn(
        poster
          ? 'rounded-lg border-2 border-poster-line bg-poster-paper-raised text-poster-ink shadow-[4px_4px_0_0_var(--poster-line)]'
          // Neon-arcade surface — flat gradient fill (not glass/blur), per
          // design_handoff_bolos_alley: radius 20, hairline border, subtle depth shadow.
          : 'rounded-[20px] border border-border/60 text-card-foreground shadow-lg shadow-black/30 [background:linear-gradient(160deg,#141020,#0E0B16)]',
        className
      )}
      {...props}
    />
  )
);
Card.displayName = 'Card';

const CardHeader = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div ref={ref} className={cn('flex flex-col space-y-1.5 p-6', className)} {...props} />
  )
);
CardHeader.displayName = 'CardHeader';

const CardTitle = React.forwardRef<HTMLParagraphElement, React.HTMLAttributes<HTMLHeadingElement>>(
  ({ className, ...props }, ref) => (
    <h3
      ref={ref}
      className={cn('text-2xl font-semibold leading-none tracking-tight', className)}
      {...props}
    />
  )
);
CardTitle.displayName = 'CardTitle';

const CardDescription = React.forwardRef<
  HTMLParagraphElement,
  React.HTMLAttributes<HTMLParagraphElement>
>(({ className, ...props }, ref) => (
  <p ref={ref} className={cn('text-sm text-muted-foreground', className)} {...props} />
));
CardDescription.displayName = 'CardDescription';

const CardContent = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div ref={ref} className={cn('p-6 pt-0', className)} {...props} />
  )
);
CardContent.displayName = 'CardContent';

const CardFooter = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div ref={ref} className={cn('flex items-center p-6 pt-0', className)} {...props} />
  )
);
CardFooter.displayName = 'CardFooter';

export { Card, CardHeader, CardFooter, CardTitle, CardDescription, CardContent };
