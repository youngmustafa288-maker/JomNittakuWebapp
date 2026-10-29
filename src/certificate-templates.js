// Design metadata and geometry are shared by the gallery, editor and exports.
export const REPORT_TEMPLATES = [
  { id: 'classic', name: 'Classic', tag: 'Original', description: 'The familiar Dao Sports finish.', category: 'Signature', color: '#bd955b', background: '/Certificate%20Template.jpg?v=4' },
  { id: 'performance', name: 'Performance', tag: 'New', description: 'Confident, clear and made for progress.', category: 'Modern', color: '#c81e45', background: '/certificate-templates/performance.svg' },
  { id: 'heritage', name: 'Heritage', tag: 'New', description: 'A timeless frame for every milestone.', category: 'Elegant', color: '#b18a4d', background: '/certificate-templates/heritage.svg' }
];
export function layoutSnapshot(layout) {
  const { designs, variants, uploads, ...snapshot } = layout;
  return structuredClone(snapshot);
}
export function makeTemplateLayout(base, id) {
  const template = REPORT_TEMPLATES.find(item => item.id === id) || REPORT_TEMPLATES[0];
  const layout = structuredClone(base);
  layout.templateId = template.id;
  layout.baseTemplateId = template.id;
  layout.designName = template.name;
  layout.backgroundSource = template.background;
  layout.qrUrl = 'https://jom-nittaku-webapp.vercel.app/centre';
  if (template.id === 'classic') return layout;
  const elegant = template.id === 'heritage';
  const ink = elegant ? '#423525' : '#14263f';
  const accent = elegant ? '#96723f' : '#c81e45';
  layout.layers.forEach(layer => { layer.visible = false; });
  const patch = (id, values) => {
    const layer = layout.layers.find(item => item.id === id);
    if (layer) Object.assign(layer, {visible: true}, values);
  };
  patch('brand-logo-art', {left: 8, top: 6.3, width: 7.5, height: 5.8});
  patch('brand-name', {left: 18, top: 7.1, width: 66, height: 3.9, color: ink, fontSize: 3.7, fontFamily: elegant ? 'Georgia' : 'Outfit', fontWeight: 700});
  patch('brand-subtitle', {left: 18, top: 11, width: 65, height: 2.1, color: accent, fontFamily: 'Arial', fontSize: 1.55});
  patch('brand-tagline', {left: 8, top: 16.5, width: 84, height: 2.6, color: elegant ? '#8d7656' : '#617087', fontSize: 1.8, fontFamily: 'Lato'});
  patch('report-title-art', {left: 8, top: 20.4, width: 84, height: 5.1, text: elegant ? 'TRAINING REPORT' : 'YOUR PROGRESS. ON RECORD.', color: ink, fontFamily: elegant ? 'Georgia' : 'Outfit', fontSize: elegant ? 4.4 : 4.1});
  patch('student-photo', {left: 66, top: 29.4, width: 10.8, height: 9.2});
  patch('coach-photo', {left: 79, top: 29.4, width: 10.8, height: 9.2});
  patch('qr', {left: 81.5, top: 86.1, width: 10.5, height: 7.84, zIndex: 60});
  patch('footer-text-overlay', {left: 8, top: 94.8, width: 61, height: 3.1, fontFamily: 'Arial', fontSize: 1.4, color: elegant ? '#a28a64' : '#637086', text: 'DAO SPORTS METHOD\nCHARACTER TRANSFORMATION THROUGH SPORTS'});
  const fields = {date:[20,29.4,33],time:[20,31.9,33],centre:[20,34.4,39],coach:[20,36.9,39],whatTaught:[9.5,46.5,37],beforeCoaching:[9.5,56,37],afterTraining:[54,46.5,37],nextLesson:[54,56,37],remarks:[9.5,68,81],contact:[8,85.7,60],address:[8,89.1,62]};
  Object.entries(fields).forEach(([id,[left,top,width]]) => Object.assign(layout[id],{left,top,width,color:ink,fontFamily:'Arial',fontSize: id==='contact'?2: id==='address'?1.65: id==='coach'||id==='centre'||id==='date'||id==='time'?1.9:1.65,fontWeight:400}));
  layout.remarks.height = 10;
  const label = (id,text,left,top,width=38,size=1.75) => layout.layers.push({id:`studio-${id}`, name:text, type:'text', text, left,top,width,height:2.6,fontFamily:elegant?'Georgia':'Arial',fontSize:size,color:accent,fontWeight:700,visible:true,locked:false,zIndex:24});
  label('date','DATE',8,29.4,12,1.3); label('time','TIME',8,31.9,12,1.3);
  label('centre','CENTRE',8,34.4,12,1.3);label('coach','COACH',8,36.9,12,1.3);
  label('taught','01  WHAT WAS TAUGHT',9.5,42.4);label('after','02  AFTER TRAINING',54,42.4);
  label('before','03  BEFORE COACHING',9.5,51.9);label('next','04  NEXT LESSON',54,51.9);
  label('remarks',"COACH’S REMARKS",9.5,63.4,72,1.9);
  label('contact','KEEP THE MOMENTUM',8,81.4,65,1.6);
  label('scan','SCAN TO CONNECT',78,94,17,1.1);
  return layout;
}
export const STUDIO_ICONS = {
  grid:'<rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/>',
  report:'<path d="M14 2H5a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V9z"/><path d="M14 2v7h7M7 13h10M7 17h7"/>',
  people:'<circle cx="9" cy="8" r="3"/><path d="M3 21v-3a6 6 0 0 1 12 0v3M16 5a3 3 0 0 1 0 6m2 3a5 5 0 0 1 3 4v3"/>',
  design:'<path d="m4 16 12-12 4 4L8 20l-5 1zM13 7l4 4M4 4h5M4 8h2"/>',
  upload:'<path d="M12 16V3m-5 5 5-5 5 5M3 15v5a1 1 0 0 0 1 1h16a1 1 0 0 0 1-1v-5"/>',
  image:'<rect x="3" y="3" width="18" height="18" rx="3"/><circle cx="8" cy="8" r="1.5"/><path d="m21 15-5-5L5 21"/>',
  qr:'<rect x="3" y="3" width="6" height="6"/><rect x="15" y="3" width="6" height="6"/><rect x="3" y="15" width="6" height="6"/><path d="M15 14h3v4h3m-6 3h3M21 14v-2M12 3v5M3 12h5m4 0v6"/>',
  text:'<path d="M4 5V3h16v2M12 3v18m-4 0h8"/>',
  layers:'<path d="m12 3 10 5-10 5L2 8zm-9 9 9 5 9-5M3 17l9 5 9-5"/>',
  arrow:'<path d="M5 12h14m-5-5 5 5-5 5"/>',
  check:'<path d="m5 12 4 4L19 6"/>',
  plus:'<path d="M12 5v14M5 12h14"/>',
  help:'<circle cx="12" cy="12" r="9"/><path d="M9.5 9a2.5 2.5 0 0 1 5 0c0 2-2.5 2-2.5 4m0 3h.01"/>',
  eye:'<path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/>',
  settings:'<path d="M4 6h16M4 12h16M4 18h16"/><circle cx="8" cy="6" r="2"/><circle cx="16" cy="12" r="2"/><circle cx="9" cy="18" r="2"/>',
  back:'<path d="M19 12H5m5-5-5 5 5 5"/>',
  save:'<path d="M4 3h14l3 3v15H3V3zm3 0v6h10V3M7 21v-8h10v8"/>',
  lock:'<rect x="5" y="10" width="14" height="11" rx="2"/><path d="M8 10V6a4 4 0 0 1 8 0v4"/>'
};
export function studioIcon(name) { return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${STUDIO_ICONS[name] || STUDIO_ICONS.design}</svg>`; }
