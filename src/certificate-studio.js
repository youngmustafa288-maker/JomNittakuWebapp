import { REPORT_TEMPLATES, studioIcon as icon } from './certificate-templates.js';
export function renderStudio({layout, view, filter, preview, zoom, tool, renderMini, renderCanvas, renderToolbar, renderPanel, escape, isDemo}) {
 const current = REPORT_TEMPLATES.find(t=>t.id===layout.templateId) || {name:layout.designName || 'My design'};
 const cards = [...REPORT_TEMPLATES, ...(layout.designs || []).map(d=>({...d,custom:true}))];
 const shown = cards.filter(t=>filter==='mine' ? t.custom : !t.custom);
 return `<section class="page certificate-design-page studio-page active studio-simple ${preview?'studio-preview-mode':''}" aria-label="${isDemo?'Certificate design preview':'Certificate design'}">
 <div class="studio-heading"><h2>Certificate Design</h2><div class="studio-heading-actions">${view==='templates'
 ? `<button class="primary-btn studio-btn" data-action="studio-upload-background">${icon('upload')}Upload design</button>`
 : `<button class="studio-btn studio-outline" data-action="studio-preview">${icon('eye')}${preview?'Edit':'Preview'}</button><button class="primary-btn studio-btn" data-action="studio-save">Save</button>`}</div></div>
 ${view==='templates'?`
 <div class="studio-tabs"><div role="group" aria-label="Design collection"><button class="${filter!=='mine'?'active':''}" data-studio-filter="ready">Templates</button><button class="${filter==='mine'?'active':''}" data-studio-filter="mine">My designs</button></div></div>
 <div class="studio-template-grid">${shown.map(t=>`<article class="studio-template-card ${layout.templateId===t.id?'is-current':''}"><button class="studio-card-preview" data-studio-template="${escape(t.id)}" aria-label="Edit ${escape(t.name)}"><div class="studio-card-paper">${renderMini(t.id)}</div></button><div class="studio-card-description"><h4>${escape(t.name)}</h4><button class="studio-simple-use" data-studio-template="${escape(t.id)}" aria-label="Edit ${escape(t.name)} template">Edit ${icon('arrow')}</button></div></article>`).join('')}${!shown.length?'<div class="studio-empty">No saved designs</div>':''}</div>`:
 `<div class="studio-editor-bar"><button class="studio-back" data-action="studio-gallery">${icon('back')}Templates</button><span class="studio-bar-divider"></span><label class="studio-name-label"><span class="sr-only">Design name</span><input data-studio-name aria-label="Design name" value="${escape(layout.designName || current.name)}" maxlength="80"></label><details class="studio-more"><summary>More</summary><div><button data-action="studio-save-copy">Save a copy</button><button data-action="studio-export">Download PNG</button></div></details></div>
 <div class="certificate-editor-workspace studio-workspace ${preview?'is-preview':''}">
 <nav class="certificate-tool-strip" aria-label="Design tools">${[['templates','grid','Templates'],['uploads','image','Photos'],['text','text','Text'],['qr','qr','QR'],['layers','layers','Layers'],['position','settings','Position']].map(([id,i,label])=>`<button class="certificate-tool-button ${tool===id?'is-active':''}" data-certificate-tool="${id}" aria-pressed="${tool===id}"><span>${icon(i)}</span><small>${label}</small></button>`).join('')}</nav>
 <aside class="certificate-editor-rail">${renderPanel()}</aside>
 <div class="certificate-editor-main">${preview?'<div class="studio-preview-label">Preview</div>':renderToolbar()}<main class="certificate-editor-stage" style="--studio-zoom:${zoom/100}"><div class="studio-canvas-wrap">${renderCanvas()}</div></main><div class="studio-stage-footer"><span>896 × 1200</span><span class="studio-zoom"><button data-studio-zoom="-10" aria-label="Zoom out">−</button><output>${zoom}%</output><button data-studio-zoom="10" aria-label="Zoom in">+</button><button data-studio-zoom="fit">Fit</button></span></div></div></div>`}
 <input type="file" id="studioBackgroundUpload" accept="image/png,image/jpeg,image/webp" class="hidden"><input type="file" id="studioPictureUpload" accept="image/png,image/jpeg,image/webp" class="hidden">
 <div class="studio-toast" role="status" aria-live="polite" id="studioToast"></div>
 </section>`;
}
export function previewLayoutStore(mode, value) {
 return new Promise((resolve,reject)=>{
  const request=indexedDB.open('dao-certificate-design-preview',1);
  request.onupgradeneeded=()=>request.result.createObjectStore('designs');
  request.onerror=()=>reject(request.error);
  request.onsuccess=()=>{const db=request.result;const transaction=db.transaction('designs',mode==='save'?'readwrite':'readonly');const store=transaction.objectStore('designs');const op=mode==='save'?store.put(value,'layout'):store.get('layout');let result;op.onsuccess=()=>{result=op.result;};transaction.oncomplete=()=>{db.close();resolve(result);};transaction.onerror=()=>{db.close();reject(transaction.error);};};
 });
}
