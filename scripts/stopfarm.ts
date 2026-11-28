import type { NS } from "@ns";

const PAUSE_FILE =
    ".7n8-pause.txt";

const WORK_POLICY = ".7n8-mission-work.txt";

const DAEMON =
    "daemon.ts";

const BOOTSTRAP =
    "bootstrap.ts";

export async function main(
    ns: NS
): Promise<void> {
    ns.disableLog("ALL");

    const flags =
        ns.flags([
            ["resume", false],
            ["os", false],
        ]);

    if (flags.resume) {
        await resumeOS(ns);
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

    // Stop supervisors before taking process snapshots.
    // Otherwise a supervisor could recreate a service.
    if (flags.os) {
        for (const filename of [BOOTSTRAP, DAEMON]) {
            for (const proc of ns.ps("home")) {
                if (proc.filename !== filename) continue;

                if (ns.kill(proc.pid)) {
                    killed++;

                    ns.tprint(
                        `KILL ${proc.pid} ${filename} @ home`
                    );
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
                killed++;

                ns.tprint(
                    `KILL ${proc.pid} ` +
                    `${proc.filename} @ ${host}`
                );
            }
        }
    }

    ns.tprint("");

    ns.tprint(
        flags.os
            ? `7n8 OS STOPPED | killed=${killed}`
            : `7n8 OS PAUSED | farm processes killed=${killed}`
    );

    ns.tprint("Player activity continues. Mission Trader positions are held.");
    ns.tprint("Only an unexpired player-work policy can be resumed.");

    ns.tprint(
        "Resume with: run stopfarm.ts --resume"
    );
}


async function resumeOS(
    ns: NS
): Promise<void> {
    const wasPaused = ns.fileExists(PAUSE_FILE, "home");
    if (wasPaused) ns.rm(PAUSE_FILE, "home");

    const daemonRunning =
        ns.ps("home")
            .some(
                process =>
                    process.filename ===
                    DAEMON
            );

    if (daemonRunning) {
        ns.tprint(
            "7n8 OS RESUMED | daemon already online"
        );
        if (wasPaused) resumeMission(ns);
        return;
    }

    if (
        !ns.fileExists(
            BOOTSTRAP,
            "home"
        )
    ) {
        ns.tprint(
            `RESUME ERROR: missing ${BOOTSTRAP}`
        );

        return;
    }

    const pid =
        ns.exec(
            BOOTSTRAP,
            "home",
            1
        );

    if (!pid) {
        ns.tprint(
            "RESUME ERROR: failed to start bootstrap"
        );

        return;
    }

    ns.tprint(
        `7n8 OS RESUMING | bootstrap PID ${pid}`
    );

    await ns.sleep(100);
    if (wasPaused) resumeMission(ns);
}

function resumeMission(ns: NS): void {
    if (!ns.fileExists(WORK_POLICY, "home")) return;
    const ram = ns.getScriptRam("mission.ts", "home");
    const emergency = ns.getScriptRam("stopfarm.ts", "home");
    const free = ns.getServerMaxRam("home") - ns.getServerUsedRam("home");
    if (!(ram > 0) || !(emergency > 0) || free - ram < emergency) {
        ns.tprint("[MISSION] Resume deferred. Try Mission coordination once RAM is available.");
        return;
    }
    if (!ns.exec("mission.ts", "home", 1, "--resume")) {
        ns.tprint("[MISSION] Resume launch rejected.");
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
