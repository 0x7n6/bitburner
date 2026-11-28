import type { Player, ResetInfo } from "@ns";

export const GAME_COMMIT = "3162fd2590e221eadd0c0fbd46151913f7c4c41c";
const UPSTREAM = `https://github.com/bitburner-official/bitburner-src/blob/${GAME_COMMIT}/src`;
export const NODE_SOURCE = `${UPSTREAM}/BitNode/BitNode.tsx`;
export const FACTION_SOURCE = `${UPSTREAM}/Faction/FactionInfo.tsx`;

export interface NodeCard {
    name: string;
    focus: string;
    sourceFile: string;
    next: string;
}

export const BIT_NODES: Readonly<Partial<Record<number, NodeCard>>> = {
    1: { name: "Source Genesis", focus: "Baseline economy and progression",
        sourceFile: "SF1 sets starting home RAM to 32 GB and boosts broad multipliers by 16/24/28%.",
        next: "Build an income base and earn faction reputation for an install cycle." },
    2: { name: "Rise of the Underworld", focus: "Gangs",
        sourceFile: "SF2 makes gangs available in other eligible nodes and improves crime and charisma.",
        next: "Check gang eligibility and faction access in the game UI; use their actual rewards to plan your augmentations." },
    3: { name: "Corporatocracy", focus: "Corporation economy",
        sourceFile: "SF3 enables corporations elsewhere when allowed; level 3 unlocks the corporation API.",
        next: "Inspect incorporation eligibility and choose an operating cash reserve before investing." },
    4: { name: "The Singularity", focus: "Singularity and player progression",
        sourceFile: "SF4 enables Singularity outside BN4. Its RAM multiplier drops from 16× to 4× to 1×.",
        next: "Review live Daedalus gates and joined faction offers; build skill, reputation, and installed augmentations." },
    5: { name: "Artificial Intelligence", focus: "Intelligence and formulas",
        sourceFile: "SF5 grants Intelligence, persistent Formulas access, and visibility into node multipliers.",
        next: "Compare measured income and XP before committing to an augmentation cycle." },
    6: { name: "Bladeburners", focus: "Bladeburner progression",
        sourceFile: "SF6 opens Bladeburner elsewhere and improves combat skills and XP.",
        next: "Check Bladeburner eligibility and your progress through Black Operations in the game UI." },
    7: { name: "Bladeburners 2079", focus: "Bladeburner progression and API",
        sourceFile: "SF7 improves Bladeburner multipliers by 8/12/14%. Level 3 grants The Blade's Simulacrum on joining the division.",
        next: "Compare Bladeburner progression with the standard augmentation route before investing." },
    8: { name: "Ghost of Wall Street", focus: "Stock market economy",
        sourceFile: "SF8 gives WSE/TIX at level 1, shorts at level 2, and order types at level 3.",
        next: "Inspect live stock access and available cash; the repo Trader requires 4S TIX as well as TIX." },
    9: { name: "Hacktocracy", focus: "Hacknet Servers and hashes",
        sourceFile: "SF9 unlocks Hacknet Servers. Levels 2 and 3 add 128 GB starting home RAM and an upgraded Hacknet Server respectively.",
        next: "Review available hash purchases and compare upgrade costs with the value you can use." },
    10: { name: "Digital Carbon", focus: "Sleeves and grafting",
        sourceFile: "SF10 gives access to Sleeves and grafting in other nodes.",
        next: "Review sleeve availability, shock, and useful assignments before committing money to grafting." },
    11: { name: "The Big Crash", focus: "Changed economic incentives",
        sourceFile: "SF11 makes company favor increase salary as well as reputation and improves economic multipliers.",
        next: "Compare live company and faction progress with your measured income; plan a reserve before purchases." },
    12: { name: "The Recursion", focus: "Repeatable, scaling difficulty",
        sourceFile: "SF12 has no level cap and contributes starting NeuroFlux Governor levels.",
        next: "Use the current save's live thresholds for every cycle; previous-cycle thresholds may differ." },
    13: { name: "They're lunatics", focus: "Stanek and the Church",
        sourceFile: "SF13 brings the Church to other nodes and grows Stanek's Gift by level.",
        next: "Review Church eligibility and the value of Stanek's Gift for your current route." },
    14: { name: "IPvGO Subnet Takeover", focus: "IPvGO minigame and faction favor",
        sourceFile: "SF14 changes Node Power, IPvGO capabilities, and the favor obtainable from wins.",
        next: "Compare progress and faction favor in the IPvGO UI with conventional faction work." },
    15: { name: "The Secrets of the Dark Net", focus: "Darknet rules and an alternate Red Pill source",
        sourceFile: "SF15.1 starts future nodes with TOR and DarkscapeNavigator. Levels 2 and 3 extend charisma bonuses to company and faction work.",
        next: "Use the in-game objective and Darknet UI for the alternate Red Pill route. The normal Daedalus assumption does not apply here." },
};

export type Faction = Player["factions"][number];

type Work = "hacking" | "field" | "security";
type Category = "endgame" | "corporate" | "hacking" | "city" | "criminal" | "special";

interface FactionCard {
    category: Category;
    requirements: string;
    work: readonly Work[];
    incompatible?: readonly Faction[];
}

const hacking = ["hacking"] as const;
const hackingAndField = ["hacking", "field"] as const;
const hackingAndSecurity = ["hacking", "security"] as const;
const fieldAndSecurity = ["field", "security"] as const;
const allWork = ["hacking", "field", "security"] as const;
const western = ["Aevum", "Sector-12"] as const;
const eastern = ["Chongqing", "Ishima", "New Tokyo"] as const;

function city(name: Faction, cash: number, incompatible: readonly Faction[]): FactionCard {
    return { category: "city", requirements: `Be in ${name} with at least $${cash}m.`, work: allWork, incompatible };
}

const corporation: FactionCard = {
    category: "corporate", requirements: "Employment at the company and 400k base company reputation. Check the effective requirement in the save.", work: allWork,
};
const networkMilestone = "Requires the faction's server milestone in the game. Check the faction invitation in the UI.";

export const FACTIONS: Readonly<Record<Faction, FactionCard>> = {
    Illuminati: { category: "endgame", requirements: "$150b, 30 installed augmentations, Hacking 1500, and every combat skill at 1200.", work: hackingAndField },
    Daedalus: { category: "endgame", requirements: "$100b and a node-specific installed augmentation count, plus Hacking 2500 or every combat skill at 1500.", work: hackingAndField },
    "The Covenant": { category: "endgame", requirements: "$75b, 20 installed augmentations, Hacking 850, and every combat skill at 850.", work: hackingAndField },
    ECorp: corporation,
    MegaCorp: corporation,
    "Bachman & Associates": corporation,
    "Blade Industries": corporation,
    NWO: corporation,
    "Clarke Incorporated": corporation,
    "OmniTek Incorporated": corporation,
    "Four Sigma": corporation,
    "KuaiGong International": corporation,
    "Fulcrum Secret Technologies": { category: "corporate", requirements: "Fulcrum Technologies employment, its effective company reputation requirement, and its server milestone in the game.", work: hackingAndSecurity },
    BitRunners: { category: "hacking", requirements: networkMilestone, work: hacking },
    "The Black Hand": { category: "hacking", requirements: networkMilestone, work: hackingAndField },
    NiteSec: { category: "hacking", requirements: networkMilestone, work: hacking },
    CyberSec: { category: "hacking", requirements: networkMilestone, work: hacking },
    Aevum: city("Aevum", 40, [...eastern, "Volhaven"]),
    Chongqing: city("Chongqing", 20, [...western, "Volhaven"]),
    Ishima: city("Ishima", 30, [...western, "Volhaven"]),
    "New Tokyo": city("New Tokyo", 20, [...western, "Volhaven"]),
    "Sector-12": city("Sector-12", 15, [...eastern, "Volhaven"]),
    Volhaven: city("Volhaven", 50, [...eastern, ...western]),
    "Speakers for the Dead": { category: "criminal", requirements: "Hacking 100, combat 300 each, in-game criminal record and karma requirements, and no CIA or NSA employment.", work: allWork },
    "The Dark Army": { category: "criminal", requirements: "Chongqing, Hacking 300, combat 300 each, in-game criminal record and karma requirements, and no CIA or NSA employment.", work: hackingAndField },
    "The Syndicate": { category: "criminal", requirements: "Aevum or Sector-12, $10m, Hacking and combat 200 each, karma at most −90, and no CIA or NSA employment.", work: allWork },
    Silhouette: { category: "criminal", requirements: "Company CTO, CFO, or CEO, $15m, and karma at most −22.", work: hackingAndField },
    Tetrads: { category: "criminal", requirements: "Chongqing, Ishima or New Tokyo, combat 75 each, and karma at most −18.", work: fieldAndSecurity },
    "Slum Snakes": { category: "criminal", requirements: "Combat 30 each, $1m, and karma at most −9.", work: fieldAndSecurity },
    Netburners: { category: "special", requirements: "Hacking 80 and Hacknet totals of 100 levels, 8 GB of RAM and 4 cores.", work: hacking },
    "Tian Di Hui": { category: "special", requirements: "Chongqing, Ishima or New Tokyo, Hacking 50, and $1m.", work: hackingAndSecurity },
    Bladeburners: { category: "special", requirements: "BN6, BN7 or their active Source-File, plus Bladeburner rank 25.", work: [] },
    "Church of the Machine God": { category: "special", requirements: "BN13 or active SF13, no non-NeuroFlux installed or queued augmentations, and the church event in Chongqing.", work: [] },
    "Shadows of Anarchy": { category: "special", requirements: "Complete an in-game infiltration.", work: [] },
};

export function findFaction(input: string): Faction | undefined {
    return (Object.keys(FACTIONS) as Faction[]).find(name => name.toLowerCase() === input.trim().toLowerCase());
}

export function bitNodeCatalog(reset: ResetInfo): string[] {
    const lines = [`BitNode catalog | Bitburner 3.0.1 (${GAME_COMMIT.slice(0, 7)})`];
    for (const [node, entry] of Object.entries(BIT_NODES)) {
        if (!entry) continue;
        const id = Number(node);
        lines.push(`BN${id}${reset.currentNode === id ? " [current]" : ""} — ${entry.name} | ${entry.focus}`);
        lines.push(`  SF ${reset.ownedSF.get(id) ?? 0}/${id === 12 ? "unlimited" : "3"} active. ${entry.sourceFile}`);
        lines.push(`  Next: ${entry.next}`);
    }
    lines.push(`Reference: ${NODE_SOURCE}`);
    return lines;
}

export function factionCatalog(joined: readonly Faction[]): string[] {
    const lines = [`Faction catalog | ${Object.keys(FACTIONS).length} names at 3.0.1 (${GAME_COMMIT.slice(0, 7)})`];
    for (const [name, faction] of Object.entries(FACTIONS)) {
        lines.push(`[${faction.category}] ${name}${joined.some(member => member === name) ? " — JOINED" : ""}`);
    }
    lines.push("For requirements and augmentation offers, use Faction details.", `Reference: ${FACTION_SOURCE}`);
    return lines;
}

export function factionOverview(faction: Faction, joined: readonly Faction[]): string[] {
    const card = FACTIONS[faction];
    const lines = [
        `[FACTION] ${faction} | ${card.category} | ${joined.includes(faction) ? "JOINED" : "membership not observed"}`,
        `v3.0.1 invitation guide: ${card.requirements}`,
        `Standard work: ${card.work.join(", ") || "none"}`,
    ];
    if (card.incompatible?.length) lines.push(`Incompatible city factions: ${card.incompatible.join(", ")}`);
    return lines;
}
