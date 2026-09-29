'use client';

import { Moon, Sun } from 'lucide-react';
import { useTheme } from 'next-themes';
import { Button } from '@/components/ui/button';

export function ThemeToggle() {
  const { theme, setTheme } = useTheme();
  const isDark = theme === 'dark';

  return (
    <Button
      variant="ghost"
      size="icon"
      aria-label="Tema değiştir"
      onClick={() => setTheme(isDark ? 'light' : 'dark')}
      className="h-9 w-9"
      suppressHydrationWarning
    >
      <Sun className="hidden h-4 w-4 dark:block" suppressHydrationWarning />
      <Moon className="block h-4 w-4 dark:hidden" suppressHydrationWarning />
    </Button>
  );
}
