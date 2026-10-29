// Original certificate editor layout, extended with template and QR tools.
export function renderCertificateEditor({renderStrip, renderPanel, renderToolbar, renderCanvas}) {
 return `<section class="page certificate-design-page certificate-original-editor certificate-reference-tools active">
 <div class="section-header certificate-design-header"><div class="section-title"><h2>Certificate Design</h2></div><div class="certificate-header-actions"><button class="secondary-btn" data-action="studio-gallery">Templates</button><button class="primary-btn" data-action="studio-save">Save</button></div></div>
 <div class="certificate-editor-workspace">${renderStrip()}<aside class="certificate-editor-rail">${renderPanel()}</aside><div class="certificate-editor-main">${renderToolbar()}<main class="certificate-editor-stage">${renderCanvas()}</main></div></div>
 <input type="file" id="studioBackgroundUpload" accept="image/png,image/jpeg,image/webp" class="hidden"><input type="file" id="studioPictureUpload" accept="image/png,image/jpeg,image/webp" class="hidden"><div id="studioToast" class="certificate-editor-status" role="status" aria-live="polite"></div>
 </section>`;
}
export function renderCertificateEditorTools(tool) {
 const tools = [['text','T','Text'],['uploads','+','Uploads']];
 return `<nav class="certificate-tool-strip" aria-label="Certificate editor tools">${tools.map(([id,icon,label])=>`<button type="button" class="certificate-tool-button ${tool===id?'is-active':''}" data-certificate-tool="${id}" aria-pressed="${tool===id}"><span aria-hidden="true">${icon}</span><small>${label}</small></button>`).join('')}</nav>`;
}

export function renderCertificateEditorToolbar({layout, selectedId}) {
 const layer=layout.layers?.find(l=>l.id===selectedId);
 const target=layout[selectedId]||layer;
 const text=!!target && (!!layout[selectedId]||layer?.type?.includes('text')||typeof layer?.textOverride==='string');
 const disabled=target?.locked?' disabled':'';
 const font=target?.fontFamily||'Arial';
 const size=Number((Number(target?.fontSize)||2.7).toFixed(1));
 const color=/^#[0-9a-f]{6}$/i.test(target?.color||'')?target.color:'#111111';
 return `<div class="report-layout-toolbar certificate-reference-toolbar ${text?'':'is-empty'}" role="toolbar" aria-label="Text formatting">${text?`
 <label class="toolbar-font"><span class="sr-only">Font</span><select data-layout-font aria-label="Font"${disabled}>${['Arial','Kalam','Outfit','Montserrat','Lato','Georgia','Cinzel Decorative'].map(f=>`<option ${font===f?'selected':''}>${f}</option>`).join('')}</select></label>
 <div class="toolbar-font-stepper" aria-label="Font size"><button type="button" data-font-step="-0.1" aria-label="Decrease font size"${disabled}>−</button><input type="number" min="0.6" max="8" step="0.1" data-layout-size value="${size}" aria-label="Font size"${disabled}><button type="button" data-font-step="0.1" aria-label="Increase font size"${disabled}>+</button></div>
 <label class="toolbar-colour"><span class="sr-only">Text colour</span><span class="toolbar-colour-letter" aria-hidden="true">A</span><input type="color" data-layout-color value="${color}" aria-label="Text colour"${disabled}></label>
 <span class="toolbar-format-group" role="group" aria-label="Text formatting"><button type="button" class="toolbar-format-button ${Number(target.fontWeight)>=600?'is-active':''}" data-text-format="bold" aria-label="Bold" aria-pressed="${Number(target.fontWeight)>=600}"${disabled}>B</button><button type="button" class="toolbar-format-button ${target.fontStyle==='italic'?'is-active':''}" data-text-format="italic" aria-label="Italic" aria-pressed="${target.fontStyle==='italic'}"${disabled}><em>I</em></button><button type="button" class="toolbar-format-button ${target.textDecoration==='underline'?'is-active':''}" data-text-format="underline" aria-label="Underline" aria-pressed="${target.textDecoration==='underline'}"${disabled}><u>U</u></button></span>`:''}</div>`;
}
