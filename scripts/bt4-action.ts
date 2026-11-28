import type { NS } from "@ns";

type Quote = { description: string; identity: string; price: number; execute: () => boolean };

export async function main(ns: NS): Promise<void> {
    const reject = (message: string) => ns.tprint(`[BT4] ${message}`);
    if (ns.getHostname() !== "home") {
        reject("Run the action from home.");
        return;
    }
    const [operation, ...args] = ns.args;
    const reset = ns.getResetInfo();
    if (reset.currentNode !== 4 && !(reset.ownedSF.get(4) ?? 0)) {
        reject("Singularity unavailable.");
        return;
    }

    function checkEnvironment(): void {
        const live = ns.getResetInfo();
        if (live.currentNode !== reset.currentNode || live.lastNodeReset !== reset.lastNodeReset ||
            live.lastAugReset !== reset.lastAugReset) throw new Error("Reset generation changed.");
        if (ns.fileExists(".7n8-pause.txt", "home")) throw new Error("OS is paused.");
        const reserve = ns.getScriptRam("stopfarm.ts", "home");
        const free = ns.getServerMaxRam("home") - ns.getServerUsedRam("home");
        if (!(reserve > 0) || free < reserve) throw new Error("Emergency RAM is unavailable.");
        if (ns.ps("home").some(p => ["bt4-action.ts", "bt4-auto.ts", "mission-study.ts"].includes(p.filename) && p.pid !== ns.pid)) {
            throw new Error("Another BT4 action is active.");
        }
    }

    function quote(): Quote {
        checkEnvironment();
        const player = ns.getPlayer();
        if (operation === "work" && args.length === 2) {
            if (ns.singularity.getCurrentWork() !== null) throw new Error("Player already has work. Finish it in the game before starting another action.");
            const faction = player.factions.find(name => name === args[0]);
            if (!faction) throw new Error("Faction membership required.");
            const work = ns.singularity.getFactionWorkTypes(faction).find(type => type === args[1]);
            if (!work) throw new Error("That work type is unavailable for this faction.");
            return {
                description: `Start ${work} work for ${faction} in the background`,
                identity: JSON.stringify([operation, faction, work]),
                price: 0,
                execute: () => ns.singularity.workForFaction(faction, work, false),
            };
        }

        const buyAug = operation === "augmentation" && args.length === 4;
        const buyRam = operation === "home-ram" && args.length === 2;
        if (!buyAug && !buyRam) throw new Error("Choose Faction work, Buy one augmentation, or Upgrade home RAM through AP.");
        const [budget, cashFloor] = args.slice(-2);
        if (typeof budget !== "number" || !Number.isFinite(budget) || budget < 0 ||
            typeof cashFloor !== "number" || !Number.isFinite(cashFloor) || cashFloor < 0) {
            throw new Error("Enter a finite numeric budget and cash floor, both nonnegative.");
        }
        if (ns.ps("home").some(p => ["trader.ts", "traderctl.ts", "fleet.ts"].includes(p.filename))) {
            throw new Error("A capital service is active. Finish or stop it before a BT4 purchase.");
        }

        let proposal: Quote;
        if (buyAug) {
            const faction = player.factions.find(name => name === args[0]);
            const name = args[1];
            if (!faction || typeof name !== "string" || name === "NeuroFlux Governor" ||
                !ns.singularity.getAugmentationsFromFaction(faction).includes(name)) {
                throw new Error("Select a non-repeatable augmentation offered by a joined faction.");
            }
            const owned = new Set(ns.singularity.getOwnedAugmentations(true));
            if (owned.has(name)) throw new Error("Already installed or queued.");
            const missing = ns.singularity.getAugmentationPrereq(name).filter(prerequisite => !owned.has(prerequisite));
            if (missing.length) throw new Error(`Missing prerequisites: ${missing.join(", ")}`);
            if (ns.singularity.getFactionRep(faction) < ns.singularity.getAugmentationRepReq(name)) {
                throw new Error("Faction reputation is below the live requirement.");
            }
            proposal = {
                description: `Queue ${name} from ${faction}`,
                identity: JSON.stringify([operation, faction, name]),
                price: ns.singularity.getAugmentationPrice(name),
                execute: () => ns.singularity.purchaseAugmentation(faction, name),
            };
        } else {
            const ram = ns.getServerMaxRam("home");
            if (reset.bitNodeOptions.restrictHomePCUpgrade && ram >= 128) {
                throw new Error("Home RAM upgrades are restricted at the current capacity.");
            }
            proposal = {
                description: `Upgrade home RAM from ${ram} GB to ${ram * 2} GB`,
                identity: JSON.stringify([operation, ram]),
                price: ns.singularity.getUpgradeHomeRamCost(),
                execute: () => ns.singularity.upgradeHomeRam(),
            };
        }
        if (!Number.isFinite(proposal.price) || proposal.price < 0 || proposal.price > budget ||
            player.money < cashFloor + proposal.price) {
            throw new Error(`Quote $${proposal.price} exceeds the budget or would breach cash floor $${cashFloor}.`);
        }
        proposal.description += ` for $${proposal.price.toLocaleString()}; cash floor $${cashFloor.toLocaleString()}`;
        return proposal;
    }

    try {
        const before = quote();
        const approved = await ns.prompt(`${before.description}?`, { type: "boolean" });
        if (approved !== true) {
            reject("Cancelled.");
            return;
        }

        // Keep the final checks and mutation in the same synchronous turn.
        const live = quote();
        if (before.identity !== live.identity || before.price !== live.price) {
            reject("The quote changed. Run the action again for a new approval.");
            return;
        }
        reject(live.execute() ? `Completed: ${live.description}` : "The game rejected the action. Review the script log.");
    } catch (error) {
        reject(String(error));
    }
}
