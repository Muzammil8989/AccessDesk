import { clsx, type ClassValue } from 'clsx';
import { extendTailwindMerge } from 'tailwind-merge';

/** The M3 type scale tokens from styles.css, so `text-title-medium` counts as a font size, not a colour. */
const TYPE_SCALE = [
  'headline-small',
  'title-large',
  'title-medium',
  'title-small',
  'body-large',
  'body-medium',
  'body-small',
  'label-large',
  'label-medium',
  'label-small',
];

const twMerge = extendTailwindMerge({
  extend: {
    classGroups: {
      'font-size': [{ text: TYPE_SCALE }],
      shadow: [{ shadow: ['elevation-1', 'elevation-2', 'elevation-3'] }],
    },
  },
});

export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}
