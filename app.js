import { Editor, Extension } from "@tiptap/core";
import StarterKit from "@tiptap/starter-kit";
import { Markdown } from "@tiptap/markdown";
import { TableKit } from "@tiptap/extension-table";
import CodeBlock from "@tiptap/extension-code-block";
import TaskList from "@tiptap/extension-task-list";
import TaskItem from "@tiptap/extension-task-item";
import { Plugin } from "@tiptap/pm/state";
import { Decoration, DecorationSet } from "@tiptap/pm/view";

const STORAGE_KEY = "mojian-markdown-document";
const THEME_KEY = "mojian-theme";
const SETTINGS_KEY = "mojian-settings";
const LAST_FOLDER_KEY = "mojian-last-folder";
const LAST_FILE_KEY = "mojian-last-file";

const DEFAULT_SETTINGS = {
  startupBehavior: "last-file",
  fontFamily: '"Open Sans", "Segoe UI", "Microsoft YaHei", system-ui, sans-serif',
  fontSize: 16,
};

const sourceEditor = document.querySelector("#source-editor");
const editorSurface = document.querySelector(".editor-surface");
const documentName = document.querySelector("#document-name");
const saveState = document.querySelector("#save-state");
const fileInput = document.querySelector("#file-input");
const wordCount = document.querySelector("#word-count");
const blockCount = document.querySelector("#block-count");
const editorState = document.querySelector("#editor-state");
const themeButton = document.querySelector("#theme-button");
const saveFileButton = document.querySelector("#save-file-button");
const openFolderButton = document.querySelector("#open-folder-button");
const settingsButton = document.querySelector("#settings-button");
const settingsModal = document.querySelector("#settings-modal");
const settingsCloseButton = document.querySelector("#settings-close-button");
const settingsSaveButton = document.querySelector("#settings-save-button");
const settingsResetButton = document.querySelector("#settings-reset-button");
const fontFamilySetting = document.querySelector("#font-family-setting");
const fontSizeSetting = document.querySelector("#font-size-setting");
const refreshTreeButton = document.querySelector("#refresh-tree-button");
const emptyTreeAction = document.querySelector("#empty-tree-action");
const folderName = document.querySelector("#folder-name");
const fileTree = document.querySelector("#file-tree");
const editorPane = document.querySelector(".editor-pane");
const explorer = document.querySelector("#explorer");
let outlineTree = null;

const CODE_LANGUAGES = [
  { value: "", label: "Plain text" },
  { value: "javascript", label: "JavaScript" },
  { value: "typescript", label: "TypeScript" },
  { value: "html", label: "HTML" },
  { value: "css", label: "CSS" },
  { value: "json", label: "JSON" },
  { value: "markdown", label: "Markdown" },
  { value: "python", label: "Python" },
  { value: "rust", label: "Rust" },
  { value: "go", label: "Go" },
  { value: "java", label: "Java" },
  { value: "csharp", label: "C#" },
  { value: "cpp", label: "C++" },
  { value: "shell", label: "Shell" },
  { value: "sql", label: "SQL" },
  { value: "yaml", label: "YAML" },
  { value: "xml", label: "XML" },
];

const LANGUAGE_ALIASES = {
  js: "javascript",
  jsx: "javascript",
  ts: "typescript",
  tsx: "typescript",
  py: "python",
  rs: "rust",
  sh: "shell",
  bash: "shell",
  zsh: "shell",
  md: "markdown",
  yml: "yaml",
  c: "cpp",
  cs: "csharp",
};

const SHORTCUTS = {
  heading: "Mod+Alt+2",
  bold: "Mod+B",
  italic: "Mod+I",
  strike: "Mod+Shift+X",
  quote: "Mod+Alt+Q",
  code: "Mod+E",
  link: "Mod+K",
  bullet: "Mod+Alt+U",
  number: "Mod+Alt+O",
  task: "Mod+Alt+X",
  table: "Mod+Alt+T",
  "block-code": "Mod+Alt+C",
  "clear-format": "Mod+Alt+Backspace",
};

const MODE_SHORTCUTS = {
  visual: "Mod+Alt+V",
  source: "Mod+Alt+M",
};

const starterDocument = `# 欢迎使用墨笺

这是一款基于 TipTap 和 ProseMirror 的所见即所得 Markdown 编辑器。

## 编辑方式

- 单击任意位置放置光标
- 按 Enter 创建新段落，按 Backspace 合并段落
- 支持跨段落选择、撤销重做与 Markdown 快捷输入
- 支持 **粗体**、*斜体*、~~删除线~~ 与 \`行内代码\`

> 现在编辑文档不再需要考虑“块”。

### 今日计划

- [x] 使用真正的富文本编辑模型
- [ ] 写下一个新想法

| 功能 | 状态 |
| --- | --- |
| TipTap 所见即所得编辑 | 已就绪 |
| Markdown 双向转换 | 已就绪 |

\`\`\`js
const editor = "TipTap";
console.log(editor);
\`\`\``;

let markdown = "";
let saveTimer;
let applyingContent = false;
let folderHandle = null;
let desktopFolderPath = "";
let currentFileHandle = null;
let currentFilePath = "";
const fileHandles = new Map();
let settings = loadSettings();
let sharedScrollTop = 0;

function runningInTauri() {
  return typeof globalThis.__TAURI__?.core?.invoke === "function";
}

async function invokeDesktop(command, args = {}) {
  return globalThis.__TAURI__.core.invoke(command, args);
}

function getTextStats(text) {
  const normalized = text.replace(/[#>*_~`|[\]()!-]/g, " ");
  return (normalized.match(/[\u3400-\u9fff]/g)?.length ?? 0)
    + (normalized.match(/[a-zA-Z0-9]+(?:['-][a-zA-Z0-9]+)*/g)?.length ?? 0);
}

function currentWindowTitle() {
  if (currentFilePath) return currentFilePath.split(/[\\/]/).at(-1);
  return `${documentName.value.trim() || "未命名文档"}.md`;
}

function setNativeWindowTitle(title) {
  document.title = title;
  if (!runningInTauri()) return;
  invokeDesktop("set_window_title", { title }).catch(console.error);
}

function updateDocumentTitle() {
  setNativeWindowTitle(currentWindowTitle());
}

function sanitizeFileName(name) {
  return name.trim().replace(/[<>:"/\\|?*]+/g, "-").replace(/^\.+$/, "").trim();
}

function parentDirectoryFromPath(path) {
  const separatorIndex = Math.max(path.lastIndexOf("/"), path.lastIndexOf("\\"));
  return separatorIndex > 0 ? path.slice(0, separatorIndex) : "";
}

function normalizeLanguage(language = "") {
  const normalized = String(language).toLowerCase();
  return LANGUAGE_ALIASES[normalized] || normalized;
}

function tokenClass(type) {
  return `syntax-token syntax-${type}`;
}

function createTokenRules(language) {
  const normalized = normalizeLanguage(language);
  const cLike = ["javascript", "typescript", "java", "csharp", "cpp", "rust", "go"].includes(normalized);
  const rules = [];

  if (["html", "xml", "markdown"].includes(normalized)) {
    rules.push([/<!--[\s\S]*?-->/g, "comment"]);
    rules.push([/<\/?[\w:-]+/g, "tag"]);
    rules.push([/\s[\w:-]+(?=\s*=)/g, "attribute"]);
    rules.push([/"[^"]*"|'[^']*'/g, "string"]);
  }

  if (normalized === "css") {
    rules.push([/\/\*[\s\S]*?\*\//g, "comment"]);
    rules.push([/[.#]?[a-zA-Z_-][\w-]*(?=\s*\{)/g, "selector"]);
    rules.push([/[a-zA-Z-]+(?=\s*:)/g, "property"]);
    rules.push([/#[0-9a-fA-F]{3,8}\b/g, "number"]);
    rules.push([/(['"])(?:\\.|(?!\1).)*\1/g, "string"]);
  }

  if (normalized === "json") {
    rules.push([/"(?:\\.|[^"\\])*"(?=\s*:)/g, "property"]);
    rules.push([/"(?:\\.|[^"\\])*"/g, "string"]);
    rules.push([/\b(?:true|false|null)\b/g, "keyword"]);
  }

  if (normalized === "python") {
    rules.push([/#.*/g, "comment"]);
    rules.push([/(?:[rubf]|br|fr)?("""[\s\S]*?"""|'''[\s\S]*?'''|"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*')/gi, "string"]);
    rules.push([/\b(?:and|as|assert|async|await|break|class|continue|def|del|elif|else|except|False|finally|for|from|global|if|import|in|is|lambda|None|nonlocal|not|or|pass|raise|return|True|try|while|with|yield)\b/g, "keyword"]);
  }

  if (normalized === "shell") {
    rules.push([/#.*/g, "comment"]);
    rules.push([/"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'/g, "string"]);
    rules.push([/\b(?:if|then|else|elif|fi|for|while|do|done|case|esac|function|in|export|local|return|echo|cd|mkdir|rm|cp|mv|grep|sed|awk)\b/g, "keyword"]);
    rules.push([/\$[A-Za-z_][\w]*/g, "variable"]);
  }

  if (normalized === "sql") {
    rules.push([/--.*/g, "comment"]);
    rules.push([/\/\*[\s\S]*?\*\//g, "comment"]);
    rules.push([/'(?:''|[^'])*'/g, "string"]);
    rules.push([/\b(?:select|from|where|join|left|right|inner|outer|on|insert|into|update|delete|create|alter|drop|table|view|index|values|set|group|by|order|having|limit|offset|as|and|or|null|is|not|distinct|case|when|then|else|end)\b/gi, "keyword"]);
  }

  if (["yaml", "markdown"].includes(normalized)) {
    rules.push([/#.*/g, "comment"]);
    rules.push([/^(\s*)[-*+]\s/gm, "operator"]);
    rules.push([/^\s*[\w.-]+(?=\s*:)/gm, "property"]);
    rules.push([/"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'/g, "string"]);
  }

  if (cLike) {
    rules.push([/\/\/.*/g, "comment"]);
    rules.push([/\/\*[\s\S]*?\*\//g, "comment"]);
    rules.push([/`(?:\\.|[^`\\])*`|"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'/g, "string"]);
    rules.push([/\b(?:abstract|async|await|break|case|catch|class|const|continue|default|defer|do|else|enum|export|extends|false|final|finally|for|from|func|function|go|if|implements|import|in|interface|let|loop|match|mod|mut|new|null|package|private|protected|public|return|self|static|struct|super|switch|this|throw|trait|true|try|type|using|var|void|while|yield)\b/g, "keyword"]);
  }

  rules.push([/\b\d+(?:\.\d+)?(?:e[+-]?\d+)?\b/gi, "number"]);
  rules.push([/[{}()[\].,;:+\-*/%=&|!<>?~^]+/g, "operator"]);
  return rules;
}

function tokenizeCode(text, language) {
  const tokens = [];
  const occupied = new Uint8Array(text.length);
  for (const [regex, type] of createTokenRules(language)) {
    regex.lastIndex = 0;
    let match;
    while ((match = regex.exec(text))) {
      const value = match[0];
      if (!value) {
        regex.lastIndex += 1;
        continue;
      }
      const from = match.index;
      const to = from + value.length;
      let overlaps = false;
      for (let index = from; index < to; index += 1) {
        if (occupied[index]) {
          overlaps = true;
          break;
        }
      }
      if (overlaps) continue;
      occupied.fill(1, from, to);
      tokens.push({ from, to, type });
    }
  }
  return tokens.sort((a, b) => a.from - b.from || a.to - b.to);
}

function loadSettings() {
  try {
    return { ...DEFAULT_SETTINGS, ...JSON.parse(localStorage.getItem(SETTINGS_KEY) || "{}") };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

function saveSettings() {
  settings.startupBehavior = document.querySelector("input[name='startup-behavior']:checked")?.value || DEFAULT_SETTINGS.startupBehavior;
  settings.fontFamily = fontFamilySetting.value || DEFAULT_SETTINGS.fontFamily;
  settings.fontSize = Math.min(28, Math.max(12, Number(fontSizeSetting.value) || DEFAULT_SETTINGS.fontSize));
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
  applyEditorSettings();
}

function applyEditorSettings() {
  document.documentElement.style.setProperty("--content-font", settings.fontFamily);
  document.documentElement.style.setProperty("--content-font-size", `${settings.fontSize}px`);
}

function populateSettingsForm() {
  const behavior = document.querySelector(`input[name='startup-behavior'][value='${settings.startupBehavior}']`);
  if (behavior) behavior.checked = true;
  fontFamilySetting.value = settings.fontFamily;
  fontSizeSetting.value = settings.fontSize;
}

function openSettings() {
  populateSettingsForm();
  settingsModal.classList.add("open");
  settingsModal.setAttribute("aria-hidden", "false");
  fontSizeSetting.focus();
}

function closeSettings() {
  settingsModal.classList.remove("open");
  settingsModal.setAttribute("aria-hidden", "true");
}

function setupSidebarViews() {
  const existingChildren = [...explorer.children];
  const tabs = document.createElement("div");
  const filesTab = document.createElement("button");
  const outlineTab = document.createElement("button");
  const filesPanel = document.createElement("div");
  const outlinePanel = document.createElement("div");
  const outlineHeader = document.createElement("div");
  const outlineTitle = document.createElement("span");

  tabs.className = "sidebar-tabs";
  filesTab.type = "button";
  filesTab.className = "active";
  filesTab.dataset.sidebarView = "files";
  filesTab.textContent = "Files";
  outlineTab.type = "button";
  outlineTab.dataset.sidebarView = "outline";
  outlineTab.textContent = "Outline";

  filesPanel.className = "sidebar-panel active";
  filesPanel.dataset.sidebarPanel = "files";
  outlinePanel.className = "sidebar-panel";
  outlinePanel.dataset.sidebarPanel = "outline";
  outlinePanel.hidden = true;

  outlineHeader.className = "explorer-header";
  outlineTitle.textContent = "Outline";
  outlineTree = document.createElement("div");
  outlineTree.className = "outline-tree";
  outlineTree.id = "outline-tree";

  tabs.append(filesTab, outlineTab);
  filesPanel.append(...existingChildren);
  outlineHeader.append(outlineTitle);
  outlinePanel.append(outlineHeader, outlineTree);
  explorer.append(tabs, filesPanel, outlinePanel);

  tabs.addEventListener("click", (event) => {
    const button = event.target.closest("button[data-sidebar-view]");
    if (!button) return;
    const view = button.dataset.sidebarView;
    tabs.querySelectorAll("button").forEach((item) => item.classList.toggle("active", item === button));
    explorer.querySelectorAll(".sidebar-panel").forEach((panel) => {
      const active = panel.dataset.sidebarPanel === view;
      panel.classList.toggle("active", active);
      panel.hidden = !active;
    });
  });
}

function updateStats() {
  wordCount.textContent = `${getTextStats(markdown)} 字`;
  blockCount.textContent = `${editor.state.doc.childCount} 个段落`;
}

const CodeBlockWithLanguage = CodeBlock.extend({
  addNodeView() {
    return ({ node, getPos, editor: currentEditor }) => {
      let currentNode = node;
      const container = document.createElement("div");
      const pre = document.createElement("pre");
      const code = document.createElement("code");
      const controls = document.createElement("div");
      const select = document.createElement("select");

      container.className = "code-block-shell";
      pre.className = "code-block-pre";
      controls.className = "code-block-controls";
      select.className = "code-language-select";
      select.title = "Change code block language";
      select.setAttribute("aria-label", "Code block language");

      for (const language of CODE_LANGUAGES) {
        const option = document.createElement("option");
        option.value = language.value;
        option.textContent = language.label;
        select.append(option);
      }

      const syncLanguage = () => {
        const language = currentNode.attrs.language || "";
        const normalizedLanguage = normalizeLanguage(language);
        select.value = CODE_LANGUAGES.some((item) => item.value === normalizedLanguage) ? normalizedLanguage : "";
        code.className = normalizedLanguage ? `language-${normalizedLanguage}` : "";
      };

      select.addEventListener("change", () => {
        const pos = getPos();
        if (typeof pos !== "number") return;
        currentEditor.view.dispatch(
          currentEditor.state.tr.setNodeMarkup(pos, undefined, {
            ...currentNode.attrs,
            language: select.value || null,
          }),
        );
      });

      controls.append(select);
      pre.append(code);
      container.append(controls, pre);
      syncLanguage();

      return {
        dom: container,
        contentDOM: code,
        update(updatedNode) {
          if (updatedNode.type.name !== "codeBlock") return false;
          currentNode = updatedNode;
          syncLanguage();
          return true;
        },
        stopEvent(event) {
          return controls.contains(event.target);
        },
        ignoreMutation(mutation) {
          return controls.contains(mutation.target);
        },
      };
    };
  },
});

const SyntaxHighlight = Extension.create({
  name: "syntaxHighlight",
  addProseMirrorPlugins() {
    return [
      new Plugin({
        props: {
          decorations(state) {
            const decorations = [];
            state.doc.descendants((node, pos) => {
              if (node.type.name !== "codeBlock") return;
              const text = node.textContent;
              const language = normalizeLanguage(node.attrs.language || "");
              for (const token of tokenizeCode(text, language)) {
                decorations.push(
                  Decoration.inline(pos + 1 + token.from, pos + 1 + token.to, {
                    class: tokenClass(token.type),
                  }),
                );
              }
            });
            return DecorationSet.create(state.doc, decorations);
          },
        },
      }),
    ];
  },
});

const AppShortcuts = Extension.create({
  name: "appShortcuts",
  addKeyboardShortcuts() {
    const shortcuts = {};
    for (const [action, shortcut] of Object.entries(SHORTCUTS)) {
      shortcuts[tiptapShortcut(shortcut)] = () => {
        actions[action]?.();
        return true;
      };
    }
    for (const [mode, shortcut] of Object.entries(MODE_SHORTCUTS)) {
      shortcuts[tiptapShortcut(shortcut)] = () => {
        setEditorMode(mode);
        return true;
      };
    }
    return shortcuts;
  },
});

const editor = new Editor({
  element: document.querySelector("#visual-editor"),
  extensions: [
    StarterKit.configure({
      link: { openOnClick: false },
      codeBlock: false,
    }),
    AppShortcuts,
    SyntaxHighlight,
    CodeBlockWithLanguage,
    TableKit.configure({
      table: { resizable: true },
    }),
    TaskList,
    TaskItem.configure({ nested: true }),
    Markdown.configure({
      markedOptions: { gfm: true },
    }),
  ],
  content: "",
  contentType: "markdown",
  editorProps: {
    attributes: {
      class: "tiptap-editor",
      spellcheck: "false",
    },
  },
  onUpdate: ({ editor: currentEditor }) => {
    if (applyingContent) return;
    markdown = currentEditor.getMarkdown();
    sourceEditor.value = markdown;
    updateStats();
    updateOutline();
    markDocumentChanged();
  },
  onSelectionUpdate: updateToolbarState,
});

function setMarkdown(content) {
  applyingContent = true;
  markdown = content;
  editor.commands.setContent(content || "", { contentType: "markdown" });
  sourceEditor.value = markdown;
  applyingContent = false;
  updateStats();
  updateToolbarState();
  updateOutline();
}

function updateToolbarState() {
  const active = {
    heading: editor.isActive("heading"),
    bold: editor.isActive("bold"),
    italic: editor.isActive("italic"),
    strike: editor.isActive("strike"),
    quote: editor.isActive("blockquote"),
    code: editor.isActive("code"),
    link: editor.isActive("link"),
    bullet: editor.isActive("bulletList"),
    number: editor.isActive("orderedList"),
    task: editor.isActive("taskList"),
    table: editor.isActive("table"),
    "block-code": editor.isActive("codeBlock"),
    "clear-format": false,
  };
  document.querySelectorAll(".format-tools button[data-action]").forEach((button) => {
    button.classList.toggle("active", Boolean(active[button.dataset.action]));
  });
}

function getSourceHeadings(text) {
  const headings = [];
  let offset = 0;
  for (const line of text.split("\n")) {
    const match = /^(#{1,6})\s+(.+?)\s*#*\s*$/.exec(line);
    if (match) {
      headings.push({
        level: match[1].length,
        text: match[2].trim(),
        offset,
        line: headings.length,
      });
    }
    offset += line.length + 1;
  }
  return headings;
}

function getEditorHeadings() {
  const headings = [];
  editor.state.doc.descendants((node, pos) => {
    if (node.type.name !== "heading") return;
    headings.push({
      level: node.attrs.level || 1,
      text: node.textContent.trim() || "Untitled",
      pos,
    });
  });
  return headings;
}

function updateOutline() {
  if (!outlineTree) return;
  const sourceMode = editorSurface.classList.contains("source-mode");
  const visualHeadings = getEditorHeadings();
  const sourceHeadings = getSourceHeadings(sourceMode ? sourceEditor.value : markdown);
  const headings = sourceMode ? sourceHeadings : (visualHeadings.length ? visualHeadings : sourceHeadings);

  outlineTree.innerHTML = "";
  if (!headings.length) {
    const empty = document.createElement("div");
    empty.className = "outline-empty";
    empty.textContent = "No headings";
    outlineTree.append(empty);
    return;
  }

  headings.forEach((heading, index) => {
    const sourceHeading = sourceHeadings[index] || {};
    const button = document.createElement("button");
    button.type = "button";
    button.className = "outline-item";
    button.dataset.pos = heading.pos ?? "";
    button.dataset.offset = sourceHeading.offset ?? heading.offset ?? 0;
    button.style.setProperty("--outline-depth", Math.max(0, (heading.level || 1) - 1));
    button.textContent = heading.text || sourceHeading.text || "Untitled";
    outlineTree.append(button);
  });
}

function scrollVisualToPos(pos) {
  if (!Number.isFinite(pos)) return;
  editor.commands.setTextSelection(Math.min(pos + 1, editor.state.doc.content.size));
  editor.view.dom.focus({ preventScroll: true });
  const coords = editor.view.coordsAtPos(Math.min(pos + 1, editor.state.doc.content.size));
  const paneRect = editorPane.getBoundingClientRect();
  const nextScrollTop = editorPane.scrollTop + coords.top - paneRect.top - 28;
  editorPane.scrollTop = Math.max(0, nextScrollTop);
  sharedScrollTop = editorPane.scrollTop;
}

function scrollSourceToOffset(offset) {
  const safeOffset = Math.max(0, Math.min(sourceEditor.value.length, offset));
  const line = sourceEditor.value.slice(0, safeOffset).split("\n").length - 1;
  const lineHeight = Number.parseFloat(getComputedStyle(sourceEditor).lineHeight) || 24;
  sourceEditor.focus({ preventScroll: true });
  sourceEditor.setSelectionRange(safeOffset, safeOffset);
  sourceEditor.scrollTop = Math.max(0, line * lineHeight - 28);
  sharedScrollTop = sourceEditor.scrollTop;
}

function jumpToOutlineItem(button) {
  if (editorSurface.classList.contains("source-mode")) {
    scrollSourceToOffset(Number(button.dataset.offset || 0));
  } else {
    scrollVisualToPos(Number(button.dataset.pos));
  }
}

function toggleSingleCodeBlock() {
  const { state, view } = editor;
  const { from, to, empty } = state.selection;
  if (empty || editor.isActive("codeBlock")) {
    return editor.commands.toggleCodeBlock();
  }

  const selectedText = state.doc.textBetween(from, to, "\n");
  const codeBlock = state.schema.nodes.codeBlock.create(
    null,
    selectedText ? state.schema.text(selectedText) : null,
  );
  const transaction = state.tr.replaceRangeWith(from, to, codeBlock).scrollIntoView();
  view.dispatch(transaction);
  view.focus();
  return true;
}

function clearFormatting() {
  editor.chain().focus().unsetAllMarks().clearNodes().run();
}

const actions = {
  heading: () => editor.commands.toggleHeading({ level: 2 }),
  bold: () => editor.commands.toggleBold(),
  italic: () => editor.commands.toggleItalic(),
  strike: () => editor.commands.toggleStrike(),
  quote: () => editor.commands.toggleBlockquote(),
  code: () => editor.commands.toggleCode(),
  link: () => {
    const previous = editor.getAttributes("link").href || "";
    const href = window.prompt("链接地址", previous);
    if (href === null) return;
    if (!href) editor.commands.unsetLink();
    else editor.chain().extendMarkRange("link").setLink({ href }).run();
  },
  bullet: () => editor.commands.toggleBulletList(),
  number: () => editor.commands.toggleOrderedList(),
  task: () => editor.commands.toggleTaskList(),
  table: () => editor.commands.insertTable({ rows: 3, cols: 3, withHeaderRow: true }),
  "block-code": toggleSingleCodeBlock,
  "clear-format": clearFormatting,
};

function platformShortcut(shortcut) {
  const isMac = /Mac|iPhone|iPad|iPod/.test(navigator.platform);
  return shortcut.replace("Mod", isMac ? "Cmd" : "Ctrl");
}

function tiptapShortcut(shortcut) {
  const parts = shortcut.split("+");
  parts[parts.length - 1] = parts.at(-1).toLowerCase();
  return parts.join("-");
}

function shortcutMatches(event, shortcut) {
  const parts = shortcut.toLowerCase().split("+");
  const key = parts.at(-1);
  const eventKey = event.key.toLowerCase();
  const eventCode = event.code.toLowerCase().replace(/^key/, "").replace(/^digit/, "");
  const needsMod = parts.includes("mod");
  const needsAlt = parts.includes("alt");
  const needsShift = parts.includes("shift");
  const hasMod = event.ctrlKey || event.metaKey;

  return (!needsMod || hasMod)
    && event.altKey === needsAlt
    && event.shiftKey === needsShift
    && (eventKey === key || eventCode === key);
}

function addShortcutTitles() {
  document.querySelectorAll(".format-tools button[data-action]").forEach((button) => {
    const shortcut = SHORTCUTS[button.dataset.action];
    if (!shortcut) return;
    const label = button.title || button.textContent.trim();
    button.title = `${label} (${platformShortcut(shortcut)})`;
  });
  document.querySelectorAll(".mode-switcher button[data-mode]").forEach((button) => {
    const shortcut = MODE_SHORTCUTS[button.dataset.mode];
    if (!shortcut) return;
    const label = button.title || button.textContent.trim();
    button.title = `${label} (${platformShortcut(shortcut)})`;
  });
}

function captureEditorViewport() {
  return editorSurface.classList.contains("source-mode") ? sourceEditor.scrollTop : editorPane.scrollTop;
}

function restoreEditorViewport(scrollTop) {
  requestAnimationFrame(() => {
    editorPane.scrollTop = scrollTop;
    sourceEditor.scrollTop = scrollTop;
    requestAnimationFrame(() => {
      editorPane.scrollTop = scrollTop;
      sourceEditor.scrollTop = scrollTop;
    });
  });
}

function setEditorMode(mode) {
  const sourceMode = mode === "source";
  if (editorSurface.classList.contains("source-mode") === sourceMode) return;

  sharedScrollTop = captureEditorViewport();

  if (sourceMode) {
    markdown = editor.getMarkdown();
    sourceEditor.value = markdown;
  } else {
    setMarkdown(sourceEditor.value);
  }

  editorSurface.classList.toggle("source-mode", sourceMode);
  document.querySelectorAll(".mode-switcher button").forEach((item) => {
    item.classList.toggle("active", item.dataset.mode === mode);
  });
  editorState.textContent = sourceMode ? "Markdown Source Mode" : "WYSIWYG Mode";

  if (sourceMode) {
    sourceEditor.focus({ preventScroll: true });
  } else {
    editor.view.dom.focus({ preventScroll: true });
  }
  updateOutline();
  restoreEditorViewport(sharedScrollTop);
}

function handleAppShortcut(event) {
  if (event.defaultPrevented) return false;
  if (settingsModal.classList.contains("open")) return false;

  for (const [mode, shortcut] of Object.entries(MODE_SHORTCUTS)) {
    if (!shortcutMatches(event, shortcut)) continue;
    event.preventDefault();
    setEditorMode(mode);
    return true;
  }

  if (editorSurface.classList.contains("source-mode")) return false;
  for (const [action, shortcut] of Object.entries(SHORTCUTS)) {
    if (!shortcutMatches(event, shortcut)) continue;
    event.preventDefault();
    actions[action]?.();
    return true;
  }

  return false;
}

document.querySelector(".format-tools").addEventListener("mousedown", (event) => event.preventDefault());
document.querySelector(".format-tools").addEventListener("click", (event) => {
  const action = event.target.closest("button")?.dataset.action;
  if (actions[action]) actions[action]();
});

setupSidebarViews();
outlineTree.addEventListener("click", (event) => {
  const button = event.target.closest(".outline-item");
  if (button) jumpToOutlineItem(button);
});

document.querySelector(".mode-switcher").addEventListener("click", (event) => {
  const button = event.target.closest("button[data-mode]");
  if (!button) return;
  setEditorMode(button.dataset.mode);
  return;
  const sourceMode = button.dataset.mode === "source";
  if (sourceMode) {
    markdown = editor.getMarkdown();
    sourceEditor.value = markdown;
  } else {
    setMarkdown(sourceEditor.value);
    editor.commands.focus();
  }
  editorSurface.classList.toggle("source-mode", sourceMode);
  document.querySelectorAll(".mode-switcher button").forEach((item) => item.classList.toggle("active", item === button));
  editorState.textContent = sourceMode ? "Markdown 源码模式" : "所见即所得模式";
  if (sourceMode) sourceEditor.focus();
});

document.addEventListener("keydown", (event) => {
  if (shortcutMatches(event, "Mod+S")) {
    event.preventDefault();
    saveCurrentDocument();
    return;
  }
  handleAppShortcut(event);
});
addShortcutTitles();

sourceEditor.addEventListener("input", () => {
  markdown = sourceEditor.value;
  wordCount.textContent = `${getTextStats(markdown)} 字`;
  updateOutline();
  markDocumentChanged();
});

sourceEditor.addEventListener("keydown", (event) => {
  if (event.key === "Tab") {
    event.preventDefault();
    sourceEditor.setRangeText("  ", sourceEditor.selectionStart, sourceEditor.selectionEnd, "end");
    sourceEditor.dispatchEvent(new Event("input"));
  }
});

function isEditableFile(name) {
  return /\.(?:md|markdown|txt)$/i.test(name);
}

function fileDisplayName(name) {
  return name.replace(/\.(?:md|markdown|txt)$/i, "");
}

function setActiveTreeFile() {
  document.querySelectorAll(".tree-file").forEach((button) => {
    button.classList.toggle("active", button.dataset.path === currentFilePath);
  });
}

async function readDirectory(handle, parentPath = "") {
  const entries = [];
  for await (const [name, childHandle] of handle.entries()) {
    const path = parentPath ? `${parentPath}/${name}` : name;
    if (childHandle.kind === "directory") {
      entries.push({ kind: "directory", name, path, children: await readDirectory(childHandle, path) });
    } else {
      fileHandles.set(path, childHandle);
      entries.push({ kind: "file", name, path, editable: isEditableFile(name) });
    }
  }
  return entries.sort((a, b) => a.kind !== b.kind ? (a.kind === "directory" ? -1 : 1) : a.name.localeCompare(b.name, "zh-CN"));
}

function createTreeNodes(entries, depth = 0) {
  const fragment = document.createDocumentFragment();
  for (const entry of entries) {
    if (entry.kind === "directory") {
      const details = document.createElement("details");
      details.className = "tree-directory";
      details.open = depth < 1;
      const summary = document.createElement("summary");
      summary.textContent = entry.name;
      summary.style.paddingLeft = `${8 + depth * 5}px`;
      const children = document.createElement("div");
      children.className = "tree-children";
      children.append(createTreeNodes(entry.children, depth + 1));
      details.append(summary, children);
      fragment.append(details);
      continue;
    }
    const button = document.createElement("button");
    button.type = "button";
    button.className = `tree-file${entry.editable ? "" : " unsupported"}`;
    button.dataset.path = entry.path;
    button.title = entry.path;
    const label = document.createElement("span");
    label.textContent = entry.name;
    button.append(label);
    if (entry.editable) button.addEventListener("click", () => openTreeFile(entry.path));
    fragment.append(button);
  }
  return fragment;
}

async function refreshFileTree() {
  if (!folderHandle && !desktopFolderPath) return;
  refreshTreeButton.textContent = "…";
  fileHandles.clear();
  try {
    const entries = runningInTauri()
      ? await invokeDesktop("list_directory", { path: desktopFolderPath })
      : await readDirectory(folderHandle);
    fileTree.innerHTML = "";
    fileTree.append(createTreeNodes(entries));
    setActiveTreeFile();
  } catch (error) {
    fileTree.textContent = `读取文件夹失败：${error.message || error}`;
  } finally {
    refreshTreeButton.textContent = "↻";
  }
}

async function openDesktopFolderPath(path) {
  if (!runningInTauri() || !path) return false;
  desktopFolderPath = path;
  folderHandle = null;
  folderName.textContent = path.split(/[\\/]/).at(-1);
  currentFileHandle = null;
  currentFilePath = "";
  await refreshFileTree();
  saveState.textContent = "已恢复上次文件夹";
  return true;
}

async function openDroppedPaths(paths) {
  if (!runningInTauri() || !paths?.length) return;

  for (const path of paths) {
    try {
      if (await invokeDesktop("path_kind", { path }) === "directory") {
        localStorage.setItem(LAST_FOLDER_KEY, path);
        await openDesktopFolderPath(path);
        return;
      }
    } catch (error) {
      console.error(error);
    }
  }

  const filePath = paths.find((path) => isEditableFile(path));
  if (filePath) {
    await openTreeFile(filePath);
    return;
  }

  saveState.textContent = "未找到可打开的 Markdown 或文本文件";
}

async function setupNativeDragDrop() {
  if (!runningInTauri()) return;
  const webviewApi = globalThis.__TAURI__?.webview;
  const getCurrentWebview = webviewApi?.getCurrentWebview || webviewApi?.getCurrent;
  if (!getCurrentWebview) return;

  const currentWebview = getCurrentWebview();
  await currentWebview.onDragDropEvent((event) => {
    const payload = event.payload;
    if (payload?.type === "over") {
      saveState.textContent = "松开以打开文件或文件夹";
    } else if (payload?.type === "drop") {
      openDroppedPaths(payload.paths);
    } else if (payload?.type === "leave" || payload?.type === "cancel") {
      saveState.textContent = currentFilePath ? "已写入文件" : "未保存";
    }
  });
}

async function bindUnsavedDocumentToPath() {
  const defaultName = `${sanitizeFileName(documentName.value || "未命名文档") || "未命名文档"}.md`;

  if (runningInTauri()) {
    const path = await invokeDesktop("choose_new_file_path", { defaultName });
    if (!path) return false;
    currentFileHandle = null;
    currentFilePath = path;
    localStorage.setItem(LAST_FILE_KEY, path);
    const parentPath = parentDirectoryFromPath(path);
    if (parentPath) {
      desktopFolderPath = parentPath;
      localStorage.setItem(LAST_FOLDER_KEY, parentPath);
      folderHandle = null;
      folderName.textContent = parentPath.split(/[\\/]/).at(-1);
    }
    documentName.readOnly = true;
    documentName.title = path;
    documentName.value = fileDisplayName(path.split(/[\\/]/).at(-1));
    updateDocumentTitle();
    return true;
  }

  if (typeof globalThis.showSaveFilePicker !== "function") return false;
  const handle = await globalThis.showSaveFilePicker({
    suggestedName: defaultName,
    types: [{
      description: "Markdown",
      accept: { "text/markdown": [".md", ".markdown", ".txt"] },
    }],
  });
  currentFileHandle = handle;
  currentFilePath = "";
  localStorage.removeItem(LAST_FILE_KEY);
  documentName.readOnly = true;
  documentName.title = handle.name;
  documentName.value = fileDisplayName(handle.name);
  setActiveTreeFile();
  updateDocumentTitle();
  return true;
}

async function saveCurrentDocument() {
  clearTimeout(saveTimer);
  saveState.textContent = "正在保存…";
  if (!editorSurface.classList.contains("source-mode")) markdown = editor.getMarkdown();
  localStorage.setItem(STORAGE_KEY, JSON.stringify({ name: documentName.value.trim() || "未命名文档", content: markdown }));
  if (!currentFileHandle && !currentFilePath) {
    try {
      const bound = await bindUnsavedDocumentToPath();
      if (!bound) {
        saveState.textContent = "已取消保存";
        return;
      }
    } catch (error) {
      if (error.name !== "AbortError") {
        saveState.textContent = `保存路径选择失败：${error.message || error}`;
        console.error(error);
      }
      return;
    }
  }
  try {
    if (runningInTauri()) {
      await invokeDesktop("write_text_file", { path: currentFilePath, content: markdown });
    } else {
      const writable = await currentFileHandle.createWritable();
      await writable.write(markdown);
      await writable.close();
    }
    setActiveTreeFile();
    saveState.textContent = "已写入文件";
  } catch (error) {
    saveState.textContent = "文件写入失败";
    console.error(error);
  }
}

function markDocumentChanged() {
  clearTimeout(saveTimer);
  saveState.textContent = "未保存";
}

async function openTreeFile(path) {
  if (path === currentFilePath) return;
  try {
    let content;
    let fileName;
    if (runningInTauri()) {
      content = await invokeDesktop("read_text_file", { path });
      fileName = path.split(/[\\/]/).at(-1);
      currentFileHandle = null;
    } else {
      const handle = fileHandles.get(path);
      if (!handle) return;
      const file = await handle.getFile();
      content = await file.text();
      fileName = file.name;
      currentFileHandle = handle;
    }
    currentFilePath = path;
    localStorage.setItem(LAST_FILE_KEY, path);
    documentName.value = fileDisplayName(fileName);
    documentName.readOnly = true;
    documentName.title = path;
    setMarkdown(content);
    setActiveTreeFile();
    updateDocumentTitle();
    saveState.textContent = "已打开";
  } catch (error) {
    saveState.textContent = "文件打开失败";
    console.error(error);
  }
}

async function openSingleFile() {
  if (!runningInTauri()) {
    fileInput.click();
    return;
  }
  const path = await invokeDesktop("choose_file");
  if (!path) return;
  await openTreeFile(path);
}

async function openFolder() {
  if (!runningInTauri() && typeof globalThis.showDirectoryPicker !== "function") {
    saveState.textContent = "当前浏览器不支持打开文件夹";
    return;
  }
  try {
    if (runningInTauri()) {
      const selectedPath = await invokeDesktop("choose_folder");
      if (!selectedPath) return;
      desktopFolderPath = selectedPath;
      localStorage.setItem(LAST_FOLDER_KEY, selectedPath);
      folderHandle = null;
      folderName.textContent = selectedPath.split(/[\\/]/).at(-1);
    } else {
      folderHandle = await globalThis.showDirectoryPicker({ mode: "readwrite" });
      desktopFolderPath = "";
      folderName.textContent = folderHandle.name;
    }
    currentFileHandle = null;
    currentFilePath = "";
    await refreshFileTree();
    saveState.textContent = "文件夹已打开";
  } catch (error) {
    if (error.name !== "AbortError") {
      saveState.textContent = "文件夹打开失败";
      console.error(error);
    }
  }
}

documentName.addEventListener("input", () => {
  updateDocumentTitle();
  markDocumentChanged();
});
saveFileButton.addEventListener("click", saveCurrentDocument);
openFolderButton.addEventListener("click", openFolder);
settingsButton.addEventListener("click", openSettings);
settingsCloseButton.addEventListener("click", closeSettings);
settingsSaveButton.addEventListener("click", () => {
  saveSettings();
  closeSettings();
});
settingsResetButton.addEventListener("click", () => {
  settings = { ...DEFAULT_SETTINGS };
  populateSettingsForm();
  saveSettings();
});
settingsModal.addEventListener("click", (event) => {
  if (event.target.matches("[data-close-settings]")) closeSettings();
});
settingsModal.addEventListener("keydown", (event) => {
  if (event.key === "Escape") closeSettings();
});
fontFamilySetting.addEventListener("change", () => {
  saveSettings();
});
fontSizeSetting.addEventListener("input", () => {
  saveSettings();
});
document.querySelectorAll("input[name='startup-behavior']").forEach((input) => {
  input.addEventListener("change", saveSettings);
});
emptyTreeAction.addEventListener("click", openFolder);
refreshTreeButton.addEventListener("click", refreshFileTree);
document.querySelector("#open-button").addEventListener("click", openSingleFile);
fileInput.addEventListener("change", async () => {
  const file = fileInput.files[0];
  if (!file) return;
  currentFileHandle = null;
  currentFilePath = "";
  documentName.readOnly = false;
  documentName.title = "";
  documentName.value = fileDisplayName(file.name);
  setMarkdown(await file.text());
  setActiveTreeFile();
  updateDocumentTitle();
  saveState.textContent = "未保存";
  fileInput.value = "";
});

function applyTheme(theme) {
  document.documentElement.dataset.theme = theme;
  themeButton.textContent = theme === "dark" ? "☀" : "☾";
  localStorage.setItem(THEME_KEY, theme);
}
themeButton.addEventListener("click", () => applyTheme(document.documentElement.dataset.theme === "dark" ? "light" : "dark"));

async function bootstrap() {
  applyEditorSettings();
  populateSettingsForm();
  const savedDocument = JSON.parse(localStorage.getItem(STORAGE_KEY) || "null");
  const lastFolder = localStorage.getItem(LAST_FOLDER_KEY);
  const lastFile = localStorage.getItem(LAST_FILE_KEY);
  const startupPaths = runningInTauri() ? await invokeDesktop("startup_paths") : [];

  if (startupPaths.length) {
    documentName.value = savedDocument?.name || "欢迎使用墨笺";
    setMarkdown(savedDocument?.content || starterDocument);
    await openDroppedPaths(startupPaths);
    updateDocumentTitle();
    applyTheme(localStorage.getItem(THEME_KEY) || "light");
    setupNativeDragDrop();
    return;
  }

  if (settings.startupBehavior === "new-file") {
    documentName.value = "未命名文档";
    setMarkdown("");
    saveState.textContent = "新文件";
  } else if (settings.startupBehavior === "last-folder" && runningInTauri() && lastFolder) {
    documentName.value = savedDocument?.name || "欢迎使用墨笺";
    setMarkdown(savedDocument?.content || starterDocument);
    await openDesktopFolderPath(lastFolder);
  } else if (settings.startupBehavior === "last-file" && runningInTauri() && lastFile) {
    await openTreeFile(lastFile);
  } else {
    documentName.value = savedDocument?.name || "欢迎使用墨笺";
    setMarkdown(savedDocument?.content || starterDocument);
  }

  updateDocumentTitle();

  if (!runningInTauri() && typeof globalThis.showDirectoryPicker !== "function") {
    openFolderButton.title = "请通过 localhost 或 HTTPS 使用支持 File System Access API 的 Chromium 浏览器";
  }
  applyTheme(localStorage.getItem(THEME_KEY) || "light");
  setupNativeDragDrop();
}

if (!runningInTauri() && typeof globalThis.showDirectoryPicker !== "function") {
  openFolderButton.title = "请通过 localhost 或 HTTPS 使用支持 File System Access API 的 Chromium 浏览器";
}
bootstrap();
