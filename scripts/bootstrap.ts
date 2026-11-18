import type { NS } from "@ns";

const DAEMON =
    "daemon.ts";

export async function main(
    ns: NS
): Promise<void> {
    ns.disableLog("ALL");

    const reset =
        ns.getResetInfo();

    const sf4 =
        reset.currentNode === 4 ||
        (
            reset.ownedSF.get(4) ??
            0
        ) > 0;

    ns.tprint("");
    ns.tprint(
        "7n8 BITBURNER OS BOOTSTRAP"
    );

    ns.tprint(
        `BitNode      : ${reset.currentNode}`
    );

    ns.tprint(
        `Hack         : ${ns.getHackingLevel()}`
    );

    ns.tprint(
        `Money        : ${ns.format.number(
            ns.getServerMoneyAvailable(
                "home"
            )
        )}`
    );

    ns.tprint(
        `Singularity  : ${
            sf4
                ? "AVAILABLE"
                : "LOCKED"
        }`
    );

    if (
        !ns.fileExists(
            DAEMON,
            "home"
        )
    ) {
        ns.tprint(
            `BOOT ERROR: missing ${DAEMON}`
        );

        return;
    }

    const existing =
        ns.ps("home")
            .find(
                p =>
                    p.filename ===
                    DAEMON
            );

    if (existing) {
        ns.tprint(
            `Daemon already running | PID ${existing.pid}`
        );

        return;
    }

    const pid =
        ns.exec(
            DAEMON,
            "home",
            1
        );

    if (!pid) {
        ns.tprint(
            "BOOT ERROR: failed to launch daemon."
        );

        return;
    }

    ns.tprint(
        `Daemon online | PID ${pid}`
    );
}