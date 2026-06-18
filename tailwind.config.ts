import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        ink: "#0f172a",
        clinical: "#0e7490",
      },
    },
  },
  plugins: [],
};

export default config;
