import { describe, expect, it } from "vitest";
import { createSoundPlayer } from "./sound";

// jsdom 的 HTMLAudioElement.play() 只會印一句「not implemented」不會真的播放
// （見 Board 開發時的探勘），所以測試改用假的 AudioLike 注入 createSoundPlayer，
// 直接驗證 playSound() 呼叫 Audio API 的方式，不用碰真的瀏覽器 Audio。
class FakeAudio {
  src: string;
  currentTime = 0;
  playCallCount = 0;
  currentTimeAtPlayCalls: number[] = [];

  constructor(src: string) {
    this.src = src;
  }

  play(): Promise<void> {
    this.playCallCount += 1;
    this.currentTimeAtPlayCalls.push(this.currentTime);
    return Promise.resolve();
  }
}

function setup() {
  const instances: FakeAudio[] = [];
  const playSound = createSoundPlayer((src) => {
    const audio = new FakeAudio(src);
    instances.push(audio);
    return audio;
  });
  return { playSound, instances };
}

describe("playSound", () => {
  it("同一種音效重複播放時，只建立一個 Audio 元素並重複使用", () => {
    const { playSound, instances } = setup();
    playSound("click");
    playSound("click");
    expect(instances).toHaveLength(1);
    expect(instances[0].playCallCount).toBe(2);
  });

  it("不同音效各自建立獨立的 Audio 元素", () => {
    const { playSound, instances } = setup();
    playSound("move");
    playSound("exit");
    expect(instances).toHaveLength(2);
  });

  it("每次播放前都把 currentTime 歸零，即使上一次播到一半也一樣", () => {
    const { playSound, instances } = setup();
    playSound("complete");
    instances[0].currentTime = 5; // 模擬播放中途手動前進
    playSound("complete");
    expect(instances[0].currentTimeAtPlayCalls).toEqual([0, 0]);
  });

  it("play() 回傳的 Promise reject 時不會拋出例外（例如 autoplay 政策擋下播放）", () => {
    const playSound = createSoundPlayer(() => ({
      currentTime: 0,
      play: () => Promise.reject(new Error("NotAllowedError")),
    }));
    expect(() => playSound("click")).not.toThrow();
  });

  it("Audio 建構子（factory）同步拋出例外時也不會往外傳播", () => {
    const playSound = createSoundPlayer(() => {
      throw new Error("boom");
    });
    expect(() => playSound("click")).not.toThrow();
  });

  it("不同的 createSoundPlayer 實例各自有獨立的快取", () => {
    const first = setup();
    const second = setup();
    first.playSound("click");
    expect(first.instances).toHaveLength(1);
    expect(second.instances).toHaveLength(0);
  });
});
