import "./styles.css";
import { initApp } from "./legacy-app.js";

const root = document.querySelector("#app");
root.classList.add("app-shell");
root.innerHTML = '<div style="display:grid;place-items:center;min-height:100vh;color:#0f1a33;font-family:Outfit,sans-serif;"><div>Loading JomNittaku...</div></div>';

const runtimeConfig = window.__APP_CONFIG__ || {
  supabaseUrl: "https://vjhjvcvmtfpkoyjxfmxu.supabase.co",
  supabaseKey: "sb_publishable_-4RCnrND3IuzVIKrYNv63w_5c4xR1YK"
};

initApp({
  supabaseUrl: import.meta.env.VITE_SUPABASE_URL || runtimeConfig.supabaseUrl,
  supabaseKey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || runtimeConfig.supabaseKey,
  reportTemplateSrc: "/Image 1.jpg?v=2"
});
