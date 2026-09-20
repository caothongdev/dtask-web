import { test, expect } from "bun:test";
import React from "react";
import { renderToString } from "react-dom/server";
import { HandwritingText } from "../components/ui/handwriting-text";

test("Task 2: HandwritingText renders SSR fallback span before font loads", () => {
  const html = renderToString(
    <HandwritingText text="Focus Live" className="text-emerald-500" />
  );
  expect(html).toContain("<span");
  expect(html).toContain("Focus Live");
  expect(html).toContain("text-emerald-500");
});

test("Task 2: HandwritingText renders initial word when words array is provided", () => {
  const html = renderToString(
    <HandwritingText
      words={["live.", "predictive.", "measurable."]}
      className="test-class"
    />
  );
  expect(html).toContain("<span");
  expect(html).toContain("live.");
  expect(html).toContain("test-class");
});

test("Task 2: HandwritingText defaults to empty string if no text or words given", () => {
  const html = renderToString(<HandwritingText />);
  expect(html).toContain("<span");
});
