// DuckSmart species database
// Data sourced from US_Duck_Habitat_Selected_Species.xlsx + US_Duck_Info_Pages_Selected_Species.xlsx

export const IDENTIFY_GROUPS = ["Dabbler", "Diver", "Merganser", "Sea Duck"];
export const IDENTIFY_SIZE = ["Small", "Medium", "Large"];
export const IDENTIFY_HABITATS = ["Timber", "Marsh", "Fields", "Open Water", "Coastline"];

export const IDENTIFY_SPECIES = [
  // ── Dabblers ──────────────────────────────────────────────
  {
    id: "mallard",
    name: "Mallard",
    group: "Dabbler",
    size: "Large",
    habitats: { Timber: "High", Marsh: "High", Fields: "High", "Open Water": "Medium", Coastline: "Low" },
    primaryHabitats: "Marsh, fields, ponds, rivers, timber edges",
    habitatBehavior: "Highly adaptable; feeds by tipping up and grazing; common in mixed flocks.",
    keyMarks: [
      "Drake: green head, white neck ring, chestnut breast, curled tail",
      "Hen: orange bill with dark saddle",
      "Blue speculum",
    ],
    lookalikes: ["American Black Duck", "Mottled Duck"],
    flightInfo: "Strong steady flight; ~50\u201360 mph",
    tips: ["Often vocal on approach; listen for quacks/chuckles.", "Hens can resemble mottled/black duck \u2014 use speculum and bill color."],
    legalNote: "Common game species; confirm season dates and bag limits for your state/zone.",
  },
  {
    id: "wood_duck",
    name: "Wood Duck",
    group: "Dabbler",
    size: "Medium",
    habitats: { Timber: "High", Marsh: "Medium", Fields: "Low", "Open Water": "Low", Coastline: "Low" },
    primaryHabitats: "Timber, sloughs, creeks, beaver ponds",
    habitatBehavior: "Strong timber duck; often perches in trees; explosive flush from cover.",
    keyMarks: [
      "Bold crest; drake iridescent green/purple head",
      "Hen: white teardrop eye-ring",
    ],
    lookalikes: ["Hooded Merganser (hen)"],
    flightInfo: "Fast, agile, twisting flight; ~40\u201350 mph",
    tips: ["In timber they rocket through gaps \u2014 lead is different than open water birds.", "Listen for squeals/whistles, especially early."],
    legalNote: "Often legal where seasons allow; verify wood duck limits separately.",
  },
  {
    id: "american_black_duck",
    name: "American Black Duck",
    group: "Dabbler",
    size: "Large",
    habitats: { Timber: "Medium", Marsh: "High", Fields: "Low", "Open Water": "Medium", Coastline: "Medium" },
    primaryHabitats: "Tidal marsh, coastal bays, inland marsh",
    habitatBehavior: "Wary marsh duck; often associated with coastal wetlands.",
    keyMarks: [
      "Dark chocolate body, pale head",
      "Purple speculum with white border",
    ],
    lookalikes: ["Mallard hen", "Mottled Duck"],
    flightInfo: "Direct powerful flight; ~50\u201360 mph",
    tips: ["Often found in coastal marshes in the northeast.", "Wary \u2014 decoy shy compared to mallards."],
    legalNote: "Legal in most Atlantic/Mississippi flyway states; check local limits.",
  },
  {
    id: "northern_pintail",
    name: "Northern Pintail",
    group: "Dabbler",
    size: "Large",
    habitats: { Timber: "Low", Marsh: "High", Fields: "High", "Open Water": "Medium", Coastline: "Medium" },
    primaryHabitats: "Open marsh, flooded fields, shallow lakes",
    habitatBehavior: "Prefers open wetlands; alert and wary; often feeds in fields.",
    keyMarks: [
      "Long neck; drake pointed tail and white neck stripe",
      "Slim profile",
    ],
    lookalikes: ["Mallard hen"],
    flightInfo: "Fast elegant flight; ~55\u201365 mph",
    tips: ["Graceful fliers \u2014 long wings, often in V formations.", "Pintail limits are often restrictive; know your regulations."],
    legalNote: "Often has reduced bag limits; always confirm pintail-specific limits.",
  },
  {
    id: "american_wigeon",
    name: "American Wigeon",
    group: "Dabbler",
    size: "Medium",
    habitats: { Timber: "Low", Marsh: "High", Fields: "Medium", "Open Water": "Medium", Coastline: "Low" },
    primaryHabitats: "Marsh, ponds, open water edges, fields",
    habitatBehavior: "Often grazes like a goose; commonly steals food from divers.",
    keyMarks: [
      "Drake: white crown and green eye patch",
      "Pale bill; white wing patch in flight",
    ],
    lookalikes: ["Gadwall"],
    flightInfo: "Fast with whistling wings; ~50\u201360 mph",
    tips: ["Often grazes on land near water.", "Listen for a distinctive 3-note whistle."],
    legalNote: "Legal during regular duck season in most states.",
  },
  {
    id: "gadwall",
    name: "Gadwall",
    group: "Dabbler",
    size: "Medium",
    habitats: { Timber: "Low", Marsh: "High", Fields: "Medium", "Open Water": "Medium", Coastline: "Low" },
    primaryHabitats: "Marsh, reservoirs, ponds",
    habitatBehavior: "Vegetation feeder; quieter behavior; often in mixed groups.",
    keyMarks: [
      "Subtle gray-brown body; drake black rear",
      "White speculum in flight",
    ],
    lookalikes: ["American Wigeon"],
    flightInfo: "Moderate direct flight; ~45\u201355 mph",
    tips: ["Can be quiet; look for the white wing patch on passing birds."],
    legalNote: "Usually legal during regular duck season; confirm local regs.",
  },
  {
    id: "green_winged_teal",
    name: "Green-winged Teal",
    group: "Dabbler",
    size: "Small",
    habitats: { Timber: "Low", Marsh: "High", Fields: "Low", "Open Water": "Low", Coastline: "Low" },
    primaryHabitats: "Shallow marsh, mudflats",
    habitatBehavior: "Small, quick, tight flocking; favors shallow water.",
    keyMarks: [
      "Small size; green eye patch (drake)",
      "Green speculum",
    ],
    lookalikes: ["Blue-winged Teal"],
    flightInfo: "Explosive takeoff; ~45\u201355 mph",
    tips: ["They juke hard \u2014 keep your head on the bird and swing through."],
    legalNote: "Often has its own limit; check teal vs duck limits.",
  },
  {
    id: "blue_winged_teal",
    name: "Blue-winged Teal",
    group: "Dabbler",
    size: "Small",
    habitats: { Timber: "Low", Marsh: "High", Fields: "Low", "Open Water": "Low", Coastline: "Low" },
    primaryHabitats: "Shallow marsh, flooded fields",
    habitatBehavior: "Early migrant; prefers shallow wetlands.",
    keyMarks: [
      "Blue forewing patch; drake white facial crescent",
    ],
    lookalikes: ["Green-winged Teal"],
    flightInfo: "Very fast erratic flight; ~50\u201360 mph",
    tips: ["Early migrants \u2014 often first teal species seen in early season.", "Fly in tight, fast flocks."],
    legalNote: "Often has special early teal season; check your flyway dates.",
  },
  {
    id: "cinnamon_teal",
    name: "Cinnamon Teal",
    group: "Dabbler",
    size: "Small",
    habitats: { Timber: "Low", Marsh: "High", Fields: "Low", "Open Water": "Low", Coastline: "Low" },
    primaryHabitats: "Marsh, shallow ponds (mostly West)",
    habitatBehavior: "Uses shallow vegetated wetlands; often with blue-wings.",
    keyMarks: [
      "Drake: rich cinnamon body and red eye",
      "Blue wing patch",
    ],
    lookalikes: ["Blue-winged Teal (hens)"],
    flightInfo: "Fast agile flight; ~50\u201360 mph",
    tips: ["Primarily a western species.", "Hens are nearly indistinguishable from blue-winged teal hens."],
    legalNote: "Legal during duck season in western states; rare in east.",
  },
  {
    id: "northern_shoveler",
    name: "Northern Shoveler",
    group: "Dabbler",
    size: "Medium",
    habitats: { Timber: "Low", Marsh: "High", Fields: "Low", "Open Water": "Medium", Coastline: "Low" },
    primaryHabitats: "Marsh, ponds, shallow lakes",
    habitatBehavior: "Feeds by sifting surface water; tolerant of open water edges.",
    keyMarks: [
      "Large spoon-shaped bill",
      "Blue forewing patch",
    ],
    lookalikes: ["Mallard (distance)"],
    flightInfo: "Moderate steady flight; ~40\u201350 mph",
    tips: ["The oversized bill is unmistakable at close range.", "Often feed by swimming in circles to stir up food."],
    legalNote: "Legal during regular duck season; part of general bag limit.",
  },
  {
    id: "mottled_duck",
    name: "Mottled Duck",
    group: "Dabbler",
    size: "Large",
    habitats: { Timber: "Medium", Marsh: "High", Fields: "Low", "Open Water": "Low", Coastline: "Medium" },
    primaryHabitats: "Gulf/Florida marsh, coastal prairie",
    habitatBehavior: "Resident marsh duck; local movements only.",
    keyMarks: [
      "Mallard-hen look; darker, uniform body",
      "Blotched orange bill",
    ],
    lookalikes: ["Mallard hen", "American Black Duck"],
    flightInfo: "Strong direct flight; ~50\u201360 mph",
    tips: ["Non-migratory; resident along Gulf Coast.", "Important to distinguish from mallard hens for accurate reporting."],
    legalNote: "Legal in Gulf Coast states; check specific mottled duck regulations.",
  },

  // ── Divers ──────────────────────────────────────────────
  {
    id: "canvasback",
    name: "Canvasback",
    group: "Diver",
    size: "Large",
    habitats: { Timber: "Low", Marsh: "Low", Fields: "Low", "Open Water": "High", Coastline: "Medium" },
    primaryHabitats: "Large lakes, rivers, bays",
    habitatBehavior: "Deep-water diver; often in large rafts on open water.",
    keyMarks: [
      "Sloping head profile; drake red head, white back",
    ],
    lookalikes: ["Redhead"],
    flightInfo: "Fast direct flight; ~55\u201365 mph",
    tips: ["Look for the long, sloped head profile at distance."],
    legalNote: "Diver limits can differ; always confirm current season/limits.",
  },
  {
    id: "redhead",
    name: "Redhead",
    group: "Diver",
    size: "Medium",
    habitats: { Timber: "Low", Marsh: "Low", Fields: "Low", "Open Water": "High", Coastline: "Medium" },
    primaryHabitats: "Lakes, reservoirs, bays",
    habitatBehavior: "Often mixed with canvasbacks; open-water diver.",
    keyMarks: [
      "Round head; drake red head, blue bill with black tip",
    ],
    lookalikes: ["Canvasback"],
    flightInfo: "Strong direct flight; ~50\u201360 mph",
    tips: ["Rounder head profile than canvasback.", "Often raft with scaup and canvasback."],
    legalNote: "Often included in diver limits; check redhead-specific regulations.",
  },
  {
    id: "ring_necked_duck",
    name: "Ring-necked Duck",
    group: "Diver",
    size: "Medium",
    habitats: { Timber: "Low", Marsh: "Medium", Fields: "Low", "Open Water": "Medium", Coastline: "Low" },
    primaryHabitats: "Small lakes, ponds, marsh edges",
    habitatBehavior: "Uses smaller water than scaup; frequent diver.",
    keyMarks: [
      "Peaked rear head; ringed bill tip; gray flanks",
    ],
    lookalikes: ["Scaup"],
    flightInfo: "Fast low flight; ~45\u201355 mph",
    tips: ["Should be called 'ring-billed duck' \u2014 bill ring is the key mark.", "More likely in smaller ponds than other divers."],
    legalNote: "Legal during regular duck season; part of diver limits.",
  },
  {
    id: "lesser_scaup",
    name: "Lesser Scaup",
    group: "Diver",
    size: "Medium",
    habitats: { Timber: "Low", Marsh: "Low", Fields: "Low", "Open Water": "High", Coastline: "Medium" },
    primaryHabitats: "Reservoirs, large lakes, rivers",
    habitatBehavior: "Common inland diver; large rafts.",
    keyMarks: [
      "Angular head; blue bill with black tip",
    ],
    lookalikes: ["Greater Scaup"],
    flightInfo: "Fast low flight; ~55\u201365 mph",
    tips: ["Most common scaup inland.", "Head peak and thinner white wing stripe help separate from greater."],
    legalNote: "Often combined scaup limit; check if greater/lesser are differentiated.",
  },
  {
    id: "greater_scaup",
    name: "Greater Scaup",
    group: "Diver",
    size: "Medium",
    habitats: { Timber: "Low", Marsh: "Low", Fields: "Low", "Open Water": "Medium", Coastline: "High" },
    primaryHabitats: "Coastal bays, large lakes",
    habitatBehavior: "More coastal than lesser scaup.",
    keyMarks: [
      "Rounder head profile; greenish head sheen",
    ],
    lookalikes: ["Lesser Scaup"],
    flightInfo: "Fast coastal flight; ~55\u201365 mph",
    tips: ["More coastal than lesser scaup.", "Round head and green sheen vs purple in lesser."],
    legalNote: "Often combined scaup limit with lesser scaup.",
  },
  {
    id: "bufflehead",
    name: "Bufflehead",
    group: "Diver",
    size: "Small",
    habitats: { Timber: "Low", Marsh: "Low", Fields: "Low", "Open Water": "High", Coastline: "Medium" },
    primaryHabitats: "Lakes, ponds, bays",
    habitatBehavior: "Small diver; frequent dives; small groups.",
    keyMarks: [
      "Drake: large white head patch; compact body",
    ],
    lookalikes: ["Goldeneye"],
    flightInfo: "Rapid wingbeats; ~40\u201350 mph",
    tips: ["Tiny and fast; often patters across water to take flight.", "One of the few ducks that can take off without running."],
    legalNote: "Legal during duck season; part of general bag limit.",
  },
  {
    id: "common_goldeneye",
    name: "Common Goldeneye",
    group: "Diver",
    size: "Medium",
    habitats: { Timber: "Low", Marsh: "Low", Fields: "Low", "Open Water": "High", Coastline: "Medium" },
    primaryHabitats: "Cold lakes, rivers, bays",
    habitatBehavior: "Cold-water diver; whistling wings in flight.",
    keyMarks: [
      "Drake: white cheek patch; green head sheen",
    ],
    lookalikes: ["Bufflehead", "Barrow\u2019s Goldeneye"],
    flightInfo: "Strong fast flight; ~50\u201360 mph",
    tips: ["Wings make a distinctive whistling sound.", "Often seen in rivers and lakes in winter."],
    legalNote: "Legal during duck season; check local limits.",
  },
  {
    id: "barrows_goldeneye",
    name: "Barrow's Goldeneye",
    group: "Diver",
    size: "Medium",
    habitats: { Timber: "Low", Marsh: "Low", Fields: "Low", "Open Water": "High", Coastline: "Medium" },
    primaryHabitats: "Mountain lakes, rivers (West/AK)",
    habitatBehavior: "More western distribution; similar to common goldeneye.",
    keyMarks: [
      "Drake: crescent-shaped white face patch; steeper forehead",
    ],
    lookalikes: ["Common Goldeneye"],
    flightInfo: "Strong fast flight; ~50\u201360 mph",
    tips: ["Primarily western distribution.", "Crescent face patch vs round spot in common goldeneye."],
    legalNote: "Legal in most areas; relatively uncommon in eastern flyways.",
  },

  // ── Mergansers ──────────────────────────────────────────
  {
    id: "hooded_merganser",
    name: "Hooded Merganser",
    group: "Merganser",
    size: "Medium",
    habitats: { Timber: "Medium", Marsh: "Medium", Fields: "Low", "Open Water": "Low", Coastline: "Low" },
    primaryHabitats: "Timber ponds, creeks, small lakes",
    habitatBehavior: "Fish-eater; dives; quick flush from cover.",
    keyMarks: [
      "Large fan-shaped crest; hen cinnamon with shaggy crest",
    ],
    lookalikes: ["Wood Duck hen"],
    flightInfo: "Fast agile flight; ~45\u201355 mph",
    tips: ["Often in wooded ponds and streams.", "Fan crest can be raised or lowered."],
    legalNote: "Legal during duck season; often separate merganser limits.",
  },
  {
    id: "common_merganser",
    name: "Common Merganser",
    group: "Merganser",
    size: "Large",
    habitats: { Timber: "Low", Marsh: "Low", Fields: "Low", "Open Water": "High", Coastline: "Low" },
    primaryHabitats: "Large rivers, lakes (freshwater)",
    habitatBehavior: "Large fish-eater; strong diver; open freshwater.",
    keyMarks: [
      "Long slender red bill; drake mostly white",
    ],
    lookalikes: ["Red-breasted Merganser"],
    flightInfo: "Direct powerful flight; ~55\u201365 mph",
    tips: ["Largest merganser; often on large rivers and lakes.", "Flies fast and low with direct flight."],
    legalNote: "Often separate merganser limits; check regulations.",
  },
  {
    id: "red_breasted_merganser",
    name: "Red-breasted Merganser",
    group: "Merganser",
    size: "Large",
    habitats: { Timber: "Low", Marsh: "Low", Fields: "Low", "Open Water": "Medium", Coastline: "High" },
    primaryHabitats: "Coastal bays, estuaries",
    habitatBehavior: "Saltwater-oriented; very fast flier.",
    keyMarks: [
      "Shaggy crest; thin red bill; rusty breast (drake)",
    ],
    lookalikes: ["Common Merganser"],
    flightInfo: "Very fast low flight; ~60\u201370 mph",
    tips: ["Most commonly seen merganser along coastlines.", "Shaggy crest is distinctive."],
    legalNote: "Often separate merganser limits; primarily coastal harvest.",
  },

  // ── Sea Ducks ──────────────────────────────────────────
  {
    id: "long_tailed_duck",
    name: "Long-tailed Duck",
    group: "Sea Duck",
    size: "Medium",
    habitats: { Timber: "Low", Marsh: "Low", Fields: "Low", "Open Water": "Low", Coastline: "High" },
    primaryHabitats: "Offshore coast, large coastal bays",
    habitatBehavior: "Offshore diver; deep dives; winter sea duck.",
    keyMarks: [
      "Drake: long tail streamers; bold contrasting plumage",
    ],
    lookalikes: ["Scoters (distance)"],
    flightInfo: "Fast strong coastal flight; ~55\u201365 mph",
    tips: ["Deep diver \u2014 can dive to remarkable depths.", "Formerly called Oldsquaw."],
    legalNote: "Sea duck limits apply; often restricted bag limits.",
  },
  {
    id: "harlequin_duck",
    name: "Harlequin Duck",
    group: "Sea Duck",
    size: "Small",
    habitats: { Timber: "Low", Marsh: "Low", Fields: "Low", "Open Water": "Rare", Coastline: "High" },
    primaryHabitats: "Rocky coasts, surf zones",
    habitatBehavior: "Prefers turbulent water; dives in surf.",
    keyMarks: [
      "Striking pattern (drake); small slate-blue body",
    ],
    lookalikes: ["Scoters (hens)"],
    flightInfo: "Fast agile flight; ~50\u201360 mph",
    tips: ["Found in fast-moving streams and rocky coastlines.", "Beautifully patterned \u2014 a prized sighting."],
    legalNote: "Protected in many areas; check if harvest is legal in your zone.",
  },
  {
    id: "surf_scoter",
    name: "Surf Scoter",
    group: "Sea Duck",
    size: "Large",
    habitats: { Timber: "Low", Marsh: "Low", Fields: "Low", "Open Water": "Low", Coastline: "High" },
    primaryHabitats: "Coastline, surf zone, bays",
    habitatBehavior: "Dives for shellfish; often rides swell.",
    keyMarks: [
      "Bulbous multicolored bill (drake); white head patches",
    ],
    lookalikes: ["White-winged Scoter", "Black Scoter"],
    flightInfo: "Fast direct coastal flight; ~55\u201365 mph",
    tips: ["Most common scoter along both coasts.", "Flocks fly low over ocean surf in lines."],
    legalNote: "Sea duck limits; check scoter-specific regulations.",
  },
  {
    id: "white_winged_scoter",
    name: "White-winged Scoter",
    group: "Sea Duck",
    size: "Large",
    habitats: { Timber: "Low", Marsh: "Low", Fields: "Low", "Open Water": "Low", Coastline: "High" },
    primaryHabitats: "Coastline, bays, large lakes",
    habitatBehavior: "Large scoter; dives for mollusks.",
    keyMarks: [
      "White wing patch visible in flight",
    ],
    lookalikes: ["Surf Scoter", "Black Scoter"],
    flightInfo: "Strong fast flight; ~55\u201365 mph",
    tips: ["White wing patches flash in flight \u2014 key identifier.", "Often mixed in with other scoter species."],
    legalNote: "Sea duck limits; scoter-specific bag limits may apply.",
  },
  {
    id: "black_scoter",
    name: "Black Scoter",
    group: "Sea Duck",
    size: "Medium",
    habitats: { Timber: "Low", Marsh: "Low", Fields: "Low", "Open Water": "Low", Coastline: "High" },
    primaryHabitats: "Coastline, offshore waters",
    habitatBehavior: "Often farther offshore; dives for mollusks.",
    keyMarks: [
      "Drake: all black with orange bill knob",
    ],
    lookalikes: ["Surf Scoter (hens)"],
    flightInfo: "Fast low flight; ~55\u201365 mph",
    tips: ["Orange bill knob is the key field mark on drakes.", "Wings produce a whistling sound in flight."],
    legalNote: "Sea duck limits apply; check local scoter regulations.",
  },
  {
    id: "common_eider",
    name: "Common Eider",
    group: "Sea Duck",
    size: "Large",
    habitats: { Timber: "Low", Marsh: "Low", Fields: "Low", "Open Water": "Low", Coastline: "High" },
    primaryHabitats: "Northeast coasts, rocky shores",
    habitatBehavior: "Large chunky sea duck; dives for mussels.",
    keyMarks: [
      "Large wedge bill; drake black/white with green nape",
    ],
    lookalikes: ["King Eider"],
    flightInfo: "Heavy but strong flight; ~45\u201355 mph",
    tips: ["Bulky, heavy body \u2014 unmistakable at close range.", "Often found in large rafts along rocky coastlines."],
    legalNote: "Sea duck limits; eider-specific regulations in many coastal states.",
  },
];

// ── Easter Egg Duck — always appears at bottom of Identify list ──
export const EASTER_EGG_DUCK = {
  id: "probably_a_duck",
  name: "Probably a Duck",
  group: "???",
  size: "Yes",
  habitats: { Timber: "Maybe", Marsh: "Probably", Fields: "Who Knows", "Open Water": "Debatable", Coastline: "Ask Again Later" },
  primaryHabitats: "Wherever you aren't looking. Seen near gas stations, tailgates, and once in a Walmart parking lot.",
  habitatBehavior: "Experts remain divided. Some say it flies. Others say it simply appears. All agree: it's probably a duck. Approach with mild confusion.",
  keyMarks: [
    "May or may not have feathers — reports vary",
    "Bill shaped like... something. Definitely bill-adjacent.",
    "Eyes that have seen things you wouldn't believe",
    "Tail? Probably. Don't quote us.",
    "Makes a sound best described as 'duck-ish'",
    "Waddles with an unearned level of confidence",
  ],
  lookalikes: ["Everything", "Nothing", "Your hunting buddy at 4 AM", "A decoy you forgot to pick up"],
  flightInfo: "Flies when it feels like it • Speed: depends on who's watching",
  tips: [
    "If you see it, you'll know. Or you won't. Hard to say.",
    "Decoy spread recommendation: just put them all out and hope for the best.",
    "Best calling technique: make a noise. Any noise. It doesn't matter.",
    "Has been spotted in every state and no states simultaneously.",
    "If your dog retrieves this one, you both deserve a nap.",
    "Pairs well with cold coffee and questionable life choices.",
  ],
  legalNote: "Check with your state wildlife agency. They won't know what you're talking about either, but it's polite to ask.",
};

// ── Free-tier species (available without Pro upgrade) ──
export const FREE_SPECIES_IDS = [
  "mallard",
  "blue_winged_teal",
  "green_winged_teal",
  "wood_duck",
  "northern_pintail",
  "american_wigeon",
  "american_black_duck",
  "surf_scoter",
  "white_winged_scoter",
  "red_breasted_merganser",
];

// ── Habitat rating values for scoring ──
const HABITAT_SCORES = { High: 4, Medium: 2, Low: 1, Rare: 0 };

/**
 * Scores and filters species based on user selections.
 */
export function computeIdentifyMatches({ group, habitat, size, queryText }) {
  const q = (queryText || "").toLowerCase().trim();

  const scored = IDENTIFY_SPECIES.map((sp) => {
    let score = 0;

    // --- Hard filters: exclude species that don't match selected group/size ---
    if (group && sp.group !== group) return { species: sp, score: 0 };
    if (size && sp.size !== size) return { species: sp, score: 0 };

    // Group match bonus
    if (group && sp.group === group) score += 4;

    // Habitat filter — use rating from the habitat map
    if (habitat && sp.habitats[habitat]) {
      score += HABITAT_SCORES[sp.habitats[habitat]] || 0;
    } else if (habitat) {
      // Habitat selected but species has no presence there — exclude
      return { species: sp, score: 0 };
    }

    // Size match bonus
    if (size && sp.size === size) score += 3;

    // Text search
    if (q) {
      const hay = [
        sp.name,
        sp.group,
        sp.size,
        ...sp.keyMarks,
        ...(sp.lookalikes || []),
        ...Object.keys(sp.habitats),
        sp.primaryHabitats || "",
        sp.habitatBehavior || "",
        sp.flightInfo || "",
      ]
        .join(" | ")
        .toLowerCase();
      if (hay.includes(q)) score += 4;
      else return { species: sp, score: 0 }; // text typed but no match — exclude
    }

    // If no filters at all, show everything
    if (!group && !habitat && !size && !q) score += 1;

    return { species: sp, score };
  });

  return scored
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 15);
}
