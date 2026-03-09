/** @type {import('tailwindcss').Config} */
export default {
    content: [
        "./index.html",
        "./src/**/*.{js,ts,jsx,tsx}",
    ],
    theme: {
        extend: {
            colors: {
                kant: {
                    paper: '#f9f5e6', // slightly lighter paper
                    ink: '#2c2c2c',
                    accent: '#8b4513',
                    muted: '#8b8b8b',
                    bg: '#e8e4d9',
                }
            },
            fontFamily: {
                serif: ['"Libre Baskerville"', 'serif'],
                sans: ['"Inter"', 'sans-serif'],
            },
            animation: {
                'fade-in': 'fadeIn 0.5s ease-out',
                'slide-up': 'slideUp 0.5s ease-out',
            },
            keyframes: {
                fadeIn: {
                    '0%': { opacity: '0' },
                    '100%': { opacity: '1' },
                },
                slideUp: {
                    '0%': { transform: 'translateY(10px)', opacity: '0' },
                    '100%': { transform: 'translateY(0)', opacity: '1' },
                }
            }
        },
    },
    plugins: [],
}
