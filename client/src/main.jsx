import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import App from "./App.jsx";
import "./index.css";
import "./theme.css";
import { ThemeProvider } from "./ThemeContext";

window.onerror = function (msg, url, line, col, error) {
  document.body.innerHTML = "<div style=\"background:red;color:white;padding:20px;font-size:14px;white-space:pre-wrap;\">ERROR: " + msg + " at line " + line + "</div>" + document.body.innerHTML;
};

window.addEventListener("unhandledrejection", function (event) {
  document.body.innerHTML = "<div style=\"background:red;color:white;padding:20px;font-size:14px;white-space:pre-wrap;\">PROMISE REJECTION: " + (event.reason && event.reason.message ? event.reason.message : JSON.stringify(event.reason)) + "</div>" + document.body.innerHTML;
});

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <BrowserRouter>
      <ThemeProvider>
        <App />
      </ThemeProvider>
    </BrowserRouter>
  </React.StrictMode>
);
