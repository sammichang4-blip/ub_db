/* ============================================================
 * UKW - 11-domain.js
 *
 * Domain Architecture + Domain Explorer
 *
 * Color logic v4
 *
 * 1. Same InterPro ID = same color
 * 2. Same domain name = same color
 * 3. Same InterPro ID across databases = same color
 * 4. Same domain name without InterPro = same color
 * 5. InterPro ID + domain name are treated as color aliases
 * 6. Color assignment is stable across proteins
 * 7. Repeated domains of the same family:
 *      repeat 1 = base color
 *      repeat 2 = lighter
 *      repeat 3 = even lighter
 *      repeat 4+ = cycle
 * 8. Overlapping domains are assigned to different lanes
 * 9. Hover highlights:
 *      - same family
 *      - sufficiently overlapping domain
 *
 * IMPORTANT:
 *
 * 08-detail.js calls:
 *
 *     ${renderDomains(data.domains, p.length)}
 *
 * Therefore renderDomains() MUST return an HTML string.
 *
 * This version keeps the original v4 architecture and UI,
 * while adding normalization / compatibility handling for:
 *
 *     start_pos / end_pos
 *     start / end
 *     source_db / sourceDB
 *     domain_name / domainName / name
 *
 * Dependencies:
 *   escapeHtml()
 *   highlightStructureRange()
 *   currentProtein
 *   currentData
 *   currentProteinId
 *   currentPdbUrl
 *   pdbViewer
 *   initViewer()
 *   showPDBStructure()
 *
 * Data:
 *   window.currentDomains
 *   window.currentProteinLength
 * ============================================================ */


/* ============================================================
 * Global runtime state
 * ============================================================ */

window.currentDomains =
    window.currentDomains || [];

window.currentProteinLength =
    Number(
        window.currentProteinLength || 0
    );


/* ============================================================
 * Domain colors
 * ============================================================ */

const DOMAIN_FAMILY_PALETTE = [

    "#f9ab04",
    "#02a0fb",
    "#04f8b7",
    "#fa6e03",
    "#0072B2",
    "#fd048d",
    "#6902fa",
    "#b7f401",
    "#601601",
    "#03b482",
    "#6b06f977",
    "#277901",
    "#d53605",
    "#f6e204"

];


/* ============================================================
 * Repeat brightness
 * ============================================================ */

const DOMAIN_REPEAT_LIGHTEN = [

    0,
    0.20,
    0.40

];


/* ============================================================
 * Runtime color cache
 * ============================================================ */

window.currentDomainColorMap =
    window.currentDomainColorMap || {};


/* ============================================================
 * Runtime family alias map
 * ============================================================ */

window.currentDomainFamilyAliasMap =
    window.currentDomainFamilyAliasMap || {};


/* ============================================================
 * Source order
 * ============================================================ */

const DOMAIN_SOURCE_ORDER = [

    "InterPro",
    "Pfam",
    "Gene3D",
    "CDD",
    "SMART",
    "PANTHER",
    "SUPFAM",
    "TIGRFAM",
    "HAMAP",
    "PROSITE",
    "PRINTS",
    "Other"

];


/* ============================================================
 * Local HTML escape fallback
 *
 * The existing application normally provides escapeHtml().
 * Keep compatibility if this file is loaded independently.
 * ============================================================ */
function domainEscapeHtml(value) {

    if (
        typeof window.escapeHtml ===
        "function"
    ) {

        return window.escapeHtml(
            value
        );

    }

    return String(
        value ?? ""
    )
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}

/* ============================================================
 * Inject CSS
 * ============================================================ */
(function injectDomainStyle() {

    if (
        document.getElementById(
            "ukw-domain-style"
        )
    ) {
        return;
    }

    const style =
        document.createElement(
            "style"
        );

    style.id =
        "ukw-domain-style";

    style.textContent = `

        .domain-architecture {
            width: 100%;
            box-sizing: border-box;
        }

        .domain-architecture-title {

            display: flex;
            align-items: center;
            justify-content: space-between;
            gap: 8px;
            margin-bottom: 8px;
            font-weight: 600;
        }

        .domain-expand-btn {

            border: 0;
            background: transparent;
            cursor: pointer;
            font-size: 14px;
            padding: 3px 6px;

        }

        .domain-axis {

            display: flex;
            justify-content: space-between;
            margin-left: 90px;
            margin-right: 4px;
            margin-bottom: 4px;
            font-size: 9px;
            color: var(--ink-dim, #777);

        }

        .domain-source-row {

            display: grid;
            grid-template-columns:
                82px
                minmax(0, 1fr);
            align-items: stretch;
            gap: 8px;
            margin-bottom: 5px;

        }

        .domain-source-label {
            font-size: 10px;
            color: var(--ink-dim, #777);
            display: flex;
            align-items: center;
            justify-content: flex-end;
            gap: 4px;
            text-align: right;
            white-space: nowrap;
            overflow: hidden;
            text-overflow: ellipsis;
        }


        .domain-count {
            opacity: .65;
            font-size: 9px;
        }


        .domain-track {
            position: relative;
            min-height: 14px;
            height: 14px;
            width: 100%;
            border-radius: 3px;
            background: rgba(127,127,127,.06);
            box-sizing: border-box;

        }

        .domain-seg {

            position: absolute;
            box-sizing: border-box;
            border: 1px solid #fff;
            border-radius: 3px;
            transition:
                opacity .12s ease,
                filter .12s ease,
                box-shadow .12s ease;

            display: flex;
            align-items: center;
            justify-content: center;
            overflow: hidden;
            font-size: 10px;
            font-weight: 700;
            color: #fff;
            text-shadow:
                0 0 2px rgba(0,0,0,.55);
            user-select: none;

        }


        .domain-seg.dim {

            opacity: .22;

        }


        .domain-seg.hl {

            filter:
                brightness(1.05)
                saturate(1.1);
            z-index: 2;
            box-shadow:
                0 0 0 1.5px
                rgba(0,0,0,.45);

        }


        .domain-swatch {

            display: inline-block;
            width: 10px;
            height: 10px;
            border-radius: 2px;
            margin-right: 6px;
            vertical-align: middle;

        }


        .domain-list {

            margin-top: 10px;

        }


        .domain-list-item {

            display: flex;
            align-items: center;
            justify-content: space-between;
            gap: 12px;
            padding: 5px 6px;
            border-bottom:
                1px solid
                rgba(127,127,127,.12);
            font-size: 11px;

        }


        .domain-list-item:hover {

            background:
                rgba(127,127,127,.06);

        }


        .domain-list-item .acc {

            color: var(--ink-dim, #777);
            font-size: 10px;

        }

        .domain-architecture-title +

        .domain-axis {

            border-top:
                1px solid
                rgba(127,127,127,.12);
            padding-top: 3px;

        }

        .domain-explorer-architecture {

            width: 100%;

        }

        .domain-explorer-axis {

            display: flex;
            justify-content: space-between;
            font-size: 10px;
            color: var(--ink-dim, #777);
            margin-left: 90px;
            margin-bottom: 6px;

        }


        .domain-explorer-tracks {

            width: 100%;

        }


        .domain-explorer-list {

            margin-top: 16px;

        }

        .domain-explorer-protein {

            margin-left: 8px;
            opacity: .65;
            font-weight: 400;

        }

        .selected-domain {

            padding: 8px 10px;
            border-radius: 5px;
            background:
                rgba(127,127,127,.07);

        }

        .selected-domain-name {

            font-weight: 600;
            margin-bottom: 3px;

        }

        .selected-domain-source {

            font-size: 11px;
            opacity: .7;

        }

        .selected-domain-pos {

            font-size: 11px;
            margin-top: 3px;

        }

        .domain-pdb-empty {

            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            height: 100%;
            min-height: 200px;
            text-align: center;
            color: var(--ink-dim, #777);

        }
    `;

    document.head.appendChild(
        style
    );

})();


/* ============================================================
 * Normalize one domain record
 *
 * IMPORTANT:
 *
 * Backend currently returns:
 *
 *     start_pos
 *     end_pos
 *
 * The original v4 code uses these fields directly.
 *
 * This function keeps those fields while also creating:
 *
 *     start
 *     end
 *
 * so the rest of the renderer can safely use either format.
 * ============================================================ */

function normalizeDomainRecord(
    domain,
    index = 0
) {

    if (
        !domain ||
        typeof domain !== "object"
    ) {

        return null;

    }

    const startValue =

        domain.start_pos ??
        domain.start ??
        domain.begin ??
        domain.start_position;

    const endValue =

        domain.end_pos ??
        domain.end ??
        domain.stop ??
        domain.end_position;

    const start =
        Number(
            startValue
        );

    const end =
        Number(
            endValue
        );

    if (
        !Number.isFinite(start) ||
        !Number.isFinite(end) ||
        start < 1 ||
        end < start
    ) {

        return null;

    }

    const source =
        String(

            domain.source_db ??
            domain.sourceDB ??

            domain.database ??

            domain.db ??

            "Other"

        )
            .trim();

    const domainName =

        domain.domain_name ??

        domain.domainName ??

        domain.name ??

        "";

    const normalized = {

        ...domain,

        _domainIndex:
            index,

        start_pos:
            start,

        end_pos:
            end,

        start:
            start,

        end:
            end,

        source_db:
            source,

        domain_name:
            String(
                domainName
            ).trim()

    };

    return normalized;

}

/* ============================================================
 * Normalize all domains
 * ============================================================ */

function normalizeDomainRecords(
    domains
) {

    if (
        !Array.isArray(domains)
    ) {

        return [];

    }

    return domains

        .map(
            (
                domain,
                index
            ) =>
                normalizeDomainRecord(
                    domain,
                    index
                )
        )

        .filter(Boolean)

        .sort(
            (a, b) => {

                if (
                    a.start_pos !==
                    b.start_pos
                ) {

                    return (
                        a.start_pos -
                        b.start_pos
                    );

                }


                return (
                    a.end_pos -
                    b.end_pos
                );

            }
        );

}

/* ============================================================
 * InterPro ID extraction
 * ============================================================ */

function getInterProId(d) {

    if (
        !d ||
        typeof d !== "object"
    ) {

        return "";

    }

    /* --------------------------------------------------------
     * 1. Explicit fields
     * -------------------------------------------------------- */

    const directFields = [

        d.interpro_id,
        d.interpro_acc,
        d.interpro_accession,
        d.interpro,
        d.ipr_id,
        d.ipr

    ];

    for (
        const value of directFields
    ) {

        if (!value) {
            continue;
        }


        const match =
            String(value).match(
                /\bIPR\d{6,9}\b/i
            );


        if (match) {

            return match[0]
                .toUpperCase();

        }

    }

    /* --------------------------------------------------------
     * 2. InterPro source
     * -------------------------------------------------------- */

    if (
        String(
            d.source_db ||
            ""
        )
            .trim()
            .toLowerCase() ===
        "interpro"
    ) {

        const match =
            String(
                d.accession || ""
            ).match(
                /\bIPR\d{6,9}\b/i
            );

        if (match) {

            return match[0]
                .toUpperCase();

        }

    }

    /* --------------------------------------------------------
     * 3. Search text
     * -------------------------------------------------------- */

    const text = [

        d.description,
        d.domain_name,
        d.domainName,
        d.name,
        d.note,
        d.comment

    ]

        .filter(Boolean)

        .join(" ");


    const match =
        text.match(
            /\bIPR\d{6,9}\b/i
        );


    if (match) {

        return match[0]
            .toUpperCase();

    }

    return "";

}

/* ============================================================
 * Normalize domain name
 * ============================================================ */

function normalizeDomainName(
    name
) {

    return String(
        name || ""
    )
        .trim()
        .replace(/\s+/g, " ")
        .toLowerCase();

}


/* ============================================================
 * Get normalized domain name
 * ============================================================ */

function getDomainName(d) {

    if (
        !d ||
        typeof d !== "object"
    ) {

        return "";

    }


    return normalizeDomainName(

        d.domain_name ||

        d.domainName ||

        d.name ||

        ""

    );

}


/* ============================================================
 * Basic identity keys
 *
 * A domain may contain:
 *
 *     IPR:IPR018965
 *     NAME:uba domain
 *
 * These become aliases.
 * ============================================================ */

function getDomainIdentityKeys(d) {

    const keys = [];


    const ipr =
        getInterProId(d);


    const name =
        getDomainName(d);


    if (ipr) {

        keys.push(
            "IPR:" +
            ipr.toUpperCase()
        );

    }


    if (name) {

        keys.push(
            "NAME:" +
            name
        );

    }


    if (
        keys.length === 0
    ) {

        const accession =
            String(
                d?.accession || ""
            )
                .trim()
                .toLowerCase();


        if (accession) {

            keys.push(
                "ACC:" +
                accession
            );

        }

    }


    if (
        keys.length === 0
    ) {

        keys.push(
            "UNKNOWN"
        );

    }


    return keys;

}


/* ============================================================
 * Domain family key
 *
 * Priority:
 *
 *     InterPro
 *     domain name
 *     accession
 * ============================================================ */

function getDomainFamilyKey(d) {

    const ipr =
        getInterProId(d);


    if (ipr) {

        return (
            "IPR:" +
            ipr.toUpperCase()
        );

    }


    const domainName =
        getDomainName(d);


    if (domainName) {

        return (
            "NAME:" +
            domainName
        );

    }


    const accession =
        String(
            d?.accession || ""
        )
            .trim()
            .toLowerCase();


    if (accession) {

        return (
            "ACC:" +
            accession
        );

    }


    return "UNKNOWN";

}


/* ============================================================
 * Stable string hash
 * ============================================================ */

function hashString(
    str
) {

    let hash = 0;


    for (
        let i = 0;
        i < str.length;
        i++
    ) {

        hash =
            ((hash << 5) - hash) +
            str.charCodeAt(i);


        hash |= 0;

    }


    return Math.abs(
        hash
    );

}

/* ============================================================
 * Stable family color
 * ============================================================ */

function getStableFamilyColor(
    familyKey
) {

    if (!familyKey) {

        return "#9ca3af";

    }


    if (
        window.currentDomainColorMap &&
        window.currentDomainColorMap[
            familyKey
        ]
    ) {

        return window
            .currentDomainColorMap[
                familyKey
            ];

    }


    const hash =
        hashString(
            familyKey
        );


    const index =
        hash %
        DOMAIN_FAMILY_PALETTE.length;


    const color =
        DOMAIN_FAMILY_PALETTE[
            index
        ];


    window.currentDomainColorMap[
        familyKey
    ] = color;


    return color;

}

/* ============================================================
 * Union-Find
 *
 * Used to make alias relationships transitive.
 *
 * Example:
 *
 * IPR:A -- NAME:X -- IPR:B
 *
 * becomes one family.
 * ============================================================ */

class DomainFamilyUnionFind {

    constructor() {

        this.parent = {};

    }


    add(
        key
    ) {

        if (
            !this.parent[key]
        ) {

            this.parent[key] =
                key;

        }

    }


    find(
        key
    ) {

        this.add(
            key
        );

        if (
            this.parent[key] !==
            key
        ) {

            this.parent[key] =
                this.find(
                    this.parent[key]
                );

        }

        return this.parent[key];

    }

    union(
        a,
        b
    ) {

        const rootA =
            this.find(a);

        const rootB =
            this.find(b);

        if (
            rootA === rootB
        ) {
            return;
        }

        /*
         * Stable canonical root:
         *
         * Lexicographically smaller
         * identity becomes canonical.
         */

        if (
            rootA < rootB
        ) {

            this.parent[rootB] =
                rootA;

        } else {

            this.parent[rootA] =
                rootB;

        }

    }

}

/* ============================================================
 * Build domain color map
 *
 * IMPORTANT:
 *
 * Same InterPro
 * OR
 * same domain name
 *
 * => same color.
 *
 * InterPro + name are aliases.
 *
 * This implementation uses Union-Find so aliases remain
 * stable even if the same name appears on multiple records.
 * ============================================================ */

function buildDomainColorMap(
    domains
) {

    const map = {};

    const aliasMap = {};


    if (
        !Array.isArray(domains)
    ) {

        window.currentDomainColorMap =
            map;

        window.currentDomainFamilyAliasMap =
            aliasMap;

        return map;

    }


    const uf =
        new DomainFamilyUnionFind();


    /* --------------------------------------------------------
     * Step 1
     * Register every identity key.
     * -------------------------------------------------------- */

    domains.forEach(
        domain => {

            const keys =
                getDomainIdentityKeys(
                    domain
                );


            keys.forEach(
                key => {

                    uf.add(
                        key
                    );

                }
            );

        }
    );

    /* --------------------------------------------------------
     * Step 2
     * Same record => all identity keys are aliases.
     * -------------------------------------------------------- */

    domains.forEach(
        domain => {

            const keys =
                getDomainIdentityKeys(
                    domain
                );


            if (
                keys.length < 2
            ) {

                return;

            }


            const first =
                keys[0];


            for (
                let i = 1;
                i < keys.length;
                i++
            ) {

                uf.union(
                    first,
                    keys[i]
                );

            }

        }
    );

    /* --------------------------------------------------------
     * Step 3
     * Build canonical aliases.
     * -------------------------------------------------------- */

    const canonicalRoots = {};

    Object.keys(
        uf.parent
    ).forEach(
        key => {

            const root =
                uf.find(
                    key
                );


            canonicalRoots[key] =
                root;


            aliasMap[key] =
                root;

        }
    );

    /* --------------------------------------------------------
     * Step 4
     * Assign stable colors.
     *
     * IMPORTANT:
     *
     * Preserve existing colors whenever possible.
     * This prevents a new protein from unnecessarily
     * changing the color of an already-used family.
     * -------------------------------------------------------- */

    const rootToColor = {};

    Object.keys(
        canonicalRoots
    )
        .sort()
        .forEach(
            key => {

                const root =
                    canonicalRoots[key];


                if (
                    rootToColor[root]
                ) {

                    return;

                }


                /*
                 * Reuse existing runtime color if present.
                 */

                if (
                    window.currentDomainColorMap &&
                    window.currentDomainColorMap[root]
                ) {

                    rootToColor[root] =
                        window.currentDomainColorMap[root];

                    return;

                }


                rootToColor[root] =
                    getStableFamilyColor(
                        root
                    );

            }
        );

    /* --------------------------------------------------------
     * Step 5
     * Create map for every alias.
     * -------------------------------------------------------- */

    Object.keys(
        canonicalRoots
    ).forEach(
        key => {

            const root =
                canonicalRoots[key];


            const color =
                rootToColor[root];


            map[key] =
                color;

        }
    );

    /* --------------------------------------------------------
     * Step 6
     * Save canonical colors too.
     * -------------------------------------------------------- */

    Object.keys(
        rootToColor
    ).forEach(
        root => {

            map[root] =
                rootToColor[root];

        }
    );

    /*
     * Merge into runtime cache instead of destroying
     * colors belonging to previously rendered proteins.
     */

    window.currentDomainColorMap = {

        ...(
            window.currentDomainColorMap ||
            {}
        ),

        ...map

    };


    window.currentDomainFamilyAliasMap = {

        ...(
            window.currentDomainFamilyAliasMap ||
            {}
        ),

        ...aliasMap

    };


    return map;

}

/* ============================================================
 * Resolve color key
 * ============================================================ */

function resolveDomainColorKey(d) {

    const keys =
        getDomainIdentityKeys(
            d
        );


    const aliasMap =
        window.currentDomainFamilyAliasMap ||
        {};


    for (
        const key of keys
    ) {

        if (
            aliasMap[key]
        ) {

            return aliasMap[key];

        }

    }

    return getDomainFamilyKey(
        d
    );

}

/* ============================================================
 * Get family color
 * ============================================================ */
function getFamilyColor(d) {

    const colorKey =
        resolveDomainColorKey(
            d
        );


    return getStableFamilyColor(
        colorKey
    );

}

/* ============================================================
 * Color lighten
 * ============================================================ */
function lightenColor(
    hex,
    amount
) {

    if (
        !hex ||
        !/^#[0-9a-f]{6}$/i.test(
            hex
        )
    ) {

        return hex;

    }


    const r =
        parseInt(
            hex.slice(1, 3),
            16
        );


    const g =
        parseInt(
            hex.slice(3, 5),
            16
        );


    const b =
        parseInt(
            hex.slice(5, 7),
            16
        );


    const nr =
        Math.round(
            r +
            (255 - r) *
            amount
        );


    const ng =
        Math.round(
            g +
            (255 - g) *
            amount
        );


    const nb =
        Math.round(
            b +
            (255 - b) *
            amount
        );


    return "#" +

        nr.toString(16)
            .padStart(2, "0") +

        ng.toString(16)
            .padStart(2, "0") +

        nb.toString(16)
            .padStart(2, "0");

}


/* ============================================================
 * Get repeat color
 * ============================================================ */

function getRepeatColor(
    domain,
    repeatIdx
) {

    const baseColor =
        getFamilyColor(
            domain
        );


    const lighten =
        DOMAIN_REPEAT_LIGHTEN[
            repeatIdx %
            DOMAIN_REPEAT_LIGHTEN.length
        ];


    return lightenColor(
        baseColor,
        lighten
    );

}

/* ============================================================
 * Group domains by source
 * ============================================================ */

function groupDomainsBySource(
    domains
) {

    const grouped = {};


    if (
        !Array.isArray(domains)
    ) {

        return grouped;

    }


    domains.forEach(
        domain => {

            const source =
                String(

                    domain.source_db ||

                    domain.sourceDB ||

                    "Other"

                ).trim();


            const normalizedSource =
                source || "Other";


            if (
                !grouped[
                    normalizedSource
                ]
            ) {

                grouped[
                    normalizedSource
                ] = [];

            }


            grouped[
                normalizedSource
            ].push(
                domain
            );

        }
    );


    Object.values(
        grouped
    )
        .forEach(
            arr => {

                arr.sort(
                    (a, b) =>
                        Number(
                            a.start_pos
                        ) -
                        Number(
                            b.start_pos
                        )
                );

            }
        );


    return grouped;

}


/* ============================================================
 * Assign overlap lanes
 *
 * Domains in the same source track are separated when
 * their coordinate ranges overlap.
 * ============================================================ */

function assignLanes(
    domains
) {

    const laneEnds = [];

    const lanes = [];


    domains.forEach(
        domain => {

            const start =
                Number(
                    domain.start_pos
                );


            const end =
                Number(
                    domain.end_pos
                );


            let lane =
                laneEnds.findIndex(
                    laneEnd =>
                        laneEnd < start
                );


            if (
                lane === -1
            ) {

                lane =
                    laneEnds.length;


                laneEnds.push(
                    end
                );

            } else {

                laneEnds[lane] =
                    end;

            }


            lanes.push(
                lane
            );

        }
    );


    return {

        lanes,

        laneCount:
            Math.max(
                laneEnds.length,
                1
            )

    };

}


/* ============================================================
 * Create domain segment
 * ============================================================ */

function createDomainSegment(
    domain,
    proteinLength,
    opts
) {

    opts =
        opts || {};


    const start =
        Number(
            domain.start_pos
        );


    const end =
        Number(
            domain.end_pos
        );


    if (
        !Number.isFinite(start) ||
        !Number.isFinite(end) ||
        start < 1 ||
        end < start ||
        proteinLength <= 0
    ) {

        return "";

    }


    const left =
        (
            (start - 1) /
            proteinLength
        ) *
        100;


    const width =
        (
            (end - start + 1) /
            proteinLength
        ) *
        100;


    const source =
        domain.source_db ||
        "Other";


    const domainName =
        domain.domain_name ||
        domain.domainName ||
        domain.name ||
        "Unnamed domain";


    const accession =
        domain.accession ||
        "";


    const ipr =
        getInterProId(
            domain
        );


    const familyKey =
        resolveDomainColorKey(
            domain
        );


    /* --------------------------------------------------------
     * Repeat information
     * -------------------------------------------------------- */

    const repeatIdx =
        Number(
            opts.repeatIdx || 0
        );


    const repeatTotal =
        Number(
            opts.repeatTotal || 1
        );


    const lane =
        Number(
            opts.lane || 0
        );


    const laneCount =
        Number(
            opts.laneCount || 1
        );


    /* --------------------------------------------------------
     * Color
     * -------------------------------------------------------- */

    const color =
        getRepeatColor(
            domain,
            repeatIdx
        );


    /* --------------------------------------------------------
     * Lane
     * -------------------------------------------------------- */

    const laneTop =
        (
            lane /
            laneCount
        ) *
        100;


    const laneHeight =
        100 /
        laneCount;


    /* --------------------------------------------------------
     * Label
     * -------------------------------------------------------- */

    const label =
        repeatTotal > 1 &&
        width >= 3 &&
        laneCount === 1

            ? String(
                repeatIdx + 1
            )

            : "";


    /* --------------------------------------------------------
     * Tooltip
     * -------------------------------------------------------- */

    const tipLines = [

        String(
            domainName
        )

    ];


    if (
        source ||
        accession
    ) {

        tipLines.push(

            [
                source,
                accession
            ]
                .filter(Boolean)
                .join(" · ")

        );

    }


    if (ipr) {

        tipLines.push(
            ipr
        );

    }


    tipLines.push(
        `${start}-${end}`
    );


    if (
        repeatTotal > 1
    ) {

        tipLines.push(
            `(repeat ${repeatIdx + 1}/${repeatTotal})`
        );

    }


    const tip =
        tipLines.join(
            "\n"
        );


    /*
     * Use JSON.stringify for inline JS arguments.
     *
     * This is safer than putting encodeURIComponent()
     * inside single quotes because protein/domain names
     * can contain apostrophes.
     */

    const encodedName =
        encodeURIComponent(
            String(
                domainName
            )
        );


    const encodedSource =
        encodeURIComponent(
            String(
                source
            )
        );


    const encodedAccession =
        encodeURIComponent(
            String(
                accession
            )
        );


    return `

        <div

            class="domain-seg"

            data-family="${domainEscapeHtml(
                familyKey
            )}"

            data-start="${start}"

            data-end="${end}"

            style="

                left:${left}%;

                width:${Math.max(
                    width,
                    0.4
                )}%;

                top:${laneTop}%;

                height:${laneHeight}%;

                background-color:${color};

                cursor:pointer;

            "

            title="${domainEscapeHtml(
                tip
            )}"

            onclick="selectDomain(
                ${start},
                ${end},
                '${encodedName}',
                '${encodedSource}',
                '${encodedAccession}'
            )"

        >

            ${label}

        </div>

    `;

}


/* ============================================================
 * Render one source track
 * ============================================================ */

function renderDomainSourceTrack(
    source,
    domains,
    proteinLength
) {

    /* --------------------------------------------------------
     * Count same-family repeats
     * -------------------------------------------------------- */

    const totals = {};


    domains.forEach(
        domain => {

            const key =
                resolveDomainColorKey(
                    domain
                );


            totals[key] =
                (
                    totals[key] || 0
                ) + 1;

        }
    );


    const seen = {};


    /* --------------------------------------------------------
     * Assign overlap lanes
     * -------------------------------------------------------- */

    const {
        lanes,
        laneCount
    } =
        assignLanes(
            domains
        );


    /* --------------------------------------------------------
     * Render segments
     * -------------------------------------------------------- */

    const segments =
        domains.map(
            (
                domain,
                index
            ) => {

                const key =
                    resolveDomainColorKey(
                        domain
                    );


                const repeatIdx =
                    seen[key] || 0;


                seen[key] =
                    repeatIdx + 1;


                return createDomainSegment(
                    domain,
                    proteinLength,
                    {

                        repeatIdx,

                        repeatTotal:
                            totals[key],

                        lane:
                            lanes[index],

                        laneCount

                    }
                );

            }
        ).join("");


    /* --------------------------------------------------------
     * Track height
     * -------------------------------------------------------- */

    const trackStyle =
        laneCount > 1

            ? `style="height:${laneCount * 14}px;"`

            : "";


    return `

        <div class="domain-source-row">

            <div class="domain-source-label">

                ${domainEscapeHtml(
                    source
                )}

                <span class="domain-count">

                    ${domains.length}

                </span>

            </div>


            <div
                class="domain-track"
                ${trackStyle}
            >

                ${segments}

            </div>

        </div>

    `;

}


/* ============================================================
 * Render domain list
 * ============================================================ */

function renderDomainList(
    grouped,
    sources
) {

    let html = "";


    sources.forEach(
        source => {

            const domains =
                grouped[source];


            domains.forEach(
                domain => {

                    const start =
                        Number(
                            domain.start_pos
                        );


                    const end =
                        Number(
                            domain.end_pos
                        );


                    const domainName =
                        domain.domain_name ||
                        domain.domainName ||
                        domain.name ||
                        "Domain";


                    const accession =
                        domain.accession ||
                        "";


                    const ipr =
                        getInterProId(
                            domain
                        );


                    const color =
                        getFamilyColor(
                            domain
                        );


                    const encodedName =
                        encodeURIComponent(
                            String(
                                domainName
                            )
                        );


                    const encodedSource =
                        encodeURIComponent(
                            String(
                                source
                            )
                        );


                    const encodedAccession =
                        encodeURIComponent(
                            String(
                                accession
                            )
                        );


                    html += `

                        <div

                            class="domain-list-item"

                            style="cursor:pointer;"

                            onclick="selectDomain(
                                ${start},
                                ${end},
                                '${encodedName}',
                                '${encodedSource}',
                                '${encodedAccession}'
                            )"

                            title="點擊在 3D 結構中高亮此 domain"

                        >

                            <span>

                                <strong>

                                    <span

                                        class="domain-swatch"

                                        style="
                                            background:${color};
                                        "

                                    ></span>

                                    ${domainEscapeHtml(
                                        domainName
                                    )}

                                </strong>


                                <br>


                                <span class="acc">

                                    ${domainEscapeHtml(
                                        source
                                    )}

                                    ${
                                        accession
                                            ? ` · ${domainEscapeHtml(
                                                accession
                                            )}`
                                            : ""
                                    }

                                    ${
                                        ipr
                                            ? ` · ${domainEscapeHtml(
                                                ipr
                                            )}`
                                            : ""
                                    }

                                </span>

                            </span>


                            <span>

                                aa
                                ${start}
                                –
                                ${end}

                            </span>

                        </div>

                    `;

                }
            );

        }
    );


    return html;

}


/* ============================================================
 * Sort sources
 * ============================================================ */

function sortDomainSources(
    grouped
) {

    return Object.keys(
        grouped
    ).sort(
        (a, b) => {

            const ia =
                DOMAIN_SOURCE_ORDER
                    .indexOf(a);


            const ib =
                DOMAIN_SOURCE_ORDER
                    .indexOf(b);


            if (
                ia === -1 &&
                ib === -1
            ) {

                return a.localeCompare(
                    b
                );

            }


            if (ia === -1) {
                return 1;
            }


            if (ib === -1) {
                return -1;
            }


            return ia - ib;

        }
    );

}


/* ============================================================
 * Main renderDomains()
 *
 * THIS IS THE IMPORTANT COMPATIBILITY ENTRY POINT.
 *
 * 08-detail.js:
 *
 *     ${renderDomains(data.domains, p.length)}
 *
 * ============================================================ */

function renderDomains(
    domains,
    proteinLength
) {

    /*
     * --------------------------------------------------------
     * Compatibility:
     *
     * If an older caller accidentally passes:
     *
     *     renderDomains(data)
     *
     * instead of:
     *
     *     renderDomains(data.domains, p.length)
     *
     * support it.
     * --------------------------------------------------------
     */

    if (
        domains &&
        !Array.isArray(domains) &&
        typeof domains === "object"
    ) {

        const data =
            domains;


        domains =
            data.domains ||

            data.domain_annotations ||

            data.domainAnnotations ||

            data.domain ||

            [];


        if (
            !proteinLength
        ) {

            proteinLength =

                data.length ||

                data.sequence_length ||

                data.sequenceLength ||

                data.protein_length ||

                data.proteinLength ||

                0;


            if (
                !proteinLength &&
                data.sequence
            ) {

                proteinLength =
                    data.sequence.length;

            }

        }

    }


    /*
     * --------------------------------------------------------
     * Normalize API records.
     *
     * This is what converts:
     *
     *     start_pos
     *     end_pos
     *
     * into normalized numeric values.
     * --------------------------------------------------------
     */

    const normalizedDomains =
        normalizeDomainRecords(
            domains
        );


    if (
        normalizedDomains.length === 0
    ) {

        window.currentDomains =
            [];


        window.currentProteinLength =
            Number(
                proteinLength || 0
            );


        return `

            <p style="color:var(--ink-dim)">

                目前資料庫中無 domain 資料。

            </p>

        `;

    }


    const normalizedLength =
        Number(
            proteinLength
        );


    if (
        !Number.isFinite(
            normalizedLength
        ) ||
        normalizedLength <= 0
    ) {

        return `

            <p style="color:var(--ink-dim)">

                Protein length unavailable.

            </p>

        `;

    }


    /*
     * --------------------------------------------------------
     * Store normalized data globally.
     *
     * IMPORTANT:
     *
     * Do NOT store the raw API objects here.
     * --------------------------------------------------------
     */

    window.currentDomains =
        normalizedDomains;


    window.currentProteinLength =
        normalizedLength;


    /*
     * --------------------------------------------------------
     * Build stable family colors.
     * --------------------------------------------------------
     */

    buildDomainColorMap(
        normalizedDomains
    );


    /*
     * --------------------------------------------------------
     * Group + sort.
     * --------------------------------------------------------
     */

    const grouped =
        groupDomainsBySource(
            normalizedDomains
        );


    const sources =
        sortDomainSources(
            grouped
        );


    /*
     * --------------------------------------------------------
     * Tracks.
     * --------------------------------------------------------
     */

    const tracks =
        sources

            .map(
                source =>
                    renderDomainSourceTrack(
                        source,
                        grouped[source],
                        normalizedLength
                    )
            )

            .join("");


    /*
     * --------------------------------------------------------
     * List.
     * --------------------------------------------------------
     */

    const list =
        renderDomainList(
            grouped,
            sources
        );


    /*
     * --------------------------------------------------------
     * IMPORTANT:
     *
     * RETURN HTML STRING.
     *
     * Do NOT:
     *
     *     document.querySelector(...)
     *
     *     container.innerHTML = ...
     *
     * here.
     *
     * 08-detail.js already owns:
     *
     *     <div class="scroll-box">
     *
     * --------------------------------------------------------
     */

    return `

        <div class="domain-architecture">

            <div class="domain-architecture-title">

                <span>

                    Domain Architecture

                </span>


                <button

                    class="icon-btn domain-expand-btn"

                    onclick="openDomainExplorer()"

                    title="Expand Domain Explorer"

                    type="button"

                >

                    🔍

                </button>

            </div>


            <div class="domain-axis">

                <span>1</span>

                <span>

                    ${Math.round(
                        normalizedLength *
                        0.25
                    )}

                </span>

                <span>

                    ${Math.round(
                        normalizedLength *
                        0.5
                    )}

                </span>

                <span>

                    ${Math.round(
                        normalizedLength *
                        0.75
                    )}

                </span>

                <span>

                    ${normalizedLength}

                </span>

            </div>


            ${tracks}

        </div>


        <div class="domain-list">

            ${list}

        </div>

    `;

}


/* ============================================================
 * Domain Explorer Architecture
 * ============================================================ */

function renderDomainExplorerArchitecture(
    domains,
    proteinLength
) {

    const normalizedDomains =
        normalizeDomainRecords(
            domains
        );


    if (
        normalizedDomains.length === 0
    ) {

        return `

            <p style="color:var(--ink-dim)">

                目前資料庫中無 domain 資料。

            </p>

        `;

    }


    const normalizedLength =
        Number(
            proteinLength
        );


    if (
        !Number.isFinite(
            normalizedLength
        ) ||
        normalizedLength <= 0
    ) {

        return `

            <p style="color:var(--ink-dim)">

                Protein length unavailable.

            </p>

        `;

    }


    /*
     * Use the same normalized records and color system
     * as the main architecture.
     */

    window.currentDomains =
        normalizedDomains;


    window.currentProteinLength =
        normalizedLength;


    buildDomainColorMap(
        normalizedDomains
    );


    const grouped =
        groupDomainsBySource(
            normalizedDomains
        );


    const sources =
        sortDomainSources(
            grouped
        );


    const tracks =
        sources

            .map(
                source =>
                    renderDomainSourceTrack(
                        source,
                        grouped[source],
                        normalizedLength
                    )
            )

            .join("");


    const list =
        renderDomainList(
            grouped,
            sources
        );


    return `

        <div class="domain-explorer-architecture">

            <div class="domain-explorer-axis">

                <span>1</span>

                <span>

                    ${Math.round(
                        normalizedLength *
                        0.25
                    )}

                </span>

                <span>

                    ${Math.round(
                        normalizedLength *
                        0.5
                    )}

                </span>

                <span>

                    ${Math.round(
                        normalizedLength *
                        0.75
                    )}

                </span>

                <span>

                    ${normalizedLength}

                </span>

            </div>


            <div class="domain-explorer-tracks">

                ${tracks}

            </div>


            <div class="domain-explorer-list">

                <h4>

                    Domain Details

                </h4>


                ${list}

            </div>


        </div>

    `;

}


/* ============================================================
 * Hover highlight
 *
 * Highlight:
 *
 *     same family
 *
 * OR
 *
 *     >= 50% overlap relative to hovered domain
 * ============================================================ */

document.addEventListener(
    "mouseover",
    event => {

        const seg =
            event.target
                .closest?.(
                    ".domain-seg"
                );


        if (!seg) {
            return;
        }


        const scope =
            getDomainHoverScope(
                seg
            );


        const family =
            seg.dataset.family;


        const s =
            Number(
                seg.dataset.start
            );


        const e =
            Number(
                seg.dataset.end
            );


        const len =
            e - s + 1;


        if (
            len <= 0
        ) {

            return;

        }


        scope

            .querySelectorAll(
                ".domain-seg"
            )

            .forEach(
                other => {

                    const os =
                        Number(
                            other.dataset.start
                        );


                    const oe =
                        Number(
                            other.dataset.end
                        );


                    const overlap =
                        Math.min(
                            e,
                            oe
                        ) -
                        Math.max(
                            s,
                            os
                        ) +
                        1;


                    const sameFamily =
                        other.dataset.family ===
                        family;


                    const overlapping =
                        overlap > 0 &&
                        (
                            overlap /
                            len
                        ) >=
                        0.5;


                    const hit =
                        other === seg ||
                        sameFamily ||
                        overlapping;


                    other.classList.toggle(
                        "hl",
                        hit
                    );


                    other.classList.toggle(
                        "dim",
                        !hit
                    );

                }
            );

    }
);


document.addEventListener(
    "mouseout",
    event => {

        const seg =
            event.target
                .closest?.(
                    ".domain-seg"
                );


        if (!seg) {
            return;
        }


        const to =
            event.relatedTarget
                ?.closest?.(
                    ".domain-seg"
                );


        if (to) {
            return;
        }


        getDomainHoverScope(
            seg
        )

            .querySelectorAll(
                ".domain-seg"
            )

            .forEach(
                o =>
                    o.classList.remove(
                        "hl",
                        "dim"
                    )
            );

    }
);


/* ============================================================
 * Get hover scope
 * ============================================================ */

function getDomainHoverScope(
    seg
) {

    return (

        seg.closest(
            ".domain-explorer-architecture"
        ) ||

        seg.closest(
            ".domain-architecture"
        ) ||

        document

    );

}


/* ============================================================
 * Domain Explorer
 * ============================================================ */

function openDomainExplorer() {

    console.log(
        "===== OPEN DOMAIN EXPLORER ====="
    );


    const modal =
        document.getElementById(
            "domainExplorerModal"
        );


    if (!modal) {

        console.error(
            "domainExplorerModal not found"
        );

        return;

    }


    /* --------------------------------------------------------
     * Protein length
     * -------------------------------------------------------- */

    let proteinLength =
        Number(
            window.currentProteinLength ||
            0
        );


    /*
     * currentProtein may be provided by 08-detail.js.
     *
     * Use typeof checks so this file does not crash if the
     * variable does not exist in another page.
     */

    if (
        typeof currentProtein !==
        "undefined" &&
        currentProtein
    ) {

        if (
            typeof currentProtein ===
            "string"
        ) {

            proteinLength =
                currentProtein.length;

        } else {

            proteinLength =
                Number(

                    currentProtein.length ||

                    currentProtein.sequence_length ||

                    currentProtein.protein_length ||

                    0

                );


            if (
                !proteinLength &&
                currentProtein.sequence
            ) {

                proteinLength =
                    currentProtein.sequence.length;

            }

        }

    }


    /*
     * currentData fallback.
     */

    if (
        !proteinLength &&
        typeof currentData !==
        "undefined" &&
        currentData
    ) {

        proteinLength =
            Number(

                currentData.length ||

                currentData.sequence_length ||

                currentData.protein_length ||

                0

            );


        if (
            !proteinLength &&
            currentData.sequence
        ) {

            proteinLength =
                currentData.sequence.length;

        }

    }


    if (!proteinLength) {

        console.error(
            "Protein length unavailable"
        );


        alert(
            "無法取得目前蛋白質的 sequence length。"
        );


        return;

    }


    /* --------------------------------------------------------
     * Domain data
     * -------------------------------------------------------- */

    const domains =
        Array.isArray(
            window.currentDomains
        )
            ? window.currentDomains
            : [];


    if (
        domains.length === 0
    ) {

        console.warn(
            "No domain data"
        );


        alert(
            "目前蛋白質沒有 Domain 資料。"
        );


        return;

    }


    /* --------------------------------------------------------
     * Protein name
     * -------------------------------------------------------- */

    let proteinName =
        "Protein";


    if (
        typeof currentData !==
        "undefined" &&
        currentData
    ) {

        proteinName =

            currentData.protein_name ||

            currentData.gene_name ||

            currentData.entry_name ||

            currentData.uniprot_acc ||

            proteinName;

    }


    if (
        typeof currentProteinId !==
        "undefined" &&
        currentProteinId
    ) {

        proteinName =
            proteinName ||
            currentProteinId;

    }


    /* --------------------------------------------------------
     * Modal title
     * -------------------------------------------------------- */

    const title =
        document.getElementById(
            "domainExplorerTitle"
        );


    if (title) {

        title.innerHTML = `

            <strong>
                Domain Explorer
            </strong>

            <span
                class="domain-explorer-protein"
            >

                ${domainEscapeHtml(
                    proteinName
                )}

            </span>

        `;

    }


    /* --------------------------------------------------------
     * Domain architecture
     * -------------------------------------------------------- */

    const domainContainer =
        document.getElementById(
            "domainExplorerTrack"
        );


    if (domainContainer) {

        domainContainer.innerHTML =
            renderDomainExplorerArchitecture(
                domains,
                proteinLength
            );

    } else {

        console.error(
            "domainExplorerTrack not found"
        );

    }


    /* --------------------------------------------------------
     * Open modal
     * -------------------------------------------------------- */

    modal.classList.add(
        "show"
    );


    /* --------------------------------------------------------
     * Load PDB viewer
     * -------------------------------------------------------- */

    loadDomainExplorerPDB();

}


/* ============================================================
 * Load Domain Explorer PDB
 * ============================================================ */

async function loadDomainExplorerPDB() {

    console.log(
        "===== loadDomainExplorerPDB ====="
    );


    const viewerContainer =
        document.getElementById(
            "domainExplorerPDB"
        );


    if (!viewerContainer) {

        console.error(
            "#domainExplorerPDB not found"
        );

        return;

    }


    /* --------------------------------------------------------
     * Find structure
     * -------------------------------------------------------- */

    let pdbUrl =

        (
            typeof currentPdbUrl !==
            "undefined"
        )

            ? currentPdbUrl

            : null;


    if (
        !pdbUrl &&
        typeof currentData !==
        "undefined" &&
        currentData
    ) {

        const structures =
            currentData.structures ||
            [];


        const structure =
            Array.isArray(
                structures
            )

                ? structures.find(
                    s => s.pdb_url
                )

                : null;


        if (structure) {

            pdbUrl =
                structure.pdb_url;

        } else if (
            currentData
                .active_structure
                ?.url
        ) {

            pdbUrl =
                currentData
                    .active_structure
                    .url;

        }

    }


    if (!pdbUrl) {

        viewerContainer.innerHTML = `

            <div
                class="domain-pdb-empty"
            >

                <div
                    style="font-size:42px;"
                >
                    🧬
                </div>

                <p>
                    目前沒有可用的 PDB structure
                </p>

            </div>

        `;

        return;

    }


    console.log(
        "Domain Explorer PDB:",
        pdbUrl
    );


    /* --------------------------------------------------------
     * Main Mol* container
     * -------------------------------------------------------- */

    const mainViewer =
        document.getElementById(
            "pdb-viewer"
        );


    if (!mainViewer) {

        console.error(
            "#pdb-viewer not found"
        );

        return;

    }


    /* --------------------------------------------------------
     * Ensure Mol* initialized
     * -------------------------------------------------------- */

    if (
        typeof pdbViewer ===
        "undefined" ||
        !pdbViewer
    ) {

        if (
            typeof initViewer !==
            "function"
        ) {

            console.error(
                "initViewer() not available"
            );

            return;

        }


        const ready =
            await initViewer();


        if (!ready) {

            console.error(
                "Mol* initialization failed"
            );

            return;

        }

    }


    /* --------------------------------------------------------
     * Move viewer into Explorer
     * -------------------------------------------------------- */

    if (
        typeof viewerOriginalParent !==
        "undefined" &&
        typeof viewerPlaceholder !==
        "undefined"
    ) {

        if (
            mainViewer.parentElement !==
            viewerContainer
        ) {

            viewerOriginalParent =
                mainViewer.parentElement;


            viewerPlaceholder =
                document.createElement(
                    "div"
                );


            viewerPlaceholder.style.display =
                "none";


            viewerOriginalParent.insertBefore(
                viewerPlaceholder,
                mainViewer
            );


            viewerContainer.appendChild(
                mainViewer
            );

        }

    } else {

        /*
         * Fallback if these variables are not declared
         * by the existing viewer script.
         */

        window.viewerOriginalParent =
            mainViewer.parentElement;


        window.viewerPlaceholder =
            document.createElement(
                "div"
            );


        window.viewerPlaceholder.style.display =
            "none";


        window.viewerOriginalParent.insertBefore(
            window.viewerPlaceholder,
            mainViewer
        );


        viewerContainer.appendChild(
            mainViewer
        );

    }


    mainViewer.style.width =
        "100%";


    mainViewer.style.height =
        "100%";


    /* --------------------------------------------------------
     * Load structure
     * -------------------------------------------------------- */

    if (
        typeof showPDBStructure !==
        "function"
    ) {

        console.error(
            "showPDBStructure() not available"
        );

        return;

    }


    await showPDBStructure(
        pdbUrl
    );


    /* --------------------------------------------------------
     * Force Mol* resize
     * -------------------------------------------------------- */

    requestAnimationFrame(
        () => {

            try {

                if (
                    typeof pdbViewer !==
                    "undefined" &&
                    pdbViewer?.plugin
                        ?.layout
                        ?.events
                        ?.updated
                ) {

                    pdbViewer
                        .plugin
                        .layout
                        .events
                        .updated
                        .next(
                            void 0
                        );

                }

            } catch (error) {

                console.warn(
                    "Mol* resize update failed:",
                    error
                );

            }


            window.dispatchEvent(
                new Event(
                    "resize"
                )
            );

        }
    );


    console.log(
        "Domain Explorer PDB loaded"
    );

}


/* ============================================================
 * Close Domain Explorer
 * ============================================================ */

function closeDomainExplorer() {

    const modal =
        document.getElementById(
            "domainExplorerModal"
        );


    if (modal) {

        modal.classList.remove(
            "show"
        );

    }


    const mainViewer =
        document.getElementById(
            "pdb-viewer"
        );


    const originalParent =

        (
            typeof viewerOriginalParent !==
            "undefined"
        )

            ? viewerOriginalParent

            : window.viewerOriginalParent;


    const placeholder =

        (
            typeof viewerPlaceholder !==
            "undefined"
        )

            ? viewerPlaceholder

            : window.viewerPlaceholder;


    if (
        mainViewer &&
        originalParent &&
        placeholder
    ) {

        try {

            originalParent.replaceChild(
                mainViewer,
                placeholder
            );

        } catch (error) {

            console.warn(
                "Failed to restore PDB viewer:",
                error
            );

        }


        mainViewer.style.width =
            "";


        mainViewer.style.height =
            "";


        if (
            typeof viewerOriginalParent !==
            "undefined"
        ) {

            viewerOriginalParent =
                null;

        } else {

            window.viewerOriginalParent =
                null;

        }


        if (
            typeof viewerPlaceholder !==
            "undefined"
        ) {

            viewerPlaceholder =
                null;

        } else {

            window.viewerPlaceholder =
                null;

        }


        requestAnimationFrame(
            () => {

                try {

                    if (
                        typeof pdbViewer !==
                        "undefined" &&
                        pdbViewer?.plugin
                            ?.layout
                            ?.events
                            ?.updated
                    ) {

                        pdbViewer
                            .plugin
                            .layout
                            .events
                            .updated
                            .next(
                                void 0
                            );

                    }

                } catch (error) {

                    console.warn(
                        "Mol* resize update failed:",
                        error
                    );

                }


                window.dispatchEvent(
                    new Event(
                        "resize"
                    )
                );

            }
        );

    }

}


/* ============================================================
 * Select Domain
 * ============================================================ */

function selectDomain(
    start,
    end,
    encodedName,
    encodedSource,
    encodedAccession
) {

    const domainName =
        decodeURIComponent(
            encodedName || ""
        );


    const source =
        decodeURIComponent(
            encodedSource || ""
        );


    const accession =
        decodeURIComponent(
            encodedAccession || ""
        );


    /* --------------------------------------------------------
     * 3D structure highlight
     * -------------------------------------------------------- */

    if (
        typeof window
            .highlightStructureRange ===
        "function"
    ) {

        window.highlightStructureRange(
            start,
            end
        );

    } else {

        console.warn(
            "highlightStructureRange() not available."
        );

    }


    /* --------------------------------------------------------
     * Explorer info
     * -------------------------------------------------------- */

    const info =
        document.getElementById(
            "domainExplorerInfo"
        );


    if (info) {

        info.innerHTML = `

            <div
                class="selected-domain"
            >

                <div
                    class="selected-domain-name"
                >

                    ${domainEscapeHtml(
                        domainName
                    )}

                </div>


                <div
                    class="selected-domain-source"
                >

                    ${domainEscapeHtml(
                        source
                    )}

                    ${
                        accession
                            ? ` · ${domainEscapeHtml(
                                accession
                            )}`
                            : ""
                    }

                </div>


                <div
                    class="selected-domain-pos"
                >

                    Residues
                    ${start}
                    –
                    ${end}

                </div>

            </div>

        `;

    }

}


/* ============================================================
 * ESC closes Explorer
 * ============================================================ */

document.addEventListener(
    "keydown",
    event => {

        if (
            event.key ===
            "Escape"
        ) {

            closeDomainExplorer();

        }

    }
);


/* ============================================================
 * Debug helper
 *
 * Useful after loading a protein:
 *
 *     debugDomains()
 *
 * ============================================================ */

function debugDomains() {

    const domains =
        Array.isArray(
            window.currentDomains
        )

            ? window.currentDomains

            : [];


    console.group(
        "UKW Domain Debug"
    );


    console.log(
        "Protein length:",
        window.currentProteinLength
    );


    console.log(
        "Domain count:",
        domains.length
    );


    console.table(
        domains.map(
            domain => ({

                source_db:
                    domain.source_db,

                accession:
                    domain.accession,

                interpro:
                    getInterProId(
                        domain
                    ),

                domain_name:
                    domain.domain_name,

                start:
                    domain.start_pos,

                end:
                    domain.end_pos,

                family:
                    resolveDomainColorKey(
                        domain
                    ),

                color:
                    getFamilyColor(
                        domain
                    )

            })
        )
    );


    console.groupEnd();


    return domains;

}


/* ============================================================
 * Global exports
 *
 * CRITICAL:
 *
 * 08-detail.js calls:
 *
 *     renderDomains(...)
 *
 * Explicitly export it.
 * ============================================================ */

window.renderDomains =
    renderDomains;


window.openDomainExplorer =
    openDomainExplorer;


window.closeDomainExplorer =
    closeDomainExplorer;


window.selectDomain =
    selectDomain;


window.groupDomainsBySource =
    groupDomainsBySource;


window.getInterProId =
    getInterProId;


window.getDomainFamilyKey =
    getDomainFamilyKey;


window.getFamilyColor =
    getFamilyColor;


window.buildDomainColorMap =
    buildDomainColorMap;


window.normalizeDomainRecord =
    normalizeDomainRecord;


window.normalizeDomainRecords =
    normalizeDomainRecords;


window.debugDomains =
    debugDomains;

/* ============================================================
 * Final load diagnostic
 * ============================================================ */
console.log(
    "UKW 11-domain.js loaded.",
    "renderDomains() ready."
);