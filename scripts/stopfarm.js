/** @param {NS} ns */
export async function main(ns) {
    ns.disableLog("ALL");

    const victims = new Set([
        "jit4.js",
        "j4h.js",
        "j4g.js",
        "j4w.js",
        "jit3.js",
        "jit2.js",
        "lh.js",
        "lg.js",
        "lw.js",
        "jit.js",
        "jh.js",
        "jg.js",
        "jw.js",
        "shotgun-auto.js",
        "farm.js",
        "shotgun.js",
        "harvest.ts",
        "h.ts",
        "g.ts",
        "w.ts",
        "h.js",
        "g.js",
        "w.js",
        "grow.js",
        "weaken.js",
        "hack-once.js",
        "prep-grow.js",
        "prep-weaken.js",
        "smarthack.js",
    ]);

    const hosts = scanAll(ns);
    let killed = 0;

    for (const host of hosts) {
        for (const proc of ns.ps(host)) {
            if (!victims.has(proc.filename)) continue;
            if (proc.pid === ns.pid) continue;

            if (ns.kill(proc.pid)) {
                killed++;
                ns.tprint(
                    `KILL ${proc.pid} ${proc.filename} @ ${host}`
                );
            }
        }
    }

    ns.tprint(`Stopped ${killed} farm process(es).`);
}

function scanAll(ns) {
    const seen = new Set(["home"]);
    const queue = ["home"];

    while (queue.length > 0) {
        const host = queue.shift();

        for (const next of ns.scan(host)) {
            if (seen.has(next)) continue;

            seen.add(next);
            queue.push(next);
        }
    }

    return [...seen];
}