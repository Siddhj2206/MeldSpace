/**
 * The seed paper for a fresh room (#24).
 *
 * `main.tex` pulls in one `\input`ed section and a `.bib`, which is enough to
 * prove the multi-file model converges, to give the compile worker (#27)
 * something to resolve, and to let the LaTeX editor (#25) open more than one
 * file. Paths are plain map keys: there are no folder objects in R2.
 */
export const SAMPLE_PAPER: Record<string, string> = {
  "main.tex": `\\documentclass{article}
\\usepackage{graphicx}
\\usepackage{cite}

\\title{A Room That Survives}
\\author{The MeldSpace Authors}
\\date{\\today}

\\begin{document}
\\maketitle

\\begin{abstract}
A MeldSpace room keeps working when the network, the device, or the
coordinator disappears. This paper is edited, compiled, and versioned
entirely in the browser, peer to peer.
\\end{abstract}

\\input{sections/intro}

\\bibliographystyle{plain}
\\bibliography{refs}

\\end{document}
`,
  "sections/intro.tex": `\\section{Introduction}
A room is a shared object, not a place on a server. Peers hold replicas,
exchange changes directly, and converge when they reconnect~\\cite{meldspace}.

This section is a separate file so the project, not just a single buffer,
is the thing the room converges.
`,
  "refs.bib": `@misc{meldspace,
  title = {MeldSpace: the room survives},
  author = {Jain, Siddhant},
  year = {2026},
  note = {A peer-to-peer collaborative room}
}
`,
};
