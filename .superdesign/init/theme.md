# Tokens
Inter available locally. Current home Segoe UI; navy #102d40, teal #087e8b, pale #f3f6f8. Operational theme now zinc #18181b, #f4f4f5, forest #047857, mint #34d399. Maintain product palette using current emerald/zinc direction.

## frontend/src/index.css
```
@import 'tailwindcss/theme.css' layer(theme);
@import 'tailwindcss/utilities.css' layer(utilities);
body { margin: 0; }

.portal-nav { display:flex; gap:24px; padding:14px 24px; background:#102d40; font:600 14px 'Segoe UI',sans-serif; }
.portal-nav a { color:white; text-decoration:none; }
.portal-nav a:hover { text-decoration:underline; }
.portal-home { max-width:960px; margin:70px auto; padding:24px; font-family:'Segoe UI',sans-serif; color:#142f42; }
.portal-links { display:flex; flex-wrap:wrap; gap:24px; margin:32px 0; }
.portal-links a { flex:1; min-width:220px; padding:28px; border:1px solid #c9d5df; border-radius:12px; color:#087e8b; text-decoration:none; background:#f3f6f8; }

.portal-links>article {flex:1;min-width:220px;padding:28px;border:1px solid #c9d5df;border-radius:12px;color:#142f42;background:#f3f6f8;}
.portal-home button {padding:12px 16px;border:0;border-radius:7px;background:#087e8b;color:white;cursor:pointer;}
.portal-home button:disabled {opacity:.5;cursor:wait;}
.portal-nav {flex-wrap:wrap;}

```

## frontend/src/coordination.css
```
@scope (.coordination-root, .workflow-content) {
.coordination-root,.workflow-content{font-family:Inter,'Segoe UI',sans-serif;color:#163747;background:#f3f6f8;font-synthesis:none;text-rendering:optimizeLegibility;font-size:16px}
*{box-sizing:border-box}body{margin:0}button,input,select,textarea{font:inherit}button,a,input,select,textarea{touch-action:manipulation}button{display:inline-flex;align-items:center;justify-content:center;gap:8px;padding:10px 15px;border:1px solid #bdced6;border-radius:7px;background:white;color:#173e4d;font-weight:600;cursor:pointer;min-height:42px}button:hover{background:#e7f3f3;border-color:#087e8b}button:disabled{opacity:.55;cursor:not-allowed}button:focus-visible,a:focus-visible,input:focus-visible,select:focus-visible,textarea:focus-visible,summary:focus-visible{outline:3px solid #00a6aa;outline-offset:3px}a{color:#08727d}h1,h2,h3,p{margin-top:0}h1{font-size:2rem;letter-spacing:-.035em;margin-bottom:10px}h2{font-size:1.25rem;margin-bottom:12px}h3{font-size:1.05rem}p{line-height:1.6}small,.cw-muted{color:#506b78;font-size:.875rem}.cw-muted{line-height:1.6}.cw-row{display:flex;align-items:center;justify-content:space-between;gap:18px;flex-wrap:wrap}.cw-stack{display:grid;gap:22px}.cw-card{background:white;border:1px solid #d7e2e7;padding:25px;border-radius:12px;min-width:0;box-shadow:0 3px 8px #173b4d04}.cw-card>svg{color:#087e8b;margin-bottom:20px}.cw-primary{background:#087e8b;color:white;border-color:#087e8b}.cw-primary:hover{background:#066570;color:white}.cw-badge{display:inline-flex;padding:5px 10px;border-radius:5px;background:#edf2f5;color:#385563;font-size:.8125rem;font-weight:650;text-transform:capitalize;white-space:nowrap}.cw-badge.pending,.cw-badge.warning,.cw-badge.reported{background:#fff0d6;color:#805300}.cw-badge.approved,.cw-badge.delivered,.cw-badge.open,.cw-badge.resolved{background:#dbf3e9;color:#176345}.cw-badge.critical,.cw-badge.high,.cw-badge.closed,.cw-badge.rejected{background:#ffe4e0;color:#a22d26}.cw-error{padding:14px;border:1px solid #efc1ba;background:#fff1ee;color:#982e22;border-radius:7px;overflow-wrap:anywhere}.cw-success{color:#176345;margin:12px 0 0}.cw-empty{padding:26px;border:1px dashed #b5c9d2;border-radius:9px;color:#58717c;background:#f9fbfc}.cw-actions{display:flex;gap:10px;flex-wrap:wrap}
.cw-shell{display:flex;min-height:100vh}.cw-sidebar{width:255px;background:#102e40;color:white;padding:30px 20px;position:fixed;inset:0 auto 0 0;display:flex;flex-direction:column;z-index:1001;overflow:auto}.cw-brand{display:flex;align-items:center;gap:12px;color:inherit;text-decoration:none;font-size:1.1rem;letter-spacing:.055em;font-weight:750}.cw-brand small{display:block;color:inherit;font-size:.65rem;letter-spacing:.11em;margin-top:5px;opacity:.8}.cw-nav-label{margin-top:36px;font-size:.875rem;color:#b2c9d5}.cw-sidebar nav{display:grid;gap:7px}.cw-sidebar nav button{justify-content:flex-start;background:transparent;border:0;color:#d2e2e9;padding:12px;font-size:.9rem;text-align:left}.cw-sidebar nav button:hover,.cw-sidebar nav button.active{background:#1d5362;color:#fff}.cw-count{margin-left:auto;border-radius:5px;background:#0b8992;color:white;padding:2px 6px;font-size:.75rem}.cw-account{margin-top:auto;padding-top:35px;display:grid;gap:9px}.cw-account small{color:#acc3cf}.cw-account button{background:transparent;color:#d4e8ef;border-color:#4a6574;justify-content:flex-start}.cw-main{margin-left:255px;flex:1;min-width:0}.cw-topbar{height:65px;border-bottom:1px solid #d9e3e8;background:#fff;padding:0 36px;display:flex;align-items:center;justify-content:space-between;font-size:.875rem;gap:10px}.cw-content{max-width:1320px;margin:auto;padding:32px 36px}.cw-heading{display:flex;justify-content:space-between;align-items:center;gap:20px;margin-bottom:24px}.cw-heading p{margin-bottom:0;color:#526f7c}.cw-eyebrow{font-size:.75rem;font-weight:750;letter-spacing:.13em;color:#087e8b!important;margin-bottom:12px!important}.cw-stats{display:grid;grid-template-columns:repeat(4,1fr);gap:15px}.cw-stats article{padding:22px;background:white;border:1px solid #d7e2e7;border-radius:10px}.cw-stats strong{display:block;font-size:2rem;margin-top:12px;color:#123a49}.cw-facts{display:flex;gap:28px;flex-wrap:wrap;margin:20px 0 24px}.cw-facts span{display:grid;gap:6px;font-size:.875rem;color:#506b78}.cw-facts strong{font-size:1.05rem;color:#153d4a}.cw-footer{font-size:.8125rem;color:#617b87;padding-top:36px;text-align:center}
.cw-form fieldset{border:0;padding:0;margin:18px 0 0;display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:16px}.cw-form fieldset>p{grid-column:1/-1;margin:0}.cw-form fieldset>button{justify-self:start;align-self:end}.cw-field{display:flex;flex-direction:column;gap:7px;font-size:.875rem;font-weight:600;min-width:0}.cw-field input,.cw-field select,.cw-field textarea{width:100%;padding:11px;border:1px solid #b6cad4;border-radius:6px;color:#153b4a;background:white;font-weight:400;min-height:44px}.cw-field textarea{min-height:100px;resize:vertical}.cw-field select{appearance:none;background-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='16' height='16' viewBox='0 0 16 16'%3E%3Cpath d='m4 6 4 4 4-4' fill='none' stroke='%23395565' stroke-width='1.5'/%3E%3C/svg%3E");background-repeat:no-repeat;background-position:right 12px center;padding-right:34px}.cw-card details{border-top:1px solid #e0e8ec;padding:16px 0 2px;margin-top:18px}.cw-card summary{cursor:pointer;font-weight:600;padding:4px 0;color:#08717d}.cw-card details[open] summary{margin-bottom:12px}.cw-table{overflow:auto;margin:20px 0}.cw-table table{border-collapse:collapse;width:100%;font-size:.875rem;text-align:left}.cw-table th{background:#edf3f6;color:#3d5b68;font-weight:650;white-space:nowrap}.cw-table th,.cw-table td{padding:13px 15px;border-bottom:1px solid #dde6ea}.cw-table td{overflow-wrap:anywhere}.cw-card li{padding:7px 0;line-height:1.5;overflow-wrap:anywhere}
.cw-home{max-width:1150px;margin:auto;padding:55px 35px 80px}.cw-home>.cw-brand{margin-bottom:75px;color:#0d4354}.cw-home h1{font-size:3.5rem;line-height:1.08;max-width:700px}.cw-intro{font-size:1.125rem;color:#4c6876;max-width:650px;margin:24px 0 35px}.cw-role-grid{display:grid;grid-template-columns:repeat(2,1fr);gap:20px;margin:30px 0}.cw-role-grid .cw-card{display:flex;flex-direction:column}.cw-role-grid .cw-card p{flex:1}.cw-role-grid button{align-self:flex-start}.cw-login{max-width:650px}.cw-loading{padding:80px 30px;text-align:center;font-size:1.1rem}
@media(min-width:1500px){.cw-role-grid{grid-template-columns:repeat(4,1fr)}.cw-home{max-width:1400px}}
@media(max-width:900px){.cw-sidebar{width:210px;padding:24px 14px}.cw-main{margin-left:210px}.cw-content{padding:24px}.cw-topbar{padding:0 24px}.cw-stats{grid-template-columns:repeat(2,1fr)}.cw-form fieldset{grid-template-columns:1fr}}
@media(max-width:640px){.cw-shell{display:block}.cw-sidebar{position:static;width:auto;padding:18px}.cw-sidebar nav{display:flex;overflow:auto;gap:5px;padding:10px 0}.cw-sidebar nav button{flex-shrink:0}.cw-sidebar .cw-nav-label{margin:15px 0 0}.cw-account{padding:8px 0 0;margin:0;display:flex;align-items:center;justify-content:space-between;gap:10px}.cw-account small{display:none}.cw-account button{min-height:36px;padding:6px 10px}.cw-main{margin-left:0}.cw-topbar{padding:10px 18px;height:auto;min-height:55px}.cw-content{padding:22px 16px}.cw-card{padding:20px}.cw-heading{align-items:flex-start}.cw-heading h1{font-size:1.75rem}.cw-heading>button{font-size:.8125rem;padding:8px}.cw-stats{gap:10px}.cw-stats article{padding:16px}.cw-facts{gap:20px}.cw-home{padding:28px 20px}.cw-home>.cw-brand{margin-bottom:48px}.cw-home h1{font-size:2.5rem}.cw-role-grid{grid-template-columns:1fr}.cw-row h3{overflow-wrap:anywhere}.cw-table{max-width:100%}}

}

```

## frontend/src/workspace.css
```
@font-face {
  font-family: Inter;
  src: url('@fontsource-variable/inter/files/inter-latin-wght-normal.woff2') format('woff2');
  font-weight: 100 900;
  font-style: normal;
  font-display: swap;
}
/* Operational surfaces share tokens while the entry page keeps its own styles. */
:is(.cw-shell, .port-portal, .driver-portal, .driver-dialog) {
  --ink: #18181b;
  --muted: #52525b;
  --line: #e4e4e7;
  --paper: #f4f4f5;
  --forest: #047857;
  --mint: #34d399;
  --rail: 232px;
  --night: radial-gradient(ellipse at 95% 0%, #12382d 0%, transparent 42%), linear-gradient(160deg, #18181b, #080809 85%);
  font-family: Inter, "Segoe UI", sans-serif;
  font-variant-numeric: tabular-nums;
  color: var(--ink);
  background: var(--paper);
}
:is(.cw-shell,.port-portal) .workspace-nav {
  background: var(--night); box-sizing: border-box; color: white; padding: 32px 16px 20px;
  position: fixed; inset: 0 auto 0 0; width: var(--rail); height: 100dvh; overflow-y: auto;
  display: flex; flex-direction: column; z-index: 1001;
}
.workspace-nav .workspace-brand {
  display: flex; align-items: center; gap: 10px; padding: 0 8px; color: white;
  text-decoration: none; letter-spacing: -.05em; font-size: 22px; font-weight: 650;
}
.workspace-brand svg { box-sizing: content-box; background: #34d399; color: #052e21; border-radius: 12px; padding: 8px; width: 21px; height: 21px; }
.workspace-role { color: #a1a1aa; margin: 40px 12px 12px; font-size: 11px; font-weight: 650; text-transform: uppercase; letter-spacing: .12em; }
.workspace-nav nav { display: grid; gap: 4px; }
.workspace-nav :is(nav button,.workspace-account button,.workspace-toggle) {
  display: flex; align-items: center; justify-content: flex-start; gap: 12px; min-height: 44px; margin: 0;
  font-weight: 550; line-height: 1.3; font-family: inherit; font-size: 14px; padding: 10px 12px;
  background: transparent; color: #d4d4d8; border: 1px solid transparent; border-radius: 12px; cursor: pointer;
}
.workspace-nav nav button:hover,.workspace-nav .workspace-account button:hover { background: #ffffff10; color: white; }
.workspace-nav nav button[aria-current] { color: #a7f3d0; background: #34d39919; border-color: #34d39938; }
.workspace-nav nav button span { margin-left: auto; }
.workspace-account { display: grid; gap: 4px; margin-top: auto; padding: 24px 8px 0; }
.workspace-account small { color: #a1a1aa; }
.workspace-account button { margin-top: 8px; }
.workspace-nav .workspace-toggle { display: none; }
.cw-shell .cw-main,.port-portal .layout > main { margin-left: var(--rail); min-width: 0; width: calc(100% - var(--rail)); }
.port-portal .layout > main { padding-inline: clamp(16px, 3vw, 48px); }
.cw-shell .cw-content,.port-portal .layout > main > * { max-width: 1600px; margin-inline: auto; }
.cw-shell .cw-content { padding-inline: clamp(16px, 3vw, 48px); }
.cw-shell .cw-topbar,.port-portal main > header { min-height: 56px; height: auto; background: transparent; border-color: var(--line); color: var(--muted); }
:is(.cw-shell,.port-portal,.driver-portal) :is(h1,h2,h3) { color: inherit; letter-spacing: -.045em; }
.cw-heading h1,.port-portal .title h1 { font-size: clamp(28px, 3vw, 40px); line-height: 1.12; font-weight: 650; }
:is(.cw-shell,.port-portal,.driver-portal) :is(.cw-card,.cw-stats article),.port-portal :is(.stats article,.split > section,main > section) {
  border: 1px solid var(--line); border-radius: 24px; background: white; box-shadow: 0 4px 18px #18181b06;
}
:is(.cw-shell,.port-portal) :is(.cw-stats,.stats) { padding: 12px; gap: 8px; background: var(--night); border-radius: 32px; }
:is(.cw-shell,.port-portal) :is(.cw-stats,.stats) article {
  padding: clamp(16px, 2vw, 28px); background: #ffffff0d; border-color: #ffffff1c; border-radius: 20px; color: white;
}
:is(.cw-shell,.port-portal) :is(.cw-stats,.stats) article :is(small,p) { color: #d4d4d8; }
:is(.cw-shell,.port-portal) :is(.cw-stats,.stats) strong { color: white; letter-spacing: -.05em; line-height: 1.15; }
:is(.cw-shell,.port-portal,.driver-portal) .workflow-content { background: transparent; color: var(--ink); }
:is(.cw-shell,.port-portal,.driver-portal) :is(.cw-muted,.cw-facts span,.cw-heading p) { color: var(--muted); }
:is(.cw-shell,.port-portal,.driver-portal) :is(.cw-facts strong,.cw-field) { color: var(--ink); }
:is(.cw-shell,.port-portal,.driver-portal) :is(.cw-field input,.cw-field select,.cw-field textarea,.cw-empty) { border-color: #d4d4d8; border-radius: 12px; color: var(--ink); }
:is(.cw-shell,.port-portal,.driver-portal) :is(.cw-primary,.cw-primary:hover),.port-portal .title button { background: var(--ink); border-color: var(--ink); color: white; border-radius: 12px; }
.cw-shell .cw-heading button { border-radius: 999px; border-color: var(--line); color: var(--ink); }
:is(.cw-shell,.port-portal,.driver-portal) :is(.cw-badge,.badge) { border-radius: 999px; }
:is(.cw-shell,.port-portal,.driver-portal) .cw-badge:is(.in_transit,.in_progress,.assigned,.confirmed) { background: #dbeafe; color: #1e40af; }
:is(.cw-shell,.port-portal,.driver-portal) .cw-badge.slot_suggested { background: #fef3c7; color: #854d0e; }
:is(.cw-shell,.port-portal,.driver-portal) :is(.cw-table,.tablewrap) { overflow: auto; max-width: 100%; }
:is(.cw-shell,.port-portal) :is(.cw-table,.tablewrap) th { background: #f4f4f5; color: #52525b; }
:is(.cw-shell,.port-portal) :is(.cw-table,.tablewrap) tbody tr:hover { background: #fafafa; }
:is(.cw-shell,.port-portal,.driver-portal,.driver-dialog) :focus-visible { outline: 3px solid #059669; outline-offset: 3px; }
.driver-portal { --navy: #18181b; --teal: #047857; --border: #e4e4e7; }
.driver-portal .cockpit-header { background: var(--night); }
.driver-portal .brand-icon { background: #34d399; color: #052e21; border-color: transparent; border-radius: 12px; }
.driver-portal .driver-profile button { color: #18181b; border-radius: 999px; }
.driver-portal .demo-ribbon,.driver-portal .cargo-details { background: #f4f4f5; color: #52525b; }
.driver-portal .demo-badge { border-color: #ffffff30; background: #ffffff10; border-radius: 999px; }
.driver-portal .rail-tabs button[aria-pressed=true] { background: #d1fae5; color: #065f46; }
.driver-portal .route-option,.driver-portal .temperature,.driver-portal .cargo-details { border-radius: 16px; }
.driver-portal .route-option.selected { background: #f0fdf4; }
.driver-portal .badge.pending { background: #fef3c7; color: #854d0e; }
.driver-portal .map-legend { color: #27272a; border-radius: 12px; background: #fffffff0; backdrop-filter: blur(12px); }
.driver-portal .leaflet-tile-pane { filter: saturate(.45); }
.port-portal .crisis-workspace { --color-slate-900: #18181b; --color-slate-800: #27272a; --color-slate-700: #3f3f46; }
.port-portal .crisis-simulator { font-family: inherit; background: var(--night); border-radius: 24px; overflow: clip; color: #fafafa; }
.port-portal .crisis-workspace :is(.card,.kpi-card) { background: #27272a; border-color: #3f3f46; border-radius: 16px; }
.port-portal .crisis-workspace .btn-primary { background: #047857; }
@media(max-width: 900px) {
  :is(.cw-shell,.port-portal) { --rail: 0px; }
  :is(.cw-shell,.port-portal .layout) { display: block; }
  :is(.cw-shell,.port-portal) .workspace-nav { position: relative; width: 100%; height: auto; padding: 12px 16px; display: grid; grid-template-columns: 1fr auto; align-items: center; gap: 8px; }
  .workspace-nav .workspace-brand { padding: 0; font-size: 20px; }
  .workspace-role { display: none; }
  .workspace-nav .workspace-toggle { display: flex; border-color: #ffffff38; }
  .workspace-nav nav,.workspace-account { display: none; }
  .workspace-nav nav[data-expanded=true] { display: grid; grid-template-columns: repeat(2,minmax(0,1fr)); grid-column: 1/-1; }
  .workspace-nav nav[data-expanded=true] + .workspace-account { display: flex; grid-column: 1/-1; align-items: center; flex-wrap: wrap; padding: 8px; gap: 12px; }
  .workspace-account button { margin: 0; }
}
@media(max-width: 640px) {
  :is(.cw-shell,.port-portal) :is(.stats,.cw-stats) { grid-template-columns: repeat(2,minmax(0,1fr)); padding: 8px; border-radius: 24px; }
  :is(.cw-shell,.port-portal) :is(.stats,.cw-stats) article { padding: 14px; border-radius: 16px; }
  .port-portal .stats strong { font-size: 24px; }
}
@media(prefers-reduced-motion: no-preference) {
  .cw-heading,.port-portal .title { animation: workspace-enter .6s cubic-bezier(.16,1,.3,1); }
  .workspace-nav button { transition: background-color .2s, border-color .2s; }
  @keyframes workspace-enter { from { opacity: 0; transform: translateY(12px); } }
}

.driver-portal .map-legend .active-line { background: #047857; }
.driver-portal .map-legend .alternative-line { background: none; border-top: 3px dashed #71717a; }
.driver-portal .map-legend .preview-line { border-color: #1d4ed8; }
.driver-portal .map-legend .blocked-line { border-top: 3px dotted #b91c1c; }
.driver-portal .map-legend .requested-line { border-top: 3px dotted #92400e; }
.driver-portal .request-timeline { margin: 12px 0 0; padding-inline-start: 24px; border-left: 2px solid var(--line); color: var(--muted); }
@media(min-width: 1200px) {
  .cw-shell .cw-stats { grid-template-columns: repeat(6, minmax(0,1fr)); }
}
@media(min-width: 901px) and (max-width: 1199px) {
  .cw-shell .cw-stats { grid-template-columns: repeat(3,minmax(0,1fr)); }
}
.workspace-nav::before {
  content: ""; position: absolute; inset: 0; pointer-events: none; opacity: .045;
  background-image: url("data:image/svg+xml,%3Csvg viewBox='0 0 150 150' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='.88' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E");
  background-size: 150px;
}
.port-portal .cw-badge { display: inline-flex; padding: 4px 10px; font-size: 13px; font-weight: 600; background: #f4f4f5; color: #3f3f46; }
.port-portal .cw-badge:is(.eligible,.approved,.delivered) { background: #d1fae5; color: #065f46; }
.port-portal .cw-badge:is(.warning,.pending) { background: #fef3c7; color: #854d0e; }
.port-portal .cw-badge:is(.high,.blocked,.critical,.rejected) { background: #fee2e2; color: #991b1b; }
.driver-portal .route-footer button.primary { background: white; color: #18181b; border: 1px solid #d4d4d8; border-radius: 999px; justify-content: space-between; padding: 4px 4px 4px 20px; }
.driver-portal .route-footer button.primary svg { box-sizing: border-box; color: white; background: #18181b; border-radius: 50%; width: 40px; height: 40px; padding: 12px; }
@media(prefers-reduced-motion: no-preference) {
  .driver-portal .route-footer button.primary { transition: transform .2s; }
  .driver-portal .route-footer button.primary:hover:not(:disabled) { transform: scale(1.02); }
}
.overview-weather > summary { cursor: pointer; font-weight: 650; }
.overview-weather[open] > summary { margin-bottom: 16px; }

```
