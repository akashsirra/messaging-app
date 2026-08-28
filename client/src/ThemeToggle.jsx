import { useTheme } from "./ThemeContext";

export default function ThemeToggle() {
  const { theme, toggleTheme } = useTheme();
  return (
    <button
      onClick={toggleTheme}
      style={{
        border: "none",
        background: "transparent",
        fontSize: "1.4rem",
        cursor: "pointer",
      }}
      aria-label="Toggle theme"
    >
      {theme === "light" ? "🤍" : "❤️"}
    </button>
  );
}
