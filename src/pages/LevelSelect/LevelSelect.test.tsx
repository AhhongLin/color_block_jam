import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { LevelSelect } from "./LevelSelect";
import type { Level } from "../../types/level";

const testLevels: Level[] = [
  { id: "01", name: "第 1 關", cells: [], doors: [], blocks: [] },
  { id: "02", name: "第 2 關", cells: [], doors: [], blocks: [] },
  { id: "03", name: "第 3 關", cells: [], doors: [], blocks: [] },
];

vi.mock("../../data/levels", () => ({
  get levels() {
    return testLevels;
  },
}));

function renderLevelSelect() {
  return render(
    <MemoryRouter>
      <LevelSelect />
    </MemoryRouter>,
  );
}

describe("LevelSelect", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  afterEach(() => {
    window.localStorage.clear();
  });

  it("每一關都渲染出一個帶 data-level-id 的節點", () => {
    const { container } = renderLevelSelect();
    for (const level of testLevels) {
      expect(container.querySelector(`[data-level-id="${level.id}"]`)).not.toBeNull();
    }
  });

  it("沒有任何進度時，只有第一關解鎖可以點擊，其餘鎖定", () => {
    renderLevelSelect();

    const first = screen.getByLabelText("第 1 關");
    expect(first.tagName).toBe("A");
    expect(first).toHaveAttribute("href", "/level/01");

    const second = screen.getByLabelText("第 2 關（未解鎖）");
    expect(second.tagName).not.toBe("A");
    expect(second).toHaveAttribute("aria-disabled", "true");

    const third = screen.getByLabelText("第 3 關（未解鎖）");
    expect(third.tagName).not.toBe("A");
  });

  it("完成第一關後，第二關解鎖、第一關顯示完成狀態", () => {
    window.localStorage.setItem("color-block-jam:completed-levels", JSON.stringify(["01"]));
    renderLevelSelect();

    const first = screen.getByLabelText("第 1 關（已完成）");
    expect(first.tagName).toBe("A");
    expect(first.textContent).toContain("✓");

    const second = screen.getByLabelText("第 2 關");
    expect(second.tagName).toBe("A");
    expect(second).toHaveAttribute("href", "/level/02");

    const third = screen.getByLabelText("第 3 關（未解鎖）");
    expect(third.tagName).not.toBe("A");
  });
});
