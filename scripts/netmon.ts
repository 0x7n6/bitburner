import type { NS } from "@ns";

interface NetRow {
    host: string;
    root: boolean;
    req: number;
    ports: number;
    freeRam: number;
    maxRam: number;
    money: number;
    maxMoney: number;
    sec: number;
    minSec: number;
    chance: number;
    state: string;
    running: string;
}

export async function main(ns: NS): Promise<void> {
    ns.disableLog("ALL");

    ns.ui.openTail();
    ns.ui.setTailTitle("7n8 NETMON");
    ns.ui.resizeTail(1100, 700);

    while (true) {
        ns.clearLog();

        const servers = scanAll(ns);
        const hacking = ns.getHackingLevel();

        const programs = [
            "BruteSSH.exe",
            "FTPCrack.exe",
            "relaySMTP.exe",
            "HTTPWorm.exe",
            "SQLInject.exe",
        ];

        const openers =
            programs.filter(
                (p) => ns.fileExists(p, "home")
            ).length;

        const rows: NetRow[] = [];

        for (const host of servers) {
            if (host === "home") {
                continue;
            }

            const s = ns.getServer(host);

            const root =
                s.hasAdminRights;

            const ports =
                s.numOpenPortsRequired ?? 0;

            const canNuke =
                root ||
                ports <= openers;

            const maxMoney =
                s.moneyMax ?? 0;

            const money =
                s.moneyAvailable ?? 0;

            const minSec =
                s.minDifficulty ?? 0;

            const sec =
                s.hackDifficulty ?? 0;

            const req =
                s.requiredHackingSkill ?? 0;

            const chance =
                root &&
                req <= hacking &&
                maxMoney > 0
                    ? ns.hackAnalyzeChance(host)
                    : 0;

            const freeRam =
                s.maxRam - s.ramUsed;

            const processes =
                ns.ps(host);

            let running = "-";

            if (processes.length > 0) {
                const process =
                    processes[0];

                running =
                    `${process.filename.replace(/\.[jt]sx?$/, "")}` +
                    `(${process.threads}t)` +
                    (
                        process.args.length
                            ? `→${process.args[0]}`
                            : ""
                    );

                if (processes.length > 1) {
                    running +=
                        ` +${processes.length - 1}`;
                }
            }

            let state: string;

            if (!root) {
                state =
                    canNuke
                        ? "NUKE"
                        : "LOCK";
            } else if (req > hacking) {
                state = "WORKER";
            } else if (maxMoney <= 0) {
                state = "WORKER";
            } else if (sec > minSec + 2) {
                state = "WEAKEN";
            } else if (
                money <
                maxMoney * 0.90
            ) {
                state = "GROW";
            } else {
                state = "HACK";
            }

            rows.push({
                host,
                root,
                req,
                ports,
                freeRam,
                maxRam: s.maxRam,
                money,
                maxMoney,
                sec,
                minSec,
                chance,
                state,
                running,
            });
        }

        rows.sort((a, b) => {
            if (a.root !== b.root) {
                return a.root ? -1 : 1;
            }

            return b.maxRam - a.maxRam;
        });

        ns.print(
            `7n8 NETMON | Hack ${hacking} | ` +
            `Openers ${openers}/5 | ` +
            `Servers ${servers.length}`
        );

        printHeader(ns);

        for (let i = 0; i < rows.length; i++) {
            const x = rows[i];

            // Repeat header every 12 rows so the columns
            // are still readable when scrolling the tail.
            if (i > 0 && i % 12 === 0) {
                ns.print("");
                printHeader(ns);
            }

            const money =
                x.maxMoney > 0
                    ? `${pct(
                        x.money,
                        x.maxMoney
                    )}%`
                    : "---";

            ns.print(
                `${x.host.padEnd(18)} ` +
                `${x.state.padEnd(8)} ` +
                `${String(x.req).padStart(4)} ` +
                `${String(x.ports).padStart(4)}  ` +
                `${ram(
                    x.freeRam,
                    x.maxRam
                ).padEnd(10)} ` +
                `${money.padStart(6)} ` +
                `${(
                    `${x.sec.toFixed(1)}/${x.minSec.toFixed(1)}`
                ).padStart(10)} ` +
                `${(
                    `${(x.chance * 100).toFixed(0)}%`
                ).padStart(7)}  ` +
                `${x.running}`
            );
        }

        await ns.sleep(2000);
    }
}

function printHeader(ns: NS): void {
    ns.print(
        "────────────────────────────────────────────────────────────────────────────────────────────────────────"
    );

    ns.print(
        "HOST               STATE    REQ PORT  RAM        MONEY       SEC        CHANCE  RUNNING"
    );

    ns.print(
        "────────────────────────────────────────────────────────────────────────────────────────────────────────"
    );
}

function scanAll(ns: NS): string[] {
    const found: string[] = [
        "home",
    ];

    for (
        let i = 0;
        i < found.length;
        i++
    ) {
        for (
            const host of
            ns.scan(found[i])
        ) {
            if (
                !found.includes(host)
            ) {
                found.push(host);
            }
        }
    }

    return found;
}

function pct(
    value: number,
    max: number
): string {
    if (max <= 0) {
        return "0";
    }

    return (
        (value / max) *
        100
    ).toFixed(0);
}

function ram(
    free: number,
    max: number
): string {
    return (
        `${free.toFixed(0)}/` +
        `${max.toFixed(0)}GB`
    );
}