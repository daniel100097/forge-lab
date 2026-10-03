export const apiExplorerStyles = `
.swagger-back-link{display:none}
html[data-theme="light"] body{background:#fff;color:#111}
html[data-theme="light"] .swagger-ui,html[data-theme="light"] .swagger-ui .microlight{filter:none}
html[data-theme="dark"] body{background:#1e1e1e;color:#eee}
html[data-theme="dark"] .swagger-ui{filter:none}
html[data-theme="dark"] .swagger-ui > div > :not(.scheme-container),
html[data-theme="dark"] .swagger-ui .schemes > :not(.auth-wrapper),
html[data-theme="dark"] .swagger-ui .auth-wrapper > .authorize,
html[data-theme="dark"] .swagger-ui .modal-ux{filter:invert(88%) hue-rotate(180deg)}
html[data-theme="dark"] .swagger-ui .scheme-container{background:#1e1e1e}
html[data-theme="dark"] .swagger-ui .microlight{filter:invert(100%) hue-rotate(180deg)}
.swagger-ui .dialog-ux .modal-ux{max-height:calc(100vh - 32px);max-width:calc(100vw - 32px);overflow:auto}
.swagger-ui .dialog-ux .modal-ux-content{max-height:calc(100vh - 100px)}
@media(max-width:600px){
.swagger-ui .opblock-section-header{flex-wrap:wrap;gap:8px}
.swagger-ui .opblock-section-header > h4{flex-basis:100%}
.swagger-ui .opblock-section-header label{max-width:100%;margin-left:0;flex-wrap:wrap;gap:8px}
}
`;
