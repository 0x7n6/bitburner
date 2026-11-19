import type {
    NS,
    AutocompleteData,
} from "@ns";


export async function main(
    ns: NS
): Promise<void> {
    const target =
        String(
            ns.args[0] ?? ""
        ).trim();

    if (!target) {
        ns.tprint(
            "Gunakan: run find.ts [nama_server]"
        );

        return;
    }

    const path =
        findPath(
            ns,
            target
        );

    if (!path) {
        ns.tprint(
            `Server '${target}' tidak ditemukan.`
        );

        return;
    }

    const server =
        ns.getServer(
            target
        );

    const connectCmd =
        path
            .slice(1)
            .map(
                host =>
                    `connect ${host}`
            )
            .join("; ");

    const backdoorSuffix =
        server.backdoorInstalled
            ? ""
            : "; backdoor";

    ns.tprint("");

    ns.tprint(
        `Jalur ditemukan: ${target} | ` +
        `${path.length - 1} hop(s)`
    );

    ns.tprint(
        connectCmd +
        backdoorSuffix
    );

    ns.tprint("");

    ns.tprint(
        `root=${
            ns.hasRootAccess(target)
                ? "YES"
                : "NO"
        } | ` +
        `backdoor=${
            server.backdoorInstalled
                ? "YES"
                : "NO"
        } | ` +
        `requiredHack=${
            ns.getServerRequiredHackingLevel(
                target
            )
        }`
    );
}


function findPath(
    ns: NS,
    target: string
): string[] | null {
    const visited =
        new Set<string>([
            "home",
        ]);

    const queue:
        string[][] = [
            [
                "home",
            ],
        ];

    while (
        queue.length >
        0
    ) {
        const path =
            queue.shift();

        if (!path) {
            break;
        }

        const current =
            path[
                path.length -
                1
            ];

        if (
            current ===
            target
        ) {
            return path;
        }

        for (
            const neighbor
            of ns.scan(
                current
            )
        ) {
            if (
                visited.has(
                    neighbor
                )
            ) {
                continue;
            }

            visited.add(
                neighbor
            );

            queue.push([
                ...path,
                neighbor,
            ]);
        }
    }

    return null;
}


export function autocomplete(
    data: AutocompleteData,
    _args: string[]
): string[] {
    return [
        ...data.servers,
    ];
}
