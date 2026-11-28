import type { NS } from "@ns";
import { GAME_COMMIT, type Faction } from "./bitburner-catalog.ts";
import { augmentationBenefit } from "./bt4-plan.ts";

interface InvitationTarget {
    name: string;
    score: number;
    mission: boolean;
    price: number;
    repMissing: number;
}

interface Offer extends Omit<InvitationTarget, "repMissing"> {
    repRequired: number;
    needsPrerequisite: boolean;
}

export interface InvitationRank {
    faction: Faction;
    targets: InvitationTarget[];
    cityConflicts: string[];
    blockedBy: Faction[];
    excluded: string[];
}

function compareTargets(a: InvitationTarget, b: InvitationTarget): number {
    return Number(b.mission) - Number(a.mission) || a.repMissing - b.repMissing ||
        b.score - a.score || a.price - b.price;
}

export function rankInvitations(ns: NS, node: number, reserve: number): InvitationRank[] {
    const player = ns.getPlayer();
    const pending = [...new Set(ns.singularity.checkFactionInvitations())]
        .filter(faction => !player.factions.includes(faction));
    if (!pending.length) return [];

    const spendable = player.money - reserve;
    const owned = new Set(ns.singularity.getOwnedAugmentations(true));
    const joinedOffers = new Set(player.factions.flatMap(faction => ns.singularity.getAugmentationsFromFaction(faction)));
    const catalog = new Map<string, Offer>();
    const ranks: InvitationRank[] = [];
    for (const faction of pending) {
        const cityConflicts = ns.singularity.getFactionEnemies(faction);
        const blockedBy = player.factions.filter(member => cityConflicts.includes(member));
        const targets: InvitationTarget[] = [];
        const excluded = new Set<string>();
        if (!blockedBy.length) {
            const rep = ns.singularity.getFactionRep(faction);
            const offersWork = ns.singularity.getFactionWorkTypes(faction).length > 0;
            for (const name of ns.singularity.getAugmentationsFromFaction(faction)) {
                const mission = name === "The Red Pill";
                if (name === "NeuroFlux Governor" || (node === 15 && mission)) continue;
                if (owned.has(name) || joinedOffers.has(name)) {
                    excluded.add("already owned, queued, or offered by a joined faction");
                    continue;
                }

                let offer = catalog.get(name);
                if (!offer) {
                    const { score } = augmentationBenefit(name, ns.singularity.getAugmentationStats(name));
                    offer = {
                        name, mission, score, price: ns.singularity.getAugmentationPrice(name),
                        repRequired: ns.singularity.getAugmentationRepReq(name),
                        needsPrerequisite: ns.singularity.getAugmentationPrereq(name).some(prerequisite => !owned.has(prerequisite)),
                    };
                    catalog.set(name, offer);
                }
                if (!(offer.mission || offer.score > 0)) {
                    excluded.add("no scored progression benefit");
                    continue;
                }
                if (offer.needsPrerequisite) {
                    excluded.add("missing prerequisites");
                    continue;
                }
                if (!Number.isFinite(offer.price) || offer.price < 0 || offer.price > spendable) {
                    excluded.add("price exceeds spendable cash");
                    continue;
                }
                const repMissing = Math.max(0, offer.repRequired - rep);
                if (repMissing > 0 && !offersWork) {
                    excluded.add("reputation required without standard work");
                    continue;
                }
                targets.push({ name, mission, score: offer.score, price: offer.price, repMissing });
            }
        }
        targets.sort((a, b) => compareTargets(a, b) || a.name.localeCompare(b.name));
        ranks.push({ faction, targets, cityConflicts, blockedBy, excluded: [...excluded] });
    }
    return ranks.sort((a, b) => {
        const left = a.targets[0];
        const right = b.targets[0];
        if (left && right) {
            return compareTargets(left, right) || b.targets.length - a.targets.length || a.faction.localeCompare(b.faction);
        }
        return Number(Boolean(right)) - Number(Boolean(left)) || a.faction.localeCompare(b.faction);
    });
}

export async function main(ns: NS): Promise<void> {
    ns.disableLog("ALL");
    const reset = ns.getResetInfo();
    const game = ns.ui.getGameInfo();
    const show = (message: string) => ns.tprint(`[JIT6 INVITATIONS] ${message}`);
    if (game.version !== "3.0.1" || game.commit.length < 7 || !GAME_COMMIT.startsWith(game.commit) ||
        (reset.currentNode !== 4 && !(reset.ownedSF.get(4) ?? 0))) {
        show("Requires Bitburner 3.0.1 (3162fd2) and Singularity access.");
        return;
    }
    const flags = ns.flags([["reserve", 0]]);
    const reserve = Number(flags.reserve);
    if (!Number.isFinite(reserve) || reserve < 0) {
        show("Enter a finite, nonnegative --reserve.");
        return;
    }

    const rows = rankInvitations(ns, reset.currentNode, reserve);
    if (!rows.length) {
        show("No unjoined faction has a pending invitation.");
        return;
    }
    const dollars = (amount: number) => `$${ns.format.number(amount)}`;
    show(`BN${reset.currentNode} | pending invitations ${rows.length} | cash reserve ${dollars(reserve)}`);
    for (const { faction, targets, cityConflicts, blockedBy, excluded } of rows) {
        if (blockedBy.length) {
            show(`${faction} | incompatible with joined ${blockedBy.join(", ")}`);
            continue;
        }
        show(targets.length
            ? `${faction} | ${targets.length} new progression target(s)`
            : `${faction} | no eligible new target${excluded.length ? ` (${excluded.join(", ")})` : ""}`);
        for (const target of targets.slice(0, 3)) {
            const rep = target.repMissing > 0 ? `${Math.ceil(target.repMissing).toLocaleString()} rep remaining` : "rep requirement met";
            show(`  ${target.name} | ${dollars(target.price)} | ${rep}`);
        }
        if (cityConflicts.length) show(`  Joining excludes ${cityConflicts.join(", ")} for this cycle.`);
    }
    show("Review invitations in Factions. Prices are individual live quotes.");
}
