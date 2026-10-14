// ============================================================
// UKW - Ubiquitin Knowledge Warehouse
// 01. Constants
// ============================================================

const LYSINE_SITES = [6, 11, 27, 29, 33, 48, 63];
// ============================================================
// UniProt Feature Categories
// ============================================================

const FEATURE_CATEGORIES = {

    structural: [
        "CHAIN",
        "PEPTIDE",
        "PROPEP",
        "DOMAIN",
        "REGION",
        "REPEAT",
        "COILED",
        "HELIX",
        "STRAND",
        "TURN"
    ],

    localization: [
        "SIGNAL",
        "TRANSIT",
        "TRANSMEM",
        "TOPO_DOM",
        "INTRAMEM"
    ],

    functional: [
        "ACT_SITE",
        "BINDING",
        "SITE",
        "DNA_BIND",
        "ZN_FING",
        "MOTIF"
    ],

    modification: [
        "MOD_RES",
        "CARBOHYD",
        "LIPID",
        "DISULFID",
        "CROSSLNK",
        "NON_STD",
        "NON_TER",
        "INIT_MET"
    ],

    variation: [
        "VARIANT",
        "VAR_SEQ",
        "MUTAGEN",
        "CONFLICT",
        "COMPBIAS"
    ]
};

const FEATURE_TYPE_TO_CATEGORY = {};