import type { NS } from "@ns";

const PILOT = "bt4-auto.ts";
const STUDY = "mission-study.ts";
const PAUSE = ".7n8-pause.txt";
const WORK_POLICY = ".7n8-mission-work.txt";
const TRADER = "trader.ts";
const MISSION_TRADER_HOLD = ".7n8-mission-trader-hold.txt";
const SHARE_RESERVE_GB = 512;
const WORK_OWNERS = new Set([PILOT, STUDY, "bt4-action.ts", "progression.ts", "findV2.ts"]);
const CAPITAL_OWNERS = new Set(["trader.ts", "traderctl.ts", "fleet.ts"]);

export async function main(ns: NS): Promise<void> {
    ns.disableLog("ALL");
    const flags = ns.flags([
        ["start", false], ["resume", false], ["remember-work", false],
        ["minutes", 15], ["budget", 0], ["reserve", 0], ["share", false], ["trader", false],
    ]);
    const resume = flags.resume === true;
    const start = flags.start === true || resume;
    let minutes = Number(flags.minutes);
    const budget = Number(flags.budget);
    const reserve = Number(flags.reserve);
    const trader = flags.trader === true;
    const rememberWork = flags["remember-work"] === true;
    const report = (line: string) => ns.tprint(`[MISSION] ${line}`);

    if (!Number.isInteger(minutes) || minutes < 1 || minutes > 120 ||
        !Number.isFinite(budget) || budget < 0 || !Number.isFinite(reserve) || reserve < 0 ||
        (Array.isArray(flags._) && flags._.length > 0)) {
        report("Use --minutes 1-120, --budget >=0, and --reserve >=0. Use --start to launch.");
        return;
    }

    if ((trader && (!(reserve > 0) || budget > 0)) || (rememberWork && budget > 0) ||
        (resume && (trader || flags.share || budget > 0 || rememberWork))) {
        report("Trader needs a positive cash floor and a zero augmentation budget. Only work-only policy can be remembered or resumed.");
        return;
    }

    const reset = ns.getResetInfo();
    if (resume) {
        if (!ns.fileExists(WORK_POLICY, "home")) return;
        const [node, nodeReset, augReset, deadline] = ns.read(WORK_POLICY).trim().split(",").map(Number);
        if (node !== reset.currentNode || nodeReset !== reset.lastNodeReset ||
            augReset !== reset.lastAugReset || !Number.isFinite(deadline)) {
            report("Saved work policy belongs to a different reset. Start a new session.");
            return;
        }
        minutes = Math.floor((deadline - Date.now()) / 60_000);
        if (minutes < 1 || minutes > 120) {
            report("Saved work policy has expired. Start another session from AP.");
            return;
        }
    }
    const sf4 = reset.ownedSF.get(4) ?? 0;
    const game = ns.ui.getGameInfo();
    const home = ns.getServer("home");
    const emergency = ns.getScriptRam("stopfarm.ts", "home");
    const free = Math.max(0, home.maxRam - home.ramUsed);
    const running = ns.ps("home");
    const engines = running.filter(p => ["early.ts", "jit5.ts", "jit6.ts", "harvest.ts"].includes(p.filename));
    const owner = running.find(p => WORK_OWNERS.has(p.filename));
    const spender = running.find(p => CAPITAL_OWNERS.has(p.filename));
    const paused = ns.fileExists(PAUSE, "home");
    const fullRam = ns.getScriptRam(PILOT, "home");
    const studyRam = ns.getScriptRam(STUDY, "home");

    report(`BN${reset.currentNode} | SF4.${sf4} | home free ${free.toFixed(2)} GB | emergency ${emergency.toFixed(2)} GB`);
    report(`Engine: ${engines.map(p => `${p.filename} (PID ${p.pid})`).join(", ") || "none on home"} | ${paused ? "paused" : "unpaused"}`);
    report(`Player-work process: ${owner?.filename ?? "none"} | Capital process: ${spender?.filename ?? "none"}`);
    report(`Tools: ${PILOT} ${fullRam > 0 ? `${fullRam.toFixed(2)} GB` : "unavailable"}; ${STUDY} ${studyRam > 0 ? `${studyRam.toFixed(2)} GB` : "unavailable"}`);
    report("Faction invitations remain in the game UI.");
    const stockAccess = ns.stock.hasTixApiAccess() && ns.stock.has4SDataTixApi();
    if (!stockAccess) report("Trader unavailable: use the game UI to obtain TIX and 4S TIX access.");
    else report("Trader prerequisites met. An explicit Trader cash floor enables launch.");


    if (reset.currentNode !== 4 && sf4 === 0) {
        report("Singularity is locked. Choose player work through the game UI until this node or Source-File 4 grants access.");
        return;
    }
    if (game.version !== "3.0.1" || !game.commit.startsWith("3162fd2")) {
        report("Player-work automation is verified for Bitburner 3.0.1 (3162fd2).");
        return;
    }
    if (paused || owner || !(emergency > 0)) {
        report(paused ? "Resume the OS before starting a mission." :
            owner ? `Wait until ${owner.filename} exits before starting another work policy.` :
                "Sync stopfarm.ts before launching mission work.");
        return;
    }
    if (start && (ns.getHostname() !== "home" || running.some(p => p.filename === "mission.ts" && p.pid !== ns.pid))) {
        report("Start one mission coordinator at a time, on home.");
        return;
    }

    const fullFits = ns.fileExists("bt4-plan.ts", "home") && fullRam > 0 && free - fullRam >= emergency;
    const studyFits = studyRam > 0 && free - studyRam >= emergency;
    const selected = fullFits ? PILOT : studyFits && budget === 0 ? STUDY : null;
    if (!selected) {
        report(budget > 0 ? "The purchase policy needs the full pilot. Lower the budget to zero for study-only mode, or free home RAM." :
            "Neither work tool fits with the emergency reserve. Sync the missing tool, free RAM, or choose work manually.");
        return;
    }

    if (spender && budget > 0) {
        report(`Finish or hold ${spender.filename} before starting a session with a purchase budget.`);
        return;
    }

    report(`Mode: ${selected === PILOT ? "full faction/study pilot" : "lightweight free study"}${start ? "" : " (preview)"}`);
    const share = flags.share === true;
    const shareRam = share ? ns.getScriptRam("share.ts", "home") : 0;
    const shareWorkerRam = share ? ns.getScriptRam("share-worker.ts", "home") : 0;
    const existingShare = running.some(p => p.filename === "share.ts" || p.filename === "share-worker.ts");
    const workRam = selected === PILOT ? fullRam : studyRam;
    // Existing share manager waits for a change of more than 32 threads.
    const shareFits = !existingShare && shareRam > 0 && shareWorkerRam > 0 &&
        free - workRam - shareRam >= Math.max(emergency, SHARE_RESERVE_GB) + 33 * shareWorkerRam;
    if (share) {
        report(existingShare ? "Share is already active." : shareFits ? "Optional Share fits the configured reserve." :
            "Share deferred: this would leave too little RAM for its minimum useful allocation and reserve.");
    }
    const traderRam = trader ? ns.getScriptRam(TRADER, "home") : 0;
    const traderReady = trader && stockAccess && !spender && traderRam > 0 &&
        !ns.fileExists(".7n8-trader-disabled.txt", "home") && !ns.fileExists(".7n8-trader-drain.txt", "home");
    if (trader && !traderReady) report("Trader deferred: unavailable, already controlled, disabled, or draining.");
    if (!start) return;

    const args = selected === PILOT
        ? ["--execute", "--minutes", minutes, "--reserve", reserve, "--budget", budget]
        : [];
    const pid = ns.exec(selected, "home", 1, ...args);
    if (!pid) {
        report(`Launch rejected for ${selected}. Recheck available RAM and dependencies.`);
        return;
    }
    report(`Started ${selected} (PID ${pid}).`);

    if (traderReady) {
        const currentHome = ns.getServer("home");
        if (currentHome.maxRam - currentHome.ramUsed - traderRam >= emergency) {
            const alreadyHeld = ns.fileExists(MISSION_TRADER_HOLD, "home");
            await ns.write(MISSION_TRADER_HOLD, "Explicit Trader authorization required.", "w");
            const latestHome = ns.getServer("home");
            const pausedNow = ns.fileExists(PAUSE, "home");
            const canStart = !pausedNow && !ns.fileExists(".7n8-trader-disabled.txt", "home") &&
                !ns.fileExists(".7n8-trader-drain.txt", "home") &&
                !ns.ps("home").some(p => CAPITAL_OWNERS.has(p.filename)) &&
                latestHome.maxRam - latestHome.ramUsed - traderRam >= emergency;
            const traderPid = canStart
                ? ns.exec(TRADER, "home", 1, "--reserve-abs", reserve, "--disable-shorts", "--mission-owned")
                : 0;
            if (!traderPid && !alreadyHeld && !pausedNow) ns.rm(MISSION_TRADER_HOLD, "home");
            report(traderPid ? `Trader started (PID ${traderPid}); stp halts it and holds positions.` :
                "Trader launch deferred or rejected.");
        } else report("Trader deferred to preserve emergency RAM.");
    }

    if (ns.fileExists(PAUSE, "home")) return;

    if (share && shareFits && (!traderReady || free - workRam - shareRam - traderRam >=
        Math.max(emergency, SHARE_RESERVE_GB) + 33 * shareWorkerRam)) {
        const sharePid = ns.exec("share.ts", "home", 1, "--reserve", Math.max(emergency, SHARE_RESERVE_GB));
        report(sharePid ? `Share service started (PID ${sharePid}); stp stops it.` : "Share launch rejected.");
    } else if (share && shareFits) {
        report("Share deferred to preserve the reserve after Trader admission.");
    }
    if (rememberWork) {
        await ns.write(WORK_POLICY, [
            reset.currentNode, reset.lastNodeReset, reset.lastAugReset, Date.now() + minutes * 60_000,
        ].join(","), "w");
    } else if (!resume && ns.fileExists(WORK_POLICY, "home")) {
        ns.rm(WORK_POLICY, "home");
    }
}
