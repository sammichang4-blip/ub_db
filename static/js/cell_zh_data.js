/*
 * cell_zh_data.js
 * SL IDs → English names / functional notes
 * Load before cell_go_viewer.js
 */
window.UKW_ZH = {
  names: {
    SL0243: "Secretion", SL0112: "Extracellular space", SL0111: "Extracellular matrix", SL0466: "Extracellular exosomes",
    SL0039: "Plasma membrane", SL0310: "Cell surface",
    SL0086: "Cytoplasm", SL0091: "Cytosol", SL0138: "Cell cortex", SL0198: "Perinuclear region",
    SL0191: "Nucleus", SL0190: "Nucleoplasm", SL0182: "Nuclear membrane", SL0179: "Inner nuclear membrane", SL0183: "Outer nuclear membrane",
    SL0180: "Nuclear lamina", SL0188: "Nucleolus", SL0494: "Nuclear body", SL0031: "Cajal body", SL0465: "PML body",
    SL0127: "Gem", SL0186: "Nuclear speck",
    SL0090: "Cytoskeleton", SL0501: "Stress fiber", SL0484: "Microtubule-organizing center", SL0048: "Centrosome",
    SL0046: "Centriole", SL0485: "Centriole satellite",
    SL0095: "Endoplasmic reticulum", SL0097: "Endoplasmic reticulum membrane", SL0235: "Rough endoplasmic reticulum", SL0237: "Rough endoplasmic reticulum membrane",
    SL0248: "Smooth endoplasmic reticulum", SL0250: "Smooth endoplasmic reticulum membrane", SL0098: "ER-Golgi intermediate compartment",
    SL0132: "Golgi apparatus", SL0067: "Cis-Golgi network", SL0135: "Golgi stack", SL0266: "Trans-Golgi network",
    SL0101: "Endosome", SL0094: "Early endosome", SL0152: "Late endosome", SL0174: "Multivesicular body",
    SL0158: "Lysosome", SL0023: "Autophagosome", SL0206: "Phagosome",
    SL0173: "Mitochondrion", SL0170: "Mitochondrial matrix", SL0167: "Mitochondrial envelope", SL0171: "Mitochondrial membrane",
    SL0172: "Mitochondrial outer membrane", SL0168: "Mitochondrial inner membrane",
    SL0204: "Peroxisome", SL0145: "Hydrogenosome", SL0161: "Melanosome", SL0154: "Lipid droplet",
    SL0073: "Contractile vacuole", SL0351: "Chromoplast", SL0061: "Chromaffin granule", SL0281: "Cytoplasmic granule", SL0230: "P-body",
    SL0075: "COPI-coated vesicle", SL0077: "COPII-coated vesicle", SL0070: "Clathrin-coated vesicle",
    SL0072: "Coated pit", SL0069: "Clathrin-coated pit", SL0035: "Caveola (plasmalemmal caveola)", SL0473: "Phagocytic cup",
    SL0280: "Cell projection", SL0295: "Podosome", SL0286: "Filopodium", SL0148: "Invadopodium",
    SL0066: "Cilium", SL0087: "Basal body", SL0304: "Ciliary axoneme", SL0118: "Focal adhesion"
  },

  // Additional functional notes for selected organelles
  notes: {
    SL0095: {
      func: "Entry point for secreted and membrane proteins: signal peptides direct polypeptides into the lumen for N-glycosylation, disulfide-bond formation, and folding.",
      key: "BiP/GRP78, calnexin/calreticulin, PDI, Sec61, OST",
      route: "Misfolded proteins are ubiquitinated through ERAD and degraded; excessive accumulation triggers the UPR."
    },
    SL0098: {
      func: "A tubulovesicular compartment near ER exit sites and the first sorting station for anterograde and retrograde transport.",
      key: "ERGIC-53, COPII/COPI vesicles",
      route: "Receives COPII vesicles bound for the cis-Golgi; proteins with signals such as KDEL are returned to the ER by COPI."
    },
    SL0132: {
      func: "Center for post-translational protein modification and sorting, including glycan trimming and extension, sulfation, and proteolytic maturation of precursor proteins.",
      key: "Glycosyltransferases, mannosidases, furin/PC family",
      route: "Cargo passes through the cis-Golgi network → Golgi stack → trans-Golgi network."
    },
    SL0067: { func: "Receives biosynthetic cargo from the ER/ERGIC for initial processing.", key: "GRASP, golgins", route: "ER → cis-Golgi → medial-Golgi" },
    SL0135: { func: "Core of the Golgi, composed of cis/medial/trans cisternae, where sequential glycosylation occurs.", key: "Glycosyltransferases, glycosidases", route: "Matures sequentially from cis to trans" },
    SL0266: {
      func: "Final sorting station for glycoproteins and glycolipids, at the intersection of the biosynthetic and endosomal pathways.",
      key: "Clathrin/AP, GGA, M6P receptors",
      route: "Sorts cargo for secretion, the plasma membrane, or late endosomes and lysosomes."
    },
    SL0158: {
      func: "Degradative organelle containing acid hydrolases (luminal pH approximately 4.5–5); degrades proteins, nucleic acids, lipids, polysaccharides, and entire organelles.",
      key: "Cathepsins, LAMP1/2, V-ATPase",
      route: "Receives cargo through endocytosis (endosomes), autophagy (autophagosomes), and phagocytosis (phagosomes); hydrolases are delivered from the TGN via M6P receptors."
    },
    SL0174: {
      func: "Late endosome containing intraluminal vesicles; it can fuse with lysosomes for degradation or with the plasma membrane to release exosomes.",
      key: "ESCRT、ALIX、CD63",
      route: "Ubiquitinated membrane proteins are packaged into intraluminal vesicles by ESCRT and then degraded."
    },
    SL0094: { func: "Major sorting station in the endocytic pathway (pH approximately 6.0), determining whether cargo is recycled or degraded.", key: "Rab5, EEA1", route: "Recycles cargo to the plasma membrane or sends it to late endosomes." },
    SL0152: { func: "More acidic perinuclear sorting station enriched in M6PR; cargo can be returned to the Golgi or sent to lysosomes.", key: "Rab7, M6PR", route: "Early endosome → late endosome → lysosome" },
    SL0023: { func: "Double-membrane vesicle that sequesters organelles and proteins destined for degradation.", key: "LC3, ATG proteins", route: "Fuses with lysosomes to degrade its contents." }
  }
};
