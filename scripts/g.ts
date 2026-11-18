import type { NS } from "@ns";

export async function main(ns: NS): Promise<void> {
    const target = String(ns.args[0]);
    const delay = Math.max(0, Number(ns.args[1]) || 0);

    await ns.grow(target, {
        additionalMsec: delay,
    });
}