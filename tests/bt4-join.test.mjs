import assert from "node:assert/strict";
import { test } from "node:test";
import { main } from "../scripts/jit6-join.ts";

const FACTION = "Sector-12";

function fixture(args = [FACTION]) {
    const state = {
        hostname: "home", version: "3.0.1", commit: "3162fd2",
        reset: { currentNode: 4, lastNodeReset: 1, lastAugReset: 2, ownedSF: new Map() },
        joined: ["Slum Snakes"], invitations: [FACTION], enemies: ["Volhaven", "Chongqing"],
        output: [], prompts: [], joins: [],
        approve: () => true,
        accept: () => true,
    };
    const ns = {
        args,
        getHostname: () => state.hostname,
        ui: { getGameInfo: () => ({ version: state.version, commit: state.commit }) },
        getResetInfo: () => ({ ...state.reset }),
        getPlayer: () => ({ factions: [...state.joined] }),
        tprint: text => state.output.push(text),
        prompt: async (message, options) => {
            state.prompts.push({ message, options });
            return state.approve();
        },
        singularity: {
            checkFactionInvitations: () => [...state.invitations],
            getFactionEnemies: () => [...state.enemies],
            joinFaction: name => {
                state.joins.push(name);
                if (!state.accept()) return false;
                state.joined.push(name);
                return true;
            },
        },
    };
    return { ns, state };
}

test("local approval names the faction and exact exclusions and verifies membership", async () => {
    const { ns, state } = fixture();
    state.approve = () => {
        assert.deepEqual(state.joins, []);
        state.enemies.reverse();
        return true;
    };
    await main(ns);
    assert.deepEqual(state.prompts, [{
        message: "Join Sector-12?\nExcludes Chongqing, Volhaven until reset.",
        options: { type: "boolean" },
    }]);
    assert.deepEqual(state.joins, [FACTION]);
    assert.ok(state.joined.includes(FACTION));
    assert.equal(state.output.at(-1), "[JIT6 JOIN] Joined Sector-12.");
});

test("absent or inexact arguments never refresh invites or commit a join", async () => {
    for (const args of [[], ["sector-12"], [FACTION, "yes"]]) {
        const { ns, state } = fixture(args);
        delete ns.singularity;
        await main(ns);
        assert.deepEqual(state.prompts, []);
        assert.match(state.output.at(-1), /one exact faction name/);
    }
});

test("declined confirmation, already joined, missing invite and existing conflict leave membership alone", async () => {
    for (const [change, message, promptCount] of [
        [state => { state.approve = () => false; }, /Cancelled/, 1],
        [state => { state.joined.push(FACTION); }, /Already a member/, 0],
        [state => { state.invitations.length = 0; }, /No pending invitation/, 0],
        [state => { state.joined.push("Chongqing"); }, /Membership conflicts/, 0],
    ]) {
        const { ns, state } = fixture();
        change(state);
        await main(ns);
        assert.deepEqual(state.joins, []);
        assert.equal(state.prompts.length, promptCount);
        assert.match(state.output.at(-1), message);
    }
});

test("approval expires if an invite, exclusion, conflict or reset changes", async () => {
    for (const [change, message] of [
        [state => { state.invitations.length = 0; }, /No pending invitation/],
        [state => { state.enemies.push("New Tokyo"); }, /exclusions changed/],
        [state => { state.joined.push("Volhaven"); }, /Membership conflicts/],
        [state => { state.reset.lastAugReset++; }, /Reset generation/],
    ]) {
        const { ns, state } = fixture();
        state.approve = () => { change(state); return true; };
        await main(ns);
        assert.equal(state.prompts.length, 1);
        assert.deepEqual(state.joins, []);
        assert.match(state.output.at(-1), message);
    }
});

test("remote host, unsupported game and locked Singularity make no invite API calls", async () => {
    for (const change of [
        state => { state.hostname = "n00dles"; },
        state => { state.commit = "xxxxxxx"; },
        state => { state.reset.currentNode = 1; },
    ]) {
        const { ns, state } = fixture();
        change(state);
        delete ns.singularity;
        await main(ns);
        assert.deepEqual(state.prompts, []);
        assert.deepEqual(state.joins, []);
    }
});

test("an API refusal or a missing postcondition is reported without a retry", async () => {
    const refused = fixture();
    refused.state.accept = () => false;
    await main(refused.ns);
    assert.deepEqual(refused.state.joins, [FACTION]);
    assert.match(refused.state.output.at(-1), /game declined/);

    const dishonest = fixture();
    dishonest.ns.singularity.joinFaction = () => true;
    await main(dishonest.ns);
    assert.match(dishonest.state.output.at(-1), /Could not verify membership/);
});
