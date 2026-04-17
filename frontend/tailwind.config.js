/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,jsx}"],
  theme: {
    extend: {
      colors: {
        canvas: "#efe8dd",
        ink: "#344055",
        sand: "#f7f1e8",
        line: "#e4d8ca",
        primary: "#f5821f",
        "primary-soft": "#a5bc63",
        soft: "#eef3df",
        calm: "#f7d5b3",
        sidebar: "#7f7065",
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
