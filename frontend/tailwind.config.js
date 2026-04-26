/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        teal: { DEFAULT: '#00d4aa', dark: '#00b894', light: '#5DCAA5' },
        dark: { 0: '#0d1117', 1: '#161b22', 2: '#1c2330', 3: '#21262d', 4: '#30363d' }
      }
    }
  },
  plugins: []
}
