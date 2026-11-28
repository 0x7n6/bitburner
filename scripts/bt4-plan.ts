import type { NS } from "@ns";

const SCORE_WEIGHTS = {
    hacking_exp: 4,
    hacking: 4,
    faction_rep: 4,
    hacking_speed: 3,
    hacking_chance: 1,
    hacking_money: 1,
    hacking_grow: 1,
} as const;

export async function main(ns: NS): Promise<void> {
    const reset = ns.getResetInfo();
    if (reset.currentNode !== 4 && !(reset.ownedSF.get(4) ?? 0)) {
        ns.tprint("[BT4] Singularity unavailable. Use Basic snapshot.");
        return;
    }

    const player = ns.getPlayer();
    const installed = ns.singularity.getOwnedAugmentations(false);
    const purchased = ns.singularity.getOwnedAugmentations(true);
    const owned = new Set(purchased);
    const factions = player.factions.map(name => ({
        name,
        rep: ns.singularity.getFactionRep(name),
        work: ns.singularity.getFactionWorkTypes(name),
        offers: ns.singularity.getAugmentationsFromFaction(name),
    }));
    const names = new Set(factions.flatMap(faction => faction.offers));
    names.delete("NeuroFlux Governor");

    const candidates = [...names].filter(name => !owned.has(name)).map(name => {
        const repRequired = ns.singularity.getAugmentationRepReq(name);
        const stats = ns.singularity.getAugmentationStats(name);
        const score = Object.entries(SCORE_WEIGHTS).reduce((sum, [key, weight]) => {
            const multiplier = stats[key as keyof typeof SCORE_WEIGHTS] ?? 1;
            return sum + weight * Math.log(multiplier > 0 ? multiplier : 1);
        }, 0);
        const sellers = factions.filter(faction => faction.offers.includes(name)).map(faction => ({
            faction: faction.name,
            repMissing: Math.max(0, repRequired - faction.rep),
            work: faction.work,
        })).sort((a, b) => a.repMissing - b.repMissing || a.faction.localeCompare(b.faction));
        return {
            name,
            score,
            mission: reset.currentNode === 4 && name === "The Red Pill",
            price: ns.singularity.getAugmentationPrice(name),
            missingPrerequisites: ns.singularity.getAugmentationPrereq(name).filter(prerequisite => !owned.has(prerequisite)),
            sellers,
        };
    });

    // Give incomplete prerequisite chains visibility even when the first item has weak stats.
    const unlocks = new Map<string, number>();
    for (const candidate of candidates) {
        for (const prerequisite of candidate.missingPrerequisites) {
            unlocks.set(prerequisite, (unlocks.get(prerequisite) ?? 0) + 1);
        }
    }
    const rank = (a: typeof candidates[number], b: typeof candidates[number]) =>
        Number(b.mission) - Number(a.mission) ||
        (b.score + 0.15 * (unlocks.get(b.name) ?? 0)) - (a.score + 0.15 * (unlocks.get(a.name) ?? 0)) ||
        b.price - a.price || a.name.localeCompare(b.name);
    candidates.sort(rank);

    const flags = ns.flags([["reserve", 0]]);
    const reserve = Number(flags.reserve);
    if (!Number.isFinite(reserve) || reserve < 0) {
        ns.tprint("[BT4] --reserve must be a finite, nonnegative number.");
        return;
    }
    const available = Math.max(0, player.money - reserve);
    const ready = candidates.filter(aug => aug.missingPrerequisites.length === 0 &&
        aug.price <= available && player.money >= reserve && aug.sellers.some(seller => seller.repMissing === 0));
    const repTargets = candidates.filter(aug => aug.missingPrerequisites.length === 0 &&
        aug.sellers.length > 0 && aug.sellers.every(seller => seller.repMissing > 0))
        .map(aug => ({
            augmentation: aug.name,
            affordable: aug.price <= available && player.money >= reserve,
            seller: aug.sellers.find(seller => seller.work.length > 0),
        }))
        .filter(target => target.seller);

    const currentWork = ns.singularity.getCurrentWork();
    ns.tprint(JSON.stringify({
        status: "OBSERVATION",
        bitNode: reset.currentNode,
        cash: player.money,
        assumedReserve: reserve,
        availableAboveReserve: available,
        currentWork,
        installedCount: installed.length,
        queuedCount: purchased.length - installed.length,
        homeRamUpgrade: { currentGb: ns.getServerMaxRam("home"), quote: ns.singularity.getUpgradeHomeRamCost() },
        readyToBuy: ready.slice(0, 12),
        actionableReputationTargets: repTargets.slice(0, 12),
        candidates: candidates.length,
        prerequisiteBlocked: candidates.filter(aug => aug.missingPrerequisites.length > 0).slice(0, 12),
        guidance: [
            "Re-plan after each purchase. Prices are live quotes for this queue, not combined estimates.",
            "Scores weight progression multipliers and prerequisite demand. Reputation targets show gaps, not time estimates.",
            "Choose a purchase or background faction work through AP. The action task asks for approval.",
        ],
    }, null, 2));
}
