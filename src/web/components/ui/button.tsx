import * as React from 'react';
import { Slot } from '@radix-ui/react-slot';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '../../lib/utils';

const buttonVariants = cva(
  'inline-flex items-center justify-center whitespace-nowrap rounded-xl text-sm font-medium transition-colors focus-visible:outline-none disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-40',
  {
    variants: {
      variant: {
        // Primary: solid blue fill, dark text
        default: 'bg-primary text-primary-foreground hover:bg-primary/90',
        // Destructive: dark red glass
        destructive:
          'bg-[rgba(127,29,29,0.20)] text-[rgba(254,202,202,0.92)] border border-[rgba(248,113,113,0.36)] hover:bg-[rgba(127,29,29,0.30)] hover:border-[rgba(248,113,113,0.52)]',
        // Outline: blue border, blue text, subtle hover fill
        outline:
          'border border-primary/[0.4] text-primary hover:bg-primary/[0.08]',
        // Secondary: ghost glass with white border
        secondary:
          'bg-accent border border-border text-muted-foreground hover:bg-accent hover:text-muted-foreground hover:border-border',
        // Ghost: text only, subtle hover
        ghost: 'text-muted-foreground hover:text-muted-foreground hover:bg-accent',
        // Link: blue text underline
        link: 'text-primary underline-offset-4 hover:brightness-110 hover:underline',
      },
      size: {
        default: 'h-9 px-4 py-2',
        sm: 'h-8 rounded-lg px-3 text-xs',
        lg: 'h-10 px-6',
        icon: 'h-9 w-9 rounded-lg',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'default',
    },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : 'button';
    return <Comp className={cn(buttonVariants({ variant, size, className }))} ref={ref} {...props} />;
  },
);
Button.displayName = 'Button';

export { Button, buttonVariants };
