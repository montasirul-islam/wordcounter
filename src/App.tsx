import { Bold, Code, Italic, Save, Underline } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { Extension } from "@tiptap/core";
import StarterKit from "@tiptap/starter-kit";
import UnderlineExtension from "@tiptap/extension-underline";
import { EditorContent, useEditor, type Editor } from "@tiptap/react";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "./components/ui/select";
import { Button } from "./components/ui/button";
import { ToggleGroup, ToggleGroupItem } from "./components/ui/toggle-group";

import { Plugin } from "prosemirror-state";
import { Decoration, DecorationSet } from "prosemirror-view";
import type { Node } from "prosemirror-model";

/* ---------------------------------- UI ---------------------------------- */

function Stat({
  label,
  value,
  dot,
}: {
  label: string;
  value: number | string;
  dot?: string;
}) {
  return (
    <div className="flex items-center justify-between gap-4 text-sm">
      <div className="flex min-w-0 items-center gap-2">
        {dot && <span className={`size-2 rounded-full ${dot}`} />}
        <span className="truncate text-muted-foreground">{label}</span>
      </div>
      <span className="shrink-0 font-medium">{value}</span>
    </div>
  );
}

/* -------------------------------- Toolbar -------------------------------- */

type BlockType =
  | "Paragraph"
  | "H1"
  | "H2"
  | "H3"
  | "Blockquote"
  | "Bullet List"
  | "Numbered List";

type MarkType = "Bold" | "Italic" | "Underline" | "Code";

function Toolbar({ editor }: { editor: Editor | null }) {
  const setBlock = useCallback(
    (value: BlockType | null) => {
      if (!editor || !value) return;

      const chain = editor.chain().focus();

      const map: Record<BlockType, () => void> = {
        Paragraph: () => chain.setParagraph().run(),
        H1: () => chain.toggleHeading({ level: 1 }).run(),
        H2: () => chain.toggleHeading({ level: 2 }).run(),
        H3: () => chain.toggleHeading({ level: 3 }).run(),
        Blockquote: () => chain.toggleBlockquote().run(),
        "Bullet List": () => chain.toggleBulletList().run(),
        "Numbered List": () => chain.toggleOrderedList().run(),
      };

      map[value]();
    },
    [editor],
  );

  const toggleMark = useCallback(
    (mark: MarkType) => {
      if (!editor) return;

      const chain = editor.chain().focus();

      switch (mark) {
        case "Bold":
          chain.toggleBold().run();
          break;
        case "Italic":
          chain.toggleItalic().run();
          break;
        case "Underline":
          chain.toggleUnderline().run();
          break;
        case "Code":
          chain.toggleCode().run();
          break;
      }
    },
    [editor],
  );

  if (!editor) return null;

  const currentBlock: BlockType = (() => {
    if (editor.isActive("heading", { level: 1 })) return "H1";
    if (editor.isActive("heading", { level: 2 })) return "H2";
    if (editor.isActive("heading", { level: 3 })) return "H3";
    if (editor.isActive("bulletList")) return "Bullet List";
    if (editor.isActive("orderedList")) return "Numbered List";
    if (editor.isActive("blockquote")) return "Blockquote";
    return "Paragraph";
  })();

  return (
    <div className="mb-4 flex flex-wrap gap-4 border-b pb-4">
      <Select value={currentBlock} onValueChange={setBlock}>
        <SelectTrigger className="w-45">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {[
            "Paragraph",
            "H1",
            "H2",
            "H3",
            "Blockquote",
            "Bullet List",
            "Numbered List",
          ].map((option) => (
            <SelectItem key={option} value={option}>
              {option}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <ToggleGroup multiple variant="outline">
        {(["Bold", "Italic", "Underline", "Code"] as const).map((mark) => (
          <ToggleGroupItem
            key={mark}
            value={mark}
            aria-label={mark}
            onClick={() => toggleMark(mark)}
          >
            {mark === "Bold" && <Bold />}
            {mark === "Italic" && <Italic />}
            {mark === "Underline" && <Underline />}
            {mark === "Code" && <Code />}
          </ToggleGroupItem>
        ))}
      </ToggleGroup>
    </div>
  );
}

/* ------------------------------ Constants -------------------------------- */

const STORAGE_KEY = "draft";
const READING_WPM = 238;
const SPEAKING_WPM = 158;

const STOP_WORDS = new Set([
  "the",
  "and",
  "a",
  "to",
  "of",
  "in",
  "is",
  "it",
  "that",
  "on",
  "for",
  "with",
  "as",
  "at",
  "this",
  "by",
  "an",
  "be",
  "are",
  "from",
  "or",
  "was",
  "were",
  "but",
  "not",
]);

/* ------------------------------ Helpers ---------------------------------- */

function formatTime(words: number, wpm: number) {
  if (words === 0) return "0 min";
  const seconds = Math.round((words / wpm) * 60);
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  if (m === 0) return `${s} sec`;
  if (s === 0) return `${m} min`;
  return `${m} min ${s} sec`;
}

function countSyllables(word: string) {
  const w = word.toLowerCase().replace(/[^a-z]/g, "");
  if (!w) return 0;
  if (w.length <= 3) return 1;
  const vowels = w.match(/[aeiouy]{1,2}/g);
  let count = vowels?.length ?? 0;
  if (w.endsWith("e")) count -= 1;
  if (w.endsWith("le")) count += 1;
  return Math.max(1, count);
}

function ordinal(n: number) {
  const suffixes = ["th", "st", "nd", "rd"];
  const v = n % 100;
  return `${n}${suffixes[(v - 20) % 10] || suffixes[v] || suffixes[0]}`;
}

/* -------------------------------- Heatmap ------------------------------------ */

type SentenceHeat = {
  from: number;
  to: number;
  level: "warn" | "danger";
};

function analyzeSentence(sentence: string) {
  const words = sentence.trim().split(/\s+/);
  const wordCount = words.length;

  const syllables = words.reduce((sum, w) => sum + countSyllables(w), 0);

  const avgSyllables = syllables / Math.max(wordCount, 1);
  const punctuation = (sentence.match(/[,;:—–]/g) ?? []).length;

  const score = wordCount * 0.5 + avgSyllables * 10 + punctuation * 2;

  if (score >= 35) return "danger";
  if (score >= 25) return "warn";
  return null;
}

function getSentenceHeatmap(doc: Node): SentenceHeat[] {
  const results: SentenceHeat[] = [];

  doc.descendants((node: Node, pos: number) => {
    if (!node.isTextblock || !node.textContent) return;

    const text = node.textContent;
    let offset = 0;

    const parts = text.match(/[^.!?]+[.!?]*/g);
    if (!parts) return;

    for (const part of parts) {
      const trimmed = part.trim();
      if (!trimmed) {
        offset += part.length;
        continue;
      }

      const level = analyzeSentence(trimmed);
      if (!level) {
        offset += part.length;
        continue;
      }

      const from = pos + 1 + offset;
      const to = from + trimmed.length;

      results.push({ from, to, level });
      offset += part.length;
    }
  });

  return results;
}

export const SentenceHeatmapExtension = Extension.create({
  name: "sentenceHeatmap",

  addProseMirrorPlugins() {
    return [
      new Plugin({
        props: {
          decorations(state) {
            const sentences = getSentenceHeatmap(state.doc);
            if (!sentences.length) return null;

            const decorations = sentences.map((s) =>
              Decoration.inline(s.from, s.to, {
                class: s.level === "danger" ? "heatmap-red" : "heatmap-orange",
              }),
            );

            return DecorationSet.create(state.doc, decorations);
          },
        },
      }),
    ];
  },
});

/* -------------------------------- App ------------------------------------ */

export function App() {
  const autosaveRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [textSnapshot, setTextSnapshot] = useState("");
  const [selectionText, setSelectionText] = useState("");

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: { levels: [1, 2, 3] },
        codeBlock: false,
        horizontalRule: false,
        hardBreak: false,
        strike: false,
      }),
      UnderlineExtension,
      SentenceHeatmapExtension,
    ],
    editorProps: {
      attributes: {
        class:
          "min-h-[400px] outline-none text-base [&_p]:my-1 [&_p]:leading-7",
      },
    },
    onUpdate({ editor }) {
      setTextSnapshot(editor.getText());
    },
    onSelectionUpdate({ editor }) {
      const { from, to } = editor.state.selection;

      if (from === to) {
        setSelectionText("");
        return;
      }

      setSelectionText(editor.state.doc.textBetween(from, to, " "));
    },
  });

  /* Restore */
  useEffect(() => {
    if (!editor) return;
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) editor.commands.setContent(saved);
  }, [editor]);

  /* Autosave */
  // biome-ignore lint/correctness/useExhaustiveDependencies: Needed
  useEffect(() => {
    if (!editor) return;

    if (autosaveRef.current) {
      clearTimeout(autosaveRef.current);
    }

    autosaveRef.current = setTimeout(() => {
      localStorage.setItem(STORAGE_KEY, editor.getHTML());
    }, 500);
  }, [editor, textSnapshot]);

  /* Stats */
  const stats = useMemo(() => {
    const activeText = selectionText || textSnapshot;
    const trimmed = activeText.trim();

    const words = trimmed ? trimmed.split(/\s+/) : [];
    const sentences = trimmed ? trimmed.split(/[.!?]+/).filter(Boolean) : [];

    const syllables = words.reduce(
      (sum, word) => sum + countSyllables(word),
      0,
    );

    const grade =
      words.length && sentences.length
        ? 0.39 * (words.length / sentences.length) +
          11.8 * (syllables / words.length) -
          15.59
        : 0;

    const freq: Record<string, number> = {};
    for (const word of words) {
      const key = word.toLowerCase().replace(/[^a-z0-9]/g, "");
      if (!key || STOP_WORDS.has(key)) continue;
      freq[key] = (freq[key] ?? 0) + 1;
    }

    const paragraphs = (() => {
      if (!editor) return 0;

      const { from, to } = editor.state.selection;

      // No selection → full document
      if (from === to) {
        return editor.state.doc.childCount;
      }

      let count = 0;
      editor.state.doc.nodesBetween(from, to, (node) => {
        if (node.isBlock) count += 1;
      });

      return count;
    })();

    return {
      words: words.length,
      characters: trimmed.replace(/\s/g, "").length,
      charactersWithFormatting: trimmed.length,
      sentences: sentences.length,
      paragraphs,
      readingTime: formatTime(words.length, READING_WPM),
      speakingTime: formatTime(words.length, SPEAKING_WPM),
      readingGrade: grade > 0 ? ordinal(Math.max(1, Math.round(grade))) : "—",
      keywords: Object.entries(freq)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 10)
        .map(([word, count]) => ({
          word,
          density: ((count / words.length) * 100).toFixed(1),
        })),
    };
  }, [textSnapshot, selectionText, editor]);

  const downloadMarkdown = useCallback(() => {
    if (!editor) return;

    let md = editor.getHTML();

    md = md
      .replace(/<h1>(.*?)<\/h1>/g, "# $1\n\n")
      .replace(/<h2>(.*?)<\/h2>/g, "## $1\n\n")
      .replace(/<h3>(.*?)<\/h3>/g, "### $1\n\n")
      .replace(/<strong>(.*?)<\/strong>/g, "**$1**")
      .replace(/<em>(.*?)<\/em>/g, "*$1*")
      .replace(/<u>(.*?)<\/u>/g, "_$1_")
      .replace(/<li>(.*?)<\/li>/g, "- $1\n")
      .replace(/<blockquote>(.*?)<\/blockquote>/gs, (_, c: string) =>
        c.replace(/<p>(.*?)<\/p>/g, "> $1\n"),
      )
      .replace(/<p>(.*?)<\/p>/g, "$1\n\n")
      .replace(/<code>(.*?)<\/code>/g, "`$1`")
      .replace(/<[^>]+>/g, "")
      .replace(/\n{3,}/g, "\n\n")
      .trim();

    const blob = new Blob([md], { type: "text/markdown;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "draft.md";
    a.click();
    URL.revokeObjectURL(url);
  }, [editor]);

  return (
    <main className="min-h-dvh bg-muted p-4 flex justify-center items-center">
      <div className="grid max-w-5xl gap-4 lg:grid-cols-[1fr_280px]">
        {/* Editor */}
        <section className="rounded-2xl bg-white p-4">
          <Toolbar editor={editor} />
          <EditorContent
            editor={editor}
            className={[
              "min-h-100 outline-none text-base",
              "[&_h1]:scroll-m-20 [&_h1]:mb-4 [&_h1]:text-3xl [&_h1]:font-extrabold [&_h1]:tracking-tight [&_h1]:text-balance",
              "[&_h2]:scroll-m-20 [&_h2]:mb-2 [&_h2]:text-2xl [&_h2]:font-semibold [&_h2]:tracking-tight [&_h2]:first:mt-0",
              "[&_h3]:scroll-m-20 [&_h3]:mb-1 [&_h3]:text-xl [&_h3]:font-semibold [&_h3]:tracking-tight",
              "[&_p]:my-1 [&_p]:leading-7",
              "[&_blockquote]:mt-6 [&_blockquote]:border-l-2 [&_blockquote]:pl-6 [&_blockquote]:italic",
              "[&_ul]:my-6 [&_ul]:ml-6 [&_ul]:list-disc [&_ul>li]:mt-2",
              "[&_ol]:my-6 [&_ol]:ml-6 [&_ol]:list-decimal [&_ol>li]:mt-2",
              "[&_code]:bg-muted [&_code]:relative [&_code]:rounded-sm [&_code]:px-[0.3rem] [&_code]:py-[0.2rem] [&_code]:font-mono [&_code]:text-sm [&_code]:font-semibold",
            ].join(" ")}
          />

          <div className="mt-4 grid grid-cols-2 gap-4 rounded-full bg-muted px-4 py-2 sm:grid-cols-4">
            <Stat label="Words" value={stats.words} dot="bg-blue-600" />
            <Stat
              label="Characters"
              value={stats.characters}
              dot="bg-red-600"
            />
            <Stat
              label="Sentences"
              value={stats.sentences}
              dot="bg-green-600"
            />
            <Stat
              label="Paragraphs"
              value={stats.paragraphs}
              dot="bg-amber-500"
            />
          </div>
        </section>

        {/* Sidebar */}
        <aside className="flex flex-col justify-between rounded-2xl bg-white p-4">
          <div className="space-y-8">
            <div>
              <p className="mb-4 text-xs font-semibold text-muted-foreground">
                Timing
              </p>
              <Stat
                label="Characters with Formatting"
                value={stats.charactersWithFormatting}
              />
              <Stat label="Reading Time" value={stats.readingTime} />
              <Stat label="Speaking Time" value={stats.speakingTime} />
              <Stat label="Reading Grade" value={stats.readingGrade} />
            </div>

            <div>
              <p className="mb-4 text-xs font-semibold text-muted-foreground">
                Keyword Density
              </p>
              {stats.keywords.length ? (
                stats.keywords.map((k) => (
                  <Stat key={k.word} label={k.word} value={`${k.density}%`} />
                ))
              ) : (
                <span className="text-sm text-muted-foreground">—</span>
              )}
            </div>
          </div>

          <Button
            className="mt-4 w-full rounded-full"
            onClick={downloadMarkdown}
          >
            <Save size={18} />
            Save
          </Button>
        </aside>
      </div>
    </main>
  );
}

export default App;
