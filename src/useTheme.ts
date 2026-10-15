import { useEffect } from 'react';
export function useTheme(preference: 'Light' | 'Dark' | 'System') {
  useEffect(() => {
    const media = window.matchMedia('(prefers-color-scheme: dark)');
    const apply = () => {
      const dark = preference === 'Dark' || (preference === 'System' && media.matches);
      document.documentElement.dataset.theme = dark ? 'dark' : 'light';
      document.documentElement.style.colorScheme = dark ? 'dark' : 'light';
      // Appearance can still change when a browser blocks persistent device storage.
      try {
        localStorage.setItem('applicator.theme', preference);
      } catch {}
    };
    apply();
    media.addEventListener('change', apply);
    return () => media.removeEventListener('change', apply);
  }, [preference]);
}
