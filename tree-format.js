function indentationWidth(indentation) {
  let width = 0;
  for (const character of indentation) {
    if (character === "\t") {
      width += 4 - (width % 4);
    } else {
      width += 1;
    }
  }
  return width;
}

function renderTreeNode(node, prefix, isLast) {
  const connector = isLast ? "└── " : "├── ";
  const lines = [`${prefix}${connector}${node.label}`];
  const childPrefix = `${prefix}${isLast ? "    " : "│   "}`;

  node.children.forEach((child, index) => {
    lines.push(...renderTreeNode(child, childPrefix, index === node.children.length - 1));
  });
  return lines;
}

export function formatIndentedTree(text) {
  const entries = String(text)
    .replace(/\r\n?/g, "\n")
    .split("\n")
    .map((line) => {
      const indentation = line.match(/^[ \t]*/)?.[0] || "";
      return {
        indent: indentationWidth(indentation),
        label: line.slice(indentation.length).trimEnd(),
      };
    })
    .filter((entry) => entry.label.trim());

  if (entries.length < 2) return "";

  const roots = [];
  const stack = [];

  for (const entry of entries) {
    const node = { ...entry, children: [] };
    while (stack.length && entry.indent <= stack.at(-1).indent) stack.pop();

    if (stack.length) stack.at(-1).children.push(node);
    else roots.push(node);
    stack.push(node);
  }

  const lines = [];
  roots.forEach((root) => {
    lines.push(root.label);
    root.children.forEach((child, index) => {
      lines.push(...renderTreeNode(child, "", index === root.children.length - 1));
    });
  });
  return lines.join("\n");
}
