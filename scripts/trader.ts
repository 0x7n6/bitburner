import type { NS } from "@ns";

const DISABLED_FILE =
    ".7n8-trader-disabled.txt";

const DRAIN_FILE =
    ".7n8-trader-drain.txt";

type Side =
    | "LONG"
    | "SHORT";

interface Config {
    reservePct: number;
    reserveAbs: number;

    buyCashPct: number;
    maxPositionPct: number;

    minEdge: number;
    minReturn: number;

    maxBreakEvenTicks: number;
    cycleSafetyTicks: number;
    cycleFlipThreshold: number;

    minTradeValue: number;

    disableShorts: boolean;

    statusEvery: number;

    dryRun: boolean;
    tail: boolean;
}

interface StockState {
    sym: string;

    forecast: number;
    volatility: number;

    expectedReturn: number;
    edge: number;

    ask: number;
    bid: number;

    spreadPct: number;
    breakEvenTicks: number;

    maxShares: number;

    longShares: number;
    longAvg: number;

    shortShares: number;
    shortAvg: number;
}

interface MarketClock {
    known: boolean;
    tick: number;

    previousForecasts:
        Map<string, number>;
}

export async function main(
    ns: NS
): Promise<void> {
    const f =
        ns.flags([
            ["reserve-pct", 0.15],
            ["reserve-abs", 1e9],

            ["buy-cash-pct", 0.35],
            ["max-position-pct", 0.30],

            ["min-edge", 0.05],
            ["min-return", 0.0001],

            ["max-break-even", 25],
            ["cycle-safety", 3],
            ["cycle-flips", 6],

            ["min-trade", 50e6],

            ["disable-shorts", false],
            ["mission-owned", false],

            ["status-every", 5],

            ["dry-run", false],
            ["tail", false],
        ]);

    const cfg: Config = {
        reservePct:
            clamp(
                Number(
                    f["reserve-pct"]
                ),
                0,
                0.90
            ),

        reserveAbs:
            Math.max(
                0,
                Number(
                    f["reserve-abs"]
                ) || 0
            ),

        buyCashPct:
            clamp(
                Number(
                    f["buy-cash-pct"]
                ),
                0,
                1
            ),

        maxPositionPct:
            clamp(
                Number(
                    f["max-position-pct"]
                ),
                0.05,
                1
            ),

        minEdge:
            clamp(
                Number(
                    f["min-edge"]
                ),
                0,
                0.49
            ),

        minReturn:
            Math.max(
                0,
                Number(
                    f["min-return"]
                ) || 0
            ),

        maxBreakEvenTicks:
            Math.max(
                1,
                Number(
                    f["max-break-even"]
                ) || 25
            ),

        cycleSafetyTicks:
            Math.max(
                0,
                Math.floor(
                    Number(
                        f["cycle-safety"]
                    ) || 0
                )
            ),

        cycleFlipThreshold:
            Math.max(
                3,
                Math.floor(
                    Number(
                        f["cycle-flips"]
                    ) || 6
                )
            ),

        minTradeValue:
            Math.max(
                1e6,
                Number(
                    f["min-trade"]
                ) || 50e6
            ),

        disableShorts:
            Boolean(
                f["disable-shorts"]
            ),

        statusEvery:
            Math.max(
                1,
                Math.floor(
                    Number(
                        f["status-every"]
                    ) || 5
                )
            ),

        dryRun:
            Boolean(
                f["dry-run"]
            ),

        tail:
            Boolean(
                f.tail
            ),
    };

    ns.disableLog("ALL");

    if (cfg.tail) {
        ns.ui.openTail();
    }

    if (
        ns.fileExists(
            DISABLED_FILE,
            "home"
        )
    ) {
        ns.tprint(
            "[TRADER] disabled by operator."
        );

        return;
    }

    if (
        !ns.stock.hasTixApiAccess()
    ) {
        ns.tprint(
            "[TRADER] TIX API unavailable."
        );

        return;
    }

    if (
        !ns.stock.has4SDataTixApi()
    ) {
        ns.tprint(
            "[TRADER] 4S TIX API unavailable."
        );

        return;
    }

    clearStaleDrain(ns);

    const constants =
        ns.stock.getConstants();

    const symbols =
        ns.stock.getSymbols();

    const shortEnabled =
        !cfg.disableShorts &&
        canShort(ns);

    const clock:
        MarketClock = {
        known: false,
        tick: 0,

        previousForecasts:
            new Map(),
    };

    let stocks =
        readStocks(
            ns,
            symbols
        );

    const stockSourceStart =
        ns.getMoneySources()
            .sinceStart
            .stock;

    const liquidationStart =
        liquidationValue(
            stocks,
            constants.StockMarketCommission
        );

    let loop =
        0;

    ns.tprint("");
    ns.tprint(
        "7n8 STOCK TRADER ONLINE"
    );

    ns.tprint(
        `4S        : YES`
    );

    ns.tprint(
        `Shorts    : ${
            shortEnabled
                ? "ENABLED"
                : "LOCKED / DISABLED"
        }`
    );

    ns.tprint(
        `Reserve   : ${(cfg.reservePct * 100).toFixed(0)}%`
    );

    ns.tprint(
        `Entry edge: ${(cfg.minEdge * 100).toFixed(1)}%`
    );

    ns.tprint(
        `Mode      : ${
            cfg.dryRun
                ? "DRY-RUN"
                : "LIVE"
        }`
    );

    ns.tprint("");

    while (true) {
        clearStaleDrain(ns);

        stocks =
            readStocks(
                ns,
                symbols
            );

        updateMarketClock(
            ns,
            stocks,
            clock,
            cfg,
            constants.TicksPerCycle
        );

        if (
            isDrainActive(ns)
        ) {
            if (
                hasPositions(
                    stocks
                )
            ) {
                if (!cfg.dryRun) {
                    liquidateAll(
                        ns,
                        stocks
                    );
                }

                ns.print(
                    "[TRADER] DRAIN | portfolio liquidated"
                );
            }

            if (
                loop %
                    cfg.statusEvery ===
                0
            ) {
                ns.print(
                    "[TRADER] DRAIN MODE | holding cash until augmentation reset"
                );
            }

            loop++;

            await ns.stock.nextUpdate();

            continue;
        }

        const sold =
            exitInvalidPositions(
                ns,
                stocks,
                shortEnabled,
                cfg
            );

        /*
         * A trade itself can alter forecast.
         * Re-read after sales before deploying capital.
         */
        if (
            sold > 0 &&
            !cfg.dryRun
        ) {
            stocks =
                readStocks(
                    ns,
                    symbols
                );
        }

        allocateCapital(
            ns,
            stocks,
            shortEnabled,
            cfg,
            clock,
            constants.TicksPerCycle,
            constants.StockMarketCommission
        );

        if (
            loop %
                cfg.statusEvery ===
            0
        ) {
            printStatus(
                ns,
                stocks,
                shortEnabled,
                clock,
                constants.TicksPerCycle,
                stockSourceStart,
                liquidationStart,
                constants.StockMarketCommission
            );
        }

        loop++;

        /*
         * Synchronize exactly with the game's market,
         * including 4-second bonus-time ticks.
         */
        await ns.stock.nextUpdate();
    }
}


function readStocks(
    ns: NS,
    symbols: string[]
): StockState[] {
    return symbols.map(
        sym => {
            const [
                longShares,
                longAvg,
                shortShares,
                shortAvg,
            ] =
                ns.stock.getPosition(
                    sym
                );

            const forecast =
                ns.stock.getForecast(
                    sym
                );

            const volatility =
                ns.stock.getVolatility(
                    sym
                );

            const ask =
                ns.stock.getAskPrice(
                    sym
                );

            const bid =
                ns.stock.getBidPrice(
                    sym
                );

            const edge =
                Math.abs(
                    forecast -
                    0.5
                );

            /*
             * Expected signed magnitude per tick:
             *
             * volatility * |p - 0.5|
             *
             * This is also the model used by the
             * stronger community stock engines in
             * sources/.
             */
            const expectedReturn =
                volatility *
                edge;

            const spreadPct =
                ask > 0
                    ? (
                        ask -
                        bid
                    ) /
                    ask
                    : Infinity;

            const breakEvenTicks =
                expectedReturn > 0 &&
                ask > bid
                    ? Math.log(
                        ask /
                        bid
                    ) /
                    Math.log(
                        1 +
                        expectedReturn
                    )
                    : Infinity;

            return {
                sym,

                forecast,
                volatility,

                expectedReturn,
                edge,

                ask,
                bid,

                spreadPct,
                breakEvenTicks,

                maxShares:
                    ns.stock.getMaxShares(
                        sym
                    ),

                longShares,
                longAvg,

                shortShares,
                shortAvg,
            };
        }
    );
}


function exitInvalidPositions(
    ns: NS,
    stocks: StockState[],
    shortEnabled: boolean,
    cfg: Config
): number {
    let actions =
        0;

    for (
        const stock
        of stocks
    ) {
        /*
         * Alain's rule is intentionally simple:
         *
         * stay LONG while expectation is positive;
         * stay SHORT while expectation is negative.
         *
         * Entry has a stronger threshold than exit,
         * creating hysteresis and avoiding churn.
         */

        if (
            stock.longShares >
                0 &&
            stock.forecast <=
                0.5
        ) {
            if (cfg.dryRun) {
                ns.print(
                    `[DRY] SELL LONG ${stock.sym} | ` +
                    `forecast=${pct(stock.forecast)}`
                );
            } else {
                const price =
                    ns.stock.sellStock(
                        stock.sym,
                        stock.longShares
                    );

                if (price > 0) {
                    ns.print(
                        `[SELL] LONG ${stock.sym} | ` +
                        `${fmtShares(stock.longShares)} @ ` +
                        `${fmtMoney(price)}`
                    );
                }
            }

            actions++;
        }

        if (
            stock.shortShares >
                0 &&
            (
                !shortEnabled ||
                stock.forecast >=
                    0.5
            )
        ) {
            if (cfg.dryRun) {
                ns.print(
                    `[DRY] COVER ${stock.sym} | ` +
                    `forecast=${pct(stock.forecast)}`
                );
            } else {
                const price =
                    ns.stock.sellShort(
                        stock.sym,
                        stock.shortShares
                    );

                if (price > 0) {
                    ns.print(
                        `[SELL] SHORT ${stock.sym} | ` +
                        `${fmtShares(stock.shortShares)} @ ` +
                        `${fmtMoney(price)}`
                    );
                }
            }

            actions++;
        }
    }

    return actions;
}


function allocateCapital(
    ns: NS,
    stocks: StockState[],
    shortEnabled: boolean,
    cfg: Config,
    clock: MarketClock,
    ticksPerCycle: number,
    commission: number
): void {
    const cash =
        ns.getPlayer().money;

    const holdings =
        liquidationValue(
            stocks,
            commission
        );

    const corpus =
        Math.max(
            cash,
            cash +
            holdings
        );

    if (
        corpus <=
        0
    ) {
        return;
    }

    /*
     * Don't continuously drip every dollar from
     * JIT5 into stocks.
     *
     * Wait until liquidity has rebuilt, then buy
     * in meaningful batches.
     */
    if (
        cash /
            corpus <=
        cfg.buyCashPct
    ) {
        return;
    }

    const reserve =
        Math.max(
            cfg.reserveAbs,
            corpus *
                cfg.reservePct
        );

    let spendable =
        Math.max(
            0,
            cash -
                reserve
        );

    if (
        spendable <
        cfg.minTradeValue
    ) {
        return;
    }

    const candidates =
        stocks
            .filter(
                stock =>
                    isCandidate(
                        stock,
                        shortEnabled,
                        cfg,
                        clock,
                        ticksPerCycle,
                        commission
                    )
            )
            .sort(
                (
                    a,
                    b
                ) =>
                    (
                        a.breakEvenTicks -
                        b.breakEvenTicks
                    ) ||
                    (
                        b.expectedReturn -
                        a.expectedReturn
                    )
            );

    for (
        const stock
        of candidates
    ) {
        if (
            spendable <
            cfg.minTradeValue
        ) {
            break;
        }

        const side:
            Side =
            stock.forecast >
                0.5
                ? "LONG"
                : "SHORT";

        if (
            side ===
                "SHORT" &&
            !shortEnabled
        ) {
            continue;
        }

        /*
         * Do not hold long AND short simultaneously.
         */
        if (
            side ===
                "LONG" &&
            stock.shortShares >
                0
        ) {
            continue;
        }

        if (
            side ===
                "SHORT" &&
            stock.longShares >
                0
        ) {
            continue;
        }

        const existingValue =
            positionValue(
                stock,
                commission
            );

        const positionLimit =
            corpus *
            cfg.maxPositionPct;

        const symbolBudget =
            Math.max(
                0,
                positionLimit -
                    existingValue
            );

        const budget =
            Math.min(
                spendable,
                symbolBudget
            );

        if (
            budget <
            cfg.minTradeValue
        ) {
            continue;
        }

        const owned =
            stock.longShares +
            stock.shortShares;

        const remainingShares =
            Math.max(
                0,
                stock.maxShares -
                    owned
            );

        if (
            remainingShares <=
            0
        ) {
            continue;
        }

        const purchasePrice =
            side ===
                "LONG"
                ? stock.ask
                : stock.bid;

        const shares =
            Math.min(
                remainingShares,
                Math.floor(
                    (
                        budget -
                        commission
                    ) /
                    purchasePrice
                )
            );

        if (
            shares <=
            0
        ) {
            continue;
        }

        const tradeValue =
            shares *
            purchasePrice;

        if (
            tradeValue <
            cfg.minTradeValue
        ) {
            continue;
        }

        /*
         * Break-even model handles spread.
         *
         * Also require enough expected gross return
         * to make the flat commissions irrelevant.
         */
        const horizon =
            usableHorizon(
                clock,
                ticksPerCycle,
                cfg
            );

        const usableTicks =
            Number.isFinite(
                horizon
            )
                ? Math.max(
                    1,
                    horizon
                )
                : Math.max(
                    5,
                    Math.ceil(
                        stock.breakEvenTicks
                    ) +
                        5
                );

        const expectedGross =
            tradeValue *
            (
                Math.pow(
                    1 +
                        stock.expectedReturn,
                    usableTicks
                ) -
                1
            );

        if (
            expectedGross <=
            4 *
                commission
        ) {
            continue;
        }

        if (cfg.dryRun) {
            ns.print(
                `[DRY] BUY ${side} ${stock.sym} | ` +
                `${fmtShares(shares)} | ` +
                `F=${pct(stock.forecast)} | ` +
                `V=${pct(stock.volatility)} | ` +
                `ER=${bps(stock.expectedReturn)} | ` +
                `BE=${stock.breakEvenTicks.toFixed(1)}t`
            );

            spendable -=
                tradeValue +
                commission;

            continue;
        }

        const result =
            side ===
                "LONG"
                ? ns.stock.buyStock(
                    stock.sym,
                    shares
                )
                : ns.stock.buyShort(
                    stock.sym,
                    shares
                );

        if (
            result <=
            0
        ) {
            continue;
        }

        spendable -=
            tradeValue +
            commission;

        ns.print(
            `[BUY] ${side} ${stock.sym} | ` +
            `${fmtShares(shares)} @ ${fmtMoney(result)} | ` +
            `F=${pct(stock.forecast)} | ` +
            `V=${pct(stock.volatility)} | ` +
            `ER=${bps(stock.expectedReturn)} | ` +
            `BE=${stock.breakEvenTicks.toFixed(1)}t`
        );
    }
}


function isCandidate(
    stock: StockState,
    shortEnabled: boolean,
    cfg: Config,
    clock: MarketClock,
    ticksPerCycle: number,
    commission: number
): boolean {
    const bullish =
        stock.forecast >=
        0.5 +
            cfg.minEdge;

    const bearish =
        stock.forecast <=
        0.5 -
            cfg.minEdge;

    if (
        !bullish &&
        !bearish
    ) {
        return false;
    }

    if (
        bearish &&
        !shortEnabled
    ) {
        return false;
    }

    if (
        stock.expectedReturn <
        cfg.minReturn
    ) {
        return false;
    }

    if (
        !Number.isFinite(
            stock.breakEvenTicks
        ) ||
        stock.breakEvenTicks >
            cfg.maxBreakEvenTicks
    ) {
        return false;
    }

    const horizon =
        usableHorizon(
            clock,
            ticksPerCycle,
            cfg
        );

    if (
        Number.isFinite(
            horizon
        ) &&
        stock.breakEvenTicks +
            cfg.cycleSafetyTicks >=
            horizon
    ) {
        return false;
    }

    /*
     * Don't generate trivial additional purchases
     * whose value cannot plausibly dominate fees.
     */
    const price =
        bullish
            ? stock.ask
            : stock.bid;

    if (
        price <=
        commission /
            1000
    ) {
        /*
         * Not a hard economic requirement,
         * just avoid pathological microscopic orders.
         */
    }

    return true;
}


function updateMarketClock(
    ns: NS,
    stocks: StockState[],
    clock: MarketClock,
    cfg: Config,
    ticksPerCycle: number
): void {
    let inversions =
        0;

    for (
        const stock
        of stocks
    ) {
        const previous =
            clock.previousForecasts.get(
                stock.sym
            );

        if (
            previous !==
            undefined &&
            looksLikeInversion(
                previous,
                stock.forecast
            )
        ) {
            inversions++;
        }
    }

    if (
        inversions >=
        cfg.cycleFlipThreshold
    ) {
        clock.known =
            true;

        clock.tick =
            0;

        ns.print(
            `[MARKET] cycle inversion detected | ` +
            `stocks=${inversions} | ` +
            `cycle=0/${ticksPerCycle}`
        );
    } else if (
        clock.known
    ) {
        clock.tick =
            (
                clock.tick +
                1
            ) %
            ticksPerCycle;
    }

    for (
        const stock
        of stocks
    ) {
        clock.previousForecasts.set(
            stock.sym,
            stock.forecast
        );
    }
}


function looksLikeInversion(
    before: number,
    after: number
): boolean {
    const beforeEdge =
        before -
        0.5;

    const afterEdge =
        after -
        0.5;

    if (
        Math.abs(
            beforeEdge
        ) <
            0.02 ||
        Math.abs(
            afterEdge
        ) <
            0.02
    ) {
        return false;
    }

    if (
        Math.sign(
            beforeEdge
        ) ===
        Math.sign(
            afterEdge
        )
    ) {
        return false;
    }

    /*
     * Market-cycle inversion approximately transforms:
     *
     * p → 1 - p
     */
    return (
        Math.abs(
            after -
            (
                1 -
                before
            )
        ) <=
        0.12
    );
}


function usableHorizon(
    clock: MarketClock,
    ticksPerCycle: number,
    cfg: Config
): number {
    if (
        !clock.known
    ) {
        return Infinity;
    }

    return Math.max(
        0,
        ticksPerCycle -
            clock.tick -
            cfg.cycleSafetyTicks
    );
}


function printStatus(
    ns: NS,
    stocks: StockState[],
    shortEnabled: boolean,
    clock: MarketClock,
    ticksPerCycle: number,
    stockSourceStart: number,
    liquidationStart: number,
    commission: number
): void {
    const cash =
        ns.getPlayer().money;

    const liquidation =
        liquidationValue(
            stocks,
            commission
        );

    const stockSource =
        ns.getMoneySources()
            .sinceStart
            .stock;

    /*
     * Money source sees realized cashflow.
     * Liquidation delta adds mark-to-market exposure.
     */
    const pnl =
        (
            stockSource -
            stockSourceStart
        ) +
        (
            liquidation -
            liquidationStart
        );

    const longCount =
        stocks.filter(
            s =>
                s.longShares >
                0
        ).length;

    const shortCount =
        stocks.filter(
            s =>
                s.shortShares >
                0
        ).length;

    const top =
        stocks
            .filter(
                s =>
                    (
                        s.forecast >
                            0.5 ||
                        shortEnabled
                    ) &&
                    s.edge >=
                        0.03
            )
            .sort(
                (
                    a,
                    b
                ) =>
                    b.expectedReturn -
                    a.expectedReturn
            )
            .slice(
                0,
                3
            )
            .map(
                s =>
                    `${s.sym}:${pct(s.forecast)}/${bps(s.expectedReturn)}`
            )
            .join(
                " "
            );

    ns.print("");

    ns.print(
        `[TRADER] cash=${fmtMoney(cash)} | ` +
        `stocks=${fmtMoney(liquidation)} | ` +
        `PnL=${signedMoney(pnl)}`
    );

    ns.print(
        `[PORTFOLIO] long=${longCount} | ` +
        `short=${shortCount} | ` +
        `shortAccess=${shortEnabled ? "YES" : "NO"}`
    );

    ns.print(
        `[MARKET] ${
            clock.known
                ? `tick=${clock.tick}/${ticksPerCycle}`
                : "cycle=LEARNING"
        } | top=${top || "none"}`
    );
}


function liquidationValue(
    stocks: StockState[],
    commission: number
): number {
    return stocks.reduce(
        (
            total,
            stock
        ) =>
            total +
            positionValue(
                stock,
                commission
            ),
        0
    );
}


function positionValue(
    stock: StockState,
    commission: number
): number {
    let value =
        0;

    if (
        stock.longShares >
        0
    ) {
        value +=
            stock.longShares *
                stock.bid -
            commission;
    }

    if (
        stock.shortShares >
        0
    ) {
        /*
         * Official short liquidation model:
         *
         * original margin
         * +
         * (entry - current ask)
         */
        value +=
            stock.shortShares *
                (
                    2 *
                        stock.shortAvg -
                    stock.ask
                ) -
            commission;
    }

    return value;
}


function liquidateAll(
    ns: NS,
    stocks: StockState[]
): void {
    for (
        const stock
        of stocks
    ) {
        if (
            stock.longShares >
            0
        ) {
            ns.stock.sellStock(
                stock.sym,
                stock.longShares
            );
        }

        if (
            stock.shortShares >
            0
        ) {
            ns.stock.sellShort(
                stock.sym,
                stock.shortShares
            );
        }
    }
}


function hasPositions(
    stocks: StockState[]
): boolean {
    return stocks.some(
        stock =>
            stock.longShares >
                0 ||
            stock.shortShares >
                0
    );
}


function canShort(
    ns: NS
): boolean {
    const reset =
        ns.getResetInfo();

    return (
        reset.currentNode ===
            8 ||
        (
            reset.ownedSF.get(
                8
            ) ??
            0
        ) >=
            2
    );
}


function isDrainActive(
    ns: NS
): boolean {
    return ns.fileExists(
        DRAIN_FILE,
        "home"
    );
}


function clearStaleDrain(
    ns: NS
): void {
    if (
        !ns.fileExists(
            DRAIN_FILE,
            "home"
        )
    ) {
        return;
    }

    const marker =
        Number(
            ns.read(
                DRAIN_FILE
            )
        );

    const current =
        ns.getResetInfo()
            .lastAugReset;

    /*
     * traderctl drain stores the augmentation
     * generation that requested the drain.
     *
     * Once lastAugReset changes, the marker
     * belongs to the previous world.
     */
    if (
        Number.isFinite(
            marker
        ) &&
        marker !==
            current
    ) {
        ns.rm(
            DRAIN_FILE,
            "home"
        );

        ns.tprint(
            "[TRADER] stale augmentation drain cleared."
        );
    }
}


function clamp(
    value: number,
    min: number,
    max: number
): number {
    if (
        !Number.isFinite(
            value
        )
    ) {
        return min;
    }

    return Math.max(
        min,
        Math.min(
            max,
            value
        )
    );
}


function fmtMoney(
    value: number
): string {
    const sign =
        value <
        0
            ? "-"
            : "";

    const n =
        Math.abs(
            value
        );

    if (
        n >=
        1e15
    ) {
        return `${sign}$${(
            n /
            1e15
        ).toFixed(2)}q`;
    }

    if (
        n >=
        1e12
    ) {
        return `${sign}$${(
            n /
            1e12
        ).toFixed(2)}t`;
    }

    if (
        n >=
        1e9
    ) {
        return `${sign}$${(
            n /
            1e9
        ).toFixed(2)}b`;
    }

    if (
        n >=
        1e6
    ) {
        return `${sign}$${(
            n /
            1e6
        ).toFixed(2)}m`;
    }

    return `${sign}$${n.toFixed(0)}`;
}


function signedMoney(
    value: number
): string {
    return (
        value >=
        0
            ? "+"
            : ""
    ) +
        fmtMoney(
            value
        );
}


function fmtShares(
    value: number
): string {
    if (
        value >=
        1e9
    ) {
        return `${(
            value /
            1e9
        ).toFixed(2)}b`;
    }

    if (
        value >=
        1e6
    ) {
        return `${(
            value /
            1e6
        ).toFixed(2)}m`;
    }

    if (
        value >=
        1e3
    ) {
        return `${(
            value /
            1e3
        ).toFixed(2)}k`;
    }

    return value.toFixed(
        0
    );
}


function pct(
    value: number
): string {
    return `${(
        value *
        100
    ).toFixed(1)}%`;
}


function bps(
    value: number
): string {
    return `${(
        value *
        10000
    ).toFixed(2)}bp`;
}