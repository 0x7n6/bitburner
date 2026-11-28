import type { Task } from "@ns";

export const LOCAL_UNIVERSITIES = {
    "Aevum": "Summit University",
    "Sector-12": "Rothman University",
    "Volhaven": "ZB Institute of Technology",
} as const;

export function isUniversityStudy(task: Task | null): task is Extract<Task, { type: "CLASS" }> {
    return task?.type === "CLASS" &&
        Object.values(LOCAL_UNIVERSITIES).some(university => task.location === university);
}
