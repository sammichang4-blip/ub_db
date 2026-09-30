// ============================================================
// UKW - Ubiquitin Knowledge Warehouse
// 02. Global DOM references + application state
// ============================================================

// DOM references (populated by cacheDOM() in 03-utils.js)
let resultsList = null;
let detailPane = null;
let searchForm = null;
let searchInput = null;

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

// Domain Explorer 開啟時，會把 #pdb-viewer 這個 DOM 節點
// 從主畫面搬到 Explorer modal 裡；這兩個變數記錄「原本在哪」，
// 讓 closeDomainExplorer() 關閉時能把它搬回去


// ============================================================
// Expanded structure modal state
// ============================================================
let viewerOriginalParent = null;
let viewerPlaceholder = null;

// ============================================================
// Cytoscape state
// ============================================================
let cy = null;
