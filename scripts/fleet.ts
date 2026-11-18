import type { NS } from "@ns";

interface Candidate {
    ram: number;
    costEach: number;

    count: number;

    totalCost: number;
    totalRam: number;

    costPerGb: number;
}

const J5_FILES = [
    "j5h.ts",
    "j5g.ts",
    "j5w.ts",
];

export async function main(
    ns: NS
): Promise<void> {
    const flags = ns.flags([
        ["budget", 0.50],
        ["min-ram", 1024],
        ["prefix", "j5-node"],
        ["top", 12],

        ["execute", false],
        ["help", false],
    ]);

    if (flags.help) {
        printHelp(ns);
        return;
    }

    const budgetFraction =
        clamp(
            Number(flags.budget) || 0.50,
            0.01,
            1
        );

    const requestedMinRam =
        Math.max(
            2,
            Number(
                flags["min-ram"]
            ) || 1024
        );

    const prefix =
        String(
            flags.prefix ||
            "j5-node"
        );

    const top =
        Math.max(
            1,
            Math.floor(
                Number(flags.top) || 12
            )
        );

    const execute =
        Boolean(
            flags.execute
        );

    const money =
        ns.getServerMoneyAvailable(
            "home"
        );

    const budget =
        money *
        budgetFraction;

    const existing =
        ns.cloud.getServerNames();

    const limit =
        ns.cloud.getServerLimit();

    const maxRam =
        ns.cloud.getRamLimit();

    const slots =
        Math.max(
            0,
            limit -
            existing.length
        );

    ns.tprint("");
    ns.tprint(
        "JIT5 CLOUD FLEET PLANNER"
    );

    ns.tprint(
        `Money      : ${fmtMoney(money)}`
    );

    ns.tprint(
        `Budget     : ${fmtMoney(budget)} ` +
        `(${pct(budgetFraction)})`
    );

    ns.tprint(
        `Cloud      : ${existing.length}/${limit} servers`
    );

    ns.tprint(
        `Free slots : ${slots}`
    );

    ns.tprint(
        `Max/server : ${fmtRam(maxRam)}`
    );

    if (
        slots <= 0
    ) {
        ns.tprint(
            "No free cloud-server slots."
        );

        return;
    }

    const minRam =
        nextPowerOfTwo(
            Math.min(
                requestedMinRam,
                maxRam
            )
        );

    const candidates:
        Candidate[] = [];

    for (
        let ram = minRam;

        ram <= maxRam;

        ram *= 2
    ) {
        const costEach =
            ns.cloud.getServerCost(
                ram
            );

        if (
            !Number.isFinite(
                costEach
            ) ||
            costEach <= 0
        ) {
            continue;
        }

        const affordable =
            Math.floor(
                budget /
                costEach
            );

        const count =
            Math.min(
                slots,
                affordable
            );

        if (
            count <= 0
        ) {
            continue;
        }

        const totalCost =
            costEach *
            count;

        const totalRam =
            ram *
            count;

        candidates.push({
            ram,
            costEach,

            count,

            totalCost,
            totalRam,

            costPerGb:
                totalCost /
                totalRam,
        });
    }

    if (
        candidates.length === 0
    ) {
        ns.tprint("");
        ns.tprint(
            "Budget cannot afford even the minimum RAM tier."
        );

        ns.tprint(
            `Try a lower --min-ram or larger --budget.`
        );

        return;
    }

    /*
     * Objective:
     *
     * maximize total added RAM.
     *
     * Tie-break:
     * prefer larger individual servers,
     * because fewer large hosts reduce fragmentation.
     */
    candidates.sort(
        (a, b) =>
            b.totalRam -
                a.totalRam ||

            b.ram -
                a.ram ||

            a.totalCost -
                b.totalCost
    );

    ns.tprint("");
    ns.tprint(
        " RAM/SERVER      COUNT      COST/EACH      TOTAL COST      ADDED RAM      $/GB"
    );

    ns.tprint(
        "-".repeat(83)
    );

    for (
        const c
        of candidates.slice(
            0,
            top
        )
    ) {
        ns.tprint(
            `${pad(fmtRam(c.ram), 11)} ` +
            `${pad(c.count, 10)} ` +
            `${pad(fmtMoney(c.costEach), 14)} ` +
            `${pad(fmtMoney(c.totalCost), 15)} ` +
            `${pad(fmtRam(c.totalRam), 14)} ` +
            `${pad(fmtMoney(c.costPerGb), 10)}`
        );
    }

    const best =
        candidates[0];

    ns.tprint("");
    ns.tprint(
        "BEST CAPACITY PLAN"
    );

    ns.tprint(
        `${best.count} × ${fmtRam(best.ram)}`
    );

    ns.tprint(
        `Cost      : ${fmtMoney(best.totalCost)}`
    );

    ns.tprint(
        `Added RAM : ${fmtRam(best.totalRam)}`
    );

    const currentNaturalRam =
        totalRootedRam(
            ns
        );

    ns.tprint(
        `Current rooted RAM : ${fmtRam(currentNaturalRam)}`
    );

    ns.tprint(
        `After purchase      : ${fmtRam(
            currentNaturalRam +
            best.totalRam
        )}`
    );

    ns.tprint(
        `Capacity multiplier : ${(
            (
                currentNaturalRam +
                best.totalRam
            ) /
            Math.max(
                1,
                currentNaturalRam
            )
        ).toFixed(2)}x`
    );

    if (!execute) {
        ns.tprint("");
        ns.tprint(
            "DRY RUN ONLY."
        );

        ns.tprint(
            `Execute with: run fleet.ts --budget ${budgetFraction} --execute`
        );

        return;
    }

    ns.tprint("");
    ns.tprint(
        "EXECUTING FLEET PURCHASE"
    );

    let bought = 0;
    let spent = 0;
    let addedRam = 0;

    for (
        let i = 0;
        i < best.count;
        i++
    ) {
        const availableMoney =
            ns.getServerMoneyAvailable(
                "home"
            );

        if (
            availableMoney <
            best.costEach
        ) {
            ns.tprint(
                "STOP: insufficient remaining money."
            );

            break;
        }

        const host =
            ns.cloud.purchaseServer(
                `${prefix}-${i}`,
                best.ram
            );

        if (!host) {
            ns.tprint(
                `STOP: cloud.purchaseServer failed at ${i}.`
            );

            break;
        }

        bought++;
        spent +=
            best.costEach;

        addedRam +=
            best.ram;

        const copied =
            ns.scp(
                J5_FILES,
                host,
                "home"
            );

        ns.tprint(
            `+ ${host} | ` +
            `${fmtRam(best.ram)} | ` +
            `${copied ? "workers deployed" : "SCP FAILED"}`
        );
    }

    ns.tprint("");
    ns.tprint(
        `DONE | bought=${bought} | ` +
        `RAM=${fmtRam(addedRam)} | ` +
        `spent=${fmtMoney(spent)}`
    );
}


function totalRootedRam(
    ns: NS
): number {
    const seen =
        new Set<string>([
            "home",
        ]);

    const queue:
        string[] = [
            "home",
        ];

    let total = 0;

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

        if (
            ns.hasRootAccess(
                host
            )
        ) {
            total +=
                ns.getServerMaxRam(
                    host
                );
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

    return total;
}


function nextPowerOfTwo(
    value: number
): number {
    return Math.pow(
        2,
        Math.ceil(
            Math.log2(
                Math.max(
                    2,
                    value
                )
            )
        )
    );
}


function clamp(
    value: number,
    min: number,
    max: number
): number {
    return Math.min(
        max,
        Math.max(
            min,
            value
        )
    );
}


function pct(
    value: number
): string {
    return (
        value *
        100
    ).toFixed(0) + "%";
}


function fmtRam(
    value: number
): string {
    return nsSafeRam(value);
}


function nsSafeRam(
    gb: number
): string {
    if (
        gb >= 1024 * 1024
    ) {
        return (
            gb /
            (1024 * 1024)
        ).toFixed(2) + "PB";
    }

    if (
        gb >= 1024
    ) {
        return (
            gb /
            1024
        ).toFixed(2) + "TB";
    }

    return (
        gb.toFixed(0) +
        "GB"
    );
}


function fmtMoney(
    value: number
): string {
    if (
        !Number.isFinite(
            value
        )
    ) {
        return "-";
    }

    if (
        value >= 1e15
    ) {
        return (
            "$" +
            (
                value /
                1e15
            ).toFixed(2) +
            "q"
        );
    }

    if (
        value >= 1e12
    ) {
        return (
            "$" +
            (
                value /
                1e12
            ).toFixed(2) +
            "t"
        );
    }

    if (
        value >= 1e9
    ) {
        return (
            "$" +
            (
                value /
                1e9
            ).toFixed(2) +
            "b"
        );
    }

    if (
        value >= 1e6
    ) {
        return (
            "$" +
            (
                value /
                1e6
            ).toFixed(2) +
            "m"
        );
    }

    if (
        value >= 1e3
    ) {
        return (
            "$" +
            (
                value /
                1e3
            ).toFixed(1) +
            "k"
        );
    }

    return (
        "$" +
        value.toFixed(0)
    );
}


function pad(
    value: string | number,
    width: number
): string {
    return String(value)
        .padStart(
            width
        );
}


function printHelp(
    ns: NS
): void {
    ns.tprint(
        "JIT5 CLOUD FLEET PLANNER"
    );

    ns.tprint(
        "run fleet.ts"
    );

    ns.tprint(
        "run fleet.ts --budget 0.50"
    );

    ns.tprint(
        "run fleet.ts --budget 0.50 --min-ram 1024"
    );

    ns.tprint(
        "run fleet.ts --budget 0.50 --execute"
    );

    ns.tprint("");
    ns.tprint(
        "--budget = fraction of current cash allowed for fleet purchase"
    );
}