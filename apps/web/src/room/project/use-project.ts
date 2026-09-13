import { useEffect, useState } from "react";

import { useRoom } from "../room-provider";
import { listProjectFiles } from "./project";
import { TEXTS_MAP_NAME, TREE_MAP_NAME, type TreeEntry, type ProjectFile } from "./types";

/**
 * Live view of the room's project files (#24), ordered as the tree says.
 *
 * The frozen read side for the LaTeX surface (#25): it returns the file list
 * and each file's `Y.Text`, never a copy. Mutations go through the functions in
 * `project.ts` against `useRoom().runtime.doc`.
 */
export function useProjectFiles(): ProjectFile[] {
  const { runtime } = useRoom();
  const [files, setFiles] = useState<ProjectFile[]>([]);

  useEffect(() => {
    if (!runtime) {
      setFiles([]);
      return;
    }
    const { doc } = runtime;
    const texts = doc.getMap(TEXTS_MAP_NAME);
    const tree = doc.getMap<TreeEntry>(TREE_MAP_NAME);

    const read = () => setFiles(listProjectFiles(doc));
    texts.observe(read);
    tree.observe(read);
    read();
    return () => {
      texts.unobserve(read);
      tree.unobserve(read);
    };
  }, [runtime]);

  return files;
}
