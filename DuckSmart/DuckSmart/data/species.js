// DuckSmart species database (MVP)

export const IDENTIFY_REGIONS = ["Southeast", "Midwest", "Northeast", "South Central", "West"];
export const IDENTIFY_HABITATS = ["Marsh", "Timber", "Field", "Open Water", "River"];
export const IDENTIFY_SIZE = ["Small", "Medium", "Large"];
export const IDENTIFY_FLIGHT = ["Steady", "Fast", "Very Fast", "Erratic", "Powerful", "Tree-Line", "Low"];

export const IDENTIFY_SPECIES = [
  {
    id: "mallard",
    name: "Mallard",
    group: "Puddle (Dabbler)",
    size: "Large",
    habitats: ["Marsh", "Timber", "Open Water", "River", "Field"],
    regions: ["Southeast", "Midwest", "Northeast", "South Central", "West"],
    flightStyle: ["Steady", "Direct", "Strong"],
    keyMarks: [
      "Drake: green head, white neck ring, chestnut chest",
      "Hen: mottled brown with orange bill",
      "Blue/purple speculum with white borders",
    ],
    lookalikes: ["American Black Duck", "Mottled Duck"],
    legalNote:
      "Common game species in most areas; always confirm season dates and bag limits for your state/zone.",
    tips: [
      "Often vocal on approach; listen for quacks/chuckles.",
      "Hens can resemble mottled/black duck\u2014use speculum and bill color.",
    ],
  },
  {
    id: "woodduck",
    name: "Wood Duck",
    group: "Puddle (Dabbler)",
    size: "Medium",
    habitats: ["Timber", "Marsh", "River"],
    regions: ["Southeast", "Midwest", "Northeast", "South Central"],
    flightStyle: ["Fast", "Erratic", "Tree-Line"],
    keyMarks: [
      "Drake: iridescent green/purple head with bold white face lines",
      "Hen: teardrop white eye ring, crested head",
      "Compact body; short neck",
    ],
    lookalikes: ["Mandarin Duck (rare/escaped)"],
    legalNote:
      "Often legal where seasons allow; verify wood duck limits separately (can differ by zone).",
    tips: [
      "In timber, they rocket through gaps\u2014lead is different than open water birds.",
      "Listen for squeals/whistles, especially early.",
    ],
  },
  {
    id: "gadwall",
    name: "Gadwall",
    group: "Puddle (Dabbler)",
    size: "Medium",
    habitats: ["Marsh", "Open Water", "River"],
    regions: ["Southeast", "Midwest", "Northeast", "South Central", "West"],
    flightStyle: ["Steady", "Low", "Quick Turns"],
    keyMarks: [
      "Gray/brown overall; subtle patterning",
      "White speculum patch visible in flight",
      "Drake has black rump and chestnut wing coverts",
    ],
    lookalikes: ["Hen Mallard (at a glance)", "Wigeon (in flight)"],
    legalNote: "Usually legal during regular duck season; confirm local regs.",
    tips: ["Can be quiet; look for the white wing patch on passing birds."],
  },
  {
    id: "greenwing",
    name: "Green-winged Teal",
    group: "Puddle (Dabbler)",
    size: "Small",
    habitats: ["Marsh", "River", "Open Water"],
    regions: ["Southeast", "Midwest", "Northeast", "South Central", "West"],
    flightStyle: ["Very Fast", "Tight Flocks", "Zippy"],
    keyMarks: [
      "Drake: chestnut head with green eye patch",
      "Small silhouette; rapid wingbeats",
      "Green speculum (often flashes)",
    ],
    lookalikes: ["Blue-winged Teal", "Cinnamon Teal (west)"],
    legalNote: "Often has its own limit in some places; check teal vs duck limits.",
    tips: ["They juke hard\u2014keep your head on the bird and swing through."],
  },
  {
    id: "canvasback",
    name: "Canvasback",
    group: "Diver",
    size: "Large",
    habitats: ["Open Water"],
    regions: ["Midwest", "Northeast", "South Central", "West"],
    flightStyle: ["Fast", "Powerful", "Low Over Water"],
    keyMarks: [
      "Sloping forehead; long profile",
      "Drake: red head, white back",
      "Often in big rafts on open water",
    ],
    lookalikes: ["Redhead", "Ring-necked Duck"],
    legalNote:
      "Diver limits can differ and can change; always confirm current season/limits.",
    tips: ["Look for the long, sloped head profile at distance."],
  },
];

const identifySafeLower = (s) => (s || "").toString().toLowerCase();

export function computeIdentifyMatches({ region, habitat, size, flightTags, queryText }) {
  const q = identifySafeLower(queryText).trim();

  const scored = IDENTIFY_SPECIES.map((s) => {
    let score = 0;

    if (region && s.regions.includes(region)) score += 3;
    if (habitat && s.habitats.includes(habitat)) score += 3;
    if (size && s.size === size) score += 2;

    if (flightTags?.length) {
      const hits = flightTags.filter((t) => s.flightStyle.includes(t));
      score += hits.length * 2;
    }

    if (q) {
      const hay = identifySafeLower(
        [
          s.name,
          s.group,
          s.size,
          ...s.keyMarks,
          ...s.lookalikes,
          ...s.habitats,
          ...s.regions,
          ...s.flightStyle,
        ].join(" | ")
      );
      if (hay.includes(q)) score += 3;
    }

    if (!region && !habitat && !size && !(flightTags?.length) && !q) score += 1;

    return { species: s, score };
  });

  return scored
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 8);
}
