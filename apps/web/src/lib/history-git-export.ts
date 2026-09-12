import type { CheckpointMeta } from "./history-store";

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
 * Parent linkage is best-effort (a linear export follows `parent` ids; forks
 * are exported in list order on top of the running tip).
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

export async function exportCheckpointsToGit(
  dir: string,
  checkpoints: ExportableCheckpoint[],
  git: GitBackend,
): Promise<string[]> {
  const ordered = [...checkpoints].sort((a, b) =>
    a.createdAt !== b.createdAt ? a.createdAt - b.createdAt : a.id < b.id ? -1 : 1,
  );
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
