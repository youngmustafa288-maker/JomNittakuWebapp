import './styles.css';
import './certificate-studio.css';
import './certificate-editor.css';
import './report-template-picker.css';
import {initApp} from './legacy-app.js';
document.getElementById('app').classList.add('app-shell');
// Demo is isolated from credentials, authentication and live records.
initApp({certificatePreview:true,reportTemplateSrc:'/Certificate%20Template.jpg?v=4',reportTemplateLayerRoot:'/certificate-layers'});
