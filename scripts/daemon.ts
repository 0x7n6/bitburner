import type { NS } from "@ns";

const ENGINE =
    "jit5.ts";

const PROGRESSION =
    "progression.ts";

const WORKERS = [
    "j5h.ts",
    "j5g.ts",
    "j5w.ts",
];

type Opener =
    readonly [
        file: string,
        run: (
            host: string
        ) => boolean,
    ];

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

    ns.tprint(
        "7n8 DAEMON ONLINE"
    );

    let lastSignature =
        "";

    while (true) {
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
            hosts
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

            ns.print(
                `[ENV] ${signature}`
            );
        }

        if (
            rootedNow > 0
        ) {
            ns.tprint(
                `[ROOT] +${rootedNow} new server(s)`
            );
        }

        ensureEngine(ns);

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


function ensureEngine(
    ns: NS
): void {
    if (
        !ns.fileExists(
            ENGINE,
            "home"
        )
    ) {
        return;
    }

    const running =
        ns.ps("home")
            .some(
                p =>
                    p.filename ===
                    ENGINE
            );

    if (running) {
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
        return;
    }

    const pid =
        ns.exec(
            ENGINE,
            "home",
            1
        );

    if (pid) {
        ns.tprint(
            `[ENGINE] JIT5 started | PID ${pid}`
        );
    }
}


function ensureSingleton(
    ns: NS,
    script: string
): void {
    const running =
        ns.ps("home")
            .some(
                p =>
                    p.filename ===
                    script
            );

    if (running) {
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
            // Special/inaccessible server.
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
    hosts: string[]
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

        try {
            ns.scp(
                WORKERS,
                host,
                "home"
            );
        } catch {
            // Best effort.
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
        `ram=${Math.round(totalRam)}GB`,
        `formulas=${
            ns.fileExists(
                "Formulas.exe",
                "home"
            )
                ? 1
                : 0
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