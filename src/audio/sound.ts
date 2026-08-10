export type SoundName = "move" | "exit" | "complete" | "click";

// GitHub Pages 部署在子路徑（vite.config 的 base），public/ 底下的資源要透過
// import.meta.env.BASE_URL 組出正確路徑；寫死 "/sounds/..." 在 build 之後會
// 指到錯的路徑（本機開發 base 是 "/"，build 後是 "/color-block-jam/"）。
const SOUND_SOURCES: Record<SoundName, string> = {
  move: `${import.meta.env.BASE_URL}sounds/move.mp3`,
  exit: `${import.meta.env.BASE_URL}sounds/exit.mp3`,
  complete: `${import.meta.env.BASE_URL}sounds/complete.mp3`,
  click: `${import.meta.env.BASE_URL}sounds/click.mp3`,
};

interface AudioLike {
  currentTime: number;
  play(): Promise<void> | void;
}

// progress.ts 用注入的 Storage 讓瀏覽器 API 可測；這裡比照辦理，把
// `new Audio(...)` 換成可注入的 factory，測試能直接傳假的 AudioLike 進來，
// 不用再 vi.stubGlobal("Audio", ...) 硬換全域建構子。
type AudioFactory = (src: string) => AudioLike;

function defaultAudioFactory(src: string): AudioLike {
  return new Audio(src);
}

// spec.md 5／ticket 12：互動音效只是回饋，不是遊戲規則的一部分——瀏覽器的
// autoplay 政策、裝置靜音、音檔載入失敗都不該讓遊戲操作本身失敗，所以播放
// 失敗一律靜默忽略。
export function createSoundPlayer(createAudio: AudioFactory = defaultAudioFactory) {
  // 每種音效各自快取一個 Audio 元素，重複播放時歸零到開頭再 play()——避免
  // 短時間內連續觸發（例如連續拖曳移動）時每次都重新建立、重新載入音檔。
  const cache = new Map<SoundName, AudioLike>();

  function getAudio(name: SoundName): AudioLike {
    let audio = cache.get(name);
    if (!audio) {
      audio = createAudio(SOUND_SOURCES[name]);
      cache.set(name, audio);
    }
    return audio;
  }

  return function playSound(name: SoundName): void {
    try {
      const audio = getAudio(name);
      audio.currentTime = 0;
      audio.play()?.catch(() => {});
    } catch {
      // 忽略播放失敗（autoplay 政策、裝置靜音、音檔載入失敗等）。
    }
  };
}

// 元件共用同一個播放器，同一種音效的 Audio 元素才會真的被快取、重複使用。
export const playSound = createSoundPlayer();
