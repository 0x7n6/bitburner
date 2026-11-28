import assert from "node:assert/strict";
import test from "node:test";

import { main as ap } from "../scripts/ap.ts";
import { main as detail } from "../scripts/bt4-detail.ts";
import { BIT_NODES, FACTIONS, bitNodeCatalog, factionOverview, findFaction } from "../scripts/bitburner-catalog.ts";
import { main as dashboard } from "../scripts/jit6-dashboard.ts";
import { main as factionDetails, requirementStatus } from "../scripts/jit6-faction.ts";
import { main as multipliers } from "../scripts/jit6-multipliers.ts";

function snapshot(node = 4) {
    return {
        reset: { currentNode: node, ownedSF: new Map([[1, 1]]), ownedAugs: new Map() },
        player: { money: 32_700_000_000, factions: ["Slum Snakes"], city: "Sector-12", karma: -10,
            jobs: {}, skills: { hacking: 350, strength: 121, defense: 121, dexterity: 123, agility: 123 } },
    };
}

test("pinned catalogs cover all 15 BitNodes and 34 factions", () => {
    assert.deepEqual(Object.keys(BIT_NODES).map(Number), Array.from({ length: 15 }, (_, index) => index + 1));
    assert.equal(Object.keys(FACTIONS).length, 34);
    assert.ok(Object.values(FACTIONS).every(card => card.requirements.length && Array.isArray(card.work)));
    assert.equal(findFaction("  sEcToR-12 "), "Sector-12");
    assert.ok(factionOverview("Sector-12", []).some(line => line.includes("Incompatible") && line.includes("Volhaven")));
    assert.ok(bitNodeCatalog(snapshot(12).reset).some(line => line.includes("unlimited")));
    assert.match(BIT_NODES[15].next, /alternate Red Pill route/);
});

test("live requirements handle compound unknowns and the Church's queued-augmentation gate", () => {
    const observation = { ...snapshot(), installedCount: 0, ownedOrQueued: ["NeuroFlux Governor"] };
    const none = { type: "numAugmentations", numAugmentations: 0 };
    const cash = { type: "money", money: 100_000_000_000 };
    const karma = { type: "karma", karma: -9 };
    const church = { type: "location", location: "Church of the Machine God" };
    assert.equal(requirementStatus(none, observation), "MET");
    assert.equal(requirementStatus(none, { ...observation, ownedOrQueued: ["Neural Accelerator"] }), "UNMET");
    assert.equal(requirementStatus({ type: "everyCondition", conditions: [cash, church] }, observation), "UNMET");
    assert.equal(requirementStatus({ type: "someCondition", conditions: [cash, church] }, observation), "UNKNOWN");
    assert.equal(requirementStatus({ type: "someCondition", conditions: [karma, church] }, observation), "MET");
    assert.equal(requirementStatus({ type: "not", condition: church }, observation), "UNKNOWN");
});

test("dashboard reads live processes and reports the BN15 completion route", async () => {
    const { reset, player } = snapshot(15);
    const output = [];
    const ns = {
        pid: 12, flags: () => ({}), tprint: line => output.push(line),
        ui: { getGameInfo: () => ({ version: "3.0.1", commit: "3162fd2" }) },
        getResetInfo: () => reset, getPlayer: () => player,
        getServer: name => name === "home" ? { maxRam: 128, ramUsed: 26 } : { requiredHackingSkill: 3000 },
        getScriptRam: () => 6, fileExists: name => name === "DarkscapeNavigator.exe",
        getScriptLogs: pid => pid === 20 ? ["hidden", "[JIT6 SUPPORT] Waiting for home RAM"] :
            ["[BT4 AUTO] Player already working. Waiting for idle before starting new work."],
        ps: () => [
            { filename: "jit6.ts", pid: 20, args: ["--execute"] },
            { filename: "trader.ts", pid: 21, args: [] },
            { filename: "bt4-auto.ts", pid: 22, args: ["--execute"] },
        ],
        stock: { hasTixApiAccess: () => false },
        dnet: { getDarknetInstability: () => ({ authenticationDurationMultiplier: 1, authenticationTimeoutChance: 0.05 }) },
    };
    await dashboard(ns);
    assert.match(output.join("\n"), /JIT6 PID 20.*Trader PID 21/);
    assert.match(output.join("\n"), /Waiting for home RAM/);
    assert.match(output.join("\n"), /\[BT4 AUTO\] Player already working\. Waiting for idle/);
    assert.match(output.join("\n"), /Hacking threshold 350\/3000; unmet/);
    assert.match(output.join("\n"), /alternate Red Pill route/);
    assert.match(output.join("\n"), /5\.0% timeout/);
});

test("faction details provide baseline eligibility and live quotes without work or purchase calls", async () => {
    const { reset, player } = snapshot();
    const output = [];
    const ns = {
        args: ["slum snakes"], tprint: line => output.push(line),
        ui: { getGameInfo: () => ({ version: "3.0.1", commit: "3162fd2" }) },
        getResetInfo: () => reset, getPlayer: () => player,
        singularity: {
            getOwnedAugmentations: includeQueue => includeQueue ? ["LuminCloaking-V1 Skin Implant"] : [],
            getFactionInviteRequirements: () => [{ type: "money", money: 1_000_000 }],
            getFactionEnemies: () => [], getFactionRep: () => 650, getFactionFavor: () => 0,
            getFactionWorkTypes: () => ["field", "security"], getAugmentationsFromFaction: () => ["Wired Reflexes"],
            getAugmentationPrice: () => 2_500_000, getAugmentationRepReq: () => 500, getAugmentationPrereq: () => [],
        },
    };
    await factionDetails(ns);
    assert.match(output[0], /JOINED/);
    const live = JSON.parse(output.at(-1));
    assert.equal(live.queuedCount, 1);
    assert.equal(live.requirements[0].result, "MET");
    assert.equal(live.offers[0].quote, 2_500_000);

    ns.ui.getGameInfo = () => ({ version: "3.1.0", commit: "0000000" });
    delete ns.singularity;
    await factionDetails(ns);
    assert.match(output.at(-1), /matching game version/);
});

test("reset summary reports queued augmentations and active services with read-only calls", async () => {
    const { reset } = snapshot();
    reset.ownedAugs.set("NeuroFlux Governor", 2);
    const output = [];
    const ns = {
        flags: () => ({ "reset-summary": true }), getResetInfo: () => reset, tprint: line => output.push(line),
        ps: () => [{ filename: "trader.ts", pid: 32 }],
        singularity: {
            getOwnedAugmentations: includeQueue => includeQueue
                ? ["NeuroFlux Governor", "NeuroFlux Governor", "The Red Pill"] : ["NeuroFlux Governor"],
        },
    };
    await detail(ns);
    assert.match(output.join("\n"), /Queued \(2\): NeuroFlux Governor, The Red Pill/);
    assert.match(output.join("\n"), /trader\.ts \(PID 32\)/);
    assert.match(output.join("\n"), /stock positions/);
});

test("multiplier view uses the requested BN12 level and honors the SF5 gate", async () => {
    const { reset } = snapshot();
    const output = [];
    const calls = [];
    const ns = {
        args: [12, 7], getResetInfo: () => reset, tprint: line => output.push(line),
        getBitNodeMultipliers: (...args) => { calls.push(args); return { HackingLevelMultiplier: 0.82 }; },
    };
    await multipliers(ns);
    assert.deepEqual(calls, []);
    assert.match(output.at(-1), /active SF5/);
    reset.ownedSF.set(5, 1);
    await multipliers(ns);
    assert.deepEqual(calls, [[12, 7]]);
    assert.match(output.at(-2), /BN12, level 7/);
});

function apFixture(prompts, node = 4) {
    const { reset, player } = snapshot(node);
    const output = [];
    const menus = [];
    const launches = [];
    const ns = {
        disableLog: () => {}, sleep: async () => {},
        prompt: async (title, { choices }) => {
            menus.push({ title, choices });
            assert.ok(prompts.length, `Unexpected prompt: ${title}`);
            const answer = prompts.shift();
            if (choices) assert.ok(choices.includes(answer), `${answer} was not offered in ${title}`);
            return answer;
        },
        getResetInfo: () => reset, getServer: () => ({ maxRam: 128, ramUsed: 8 }), ps: () => [],
        getScriptRam: () => 5, getServerMaxRam: () => 128, getServerUsedRam: () => 8, isRunning: () => false,
        getPlayer: () => player, format: { number: () => "32.7b" }, getServerMoneyAvailable: () => player.money,
        getHackingLevel: () => player.skills.hacking, fileExists: name => name.endsWith(".ts"), tprint: line => output.push(line),
        exec: (script, _host, _threads, ...args) => launches.push([script, ...args]),
    };
    return { ns, player, output, menus, launches };
}

test("AP catalogs and offline faction guides work without spawning helper scripts", async () => {
    const { ns, output, launches } = apFixture([
        "JIT6 dashboard", "BitNode catalog", "JIT6 dashboard", "Faction details", "Daedalus", "Exit",
    ], 1);
    ns.fileExists = () => false;
    await ap(ns);
    assert.match(output.join("\n"), /BN1 \[current\].*Source Genesis/);
    assert.match(output.join("\n"), /Daedalus.*endgame/);
    assert.match(output.join("\n"), /node-specific installed augmentation count/);
    assert.deepEqual(launches, []);
});

test("AP offers the standard work types of joined factions", async () => {
    const { ns, player, menus, launches } = apFixture([
        "Progression tools", "Start faction work", "Slum Snakes", "field", "Exit",
    ]);
    player.factions.push("Bladeburners");
    await ap(ns);
    assert.deepEqual(menus.find(menu => menu.title === "Joined faction").choices, ["Slum Snakes", "Back"]);
    assert.deepEqual(menus.find(menu => menu.title === "Slum Snakes work type").choices, ["field", "security", "Back"]);
    assert.deepEqual(launches, [["bt4-action.ts", "work", "Slum Snakes", "field"]]);
});

test("AP rejects invalid BN12 levels before launching the multiplier viewer", async () => {
    const route = ["JIT6 dashboard", "BitNode multipliers", "12"];
    const { ns, output, launches } = apFixture([...route, "0", ...route, "1.5", ...route, "7", "Exit"]);
    await ap(ns);
    assert.equal(output.filter(line => line.includes("Enter a whole BN12 level of 1 or higher")).length, 2);
    assert.deepEqual(launches, [["jit6-multipliers.ts", 12, 7]]);
});
