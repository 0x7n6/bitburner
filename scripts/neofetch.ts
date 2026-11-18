import type { NS } from "@ns";

export async function main(ns: NS): Promise<void> {
    // neofetch script made by DeVil
    // Migrated to TypeScript for the 7n8 Bitburner project.

    let tuser = "bitburner";
    let thost = ns.getHostname();

    const requestedHost = String(ns.args[0] ?? "").trim();

    if (
        requestedHost.length > 0 &&
        ns.serverExists(requestedHost)
    ) {
        thost = requestedHost;
    }

    if (ns.hasRootAccess(thost)) {
        tuser = "root";
    }

    const title = `${tuser}@${thost}`;
    const line = "-".repeat(title.length + 1);

    // getHackingLevel() returns the player's hacking level.
    // It does NOT take a hostname argument.
    const hskill = ns.getHackingLevel();

    const rhskill =
        ns.getServerRequiredHackingLevel(thost);

    const hchance =
        ns.format.percent(
            ns.hackAnalyzeChance(thost)
        );

    const htime =
        ns.format.time(
            ns.getHackTime(thost)
        );

    const nukep =
        ns.getServerNumPortsRequired(thost);

    const seclvl =
        ns.getServerSecurityLevel(thost);

    const amoney =
        ns.format.number(
            ns.getServerMoneyAvailable(thost),
            3
        );

    const mmoney =
        ns.getServerMaxMoney(thost);

    const ramv =
        ns.getServerMaxRam(thost);

    const ramu =
        ns.getServerUsedRam(thost);

    const rama =
        ramv - ramu;

    const runningscr =
        ns.ps(thost).length;

    ns.tprintRaw(
        "\n                 aa                   " + title
    );

    ns.tprintRaw(
        "          fi aa  bb  aa fi            " + line
    );

    ns.tprintRaw(
        "      pl  aa sa  if  an aa  ot        " +
        "Hack Lvl: " + hskill
    );

    ns.tprintRaw(
        "   fa wa  ba  a0aaaaaa  aa  aw ab     " +
        "Req Hack Lvl: " + rhskill
    );

    ns.tprintRaw(
        "   ba aa  ba  aa fa aa  aa  aa aa     " +
        "Hack Chance: " + hchance
    );

    ns.tprintRaw(
        "   baaa   aaaca  db  aaaaa   aaaa     " +
        "Hack Time: " + htime
    );

    ns.tprintRaw(
        "   ca   aag  pa  if  aq  aaa   ab     " +
        "Req Ports: " + nukep
    );

    ns.tprintRaw(
        "   ba ja    aaa  aa  aaa    ai aa     " +
        "Sec Lvl: " + seclvl
    );

    ns.tprintRaw(
        "   fa sallmaak  baaa  aaaaaaaw ac     " +
        "Available Money: " + amoney
    );

    ns.tprintRaw(
        "   caamaaaaaa  aa  aa  ae   alaac     " +
        "Max Money: " + mmoney
    );

    ns.tprintRaw(
        "    aa7a   ea  aa  aa  ab   a5aa      " +
        "Max Ram: " + ns.format.ram(ramv)
    );

    ns.tprintRaw(
        "      aa   ba  ai  aa  ab   aa        " +
        "Used Ram: " + ns.format.ram(ramu)
    );

    ns.tprintRaw(
        "       aaa ea    aa    ae aaa         " +
        "Available Ram: " + ns.format.ram(rama)
    );

    ns.tprintRaw(
        "        aa qz     z    vt aa          " +
        "Scripts Running: " + runningscr +
        "\n\n"
    );
}
