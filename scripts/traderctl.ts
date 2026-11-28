import type { NS } from "@ns";

const TRADER =
    "trader.ts";

const DISABLED_FILE =
    ".7n8-trader-disabled.txt";

const DRAIN_FILE =
    ".7n8-trader-drain.txt";


export async function main(
    ns: NS
): Promise<void> {
    const flags =
        ns.flags([
            ["tail", false],
            ["hold", false],
            ["no-start", false],
        ]);

    ns.disableLog("ALL");

    const command =
        String(
            ns.args[0] ??
            "status"
        ).toLowerCase();

    switch (
        command
    ) {
        case "start":
            await startTrader(
                ns,
                Boolean(
                    flags.tail
                )
            );
            return;

        case "stop":
            stopTrader(
                ns,
                Boolean(
                    flags.hold
                )
            );
            return;

        case "drain":
            await drainTrader(
                ns,
                flags["no-start"] !== true
            );
            return;

        case "status":
            showStatus(
                ns
            );
            return;

        default:
            ns.tprint(
                "Usage:"
            );

            ns.tprint(
                "  run traderctl.ts start"
            );

            ns.tprint(
                "  run traderctl.ts stop"
            );

            ns.tprint(
                "  run traderctl.ts stop --hold"
            );

            ns.tprint(
                "  run traderctl.ts drain"
            );

            ns.tprint(
                "  run traderctl.ts status"
            );
    }
}


async function startTrader(
    ns: NS,
    tail: boolean
): Promise<void> {
    if (
        ns.fileExists(
            DISABLED_FILE,
            "home"
        )
    ) {
        ns.rm(
            DISABLED_FILE,
            "home"
        );
    }

    if (
        ns.fileExists(
            DRAIN_FILE,
            "home"
        )
    ) {
        ns.rm(
            DRAIN_FILE,
            "home"
        );
    }

    const existing =
        getTrader(
            ns
        );

    if (existing) {
        ns.tprint(
            `[TRADER] already running | PID ${existing.pid}`
        );

        return;
    }

    if (
        !ns.fileExists(
            TRADER,
            "home"
        )
    ) {
        ns.tprint(
            `[TRADER] missing ${TRADER}`
        );

        return;
    }

    if (
        !ns.stock.hasTixApiAccess()
    ) {
        ns.tprint(
            "[TRADER] cannot start: TIX API unavailable."
        );

        return;
    }

    if (
        !ns.stock.has4SDataTixApi()
    ) {
        ns.tprint(
            "[TRADER] cannot start: 4S TIX API unavailable."
        );

        return;
    }

    const pid =
        ns.exec(
            TRADER,
            "home",
            1,
            ...(tail
                ? [
                    "--tail",
                ]
                : [])
        );

    if (!pid) {
        ns.tprint(
            "[TRADER] failed to start."
        );

        return;
    }

    if (ns.fileExists(".7n8-mission-trader-hold.txt", "home")) {
        ns.rm(".7n8-mission-trader-hold.txt", "home");
    }

    ns.tprint(
        `[TRADER] STARTED | PID ${pid}`
    );

    await ns.sleep(
        50
    );
}


function stopTrader(
    ns: NS,
    hold: boolean
): void {
    ns.write(
        DISABLED_FILE,
        String(
            Date.now()
        ),
        "w"
    );

    if (
        ns.fileExists(
            DRAIN_FILE,
            "home"
        )
    ) {
        ns.rm(
            DRAIN_FILE,
            "home"
        );
    }

    const existing =
        getTrader(
            ns
        );

    if (existing) {
        ns.kill(
            existing.pid
        );
    }

    if (!hold) {
        const count =
            liquidateAll(
                ns
            );

        ns.tprint(
            `[TRADER] STOPPED + LIQUIDATED | positions=${count}`
        );
    } else {
        ns.tprint(
            "[TRADER] STOPPED | positions left open (--hold)"
        );
    }
}


async function drainTrader(
    ns: NS,
    startIfOffline: boolean
): Promise<void> {
    /*
     * Drain is different from stop:
     *
     * trader remains enabled,
     * but stays entirely in cash for the
     * current augmentation generation.
     */
    if (
        ns.fileExists(
            DISABLED_FILE,
            "home"
        )
    ) {
        ns.rm(
            DISABLED_FILE,
            "home"
        );
    }

    const generation =
        ns.getResetInfo()
            .lastAugReset;

    await ns.write(
        DRAIN_FILE,
        String(
            generation
        ),
        "w"
    );

    const count =
        liquidateAll(
            ns
        );

    let existing =
        getTrader(
            ns
        );

    if (
        !existing && startIfOffline &&
        ns.fileExists(
            TRADER,
            "home"
        ) &&
        ns.stock.hasTixApiAccess() &&
        ns.stock.has4SDataTixApi()
    ) {
        const pid =
            ns.exec(
                TRADER,
                "home",
                1
            );

        if (pid) {
            existing =
                getTrader(
                    ns
                );
        }
    }

    ns.tprint(
        `[TRADER] DRAIN ACTIVE | ` +
        `liquidated=${count} | ` +
        `waiting for augmentation reset`
    );
}


function showStatus(
    ns: NS
): void {
    const trader =
        getTrader(
            ns
        );

    const enabled =
        !ns.fileExists(
            DISABLED_FILE,
            "home"
        );

    const draining =
        ns.fileExists(
            DRAIN_FILE,
            "home"
        );

    const tix =
        ns.stock.hasTixApiAccess();

    const fourS =
        ns.stock.has4SDataTixApi();

    let positions =
        0;

    let liquidation =
        0;

    if (tix) {
        const commission =
            ns.stock.getConstants()
                .StockMarketCommission;

        for (
            const sym
            of ns.stock.getSymbols()
        ) {
            const [
                longShares,
                ,
                shortShares,
                shortAvg,
            ] =
                ns.stock.getPosition(
                    sym
                );

            if (
                longShares >
                0
            ) {
                positions++;

                liquidation +=
                    longShares *
                        ns.stock.getBidPrice(
                            sym
                        ) -
                    commission;
            }

            if (
                shortShares >
                0
            ) {
                positions++;

                liquidation +=
                    shortShares *
                        (
                            2 *
                                shortAvg -
                            ns.stock.getAskPrice(
                                sym
                            )
                        ) -
                    commission;
            }
        }
    }

    ns.tprint("");
    ns.tprint(
        "7n8 STOCK TRADER"
    );

    ns.tprint(
        `Process     : ${
            trader
                ? `ONLINE PID ${trader.pid}`
                : "OFFLINE"
        }`
    );

    ns.tprint(
        `Supervisor  : ${
            enabled
                ? "ENABLED"
                : "DISABLED"
        }`
    );

    ns.tprint(
        `Drain       : ${
            draining
                ? "ACTIVE"
                : "NO"
        }`
    );

    ns.tprint(
        `TIX         : ${
            tix
                ? "YES"
                : "NO"
        }`
    );

    ns.tprint(
        `4S API      : ${
            fourS
                ? "YES"
                : "NO"
        }`
    );

    ns.tprint(
        `Positions   : ${positions}`
    );

    ns.tprint(
        `Liquidation : ${fmtMoney(liquidation)}`
    );

    ns.tprint("");
}


function getTrader(
    ns: NS
) {
    return ns.ps(
        "home"
    ).find(
        process =>
            process.filename ===
            TRADER
    );
}


function liquidateAll(
    ns: NS
): number {
    if (
        !ns.stock.hasTixApiAccess()
    ) {
        return 0;
    }

    let positions =
        0;

    for (
        const sym
        of ns.stock.getSymbols()
    ) {
        const [
            longShares,
            ,
            shortShares,
        ] =
            ns.stock.getPosition(
                sym
            );

        if (
            longShares >
            0
        ) {
            ns.stock.sellStock(
                sym,
                longShares
            );

            positions++;
        }

        if (
            shortShares >
            0
        ) {
            ns.stock.sellShort(
                sym,
                shortShares
            );

            positions++;
        }
    }

    return positions;
}


function fmtMoney(
    n: number
): string {
    const sign =
        n <
        0
            ? "-"
            : "";

    const x =
        Math.abs(
            n
        );

    if (
        x >=
        1e15
    ) {
        return `${sign}$${(
            x /
            1e15
        ).toFixed(2)}q`;
    }

    if (
        x >=
        1e12
    ) {
        return `${sign}$${(
            x /
            1e12
        ).toFixed(2)}t`;
    }

    if (
        x >=
        1e9
    ) {
        return `${sign}$${(
            x /
            1e9
        ).toFixed(2)}b`;
    }

    return `${sign}$${x.toFixed(0)}`;
}
