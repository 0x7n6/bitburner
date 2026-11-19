import type { NS } from "@ns";

const WORKER =
    "share-worker.ts";

const PAUSE_FILE =
    ".7n8-pause.txt";

const HOME_CONSUMERS =
    new Set([
        "j5h.ts",
        "j5g.ts",
        "j5w.ts",

        "harvest.ts",

        "h.ts",
        "g.ts",
        "w.ts",
    ]);


export async function main(
    ns: NS
): Promise<void> {
    const flags =
        ns.flags([
            ["reserve", 512],
            ["max-pct", 0.75],
            ["cycle", 5000],
        ]);

    ns.disableLog("ALL");

    const reserve =
        Math.max(
            128,
            Number(
                flags.reserve
            ) || 512
        );

    const maxPct =
        Math.max(
            0,
            Math.min(
                0.90,
                Number(
                    flags["max-pct"]
                ) || 0.75
            )
        );

    const cycle =
        Math.max(
            2000,
            Number(
                flags.cycle
            ) || 5000
        );

    if (
        !ns.fileExists(
            WORKER,
            "home"
        )
    ) {
        ns.tprint(
            `[SHARE] missing ${WORKER}`
        );

        return;
    }

    let lastThreads =
        -1;

    while (true) {
        const worker =
            ns.ps("home")
                .find(
                    proc =>
                        proc.filename ===
                        WORKER
                );

        if (
            ns.fileExists(
                PAUSE_FILE,
                "home"
            )
        ) {
            if (worker) {
                ns.kill(
                    worker.pid
                );
            }

            lastThreads = 0;

            await ns.sleep(
                cycle
            );

            continue;
        }

        /*
         * Production always wins.
         *
         * If JIT5 HOME_GW or a prep job is using home,
         * share evacuates completely.
         */
        /*
         * Find a process that genuinely needs HOME RAM.
         *
         * Important:
         * harvest.ts --no-home is only a coordinator running
         * on home. Its actual H/G/W workers are deliberately
         * allocated away from home, so it must NOT evict share.
         */
        const productionBlocker =
            ns.ps("home")
                .find(
                    proc => {
                        if (
                            !HOME_CONSUMERS.has(
                                proc.filename
                            )
                        ) {
                            return false;
                        }

                        if (
                            proc.filename !==
                            "harvest.ts"
                        ) {
                            return true;
                        }

                        const noHome =
                            proc.args
                                .map(
                                    arg =>
                                        String(arg)
                                )
                                .includes(
                                    "--no-home"
                                );

                        return !noHome;
                    }
                );

        const productionNeedsHome =
            productionBlocker !==
            undefined;

        if (
            productionNeedsHome
        ) {
            if (worker) {
                ns.kill(
                    worker.pid
                );

                ns.tprint(
                    `[SHARE] YIELD | ` +
                    `${productionBlocker?.filename ?? "production"} ` +
                    `needs home`
                );
            }

            lastThreads = 0;

            await ns.sleep(
                cycle
            );

            continue;
        }

        const workerRam =
            ns.getScriptRam(
                WORKER,
                "home"
            );

        if (
            workerRam <= 0
        ) {
            await ns.sleep(
                cycle
            );

            continue;
        }

        const maxRam =
            ns.getServerMaxRam(
                "home"
            );

        const usedRam =
            ns.getServerUsedRam(
                "home"
            );

        const currentWorkerRam =
            worker
                ? worker.threads *
                    workerRam
                : 0;

        const nonShareUsed =
            Math.max(
                0,
                usedRam -
                    currentWorkerRam
            );

        /*
         * Two independent limits:
         *
         * 1. never exceed maxPct of home
         * 2. always preserve reserve GB + existing OS usage
         */
        const pctBudget =
            maxRam *
            maxPct;

        const safeBudget =
            Math.max(
                0,
                maxRam -
                    reserve -
                    nonShareUsed
            );

        const shareBudget =
            Math.min(
                pctBudget,
                safeBudget
            );

        const desired =
            Math.max(
                0,
                Math.floor(
                    shareBudget /
                    workerRam
                )
            );

        const current =
            worker?.threads ?? 0;

        /*
         * Avoid pointless worker churn.
         */
        const delta =
            Math.abs(
                desired -
                    current
            );

        const tolerance =
            Math.max(
                32,
                Math.floor(
                    Math.max(
                        desired,
                        current
                    ) *
                    0.05
                )
            );

        if (
            desired !== current &&
            delta >
                tolerance
        ) {
            if (worker) {
                ns.kill(
                    worker.pid
                );

                await ns.sleep(
                    50
                );
            }

            if (
                desired >
                0
            ) {
                const pid =
                    ns.exec(
                        WORKER,
                        "home",
                        desired
                    );

                if (pid) {
                    ns.tprint(
                        `[SHARE] threads=${desired} | ` +
                        `RAM=${fmtRam(
                            desired *
                            workerRam
                        )} | ` +
                        `reserve=${fmtRam(
                            reserve
                        )}`
                    );
                }
            }
        }

        if (
            desired !==
            lastThreads
        ) {
            lastThreads =
                desired;

            ns.print(
                `[SHARE] desired=${desired} | ` +
                `power=${ns.getSharePower().toFixed(3)}x`
            );
        }

        await ns.sleep(
            cycle
        );
    }
}


function fmtRam(
    gb: number
): string {
    if (
        gb >=
        1024
    ) {
        return (
            gb /
            1024
        ).toFixed(
            2
        ) + "TB";
    }

    return gb.toFixed(
        1
    ) + "GB";
}
