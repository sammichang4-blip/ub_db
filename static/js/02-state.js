// ============================================================
// UKW - Ubiquitin Knowledge Warehouse
// 02. Global DOM references + application state
// ============================================================

// DOM references (populated by cacheDOM() in 03-utils.js)
let resultsList = null;
let detailPane = null;
let searchForm = null;
let searchInput = null;
let currentSearchKeyword = "";
// ============================================================
// Application state
// ============================================================

var currentProteinId = null;
var currentData = null;
var currentProtein = null;

var currentDomains = [];

// ============================================================
// Mol* state
// ============================================================
let pdbViewer = null;      // Main-page Mol* viewer instance
let currentPdbId = null;   // e.g. "1ABC"
let currentPdbUrl = null;  // e.g. "/data/pdb/1ABC.pdb"

// When Domain Explorer opens, it moves the #pdb-viewer DOM node
// from the main page into the Explorer modal. These variables record its original location
// so closeDomainExplorer() can move it back when the modal closes.


// ============================================================
// Expanded structure modal state
// ============================================================
let viewerOriginalParent = null;
let viewerPlaceholder = null;

// ============================================================
// Cytoscape state
// ============================================================
let cy = null;
