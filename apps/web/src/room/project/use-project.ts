import { useEffect, useState } from "react";

import { useRoom } from "../room-provider";
import { listProjectFiles } from "./project";
import {
  ASSETS_MAP_NAME,
  TEXTS_MAP_NAME,
  TREE_MAP_NAME,
  type AssetRef,
  type ProjectFile,
  type TreeEntry,
} from "./types";

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

export type ProjectAsset = { path: string; ref: AssetRef };

/** Live view of the room's figure assets (#24 metadata; bytes are #8). */
export function useProjectAssets(): ProjectAsset[] {
  const { runtime } = useRoom();
  const [assets, setAssets] = useState<ProjectAsset[]>([]);

  useEffect(() => {
    if (!runtime) {
      setAssets([]);
      return;
    }
    const map = runtime.doc.getMap<AssetRef>(ASSETS_MAP_NAME);
    const read = () => {
      const list: ProjectAsset[] = [];
      map.forEach((ref, path) => list.push({ path, ref }));
      list.sort((a, b) => (a.path < b.path ? -1 : 1));
      setAssets(list);
    };
    map.observe(read);
    read();
    return () => map.unobserve(read);
  }, [runtime]);

  return assets;
}
