// ============================================================
// UKW - Ubiquitin Knowledge Warehouse
// 07b. Evidence for UniProt features.
//   ECO code descriptions + links to PubMed / UniProtKB / PDB / PROSITE-ProRule.
//   Example: evidence = "ECO:0007744|PubMed:23186163".
//
// Public functions: evidenceHtml(feature, {full, cap}), parseEvidence, ecoLabel.
// Dependency: escapeHtml.
// ============================================================
const ECO_LABELS = {
    "ECO:0000269": "experimental evidence used in manual assertion",
    "ECO:0000250": "sequence similarity evidence used in manual assertion",
    "ECO:0000255": "match to sequence model evidence used in manual assertion",
    "ECO:0000305": "curator inference used in manual assertion",
    "ECO:0000303": "non-traceable author statement used in manual assertion",
    "ECO:0000312": "imported information used in manual assertion",
    "ECO:0000244": "combinatorial evidence used in manual assertion",
    "ECO:0007744": "combinatorial computational and experimental evidence used in manual assertion",
    "ECO:0000256": "match to sequence model evidence used in automatic assertion",
    "ECO:0000259": "match to InterPro member signature evidence used in automatic assertion",
    "ECO:0000501": "evidence used in automatic assertion",
    "ECO:0000313": "imported information used in automatic assertion",
    "ECO:0000213": "combinatorial evidence used in automatic assertion",
    "ECO:0007829": "combinatorial computational and experimental evidence used in automatic assertion",
    "ECO:0007669": "computational evidence used in automatic assertion"
};

const ecoCache = {};            // Cache ECO codes not in the built-in table after querying QuickGO.
const ecoPending = new Set();
const ecoListeners = new Set(); // Notify the view to redraw when a new label is found.

function ecoLabel(code) {
    code = String(code || "").trim().toUpperCase();
    if (ECO_LABELS[code]) return ECO_LABELS[code];
    if (ecoCache[code]) return ecoCache[code];

    if (/^ECO:\d+$/.test(code) && !ecoPending.has(code)) {
        ecoPending.add(code);
        fetch(`https://www.ebi.ac.uk/QuickGO/services/ontology/eco/terms/${encodeURIComponent(code)}`,
              { headers: { Accept: "application/json" } })
            .then(r => (r.ok ? r.json() : null))
            .then(j => {
                const name = j && j.results && j.results[0] && j.results[0].name;
                if (name) {
                    ecoCache[code] = name;
                    ecoListeners.forEach(fn => { try { fn(); } catch (e) { /* ignore */ } });
                }
            })
            .catch(() => { /* Show only the code if lookup fails. */ });
    }
    return "";
}

// Normalize a feature's evidence into [{eco, db, acc}].
function parseEvidence(ft) {
    const rows = Array.isArray(ft && ft.evidence) ? ft.evidence : [];
    const out = [];
    const seen = new Set();

    const push = (eco, db, acc) => {
        eco = String(eco || "").trim();
        db = String(db || "").trim();
        acc = String(acc || "").trim();
        if (!eco && !db && !acc) return;
        const key = eco + "|" + db + "|" + acc;
        if (seen.has(key)) return;
        seen.add(key);
        out.push({ eco, db, acc });
    };

    rows.forEach(r => {
        const raw = String(r.raw_evidence || "");
        const complete = r.evidence_code && (r.database_name || !raw.includes("|"));

        if (complete) {
            push(r.evidence_code, r.database_name, r.accession);
            return;
        }

        // Example: "ECO:0007744|PubMed:23186163" (multiple entries may be comma-separated).
        raw.split(",").forEach(chunk => {
            const parts = chunk.split("|").map(x => x.trim()).filter(Boolean);
            const eco = parts.find(x => /^ECO:\d+/i.test(x)) || r.evidence_code || "";
            const other = parts.find(x => !/^ECO:/i.test(x) && x.includes(":"));
            let db = r.database_name || "", acc = r.accession || "";
            if (other) {
                const i = other.indexOf(":");
                db = db || other.slice(0, i);
                acc = acc || other.slice(i + 1);
            }
            push(eco, db, acc);
        });
    });

    return out;
}

function evidenceLink(db, acc) {
    if (!db && !acc) return "";
    const label = escapeHtml(`${db}${db && acc ? ":" : ""}${acc}`);
    const a = encodeURIComponent(acc);

    if (/^pubmed$/i.test(db) && /^\d+$/.test(acc)) {
        return `<a href="https://pubmed.ncbi.nlm.nih.gov/${a}/" target="_blank" rel="noopener noreferrer">${label}</a>`;
    }
    if (/^uniprotkb$/i.test(db) && acc) {
        return `<a href="https://www.uniprot.org/uniprotkb/${a}" target="_blank" rel="noopener noreferrer">${label}</a>`;
    }
    if (/^pdb$/i.test(db) && acc) {
        return `<a href="https://www.rcsb.org/structure/${a}" target="_blank" rel="noopener noreferrer">${label}</a>`;
    }
    if (/^prosite-prorule$/i.test(db) && acc) {
        return `<a href="https://prosite.expasy.org/rule/${a}" target="_blank" rel="noopener noreferrer">${label}</a>`;
    }
    return label;
}

// opts.full: show the full ECO description (one entry per line); opts.cap: maximum number of entries to show.
function evidenceHtml(ft, opts = {}) {
    const ev = parseEvidence(ft);
    if (!ev.length) return "";

    const cap = opts.cap || 99;
    const shown = ev.slice(0, cap);

    const items = shown.map(e => {
        const parts = [];

        if (e.eco) {
            const lab = ecoLabel(e.eco);
            parts.push(`<span title="${escapeHtml(lab || e.eco)}" style="border:1px solid #aaa;border-radius:8px;padding:0 5px;cursor:help">${escapeHtml(e.eco)}</span>`
                + (opts.full && lab ? ` <span style="color:#666">${escapeHtml(lab)}</span>` : ""));
        }

        const link = evidenceLink(e.db, e.acc);
        if (link) parts.push(link);

        return parts.join(" · ");
    });

    if (ev.length > shown.length) items.push(`…and ${ev.length - shown.length} more`);

    return `<div class="ukw-evd" style="font-size:.85em;color:#555;margin-top:2px">Evidence: ${items.join(opts.full ? "<br>" : "; ")}</div>`;
}
