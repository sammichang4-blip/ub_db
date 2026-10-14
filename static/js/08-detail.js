// ============================================================
// UKW - Ubiquitin Knowledge Warehouse
// 08. renderDetail() — builds the whole right-hand detail pane
//     and kicks off the Mol* viewer + Cytoscape network for it
// ============================================================

function renderDetail(data) {
    const p = data.protein;
    window.currentProteinData = data;
    window.currentProteinLength = p.length;
    window.currentDomains = data.domains || [];
    window.currentProtein = p;
    window.currentProteinSequence = p.sequence || "";
    window.currentProteinFeatures = data.features || [];
    window.activeFeatureCategories = [];   // 換蛋白質時重置分類選取

    console.log("renderDetail:", data);

    if (!detailPane) {
        return;
    }

    // Tear down the previous protein's viewers
    destroyNetwork();

    if (pdbViewer) {
        try {
            if (pdbViewer.plugin && typeof pdbViewer.plugin.clear === "function") {
                pdbViewer.plugin.clear();
            }
        }
        catch (error) {
            console.warn("Mol* clear:", error);
        }

        pdbViewer = null;
    }

    currentPdbId = null;
    currentPdbUrl = null;
    
    

    detailPane.innerHTML = `
        <div class="section-grid">

            <!-- Structure Viewer -->
            <div class="structure-viewer-card">
                <button onclick="openPDBViewer()">🔍 放大 Structure Viewer</button>
                <div id="pdb-viewer"></div>
                <div style="margin-top:8px; color:var(--ink-dim);">
                    請點選下側 PDB ID 以載入結構，或使用上方搜尋框查詢其他蛋白質。
                </div>
            </div>

            <!-- Cytoscape network -->
            <div class="relation-viewer-card">
                <div id="network-toolbar">
                    <button class="network-btn" onclick="openNetworkWindow('${escapeHtml(p.gene_name)}')">Full Screen</button>
                    <button onclick="changeLayout('dagre')">Dagre</button>
                    <button onclick="changeLayout('grid')">Grid</button>
                    <button onclick="changeLayout('circle')">Circle</button>
                    <button onclick="changeLayout('breadthfirst')">Tree</button>
                    <button onclick="changeLayout('cose')">COSE</button>
                    <button onclick="changeLayout('concentric')">Concentric</button>
                    <button onclick="changeLayout('random')">Random</button>
                </div>
                <div id="cy"></div>
            </div>


            <!-- Experimental + predicted structures -->
            <div class="scroll-box section-card structure-card">
                <h5 style="margin-top:1em;">🧬 實驗結構（PDB）</h5>
                ${renderStructures(data.structures)}

                <h5 style="margin-top:1em;">🔮 預測結構（AlphaFold / AlphaFill / SWISS-MODEL）</h5>
                ${renderPredictedStructures(data.predicted_structures)}
            </div>

            <!-- Domain architecture -->
            <div class="section-card">
                <div class="scroll-box">${renderDomains(data.domains, p.length)}</div>
            </div>


            <!-- Protein header + papers + description -->
            <div class="section-card protein-header">
                <h2>
                    ${escapeHtml(p.protein_name)}
                    <span style="color:var(--ink-dim); font-weight:400;">
                        (${escapeHtml(p.gene_name)})
                        <button class="expand-btn" onclick="openExpandedView()" title="開新視窗放大檢視">🔍 放大檢視</button>
                    </span>
                </h2>


                <div class="scroll-box papers">
                    <div class="meta">

                        <div>
                            UniProt:
                            ${escapeHtml(p.uniprot_acc)}
                            · ${escapeHtml(p.entry_name || "")}
                            · ${escapeHtml(p.organism)}
                            · ${escapeHtml(p.length)} aa
                        </div>
                        <p>
                        <b>Gene alias:</b>
                        ${highlightSearch(
                            (p.gene_alias || [])
                                .map(a => a.gene_alias)
                                .join(" ; "),
                            currentSearchKeyword
                        )}
                        <p>
                        <b>Protein alias:</b>
                        ${highlightSearch(
                            (p.protein_alias || [])
                                .map(a => a.alias_name)
                                .join(" ; "),
                            currentSearchKeyword
                        )}

                    </div>

                
                    <div style="display:flex; justify-content:space-between; align-items:center;">
                        <h5 style="margin-top:1em;">📄 相關論文（PubMed，近期）</h5>
                        
                    </div>

                    ${renderPapers(data.papers)}

                    <h5 style="margin-top:1em; color:var(--ink-dim);">🗂 功能描述（UniProt，較舊）</h5>
                    <div class="desc">${renderDescription(p.description)}</div>
                </div>
            </div>

            <!-- Sequence -->
            <div class="section-card">
                <h3>
                    ◈ 序列 Sequence
                    <button class="copy-btn" onclick="copySequence()">📋 Copy</button>
                    <button class="copy-btn" style="margin-left:auto" onclick="openSequenceView()">🔍 放大</button>
                </h3>

                <div class="scroll-box">
                    <div class="seq-block">

                        <!-- =====================================================
                            Feature Category
                            ===================================================== -->
                        <div class="feature-category-bar">

                            <button
                                type="button"
                                class="feature-category-btn"
                                data-category="structural"
                                onclick="toggleFeatureCategory('structural')">
                                Structure
                            </button>

                            <button
                                type="button"
                                class="feature-category-btn"
                                data-category="localization"
                                onclick="toggleFeatureCategory('localization')">
                                Localization
                            </button>

                            <button
                                type="button"
                                class="feature-category-btn"
                                data-category="functional"
                                onclick="toggleFeatureCategory('functional')">
                                Functional
                            </button>

                            <button
                                type="button"
                                class="feature-category-btn"
                                data-category="modification"
                                onclick="toggleFeatureCategory('modification')">
                                Modification
                            </button>

                            <button
                                type="button"
                                class="feature-category-btn"
                                data-category="variation"
                                onclick="toggleFeatureCategory('variation')">
                                Variation
                            </button>


                        </div>

                        <!-- =====================================================
                            Sequence
                            ===================================================== -->
                        <div
                            id="protein-sequence"
                            class="seq-wrap"
                            data-sequence="${escapeHtml(p.sequence || "")}"
                        >
                            ${renderSequence(p.sequence || "", window.currentProteinFeatures)}
                        </div>

                        <!-- =====================================================
                            Feature Details
                            ===================================================== -->
                        <div
                            id="feature-details"
                            class="feature-details"
                            style="display:none;"
                        ></div>

                        <!-- =====================================================
                            Legend
                            ===================================================== -->
                        <div class="ruler-legend">

                            <span>
                                <span class="dot gold"></span>
                                已知多泛素鏈接 Lysine 位點
                                (K${LYSINE_SITES.join(", K")})
                            </span>

                            <span>
                                <span class="dot rose"></span>
                                C端 Gly-Gly（與受質共價鍵結位置）
                            </span>

                        </div>

                    </div>
                </div>
            </div>
            <!-- GO functions -->
            <div class="section-card">

                <h3>◈ 功能 Function（GO 註解 + 細胞胞器對照）</h3>
                <div class="scroll-box" id="cellgo-panel-${data.protein.protein_id}">${renderCellGoView(data.functions)}</div>
            </div>

            <!-- E1-E2-E3-substrate relations -->
            <div class="section-card">
                <h3>◈ E1 – E2 – E3 – Substrate 關係鏈</h3>
                <div class="scroll-box">${renderRelations(data.ub_relations, p)}</div>
            </div>

        </div>
    `;

    // Mol* viewer needs the #pdb-viewer node to exist first
    setTimeout(async () => {
        const ready = await initViewer();

        if (!ready) {
            return;
        }

        const active = data.active_structure;

        if (active && active.url) {
            currentPdbId = active.source === "pdb" ? active.id : null;
            currentPdbUrl = active.url;
            window.currentStructureSource = active.source; // 'pdb' | 'alphafold' | 'alphafill' | 'swiss_model'

            await showPDBStructure(active.url, active.format);
        } else {
            console.warn("No experimental or predicted structure available to load into Mol*.");
            window.currentStructureSource = null;
        }
    }, 0);

    // Cytoscape network likewise needs the #cy node to exist first
    setTimeout(() => {
        if (p.gene_name) {
            loadNetwork(p.gene_name);
        }
    }, 0);
}