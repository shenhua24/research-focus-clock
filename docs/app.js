// 本地开发用这个：
// const API_BASE = "http://127.0.0.1:8000";

// 部署后，把这里改成你的 Render 后端地址，例如：
// const API_BASE = "https://research-focus-clock-api.onrender.com";
const API_BASE = "http://127.0.0.1:8000";

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

const state = {
  totalSeconds: 25 * 60,
  leftSeconds: 25 * 60,
  running: false,
  timer: null,
};

function getUserId() {
  let id = localStorage.getItem("research_focus_user_id");

  if (!id) {
    if (crypto && crypto.randomUUID) {
      id = crypto.randomUUID();
    } else {
      id = `user-${Date.now()}`;
    }

    localStorage.setItem("research_focus_user_id", id);
  }

  return id;
}

const userId = getUserId();

function getTodayString() {
  const now = new Date();
  const local = new Date(now.getTime() - now.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 10);
}

function formatCreatedTime(value) {
  if (!value) {
    return "";
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
}

function formatTotalDuration(minutes) {
  if (minutes < 60) {
    return `${minutes} 分钟`;
  }

  const hours = Math.floor(minutes / 60);
  const leftMinutes = minutes % 60;

  if (leftMinutes === 0) {
    return `${hours} 小时`;
  }

  return `${hours} 小时 ${leftMinutes} 分钟`;
}
function getMinutesValue() {
  const value = Number(focusMinutesInput.value);

  if (!Number.isFinite(value) || value < 1) {
    return 25;
  }

  return Math.min(Math.floor(value), 240);
}

function renderTimer() {
  const minutes = Math.floor(state.leftSeconds / 60);
  const seconds = state.leftSeconds % 60;

  timeText.textContent = `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;

  const progress = 1 - state.leftSeconds / state.totalSeconds;
  const offset = CIRCUMFERENCE * (1 - progress);
  progressRing.style.strokeDashoffset = String(offset);
}

function resetTimerFromInput() {
  const minutes = getMinutesValue();
  state.totalSeconds = minutes * 60;
  state.leftSeconds = state.totalSeconds;
  renderTimer();
}

function setMessage(text) {
  message.textContent = text;
}

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
  statusText.textContent = "专注中";
  setMessage("进入专注模式，先把这一小段时间拿下。");

  state.timer = setInterval(() => {
    state.leftSeconds -= 1;
    renderTimer();

    if (state.leftSeconds <= 0) {
      finishFocus();
    }
  }, 1000);
}

function pauseTimer() {
  state.running = false;
  clearInterval(state.timer);
  statusText.textContent = "已暂停";
  setMessage("暂停一下也没关系，回来继续。");
}

function resetTimer() {
  state.running = false;
  clearInterval(state.timer);
  resetTimerFromInput();
  statusText.textContent = "准备开始";
  setMessage("");
}

function playDoneSound() {
  try {
    const audioContext = new AudioContext();
    const oscillator = audioContext.createOscillator();
    const gain = audioContext.createGain();

    oscillator.connect(gain);
    gain.connect(audioContext.destination);

    oscillator.frequency.value = 660;
    gain.gain.value = 0.08;

    oscillator.start();
    oscillator.stop(audioContext.currentTime + 0.18);
  } catch (error) {
    // 浏览器不允许自动播放时，忽略即可。
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

async function finishFocus() {
  state.running = false;
  clearInterval(state.timer);
  state.leftSeconds = 0;
  renderTimer();

  statusText.textContent = "已完成";
  setMessage("专注完成，正在打卡……");
  playDoneSound();
  celebrate();

  const eventName = eventNameInput.value.trim();
  const focusMinutes = getMinutesValue();

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
        focus_seconds: focusMinutes * 60,
        checkin_date: getTodayString(),
      }),
    });

    if (!response.ok) {
      throw new Error("打卡请求失败");
    }

    const data = await response.json();

    setMessage(`打卡成功！连续打卡 ${data.stats.continuous_streak} 天 ✦`);
    await loadStats();
    await loadDayRecords(getTodayString());
  } catch (error) {
    setMessage("打卡失败：请检查后端是否启动，或者 API 地址是否正确。");
  }
}

async function loadStats() {
  try {
    const response = await fetch(
      `${API_BASE}/api/stats?user_id=${encodeURIComponent(userId)}&today=${getTodayString()}`,
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
      dateList.innerHTML = `<p class="empty">还没有打卡记录，完成一次专注后这里会亮起来。</p>`;
      return;
    }

    dateList.innerHTML = data.recent_dates
      .map((item) => `<span class="date-pill">${item}</span>`)
      .join("");
  } catch (error) {
    dateList.innerHTML = `<p class="empty">暂时无法连接后端，请确认 FastAPI 已启动。</p>`;
  }
}

startBtn.addEventListener("click", startTimer);
pauseBtn.addEventListener("click", pauseTimer);
resetBtn.addEventListener("click", resetTimer);
queryDateBtn.addEventListener("click", () => {
  const dateValue = recordDateInput.value || getTodayString();
  loadDayRecords(dateValue);
});

recordDateInput.addEventListener("change", () => {
  const dateValue = recordDateInput.value || getTodayString();
  loadDayRecords(dateValue);
});

focusMinutesInput.addEventListener("change", () => {
  if (!state.running) {
    resetTimerFromInput();
  }
});
async function loadDayRecords(dateValue = getTodayString()) {
  try {
    const response = await fetch(
      `${API_BASE}/api/day-records?user_id=${encodeURIComponent(userId)}&checkin_date=${dateValue}`,
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

    daySummary.textContent = `${data.date} 共完成 ${data.total_events} 次打卡，总计 ${formatTotalDuration(data.total_minutes)}。`;

    dayRecordList.innerHTML = data.records
      .map((item) => {
        return `
          <div class="day-record-item">
            <div class="day-record-main">
              <p class="day-record-name">${item.event_name}</p>
              <p class="day-record-time">完成时间：${formatCreatedTime(item.created_at)}</p>
            </div>

            <div class="day-record-duration">
              ${formatTotalDuration(item.focus_minutes)}
            </div>
          </div>
        `;
      })
      .join("");
  } catch (error) {
    daySummary.textContent = "暂时无法加载每日打卡明细。";
    dayRecordList.innerHTML = `
      <div class="empty-record">
        请检查后端是否启动，或者 API 地址是否正确。
      </div>
    `;
  }
}
recordDateInput.value = getTodayString();

resetTimerFromInput();
loadStats();
loadDayRecords(getTodayString());
