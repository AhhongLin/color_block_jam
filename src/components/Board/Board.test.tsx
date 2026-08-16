import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Board } from "./Board";
import { sampleLevel } from "../../data/levels";
import { playSound } from "../../audio/sound";
import type { Level } from "../../types/level";

// jsdom 沒有實作 HTMLMediaElement.play()（呼叫會印一句 "not implemented" 到
// stderr），跟這裡要測的拖曳/碰撞/過關邏輯無關，直接 mock 掉整個音效模組，
// 順便讓下面能斷言各個時機真的觸發了對應的音效。
vi.mock("../../audio/sound", () => ({ playSound: vi.fn() }));

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

beforeEach(() => {
  vi.mocked(playSound).mockClear();
});

describe("Board", () => {
  // 方塊是單一剪影（clip-path 沿格子邊界描出的多邊形，見 blockShape.ts），
  // 沒量到盤面格距（cellPitchPx）之前不會畫出來——量測靠 getBoundingClientRect()，
  // jsdom 預設回傳全 0，所以要 mock 一個非零的盤面尺寸，方塊才會實際渲染。
  beforeEach(() => {
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockReturnValue({
      width: 600,
      height: 600,
      top: 0,
      left: 0,
      right: 600,
      bottom: 600,
      x: 0,
      y: 0,
      toJSON() {},
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("renders the level name", () => {
    render(<Board level={sampleLevel} />);
    expect(screen.getByText(sampleLevel.name)).toBeInTheDocument();
  });

  it("renders one element per block, tagged with the block id", () => {
    const { container } = render(<Board level={sampleLevel} />);
    for (const block of sampleLevel.blocks) {
      const cells = container.querySelectorAll(`[data-block-id="${block.id}"]`);
      expect(cells).toHaveLength(1);
    }
  });

  it("renders one element per door", () => {
    const { container } = render(<Board level={sampleLevel} />);
    expect(container.querySelectorAll("[data-door-color]")).toHaveLength(sampleLevel.doors.length);
  });

  // 門上的白色三角形符號要「朝盤面外」——形狀本身固定畫成尖端朝上（見
  // Board.module.css 的 .doorArrow），朝向完全由旋轉角度決定，所以四個側邊
  // 各自轉對角度就是這個符號唯一會出錯的地方。
  it("points each door's arrow outward from the board", () => {
    const fourSidedLevel: Level = {
      id: "door-arrow-test",
      name: "門符號測試關卡",
      cells: [
        [0, 0],
        [0, 1],
        [1, 0],
        [1, 1],
      ],
      doors: [
        { row: 0, col: 0, side: "top", color: "red" },
        { row: 0, col: 1, side: "right", color: "blue" },
        { row: 1, col: 1, side: "bottom", color: "green" },
        { row: 1, col: 0, side: "left", color: "yellow" },
      ],
      blocks: [],
    };
    const { container } = render(<Board level={fourSidedLevel} />);

    const rotationBySide = Object.fromEntries(
      Array.from(container.querySelectorAll<HTMLElement>("[data-door-arrow-side]")).map((arrow) => [
        arrow.dataset.doorArrowSide,
        arrow.style.transform,
      ]),
    );
    expect(rotationBySide).toEqual({
      top: "translate(-50%, -50%) rotate(0deg)",
      right: "translate(-50%, -50%) rotate(90deg)",
      bottom: "translate(-50%, -50%) rotate(180deg)",
      left: "translate(-50%, -50%) rotate(270deg)",
    });
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

  it("按下方塊時會擋掉瀏覽器預設行為，避免殘留文字選取範圍讓下一次拖曳被原生 dragstart 打斷（回歸測試）", () => {
    // 真實瀏覽器裡：pointerdown 沒擋掉預設行為的話，放開後方塊上會留一段空的
    // 文字選取範圍；下一次在同一個方塊按下時，瀏覽器會把它判定成「拖曳選取
    // 範圍」而觸發原生 dragstart → pointercancel，導致方塊卡住拖不動、游標
    // 變成瀏覽器原生的「禁止」圖示。jsdom 不會模擬這整套原生行為，所以這裡
    // 只斷言 preventDefault 真的被呼叫，從源頭避免選取範圍產生。
    const { container } = render(<Board level={dragTestLevel} />);
    const wrapper = getWrapper(container);

    const event = new Event("pointerdown", { bubbles: true, cancelable: true });
    Object.assign(event, { pointerType: "mouse", button: 0, pointerId: 1, clientX: 0, clientY: 0 });
    const preventDefaultSpy = vi.spyOn(event, "preventDefault");
    fireEvent(wrapper, event);

    expect(preventDefaultSpy).toHaveBeenCalled();
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

describe("Board 離場、過關與重設", () => {
  const OPEN_3X3_CELLS: Level["cells"] = [
    [0, 0], [0, 1], [0, 2],
    [1, 0], [1, 1], [1, 2],
    [2, 0], [2, 1], [2, 2],
  ];

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
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("方塊滑到對齊的同色門時會離場消失；過關訊息要等離場動畫播完才顯示", () => {
    const exitTestLevel: Level = {
      id: "exit-test",
      name: "離場測試關卡",
      cells: [...OPEN_3X3_CELLS],
      doors: [{ row: 1, col: 2, side: "right", color: "red" }],
      blocks: [{ id: "a", color: "red", cells: [[1, 0]] }],
    };

    vi.useFakeTimers();
    const { container } = render(<Board level={exitTestLevel} />);
    const wrapper = container.querySelector<HTMLElement>('[data-block-wrapper-id="a"]')!;

    act(() => {
      firePointerEvent(wrapper, "pointerdown", { pointerId: 1, clientX: 0, clientY: 0 });
      firePointerEvent(wrapper, "pointerup", { pointerId: 1, clientX: 1000, clientY: 0 });
    });

    // 動畫還沒播完前，方塊仍短暫留在畫面上（正在滑出、炸開），過關訊息也還沒
    // 出現——要等玩家親眼看到最後一個方塊滑出盤面才算過關，不是規則上一結算
    // 就跳出（不等粉粒飛散完，粉粒尾韻可以在過關橫幅顯示後於背景繼續播完）。
    expect(container.querySelector('[data-block-wrapper-id="a"]')).not.toBeNull();
    expect(screen.queryByRole("status")).toBeNull();

    act(() => {
      vi.advanceTimersByTime(3000);
    });

    // 動畫結束後，方塊完全從畫面上移除，過關訊息才出現。
    expect(container.querySelector('[data-block-wrapper-id="a"]')).toBeNull();
    expect(screen.getByRole("status")).toHaveTextContent("過關");
  });

  it("前緣只有部分對齊同色門時不會離場，只是停在邊界前（撞牆）", () => {
    const partialDoorLevel: Level = {
      id: "partial-door-test",
      name: "部分對齊測試關卡",
      cells: [...OPEN_3X3_CELLS],
      // 2 格垂直方塊佔滿 col2 的兩列，但只有 row0 那一格有門。
      doors: [{ row: 0, col: 2, side: "right", color: "green" }],
      blocks: [
        {
          id: "a",
          color: "green",
          cells: [
            [0, 1],
            [1, 1],
          ],
        },
      ],
    };

    const { container } = render(<Board level={partialDoorLevel} />);
    const wrapper = container.querySelector<HTMLElement>('[data-block-wrapper-id="a"]')!;

    firePointerEvent(wrapper, "pointerdown", { pointerId: 1, clientX: 0, clientY: 0 });
    firePointerEvent(wrapper, "pointerup", { pointerId: 1, clientX: 1000, clientY: 0 });

    // 沒有離場：方塊還在，只是停在盤面邊界前一格（col2）。
    expect(container.querySelector('[data-block-wrapper-id="a"]')).not.toBeNull();
    expect(wrapper.style.getPropertyValue("--anchor-col")).toBe("2");
    expect(screen.queryByRole("status")).toBeNull();
  });

  it("按下「重設關卡」按鈕後，所有方塊回到關卡初始位置", () => {
    const resetTestLevel: Level = {
      id: "reset-test",
      name: "重設測試關卡",
      cells: [...OPEN_3X3_CELLS],
      doors: [],
      blocks: [{ id: "a", color: "red", cells: [[1, 0]] }],
    };

    const { container } = render(<Board level={resetTestLevel} />);
    const wrapper = container.querySelector<HTMLElement>('[data-block-wrapper-id="a"]')!;

    firePointerEvent(wrapper, "pointerdown", { pointerId: 1, clientX: 0, clientY: 0 });
    firePointerEvent(wrapper, "pointerup", { pointerId: 1, clientX: 1000, clientY: 0 });
    expect(wrapper.style.getPropertyValue("--anchor-col")).toBe("2");

    fireEvent.click(screen.getByRole("button", { name: "重設關卡" }));

    const resetWrapper = container.querySelector<HTMLElement>('[data-block-wrapper-id="a"]')!;
    expect(resetWrapper.style.getPropertyValue("--anchor-col")).toBe("0");
    expect(resetWrapper.style.getPropertyValue("--anchor-row")).toBe("1");
  });

  it("過關時呼叫 onComplete 一次；過關前不會呼叫", () => {
    const exitTestLevel: Level = {
      id: "exit-oncomplete-test",
      name: "過關回呼測試關卡",
      cells: [...OPEN_3X3_CELLS],
      doors: [{ row: 1, col: 2, side: "right", color: "red" }],
      blocks: [{ id: "a", color: "red", cells: [[1, 0]] }],
    };

    vi.useFakeTimers();
    const onComplete = vi.fn();
    const { container } = render(<Board level={exitTestLevel} onComplete={onComplete} />);
    const wrapper = container.querySelector<HTMLElement>('[data-block-wrapper-id="a"]')!;

    act(() => {
      firePointerEvent(wrapper, "pointerdown", { pointerId: 1, clientX: 0, clientY: 0 });
      firePointerEvent(wrapper, "pointerup", { pointerId: 1, clientX: 1000, clientY: 0 });
    });

    expect(onComplete).not.toHaveBeenCalled();

    act(() => {
      vi.advanceTimersByTime(3000);
    });

    expect(onComplete).toHaveBeenCalledTimes(1);
  });

  it("盤面上還有方塊時不顯示過關訊息", () => {
    const notCompleteLevel: Level = {
      id: "not-complete-test",
      name: "尚未過關測試關卡",
      cells: [...OPEN_3X3_CELLS],
      doors: [],
      blocks: [{ id: "a", color: "red", cells: [[1, 0]] }],
    };

    render(<Board level={notCompleteLevel} />);
    expect(screen.queryByRole("status")).toBeNull();
  });
});

describe("Board 音效（ticket 12）", () => {
  const OPEN_3X3_CELLS: Level["cells"] = [
    [0, 0], [0, 1], [0, 2],
    [1, 0], [1, 1], [1, 2],
    [2, 0], [2, 1], [2, 2],
  ];

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
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("方塊移動時播放 move 音效，撞牆沒有實際移動時不播放", () => {
    const level: Level = {
      id: "sound-move-test",
      name: "移動音效測試關卡",
      cells: [...OPEN_3X3_CELLS],
      doors: [],
      blocks: [{ id: "a", color: "red", cells: [[1, 0]] }],
    };
    const { container } = render(<Board level={level} />);
    const wrapper = container.querySelector<HTMLElement>('[data-block-wrapper-id="a"]')!;

    // 已經貼著左邊界，往左拖不會實際移動，不該播放音效。
    firePointerEvent(wrapper, "pointerdown", { pointerId: 1, clientX: 0, clientY: 0 });
    firePointerEvent(wrapper, "pointerup", { pointerId: 1, clientX: -1000, clientY: 0 });
    expect(playSound).not.toHaveBeenCalled();

    firePointerEvent(wrapper, "pointerdown", { pointerId: 2, clientX: 0, clientY: 0 });
    firePointerEvent(wrapper, "pointerup", { pointerId: 2, clientX: 1000, clientY: 0 });
    expect(playSound).toHaveBeenCalledWith("move");
    expect(playSound).not.toHaveBeenCalledWith("exit");
  });

  it("方塊離場時播放 exit 音效", () => {
    const level: Level = {
      id: "sound-exit-test",
      name: "離場音效測試關卡",
      cells: [...OPEN_3X3_CELLS],
      doors: [{ row: 1, col: 2, side: "right", color: "red" }],
      blocks: [{ id: "a", color: "red", cells: [[1, 0]] }],
    };
    const { container } = render(<Board level={level} />);
    const wrapper = container.querySelector<HTMLElement>('[data-block-wrapper-id="a"]')!;

    firePointerEvent(wrapper, "pointerdown", { pointerId: 1, clientX: 0, clientY: 0 });
    firePointerEvent(wrapper, "pointerup", { pointerId: 1, clientX: 1000, clientY: 0 });

    expect(playSound).toHaveBeenCalledWith("exit");
  });

  it("過關時播放 complete 音效", () => {
    const level: Level = {
      id: "sound-complete-test",
      name: "過關音效測試關卡",
      cells: [...OPEN_3X3_CELLS],
      doors: [{ row: 1, col: 2, side: "right", color: "red" }],
      blocks: [{ id: "a", color: "red", cells: [[1, 0]] }],
    };

    vi.useFakeTimers();
    const { container } = render(<Board level={level} />);
    const wrapper = container.querySelector<HTMLElement>('[data-block-wrapper-id="a"]')!;

    act(() => {
      firePointerEvent(wrapper, "pointerdown", { pointerId: 1, clientX: 0, clientY: 0 });
      firePointerEvent(wrapper, "pointerup", { pointerId: 1, clientX: 1000, clientY: 0 });
    });
    expect(playSound).not.toHaveBeenCalledWith("complete");

    act(() => {
      vi.advanceTimersByTime(3000);
    });
    expect(playSound).toHaveBeenCalledWith("complete");
  });

  it("按下「重設關卡」按鈕播放 click 音效", () => {
    const level: Level = {
      id: "sound-click-test",
      name: "點擊音效測試關卡",
      cells: [...OPEN_3X3_CELLS],
      doors: [],
      blocks: [{ id: "a", color: "red", cells: [[1, 0]] }],
    };
    render(<Board level={level} />);

    fireEvent.click(screen.getByRole("button", { name: "重設關卡" }));
    expect(playSound).toHaveBeenCalledWith("click");
  });
});
