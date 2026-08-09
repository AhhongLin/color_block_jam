import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Board } from "./Board";
import { sampleLevel } from "../../data/levels";
import type { Level } from "../../types/level";

// jsdom 沒有實作全域 PointerEvent（見 https://github.com/jsdom/jsdom/issues/2527），
// testing-library 的 fireEvent.pointerDown/Up 會 fallback 成一般 Event，
// 導致 clientX/clientY/pointerId 等欄位被忽略。手動組出帶這些欄位的 event 來測。
function firePointerEvent(
  target: Element,
  type: "pointerdown" | "pointermove" | "pointerup",
  init: { pointerId: number; clientX: number; clientY: number; pointerType?: string; button?: number },
) {
  const event = new Event(type, { bubbles: true, cancelable: true });
  Object.assign(event, { pointerType: "mouse", button: 0, ...init });
  fireEvent(target, event);
}

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

describe("Board 拖曳互動", () => {
  const dragTestLevel: Level = {
    id: "drag-test",
    name: "拖曳測試關卡",
    cells: [
      [0, 0], [0, 1], [0, 2],
      [1, 0], [1, 1], [1, 2],
      [2, 0], [2, 1], [2, 2],
    ],
    doors: [],
    blocks: [{ id: "a", color: "red", cells: [[1, 0]] }],
  };

  // 3x3 盤面，量出來的格距固定為 60px，方便手算拖曳距離對應的格數。
  beforeEach(() => {
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockReturnValue({
      width: 180,
      height: 180,
      top: 0,
      left: 0,
      right: 180,
      bottom: 180,
      x: 0,
      y: 0,
      toJSON() {},
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  function getWrapper(container: HTMLElement) {
    return container.querySelector<HTMLElement>('[data-block-wrapper-id="a"]')!;
  }

  it("拖曳過程中（放開前）方塊會即時跟著滑鼠位移，鉗制在可滑動範圍內", () => {
    const { container } = render(<Board level={dragTestLevel} />);
    const wrapper = getWrapper(container);

    firePointerEvent(wrapper, "pointerdown", { pointerId: 1, clientX: 0, clientY: 0 });
    firePointerEvent(wrapper, "pointermove", { pointerId: 1, clientX: 50, clientY: 0 });

    // 還沒放開，anchor 沒變，但即時位移（--drag-offset-x）已經反映拖曳距離。
    expect(wrapper.style.getPropertyValue("--anchor-col")).toBe("0");
    expect(wrapper.style.getPropertyValue("--drag-offset-x")).toBe("50px");

    // 拖超過可行範圍（maxSteps=2 步 * 60px = 120px）時，鉗制在邊界，不會被拖過障礙物。
    firePointerEvent(wrapper, "pointermove", { pointerId: 1, clientX: 1000, clientY: 0 });
    expect(wrapper.style.getPropertyValue("--drag-offset-x")).toBe("120px");
  });

  it("放開時拖曳距離不到一整格，方塊留在原地", () => {
    const { container } = render(<Board level={dragTestLevel} />);
    const wrapper = getWrapper(container);

    firePointerEvent(wrapper, "pointerdown", { pointerId: 1, clientX: 0, clientY: 0 });
    firePointerEvent(wrapper, "pointermove", { pointerId: 1, clientX: 20, clientY: 0 });
    firePointerEvent(wrapper, "pointerup", { pointerId: 1, clientX: 20, clientY: 0 });

    expect(wrapper.style.getPropertyValue("--anchor-col")).toBe("0");
    expect(wrapper.style.getPropertyValue("--drag-offset-x")).toBe("");
  });

  it("放開時拖曳距離不到底，方塊停在放開當下最接近的那一格（不會自動滑到底）", () => {
    const { container } = render(<Board level={dragTestLevel} />);
    const wrapper = getWrapper(container);

    firePointerEvent(wrapper, "pointerdown", { pointerId: 1, clientX: 0, clientY: 0 });
    firePointerEvent(wrapper, "pointermove", { pointerId: 1, clientX: 50, clientY: 0 });
    firePointerEvent(wrapper, "pointerup", { pointerId: 1, clientX: 50, clientY: 0 });

    // 50px / 60px = 0.83 格，四捨五入為 1 格，而不是滑到底的 2 格。
    expect(wrapper.style.getPropertyValue("--anchor-col")).toBe("1");
  });

  it("往右拖曳超過可行範圍時，方塊滑動到盤面邊界前（不會超過障礙物）", () => {
    const { container } = render(<Board level={dragTestLevel} />);
    const wrapper = getWrapper(container);

    expect(wrapper.style.getPropertyValue("--anchor-col")).toBe("0");

    firePointerEvent(wrapper, "pointerdown", { pointerId: 1, clientX: 0, clientY: 0 });
    firePointerEvent(wrapper, "pointerup", { pointerId: 1, clientX: 1000, clientY: 0 });

    expect(wrapper.style.getPropertyValue("--anchor-col")).toBe("2");
    expect(wrapper.style.getPropertyValue("--anchor-row")).toBe("1");
  });

  it("拖曳距離小於方向門檻時，方塊不移動", () => {
    const { container } = render(<Board level={dragTestLevel} />);
    const wrapper = getWrapper(container);

    firePointerEvent(wrapper, "pointerdown", { pointerId: 1, clientX: 0, clientY: 0 });
    firePointerEvent(wrapper, "pointerup", { pointerId: 1, clientX: 3, clientY: 0 });

    expect(wrapper.style.getPropertyValue("--anchor-col")).toBe("0");
  });

  it("水平方向已經拖很遠後，只要最近一段位移明顯偏垂直，仍能穩定切到垂直方向（回歸測試）", () => {
    const { container } = render(<Board level={dragTestLevel} />);
    const wrapper = getWrapper(container);

    firePointerEvent(wrapper, "pointerdown", { pointerId: 1, clientX: 0, clientY: 0 });
    // 持續往右拖，累積到 300px 遠遠大於接下來的垂直位移。
    for (let x = 15; x <= 300; x += 15) {
      firePointerEvent(wrapper, "pointermove", { pointerId: 1, clientX: x, clientY: 0 });
    }
    expect(wrapper.style.getPropertyValue("--drag-offset-x")).not.toBe("0px");

    // 接下來只往下拖 50px（遠小於水平累積的 300px），舊版「累積位移比大小」
    // 的判斷邏輯永遠切不到垂直；應該要能穩定切換成功。切換的瞬間，水平那一段
    // （300px，鉗制在 2 步 = col2）立刻結算進 anchor；新的垂直段從切換點重新
    // 起算，所以這個 tick 的即時位移是 0，不是 50。
    firePointerEvent(wrapper, "pointermove", { pointerId: 1, clientX: 300, clientY: 50 });
    expect(wrapper.style.getPropertyValue("--anchor-col")).toBe("2");
    expect(wrapper.style.getPropertyValue("--anchor-row")).toBe("1");
    expect(wrapper.style.getPropertyValue("--drag-offset-x")).toBe("0px");
    expect(wrapper.style.getPropertyValue("--drag-offset-y")).toBe("0px");

    // 切換後繼續往下拖，垂直位移從切換點開始持續跟著滑鼠長大。
    firePointerEvent(wrapper, "pointermove", { pointerId: 1, clientX: 300, clientY: 90 });
    expect(wrapper.style.getPropertyValue("--drag-offset-y")).toBe("40px");

    firePointerEvent(wrapper, "pointerup", { pointerId: 1, clientX: 300, clientY: 90 });
    // 40px / 60px ≈ 0.67 格，四捨五入為 1 格 → 停在 row2（往下 1 格）。
    expect(wrapper.style.getPropertyValue("--anchor-row")).toBe("2");
    expect(wrapper.style.getPropertyValue("--anchor-col")).toBe("2");
  });

  it("往右拖曳後稍微收回、但仍停在起點右側時，不會被誤判成往左而跳回原地", () => {
    const { container } = render(<Board level={dragTestLevel} />);
    const wrapper = getWrapper(container);

    firePointerEvent(wrapper, "pointerdown", { pointerId: 1, clientX: 0, clientY: 0 });
    for (let x = 15; x <= 300; x += 15) {
      firePointerEvent(wrapper, "pointermove", { pointerId: 1, clientX: x, clientY: 0 });
    }
    // 手指往回收 50px，但相對起點仍在右側 250px 處（淨位移依然是正的）。
    firePointerEvent(wrapper, "pointermove", { pointerId: 1, clientX: 250, clientY: 0 });

    // 應該還是視為「往右」，鉗制在可行範圍（2 步 * 60px = 120px），
    // 而不是被最近那一小段「往左」的相對位移誤判、瞬間跳回 0。
    expect(wrapper.style.getPropertyValue("--drag-offset-x")).toBe("120px");
  });

  it("先往上拖、再往左拖時，方塊全程跟著滑鼠走：切軸瞬間先把已走的那一段結算進 anchor，不會整個跳回原始位置再重新移動", () => {
    // 3x3 開放盤面，方塊放在正中央，上下左右都還有 1 格可以走。
    const crossAxisLevel: Level = {
      id: "cross-axis-test",
      name: "切軸測試關卡",
      cells: [
        [0, 0], [0, 1], [0, 2],
        [1, 0], [1, 1], [1, 2],
        [2, 0], [2, 1], [2, 2],
      ],
      doors: [],
      blocks: [{ id: "a", color: "blue", cells: [[1, 1]] }],
    };
    const { container } = render(<Board level={crossAxisLevel} />);
    const wrapper = getWrapper(container);

    firePointerEvent(wrapper, "pointerdown", { pointerId: 1, clientX: 0, clientY: 0 });

    // 往上拖 40px，還沒放開也還沒切軸，anchor 不變，即時位移反映拖曳距離。
    firePointerEvent(wrapper, "pointermove", { pointerId: 1, clientX: 0, clientY: -40 });
    expect(wrapper.style.getPropertyValue("--anchor-row")).toBe("1");
    expect(wrapper.style.getPropertyValue("--anchor-col")).toBe("1");
    expect(wrapper.style.getPropertyValue("--drag-offset-y")).toBe("-40px");

    // 轉往左拖：切軸的瞬間，上一段（往上 40px，四捨五入 1 格）立刻結算進
    // anchor（row 1→0），新的一段（水平）從切換的當下重新起算，所以這個
    // tick 的即時位移是 0——不是整個跳回原始位置（row 1、col 1）。
    firePointerEvent(wrapper, "pointermove", { pointerId: 1, clientX: -20, clientY: -40 });
    expect(wrapper.style.getPropertyValue("--anchor-row")).toBe("0");
    expect(wrapper.style.getPropertyValue("--anchor-col")).toBe("1");
    expect(wrapper.style.getPropertyValue("--drag-offset-y")).toBe("0px");
    expect(wrapper.style.getPropertyValue("--drag-offset-x")).toBe("0px");

    // 繼續往左拖，水平位移從切換點開始持續跟著滑鼠長大。
    firePointerEvent(wrapper, "pointermove", { pointerId: 1, clientX: -50, clientY: -40 });
    expect(wrapper.style.getPropertyValue("--drag-offset-x")).toBe("-30px");

    firePointerEvent(wrapper, "pointerup", { pointerId: 1, clientX: -50, clientY: -40 });
    expect(wrapper.style.getPropertyValue("--anchor-row")).toBe("0");
    expect(wrapper.style.getPropertyValue("--anchor-col")).toBe("0");
  });
});
