/** @param {NS} ns */
export async function main(ns) {
    const target = String(ns.args[0]);

    const pct = ns.hackAnalyze(target);

    ns.tprint(
        `${target}: ${(pct * 100).toFixed(3)}% stolen per thread`
    );

    ns.tprint(
        `~10% harvest = ${Math.ceil(0.10 / pct)} threads`
    );

    ns.tprint(
        `~20% harvest = ${Math.ceil(0.20 / pct)} threads`
    );
}