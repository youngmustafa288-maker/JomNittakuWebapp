import "./styles.css";
import { initApp } from "./legacy-app.js";

const root = document.querySelector("#app");
root.classList.add("app-shell");
root.innerHTML = '<main class="splash-screen" aria-label="Loading JomNittaku"><section class="splash-card"><img class="splash-logo" src="/Logo_with_Changes_made.png" alt="Dao Sports Method Table Tennis Training"><p class="splash-kicker">DAO SPORTS METHOD</p><h1>JomNittaku</h1></section></main>';

const runtimeConfig = window.__APP_CONFIG__ || {
  supabaseUrl: "https://vjhjvcvmtfpkoyjxfmxu.supabase.co",
  supabaseKey: "sb_publishable_-4RCnrND3IuzVIKrYNv63w_5c4xR1YK"
};

initApp({
  supabaseUrl: import.meta.env.VITE_SUPABASE_URL || runtimeConfig.supabaseUrl,
  supabaseKey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || runtimeConfig.supabaseKey,
  reportTemplateSrc: "/Image 1.jpg?v=2"
});
