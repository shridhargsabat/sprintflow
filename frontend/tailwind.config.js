export default {
  darkMode: 'class',
  content: ['./index.html', './src/**/*.{js,jsx,ts,tsx}'],
  // Avatar colors come from the DB at runtime, so Tailwind's scanner can't
  // see them — safelist them or avatars render transparent.
  safelist: [
    'bg-indigo-600',
    'bg-sky-600',
    'bg-emerald-600',
    'bg-amber-600',
    'bg-rose-600',
    'bg-violet-600',
    'bg-teal-600',
    'bg-slate-400'
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ['-apple-system', 'BlinkMacSystemFont', 'Inter Variable', 'Inter', 'Segoe UI', 'Roboto', 'sans-serif']
      }
    }
  },
  plugins: []
};
