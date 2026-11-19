import type { NS } from "@ns";

const NEVER_AUTO_BACKDOOR =
    new Set([
        "home",

        /*
         * Never automatically complete a BitNode.
         */
        "w0r1d_d43m0n",
    ]);

const PRIORITY = [
    "CSEC",
    "avmnite-02h",
    "I.I.I.I",
    "run4theh111z",
];


export async function main(
    ns: NS
): Promise<void> {
    ns.disableLog("ALL");

    ns.tprint(
        "[PROGRESSION] online | autobackdoor enabled"
    );

    while (true) {
        const reset =
            ns.getResetInfo();

        const singularity =
            reset.currentNode ===
                4 ||
            (
                reset.ownedSF.get(
                    4
                ) ??
                0
            ) >
                0;

        if (!singularity) {
            /*
             * Normally daemon won't even start us
             * without Singularity access.
             */
            await ns.sleep(
                30000
            );

            continue;
        }

        const target =
            chooseBackdoorTarget(
                ns
            );

        if (!target) {
            await ns.sleep(
                30000
            );

            continue;
        }

        await installBackdoorSafely(
            ns,
            target
        );

        await ns.sleep(
            2000
        );
    }
}


function chooseBackdoorTarget(
    ns: NS
): string | null {
    const hack =
        ns.getHackingLevel();

    const candidates =
        scanAll(ns)
            .filter(
                host => {
                    if (
                        NEVER_AUTO_BACKDOOR.has(
                            host
                        )
                    ) {
                        return false;
                    }

                    const server =
                        ns.getServer(
                            host
                        );

                    if (
                        server.purchasedByPlayer ||
                        server.backdoorInstalled
                    ) {
                        return false;
                    }

                    if (
                        !ns.hasRootAccess(
                            host
                        )
                    ) {
                        return false;
                    }

                    return (
                        ns.getServerRequiredHackingLevel(
                            host
                        ) <=
                        hack
                    );
                }
            );

    candidates.sort(
        (a, b) => {
            const ai =
                PRIORITY.indexOf(
                    a
                );

            const bi =
                PRIORITY.indexOf(
                    b
                );

            const ar =
                ai === -1
                    ? 999
                    : ai;

            const br =
                bi === -1
                    ? 999
                    : bi;

            if (
                ar !== br
            ) {
                return ar - br;
            }

            return (
                ns.getServerRequiredHackingLevel(
                    a
                ) -
                ns.getServerRequiredHackingLevel(
                    b
                )
            );
        }
    );

    return (
        candidates[0] ??
        null
    );
}


async function installBackdoorSafely(
    ns: NS,
    target: string
): Promise<void> {
    const original =
        ns.singularity.getCurrentServer();

    const targetPath =
        findPath(
            ns,
            target
        );

    if (!targetPath) {
        return;
    }

    const originalPath =
        findPath(
            ns,
            original
        );

    /*
     * First return to home from wherever the player currently is.
     */
    const currentPath =
        findPath(
            ns,
            original
        );

    if (currentPath) {
        const backHome =
            [
                ...currentPath,
            ].reverse();

        for (
            const host
            of backHome.slice(
                1
            )
        ) {
            ns.singularity.connect(
                host
            );
        }
    }

    /*
     * Traverse home -> target.
     */
    for (
        const host
        of targetPath.slice(
            1
        )
    ) {
        if (
            !ns.singularity.connect(
                host
            )
        ) {
            ns.tprint(
                `[BACKDOOR] connect failed: ${host}`
            );

            return;
        }
    }

    ns.tprint(
        `[BACKDOOR] installing ${target}...`
    );

    try {
        await ns.singularity.installBackdoor();

        ns.tprint(
            `[BACKDOOR] DONE ${target}`
        );
    } catch (error) {
        ns.tprint(
            `[BACKDOOR] FAILED ${target} | ${String(error)}`
        );
    }

    /*
     * Return target -> home.
     */
    const backHome =
        [
            ...targetPath,
        ].reverse();

    for (
        const host
        of backHome.slice(
            1
        )
    ) {
        ns.singularity.connect(
            host
        );
    }

    /*
     * Restore the player's previous terminal location.
     */
    if (
        original !==
            "home" &&
        originalPath
    ) {
        for (
            const host
            of originalPath.slice(
                1
            )
        ) {
            ns.singularity.connect(
                host
            );
        }
    }
}


function findPath(
    ns: NS,
    target: string
): string[] | null {
    const seen =
        new Set<string>([
            "home",
        ]);

    const queue:
        string[][] = [
            [
                "home",
            ],
        ];

    while (
        queue.length >
        0
    ) {
        const path =
            queue.shift();

        if (!path) {
            break;
        }

        const current =
            path[
                path.length -
                1
            ];

        if (
            current ===
            target
        ) {
            return path;
        }

        for (
            const next
            of ns.scan(
                current
            )
        ) {
            if (
                seen.has(
                    next
                )
            ) {
                continue;
            }

            seen.add(
                next
            );

            queue.push([
                ...path,
                next,
            ]);
        }
    }

    return null;
}


function scanAll(
    ns: NS
): string[] {
    const seen =
        new Set<string>([
            "home",
        ]);

    const queue =
        [
            "home",
        ];

    while (
        queue.length >
        0
    ) {
        const host =
            queue.shift();

        if (!host) {
            break;
        }

        for (
            const next
            of ns.scan(
                host
            )
        ) {
            if (
                seen.has(
                    next
                )
            ) {
                continue;
            }

            seen.add(
                next
            );

            queue.push(
                next
            );
        }
    }

    return [
        ...seen,
    ];
}
