// Portable validator shared by the browser and the Google Drive Edge Function.
const FIELDS = ["date", "time", "centre", "coach", "whatTaught", "beforeCoaching", "afterTraining", "nextLesson", "remarks", "contact", "address"];
const METADATA = ["layers", "editorVersion", "templateId", "baseTemplateId", "designName", "backgroundSource", "qrUrl"];
const TEMPLATE_ID = /^(classic|performance|heritage|design-[a-z0-9-]+)$/i;
const NUMERIC_STYLE = ["left", "top", "width", "height", "fontSize", "fontWeight", "opacity", "zIndex"];

function checkGeometry(geometry) {
  if (!geometry || typeof geometry !== "object" || Array.isArray(geometry)) throw new TypeError("Invalid certificate geometry");
  for (const key of NUMERIC_STYLE) {
    if (geometry[key] == null) continue;
    const value = geometry[key];
    if ((typeof value !== "number" && !(typeof value === "string" && /^-?\d+(\.\d+)?$/.test(value))) || !Number.isFinite(Number(value))) {
      throw new TypeError("Invalid certificate position or text size");
    }
    geometry[key] = Number(value);
  }
  if (geometry.objectFit != null && !["contain", "cover", "fill", "none", "scale-down"].includes(geometry.objectFit)) throw new TypeError("Invalid certificate image fit");
}

function copyJson(value, depth = 0) {
  if (depth > 6) throw new TypeError("Certificate design is too deeply nested");
  if (value === null || typeof value === "boolean") return value;
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.length <= 384 * 1024) return value;
  if (Array.isArray(value) && value.length <= 250) return value.map(item => copyJson(item, depth + 1));
  if (value && typeof value === "object" && !Array.isArray(value)) {
    const entries = Object.entries(value);
    if (entries.length > 80) throw new TypeError("Certificate design has too many properties");
    return Object.fromEntries(entries.map(([key, item]) => {
      if (["__proto__", "prototype", "constructor"].includes(key)) throw new TypeError("Invalid certificate design property");
      return [key, copyJson(item, depth + 1)];
    }));
  }
  throw new TypeError("Invalid certificate design value");
}

export function normalizeCertificateDesign(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new TypeError("Invalid certificate design");
  if (typeof value.templateId !== "string" || value.templateId.length > 128 || !TEMPLATE_ID.test(value.templateId)) throw new TypeError("Invalid report template");
  if (typeof value.name !== "string" || !value.name.trim() || value.name.length > 80) throw new TypeError("Invalid report template name");
  const source = value.layout;
  if (!source || typeof source !== "object" || Array.isArray(source) || !Array.isArray(source.layers)) throw new TypeError("Missing certificate layout");
  if (source.templateId !== value.templateId) throw new TypeError("Report template does not match its design");
  if (!["classic", "performance", "heritage"].includes(source.baseTemplateId)) throw new TypeError("Invalid certificate base template");
  const layout = Object.fromEntries([...FIELDS, ...METADATA].filter(key => Object.hasOwn(source, key)).map(key => [key, copyJson(source[key])]));
  if (FIELDS.some(key => !layout[key] || typeof layout[key] !== "object" || Array.isArray(layout[key]))) throw new TypeError("Incomplete certificate layout");
  for (const field of FIELDS) checkGeometry(layout[field]);
  for (const layer of layout.layers) checkGeometry(layer);
  const result = { templateId: value.templateId, name: value.name.trim(), layout };
  if (new TextEncoder().encode(JSON.stringify(result)).length > 384 * 1024) throw new TypeError("Certificate design is too large");
  return result;
}
