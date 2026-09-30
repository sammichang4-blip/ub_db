// ============================================================
// UKW - Ubiquitin Knowledge Warehouse
// 09. Cytoscape E1-E2-E3-substrate relation network
// ============================================================

function destroyNetwork() {
    if (cy) {
        try {
            cy.stop();
            cy.destroy();
        }
        catch (error) {
            console.warn("Cytoscape destroy failed:", error);
        }

        cy = null;
    }
}

async function loadNetwork(gene) {
    if (!gene) {
        return;
    }

    const container = document.getElementById("cy");

    if (!container) {
        console.warn("No #cy container");
        return;
    }

    if (typeof cytoscape === "undefined") {
        console.error("Cytoscape library not loaded");
        return;
    }

    console.log("loadNetwork:", gene);

    try {
        const res = await fetch(`/api/network/${encodeURIComponent(gene)}?level=1`);

        if (!res.ok) {
            throw new Error(`HTTP ${res.status}`);
        }

        const data = await res.json();
        const elements = [];

        (data.nodes || []).forEach(n => elements.push({ data: n }));
        (data.edges || []).forEach(e => elements.push({ data: e }));

        destroyNetwork();

        cy = cytoscape({
            container: container,
            elements: elements,

            layout: {
                name: "cose",
                directed: true,
                spacingFactor: 1.5,
                animate: false
            },

            style: [
                {
                    selector: "node",
                    style: {
                        "label": "data(label)",
                        "text-valign": "center",
                        "text-halign": "center",
                        "width": 80,
                        "height": 80,
                        "font-size": 14,
                        "font-weight": "bold",
                        "text-wrap": "wrap",
                        "text-max-width": 75,
                        "border-width": 2,
                        "border-color": "#555"
                    }
                },
                { selector: "node[type='E1']", style: { "background-color": "#228B22" } },
                { selector: "node[type='E2']", style: { "background-color": "#00BCD4" } },
                { selector: "node[type='E3']", style: { "background-color": "Violet" } },
                { selector: "node[type='DUB']", style: { "background-color": "#F28C28" } },
                { selector: "node[type='substrate']", style: { "background-color": "Gold" } },
                {
                    selector: "edge",
                    style: {
                        "width": 2,
                        "line-color": "#888",
                        "target-arrow-color": "#888",
                        "target-arrow-shape": "triangle",
                        "curve-style": "bezier"
                    }
                }
            ]
        });

        console.log("Network nodes:", cy.nodes().length);
        console.log("Network edges:", cy.edges().length);

        cy.on("tap", "node", function (evt) {
            const node = evt.target;
            const id = node.data("id");

            if (!id) {
                return;
            }

            expandNode(id);
        });
    }
    catch (error) {
        console.error("Network load failed:", error);
    }
}

async function expandNode(id) {
    if (!cy) {
        console.warn("Cytoscape not ready");
        return;
    }

    if (!id) {
        return;
    }

    console.log("Expand node:", id);

    try {
        const res = await fetch(`/api/network/${encodeURIComponent(id)}?level=2`);

        if (!res.ok) {
            throw new Error(`HTTP ${res.status}`);
        }

        const data = await res.json();
        const newElements = [];

        (data.nodes || []).forEach(n => {
            if (cy.getElementById(n.id).length) {
                return;
            }
            newElements.push({ data: n });
        });

        (data.edges || []).forEach(e => {
            if (cy.getElementById(e.id).length) {
                return;
            }
            newElements.push({ data: e });
        });

        if (newElements.length === 0) {
            console.log("No new network elements");
            return;
        }

        cy.add(newElements);

        cy.layout({
            name: "breadthfirst",
            directed: true,
            spacingFactor: 1.5,
            animate: true,
            fit: true,
            padding: 30
        }).run();

        console.log("Network nodes:", cy.nodes().length);
    }
    catch (error) {
        console.error("Expand node failed:", error);
    }
}

window.changeLayout = function (type) {
    if (!cy) {
        console.log("Cytoscape not ready");
        return;
    }

    cy.stop();

    const option = {
        name: type,
        animate: true,
        fit: true,
        padding: 30
    };

    switch (type) {
        case "breadthfirst":
            option.directed = true;
            option.spacingFactor = 1.5;
            break;

        case "dagre":
            option.rankDir = "LR";
            option.nodeSep = 100;
            option.rankSep = 150;
            break;

        case "cose":
            option.idealEdgeLength = 150;
            option.nodeRepulsion = 8000;
            break;

        case "grid":
            option.rows = undefined;
            break;

        case "circle":
            option.avoidOverlap = true;
            break;

        case "concentric":
            option.minNodeSpacing = 50;
            break;

        case "random":
            break;
    }

    try {
        cy.layout(option).run();
    }
    catch (error) {
        console.error("Layout failed:", type, error);
    }
};

function openNetworkWindow(gene) {
    if (!gene) {
        return;
    }

    const url = `/network/${encodeURIComponent(gene)}`;

    window.open(url, "_blank", "width=1500,height=900,scrollbars=yes,resizable=yes");
}

window.exportPNG = function () {
    console.log("exportPNG:", cy);

    if (!cy) {
        alert("Network 尚未建立");
        return;
    }

    try {
        const png = cy.png({ full: true, scale: 3 });

        const a = document.createElement("a");
        a.href = png;
        a.download = "network.png";

        document.body.appendChild(a);
        a.click();
        a.remove();
    }
    catch (error) {
        console.error("Export PNG failed:", error);
    }
};

window.openNetworkWindow = openNetworkWindow;
