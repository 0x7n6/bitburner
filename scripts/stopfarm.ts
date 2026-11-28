import type { NS } from "@ns";

const PAUSE_FILE =
    ".7n8-pause.txt";

const WORK_POLICY = ".7n8-mission-work.txt";

const DAEMON =
    "daemon.ts";

const BOOTSTRAP =
    "bootstrap.ts";

const JIT6 = "jit6.ts";

export async function main(
    ns: NS
): Promise<void> {
    ns.disableLog("ALL");

    const flags =
        ns.flags([
            ["resume", false],
            ["os", false],
            ["support-only", false],
            ["verbose", false],
        ]);

    if (ns.getHostname() !== "home") {
        ns.tprint("[JIT6] Run stopfarm.ts on home so the pause state reaches all managed services.");
        return;
    }
    if (flags.resume && flags.os) {
        ns.tprint("[JIT6] Choose either --resume or --os.");
        return;
    }

    if (flags["support-only"]) {
        if (flags.resume && !flags.os) await resumeJit6(ns, false);
        else ns.tprint("Use --resume --support-only to resume support work.");
        return;
    }
    if (flags.resume) {
        await resumeJit6(ns, true);
        return;
    }

    /*
     * Write pause state FIRST.
     *
     * This prevents daemon from interpreting
     * our intentional engine shutdown as a crash.
     */
    await ns.write(
        PAUSE_FILE,
        String(
            Date.now()
        ),
        "w"
    );

    if (flags.os && ns.fileExists(WORK_POLICY, "home")) ns.rm(WORK_POLICY, "home");

    const victims =
        new Set([
            "jit6.ts",
            "jit6-home.ts",
            "mission.ts",
            "mission-study.ts",
            "bt4-auto.ts",
            "early.ts",
            "jit5.ts",

            "j5h.ts",
            "j5g.ts",
            "j5w.ts",

            "harvest.ts",

            "share.ts",
            "share-worker.ts",

            "h.ts",
            "g.ts",
            "w.ts",

            /*
             * Legacy/stale process signatures.
             */
            "jit4.js",
            "j4h.js",
            "j4g.js",
            "j4w.js",

            "jit3.js",
            "jit2.js",
            "jit.js",

            "lh.js",
            "lg.js",
            "lw.js",

            "jh.js",
            "jg.js",
            "jw.js",

            "shotgun-auto.js",
            "shotgun.js",
            "farm.js",

            "h.js",
            "g.js",
            "w.js",

            "grow.js",
            "weaken.js",
            "hack-once.js",

            "prep-grow.js",
            "prep-weaken.js",

            "smarthack.js",
        ]);

    if (flags.os) {
        victims.add(
            DAEMON
        );

        victims.add(
            BOOTSTRAP
        );

        victims.add(
            "progression.ts"
        );
    }

    let killed = 0;
    const counts = new Map<string, number>();
    const markStopped = (process: { filename: string; pid: number }, host: string) => {
        killed++;
        counts.set(process.filename, (counts.get(process.filename) ?? 0) + 1);
        if (flags.verbose || host === "home") ns.tprint(`KILL ${process.pid} ${process.filename} @ ${host}`);
    };

    // Stop supervisors before taking process snapshots.
    // Otherwise a supervisor could recreate a service.
    if (flags.os) {
        for (const filename of [BOOTSTRAP, DAEMON]) {
            for (const proc of ns.ps("home")) {
                if (proc.filename !== filename) continue;

                if (ns.kill(proc.pid)) {
                    markStopped(proc, "home");
                }
            }
        }
    }

    const hosts =
        scanAll(ns);

    for (
        const host
        of hosts
    ) {
        for (
            const proc
            of ns.ps(host)
        ) {
            const missionTrader = proc.filename === "trader.ts" && proc.args.includes("--mission-owned");
            if (!missionTrader && !victims.has(proc.filename)) {
                continue;
            }

            if (
                proc.pid ===
                ns.pid
            ) {
                continue;
            }

            if (
                ns.kill(
                    proc.pid
                )
            ) {
                markStopped(proc, host);
            }
        }
    }

    ns.tprint("");

    ns.tprint(
        flags.os
            ? `7n8 OS STOPPED | killed=${killed}`
            : `7n8 OS PAUSED | farm processes killed=${killed}`
    );

    if (counts.size) {
        ns.tprint(`Stopped by script: ${[...counts].map(([file, count]) => `${file}=${count}`).join(", ")}`);
    }
    ns.tprint("Player activity continues. Mission Trader positions are held.");
    ns.tprint("Resume with a new work-only JIT6 session: run stopfarm.ts --resume");
}

async function resumeJit6(ns: NS, launchSession: boolean): Promise<void> {
    const running = ns.ps("home");
    if (running.some(p => p.filename === DAEMON || p.filename === BOOTSTRAP)) {
        ns.tprint("[JIT6] Legacy supervisor is running. Use Shutdown OS once, then resume JIT6.");
        return;
    }
    const current = running.find(p => p.filename === JIT6 && p.args.includes("--execute"));
    if (launchSession && !current) {
        const cost = ns.getScriptRam(JIT6, "home");
        const free = ns.getServerMaxRam("home") - ns.getServerUsedRam("home");
        if (!(cost > 0) || free < cost) {
            ns.tprint(`[JIT6] Resume blocked. Check jit6.ts and home RAM (${free.toFixed(2)} GB free).`);
            return;
        }
    }
    const wasPaused = ns.fileExists(PAUSE_FILE, "home");
    const pauseValue = wasPaused ? ns.read(PAUSE_FILE) : "";
    if (wasPaused && !ns.rm(PAUSE_FILE, "home")) {
        ns.tprint("[JIT6] Could not clear the pause marker.");
        return;
    }
    if (!launchSession || current) {
        ns.tprint(current ? `[JIT6] OS resumed. Work session already running (PID ${current.pid}).` :
            "[JIT6] OS unpaused. Start a session from AP when ready.");
        return;
    }
    const pid = ns.exec(JIT6, "home", { threads: 1, preventDuplicates: true }, "--execute");
    if (pid) {
        ns.tprint(`[JIT6] OS resumed. New work-only session (PID ${pid}).`);
    } else {
        if (wasPaused && !ns.fileExists(PAUSE_FILE, "home")) await ns.write(PAUSE_FILE, pauseValue, "w");
        ns.tprint("[JIT6] Resume launch rejected. Check free home RAM and retry.");
    }
}


function scanAll(
    ns: NS
): string[] {
    const seen =
        new Set<string>([
            "home",
        ]);

    const queue:
        string[] = [
            "home",
        ];

    while (
        queue.length > 0
    ) {
        const host =
            queue.shift();

        if (
            host === undefined
        ) {
            break;
        }

        for (
            const next
            of ns.scan(host)
        ) {
            if (
                seen.has(next)
            ) {
                continue;
            }

            seen.add(next);
            queue.push(next);
        }
    }

    return [
        ...seen,
    ];
}
