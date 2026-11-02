import * as React from "react";
import { splitBold, stripHeadingMarks } from "@/lib/inline-markdown";

/** Texto do modelo com **negrito** renderizado. Preserva quebras de linha. */
export function InlineMarkdown({ text }: { text: string }) {
  const lines = text.split("\n");
  return (
    <>
      {lines.map((line, i) => (
        <React.Fragment key={i}>
          {splitBold(stripHeadingMarks(line)).map((seg, j) =>
            seg.bold ? (
              <strong key={j} className="font-semibold text-ice-white">
                {seg.text}
              </strong>
            ) : (
              <React.Fragment key={j}>{seg.text}</React.Fragment>
            )
          )}
          {i < lines.length - 1 ? "\n" : null}
        </React.Fragment>
      ))}
    </>
  );
}
