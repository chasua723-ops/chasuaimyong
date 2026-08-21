export interface ParsedChapter {
  name: string;
  startPage: number;
  children: { name: string; startPage: number }[];
}

export interface TopicRange {
  name: string;
  startPage: number;
  endPage: number;
}

export interface ChapterRange extends TopicRange {
  children: TopicRange[];
}

interface Leaf {
  chapterIndex: number;
  childIndex: number | null; // null = the chapter itself has no children and is the leaf
  startPage: number;
}

export function computeTopicRanges(chapters: ParsedChapter[], totalPages: number): ChapterRange[] {
  const leaves: Leaf[] = [];
  chapters.forEach((chapter, chapterIndex) => {
    if (chapter.children.length === 0) {
      leaves.push({ chapterIndex, childIndex: null, startPage: chapter.startPage });
    } else {
      chapter.children.forEach((child, childIndex) => {
        leaves.push({ chapterIndex, childIndex, startPage: child.startPage });
      });
    }
  });

  leaves.sort((a, b) => a.startPage - b.startPage);

  const endPageForLeaf = (leafIndex: number) =>
    leafIndex === leaves.length - 1 ? totalPages : leaves[leafIndex + 1].startPage - 1;

  return chapters.map((chapter, chapterIndex) => {
    if (chapter.children.length === 0) {
      const leafIndex = leaves.findIndex(
        (l) => l.chapterIndex === chapterIndex && l.childIndex === null
      );
      return {
        name: chapter.name,
        startPage: chapter.startPage,
        endPage: endPageForLeaf(leafIndex),
        children: [],
      };
    }

    const children: TopicRange[] = chapter.children.map((child, childIndex) => {
      const leafIndex = leaves.findIndex(
        (l) => l.chapterIndex === chapterIndex && l.childIndex === childIndex
      );
      return { name: child.name, startPage: child.startPage, endPage: endPageForLeaf(leafIndex) };
    });

    return {
      name: chapter.name,
      startPage: chapter.startPage,
      endPage: children[children.length - 1].endPage,
      children,
    };
  });
}
