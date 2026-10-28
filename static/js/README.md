# UKW Frontend JavaScript Maintenance Guide

Frontend scripts are loaded through multiple `<script>` tags in `templates/index.html` and share the browser's global scope; these files are not ES modules. HTML contains inline event handlers, and scripts call one another's functions directly, so load order is a runtime requirement.

## File Responsibilities

| File | Primary Responsibility |
|---|---|
| `01-constants.js` | Shared constants, such as lysine site data |
| `02-state.js` | Shared frontend state and DOM references |
| `03-utils.js` | Shared DOM, string, and rendering utilities |
| `04-viewer.js` | Mol* structure viewer and structure loading |
| `05-search.js` | Search results, protein loading, enzyme classification, and filtering |
| `06-annotation-sections.js` | Structure, domain, GO, and ubiquitination relationship sections |
| `07-papers-sequence.js` | Function descriptions, papers, sequences, and related viewers |
| `08-detail.js` | Assembles and renders the protein detail panel |
| `09-network.js` | Cytoscape interaction network |
| `10-main.js` | Page initialization events, such as the search form |
| `11-domain.js` | Domain Explorer interactions and rendering |
| `cell_go_viewer.js` | Cell GO cellular localization viewer |
| `network.js`, `network_1.js` | Network page scripts; check which version is referenced by the template before use |
| `cell_go_viewer1.js`, `cell_go_viewer2.js` | Alternate versions of the Cell GO viewer; check which version is referenced by the template before use |

`*.old.js` files are legacy versions and should not be added to the production load list.

## `index.html` Load Order

Currently, `templates/index.html` loads the main-page scripts in this order:

```html
<script src="/static/js/01-constants.js"></script>
<script src="/static/js/02-state.js"></script>
<script src="/static/js/03-utils.js"></script>
<script src="/static/js/04-viewer.js"></script>
<script src="/static/js/05-search.js"></script>
<script src="/static/js/06-annotation-sections.js"></script>
<script src="/static/js/07-papers-sequence.js"></script>
<script src="/static/js/08-detail.js"></script>
<script src="/static/js/09-network.js"></script>
<script src="/static/js/10-main.js"></script>
<script src="/static/js/11-domain.js"></script>
```

Before changing the load order, check dependencies on global variables and functions between scripts. When adding a `<script>`, also verify the template path and check the browser developer tools for loading errors and console exceptions.

## Editing Guidelines

- Keep search, list filtering, and protein-loading logic in `05-search.js`; assemble the detail panel in `08-detail.js`.
- Reuse existing shared state and utilities to avoid creating conflicting global state across files.
- Functions called by HTML `onclick` handlers must remain globally accessible. If switching to modules or event delegation, update the template's event bindings as well.
- When changing API calls, verify the Flask routes and JSON fields, and test empty results, error responses, and valid data.
- When changing the structure viewer or network graph, confirm that Mol*, Cytoscape.js, and their dependent resources still load in the correct order and remain available.
