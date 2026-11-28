import type { NS, Task } from "@ns";
import { observeProgression } from "./bt4-plan.ts";

const MAX_PURCHASES = 8;
const CHECK_INTERVAL_MS = 5_000;
const WORK_CONFLICTS = new Set(["bt4-action.ts", "progression.ts", "findV2.ts", "mission-study.ts"]);
const SPENDING_CONFLICTS = new Set(["trader.ts", "traderctl.ts", "fleet.ts"]);
const LOCAL_UNIVERSITIES = {
    "Aevum": "Summit University",
    "Sector-12": "Rothman University",
    "Volhaven": "ZB Institute of Technology",
} as const;

type ReputationTarget = ReturnType<typeof observeProgression>["repTargets"][number];
type FactionWorkType = ReputationTarget["seller"]["work"][number];

function chooseWork(ns: NS, targets: ReputationTarget[], unfocusedWorkRate: number) {
    const target = targets[0];
    if (!target) return undefined;
    const fallback = {
        faction: target.seller.faction,
        type: target.seller.work.find(type => type === "hacking") ?? target.seller.work[0],
        estimatedCycles: null as number | null,
        augmentation: target.augmentation,
    };
    if (!ns.fileExists("Formulas.exe", "home")) return fallback;

    try {
        const player = ns.getPlayer();
        const rates = new Map<ReputationTarget["seller"]["faction"], { type: FactionWorkType; rate: number } | null>();
        let best = fallback;
        for (const option of targets) {
            for (const { faction, repMissing, work } of option.workSellers) {
                let fastest = rates.get(faction);
                if (fastest === undefined) {
                    const favor = ns.singularity.getFactionFavor(faction);
                    fastest = null;
                    for (const type of work) {
                        const rate = ns.formulas.work.factionGains(player, type, favor).reputation * unfocusedWorkRate;
                        if (Number.isFinite(rate) && rate > (fastest?.rate ?? 0)) fastest = { type, rate };
                    }
                    rates.set(faction, fastest);
                }
                if (fastest) {
                    const cycles = repMissing / fastest.rate;
                    if (Number.isFinite(cycles) && cycles < (best.estimatedCycles ?? Infinity)) {
                        best = { faction, type: fastest.type, estimatedCycles: cycles, augmentation: option.augmentation };
                    }
                }
            }
        }
        return best;
    } catch {
        return fallback;
    }
}

export async function main(ns: NS): Promise<void> {
    ns.disableLog("ALL");
    const flags = ns.flags([["execute", false], ["reserve", -1], ["budget", 0], ["minutes", 15], ["deadline", 0], ["wait-idle", false]]);
    const execute = flags.execute === true;
    const reserve = Number(flags.reserve);
    const budget = Number(flags.budget);
    const minutes = Number(flags.minutes);
    const externalDeadline = Number(flags.deadline ?? 0);
    const announce = (message: string) => {
        const line = `[BT4 AUTO] ${message}`;
        ns.print(line);
        ns.tprint(line);
    };
    if (!Number.isFinite(reserve) || reserve < 0 || !Number.isFinite(budget) || budget < 0 ||
        !Number.isFinite(externalDeadline) || externalDeadline < 0 ||
        !Number.isInteger(minutes) || minutes < 1 || minutes > 120 || (Array.isArray(flags._) && flags._.length)) {
        announce("Supply --reserve >=0, optionally --budget >=0 and --minutes 1–120. Add --execute to act.");
        return;
    }

    const reset = ns.getResetInfo();
    const game = ns.ui.getGameInfo();
    if (ns.getHostname() !== "home" || (reset.currentNode !== 4 && !(reset.ownedSF.get(4) ?? 0)) ||
        game.version !== "3.0.1" || !game.commit.startsWith("3162fd2")) {
        announce("This pilot requires home and Singularity on Bitburner v3.0.1 (3162fd2).");
        return;
    }

    const limit = Date.now() + minutes * 60_000;
    const deadline = externalDeadline > 0 ? Math.min(limit, externalDeadline) : limit;
    if (deadline <= Date.now()) {
        announce("The shared work deadline has expired.");
        return;
    }
    let ownedTask: Task["nextCompletion"] | null = null;
    let idleWaitReported = false;
    let workGoal: string | null = null;
    let spent = 0;
    let purchases = 0;

    if (execute) ns.print(`[BT4 AUTO] Policy: ${minutes} min, cash floor $${reserve}, session budget $${budget}.`);

    try {
        while (Date.now() < deadline) {
            const live = ns.getResetInfo();
            const current = ns.singularity.getCurrentWork();
            let waitingForIdle = false;
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
                    waitingForIdle = flags["wait-idle"] === true && ownedTask === null && current !== null;
                    if (!waitingForIdle) {
                        announce("Stopped because player work is externally owned or was cancelled.");
                        return;
                    }
                    if (!idleWaitReported) announce("Player already working. Waiting for idle before starting new work.");
                    idleWaitReported = true;
                }
            }
            if (waitingForIdle && (spent >= budget || purchases >= MAX_PURCHASES)) {
                await ns.sleep(Math.min(CHECK_INTERVAL_MS, Math.max(0, deadline - Date.now())));
                continue;
            }

            const plan = observeProgression(ns, live.currentNode, reserve);
            const nextPurchase = budget > 0 && purchases < MAX_PURCHASES
                ? plan.ready.find(candidate => candidate.useful && Number.isFinite(candidate.price) &&
                    candidate.price >= 0 && candidate.price <= budget - spent)
                : undefined;
            const seller = nextPurchase?.sellers.find(offer => offer.repMissing === 0);

            const repTargets = plan.repTargets.filter(target => target.useful && target.affordable);
            const preferred = repTargets.find(option => option.mission) ??
                repTargets.find(option => option.augmentation === workGoal);
            const work = waitingForIdle ? undefined : chooseWork(ns, preferred ? [preferred] : repTargets, plan.unfocusedWorkRate);
            const university = LOCAL_UNIVERSITIES[plan.city as keyof typeof LOCAL_UNIVERSITIES];

            if (!execute) {
                announce(JSON.stringify({
                    mode: "preview", cash: plan.cash, reserve, budget, minutes, currentWork: current,
                    purchase: nextPurchase && seller ? { name: nextPurchase.name, faction: seller.faction, price: nextPurchase.price } : null,
                    nextWork: work ?? (university ? { university, course: "Computer Science" } : null),
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
            } else if (!waitingForIdle) {
                let started = false;
                if (work) {
                    if (current?.type === "FACTION" && current.factionName === work.faction &&
                        current.factionWorkType === work.type) {
                        workGoal = work.augmentation;
                    } else {
                        started = ns.singularity.workForFaction(work.faction, work.type, false);
                        workGoal = work.augmentation;
                        if (!started) throw new Error(`Game rejected ${work.type} work for ${work.faction}.`);
                        announce(`Started ${work.type} work for ${work.faction} toward ${workGoal}.`);
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
