import "./styles.css";
import template from "./app-template.html?raw";
import { initApp } from "./legacy-app.js";

document.querySelector("#app").innerHTML = template;

initApp({
  supabaseUrl: import.meta.env.VITE_SUPABASE_URL || "",
  supabaseKey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || "",
  reportTemplateSrc: "/Updated Certificate Image.png"
});
