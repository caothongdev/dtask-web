import { test, expect } from "bun:test";
import React from "react";
import { renderToString } from "react-dom/server";
import { LandingPage } from "../src/landing/LandingPage";

test("Task 3: LandingPage renders all core sections with rich copy and icons", () => {
  const html = renderToString(<LandingPage />);

  // Navbar
  expect(html).toContain("dtask");
  expect(html).toContain("Launch App");

  // Hero Section with animated HandwritingText
  expect(html).toContain("Master your daily workflow");
  expect(html).toContain("live.");
  expect(html).toContain("Start Focusing Free");

  // Feature Section
  expect(html).toContain("24-Hour Visual Timeline");
  expect(html).toContain("Focus Daemon");
  expect(html).toContain("RPG Economy");

  // Unsplash Photography
  expect(html).toContain("images.unsplash.com");

  // Pricing Section
  expect(html).toContain("Simple pricing for serious focus");
  expect(html).toContain("$0");
  expect(html).toContain("Self-Hosted");
  expect(html).toContain("COMING SOON");

  // FAQ Section
  expect(html).toContain("Questions, answered.");
  expect(html).toContain("Where is my data stored?");

  // Footer
  expect(html).toContain("All Systems Operational");
});
