import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Board } from "./Board";
import { sampleLevel } from "../../data/levels";

describe("Board", () => {
  it("renders the level name", () => {
    render(<Board level={sampleLevel} />);
    expect(screen.getByText(sampleLevel.name)).toBeInTheDocument();
  });

  it("renders one element per block cell, tagged with the block id", () => {
    const { container } = render(<Board level={sampleLevel} />);
    for (const block of sampleLevel.blocks) {
      const cells = container.querySelectorAll(`[data-block-id="${block.id}"]`);
      expect(cells).toHaveLength(block.cells.length);
    }
  });

  it("renders one element per door", () => {
    const { container } = render(<Board level={sampleLevel} />);
    expect(container.querySelectorAll("[data-door-color]")).toHaveLength(sampleLevel.doors.length);
  });
});
