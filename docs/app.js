// ===============================
// 1. 后端 API 地址配置
// ===============================

// 本地开发时访问 FastAPI： http://127.0.0.1:8000
// 部署到 GitHub Pages 后访问 Render 后端。
// 把下面的 Render 地址换成你自己的。
const API_BASE =
  location.hostname === "127.0.0.1" || location.hostname === "localhost"
    ? "http://127.0.0.1:8000"
    : "https://research-focus-clock-api.onrender.com";

// ===============================
// 2. DOM 元素
// ===============================

const CIRCUMFERENCE = 339.29;

const eventNameInput = document.querySelector("#eventName");
const focusMinutesInput = document.querySelector("#focusMinutes");
const timeText = document.querySelector("#timeText");
const statusText = document.querySelector("#statusText");
const progressRing = document.querySelector("#progressRing");
const message = document.querySelector("#message");

const startBtn = document.querySelector("#startBtn");
const pauseBtn = document.querySelector("#pauseBtn");
const resetBtn = document.querySelector("#resetBtn");

const todayStatus = document.querySelector("#todayStatus");
const streak = document.querySelector("#streak");
const totalDays = document.querySelector("#totalDays");
const totalMinutes = document.querySelector("#totalMinutes");
const dateList = document.querySelector("#dateList");

const recordDateInput = document.querySelector("#recordDate");
const queryDateBtn = document.querySelector("#queryDateBtn");
const daySummary = document.querySelector("#daySummary");
const dayRecordList = document.querySelector("#dayRecordList");

// ===============================
// 3. 倒计时状态
// ===============================

const state = {
  totalSeconds: 25 * 60,
  leftSeconds: 25 * 60,
  running: false,
  timer: null,
  endAt: null,
  finished: false,
};

// ===============================
// 4. 用户 ID 和专注会话保存
// ===============================

function getUserId() {
  let id = localStorage.getItem("research_focus_user_id");

  if (!id) {
    if (window.crypto && window.crypto.randomUUID) {
      id = window.crypto.randomUUID();
    } else {
      id = `user-${Date.now()}`;
    }

    localStorage.setItem("research_focus_user_id", id);
  }

  return id;
}

const userId = getUserId();

const FOCUS_SESSION_KEY = "research_focus_session";

function saveFocusSession() {
  localStorage.setItem(
    FOCUS_SESSION_KEY,
    JSON.stringify({
      eventName: eventNameInput.value.trim(),
      totalSeconds: state.totalSeconds,
      leftSeconds: state.leftSeconds,
      endAt: state.endAt,
      running: state.running,
    }),
  );
}

function clearFocusSession() {
  localStorage.removeItem(FOCUS_SESSION_KEY);
}

// ===============================
// 5. 工具函数
// ===============================

function getTodayString() {
  const now = new Date();
  const local = new Date(now.getTime() - now.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 10);
}

function getMinutesValue() {
  const value = Number(focusMinutesInput.value);

  if (!Number.isFinite(value) || value < 1) {
    return 25;
  }

  return Math.min(Math.floor(value), 240);
}

function setMessage(text) {
  message.textContent = text;
}

function formatCreatedTime(value) {
  if (!value) {
    return "";
  }

  const normalizedValue = String(value).replace(" ", "T");
  const date = new Date(normalizedValue);

  if (Number.isNaN(date.getTime())) {
    return String(value);
  }

  return `${String(date.getHours()).padStart(2, "0")}:${String(
    date.getMinutes(),
  ).padStart(2, "0")}`;
}

function formatTotalDuration(minutes) {
  const value = Number(minutes) || 0;

  if (value < 60) {
    return `${value} 分钟`;
  }

  const hours = Math.floor(value / 60);
  const leftMinutes = value % 60;

  if (leftMinutes === 0) {
    return `${hours} 小时`;
  }

  return `${hours} 小时 ${leftMinutes} 分钟`;
}

function escapeHtml(text) {
  return String(text)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

// ===============================
// 6. 倒计时渲染
// ===============================

function renderTimer() {
  const minutes = Math.floor(state.leftSeconds / 60);
  const seconds = state.leftSeconds % 60;

  timeText.textContent = `${String(minutes).padStart(2, "0")}:${String(
    seconds,
  ).padStart(2, "0")}`;

  const progress =
    state.totalSeconds > 0 ? 1 - state.leftSeconds / state.totalSeconds : 0;

  const offset = CIRCUMFERENCE * (1 - progress);
  progressRing.style.strokeDashoffset = String(offset);
}

function resetTimerFromInput() {
  const minutes = getMinutesValue();

  state.totalSeconds = minutes * 60;
  state.leftSeconds = state.totalSeconds;
  state.endAt = null;
  state.finished = false;

  renderTimer();
}

function updateLeftSecondsByClock() {
  if (!state.running || !state.endAt) {
    return;
  }

  const left = Math.ceil((state.endAt - Date.now()) / 1000);
  state.leftSeconds = Math.max(0, left);
}

// ===============================
// 7. 倒计时核心逻辑
// ===============================

function startTimer() {
  const eventName = eventNameInput.value.trim();

  if (!eventName) {
    setMessage("请先输入专注事件名称，比如：阅读论文。");
    return;
  }

  if (state.running) {
    return;
  }

  if (state.leftSeconds <= 0) {
    resetTimerFromInput();
  }

  state.running = true;
  state.finished = false;
  state.endAt = Date.now() + state.leftSeconds * 1000;

  statusText.textContent = "专注中";
  setMessage("进入专注模式，先把这一小段时间拿下。");

  saveFocusSession();

  clearInterval(state.timer);
  state.timer = setInterval(tickTimer, 500);

  tickTimer();
}

function tickTimer() {
  updateLeftSecondsByClock();
  renderTimer();

  if (state.running && state.leftSeconds <= 0 && !state.finished) {
    finishFocus();
  }
}

function pauseTimer() {
  if (!state.running) {
    return;
  }

  updateLeftSecondsByClock();

  state.running = false;
  state.endAt = null;

  clearInterval(state.timer);
  clearFocusSession();

  renderTimer();
  statusText.textContent = "已暂停";
  setMessage("暂停一下也没关系，回来继续。");
}

function resetTimer() {
  state.running = false;
  state.endAt = null;
  state.finished = false;

  clearInterval(state.timer);
  clearFocusSession();

  resetTimerFromInput();
  statusText.textContent = "准备开始";
  setMessage("");
}

// ===============================
// 8. 完成音效和动画
// ===============================

function playDoneSound() {
  try {
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    const audioContext = new AudioContext();

    // 音量大小，0.1 比较柔和，0.3 比较明显，建议不要超过 0.5
    const volume = 0.9;

    // 一段简单明显的完成提示旋律
    const melody = [
      { freq: 659, start: 0.0, duration: 0.18 }, // E5
      { freq: 784, start: 0.2, duration: 0.18 }, // G5
      { freq: 988, start: 0.4, duration: 0.22 }, // B5
      { freq: 1319, start: 0.68, duration: 0.38 }, // E6
      { freq: 988, start: 1.12, duration: 0.18 }, // B5
      { freq: 1319, start: 1.34, duration: 0.45 }, // E6
    ];

    melody.forEach((note) => {
      const oscillator = audioContext.createOscillator();
      const gain = audioContext.createGain();

      oscillator.type = "sine";
      oscillator.frequency.setValueAtTime(
        note.freq,
        audioContext.currentTime + note.start,
      );

      gain.gain.setValueAtTime(0, audioContext.currentTime + note.start);
      gain.gain.linearRampToValueAtTime(
        volume,
        audioContext.currentTime + note.start + 0.02,
      );
      gain.gain.exponentialRampToValueAtTime(
        0.001,
        audioContext.currentTime + note.start + note.duration,
      );

      oscillator.connect(gain);
      gain.connect(audioContext.destination);

      oscillator.start(audioContext.currentTime + note.start);
      oscillator.stop(audioContext.currentTime + note.start + note.duration);
    });

    // 手机震动提醒，部分浏览器支持
    if (navigator.vibrate) {
      navigator.vibrate([200, 80, 200, 80, 300]);
    }
  } catch (error) {
    console.error("播放提示音失败：", error);
  }
}

function celebrate() {
  document.body.animate(
    [
      { filter: "brightness(1)" },
      { filter: "brightness(1.08)" },
      { filter: "brightness(1)" },
    ],
    {
      duration: 650,
      easing: "ease-out",
    },
  );
}

// ===============================
// 9. 完成专注并打卡
// ===============================

async function finishFocus() {
  if (state.finished) {
    return;
  }

  state.finished = true;
  state.running = false;
  state.endAt = null;

  clearInterval(state.timer);
  clearFocusSession();

  state.leftSeconds = 0;
  renderTimer();

  statusText.textContent = "已完成";
  setMessage("专注完成，正在打卡……");

  playDoneSound();
  celebrate();

  const eventName = eventNameInput.value.trim();
  const focusMinutes = Math.max(1, Math.round(state.totalSeconds / 60));

  try {
    const response = await fetch(`${API_BASE}/api/checkins`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        user_id: userId,
        event_name: eventName,
        focus_minutes: focusMinutes,
        focus_seconds: state.totalSeconds,
        checkin_date: getTodayString(),
      }),
    });

    if (!response.ok) {
      throw new Error("打卡请求失败");
    }

    const data = await response.json();

    setMessage(`打卡成功！连续打卡 ${data.stats.continuous_streak} 天 ✦`);

    await loadStats();

    recordDateInput.value = getTodayString();
    await loadDayRecords(getTodayString());
  } catch (error) {
    console.error(error);

    setMessage("打卡失败：请检查后端是否启动，或者 API 地址是否正确。");

    // 这里不自动重复提交，避免网络恢复后重复打卡。
  }
}

// ===============================
// 10. 页面刷新后恢复倒计时
// ===============================

function restoreFocusSession() {
  const raw = localStorage.getItem(FOCUS_SESSION_KEY);

  if (!raw) {
    return false;
  }

  try {
    const session = JSON.parse(raw);

    if (!session.running || !session.endAt) {
      clearFocusSession();
      return false;
    }

    eventNameInput.value = session.eventName || eventNameInput.value;

    state.totalSeconds = Number(session.totalSeconds) || getMinutesValue() * 60;
    state.endAt = Number(session.endAt);
    state.running = true;
    state.finished = false;

    updateLeftSecondsByClock();
    renderTimer();

    if (state.leftSeconds <= 0) {
      finishFocus();
      return true;
    }

    statusText.textContent = "专注中";
    setMessage("已恢复正在进行的专注。");

    clearInterval(state.timer);
    state.timer = setInterval(tickTimer, 500);

    return true;
  } catch (error) {
    console.error(error);
    clearFocusSession();
    return false;
  }
}

// ===============================
// 11. 总统计
// ===============================

async function loadStats() {
  try {
    const response = await fetch(
      `${API_BASE}/api/stats?user_id=${encodeURIComponent(
        userId,
      )}&today=${getTodayString()}`,
    );

    if (!response.ok) {
      throw new Error("统计数据请求失败");
    }

    const data = await response.json();

    todayStatus.textContent = data.checked_today ? "已打卡" : "未打卡";
    streak.textContent = data.continuous_streak;
    totalDays.textContent = data.total_checkin_days;
    totalMinutes.textContent = data.total_minutes;

    if (!data.recent_dates || data.recent_dates.length === 0) {
      dateList.innerHTML = `
        <p class="empty">还没有打卡记录，完成一次专注后这里会亮起来。</p>
      `;
      return;
    }

    dateList.innerHTML = data.recent_dates
      .map((item) => `<span class="date-pill">${escapeHtml(item)}</span>`)
      .join("");
  } catch (error) {
    console.error(error);

    dateList.innerHTML = `
      <p class="empty">暂时无法连接后端，请确认 FastAPI 已启动。</p>
    `;
  }
}

// ===============================
// 12. 每日打卡明细
// ===============================

async function loadDayRecords(dateValue = getTodayString()) {
  try {
    const response = await fetch(
      `${API_BASE}/api/day-records?user_id=${encodeURIComponent(
        userId,
      )}&checkin_date=${dateValue}`,
    );

    if (!response.ok) {
      throw new Error("每日打卡明细请求失败");
    }

    const data = await response.json();

    if (!data.records || data.records.length === 0) {
      daySummary.textContent = `${data.date} 暂无打卡记录。`;

      dayRecordList.innerHTML = `
        <div class="empty-record">
          这一天还没有完成专注打卡。
        </div>
      `;

      return;
    }

    daySummary.textContent = `${data.date} 共完成 ${data.total_events} 次打卡，总计 ${formatTotalDuration(
      data.total_minutes,
    )}。`;

    dayRecordList.innerHTML = data.records
      .map((item) => {
        return `
          <div class="day-record-item">
            <div class="day-record-main">
              <p class="day-record-name">${escapeHtml(item.event_name)}</p>
              <p class="day-record-time">完成时间：${escapeHtml(
                formatCreatedTime(item.created_at),
              )}</p>
            </div>

            <div class="day-record-duration">
              ${escapeHtml(formatTotalDuration(item.focus_minutes))}
            </div>
          </div>
        `;
      })
      .join("");
  } catch (error) {
    console.error(error);

    daySummary.textContent = "暂时无法加载每日打卡明细。";

    dayRecordList.innerHTML = `
      <div class="empty-record">
        请检查后端是否启动，或者 API 地址是否正确。
      </div>
    `;
  }
}

// ===============================
// 13. 页面事件监听
// ===============================

startBtn.addEventListener("click", startTimer);
pauseBtn.addEventListener("click", pauseTimer);
resetBtn.addEventListener("click", resetTimer);

focusMinutesInput.addEventListener("change", () => {
  if (!state.running) {
    resetTimerFromInput();
  }
});

queryDateBtn.addEventListener("click", () => {
  const dateValue = recordDateInput.value || getTodayString();
  loadDayRecords(dateValue);
});

recordDateInput.addEventListener("change", () => {
  const dateValue = recordDateInput.value || getTodayString();
  loadDayRecords(dateValue);
});

// ===============================
// 14. 解决移动端切后台倒计时暂停问题
// ===============================

document.addEventListener("visibilitychange", () => {
  if (!document.hidden && state.running) {
    tickTimer();
  }
});

window.addEventListener("focus", () => {
  if (state.running) {
    tickTimer();
  }
});

window.addEventListener("pageshow", () => {
  if (state.running) {
    tickTimer();
  }
});

// ===============================
// 15. 页面初始化
// ===============================

recordDateInput.value = getTodayString();

const restored = restoreFocusSession();

if (!restored) {
  resetTimerFromInput();
}

loadStats();
loadDayRecords(getTodayString());
