import { compareCheckpoints, type CheckpointMeta } from "./history-store";

/**
 * Optional isomorphic-git export path (#6: "isomorphic-git is an optional
 * export only").
 *
 * This module never imports isomorphic-git (or any filesystem shim). The caller
 * supplies a minimal git backend — typically thin wrappers around
 * `isomorphic-git` + LightningFS loaded via dynamic `import()` at the call
 * site, so bundlers never include git machinery in the room shell.
 *
 * Each checkpoint becomes one commit: the room text at checkpoint time is
 * written to `room.md`, committed with the checkpoint's author + timestamp.
 * Commits are ordered so each checkpoint follows its `parent`. A flat commit
 * list cannot represent a fork, so a second branch is committed once its shared
 * parent exists — best-effort lineage, not a merge graph.
 *
 * ```ts
 * const [{ commit, add, writeFile }, LightningFS] = await Promise.all([
 *   import("isomorphic-git"),
 *   import("@isomorphic-git/lightning-fs"),
 * ]);
 * // ...wrap into GitBackend and call exportCheckpointsToGit
 * ```
 */

export type GitBackend = {
  init: (args: { dir: string }) => Promise<void>;
  writeFile: (args: { dir: string; path: string; content: string }) => Promise<void>;
  add: (args: { dir: string; filepath: string }) => Promise<void>;
  commit: (args: {
    dir: string;
    message: string;
    author: { name: string; email: string };
  }) => Promise<string>;
};

export type ExportableCheckpoint = CheckpointMeta & {
  /** Room text at checkpoint time; the history UI (#7) can supply this via `store.inspect(id)`. */
  text: string;
};

/**
 * Order checkpoints so a parent is always committed before its children. A
 * linear chain follows `parent` exactly; forked branches are appended once
 * their shared parent exists. Deterministic thanks to `compareCheckpoints`.
 */
export function orderCheckpointsForExport(
  checkpoints: ExportableCheckpoint[],
): ExportableCheckpoint[] {
  const byId = new Map(checkpoints.map((checkpoint) => [checkpoint.id, checkpoint]));
  const ordered: ExportableCheckpoint[] = [];
  const seen = new Set<string>();
  const visit = (checkpoint: ExportableCheckpoint) => {
    if (seen.has(checkpoint.id)) return;
    seen.add(checkpoint.id);
    const parent = checkpoint.parent ? byId.get(checkpoint.parent) : undefined;
    if (parent) visit(parent);
    ordered.push(checkpoint);
  };
  for (const checkpoint of [...checkpoints].sort(compareCheckpoints)) {
    visit(checkpoint);
  }
  return ordered;
}

export async function exportCheckpointsToGit(
  dir: string,
  checkpoints: ExportableCheckpoint[],
  git: GitBackend,
): Promise<string[]> {
  const ordered = orderCheckpointsForExport(checkpoints);
  await git.init({ dir });
  const shas: string[] = [];
  for (const checkpoint of ordered) {
    const when = new Date(checkpoint.createdAt).toISOString();
    await git.writeFile({ dir, path: "room.md", content: checkpoint.text });
    await git.add({ dir, filepath: "room.md" });
    const sha = await git.commit({
      dir,
      message: `checkpoint ${checkpoint.id.slice(0, 12)} (${when})${checkpoint.label ? ` ${checkpoint.label}` : ""}`,
      author: {
        name: checkpoint.authorName,
        email: `${checkpoint.authorDeviceId}@meldspace.local`,
      },
    });
    shas.push(sha);
  }
  return shas;
}
