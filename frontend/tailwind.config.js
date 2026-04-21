/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,jsx}"],
  theme: {
    extend: {
      colors: {
        canvas: "#F3F6FA",
        ink: "#1B2A3B",
        sand: "#EEF3F9",
        line: "#D4E0EC",
        primary: "#4E7FA8",
        "primary-soft": "#68A898",
        soft: "#E8F2EF",
        calm: "#EAE5F4",
        sidebar: "#2A4A6B",
        accent: "#9B84C4",
      },
      fontFamily: {
        display: ["Sora", "sans-serif"],
        sans: ["Manrope", "sans-serif"],
      },
      boxShadow: {
        panel: "0 20px 45px rgba(52, 64, 85, 0.10)",
      },
    },
  },
  plugins: [],
};
