import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

/**
 * Class-name composition helper. Merges shadcn-style variant classes with
 * tailwind-merge's deduping so consumers can pass `className` overrides
 * that win over component defaults.
 */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}
