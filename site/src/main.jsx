import React from "react";
import { createRoot } from "react-dom/client";
import App from "./pmm-construct-prototype.jsx";

// Mounts the PMM Construct prototype into the page.
// App is the default export of pmm-construct-prototype.jsx.
createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
