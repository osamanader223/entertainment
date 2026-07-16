import * as React from 'react';
import { Slot } from '@radix-ui/react-slot';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

const buttonVariants = cva(
  'inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50',
  {
    variants: {
      variant: {
        default: 'bg-primary text-primary-foreground hover:bg-primary/90',
        gold: 'bg-gold-500 text-black hover:bg-gold-400 shadow-lg shadow-gold-500/20',
        destructive:
          'bg-destructive text-destructive-foreground hover:bg-destructive/90',
        outline:
          'border border-input bg-background hover:bg-accent hover:text-accent-foreground',
        secondary:
          'bg-secondary text-secondary-foreground hover:bg-secondary/80',
        ghost: 'hover:bg-accent hover:text-accent-foreground',
        link: 'text-primary underline-offset-4 hover:underline',
        // Poster design system (dashboard proof-of-concept only). Hard
        // offset "print registration" shadow that tightens and shifts the
        // button toward the paper on press/hover — flat fills, no gradients.
        posterPrimary:
          'rounded-lg border-2 border-poster-line bg-poster-primary text-poster-primary-ink font-poster-display uppercase tracking-wide ' +
          'shadow-[3px_3px_0_0_var(--poster-line)] transition-all duration-150 ' +
          'hover:translate-x-px hover:translate-y-px hover:shadow-[2px_2px_0_0_var(--poster-line)] ' +
          'active:translate-x-[3px] active:translate-y-[3px] active:shadow-none',
        posterSecondary:
          'rounded-lg border-2 border-poster-line bg-poster-secondary text-poster-primary-ink font-poster-display uppercase tracking-wide ' +
          'shadow-[3px_3px_0_0_var(--poster-line)] transition-all duration-150 ' +
          'hover:translate-x-px hover:translate-y-px hover:shadow-[2px_2px_0_0_var(--poster-line)] ' +
          'active:translate-x-[3px] active:translate-y-[3px] active:shadow-none',
        posterOutline:
          'rounded-lg border-2 border-poster-line bg-poster-paper text-poster-ink font-poster-sans font-semibold ' +
          'shadow-[3px_3px_0_0_var(--poster-line)] transition-all duration-150 ' +
          'hover:translate-x-px hover:translate-y-px hover:shadow-[2px_2px_0_0_var(--poster-line)] ' +
          'active:translate-x-[3px] active:translate-y-[3px] active:shadow-none',
        posterGhost:
          'rounded-lg text-poster-ink font-poster-sans font-semibold hover:bg-poster-line/10',
      },
      size: {
        default: 'h-10 px-4 py-2',
        sm: 'h-9 rounded-md px-3',
        lg: 'h-11 rounded-md px-8',
        xl: 'h-14 rounded-lg px-10 text-base',
        icon: 'h-10 w-10',
      },
    },
    defaultVariants: { variant: 'default', size: 'default' },
  }
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : 'button';
    return (
      <Comp
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        {...props}
      />
    );
  }
);
Button.displayName = 'Button';

export { Button, buttonVariants };
