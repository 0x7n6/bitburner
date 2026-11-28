import type { NS } from "@ns";
import { findFaction, GAME_COMMIT } from "./bitburner-catalog.ts";

export async function main(ns: NS): Promise<void> {
    const show = (line: string) => ns.tprint(`[JIT6 JOIN] ${line}`);
    const [requested] = ns.args;
    const faction = typeof requested === "string" ? findFaction(requested) : undefined;
    if (ns.args.length !== 1 || !faction || faction !== requested) {
        show('Supply one exact faction name, e.g. run jit6-join.ts "Sector-12".');
        return;
    }
    if (ns.getHostname() !== "home") {
        show("Run the action from home.");
        return;
    }
    const game = ns.ui.getGameInfo();
    if (game.version !== "3.0.1" || game.commit.length < 7 || !GAME_COMMIT.startsWith(game.commit)) {
        show("Requires Bitburner 3.0.1 (3162fd2).");
        return;
    }
    const { currentNode, lastNodeReset, lastAugReset, ownedSF } = ns.getResetInfo();
    if (currentNode !== 4 && !(ownedSF.get(4) ?? 0)) {
        show("Singularity unavailable. Review invitations in the Factions panel.");
        return;
    }

    const checkInvitation = (): string[] => {
        const joined = ns.getPlayer().factions;
        if (joined.includes(faction)) throw new Error(`Already a member of ${faction}.`);
        const enemies = [...new Set(ns.singularity.getFactionEnemies(faction))].sort();
        const conflicts = joined.filter(member => enemies.includes(member));
        if (conflicts.length) {
            throw new Error(`Membership conflicts with ${conflicts.join(", ")}.`);
        }
        if (!ns.singularity.checkFactionInvitations().includes(faction)) {
            throw new Error(`No pending invitation from ${faction}.`);
        }
        return enemies;
    };

    try {
        const exclusions = checkInvitation();
        const consequence = exclusions.length ? `\nExcludes ${exclusions.join(", ")} until reset.` : "";
        if (await ns.prompt(`Join ${faction}?${consequence}`, { type: "boolean" }) !== true) {
            show("Cancelled.");
            return;
        }

        const live = ns.getResetInfo();
        if (live.currentNode !== currentNode || live.lastNodeReset !== lastNodeReset ||
            live.lastAugReset !== lastAugReset || (live.currentNode !== 4 && !(live.ownedSF.get(4) ?? 0))) {
            throw new Error("Reset generation or Singularity access changed. Request a fresh approval.");
        }
        // Recheck the invitation and its terms synchronously with the join.
        const liveExclusions = checkInvitation();
        if (exclusions.length !== liveExclusions.length || exclusions.some((name, index) => name !== liveExclusions[index])) {
            throw new Error("Faction exclusions changed. Request a fresh approval.");
        }
        if (!ns.singularity.joinFaction(faction)) {
            show(`The game declined the invitation from ${faction}.`);
            return;
        }
        show(ns.getPlayer().factions.includes(faction)
            ? `Joined ${faction}.`
            : `Could not verify membership in ${faction}. Check the Factions panel.`);
    } catch (error) {
        show(error instanceof Error ? error.message : String(error));
    }
}
