import type { NS } from "@ns";

const ENGINE =
    "jit5.ts";

const PROGRESSION =
    "progression.ts";

const SHARE_MANAGER =
    "share.ts";

const PAUSE_FILE =
    ".7n8-pause.txt";

const WORKERS = [
    "j5h.ts",
    "j5g.ts",
    "j5w.ts",
];

const HEALTHY_ENGINE_MS =
    30_000;

const MAX_RESTART_BACKOFF_MS =
    60_000;

type Opener =
    readonly [
        file: string,
        run: (
            host: string
        ) => boolean,
    ];

interface EngineSupervisor {
    pid: number;
    startedAt: number;

    restartAfter: number;
    backoffMs: number;

    crashes: number;
}

export async function main(
    ns: NS
): Promise<void> {
    const flags =
        ns.flags([
            ["cycle", 2000],
            ["tail", false],
        ]);

    ns.disableLog("ALL");

    if (flags.tail) {
        ns.ui.openTail();
    }

    const cycle =
        Math.max(
            500,
            Number(
                flags.cycle
            ) || 2000
        );

    const supervisor:
        EngineSupervisor = {
        pid: 0,
        startedAt: 0,

        restartAfter: 0,
        backoffMs: 2000,

        crashes: 0,
    };

    let lastSignature =
        "";

    let pauseAnnounced =
        false;

    const deployed =
        new Set<string>();

    ns.tprint("");
    ns.tprint(
        "7n8 DAEMON ONLINE"
    );

    while (true) {
        const now =
            Date.now();

        const reset =
            ns.getResetInfo();

        const singularity =
            reset.currentNode === 4 ||
            (
                reset.ownedSF.get(4) ??
                0
            ) > 0;

        const hosts =
            scanAll(ns);

        const rootedNow =
            rootEligible(
                ns,
                hosts
            );

        deployWorkers(
            ns,
            hosts,
            deployed
        );

        const signature =
            environmentSignature(
                ns,
                hosts
            );

        if (
            signature !==
            lastSignature
        ) {
            lastSignature =
                signature;

            ns.tprint(
                `[ENV] ${signature}`
            );
        }

        if (
            rootedNow > 0
        ) {
            ns.tprint(
                `[ROOT] +${rootedNow} server(s)`
            );
        }

        const paused =
            ns.fileExists(
                PAUSE_FILE,
                "home"
            );

        if (paused) {
            if (!pauseAnnounced) {
                pauseAnnounced =
                    true;

                ns.tprint(
                    "[OS] PAUSED | engine supervision suspended"
                );
            }

            enforcePause(
                ns,
                supervisor
            );

            await ns.sleep(
                cycle
            );

            continue;
        }

        if (pauseAnnounced) {
            pauseAnnounced =
                false;

            ns.tprint(
                "[OS] RESUMED"
            );
        }

        superviseEngine(
            ns,
            supervisor,
            now
        );

        /*
         * Share is a home-only opportunistic service.
         * share.ts itself yields whenever production/prep
         * needs home RAM.
         */
        if (
            ns.fileExists(
                SHARE_MANAGER,
                "home"
            )
        ) {
            ensureSingleton(
                ns,
                SHARE_MANAGER
            );
        }

        if (
            singularity &&
            ns.fileExists(
                PROGRESSION,
                "home"
            )
        ) {
            ensureSingleton(
                ns,
                PROGRESSION
            );
        }

        await ns.sleep(
            cycle
        );
    }
}


function enforcePause(
    ns: NS,
    state: EngineSupervisor
): void {
    /*
     * Pause means intentional operator control.
     *
     * If an engine somehow appears while paused,
     * kill it rather than treating it as healthy.
     */
    for (
        const process
        of ns.ps("home")
    ) {
        if (
            process.filename !==
            ENGINE
        ) {
            continue;
        }

        ns.kill(
            process.pid
        );
    }

    state.pid = 0;
    state.startedAt = 0;

    state.restartAfter =
        Date.now() +
        2000;
}


function superviseEngine(
    ns: NS,
    state: EngineSupervisor,
    now: number
): void {
    /*
     * We believe an engine is alive.
     */
    if (
        state.pid > 0
    ) {
        if (
            ns.isRunning(
                state.pid
            )
        ) {
            /*
             * Survived long enough.
             * Consider this a healthy launch
             * and clear crash history.
             */
            if (
                state.startedAt > 0 &&
                now -
                    state.startedAt >=
                    HEALTHY_ENGINE_MS
            ) {
                state.crashes = 0;
                state.backoffMs = 2000;

                /*
                 * Avoid repeatedly resetting this
                 * every daemon cycle.
                 */
                state.startedAt = 0;
            }

            return;
        }

        /*
         * Engine disappeared.
         */
        const lifetime =
            state.startedAt > 0
                ? now -
                    state.startedAt
                : HEALTHY_ENGINE_MS;

        state.pid = 0;

        if (
            lifetime <
            HEALTHY_ENGINE_MS
        ) {
            state.crashes++;

            state.restartAfter =
                now +
                state.backoffMs;

            ns.tprint(
                `[ENGINE] early exit | ` +
                `lifetime=${fmtTime(lifetime)} | ` +
                `crashes=${state.crashes} | ` +
                `retry=${fmtTime(state.backoffMs)}`
            );

            state.backoffMs =
                Math.min(
                    MAX_RESTART_BACKOFF_MS,
                    state.backoffMs *
                        2
                );

            return;
        }

        state.restartAfter =
            now +
            2000;
    }

    /*
     * Somebody may have started JIT5 manually.
     * Adopt it rather than starting a duplicate.
     */
    const existing =
        ns.ps("home")
            .find(
                p =>
                    p.filename ===
                    ENGINE
            );

    if (existing) {
        state.pid =
            existing.pid;

        state.startedAt =
            now;

        ns.tprint(
            `[ENGINE] adopted JIT5 | PID ${existing.pid}`
        );

        return;
    }

    if (
        now <
        state.restartAfter
    ) {
        return;
    }

    if (
        !ns.fileExists(
            ENGINE,
            "home"
        )
    ) {
        state.restartAfter =
            now +
            10_000;

        return;
    }

    const ram =
        ns.getScriptRam(
            ENGINE,
            "home"
        );

    const free =
        ns.getServerMaxRam(
            "home"
        ) -
        ns.getServerUsedRam(
            "home"
        );

    if (
        free <
        ram
    ) {
        state.restartAfter =
            now +
            5000;

        return;
    }

    const pid =
        ns.exec(
            ENGINE,
            "home",
            1
        );

    if (!pid) {
        state.restartAfter =
            now +
            state.backoffMs;

        state.backoffMs =
            Math.min(
                MAX_RESTART_BACKOFF_MS,
                state.backoffMs *
                    2
            );

        return;
    }

    state.pid =
        pid;

    state.startedAt =
        now;

    ns.tprint(
        `[ENGINE] JIT5 started | PID ${pid}`
    );
}


function ensureSingleton(
    ns: NS,
    script: string
): void {
    if (
        ns.ps("home")
            .some(
                p =>
                    p.filename ===
                    script
            )
    ) {
        return;
    }

    if (
        !ns.fileExists(
            script,
            "home"
        )
    ) {
        return;
    }

    const ram =
        ns.getScriptRam(
            script,
            "home"
        );

    const free =
        ns.getServerMaxRam(
            "home"
        ) -
        ns.getServerUsedRam(
            "home"
        );

    if (
        free <
        ram
    ) {
        return;
    }

    const pid =
        ns.exec(
            script,
            "home",
            1
        );

    if (pid) {
        ns.tprint(
            `[DAEMON] started ${script} | PID ${pid}`
        );
    }
}


function rootEligible(
    ns: NS,
    hosts: string[]
): number {
    const openers =
        getOpeners(ns);

    let rooted =
        0;

    for (
        const host
        of hosts
    ) {
        if (
            host === "home" ||
            ns.hasRootAccess(
                host
            )
        ) {
            continue;
        }

        if (
            ns.getServerNumPortsRequired(
                host
            ) >
            openers.length
        ) {
            continue;
        }

        try {
            for (
                const [
                    ,
                    opener,
                ]
                of openers
            ) {
                opener(host);
            }

            if (
                ns.nuke(host)
            ) {
                rooted++;
            }
        } catch {
            /*
             * Ignore special/inaccessible
             * servers.
             */
        }
    }

    return rooted;
}


function getOpeners(
    ns: NS
): Opener[] {
    const definitions:
        Opener[] = [
        [
            "BruteSSH.exe",
            host =>
                ns.brutessh(host),
        ],

        [
            "FTPCrack.exe",
            host =>
                ns.ftpcrack(host),
        ],

        [
            "relaySMTP.exe",
            host =>
                ns.relaysmtp(host),
        ],

        [
            "HTTPWorm.exe",
            host =>
                ns.httpworm(host),
        ],

        [
            "SQLInject.exe",
            host =>
                ns.sqlinject(host),
        ],
    ];

    return definitions.filter(
        ([file]) =>
            ns.fileExists(
                file,
                "home"
            )
    );
}


function deployWorkers(
    ns: NS,
    hosts: string[],
    deployed: Set<string>
): void {
    for (
        const host
        of hosts
    ) {
        if (
            host === "home" ||
            !ns.hasRootAccess(
                host
            ) ||
            ns.getServerMaxRam(
                host
            ) <= 0
        ) {
            continue;
        }

        /*
         * Already verified this host
         * during this daemon lifetime.
         */
        if (
            deployed.has(
                host
            )
        ) {
            continue;
        }

        const complete =
            WORKERS.every(
                file =>
                    ns.fileExists(
                        file,
                        host
                    )
            );

        if (complete) {
            deployed.add(
                host
            );

            continue;
        }

        try {
            const ok =
                ns.scp(
                    WORKERS,
                    host,
                    "home"
                );

            if (ok) {
                deployed.add(
                    host
                );

                ns.print(
                    `[DEPLOY] ${host}`
                );
            }
        } catch {
            /*
             * Retry next daemon cycle.
             */
        }
    }
}


function environmentSignature(
    ns: NS,
    hosts: string[]
): string {
    let rooted =
        0;

    let totalRam =
        0;

    for (
        const host
        of hosts
    ) {
        if (
            !ns.hasRootAccess(
                host
            )
        ) {
            continue;
        }

        rooted++;

        totalRam +=
            ns.getServerMaxRam(
                host
            );
    }

    return [
        `hack=${ns.getHackingLevel()}`,
        `openers=${getOpeners(ns).length}`,
        `root=${rooted}/${hosts.length}`,
        `ram=${fmtRam(totalRam)}`,
        `formulas=${
            ns.fileExists(
                "Formulas.exe",
                "home"
            )
                ? "YES"
                : "NO"
        }`,
    ].join(" | ");
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
            host ===
            undefined
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


function fmtTime(
    ms: number
): string {
    if (
        ms >= 60_000
    ) {
        return (
            (
                ms /
                60_000
            ).toFixed(1) +
            "m"
        );
    }

    if (
        ms >= 1000
    ) {
        return (
            (
                ms /
                1000
            ).toFixed(1) +
            "s"
        );
    }

    return (
        Math.round(ms) +
        "ms"
    );
}


function fmtRam(
    gb: number
): string {
    if (
        gb >=
        1024 *
            1024
    ) {
        return (
            gb /
            (
                1024 *
                1024
            )
        ).toFixed(2) +
        "PB";
    }

    if (
        gb >=
        1024
    ) {
        return (
            gb /
            1024
        ).toFixed(2) +
        "TB";
    }

    return (
        gb.toFixed(0) +
        "GB"
    );
}