import { REPORT_TEMPLATES, layoutSnapshot } from './certificate-templates.js';

// Resolve designs from the report's coach, including their saved variants.
export function reportTemplateOptions(current, defaultLayout, selected = null) {
  const names = new Map(REPORT_TEMPLATES.map(template => [template.id, template.name]));
  for (const design of current.designs || []) {
    if (current.variants?.[design.id] || current.templateId === design.id) names.set(design.id, design.name);
  }
  if (!names.has(current.templateId)) names.set(current.templateId, current.designName);
  if (selected && !names.has(selected.templateId)) names.set(selected.templateId, selected.name);
  return [...names].map(([templateId, name]) => {
    if (selected?.templateId === templateId) return structuredClone(selected);
    const layout = templateId === current.templateId ? current : current.variants?.[templateId] || defaultLayout(templateId);
    return { templateId, name: templateId === current.templateId ? current.designName || name : name, layout: layoutSnapshot(layout) };
  });
}

export function renderReportTemplateChoices(options, selectedId, renderPreview, escape) {
  return `<fieldset class="report-template-picker"><legend>Template</legend><div class="report-template-options">${options.map((option, index) => `
    <label class="report-template-option ${option.templateId === selectedId ? 'is-selected' : ''}">
      <input type="radio" name="reportTemplate" value="${escape(option.templateId)}" ${option.templateId === selectedId ? 'checked' : ''}>
      <span class="report-template-thumbnail" aria-hidden="true">${renderPreview(option, index)}</span>
      <span class="report-template-name">${escape(option.name)}</span>
    </label>`).join('')}</div></fieldset>`;
}
