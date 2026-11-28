import type { NS, Player, PlayerRequirement } from "@ns";
import { collectBase, observe } from "./bt4";

type Verdict = "MET" | "UNMET" | "UNKNOWN";
export function evaluateRequirement(req: PlayerRequirement, player: Player, installed: number): Verdict {
    const numeric = (actual: number, required: number): Verdict =>
        (required > 0 ? actual >= required : actual <= required) ? "MET" : "UNMET";
    switch (req.type) {
        case "money": return numeric(player.money, req.money);
        case "numAugmentations": return numeric(installed, req.numAugmentations);
        case "skills": return Object.entries(req.skills).every(([key, value]) =>
            numeric(player.skills[key as keyof typeof player.skills], value!) === "MET") ? "MET" : "UNMET";
        case "someCondition": {
            const results = req.conditions.map(r => evaluateRequirement(r, player, installed));
            return results.includes("MET") ? "MET" : results.includes("UNKNOWN") ? "UNKNOWN" : "UNMET";
        }
        case "everyCondition": {
            const results = req.conditions.map(r => evaluateRequirement(r, player, installed));
            return results.includes("UNMET") ? "UNMET" : results.includes("UNKNOWN") ? "UNKNOWN" : "MET";
        }
        case "not": {
            const result = evaluateRequirement(req.condition, player, installed);
            return result === "UNKNOWN" ? "UNKNOWN" : result === "MET" ? "UNMET" : "MET";
        }
        default: return "UNKNOWN";
    }
}

/** Subtract as a multiset: queued NeuroFlux purchases may repeat an installed name. */
export function queuedOnly(installed: string[], purchased: string[]): string[] {
    const remaining = [...installed];
    return purchased.filter(name => {
        const index = remaining.indexOf(name);
        if (index < 0) return true;
        remaining.splice(index, 1);
        return false;
    });
}

export function collectDetail(ns: NS) {
    const base = collectBase(ns);
    if (!base.singularityAvailable) return { ...base, detail: { status: "UNKNOWN", reason: "Singularity unavailable in this BitNode/Source-File configuration" } };
    const installed = observe(() => ns.singularity.getOwnedAugmentations(false));
    const purchased = observe(() => ns.singularity.getOwnedAugmentations(true));
    const queued = installed.status === "KNOWN" && purchased.status === "KNOWN"
        ? { status: "KNOWN", value: queuedOnly(installed.value, purchased.value) }
        : { status: "UNKNOWN", reason: "Installed or purchased augmentation observation failed" };
    const work = observe(() => ns.singularity.getCurrentWork());
    const alternateRedPill = base.reset.currentNode === 15;
    const requirements = alternateRedPill ? null : observe(() => ns.singularity.getFactionInviteRequirements("Daedalus"));
    const readiness = requirements?.status === "KNOWN" && installed.status === "KNOWN"
        ? requirements.value.map(requirement => ({ requirement, result: evaluateRequirement(requirement, base.player, installed.value.length) })) : null;
    const factions = base.player.factions.map(name => ({ name,
        reputation: observe(() => ns.singularity.getFactionRep(name)), favor: observe(() => ns.singularity.getFactionFavor(name)),
        augmentations: observe(() => ns.singularity.getAugmentationsFromFaction(name)) }));
    const names = [...new Set(factions.flatMap(f => f.augmentations.status === "KNOWN" ? f.augmentations.value : []))];
    const augmentations = names.map(name => ({ name,
        prerequisites: observe(() => ns.singularity.getAugmentationPrereq(name)),
        reputationRequired: observe(() => ns.singularity.getAugmentationRepReq(name)),
        currentPrice: observe(() => ns.singularity.getAugmentationPrice(name)) }));
    const recommendations: string[] = [];
    if (alternateRedPill) recommendations.push("BN15 uses the alternate Red Pill route. Check the current objective in the game UI.");
    else if (readiness === null) recommendations.push("UNKNOWN Daedalus readiness: recover missing requirement/augmentation observations.");
    else if (!base.player.factions.includes("Daedalus")) {
        for (const item of readiness.filter(r => r.result !== "MET")) {
            recommendations.push(`${item.result}: Daedalus ${JSON.stringify(item.requirement)}. Review this prerequisite before choosing work or purchases.`);
        }
        if (readiness.every(r => r.result === "MET")) recommendations.push("Observed Daedalus requirements met; inspect the faction UI for an invitation. No invitation was triggered or accepted.");
    } else recommendations.push("Daedalus membership observed: review reputation, The Red Pill ownership and live World Daemon threshold.");
    if (queued.status === "KNOWN" && queued.value && queued.value.length > 0) recommendations.push("Review the queued augmentations and reset preview in the game UI.");
    return { ...base, unknowns: base.unknowns.filter(s => !s.startsWith("Queued augmentations")), detail: {
        status: "OBSERVED (inspect each field for UNKNOWN)", currentWork: work, installed, purchased, queued,
        factions, augmentations, daedalus: alternateRedPill ? null : { requirements, readiness, member: base.player.factions.includes("Daedalus"),
            note: "Installed count is based on active augmentations. Each requirement is evaluated independently." },
        recommendations, actionOwnership: "UNKNOWN: observation never acquires or replaces player work",
    } };
}

export async function main(ns: NS): Promise<void> {
    const flags = ns.flags([["dry-run", false], ["json", false], ["help", false]]);
    if (flags.help) { ns.tprint("BT4 detail: run bt4-detail.ts [--dry-run] [--json]. Prefer AP reserve-checked admission. No mutations."); return; }
    ns.tprint(JSON.stringify(collectDetail(ns), null, flags.json ? 0 : 2));
}
