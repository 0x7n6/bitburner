import type { NS, Player, PlayerRequirement } from "@ns";
import { BIT_NODES, GAME_COMMIT } from "./bitburner-catalog.ts";
import { requirementStatus } from "./jit6-faction.ts";

const RED_PILL = "The Red Pill";
const DAEDALUS = "Daedalus";

type Observation = Parameters<typeof requirementStatus>[1];

function describeRequirement(requirement: PlayerRequirement, observation: Observation, dollars: (amount: number) => string,
    show: (line: string) => void, indent = ""): void {
    const status = requirementStatus(requirement, observation);
    const gap = (label: string, actual: number, required: number, format = (amount: number) => amount.toLocaleString()) => {
        const remaining = Math.max(0, required - actual);
        const detail = remaining > 0 ? ` | ${format(remaining)} to go` : " | met";
        show(`${indent}${label}: ${format(actual)} / ${format(required)}${detail}`);
    };

    switch (requirement.type) {
        case "money":
            gap("Cash", observation.player.money, requirement.money, dollars);
            return;
        case "numAugmentations":
            gap("Installed augmentations", observation.installedCount, requirement.numAugmentations);
            return;
        case "skills":
            for (const [skill, required] of Object.entries(requirement.skills)) {
                const label = skill[0].toUpperCase() + skill.slice(1);
                if (required === undefined) continue;
                gap(label, observation.player.skills[skill as keyof Player["skills"]], required);
            }
            return;
        case "everyCondition":
        case "someCondition":
            show(`${indent}${requirement.type === "someCondition" ? "Any skill path" : "All requirements below"} | ${status}`);
            requirement.conditions.forEach(child => describeRequirement(child, observation, dollars, show, indent + "  "));
            return;
        default:
            show(`${indent}${requirement.type}: ${status}. See Faction details for this requirement.`);
    }
}

export async function main(ns: NS): Promise<void> {
    const game = ns.ui.getGameInfo();
    const reset = ns.getResetInfo();
    const node = reset.currentNode;
    const show = (line: string) => ns.tprint(`[JIT6 GOAL] ${line}`);
    show(`BN${node} | ${BIT_NODES[node]?.name ?? "Unknown BitNode"}`);
    if (game.version !== "3.0.1" || game.commit.length < 7 || !GAME_COMMIT.startsWith(game.commit)) {
        show("Live goal details require Bitburner 3.0.1 (3162fd2). See the current in-game objectives.");
        return;
    }
    if (node === 8) show("Stock-market economy. Track trading capital alongside the Daedalus milestones.");
    if (node === 15) show("Alternate Red Pill source. Follow the BitNode objective in the game UI.");

    if (reset.ownedAugs.has(RED_PILL)) {
        show("The Red Pill: installed. Open Current BitNode and readiness for the final skill check.");
        return;
    }
    if (node !== 4 && !(reset.ownedSF.get(4) ?? 0)) {
        show("Live Red Pill and faction details require Singularity. Check the in-game Augmentations and Factions panels.");
        return;
    }

    const ownedOrQueued = ns.singularity.getOwnedAugmentations(true);
    if (ownedOrQueued.includes(RED_PILL)) {
        show("The Red Pill: queued. Review Augmentation reset readiness before installing.");
        return;
    }
    show("The Red Pill: still needed.");
    if (node === 15) return;

    const player = ns.getPlayer();
    const dollars = (amount: number) => `$${ns.format.number(amount)}`;
    const sellers = player.factions.filter(faction => ns.singularity.getAugmentationsFromFaction(faction).includes(RED_PILL));
    if (sellers.length) {
        const price = ns.singularity.getAugmentationPrice(RED_PILL);
        const required = ns.singularity.getAugmentationRepReq(RED_PILL);
        show(`Current quote: ${dollars(price)}`);
        for (const faction of sellers) {
            const rep = ns.singularity.getFactionRep(faction);
            const remaining = Math.ceil(Math.max(0, required - rep));
            show(`${faction}: ${Math.floor(rep).toLocaleString()} / ${required.toLocaleString()} rep${remaining ? ` | ${remaining.toLocaleString()} to go` : " | met"}`);
        }
        return;
    }

    if (player.factions.includes(DAEDALUS)) {
        show("Daedalus is joined. Check current Red Pill availability in the game.");
        return;
    }
    show("Daedalus invitation milestones");
    const observation: Observation = {
        player,
        reset,
        installedCount: ns.singularity.getOwnedAugmentations(false).length,
        ownedOrQueued,
    };
    for (const requirement of ns.singularity.getFactionInviteRequirements(DAEDALUS)) {
        describeRequirement(requirement, observation, dollars, show);
    }
    show("Review pending invitations in the Factions panel.");
}
