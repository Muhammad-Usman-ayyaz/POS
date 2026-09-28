import React from 'react';
import { useTheme } from 'next-themes';

const OPTIONS: { value: 'light' | 'dark' | 'system'; label: string; icon: string }[] = [
  { value: 'light', label: 'Light', icon: 'light_mode' },
  { value: 'dark', label: 'Dark', icon: 'dark_mode' },
  { value: 'system', label: 'System', icon: 'desktop_windows' },
];

export const ThemeToggle: React.FC = () => {
  const { theme, setTheme } = useTheme();

  return (
    <div className="flex items-center bg-surface-container-low p-1 rounded-lg w-fit">
      {OPTIONS.map((opt) => (
        <button
          key={opt.value}
          className={`px-3 py-1.5 rounded font-label-md text-label-md flex items-center gap-1.5 transition-colors cursor-pointer erp-btn-press ${
            theme === opt.value ? 'bg-surface-container-lowest text-primary shadow-sm font-semibold' : 'text-on-surface-variant hover:text-on-surface'
          }`}
          onClick={() => setTheme(opt.value)}
          type="button"
        >
          <span className="material-symbols-outlined text-[16px]">{opt.icon}</span>
          {opt.label}
        </button>
      ))}
    </div>
  );
};

export default ThemeToggle;
