import type { NS } from "@ns";

type ScriptArg = string | number | boolean;

export async function main(ns: NS): Promise<number | void> {
    ns.disableLog("sleep");

    while (true) {
        showStatus(ns);

        const choice = await ns.prompt(
            "7n8 Bitburner Control Plane",
            {
                type: "select",
                choices: [
                    "🚀 JIT5 closed-loop AUTO",
                    "🧪 JIT5 planner dry-run",
                    "🧪 JIT5 bounded benchmark",
                    "📈 Start stock trader",
                    "🛑 Stop stock trader",
                    "💧 Drain trader for augmentation",
                    "📊 Stock trader status",
                    "🎯 Target intelligence",
                    "🔎 Find server path",
                    "🧹 Prep / repair target",
                    "🌐 Network monitor",
                    "🖥️ Neofetch",
                    "🛑 Stop all farm engines",
                    "📂 Show tools on home",
                    "❌ Exit",
                ],
            }
        );

        if (!choice || choice === "❌ Exit") {
            ns.tprint("7n8 AP: exit.");
            return;
        }

        switch (choice) {
            case "🚀 JIT5 closed-loop AUTO":
                return launch(
                    ns,
                    "jit5.ts",
                    [
                        "--tail",
                    ]
                );

            case "🧪 JIT5 planner dry-run":
                await launchAndWait(
                    ns,
                    "jit5.ts",
                    [
                        "--dry-run",
                        "--tail",
                    ]
                );
                break;

            case "🧪 JIT5 bounded benchmark":
                return launch(
                    ns,
                    "jit5.ts",
                    [
                        "--limit",
                        40,
                        "--tail",
                    ]
                );

            case "📈 Start stock trader":
                await launchAndWait(
                    ns,
                    "traderctl.ts",
                    [
                        "start",
                    ]
                );
                break;

            case "🛑 Stop stock trader":
                await launchAndWait(
                    ns,
                    "traderctl.ts",
                    [
                        "stop",
                    ]
                );
                break;

            case "💧 Drain trader for augmentation":
                await launchAndWait(
                    ns,
                    "traderctl.ts",
                    [
                        "drain",
                    ]
                );
                break;

            case "📊 Stock trader status":
                await launchAndWait(
                    ns,
                    "traderctl.ts",
                    [
                        "status",
                    ]
                );
                break;

            case "🎯 Target intelligence":
                await launchAndWait(
                    ns,
                    "target.ts",
                    [
                        "--top",
                        20,
                    ]
                );
                break;

            case "🔎 Find server path": {
                const target =
                    await askTarget(
                        ns,
                        "run4theh111z"
                    );

                if (!target) {
                    break;
                }

                await launchAndWait(
                    ns,
                    "find.ts",
                    [
                        target,
                    ]
                );

                break;
            }

            case "🧹 Prep / repair target": {
                const target = await askTarget(
                    ns,
                    "phantasy"
                );

                if (!target) break;

                await launchAndWait(
                    ns,
                    "harvest.ts",
                    [
                        target,
                        "--prep-only",
                        "--tail",
                    ]
                );

                break;
            }

            case "🌐 Network monitor":
                await launchAndWait(
                    ns,
                    "netmon.ts",
                    []
                );
                break;

            case "🖥️ Neofetch":
                await launchAndWait(
                    ns,
                    "neofetch.ts",
                    []
                );
                break;

            case "🛑 Stop all farm engines":
                await launchAndWait(
                    ns,
                    "stopfarm.ts",
                    []
                );
                break;

            case "📂 Show tools on home":
                showTools(ns);
                break;
        }

        await ns.sleep(100);
    }
}

function showStatus(ns: NS): void {
    const home =
        ns.getServer("home");

    const money =
        ns.getPlayer().money;

    const hack =
        ns.getHackingLevel();

    const ram =
        ns.getServerMaxRam("home");

    const used =
        ns.getServerUsedRam("home");

    const cores =
        home.cpuCores ?? 1;

    const formulas =
        ns.fileExists(
            "Formulas.exe",
            "home"
        );

    const openers = [
        "BruteSSH.exe",
        "FTPCrack.exe",
        "relaySMTP.exe",
        "HTTPWorm.exe",
        "SQLInject.exe",
    ].filter(
        x =>
            ns.fileExists(
                x,
                "home"
            )
    ).length;

    const engines =
        ns.ps("home")
            .filter(
                p =>
                    [
                        "early.ts",
                        "jit5.ts",
                        "harvest.ts",
                    ].includes(
                        p.filename
                    )
            )
            .map(
                p =>
                    p.filename
            );

    const trader =
        ns.ps("home")
            .find(
                p =>
                    p.filename ===
                    "trader.ts"
            );

    ns.tprint("");
    ns.tprint(
        "╔══════════════════════════════════════════╗"
    );
    ns.tprint(
        "║        7n8 BITBURNER CONTROL PLANE       ║"
    );
    ns.tprint(
        "╚══════════════════════════════════════════╝"
    );

    ns.tprint(
        `Hack      : ${hack}`
    );

    ns.tprint(
        `Money     : ${fmtMoney(money)}`
    );

    ns.tprint(
        `Home      : ${fmtRam(used)} / ${fmtRam(ram)}`
    );

    ns.tprint(
        `CPU       : ${cores} core(s)`
    );

    ns.tprint(
        `Openers   : ${openers}/5`
    );

    ns.tprint(
        `Formulas  : ${formulas ? "YES" : "NO"}`
    );

    ns.tprint(
        `Engine    : ${
            engines.length
                ? engines.join(", ")
                : "IDLE"
        }`
    );

    ns.tprint(
        `Trader    : ${
            trader
                ? `ONLINE (${trader.pid})`
                : "OFFLINE"
        }`
    );

    ns.tprint("");
}

async function askTarget(
    ns: NS,
    fallback: string
): Promise<string> {
    const value =
        await ns.prompt(
            `Target hostname\nExample: ${fallback}`,
            {
                type: "text",
            }
        );

    const target =
        String(
            value ?? ""
        ).trim();

    return (
        target ||
        fallback
    );
}

function launch(
    ns: NS,
    script: string,
    args: ScriptArg[]
): number {
    if (
        !ns.fileExists(
            script,
            "home"
        )
    ) {
        ns.tprint(
            `AP ERROR: missing ${script}`
        );

        return 0;
    }

    const pid =
        ns.exec(
            script,
            "home",
            1,
            ...args
        );

    if (!pid) {
        ns.tprint(
            `AP ERROR: failed to launch ${script}`
        );

        return 0;
    }

    ns.tprint(
        `AP: launched ${script} | PID ${pid}`
    );

    return pid;
}

async function launchAndWait(
    ns: NS,
    script: string,
    args: ScriptArg[]
): Promise<void> {
    const pid =
        launch(
            ns,
            script,
            args
        );

    if (!pid) {
        return;
    }

    while (
        ns.isRunning(pid)
    ) {
        await ns.sleep(
            200
        );
    }
}

function showTools(ns: NS): void {
    const files =
        ns.ls("home")
            .filter(
                file =>
                    /\.[jt]sx?$/.test(file)
            )
            .sort();

    ns.tprint("");
    ns.tprint(
        `=== HOME TOOLS (${files.length}) ===`
    );

    for (
        const file of files
    ) {
        const ram =
            ns.getScriptRam(
                file,
                "home"
            );

        ns.tprint(
            `${file.padEnd(24)} ${ram.toFixed(2)} GB`
        );
    }

    ns.tprint("");
}

function fmtMoney(n: number): string {
    if (n >= 1e12)
        return `$${(n / 1e12).toFixed(2)}t`;

    if (n >= 1e9)
        return `$${(n / 1e9).toFixed(2)}b`;

    if (n >= 1e6)
        return `$${(n / 1e6).toFixed(2)}m`;

    return `$${n.toFixed(0)}`;
}

function fmtRam(gb: number): string {
    if (gb >= 1024)
        return `${(gb / 1024).toFixed(2)}T`;

    return `${gb.toFixed(1)}G`;
}