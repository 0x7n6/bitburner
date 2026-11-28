import type { NS } from "@ns";

const PAUSE = ".7n8-pause.txt";
const FULL = "bt4-auto.ts";
const STUDY = "mission-study.ts";
const UPGRADE = "jit6-home.ts";
const SHARE = "share.ts";
const SHARE_WORKER = "share-worker.ts";
const TRADER = "trader.ts";
const TRADER_HOLD = ".7n8-mission-trader-hold.txt";
const TRADER_DISABLED = ".7n8-trader-disabled.txt";
const TRADER_DRAIN = ".7n8-trader-drain.txt";
const WORK_OWNERS = new Set([FULL, STUDY, "bt4-action.ts", "mission.ts", "progression.ts", "findV2.ts"]);
const CAPITAL_OWNERS = new Set([FULL, "bt4-action.ts", TRADER, "traderctl.ts", "fleet.ts", "mission.ts", UPGRADE]);
const TICK_MS = 5_000;
const MAX_LAUNCH_REJECTIONS = 3;

type Job = typeof FULL | typeof STUDY | typeof UPGRADE;
type Service = typeof SHARE | typeof TRADER;

interface Snapshot {
    paused: boolean;
    available: boolean;
    free: number;
    emergency: number;
    homeRam: number;
    costs: Record<Job, number>;
    workOwner?: string;
    capitalOwner?: string;
    remainingMs: number;
}

export function planAdmission(snapshot: Snapshot, target: number, upgradeAttempted: boolean, augmentCap = 0):
    { job: Job; reason: string } | { job: null; reason: string } {
    if (snapshot.remainingMs <= 0) return { job: null, reason: "Session deadline reached." };
    if (snapshot.paused) return { job: null, reason: "OS is paused." };
    if (!snapshot.available) return { job: null, reason: "Singularity is locked. Use the game UI for player work." };
    if (!(snapshot.emergency > 0)) return { job: null, reason: "Emergency control script cost unavailable. Sync stopfarm.ts." };
    if (snapshot.workOwner) return { job: null, reason: `Player work is reserved by ${snapshot.workOwner}.` };
    if (augmentCap > 0 && snapshot.capitalOwner) {
        return { job: null, reason: `Augmentation budget is waiting for ${snapshot.capitalOwner} to exit.` };
    }

    const fits = (job: Job) => snapshot.costs[job] > 0 &&
        snapshot.free >= snapshot.costs[job] + snapshot.emergency;
    const wantsUpgrade = !upgradeAttempted && snapshot.homeRam * 2 <= target;
    if (wantsUpgrade && !snapshot.capitalOwner && fits(UPGRADE)) {
        return { job: UPGRADE, reason: "RAM can admit one home upgrade quote while preserving emergency headroom." };
    }
    if (snapshot.remainingMs >= TICK_MS && fits(FULL)) {
        return { job: FULL, reason: "Full progression pilot fits with emergency headroom." };
    }
    if (augmentCap > 0) return { job: null, reason: "Augmentation purchases require enough RAM for the full player-work tool." };
    if (fits(STUDY)) return { job: STUDY, reason: "One-shot free study fits with emergency headroom." };
    if (wantsUpgrade && snapshot.capitalOwner) {
        return { job: null, reason: `Upgrade blocked by ${snapshot.capitalOwner}; no work tool fits.` };
    }
    return { job: null, reason: "No ready tool fits with emergency headroom. Check installed scripts and free RAM." };
}

export async function main(ns: NS): Promise<void> {
    ns.disableLog("ALL");
    const flags = ns.flags([
        ["execute", false], ["minutes", 15], ["home-target", 0], ["home-cap", 0], ["reserve", 0],
        ["augment-cap", 0], ["share", false], ["trader", false],
    ]);
    const execute = flags.execute === true;
    const minutes = Number(flags.minutes);
    const target = Number(flags["home-target"]);
    const cap = Number(flags["home-cap"]);
    const reserve = Number(flags.reserve);
    const augmentCap = Number(flags["augment-cap"] ?? 0);
    const optional: Service[] = [];
    if (flags.trader === true) optional.push(TRADER);
    if (flags.share === true) optional.push(SHARE);
    const report = (message: string) => {
        const line = `[JIT6 SUPPORT] ${message}`;
        ns.print(line);
        ns.tprint(line);
    };
    if (!Number.isInteger(minutes) || minutes < 1 || minutes > 120 ||
        !Number.isSafeInteger(target) || target < 0 || !Number.isFinite(cap) || cap < 0 ||
        !Number.isFinite(reserve) || reserve < 0 || !Number.isFinite(augmentCap) || augmentCap < 0 ||
        (target > 0) !== (cap > 0) ||
        (Array.isArray(flags._) && flags._.length)) {
        report("Use --minutes 1-120. An upgrade requires both --home-target <GB> and --home-cap <game dollars>; --reserve protects cash.");
        return;
    }
    if (optional.includes(TRADER) && (!(reserve > 0) || cap > 0 || augmentCap > 0)) {
        report("Trader needs a positive cash reserve and a session without purchase budgets.");
        return;
    }
    const game = ns.ui.getGameInfo();
    if (ns.getHostname() !== "home" || game.version !== "3.0.1" || !game.commit.startsWith("3162fd2")) {
        report("Requires home and Bitburner 3.0.1 (3162fd2).");
        return;
    }

    const reset = ns.getResetInfo();
    const deadline = Date.now() + minutes * 60_000;
    const available = reset.currentNode === 4 || (reset.ownedSF.get(4) ?? 0) > 0;
    let upgradeAttempted = false;
    let ownedPid = 0;
    let ownedJob: Job | null = null;
    let homeBeforeUpgrade = 0;
    let launchRejections = 0;
    let lastReason = "";
    let workFinished = false;
    const servicePids = new Map<Service, number>();
    const serviceReasons = new Map<Service, string>();
    const disabledAtStart = optional.includes(TRADER) && ns.fileExists(TRADER_DISABLED, "home") ? ns.read(TRADER_DISABLED) : null;

    if (execute) {
        ns.atExit(() => {
            for (const pid of servicePids.values()) if (pid) ns.kill(pid);
            if (ownedPid) ns.kill(ownedPid);
        });
    }

    while (Date.now() < deadline) {
        const live = ns.getResetInfo();
        const ownGeneration = live.currentNode === reset.currentNode && live.lastNodeReset === reset.lastNodeReset &&
            live.lastAugReset === reset.lastAugReset;
        if (!ownGeneration) {
            report("Reset changed. Session ended.");
            return;
        }
        const running = ns.ps("home");
        const homeRam = ns.getServerMaxRam("home");
        const free = Math.max(0, homeRam - ns.getServerUsedRam("home"));
        const emergency = ns.getScriptRam("stopfarm.ts", "home");
        const paused = ns.fileExists(PAUSE, "home");
        const competingScheduler = running.find(p => ["daemon.ts", "bootstrap.ts"].includes(p.filename) ||
            (p.filename === "jit6.ts" && p.pid !== ns.pid && p.args.includes("--execute")));
        const blocker = paused ? "OS is paused." :
            competingScheduler ? `Another supervisor is active: ${competingScheduler.filename}.` :
            !available && !optional.length ? "Singularity is locked. Use the game UI for player work." :
            !(emergency > 0) ? "Emergency control script cost unavailable. Sync stopfarm.ts." :
            free < emergency ? "Emergency RAM unavailable." : null;
        const snapshot: Snapshot = {
            paused, available, free, emergency, homeRam,
            costs: {
                [FULL]: ns.fileExists("bt4-plan.ts", "home") ? ns.getScriptRam(FULL, "home") : 0,
                [STUDY]: ns.getScriptRam(STUDY, "home"),
                [UPGRADE]: target ? ns.getScriptRam(UPGRADE, "home") : 0,
            },
            workOwner: running.find(p => p.pid !== ownedPid && WORK_OWNERS.has(p.filename))?.filename,
            capitalOwner: running.find(p => p.pid !== ownedPid && CAPITAL_OWNERS.has(p.filename))?.filename,
            remainingMs: deadline - Date.now(),
        };

        if (!execute) {
            const plan = blocker ? { job: null, reason: blocker } : planAdmission(snapshot, target, false, augmentCap);
            const legacyEngine = running.filter(p => ["jit5.ts", "early.ts", "harvest.ts"].includes(p.filename))
                .map(p => `${p.filename} PID ${p.pid}`).join(", ");
            report(`Preview | legacy engine=${legacyEngine || "none on home"} | home=${homeRam} GB | free=${free.toFixed(2)} GB | emergency=${emergency.toFixed(2)} GB.`);
            report(`Next: ${plan.job ?? "wait"} | ${plan.reason}`);
            if (plan.job === FULL || plan.job === STUDY) report("Scheduled player work can replace an ongoing university course.");
            if (optional.length) report(`Requested services: ${optional.join(", ")}. Session admission checks live availability and reserve.`);
            return;
        }
        if (blocker) {
            report(blocker);
            return;
        }

        if (ownedPid && !running.some(p => p.pid === ownedPid)) {
            ownedPid = 0;
            if (ownedJob === UPGRADE) {
                report(`Upgrade attempt ended. Home RAM: ${homeBeforeUpgrade} → ${homeRam} GB. See [JIT6 HOME] for the outcome.`);
                ownedJob = null;
            } else {
                report("Work tool exited. Any player activity it started remains active.");
                if (!optional.length) return;
                ownedJob = null;
                workFinished = true;
            }
        }

        if (!ownedPid && !workFinished) {
            const decision = planAdmission(snapshot, target, upgradeAttempted, augmentCap);
            if (decision.reason !== lastReason) report(decision.reason);
            lastReason = decision.reason;
            if (decision.job) {
                const job = decision.job;
                const args = job === FULL
                    ? ["--execute", "--minutes", minutes, "--deadline", deadline, "--replace-study", "--reserve", reserve, "--budget", augmentCap]
                    : job === UPGRADE
                        ? [cap, reserve, target, deadline, reset.currentNode, reset.lastNodeReset, reset.lastAugReset]
                        : ["--replace-study"];
                // Fixed job choices keep execution inside the support scheduler's work and capital policy.
                const pid = ns.exec(job, "home", { threads: 1, preventDuplicates: true }, ...args);
                if (pid) {
                    ownedPid = pid;
                    ownedJob = job;
                    launchRejections = 0;
                    if (job === UPGRADE) {
                        upgradeAttempted = true;
                        homeBeforeUpgrade = homeRam;
                    }
                    report(`Started ${job} (PID ${pid}).`);
                } else {
                    launchRejections++;
                    report(`Launch rejected for ${job} (${launchRejections}/${MAX_LAUNCH_REJECTIONS}).`);
                    if (launchRejections >= MAX_LAUNCH_REJECTIONS) return;
                }
            }
        }
        if (ownedJob !== UPGRADE && !(cap > 0 && !upgradeAttempted && !ownedPid)) {
            for (const service of optional) {
                if (servicePids.has(service) || deadline - Date.now() < TICK_MS) continue;
                const pendingTrader = optional.includes(TRADER) && !servicePids.has(TRADER);
                const admission = service === SHARE && available && !ownedPid && !workFinished
                    ? "Waiting for player-work admission."
                    : serviceAdmission(ns, service, emergency, reserve, ownedPid, disabledAtStart, reset.lastAugReset, pendingTrader);
                if (typeof admission === "string") {
                    if (admission !== serviceReasons.get(service)) report(`${service}: ${admission}`);
                    serviceReasons.set(service, admission);
                    continue;
                }
                if (service === TRADER && !ns.fileExists(TRADER_HOLD, "home")) {
                    await ns.write(TRADER_HOLD, "Explicit Trader authorization required.", "w");
                    if (!ns.fileExists(TRADER_HOLD, "home")) {
                        report("Trader could not write its hold marker.");
                        servicePids.set(service, 0);
                    }
                    break;
                }

                const rearm = service === TRADER && ns.fileExists(TRADER_DISABLED, "home");
                if (rearm && !ns.rm(TRADER_DISABLED, "home")) {
                    report("Trader could not clear its disabled marker. Start a new session after checking the marker.");
                    servicePids.set(service, 0);
                    continue;
                }
                const pid = ns.exec(service, "home", { threads: 1, preventDuplicates: true }, ...admission);
                servicePids.set(service, pid);
                report(pid ? `Started ${service} (PID ${pid}).` : `Launch rejected for ${service}.`);
                if (!pid && rearm && disabledAtStart !== null && !ns.fileExists(TRADER_DISABLED, "home")) {
                    await ns.write(TRADER_DISABLED, disabledAtStart, "w");
                    break;
                }
            }
        }
        await ns.sleep(Math.min(TICK_MS, Math.max(0, deadline - Date.now())));
    }
    report("Session time limit reached. Existing player activity continues.");
}

function serviceAdmission(ns: NS, service: Service, emergency: number, reserve: number, workPid: number,
    disabledAtStart: string | null, lastAugReset: number, pendingTrader: boolean): (string | number)[] | string {
    const running = ns.ps("home");
    const max = ns.getServerMaxRam("home");
    const free = max - ns.getServerUsedRam("home");
    const ram = ns.getScriptRam(service, "home");
    if (!(ram > 0)) return "Script missing or RAM cost unavailable.";
    if (service === SHARE) {
        if (running.some(p => p.filename === SHARE || p.filename === SHARE_WORKER)) return "An external Share service is active.";
        const workerRam = ns.getScriptRam(SHARE_WORKER, "home");
        // Leave room to reopen AP and inspect status even when they are closed at admission.
        const traderRam = pendingTrader && !running.some(p => p.filename === TRADER) ? ns.getScriptRam(TRADER, "home") : 0;
        const shareReserve = emergency + ns.getScriptRam("ap.ts", "home") + ns.getScriptRam("jit6-dashboard.ts", "home") + traderRam;
        if (!(workerRam > 0)) return "Sync share-worker.ts.";
        if (Math.min(max * 0.75, free - ram - shareReserve) < workerRam) {
            return `Waiting for room for one Share thread and ${shareReserve.toFixed(2)} GB of control headroom.`;
        }
        return ["--reserve", shareReserve, "--owner", ns.pid];
    }
    const spender = running.find(p => p.pid !== workPid && CAPITAL_OWNERS.has(p.filename));
    if (spender) return `Waiting for ${spender.filename} to exit.`;
    if (!ns.stock.hasTixApiAccess() || !ns.stock.has4SDataTixApi()) return "TIX and 4S TIX access are required. See the stock market UI.";
    if (ns.fileExists(TRADER_DISABLED, "home") && ns.read(TRADER_DISABLED) !== disabledAtStart) return "Trader was disabled during this session.";
    if (ns.fileExists(TRADER_DRAIN, "home")) {
        const marker = ns.read(TRADER_DRAIN).trim();
        const generation = Number(marker);
        if (!marker || !Number.isFinite(generation) || generation === lastAugReset) return "Trader is held in cash for this augmentation cycle.";
    }
    if (free - ram < emergency) return "Waiting for home RAM with emergency headroom.";
    return ["--reserve-abs", reserve, "--disable-shorts", "--mission-owned"];
}
