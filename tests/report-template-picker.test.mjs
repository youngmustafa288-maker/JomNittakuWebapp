import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';
import { normalizeCertificateDesign } from '../supabase/functions/_shared/certificate-design.js';
import { normalizeReportRecord, createReportDriveRepository } from '../src/report-drive.js';
import { reportTemplateOptions, renderReportTemplateChoices } from '../src/report-template-picker.js';

const fields = ['date','time','centre','coach','whatTaught','beforeCoaching','afterTraining','nextLesson','remarks','contact','address'];
const layout = (id = 'classic') => ({
  ...Object.fromEntries(fields.map(field => [field, { left: 12, top: 20, width: 30, fontSize: 2.7 }])),
  layers: [{ id:'qr', type:'qr', left:80, top:85, width:10, height:8 }],
  templateId:id, baseTemplateId:id, designName:id, editorVersion:2,
  backgroundSource:`/certificate-templates/${id}.svg`, qrUrl:'https://example.com/coach'
});
const design = () => ({ templateId:'heritage', name:'Heritage', layout:layout('heritage') });
const record = (recordType = 'draft') => ({schemaVersion:1, recordType, id:`${recordType}-test`, coachId:'coach-1', studentId:'student-1', date:'2026-10-29', time:'10:00', lessonNumber:8, step:4, summary:{remarks:'Good progress'}, certificateDesign:design()});
const backend = readFileSync(new URL('../supabase/functions/google-drive-oauth/index.ts', import.meta.url),'utf8');
const normalizeBackend = new Function('normalizeCertificateDesign','REPORT_SUMMARY_FIELDS','MAX_REPORT_BYTES',
  stripTypeScriptTypes(backend.slice(backend.indexOf('function normalizeReportRecord('),backend.indexOf('async function reportFiles(')))+';return normalizeReportRecord;'
)(normalizeCertificateDesign,['whatTaught','beforeCoaching','afterTraining','nextLesson','remarks'],512*1024);

test('choices include built-ins and saved designs, using each coach variant',()=>{
  const current=layout('performance');
  const custom={...layout('heritage'),templateId:'design-custom',designName:'My design'};
  current.designs=[{id:'design-custom',name:'My design'},{id:'design-missing',name:'Deleted'}];
  current.variants={'design-custom':custom,classic:{...layout(),date:{left:45}}};
  const options=reportTemplateOptions(current,layout);
  assert.deepEqual(options.map(option=>option.templateId),['classic','performance','heritage','design-custom']);
  assert.equal(options[0].layout.date.left,45);
  assert.equal(options[3].layout.baseTemplateId,'heritage');
  assert.equal(options[1].layout.variants,undefined);
  current.date.left=80;
  assert.equal(options[1].layout.date.left,12);
});

test('resuming retains the selected snapshot even after a saved design is removed or edited',()=>{
  const selected={...design(),templateId:'design-removed',name:'Original custom',layout:{...layout('heritage'),templateId:'design-removed'}};
  const options=reportTemplateOptions(layout(),layout,selected);
  assert.deepEqual(options.at(-1),selected);
  options.at(-1).layout.date.left=95;
  assert.equal(selected.layout.date.left,12);
});

test('radio choices have one selected option and escape user-supplied names',()=>{
  const options=reportTemplateOptions(layout(),layout);
  options[0].name='<img onerror=x>';
  const escape=value=>String(value).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('"','&quot;');
  const html=renderReportTemplateChoices(options,'heritage',()=>'<span>Preview</span>',escape);
  assert.equal((html.match(/ checked/g)||[]).length,1);
  assert.equal((html.match(/type="radio"/g)||[]).length,3);
  assert.match(html,/&lt;img onerror=x>/);
});

test('draft and final designs round-trip through browser and actual backend validators',()=>{
  for(const type of ['draft','report']){
    const input=record(type);
    input.certificateDesign.layout.layers.push({id:'photo',type:'image',source:'https://example.com/picture.png',left:10,top:40});
    input.certificateDesign.layout.uploads=[{id:'unused'}];
    input.certificateDesign.layout.variants={classic:layout()};
    const client=normalizeReportRecord(input);
    const server=normalizeBackend(JSON.parse(JSON.stringify(client)));
    assert.deepEqual(server.certificateDesign,client.certificateDesign);
    assert.equal(server.certificateDesign.layout.qrUrl,'https://example.com/coach');
    assert.equal(server.certificateDesign.layout.layers.at(-1).source,'https://example.com/picture.png');
    assert.equal(server.certificateDesign.layout.uploads,undefined);
    assert.equal(server.certificateDesign.layout.variants,undefined);
  }
});

test('legacy records remain valid without a template snapshot',()=>{
  const old=record('report'); delete old.certificateDesign;
  assert.equal(normalizeReportRecord(old).certificateDesign,undefined);
  assert.equal(normalizeBackend(old).certificateDesign,undefined);
});

test('invalid, mismatched and oversized snapshots are rejected in both validators',()=>{
  for(const mutate of [r=>r.certificateDesign.templateId='../../other',r=>r.certificateDesign.layout.templateId='classic',r=>r.certificateDesign.layout.date=null,r=>r.certificateDesign.layout.date.left=Infinity,r=>r.certificateDesign.layout.layers.push({text:'x'.repeat(384*1024)})]){
    const input=record();mutate(input);
    assert.throws(()=>normalizeReportRecord(input));
    assert.throws(()=>normalizeBackend(input));
  }
});

test('repository checks support before writes and preserves selected designs on save/list',async()=>{
  const stored=[];const actions=[];
  const repository=createReportDriveRepository(async body=>{
    actions.push(body.action);
    if(body.action==='report-template-capabilities')return{certificateDesignVersion:1};
    if(body.action==='report-save'){stored.push(JSON.parse(JSON.stringify(body.record)));return{record:stored.at(-1)};}
    return{records:stored};
  });
  const saved=await repository.save(record());
  await repository.save(record('report'),{draftId:'draft-test'});
  const list=await repository.list();
  assert.equal(actions.filter(a=>a==='report-template-capabilities').length,1);
  assert.equal(actions[0],'report-template-capabilities');
  assert.deepEqual(list[0].certificateDesign,saved.certificateDesign);
  assert.equal(list[1].certificateDesign.templateId,'heritage');
});

test('old services fail before writing or finalizing a report',async()=>{
  let writes=0;
  const repository=createReportDriveRepository(async body=>{
    if(body.action==='report-template-capabilities')throw Error('Unknown coach Drive action');
    writes++;return{record:body.record};
  });
  await assert.rejects(repository.save(record('report')),/Update the report service/);
  assert.equal(writes,0);
});
