import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {REPORT_TEMPLATES,makeTemplateLayout,layoutSnapshot,studioIcon} from '../src/certificate-templates.js';
import {renderStudio} from '../src/certificate-studio.js';
import {normalizeReportRecord} from '../src/report-drive.js';
// Isolate the supplied vanilla controller's layout functions without auth or DOM.
const source=readFileSync(new URL('../src/legacy-app.js',import.meta.url),'utf8');
const start=source.indexOf('export function initApp(config = {}) {')+'export function initApp(config = {}) {'.length;
const end=source.indexOf('    (async function bootstrap() {',start);
const body=source.slice(source.indexOf('const BASE_URL'),source.indexOf('export function initApp')).replace('export function isGoogleDriveCallback','function isGoogleDriveCallback')+source.slice(start,end)+`return {normalizeReportLayout,defaultStudioLayout,renderReportTemplate,validStudioImageSource,validStudioQrUrl,getReportLayout,selectStudioTemplate,getState:()=>state,setSelection:(id,editing)=>{selectedReportOverlay=id;reportLayoutEditing=editing;},setFixture(){state.auth={role:'coach',coachId:'coach-1'};state.coaches=[normalizeCoach({id:'coach-1',name:'Sample Coach',branch:'Sample Centre',reportLayout:defaultStudioLayout('performance')})];state.students=[];}};`;
const factory=new Function('createClient','createDashboardStatePayload','createReportDriveRepository','normalizeReportRecord','REPORT_TEMPLATES','makeTemplateLayout','layoutSnapshot','studioIcon','renderStudio','previewLayoutStore','window','localStorage','config',body);
const api=factory(()=>{throw Error('unexpected live client');},null,null,null,REPORT_TEMPLATES,makeTemplateLayout,layoutSnapshot,studioIcon,renderStudio,null,{location:{pathname:'/',search:''},addEventListener:()=>{}},{getItem:()=>null},{certificatePreview:true});
api.setFixture();
const report={id:'demo',coachId:'coach-1',date:'2026-10-29',time:'10:00',summary:{whatTaught:'Forehand',remarks:'Good progress'}};
test('legacy layouts keep geometry and wording, and default to Classic',()=>{
 const old={date:{left:22},layers:[{id:'brand-name',textOverride:'My academy',left:20,locked:true}]};
 const next=api.normalizeReportLayout(old);
 assert.equal(next.templateId,'classic');assert.equal(next.date.left,22);
 assert.equal(next.layers.find(l=>l.id==='brand-name').text,'My academy');
 assert.equal(api.normalizeReportLayout(next).layers.find(l=>l.id==='brand-name').left,20);
});
test('new templates have distinct backgrounds and all required dynamic fields',()=>{
 for(const id of ['performance','heritage']){
  const l=api.defaultStudioLayout(id);assert.equal(l.baseTemplateId,id);assert.match(l.backgroundSource,new RegExp(id));
  for(const field of ['date','time','centre','coach','whatTaught','beforeCoaching','afterTraining','nextLesson','remarks'])assert.ok(l[field]);
  assert.equal(l.layers.find(l=>l.id==='qr').visible,true);
  assert.equal(new Set(l.layers.map(l=>l.id)).size,l.layers.length);
 }
});
test('save/reload retains custom backgrounds, QR, uploads and variants',()=>{
 const l=api.defaultStudioLayout('heritage');l.templateId='design-test';l.designName='My design';l.qrUrl='https://example.com/profile?coach=1&centre=2';l.backgroundSource='https://example.com/background.jpg';l.uploads=[{id:'upload-1',name:'Photo',source:'data:image/png;base64,abc'}];l.designs=[{id:'design-test',name:'My design'}];l.variants={'design-test':layoutSnapshot(l)};
 const saved=api.normalizeReportLayout(JSON.parse(JSON.stringify(l)));
 assert.equal(saved.baseTemplateId,'heritage');assert.equal(saved.qrUrl,l.qrUrl);assert.equal(saved.backgroundSource,l.backgroundSource);assert.equal(saved.uploads.length,1);assert.equal(saved.designs.length,1);assert.equal(saved.variants['design-test'].variants,undefined);
});
test('image and QR metadata reject executable URLs',()=>{
 for(const u of ['javascript:alert(1)','data:text/html,x','//example.com/x','http://example.com/p.png'])assert.equal(api.validStudioImageSource(u),false);
 for(const u of ['javascript:alert(1)','ftp://example.com','bad-link'])assert.equal(api.validStudioQrUrl(u),false);
 assert.equal(api.validStudioQrUrl('https://example.com'),true);
});
test('report renderer uses saved styling and escapes QR attributes',()=>{
 const l=api.defaultStudioLayout('performance');l.templateId='design-test';l.qrUrl='https://example.com/?x="hello"&y=1';
 const html=api.renderReportTemplate(report,l,'preview-performance');
 assert.match(html,/id="preview-performance"/);assert.match(html,/studio-report-performance/);assert.match(html,/performance.svg/);assert.match(html,/&quot;hello&quot;/);assert.doesNotMatch(html,/template-bullet-mask/);
});
test('photo layer sources override profile photos and previews have unique IDs',()=>{
 const l=api.defaultStudioLayout('heritage');l.layers.find(l=>l.id==='student-photo').source='https://example.com/session.jpg';
 assert.match(api.renderReportTemplate(report,l,'preview-a'),/https:\/\/example.com\/session.jpg/);
 assert.match(api.renderReportTemplate(report,l,'preview-b'),/id="preview-b"/);
});
test('snapshot removes collection metadata to prevent recursive growth',()=>{
 const l=api.defaultStudioLayout('performance');l.variants={a:{}};l.designs=[{id:'test'}];l.uploads=[{}];const snap=layoutSnapshot(l);
 assert.equal(snap.variants,undefined);assert.equal(snap.designs,undefined);assert.equal(snap.uploads,undefined);snap.date.left=40;assert.notEqual(l.date.left,40);
});
test('gallery includes three cards and distinct editable design entry points',()=>{
 const l=api.defaultStudioLayout('performance');const html=renderStudio({layout:l,view:'templates',filter:'all',help:false,preview:false,zoom:70,tool:'templates',renderMini:id=>`<i>${id}</i>`,escape:s=>String(s),isDemo:true});
 assert.equal((html.match(/<article /g)||[]).length,3);assert.match(html,/Upload design/);assert.match(html,/My designs/);assert.match(html,/Certificate design preview/);
});
test('all real template presets can be frozen into canonical report records',()=>{
 for(const template of REPORT_TEMPLATES){
  const layout=layoutSnapshot(api.defaultStudioLayout(template.id));
  const record=normalizeReportRecord({schemaVersion:1,recordType:'report',id:'report-frozen',coachId:'coach-1',studentId:'student-1',summary:{},certificateDesign:{templateId:template.id,name:template.name,layout}});
  assert.equal(record.certificateDesign.layout.backgroundSource,layout.backgroundSource);
  assert.equal(record.certificateDesign.layout.layers.find(layer=>layer.id==='qr').left,layout.layers.find(layer=>layer.id==='qr').left);
 }
});
test('report rendering uses its stored design after the coach changes templates',()=>{
 api.setFixture();
 const frozen={...report,certificateDesign:{templateId:'heritage',name:'Heritage',layout:layoutSnapshot(api.defaultStudioLayout('heritage'))}};
 assert.match(api.renderReportTemplate(frozen),/studio-report-heritage/);
 const coach=api.getState().coaches[0];coach.reportLayout=api.defaultStudioLayout('classic');
 assert.match(api.renderReportTemplate(frozen),/studio-report-heritage/);
 assert.match(api.renderReportTemplate(report),/studio-report-classic/);
 assert.match(api.renderReportTemplate(frozen,coach.reportLayout),/studio-report-classic/);
});

test('report previews do not retain selected text, photo, artwork or QR highlights',()=>{
 const layout=api.defaultStudioLayout('classic');
 for(const selected of ['date','whatTaught','brand-name','brand-logo-art','student-photo','qr']){
  api.setSelection(selected,true);
  assert.match(api.renderReportTemplate(report,layout),/is-selected/);
  api.setSelection(selected,false);
  const html=api.renderReportTemplate(report,layout);
  assert.doesNotMatch(html,/is-selected|is-editing|certificate-resize-handle|certificate-object-toolbar/);
 }
 api.setSelection('date',false);
});
