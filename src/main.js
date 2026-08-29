import "./styles.css";
import { initApp } from "./legacy-app.js";

const root = document.querySelector("#app");
root.classList.add("app-shell");
root.innerHTML = '<div style="display:grid;place-items:center;min-height:100vh;color:#0f1a33;font-family:Outfit,sans-serif;"><div>Loading JomNittaku...</div></div>';

initApp({
  supabaseUrl: import.meta.env.VITE_SUPABASE_URL || "",
  supabaseKey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || "",
  reportTemplateSrc: "/Image 1.jpg?v=2"
});
