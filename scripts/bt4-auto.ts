import type { NS, Task } from "@ns";
import { observeProgression } from "./bt4-plan.ts";

const MAX_PURCHASES = 8;
const CHECK_INTERVAL_MS = 5_000;
const WORK_CONFLICTS = new Set(["bt4-action.ts", "progression.ts", "findV2.ts"]);
const SPENDING_CONFLICTS = new Set(["trader.ts", "traderctl.ts", "fleet.ts"]);
const LOCAL_UNIVERSITIES = {
    "Aevum": "Summit University",
    "Sector-12": "Rothman University",
    "Volhaven": "ZB Institute of Technology",
} as const;

export async function main(ns: NS): Promise<void> {
    ns.disableLog("ALL");
    const flags = ns.flags([["execute", false], ["reserve", -1], ["budget", 0], ["minutes", 15]]);
    const execute = flags.execute === true;
    const reserve = Number(flags.reserve);
    const budget = Number(flags.budget);
    const minutes = Number(flags.minutes);
    const announce = (message: string) => ns.tprint(`[BT4 AUTO] ${message}`);
    if (!Number.isFinite(reserve) || reserve < 0 || !Number.isFinite(budget) || budget < 0 ||
        !Number.isInteger(minutes) || minutes < 1 || minutes > 120 || (Array.isArray(flags._) && flags._.length)) {
        announce("Supply --reserve >=0, optionally --budget >=0 and --minutes 1–120. Add --execute to act.");
        return;
    }

    const reset = ns.getResetInfo();
    const game = ns.ui.getGameInfo();
    if (ns.getHostname() !== "home" || reset.currentNode !== 4 ||
        game.version !== "3.0.1" || !game.commit.startsWith("3162fd2")) {
        announce("This pilot requires home, BN4, and Bitburner v3.0.1 (3162fd2).");
        return;
    }

    const deadline = Date.now() + minutes * 60_000;
    let ownedTask: Task["nextCompletion"] | null = null;
    let workGoal: string | null = null;
    let spent = 0;
    let purchases = 0;

    if (execute) ns.print(`[BT4 AUTO] Policy: ${minutes} min, cash floor $${reserve}, session budget $${budget}.`);

    try {
        while (Date.now() < deadline) {
            const live = ns.getResetInfo();
            const current = ns.singularity.getCurrentWork();
            if (execute) {
                if (live.currentNode !== reset.currentNode || live.lastNodeReset !== reset.lastNodeReset ||
                    live.lastAugReset !== reset.lastAugReset) {
                    announce("Stopped because the reset generation changed.");
                    return;
                }
                if (ns.fileExists(".7n8-pause.txt", "home")) {
                    announce("Stopped because the OS is paused.");
                    return;
                }
                const emergency = ns.getScriptRam("stopfarm.ts", "home");
                const free = ns.getServerMaxRam("home") - ns.getServerUsedRam("home");
                if (!(emergency > 0) || free < emergency) {
                    announce("Stopped to release RAM for emergency controls.");
                    return;
                }
                const conflict = ns.ps("home").find(process => process.pid !== ns.pid &&
                    (process.filename === "bt4-auto.ts" || WORK_CONFLICTS.has(process.filename)));
                if (conflict) {
                    announce(`Stopped because ${conflict.filename} is active.`);
                    return;
                }
                const currentToken = current?.nextCompletion ?? null;
                if (currentToken !== ownedTask || (current !== null && currentToken === null)) {
                    announce("Stopped because player work is externally owned or was cancelled.");
                    return;
                }
            }

            const plan = observeProgression(ns, live.currentNode, reserve);
            const nextPurchase = budget > 0 && purchases < MAX_PURCHASES
                ? plan.ready.find(candidate => candidate.useful && Number.isFinite(candidate.price) &&
                    candidate.price >= 0 && candidate.price <= budget - spent)
                : undefined;
            const seller = nextPurchase?.sellers.find(offer => offer.repMissing === 0);

            const repTargets = plan.repTargets.filter(target => target.useful && target.affordable);
            const target = repTargets.find(option => option.augmentation === workGoal && option.seller?.work.includes("hacking")) ??
                repTargets.find(option => option.seller?.work.includes("hacking")) ?? repTargets[0];
            const work = target?.seller;
            const workType = work?.work.find(type => type === "hacking") ?? work?.work[0];
            const university = LOCAL_UNIVERSITIES[plan.city as keyof typeof LOCAL_UNIVERSITIES];

            if (!execute) {
                announce(JSON.stringify({
                    mode: "preview", cash: plan.cash, reserve, budget, minutes, currentWork: current,
                    purchase: nextPurchase && seller ? { name: nextPurchase.name, faction: seller.faction, price: nextPurchase.price } : null,
                    nextWork: work && workType ? { faction: work.faction, type: workType, augmentation: target.augmentation }
                        : university ? { university, course: "Computer Science" } : null,
                }));
                return;
            }

            // Keep lookups and mutations in the same turn. Re-observe prices after every purchase.
            if (nextPurchase && seller &&
                !ns.ps("home").some(process => SPENDING_CONFLICTS.has(process.filename))) {
                if (!ns.singularity.purchaseAugmentation(seller.faction, nextPurchase.name)) {
                    announce(`Stopped because the game rejected ${nextPurchase.name}.`);
                    return;
                }
                spent += nextPurchase.price;
                purchases++;
                announce(`Queued ${nextPurchase.name} for $${nextPurchase.price}; session spent $${spent}/$${budget}.`);
            } else {
                let started = false;
                if (work && workType) {
                    if (current?.type === "FACTION" && current.factionName === work.faction &&
                        current.factionWorkType === workType) {
                        workGoal = target.augmentation;
                    } else {
                        started = ns.singularity.workForFaction(work.faction, workType, false);
                        workGoal = target.augmentation;
                        if (!started) throw new Error(`Game rejected ${workType} work for ${work.faction}.`);
                        announce(`Started ${workType} work for ${work.faction} toward ${workGoal}.`);
                    }
                } else if (university && (current === null || current.type === "FACTION")) {
                    started = ns.singularity.universityCourse(university, "Computer Science", false);
                    workGoal = null;
                    if (!started) throw new Error(`Game rejected free Computer Science at ${university}.`);
                    announce(`Started free Computer Science at ${university}.`);
                }
                if (started) {
                    const token = ns.singularity.getCurrentWork()?.nextCompletion;
                    if (!token || typeof token.then !== "function" || token === ownedTask) {
                        throw new Error("Could not establish the identity of started player work.");
                    }
                    ownedTask = token;
                }
                if (!ownedTask && !nextPurchase) {
                    announce("No useful affordable faction target or free university in this city.");
                    return;
                }
            }
            await ns.sleep(Math.min(CHECK_INTERVAL_MS, Math.max(0, deadline - Date.now())));
        }
        announce(`Session ended. Queued ${purchases} augmentations for $${spent}. Existing work continues.`);
    } catch (error) {
        announce(`Stopped. ${String(error)}`);
    }
}
