import type { NS } from "@ns";

const PAUSE = ".7n8-pause.txt";
const FULL = "bt4-auto.ts";
const STUDY = "mission-study.ts";
const UPGRADE = "jit6-home.ts";
const WORK_OWNERS = new Set([FULL, STUDY, "bt4-action.ts", "mission.ts", "progression.ts", "findV2.ts"]);
const CAPITAL_OWNERS = new Set([FULL, "bt4-action.ts", "trader.ts", "traderctl.ts", "fleet.ts", "mission.ts", UPGRADE]);
const TICK_MS = 5_000;
const MAX_LAUNCH_REJECTIONS = 3;

type Job = typeof FULL | typeof STUDY | typeof UPGRADE;

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

export function planAdmission(snapshot: Snapshot, target: number, upgradeAttempted: boolean):
    { job: Job; reason: string } | { job: null; reason: string } {
    if (snapshot.remainingMs <= 0) return { job: null, reason: "Session deadline reached." };
    if (snapshot.paused) return { job: null, reason: "OS is paused." };
    if (!snapshot.available) return { job: null, reason: "Singularity is locked. Use the game UI for player work." };
    if (!(snapshot.emergency > 0)) return { job: null, reason: "Emergency control script cost unavailable. Sync stopfarm.ts." };
    if (snapshot.workOwner) return { job: null, reason: `Player work is reserved by ${snapshot.workOwner}.` };

    const fits = (job: Job) => snapshot.costs[job] > 0 &&
        snapshot.free >= snapshot.costs[job] + snapshot.emergency;
    const wantsUpgrade = !upgradeAttempted && snapshot.homeRam * 2 <= target;
    if (wantsUpgrade && !snapshot.capitalOwner && fits(UPGRADE)) {
        return { job: UPGRADE, reason: "RAM can admit one home upgrade quote while preserving emergency headroom." };
    }
    if (snapshot.remainingMs >= TICK_MS && fits(FULL)) {
        return { job: FULL, reason: "Full progression pilot fits with emergency headroom." };
    }
    if (fits(STUDY)) return { job: STUDY, reason: "One-shot free study fits with emergency headroom." };
    if (wantsUpgrade && snapshot.capitalOwner) {
        return { job: null, reason: `Upgrade blocked by ${snapshot.capitalOwner}; no work tool fits.` };
    }
    return { job: null, reason: "No ready tool fits with emergency headroom. Check installed scripts and free RAM." };
}

export async function main(ns: NS): Promise<void> {
    ns.disableLog("ALL");
    const flags = ns.flags([["execute", false], ["minutes", 15], ["home-target", 0], ["home-cap", 0], ["reserve", 0]]);
    const execute = flags.execute === true;
    const minutes = Number(flags.minutes);
    const target = Number(flags["home-target"]);
    const cap = Number(flags["home-cap"]);
    const reserve = Number(flags.reserve);
    const report = (message: string) => ns.tprint(`[JIT6 SUPPORT] ${message}`);
    if (!Number.isInteger(minutes) || minutes < 1 || minutes > 120 ||
        !Number.isSafeInteger(target) || target < 0 || !Number.isFinite(cap) || cap < 0 ||
        !Number.isFinite(reserve) || reserve < 0 || (target > 0) !== (cap > 0) ||
        (Array.isArray(flags._) && flags._.length)) {
        report("Use --minutes 1-120. An upgrade requires both --home-target <GB> and --home-cap <game dollars>; --reserve protects cash.");
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

    if (execute) {
        // Kill only the child whose PID this session obtained from exec.
        ns.atExit(() => { if (ownedPid) ns.kill(ownedPid); });
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
        const competingScheduler = running.some(p => p.filename === "jit6.ts" && p.pid !== ns.pid && p.args.includes("--execute"));
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
            const plan = planAdmission(snapshot, target, false);
            const engine = running.filter(p => ["jit5.ts", "early.ts", "harvest.ts"].includes(p.filename))
                .map(p => `${p.filename} PID ${p.pid}`).join(", ");
            report(`Preview | engine=${engine || "none on home"} | home=${homeRam} GB | free=${free.toFixed(2)} GB | emergency=${emergency.toFixed(2)} GB.`);
            report(`Next: ${plan.job ?? "wait"} | ${plan.reason}`);
            return;
        }
        if (paused || !available || !(emergency > 0) || free < emergency || competingScheduler) {
            report(paused ? "OS is paused." : !available ? "Singularity is locked. Use the game UI for player work." :
                competingScheduler ? "Another JIT6 support scheduler is active." : "Emergency RAM unavailable. Ending session.");
            return;
        }

        if (ownedPid && !running.some(p => p.pid === ownedPid)) {
            ownedPid = 0;
            if (ownedJob === UPGRADE) {
                report(`Upgrade attempt ended. Home RAM: ${homeBeforeUpgrade} → ${homeRam} GB. See [JIT6 HOME] for the outcome.`);
                ownedJob = null;
            } else {
                report("Work tool exited. Any player activity it started remains active.");
                return;
            }
        }

        if (!ownedPid) {
            const decision = planAdmission(snapshot, target, upgradeAttempted);
            if (decision.reason !== lastReason) report(decision.reason);
            lastReason = decision.reason;
            if (decision.job) {
                const job = decision.job;
                const args = job === FULL
                    ? ["--execute", "--minutes", minutes, "--deadline", deadline, "--wait-idle", "--reserve", reserve, "--budget", 0]
                    : job === UPGRADE
                        ? [cap, reserve, target, deadline, reset.currentNode, reset.lastNodeReset, reset.lastAugReset]
                        : [];
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
        await ns.sleep(Math.min(TICK_MS, Math.max(0, deadline - Date.now())));
    }
    report("Session time limit reached. Existing player activity continues.");
}
