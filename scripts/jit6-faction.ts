import type { NS, Player, PlayerRequirement, ResetInfo } from "@ns";
import { factionOverview, FACTION_SOURCE, findFaction, GAME_COMMIT } from "./bitburner-catalog.ts";

type Status = "MET" | "UNMET" | "UNKNOWN";
type Company = Extract<PlayerRequirement, { type: "companyReputation" }>["company"];

interface Observation {
    player: Player;
    reset: ResetInfo;
    installedCount: number;
    ownedOrQueued: readonly string[];
    companyRep?: (company: Company) => number;
    backdoor?: (server: string) => boolean | undefined;
    hasFile?: (file: string) => boolean;
}

export function requirementStatus(req: PlayerRequirement, observation: Observation): Status {
    const { player, reset, installedCount, ownedOrQueued } = observation;
    const known = (condition: boolean): Status => condition ? "MET" : "UNMET";
    const threshold = (actual: number | undefined, required: number): Status =>
        actual !== undefined && Number.isFinite(actual) && Number.isFinite(required) ? known(actual >= required) : "UNKNOWN";
    const observed = (value: boolean | undefined): Status => value === undefined ? "UNKNOWN" : known(value);
    switch (req.type) {
        case "money": return threshold(player.money, req.money);
        case "skills": {
            const tests = Object.entries(req.skills).map(([skill, value]) =>
                threshold(player.skills[skill as keyof Player["skills"]], value ?? NaN));
            return tests.includes("UNMET") ? "UNMET" : tests.includes("UNKNOWN") ? "UNKNOWN" : "MET";
        }
        case "numAugmentations": return req.numAugmentations === 0
            ? known(ownedOrQueued.every(name => name === "NeuroFlux Governor"))
            : threshold(installedCount, req.numAugmentations);
        case "karma": return threshold(-player.karma, -req.karma);
        case "numPeopleKilled": return threshold(player.numPeopleKilled, req.numPeopleKilled);
        case "city": return known(player.city === req.city);
        case "employedBy": return known(player.jobs[req.company] !== undefined);
        case "companyReputation": return threshold(observation.companyRep?.(req.company), req.reputation);
        case "jobTitle": return known(Object.values(player.jobs).includes(req.jobTitle));
        case "file": return observed(observation.hasFile?.(req.file));
        case "backdoorInstalled": return observed(observation.backdoor?.(req.server));
        case "bitNodeN": return known(reset.currentNode === req.bitNodeN);
        case "sourceFile": return known((reset.ownedSF.get(req.sourceFile) ?? 0) > 0);
        case "everyCondition": {
            const result = req.conditions.map(child => requirementStatus(child, observation));
            return result.includes("UNMET") ? "UNMET" : result.includes("UNKNOWN") ? "UNKNOWN" : "MET";
        }
        case "someCondition": {
            const result = req.conditions.map(child => requirementStatus(child, observation));
            return result.includes("MET") ? "MET" : result.includes("UNKNOWN") ? "UNKNOWN" : "UNMET";
        }
        case "not": {
            const result = requirementStatus(req.condition, observation);
            return result === "UNKNOWN" ? result : known(result === "UNMET");
        }
        default: return "UNKNOWN";
    }
}

export async function main(ns: NS): Promise<void> {
    const faction = findFaction(ns.args.map(String).join(" "));
    if (!faction) {
        ns.tprint("[FACTION] Enter an exact faction name from the JIT6 Faction catalog.");
        return;
    }
    const player = ns.getPlayer();
    const reset = ns.getResetInfo();
    const game = ns.ui.getGameInfo();
    const joined = player.factions.includes(faction);
    for (const line of factionOverview(faction, player.factions)) ns.tprint(line);
    if (game.version !== "3.0.1" || game.commit.length < 7 || !GAME_COMMIT.startsWith(game.commit) ||
        (reset.currentNode !== 4 && !(reset.ownedSF.get(4) ?? 0))) {
        ns.tprint(`Live faction details require a matching game version and Singularity access. Reference: ${FACTION_SOURCE}`);
        return;
    }
    try {
        const installed = ns.singularity.getOwnedAugmentations(false);
        const queued = ns.singularity.getOwnedAugmentations(true);
        const requirements = ns.singularity.getFactionInviteRequirements(faction);
        const enemyFactions = ns.singularity.getFactionEnemies(faction);
        const offers = ns.singularity.getAugmentationsFromFaction(faction);
        const rep = ns.singularity.getFactionRep(faction);
        const favor = ns.singularity.getFactionFavor(faction);
        const workTypes = ns.singularity.getFactionWorkTypes(faction);
        const observation: Observation = {
            player, reset, installedCount: installed.length, ownedOrQueued: queued,
            companyRep: company => ns.singularity.getCompanyRep(company),
            backdoor: server => ns.serverExists(server) ? ns.getServer(server).backdoorInstalled : undefined,
            hasFile: file => ns.fileExists(file, "home"),
        };

        ns.tprint(JSON.stringify({
            faction, joined, rep, favor, workTypes, enemyFactions,
            installedCount: installed.length,
            queuedCount: queued.length - installed.length,
            requirements: requirements.map(requirement => ({
                requirement, result: requirementStatus(requirement, observation),
            })),
            offers: offers.map(name => ({
                name, ownedOrQueued: queued.includes(name), quote: ns.singularity.getAugmentationPrice(name),
                reputationRequired: ns.singularity.getAugmentationRepReq(name),
                prerequisites: ns.singularity.getAugmentationPrereq(name),
            })),
            note: "Verify invitations and any UNKNOWN requirements in the game UI. Plan progression checks live purchase eligibility.",
        }, null, 2));
    } catch (error) {
        ns.tprint(`[FACTION] Could not observe live details: ${String(error)}`);
    }
}
