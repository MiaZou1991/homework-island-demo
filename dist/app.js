// ================= 作业岛·小岛日历 =================
// 一个轻量级家庭作业管理小游戏
// 数据保存在浏览器 localStorage

// ---- 运行时错误收集 ----
// 这个应用没有登录、没有后台日志，用户反馈"页面看着不对"时很难定位。
// 这里把运行时错误统一收进 window.__ISLAND_ERRORS__，方便在浏览器控制台一眼看到底哪段炸了。
window.__ISLAND_ERRORS__ = window.__ISLAND_ERRORS__ || [];
window.addEventListener('error', e => {
    window.__ISLAND_ERRORS__.push('[error] ' + (e.message || '') + ' @' + (e.filename || '') + ':' + (e.lineno || 0));
});
window.addEventListener('unhandledrejection', e => {
    window.__ISLAND_ERRORS__.push('[promise] ' + (e.reason && e.reason.message ? e.reason.message : String(e.reason)));
});

// ---- 资源版本自检 ----
// 手机浏览器容易把 HTML / JS 缓存成不同版本，导致页面"看起来更新了但功能是旧的"
// （典型症状：展示墙没渲染出格子，只剩一条木纹底）。
// 这里在页面刚打开时对比版本号，不一致就自动拉一次最新页面；每个版本只重试一次，不会循环刷新。
const BUILD_VERSION = '20261018-demo-integrated';
(function checkBuildVersion() {
    try {
        const htmlVer = window.__ISLAND_BUILD__;
        if (!htmlVer || htmlVer === BUILD_VERSION) return;
        const key = 'island_reload_' + htmlVer + '_' + BUILD_VERSION;
        if (sessionStorage.getItem(key)) return;
        sessionStorage.setItem(key, '1');
        location.reload();
    } catch (e) { /* 隐私模式下 sessionStorage 不可用时忽略 */ }
})();

const STORAGE_KEY = 'homework_island_integrated_demo_v2';
function activeStorageKey() {
    try { return typeof DEMO_KEY !== 'undefined' && DEMO_KEY ? DEMO_KEY : STORAGE_KEY; }
    catch (_) { return STORAGE_KEY; }
}

// 默认奖励（小动物伙伴）
const REWARDS = [
    { emoji: '🐻', name: '小熊', points: 0 },
    { emoji: '🐰', name: '小兔', points: 30 },
    { emoji: '🐺', name: '小狐', points: 80 },
    { emoji: '🐱', name: '小猫', points: 150 },
    { emoji: '🐶', name: '小狗', points: 240 },
    { emoji: '🐼', name: '熊猫', points: 350 },
    { emoji: '🐦', name: '猫头鹰', points: 480 },
    { emoji: '🐿️', name: '小松鼠', points: 630 },
    { emoji: '🐯', name: '小狮子', points: 800 },
    { emoji: '🐴', name: '独角兽', points: 1000 }
];

// 收集品分组：完成作业掉落的宝贝按这几片海域摆上展示墙
const MATERIAL_GROUPS = [
    { id: 'isle',    name: '岛上原野', emo: '🌴' },
    { id: 'shallow', name: '浅海',     emo: '🏖️' },
    { id: 'deep',    name: '深海',     emo: '🌊' },
    { id: 'legend',  name: '传说',     emo: '🐳' }
];

// 收集材料（完成作业时掉落，摆满整面展示墙）
// ⚠️ id 是历史字段，已经收集过的宝贝都按 id 记账 —— 改 id 等于把孩子已收集的东西清零，
//    所以只允许新增，绝不改老 id。
// w = 掉落权重（数字越小越稀有）；group = 展示墙分区。
const MATERIALS = [
    // ---- 岛上原野（第一批 10 种，老数据都记在这些 id 上）----
    { id: 'wood',     emoji: '🌾', name: '木材', group: 'isle',    w: 4 },
    { id: 'stone',    emoji: '💠', name: '石头', group: 'isle',    w: 4 },
    { id: 'branch',   emoji: '🌿', name: '树枝', group: 'isle',    w: 4 },
    { id: 'leaf',     emoji: '🍃', name: '树叶', group: 'isle',    w: 4 },
    { id: 'flower',   emoji: '🌸', name: '樱花', group: 'isle',    w: 3 },
    { id: 'apple',    emoji: '🍎', name: '苹果', group: 'isle',    w: 3 },
    { id: 'orange',   emoji: '🍊', name: '橘子', group: 'isle',    w: 3 },
    { id: 'pear',     emoji: '🍐', name: '梨子', group: 'isle',    w: 3 },
    { id: 'cherry',   emoji: '🍒', name: '樱桃', group: 'isle',    w: 3 },
    { id: 'bell',     emoji: '💰', name: '铃钱', group: 'isle',    w: 2 },

    // ---- 浅海：常见，一两次作业就能碰到 ----
    // ⚠️ emoji 全部限定在 emoji 1.0(2015) 安全区：安卓老系统（<7）没有 emoji 12/13 的字形，
    //    会渲染成豆腐块 □。所以宁可挑一个"像但不完全一样"的，也不引入新码位。
    { id: 'shell',    emoji: '🐚', name: '贝壳', group: 'shallow', w: 3 },
    { id: 'fish',     emoji: '🐟', name: '小鱼', group: 'shallow', w: 3 },
    { id: 'shrimp',   emoji: '🍤', name: '小虾', group: 'shallow', w: 3 },
    { id: 'clownfish',emoji: '🐠', name: '小丑鱼', group: 'shallow', w: 3 },
    { id: 'puffer',   emoji: '🐡', name: '河豚', group: 'shallow', w: 2 },
    { id: 'crab',     emoji: '🐚', name: '螃蟹', group: 'shallow', w: 2 },
    { id: 'coral',    emoji: '🌺', name: '珊瑚', group: 'shallow', w: 2 },

    // ---- 深海：比较难遇 ----
    { id: 'seahorse', emoji: '🐎', name: '海马', group: 'deep',    w: 2 },
    { id: 'jellyfish',emoji: '☁️', name: '水母', group: 'deep',    w: 2 },
    { id: 'octopus',  emoji: '🐙', name: '章鱼', group: 'deep',    w: 2 },
    { id: 'squid',    emoji: '🐟', name: '鱿鱼', group: 'deep',    w: 2 },
    { id: 'turtle',   emoji: '🐢', name: '海龟', group: 'deep',    w: 1 },
    { id: 'lobster',  emoji: '🍤', name: '龙虾', group: 'deep',    w: 1 },

    // ---- 传说：很稀有，遇到了要高兴一整天 ----
    { id: 'dolphin',  emoji: '🐬', name: '海豚', group: 'legend',  w: 1 },
    { id: 'whale',    emoji: '🐳', name: '鲸鱼', group: 'legend',  w: 1 },
    { id: 'humpback', emoji: '🐋', name: '座头鲸', group: 'legend', w: 1 },
    { id: 'shark',    emoji: '🐋', name: '鲨鱼', group: 'legend',  w: 1 }
];

function materialGroup(g) {
    return MATERIAL_GROUPS.find(x => x.id === g) || MATERIAL_GROUPS[0];
}

// ================= 数据层 =================
function getData() {
    try {
        const raw = localStorage.getItem(activeStorageKey());
        if (!raw) return createDefaultData();
        const parsed = JSON.parse(raw);
        return { ...createDefaultData(), ...parsed };
    } catch (e) {
        return createDefaultData();
    }
}

// 家长可维护的兑换清单默认值：
//   type='mate'  → 动物伙伴，兑换后可选中「今天陪你写作业」
//   type='prize' → 实物 / 活动奖励（游乐场、零食…），兑换后进「我的奖励」等家长兑现
function defaultRewardItems() {
    return [
        ...REWARDS.map((r, i) => ({
            id: 'rw_mate_' + i,
            type: 'mate',
            emoji: r.emoji,
            name: r.name,
            points: r.points,
            desc: '',
            repeatable: false,
            active: true
        })),
        { id: 'rw_play',  type: 'prize', emoji: '🎡', name: '游乐场玩一次', points: 100, desc: '周末去游乐场畅玩半天', repeatable: true, active: true },
        { id: 'rw_snack', type: 'prize', emoji: '🍦', name: '一个冰淇淋',   points: 20,  desc: '兑换一个喜欢的口味',   repeatable: true, active: true }
    ];
}

function createDefaultData() {
    return {
        homework: [],
        recurringTasks: [],
        materials: {},
        points: 0,
        totalCompleted: 0,
        currentStreak: 0,
        lastCompletedDate: null,
        rewardsUnlocked: ['🐻'],   // 已兑换/已拥有的伙伴 emoji
        todayMate: null,          // 今天陪写作业的伙伴 emoji
        mateDate: null,           // 上面这个选择是哪天的（跨天自动重置）
        // ---- 孩子资料（儿童端「我的」里自己改）----
        kidName: '小岛主',
        kidMood: '',
        kidAvatar: '👦',
        // ---- 积分兑换 ----
        rewardItems: defaultRewardItems(),  // 家长可增删改的兑换清单
        redemptions: [],// 兑换记录 {id,itemId,name,emoji,points,type,at,fulfilled}
        // ---- 兴趣班 / 固定课表（2026-10-17 起）----
        // classes：每周重复的固定安排，按 days（0=周日 … 6=周六）落在某几天
        //   {id,name,emoji,days[],start,end,place,bring[],wear,points,active}
        // classCheckins：按「日期|课程ID」记录当天打卡与携带物勾选
        //   {done:true, completedAt, items:{物品名:true}, pointsAwarded}
        classes: [],
        classCheckins: {},
        // ---- 自由日程 / 事件（2026-10-17 改版「今日岛屿」起）----
        // events：孩子或家长自己添加的一次性安排（阅读/运动/练琴…），不自动给积分。
        //   {id, owner:'child'|'parent', title, emoji, date:'YYYY-MM-DD',
        //    start:'HH:MM'|null, end:'HH:MM'|null,
        //    checklist:[{name,done}], note, done, createdAt}
        // 注意：id 一旦生成不可改（历史勾选按 id 记账）；只增不改。
        events: []
    };
}

function saveData(data) {
    localStorage.setItem(activeStorageKey(), JSON.stringify(data));
    // 保存到本地后再同步到云端（跨设备共享同一份作业数据）
    if (typeof IslandSync !== 'undefined') IslandSync.schedulePush(data);
}

// 云端拉到更新的数据后，按当前页面重新渲染
function refreshCurrentView() {
    const bodyMode = document.body.getAttribute('data-mode');
    try {
        if (bodyMode === 'child') renderChild();
        else if (bodyMode === 'parent') renderParent();
    } catch (e) {
        /* 页面元素缺失时忽略，等下次同步再渲染 */
    }
}

// 完成 / 撤销 / 删除作业后：按当前所在的子页面刷新，而不是只重画首页首屏
function refreshAfterChange() {
    const bodyMode = document.body.getAttribute('data-mode');
    const cur = document.querySelector('.view.on');
    try {
        if (bodyMode === 'parent') {
            renderParent();
            if (cur) gotoParentView(cur.dataset.view);
        } else if (bodyMode === 'child') {
            renderChild();
            if (cur) gotoChildView(cur.dataset.view);
        }
    } catch (e) {
        console.warn('[刷新] 变更后重绘失败：', e);
        // 以前这里只写 console，手机上完全看不出来，表现就是"保存了但页面没反应"。
        // 现在至少明确告诉用户一次。
        showToast('页面刷新出了点小问题，下拉刷新一下就好');
    }
}

function generateId() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

function todayStr() {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// ================= 兴趣班 / 固定课表 =================
// 定位这一天（0=周日 … 6=周六），默认今天
function dateWeekday(d) {
    const x = d ? new Date(d) : new Date();
    return x.getDay();
}

function dateStr(d) {
    const x = d ? new Date(d) : new Date();
    return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`;
}

// 某一天的课：按开始时间升序
function classesOnDay(data, day) {
    const wd = typeof day === 'number' ? day : dateWeekday(day);
    return (data.classes || [])
        .filter(c => c.active !== false && Array.isArray(c.days) && c.days.includes(wd))
        .sort((a, b) => String(a.start || '').localeCompare(String(b.start || '')));
}

function classCheckin(data, classId, day) {
    const d = typeof day === 'string' ? day : dateStr(day);
    return (data.classCheckins || {})[`${d}|${classId}`] || null;
}

function setClassCheckin(data, classId, patch, day) {
    const d = typeof day === 'string' ? day : dateStr(day);
    if (!data.classCheckins) data.classCheckins = {};
    const key = `${d}|${classId}`;
    data.classCheckins[key] = Object.assign({ items: {} }, data.classCheckins[key], patch);
}

// 'HH:MM' → 分钟数；空值返回 null（表示"不限时"，排时间线时放最后）
function timeToMin(t) {
    if (!t || typeof t !== 'string') return null;
    const m = t.match(/^(\d{1,2}):(\d{2})$/);
    if (!m) return null;
    const h = parseInt(m[1], 10), mi = parseInt(m[2], 10);
    if (isNaN(h) || isNaN(mi) || h > 23 || mi > 59) return null;
    return h * 60 + mi;
}

function formatMin(min) {
    if (min == null) return '';
    const h = Math.floor(min / 60), m = min % 60;
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

const CLASS_POINTS_DEFAULT = 10;   // 单节课默认积分（用户确认：10 分）

// 今天/指定日的完整时间线：作业 + 兴趣班按时间混排
// 作业没有具体钟点，统一排在 16:30（放学后写作业的常见起点），排在兴趣班之前。
function buildDayTimeline(data, day) {
    const d = typeof day === 'string' ? new Date(day + 'T00:00:00') : (day ? new Date(day) : new Date());
    const isToday = isSameDayOf(d, new Date());
    const items = [];

    const hw = (data.homework || []).filter(h => {
        const td = taskDate(h);
        return td && isSameDayOf(td, d);
    });
    hw.forEach(h => {
        items.push({
            kind: 'homework',
            id: h.id,
            hw: h,
            time: 16 * 60 + 30,
            done: !!h.done
        });
    });

    classesOnDay(data, d).forEach(c => {
        items.push({
            kind: 'class',
            id: c.id,
            cls: c,
            time: timeToMin(c.start),
            checkin: classCheckin(data, c.id, dateStr(d)),
            done: !!classCheckin(data, c.id, dateStr(d))?.done
        });
    });

    // 自由日程 / 事件：孩子或家长自己加的安排，落在指定日期，与作业、课表同一条轴。
    (data.events || []).forEach(e => {
        if (!e || e.date !== dateStr(d)) return;
        items.push({
            kind: 'event',
            id: e.id,
            ev: e,
            time: timeToMin(e.start),
            done: !!e.done
        });
    });

    items.sort((a, b) => (a.time == null ? 99999 : a.time) - (b.time == null ? 99999 : b.time));
    return { date: dateStr(d), isToday, items };
}

// ---------- 携带物逐项勾选 ----------
// 勾一项就存一项，孩子自己一项项核对；家长补充物品也会保留已勾的状态。
function toggleBringItem(classId, itemName, day) {
    const data = getData();
    const d = typeof day === 'string' ? day : dateStr(day);
    const cur = classCheckin(data, classId, d) || { items: {} };
    if (!cur.items) cur.items = {};
    cur.items[itemName] = !cur.items[itemName];
    setClassCheckin(data, classId, cur, d);
    saveData(data);
    refreshAfterChange();

    const cls = (data.classes || []).find(c => c.id === classId);
    const all = (cls && cls.bring) || [];
    const doneCount = all.filter(x => cur.items[x]).length;
    if (doneCount === all.length && all.length > 0) {
        showToast('东西都带齐啦，可以出发 🎒');
    } else {
        showToast(`已勾 ${doneCount} / ${all.length} 项`);
    }
    return cur;
}

// 家长给某节课补充携带物（不改已有勾选状态）
function addBringItem(classId, itemName) {
    const name = (itemName || '').trim();
    if (!name) return false;
    const data = getData();
    const c = (data.classes || []).find(x => x.id === classId);
    if (!c) return false;
    if (!Array.isArray(c.bring)) c.bring = [];
    if (c.bring.includes(name)) { showToast('已经有这一项了'); return false; }
    c.bring.push(name);
    saveData(data);
    refreshAfterChange();
    showToast('已添加：' + name);
    return true;
}

function removeBringItem(classId, itemName) {
    const data = getData();
    const c = (data.classes || []).find(x => x.id === classId);
    if (!c || !Array.isArray(c.bring)) return false;
    c.bring = c.bring.filter(x => x !== itemName);
    saveData(data);
    refreshAfterChange();
    return true;
}

// ---------- 兴趣班打卡 ----------
// 上完课打卡 → 加积分（默认 10）、计数。同一天同一节课只给一次分，撤销会扣回去。
function checkinClass(classId, day) {
    const data = getData();
    const d = typeof day === 'string' ? day : dateStr(day);
    const c = (data.classes || []).find(x => x.id === classId);
    if (!c) return false;
    const cur = classCheckin(data, classId, d) || { items: {} };

    if (cur.done) {                       // 再点一次 = 撤销
        const back = cur.pointsAwarded || (c.points || CLASS_POINTS_DEFAULT);
        data.points = Math.max(0, (data.points || 0) - back);
        cur.done = false;
        cur.completedAt = null;
        cur.pointsAwarded = 0;
        setClassCheckin(data, classId, cur, d);
        saveData(data);
        refreshAfterChange();
        showToast('已取消打卡，扣回 ' + back + ' 分');
        return false;
    }

    const gain = c.points || CLASS_POINTS_DEFAULT;
    data.points = (data.points || 0) + gain;
    cur.done = true;
    cur.completedAt = new Date().toISOString();
    cur.pointsAwarded = gain;
    setClassCheckin(data, classId, cur, d);
    grantMaterialRewards(data);
    saveData(data);
    refreshAfterChange();
    fireConfetti();
    showToast(`${c.name} 完成！+${gain} 分`);
    return true;
}

function formatDateTime(iso) {
    if (!iso) return '';
    const d = new Date(iso);
    return `${d.getMonth() + 1}月${d.getDate()}日 ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

function isOverdue(deadline) {
    if (!deadline) return false;
    return new Date(deadline) < new Date();
}

function isSameDay(a, b) {
    const da = new Date(a);
    const db = new Date(b);
    return da.getFullYear() === db.getFullYear() &&
           da.getMonth() === db.getMonth() &&
           da.getDate() === db.getDate();
}

function isYesterday(a, b) {
    const da = new Date(a);
    const db = new Date(b);
    const diff = (new Date(da.getFullYear(), da.getMonth(), da.getDate()).getTime() -
                  new Date(db.getFullYear(), db.getMonth(), db.getDate()).getTime()) / (1000 * 60 * 60 * 24);
    return diff === 1;
}

// ================= UI 层：通用 =================
function $(id) { return document.getElementById(id); }

let currentMode = 'parent';

function switchMode(mode) {
    currentMode = mode;
    const parentView = $('parent-view');
    const childView = $('child-view');
    const btnParent = $('btn-parent');
    const btnChild = $('btn-child');

    if (parentView) parentView.classList.toggle('active', mode === 'parent');
    if (childView) childView.classList.toggle('active', mode === 'child');
    if (btnParent) btnParent.classList.toggle('active', mode === 'parent');
    if (btnChild) btnChild.classList.toggle('active', mode === 'child');

    // 生成今天的周期任务实例
    generateRecurringTasks();

    if (mode === 'parent') {
        renderParent();
    } else {
        renderChild();
        startIslandEvents();
    }
}

function switchParentTab(tab) {
    document.querySelectorAll('.tab-btn').forEach((btn, idx) => {
        const on = (tab === 'manual' && idx === 0) || (tab === 'ocr' && idx === 1);
        btn.classList.toggle('active', on);
        btn.classList.toggle('done', on);
    });
    const m = $('tab-manual'), o = $('tab-ocr');
    if (m) m.classList.toggle('active', tab === 'manual');
    if (o) o.classList.toggle('active', tab === 'ocr');
}

// ================= 端内视图切换 =================
// 儿童端 / 家长端各自用一个 html 承载多个页面，靠底部 tab 或 gotoXxxView() 切换。
// 每个页面在「进入时」才渲染，避免一次渲染 5 个页面。
const CHILD_TAB_OF_VIEW = { home: 'home', calendar: 'calendar', report: 'report', achieve: 'achieve', shop: 'shop' };

function scrollPageTop() {
    const phone = document.querySelector('.phone');
    if (phone && phone.scrollTop > 0) phone.scrollTop = 0;
    window.scrollTo(0, 0);
}

function showView(view) {
    document.querySelectorAll('.view').forEach(s => s.classList.toggle('on', s.dataset.view === view));
}

function gotoChildView(view) {
    if (!$('child-points')) return;
    showView(view);
    const tab = CHILD_TAB_OF_VIEW[view] || 'home';
    document.querySelectorAll('.tabbar .tab').forEach(b => b.classList.toggle('on', b.dataset.tab === tab));
    try {
        const data = getData();
        // 首页也要重绘：完成作业后切回首页，列表不能还是旧的
        if (view === 'home') {
            renderChildTopbar(data);
            renderChildHome(data);
            renderChildTimelineForDay();
        }
        if (view === 'calendar') {
            renderChildMonth();
            renderChildCalendarDay();
        }
        if (view === 'report')   renderChildReportPage(data);
        if (view === 'achieve')  renderChildAchieve(data);
        if (view === 'shop')     renderShop(data);
    } catch (e) {
        console.warn('[视图] ' + view + ' 渲染失败：', e);
    }
    scrollPageTop();
}

function gotoParentView(view) {
    if (!$('p-total')) return;
    showView(view);
    document.querySelectorAll('.tabbar .tab').forEach(b => b.classList.toggle('on', b.dataset.tab === view));
    try {
        const data = getData();
        if (view === 'home')     renderParent();
        if (view === 'review')   renderParentReview(data);
        if (view === 'report')   renderParentReport(data);
        if (view === 'reward')   renderParentReward(data);
        if (view === 'classes')  renderParentClasses(data);
        if (view === 'settings') renderParentSettings(data);
    } catch (e) {
        console.warn('[视图] ' + view + ' 渲染失败：', e);
    }
    scrollPageTop();
}

function setText(id, value) {
    const el = $(id);
    if (el) el.textContent = value;
}

// ================= 底部导航 =================
// 底栏的 tab 是 <span>（为了做动森那种木牌质感，没用 <button>），
// 所以不会自带点击行为 —— 必须在这里显式绑定，否则点了完全没反应。
function initTabbar() {
    const isParent = document.body.getAttribute('data-mode') === 'parent';
    document.querySelectorAll('.tabbar .tab').forEach(el => {
        const tab = el.dataset.tab;
        if (!tab) return;
        if (!el.hasAttribute('role')) el.setAttribute('role', 'button');
        if (!el.hasAttribute('tabindex')) el.setAttribute('tabindex', '0');

        const go = () => {
            if (isParent) gotoParentView(tab);
            else gotoChildView(tab);
        };
        el.addEventListener('click', go);
        el.addEventListener('keydown', e => {
            if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); go(); }
        });
    });
}

// 科目 → 图标 / 配色
const SUBJECT_ICON  = { '语文': '📖', '数学': '🔢', '英语': '🔤', '科学': '🔬', '美术': '🎨', '音乐': '🎵', '体育': '🏃', '其他': '📌' };
const SUBJECT_CLASS = { '语文': 'i-chinese', '数学': 'i-math', '英语': 'i-english', '科学': 'i-science', '美术': 'i-art', '音乐': 'i-music', '体育': 'i-pe', '其他': 'i-other' };
function subjectIcon(s) { return SUBJECT_ICON[s] || '📌'; }
function subjectClass(s) { return SUBJECT_CLASS[s] || 'i-other'; }

// 取某天的 00:00，用于按天归集
function dayKey(d) {
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// ================= 家长端：课表管理 =================
const CLASS_EMOJI_CHOICES = ['🏊', '🎹', '🎨', '🎵', '⚽', '🏀', '🎾', '🤸',
                             '🚴', '⛷️', '🎭', '📚', '🔬', '🩰', '🎪', '🎯'];
const CLASS_DAY_NAMES = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];

// 一周课表：按周一 → 周日排（国内作息习惯，周一是工作日第一天）
const CLASS_WEEK_ORDER = [1, 2, 3, 4, 5, 6, 0];

function renderParentClasses(data) {
    const host = $('p-class-week');
    if (!host) return;

    const classes = data.classes || [];
    setText('p-class-count', `${classes.length} 门课`);

    if (!classes.length) {
        host.innerHTML = `
            <div class="empty-state">
                <span class="big-emoji">🎒</span>
                <p>还没有添加兴趣班。<br>点下面「添加兴趣班」，把它排进每周日程。</p>
            </div>`;
        return;
    }

    const todayWd = dateWeekday();
    host.innerHTML = CLASS_WEEK_ORDER.map(wd => {
        const list = classes
            .filter(c => c.active !== false && Array.isArray(c.days) && c.days.includes(wd))
            .sort((a, b) => String(a.start || '').localeCompare(String(b.start || '')));
        if (!list.length) {
            return `<div class="wk-col empty${wd === todayWd ? ' today' : ''}">
                <div class="wk-head"><b>${CLASS_DAY_NAMES[wd]}</b>${wd === todayWd ? '<span class="wk-today">今天</span>' : ''}</div>
                <div class="wk-body"><span class="wk-none">空闲</span></div>
            </div>`;
        }
        return `<div class="wk-col${wd === todayWd ? ' today' : ''}">
            <div class="wk-head"><b>${CLASS_DAY_NAMES[wd]}</b>${wd === todayWd ? '<span class="wk-today">今天</span>' : ''}</div>
            <div class="wk-body">
                ${list.map(c => `
                    <div class="wk-card" onclick="openClassEditor('${c.id}')" role="button" tabindex="0">
                        <div class="wk-top">
                            <span class="wk-emo">${c.emoji || '📌'}</span>
                            <b class="wk-name">${escapeHtml(c.name)}</b>
                        </div>
                        <div class="wk-time">${escapeHtml(c.start || '')}${c.end ? '–' + escapeHtml(c.end) : ''}</div>
                        ${c.place ? `<div class="wk-line">📍 ${escapeHtml(c.place)}</div>` : ''}
                        ${(c.bring || []).length ? `<div class="wk-bring">🎒 ${c.bring.length} 项</div>` : ''}
                        <div class="wk-pts">+${c.points || CLASS_POINTS_DEFAULT} 分</div>
                    </div>`).join('')}
            </div>
        </div>`;
    }).join('');

    // 手机上 7 天放不下，今天多半在屏幕外（第 6 天往后）。
    // 渲染完自动把"今天"滚到中间，否则用户打开课表先看到的是周一。
    const todayCol = host.querySelector('.wk-col.today');
    if (todayCol && host.scrollWidth > host.clientWidth) {
        requestAnimationFrame(() => {
            const target = todayCol.offsetLeft - host.clientWidth / 2 + todayCol.offsetWidth / 2;
            host.scrollLeft = Math.max(0, target);
        });
    }
}

let editingClassId = null;
let classEmojiPick = '🏊';

function openClassEditor(id) {
    const data = getData();
    const c = id ? (data.classes || []).find(x => x.id === id) : null;
    const days = (c && Array.isArray(c.days)) ? c.days : [1, 3, 5];

    // 顺序很重要：closeClassEditor() 内部会把 editingClassId 清成 null。
    // 先 close（拆掉上一个弹层）再赋值，否则点「编辑」也会被降级成「新增」。
    closeClassEditor();
    editingClassId = c ? c.id : null;
    classEmojiPick = c ? (c.emoji || '🏊') : '🏊';
    const mask = document.createElement('div');
    mask.id = 'class-editor-mask';
    mask.className = 'hw-editor-mask';
    mask.onclick = closeClassEditor;

    const sheet = document.createElement('div');
    sheet.id = 'class-editor';
    sheet.className = 'hw-editor';
    sheet.innerHTML = `
        <div class="hw-editor-head">
            <h3>${c ? '✏️ 编辑兴趣班' : '🎒 添加兴趣班'}</h3>
            <button class="hw-editor-close" onclick="closeClassEditor()" aria-label="关闭">✕</button>
        </div>
        <div class="hw-editor-body">
            <div class="form-row">
                <label>课程名称</label>
                <input type="text" id="ce-name" maxlength="12" value="${c ? escapeHtml(c.name) : ''}" placeholder="例如：游泳课">
            </div>

            <div class="form-row">
                <label>每周哪几天</label>
                <div class="ce-days">
                    ${CLASS_WEEK_ORDER.map(wd => `
                        <button type="button" class="ce-day ${days.includes(wd) ? 'on' : ''}" data-day="${wd}">${CLASS_DAY_NAMES[wd].slice(1)}</button>
                    `).join('')}
                </div>
                <p class="ce-hint">选中的星期，这门课就会自动出现在当天日程里</p>
            </div>

            <div class="form-row two-col">
                <div>
                    <label>开始时间</label>
                    <input type="time" id="ce-start" value="${c ? escapeHtml(c.start || '') : '17:30'}">
                </div>
                <div>
                    <label>结束时间</label>
                    <input type="time" id="ce-end" value="${c ? escapeHtml(c.end || '') : '18:30'}">
                </div>
            </div>

            <div class="form-row two-col">
                <div>
                    <label>地点（可留空）</label>
                    <input type="text" id="ce-place" maxlength="20" value="${c ? escapeHtml(c.place || '') : ''}" placeholder="例如：海格游泳馆">
                </div>
                <div>
                    <label>完成得几分</label>
                    <input type="number" id="ce-points" min="0" max="50" value="${c ? (c.points || CLASS_POINTS_DEFAULT) : CLASS_POINTS_DEFAULT}">
                </div>
            </div>

            <div class="form-row">
                <label>穿着要求（可留空）</label>
                <input type="text" id="ce-wear" maxlength="24" value="${c ? escapeHtml(c.wear || '') : ''}" placeholder="例如：换好泳裤">
            </div>

            <div class="form-row">
                <label>要带的东西</label>
                <p class="ce-hint">每行一个。写在这里，孩子每天上课前会自己一项项核对打勾。</p>
                <textarea id="ce-bring" rows="3" maxlength="200" placeholder="泳衣&#10;泳镜&#10;毛巾">${c ? escapeHtml((c.bring || []).join('\n')) : ''}</textarea>
            </div>

            <div class="form-row">
                <label>选个图标</label>
                <div class="avatar-grid" id="ce-emoji-grid"></div>
            </div>

            <div class="hw-editor-tip">课程每周重复，不用每天重新登记。改了这门课，<b>以后</b>的日程自动跟着变，今天的打卡记录不受影响。</div>

            <div class="hw-editor-actions">
                <button class="btn-primary" onclick="saveClass()">保存</button>
                ${c ? `<button class="btn-secondary" onclick="deleteClass('${c.id}')">删除这门课</button>` : ''}
                <button class="btn-secondary" onclick="closeClassEditor()">取消</button>
            </div>
        </div>`;
    document.body.appendChild(mask);
    document.body.appendChild(sheet);

    // 星期多选
    sheet.querySelectorAll('.ce-day').forEach(btn => {
        btn.onclick = () => btn.classList.toggle('on');
    });

    renderClassEmojiGrid();
}

function renderClassEmojiGrid() {
    const grid = document.getElementById('ce-emoji-grid');
    if (!grid) return;
    grid.innerHTML = '';
    CLASS_EMOJI_CHOICES.forEach(e => {
        const b = document.createElement('button');
        b.type = 'button';
        b.className = 'avatar-opt' + (e === classEmojiPick ? ' on' : '');
        b.textContent = e;
        b.onclick = () => { classEmojiPick = e; renderClassEmojiGrid(); };
        grid.appendChild(b);
    });
}

function closeClassEditor() {
    const s = document.getElementById('class-editor');
    const m = document.getElementById('class-editor-mask');
    if (s) s.remove();
    if (m) m.remove();
    editingClassId = null;
}

function saveClass() {
    const data = getData();
    const val = id => { const el = document.getElementById(id); return el ? el.value : ''; };

    const name = (val('ce-name') || '').trim();
    if (!name) { showToast('给课程起个名字吧'); return; }

    const days = [...document.querySelectorAll('#class-editor .ce-day.on')].map(b => parseInt(b.dataset.day, 10));
    if (!days.length) { showToast('至少选一个星期几'); return; }

    const bring = (val('ce-bring') || '').split('\n').map(s => s.trim()).filter(Boolean);
    const pts = parseInt(val('ce-points'), 10);
    const payload = {
        name,
        emoji: classEmojiPick,
        days: days.sort(),
        start: val('ce-start') || '',
        end: val('ce-end') || '',
        place: (val('ce-place') || '').trim(),
        wear: (val('ce-wear') || '').trim(),
        bring,
        points: isNaN(pts) || pts < 0 ? CLASS_POINTS_DEFAULT : pts,
        active: true
    };

    const isEdit = !!editingClassId;   // 先记下来：closeClassEditor() 会把 editingClassId 清成 null
    if (!data.classes) data.classes = [];
    if (isEdit) {
        const c = data.classes.find(x => x.id === editingClassId);
        if (!c) { closeClassEditor(); return; }
        Object.assign(c, payload);       // id 不变，已有的打卡记录继续有效
    } else {
        payload.id = generateId();
        data.classes.push(payload);
    }
    saveData(data);
    closeClassEditor();
    refreshAfterChange();
    showToast(isEdit ? '已更新 ✨' : '已添加到课表 🎒');
}

function deleteClass(id) {
    const data = getData();
    const c = (data.classes || []).find(x => x.id === id);
    if (!c) return;
    openConfirm({
        emoji: c.emoji || '🗑',
        title: `删除「${c.name}」？`,
        sub: '以后每周的日程里就不出现这门课了，已经打过的卡和已得积分不受影响。',
        okText: '删除',
        onOk: () => {
            const d = getData();
            d.classes = (d.classes || []).filter(x => x.id !== id);
            saveData(d);
            closeClassEditor();
            refreshAfterChange();
            showToast('已删除');
        }
    });
}

// ================= 今日时间线（作业 + 兴趣班） =================
// 两端共用一套渲染，保证家长和孩子看到的是同一份日程。
// mode='parent' 显示管理入口；mode='child' 突出「要带什么」和「打卡拿分」。
function renderTimeline(hostId, data, day, mode) {
    const host = $(hostId);
    if (!host) return { total: 0, done: 0 };

    const tl = buildDayTimeline(data, day);
    const isParent = mode === 'parent';

    if (!tl.items.length) {
        host.innerHTML = isParent
            ? '<p class="wall-empty-tip">今天还没有安排。去「课表」添加兴趣班，这里会自动排出来。</p>'
            : '<p class="wall-empty-tip">今天没有课程，好好玩吧～</p>';
        return { total: 0, done: 0 };
    }

    let doneCount = 0;
    const html = tl.items.map(it => {
        if (it.done) doneCount++;
        if (it.kind === 'class') {
            it.date = tl.date;
            return renderTlClass(it, mode);
        }
        if (it.kind === 'event') {
            it.date = tl.date;
            return renderTlEvent(it, mode);
        }
        return isParent ? renderTlHomeworkParent(it) : renderTlHomeworkChild(it);
    }).join('');

    host.innerHTML = html;
    return { total: tl.items.length, done: doneCount, tl };
}

// ---- 兴趣班卡片：两端共用 ----
function renderTlClass(it, mode) {
    const c = it.cls;
    // 由 buildDayTimeline 已经查好的打卡记录直接带过来，
    // 不要在这里再 getData()：列表里每节课都重读一次 localStorage 既慢又容易读到中间态。
    const ci = it.checkin;
    const items = (ci && ci.items) || {};
    const bring = Array.isArray(c.bring) ? c.bring : [];
    const checkedCount = bring.filter(x => items[x]).length;
    const allChecked = bring.length > 0 && checkedCount === bring.length;
    const isParent = mode === 'parent';
    const tStart = timeToMin(c.start);
    const tEnd = timeToMin(c.end);
    const timeText = tStart != null
        ? `${formatMin(tStart)}${tEnd != null ? '–' + formatMin(tEnd) : ''}`
        : '时间待定';

    // 携带物：家长端小胶囊可增删；儿童端用大号方块，孩子用手指一个个点。
    // 两端分开渲染而不是共用一套样式，因为点击热区要求差一个量级。
    let bringHtml = '';
    if (bring.length) {
        const list = isParent
            ? bring.map(it2 => `
                <button class="tl-item ${items[it2] ? 'on' : ''}" onclick="toggleBringItem('${c.id}', ${JSON.stringify(it2).replace(/"/g, '&quot;')})">
                    <span class="tl-box">${items[it2] ? '✓' : ''}</span>
                    <span class="tl-item-t">${escapeHtml(it2)}</span>
                    <span class="tl-item-x" onclick="event.stopPropagation();removeBringItem('${c.id}', ${JSON.stringify(it2).replace(/"/g, '&quot;')})">✕</span>
                </button>`).join('')
              + `<button class="tl-item add" onclick="promptAddBring('${c.id}')">＋ 加一项</button>`
            : bring.map(it2 => `
                <button class="tl-item big ${items[it2] ? 'on' : ''}" onclick="toggleBringItem('${c.id}', ${JSON.stringify(it2).replace(/"/g, '&quot;')})">
                    <span class="tl-box">${items[it2] ? '✓' : ''}</span>
                    <span class="tl-item-t">${escapeHtml(it2)}</span>
                </button>`).join('');
        bringHtml = `
            <div class="tl-bring">
                <div class="tl-bring-head">
                    <span class="tl-bring-title">🎒 别忘了带</span>
                    <span class="tl-bring-count ${allChecked ? 'ok' : ''}">${checkedCount} / ${bring.length}${allChecked ? ' 都齐啦' : ''}</span>
                </div>
                <div class="tl-bring-list">${list}</div>
            </div>`;
    }

    const wearHtml = c.wear ? `<div class="tl-wear">👕 ${escapeHtml(c.wear)}</div>` : '';
    const placeHtml = c.place ? `<div class="tl-place">📍 ${escapeHtml(c.place)}</div>` : '';

    return `
        <div class="tl-item-row ${it.done ? 'done' : ''} ${it.done ? 'ok' : ''} kind-class">
            <div class="tl-time">${timeText}</div>
            <div class="tl-dot cls"></div>
            <div class="tl-card class">
                <div class="tl-card-top">
                    <span class="tl-emo">${c.emoji || '📌'}</span>
                    <b class="tl-name">${escapeHtml(c.name)}</b>
                    <span class="tl-pts">+${c.points || CLASS_POINTS_DEFAULT} 分</span>
                </div>
                ${placeHtml}${wearHtml}
                ${bringHtml}
                <div class="tl-actions">
                    <button class="btn ${it.done ? 'btn-ghost' : 'btn-ok'}" onclick="checkinClass('${c.id}')">
                        ${it.done ? '✓ 已完成，点此撤销' : '上完课了，打卡'}
                    </button>
                </div>
            </div>
        </div>`;
}

// ---- 作业卡片 ----
function renderTlHomeworkParent(it) {
    const h = it.hw;
    const overdue = !h.done && isOverdue(h.deadline);
    return `
        <div class="tl-item-row ${h.done ? 'done' : ''} kind-hw">
            <div class="tl-time">${formatMin(it.time)}</div>
            <div class="tl-dot hw ${overdue ? 'late' : ''}"></div>
            <div class="tl-card hw ${overdue ? 'late' : ''}">
                <div class="tl-card-top">
                    <span class="tl-emo">${subjectIcon(h.subject)}</span>
                    <b class="tl-name">${escapeHtml(h.content || h.subject)}</b>
                    <span class="tl-sub">${escapeHtml(h.subject)}</span>
                </div>
                <div class="tl-meta">⏱ 约 ${h.duration || 15} 分钟　·　⭐ ${h.points || 5} 分${overdue ? '　·　<span class="late-tag">已逾期</span>' : ''}</div>
                <div class="tl-actions">
                    ${h.done
                        ? `<span class="tl-done-tag">✓ 孩子已完成</span>`
                        : `<button class="btn btn-ok" onclick="gotoParentView('review')">去确认</button>`}
                    <button class="btn btn-ghost" onclick="openHomeworkEditor('${h.id}')">编辑</button>
                </div>
            </div>
        </div>`;
}

function renderTlHomeworkChild(it) {
    const h = it.hw;
    return `
        <div class="tl-item-row ${h.done ? 'done' : ''} kind-hw">
            <div class="tl-time">${formatMin(it.time)}</div>
            <div class="tl-dot hw"></div>
            <div class="tl-card hw">
                <div class="tl-card-top">
                    <span class="tl-emo">${subjectIcon(h.subject)}</span>
                    <b class="tl-name">${escapeHtml(h.content || h.subject)}</b>
                </div>
                <div class="tl-meta">⏱ 约 ${h.duration || 15} 分钟</div>
                <div class="tl-actions">
                    ${h.done
                        ? `<span class="tl-done-tag">✓ 已完成</span>`
                        : `<button class="btn btn-ok" onclick="completeHomework('${h.id}')">我做完了</button>`}
                </div>
            </div>
        </div>`;
}

// ---- 自由日程 / 事件卡片（2026-10-17「今日岛屿」起）----
// 与课表共用"状态 pill + 准备清单"形态，但多一个 owner 标签（我自己加的 / 家长安排）。
// 事件不给积分（用户拍板：积分只挂钩作业 + 课表打卡），完成只是点亮个人清单。
function eventStatus(ev) {
    if (ev.done) return { text: '已完成', cls: 'done' };
    const s = timeToMin(ev.start), e = timeToMin(ev.end);
    if (s == null) return { text: '待完成', cls: 'before' };
    const cur = new Date().getHours() * 60 + new Date().getMinutes();
    if (cur < s) return { text: '未开始', cls: 'before' };
    if (e != null && cur > e) return { text: '待完成', cls: 'after' };
    return { text: '进行中', cls: 'active' };
}

function renderTlEvent(it, mode) {
    const ev = it.ev;
    const isParent = mode === 'parent';
    const st = eventStatus(ev);
    const tStart = timeToMin(ev.start), tEnd = timeToMin(ev.end);
    const timeText = tStart != null
        ? `${formatMin(tStart)}${tEnd != null ? '–' + formatMin(tEnd) : ''}`
        : '时间自定';
    const ownerTag = ev.owner === 'child'
        ? '<span class="tl-tag k-ev">我自己加的</span>'
        : '<span class="tl-tag k-cl">家长安排</span>';

    let chkHtml = '';
    const list = Array.isArray(ev.checklist) ? ev.checklist : [];
    if (list.length) {
        const items = isParent
            ? list.map(c => `
                <button class="tl-item ${c.done ? 'on' : ''}" onclick="toggleEventItem('${ev.id}', ${JSON.stringify(c.name).replace(/"/g, '&quot;')})">
                    <span class="tl-box">${c.done ? '✓' : ''}</span>
                    <span class="tl-item-t">${escapeHtml(c.name)}</span>
                </button>`).join('')
            : list.map(c => `
                <button class="tl-item big ${c.done ? 'on' : ''}" onclick="toggleEventItem('${ev.id}', ${JSON.stringify(c.name).replace(/"/g, '&quot;')})">
                    <span class="tl-box">${c.done ? '✓' : ''}</span>
                    <span class="tl-item-t">${escapeHtml(c.name)}</span>
                </button>`).join('');
        const doneCount = list.filter(c => c.done).length;
        chkHtml = `
            <div class="tl-bring">
                <div class="tl-bring-head">
                    <span class="tl-bring-title">🎒 准备清单</span>
                    <span class="tl-bring-count ${doneCount === list.length ? 'ok' : ''}">${doneCount} / ${list.length}${doneCount === list.length ? ' 都齐啦' : ''}</span>
                </div>
                <div class="tl-bring-list">${items}</div>
            </div>`;
    }

    return `
        <div class="tl-item-row ${it.done ? 'done ok' : ''} kind-event">
            <div class="tl-time">${timeText}</div>
            <div class="tl-dot ev"></div>
            <div class="tl-card ev ${it.done ? 'ok' : ''}">
                <div class="tl-card-top">
                    <span class="tl-emo">${ev.emoji || '📌'}</span>
                    <b class="tl-name">${escapeHtml(ev.title || '安排')}</b>
                    ${ownerTag}
                    <span class="tl-pill ${st.cls}">${st.text}</span>
                </div>
                ${ev.note ? `<div class="tl-meta">${escapeHtml(ev.note)}</div>` : ''}
                ${chkHtml}
                <div class="tl-actions">
                    <button class="btn ${it.done ? 'btn-ghost' : 'btn-ok'}" onclick="toggleEventDone('${ev.id}')">
                        ${it.done ? '✓ 已完成，点此撤销' : '完成'}</button>
                    <button class="btn btn-ghost" onclick="deleteEvent('${ev.id}')">删除</button>
                </div>
            </div>
        </div>`;
}

// ================= 自由日程 / 事件 CRUD =================
function getEvent(id) {
    const data = getData();
    return (data.events || []).find(x => x.id === id) || null;
}

function toggleEventItem(id, name) {
    const data = getData();
    const ev = getEvent(id);
    if (!ev || !Array.isArray(ev.checklist)) return;
    const it = ev.checklist.find(c => c.name === name);
    if (!it) return;
    it.done = !it.done;
    saveData(data);
    refreshAfterChange();
    const all = ev.checklist.filter(c => c.done).length;
    showToast(all === ev.checklist.length && ev.checklist.length ? '清单都搞定啦 ✅' : `已勾 ${all}/${ev.checklist.length}`);
}

function toggleEventDone(id) {
    const data = getData();
    const ev = getEvent(id);
    if (!ev) return;
    ev.done = !ev.done;
    if (ev.done && Array.isArray(ev.checklist) && ev.checklist.length) {
        ev.checklist.forEach(c => c.done = true);   // 整件完成 = 清单全部勾掉
    }
    saveData(data);
    refreshAfterChange();
    showToast(ev.done ? '完成啦，真棒 🎉' : '已取消完成');
}

function deleteEvent(id) {
    const data = getData();
    if (!data.events) return;
    const ev = getEvent(id);
    if (!ev) return;
    if (!window.confirm(`删除「${ev.title}」？`)) return;
    data.events = data.events.filter(x => x.id !== id);
    saveData(data);
    refreshAfterChange();
    showToast('已删除');
}

// ---- 事件编辑器（孩子与家长共用同一套弹层）----
let editingEventId = null;
window.__evChecklist = [];

function showOverlay(id) { const o = $(id); if (o) o.classList.add('on'); }
function hideOverlay(id) { const o = $(id); if (o) o.classList.remove('on'); }

function openEventEditor(id) {
    editingEventId = id || null;
    const ev = id ? getEvent(id) : null;
    const isChild = document.body.getAttribute('data-mode') === 'child';
    const emo = ev ? ev.emoji : (isChild ? '📚' : '📅');
    const preset = EVENT_PRESETS[emo] || { label: '安排', checklist: [] };
    const pick = $('ev-emo-row');
    if (pick) pick.innerHTML = Object.entries(EVENT_PRESETS).map(([emoji, item]) =>
        `<button type="button" class="ev-emo ${emoji === emo ? 'on' : ''}" data-event-emoji="${escapeHtml(emoji)}" aria-label="${escapeHtml(item.label)}" aria-pressed="${emoji === emo}"><span class="ev-emoji-icon">${emoji}</span><small>${escapeHtml(item.label)}</small></button>`).join('');
    $('ev-emo').value = emo;
    $('ev-title').value = ev ? ev.title : preset.label;
    const defDate = (isChild && typeof childDay === 'string') ? childDay : todayStr();
    $('ev-datetime').value = ev && ev.date ? `${ev.date}T${ev.start || '17:30'}` : `${defDate}T17:30`;
    window.__evChecklist = ev && Array.isArray(ev.checklist)
        ? ev.checklist.map(c => ({ name: c.name, done: !!c.done }))
        : preset.checklist.map(name => ({ name, done: false }));
    renderEventChecklistEditor();
    const del = $('ev-del'); if (del) del.style.display = ev ? '' : 'none';
    setText('ev-title-label', (ev ? '编辑安排' : (isChild ? '我想做点什么' : '添加安排')));
    showOverlay('ovl-event');
}

const EVENT_PRESETS = {
    '📚': { label: '阅读', checklist: ['绘本', '书签'] },
    '🎹': { label: '钢琴', checklist: ['琴谱', '练习册'] },
    '🏃': { label: '运动', checklist: ['运动服', '水壶'] },
    '🎨': { label: '画画', checklist: ['画纸', '画笔'] },
    '💡': { label: '手工', checklist: ['材料包', '剪刀'] },
    '📖': { label: '阅读', checklist: ['绘本', '书签'] },
    '🎵': { label: '音乐', checklist: ['乐谱', '练习册'] },
    '⚽': { label: '足球', checklist: ['足球', '水壶'] },
    '🏊': { label: '游泳', checklist: ['泳衣', '泳镜', '毛巾'] },
    '🚴': { label: '骑行', checklist: ['头盔', '水壶'] },
    '✏️': { label: '写字', checklist: ['练习册', '铅笔'] },
    '🌟': { label: '活动', checklist: ['水壶'] },
    '📅': { label: '安排', checklist: [] }
};
function pickEventEmoji(emoji) {
    const previousEmoji = $('ev-emo').value;
    const previousLabel = (EVENT_PRESETS[previousEmoji] || {}).label;
    const title = $('ev-title');
    $('ev-emo').value = emoji;
    document.querySelectorAll('#ev-emo-row .ev-emo').forEach(button => {
        const selected = button.dataset.eventEmoji === emoji;
        button.classList.toggle('on', selected);
        button.setAttribute('aria-pressed', String(selected));
    });
    const preset = EVENT_PRESETS[emoji] || { label: '安排', checklist: [] };
    if (!title.value.trim() || title.value.trim() === previousLabel || Object.values(EVENT_PRESETS).some(item => item.label === title.value.trim())) {
        title.value = preset.label;
    }
    const list = window.__evChecklist || (window.__evChecklist = []);
    const previousDefaults = (EVENT_PRESETS[previousEmoji] || {}).checklist || [];
    previousDefaults.forEach(name => {
        const index = list.findIndex(item => item.name === name && !item.done);
        if (index >= 0) list.splice(index, 1);
    });
    preset.checklist.forEach(name => {
        if (!list.some(item => item.name === name)) list.push({ name, done: false });
    });
    renderEventChecklistEditor();
}
document.getElementById('ev-emo-row')?.addEventListener('click', event => {
    const button = event.target.closest('[data-event-emoji]');
    if (button) pickEventEmoji(button.dataset.eventEmoji);
});

function renderEventChecklistEditor() {
    const host = $('ev-checklist');
    if (!host) return;
    host.innerHTML = (window.__evChecklist || []).map((c, i) =>
        `<span class="ev-chip ${c.done ? 'on' : ''}">${c.done ? '✓ ' : ''}${escapeHtml(c.name)}` +
        `<i onclick="toggleEvChip(${i})">${c.done ? '↺' : '✓'}</i>` +
        `<b onclick="removeEvChip(${i})">✕</b></span>`).join('');
}
function toggleEvChip(i) { const l = window.__evChecklist; if (l[i]) l[i].done = !l[i].done; renderEventChecklistEditor(); }
function removeEvChip(i) { window.__evChecklist.splice(i, 1); renderEventChecklistEditor(); }
function addEvChip() {
    const v = $('ev-new-item').value.trim();
    if (!v) return;
    window.__evChecklist.push({ name: v, done: false });
    $('ev-new-item').value = '';
    renderEventChecklistEditor();
}

function saveEventEditor() {
    const title = $('ev-title').value.trim();
    if (!title) { showToast('给安排起个名字吧'); return; }
    const pickedDateTime = $('ev-datetime').value;
    if (!pickedDateTime) { showToast('请选择日期和具体时间'); return; }
    const [date, start] = pickedDateTime.split('T');
    const existing = editingEventId ? getEvent(editingEventId) : null;
    const payload = {
        title,
        emoji: $('ev-emo').value || '📚',
        date: date || todayStr(),
        start: start || null,
        end: existing?.end || null,
        checklist: (window.__evChecklist || []).map(c => ({ name: c.name, done: !!c.done })),
        note: ''
    };
    const data = getData();
    if (editingEventId) {
        const ev = (data.events || []).find(e => e.id === editingEventId);
        if (ev) { Object.assign(ev, payload); saveData(data); refreshAfterChange(); showToast('已保存'); }
    } else {
        payload.owner = document.body.getAttribute('data-mode') === 'child' ? 'child' : 'parent';
        payload.id = generateId();
        payload.done = false;
        payload.createdAt = new Date().toISOString();
        if (!data.events) data.events = [];
        data.events.push(payload);
        saveData(data);
        refreshAfterChange();
        showToast('已加到小岛日历 📅');
    }
    closeEventEditor();
}
function closeEventEditor() { hideOverlay('ovl-event'); editingEventId = null; }

// 家长在时间线上补一项携带物
function promptAddBring(classId) {
    const v = window.prompt('要带什么？\n比如：泳衣、画笔、琴谱');
    if (v == null) return;
    addBringItem(classId, v);
}

function showToast(message) {
    const existing = document.querySelector('.toast');
    if (existing) existing.remove();

    const toast = document.createElement('div');
    toast.className = 'toast';
    toast.textContent = message;
    document.body.appendChild(toast);
    setTimeout(() => toast.remove(), 2200);
}

// ================= 家长端 =================
function renderParent() {
    const data = getData();
    generateRecurringTasks();
    updateReviewBadge(data);
}

// 顶部铃铛与底栏角标：不管当前在哪个页面都要显示“有几项待确认”
function updateReviewBadge(data) {
    const openCount = data.homework.filter(h => isTaskToday(h) && !h.done).length;
    const badge = $('tab-review-badge'), dot = $('review-dot');
    if (badge) { badge.hidden = !openCount; badge.textContent = openCount; }
    if (dot) dot.hidden = !openCount;
}

// ================= 家长端：作业日历（日 / 周 / 月） =================
let parentRange = 'day';        // 'day' | 'week' | 'month'
let parentAnchor = new Date();   // 当前查看的基准日期（任意时刻，只取日期部分）

function switchParentRange(range) {
    if (range !== parentRange) parentAnchor = new Date();  // 切换日/周/月时先回到今天所在区间
    parentRange = range;
    document.querySelectorAll('#p-range-switch .range-btn').forEach(btn => {
        btn.classList.toggle('on', btn.dataset.range === range);
    });
    renderParentList();
}

function stepParentRange(dir) {
    const d = new Date(parentAnchor.getFullYear(), parentAnchor.getMonth(), parentAnchor.getDate());
    if (parentRange === 'day') {
        d.setDate(d.getDate() + dir);
    } else if (parentRange === 'week') {
        d.setDate(d.getDate() + dir * 7);
    } else {
        d.setMonth(d.getMonth() + dir);
    }
    parentAnchor = d;
    renderParentList();
}

function goParentToday() {
    parentAnchor = new Date();
    renderParentList();
    showToast('已回到今天');
}

// 家长端区间边界（周一为周起点）
function getParentBounds() {
    const a = new Date(parentAnchor.getFullYear(), parentAnchor.getMonth(), parentAnchor.getDate());
    if (parentRange === 'day') {
        const e = new Date(a); e.setDate(e.getDate() + 1);
        return { start: a, end: e };
    }
    if (parentRange === 'week') {
        const s = startOfWeek(a);
        const e = new Date(s); e.setDate(e.getDate() + 7);
        return { start: s, end: e };
    }
    const s = new Date(a.getFullYear(), a.getMonth(), 1);
    const e = new Date(a.getFullYear(), a.getMonth() + 1, 1);
    return { start: s, end: e };
}

// 作业归属哪天：已完成看完成时间，未完成看截止时间，都没有就看创建时间
function taskDate(hw) {
    const iso = hw.done ? (hw.completedAt || hw.deadline || hw.createdAt)
                        : (hw.deadline || hw.createdAt);
    return iso ? new Date(iso) : null;
}

// 「今天」的统一口径。
// 以前各处用的是 `isSameDay(h.deadline || h.createdAt, today) || !h.deadline`，
// 末尾的 `|| !h.deadline` 会把**历史上所有没有截止时间的作业**都算进今天：
// 于是一段时间以后，顶部「今日作业」会变成几十个，而下面的作业日历（按 taskDate 归属日期）
// 只显示今天的 3 条，上下数字互相打架。这里统一按 taskDate 判定，
// 和作业日历日视图完全同一套规则，两端、上下、看板与列表都不再出现分叉。
function isTaskToday(hw) {
    const d = taskDate(hw);
    if (!d) return true;   // 没有日期的作业：日视图也把它算在今天，保持一致
    return isSameDayOf(d, new Date());
}

function taskInParentBounds(hw, bounds) {
    const d = taskDate(hw);
    if (!d) return parentRange === 'day';
    const t = d.getTime();
    return t >= bounds.start.getTime() && t < bounds.end.getTime();
}

function isSameDayOf(a, b) {
    return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

const WEEKDAY_CN = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];

// ---- 周期作业开关（属于「布置新作业」表单） ----
function onCycleToggle() {
    const on = $('manual-is-recurring').checked;
    $('cycle-panel').classList.toggle('show', on);
    const btn = $('btn-publish-hw');
    if (btn) btn.textContent = on ? '✨ 发布周期作业' : '✨ 发布作业';
    if (on) onCycleFrequencyChange();
}

function onCycleFrequencyChange() {
    const freq = $('manual-frequency').value;
    $('manual-weekly-row').style.display = freq === 'weekly' ? 'block' : 'none';
    $('manual-monthly-row').style.display = freq === 'monthly' ? 'block' : 'none';
}

function shouldGenerateTaskToday(task) {
    const today = new Date();
    const todayDay = today.getDay();
    const todayDate = today.getDate();

    if (task.frequency === 'daily') return true;
    if (task.frequency === 'weekly') return parseInt(task.weeklyDay, 10) === todayDay;
    if (task.frequency === 'monthly') return parseInt(task.monthlyDay, 10) === todayDate;
    return false;
}

function generateRecurringTasks() {
    const data = getData();
    if (!data.recurringTasks) return;

    const today = todayStr();
    const activeTasks = data.recurringTasks.filter(t => t.active);
    let added = 0;

    activeTasks.forEach(task => {
        if (!shouldGenerateTaskToday(task)) return;

        // 检查今天是否已生成过
        const exists = data.homework.some(h =>
            h.recurringTaskId === task.id &&
            isSameDay(h.createdAt, today)
        );

        if (exists) return;

        const points = task.points && task.points > 0
            ? task.points
            : Math.max(5, Math.round(task.duration / 3));

        data.homework.push({
            id: generateId(),
            subject: task.subject,
            content: task.content,
            deadline: null,
            duration: task.duration,
            points,
            done: false,
            recurringTaskId: task.id,
            attachments: (task.attachments || []).slice(),
            createdAt: new Date().toISOString()
        });
        added++;
    });

    // 只有真的派生出新任务才落盘。
    // 以前这里无条件 saveData，等于每次打开页面都排一次云端推送；
    // 新设备第一次进入时本地还是空白数据，这个推送会把云端的真实内容覆盖掉。
    if (added > 0) saveData(data);
}

function renderParentList() {
    const data = getData();
    const listEl = $('parent-homework-list');
    if (!listEl) return;
    listEl.innerHTML = '';

    const bounds = getParentBounds();
    const now = new Date();

    // ---- 标题与导航 ----
    const titleEl = $('p-cal-title');
    if (titleEl) {
        titleEl.textContent = parentRange === 'day' ? '今日作业'
                            : parentRange === 'week' ? '本周作业' : '本月作业';
    }

    const rangeEl = $('p-cal-range');
    const subEl = $('p-cal-sub');
    if (parentRange === 'day') {
        const d = bounds.start;
        const isToday = isSameDayOf(d, now);
        const isTomorrow = isSameDayOf(d, new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1));
        const isYesterday = isSameDayOf(d, new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1));
        if (rangeEl) rangeEl.textContent = isToday ? '今天' : isTomorrow ? '明天' : isYesterday ? '昨天'
                                            : `${d.getMonth() + 1}月${d.getDate()}日`;
        if (subEl) subEl.textContent = `${d.getMonth() + 1}月${d.getDate()}日 ${WEEKDAY_CN[d.getDay()]}`;
    } else if (parentRange === 'week') {
        const s = bounds.start, e = new Date(bounds.end.getTime() - 86400000);
        if (rangeEl) rangeEl.textContent = '本周';
        if (subEl) subEl.textContent = `${s.getMonth() + 1}/${s.getDate()} - ${e.getMonth() + 1}/${e.getDate()}`;
    } else {
        const d = bounds.start;
        if (rangeEl) rangeEl.textContent = `${d.getFullYear()}年${d.getMonth() + 1}月`;
        if (subEl) subEl.textContent = `共 ${new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate()} 天`;
    }

    // 「回到今天」按钮：已经在今天/本周/本月时置灰
    const todayBtn = $('p-cal-today');
    if (todayBtn) {
        const cur = getParentBounds();
        const todayB = (() => {
            const keep = parentRange, keepAnchor = parentAnchor;
            parentAnchor = new Date();
            const b = getParentBounds();
            parentRange = keep; parentAnchor = keepAnchor;
            return b;
        })();
        const atNow = cur.start.getTime() === todayB.start.getTime();
        todayBtn.disabled = atNow;
        todayBtn.classList.toggle('is-off', atNow);
    }

    // ---- 周期作业也会出现在日历里，这里顺带生效 ----
    const inRange = data.homework.filter(h => taskInParentBounds(h, bounds));

    // 看板角标：这个区间一共几项（日视图还要带上今天完成了几项）
    const calBadge = $('p-cal-badge');
    if (calBadge) {
        const dNum = inRange.filter(h => h.done).length;
        calBadge.textContent = parentRange === 'day'
            ? (inRange.length ? `${dNum} / ${inRange.length} 项` : '暂无作业')
            : `共 ${inRange.length} 项`;
    }

    // ---- 顶部日期格子：日视图不显示，周/月显示 ----
    const stripEl = $('p-cal-strip');
    if (stripEl) {
        stripEl.innerHTML = '';
        if (parentRange === 'week') {
            stripEl.classList.add('show');
            stripEl.classList.remove('month');
            for (let i = 0; i < 7; i++) {
                const d = new Date(bounds.start); d.setDate(d.getDate() + i);
                stripEl.appendChild(buildCalCell(d, data, now));
            }
        } else if (parentRange === 'month') {
            stripEl.classList.add('show', 'month');
            const days = new Date(bounds.start.getFullYear(), bounds.start.getMonth() + 1, 0).getDate();
            for (let i = 1; i <= days; i++) {
                const d = new Date(bounds.start.getFullYear(), bounds.start.getMonth(), i);
                stripEl.appendChild(buildCalCell(d, data, now));
            }
            // 月视图格子多，把今天滚动到可视区中间
            const todayCell = stripEl.querySelector('.cal-cell.today');
            if (todayCell) {
                requestAnimationFrame(() => {
                    const target = todayCell.offsetLeft - stripEl.clientWidth / 2 + todayCell.offsetWidth / 2;
                    stripEl.scrollLeft = Math.max(0, target);
                });
            }
        } else {
            stripEl.classList.remove('show', 'month');
        }
    }

    // ---- 区间汇总 ----
    const doneCount = inRange.filter(h => h.done).length;
    const sumEl = $('p-cal-summary');
    if (sumEl) {
        const overdue = inRange.filter(h => !h.done && isOverdue(h.deadline)).length;
        sumEl.innerHTML = inRange.length
            ? `<span class="cal-sum-item">📋 ${inRange.length} 项</span>
               <span class="cal-sum-item ok">✅ ${doneCount} 完成</span>
               ${overdue ? `<span class="cal-sum-item warn">⚠️ ${overdue} 逾期</span>` : ''}`
            : '';
        sumEl.classList.toggle('show', inRange.length > 0);
    }

    // ---- 空状态 ----
    if (inRange.length === 0) {
        const hint = parentRange === 'day' ? '这一天还没有作业' : '这个区间还没有作业';
        listEl.innerHTML = `
            <div class="empty-state">
                <span class="big-emoji">🏝️</span>
                <p>${hint}，换一天看看或者去布置一个吧！</p>
            </div>
        `;
        return;
    }

    // ---- 排序：未完成在前（按时间升序），已完成在后（按完成时间降序） ----
    inRange.sort((a, b) => {
        if (a.done !== b.done) return a.done ? 1 : -1;
        const ta = taskDate(a), tb = taskDate(b);
        const va = ta ? ta.getTime() : 0, vb = tb ? tb.getTime() : 0;
        return a.done ? vb - va : va - vb;
    });

    // ---- 分组：日视图不分组；周/月按日期分组并标出周几 ----
    if (parentRange === 'day') {
        inRange.forEach(hw => listEl.appendChild(buildParentItem(hw)));
        return;
    }

    const groups = {};
    const order = [];
    inRange.forEach(hw => {
        const d = taskDate(hw);
        const key = d ? `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}` : 'unknown';
        if (!groups[key]) { groups[key] = []; order.push(key); }
        groups[key].push(hw);
    });
    order.sort();

    order.forEach(key => {
        const groupEl = document.createElement('div');
        groupEl.className = 'hw-group';

        let label = '未设置日期', wd = '';
        if (key !== 'unknown') {
            const d = new Date(key + 'T00:00:00');
            const isToday = isSameDayOf(d, now);
            const isTomorrow = isSameDayOf(d, new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1));
            const isYesterday = isSameDayOf(d, new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1));
            label = isToday ? '今天' : isTomorrow ? '明天' : isYesterday ? '昨天'
                  : `${d.getMonth() + 1}月${d.getDate()}日`;
            wd = WEEKDAY_CN[d.getDay()];
        }
        groupEl.innerHTML = `<div class="hw-group-title">${escapeHtml(label)}${wd ? ` <span class="hw-group-wd">${wd}</span>` : ''}</div>`;

        groups[key].forEach(hw => groupEl.appendChild(buildParentItem(hw)));
        listEl.appendChild(groupEl);
    });
}

// 周/月视图顶部的一个日期格子
function buildCalCell(d, data, now) {
    const cell = document.createElement('div');
    cell.className = 'cal-cell';

    const dayStart = new Date(d.getFullYear(), d.getMonth(), d.getDate());
    const dayEnd = new Date(dayStart); dayEnd.setDate(dayEnd.getDate() + 1);
    const dayItems = data.homework.filter(h => {
        const t = taskDate(h);
        return t && t.getTime() >= dayStart.getTime() && t.getTime() < dayEnd.getTime();
    });

    const isToday = isSameDayOf(d, now);
    const allDone = dayItems.length > 0 && dayItems.every(h => h.done);
    const hasOverdue = dayItems.some(h => !h.done && isOverdue(h.deadline));

    cell.classList.toggle('today', isToday);
    cell.classList.toggle('has-item', dayItems.length > 0);
    cell.classList.toggle('all-done', allDone);
    cell.classList.toggle('overdue', hasOverdue);

    cell.innerHTML = `
        <span class="cal-cell-wd">${WEEKDAY_CN[d.getDay()].replace('周', '')}</span>
        <span class="cal-cell-day">${d.getDate()}</span>
        <span class="cal-cell-dot">${dayItems.length ? (allDone ? '✓' : dayItems.length) : ''}</span>
    `;

    // 点格子 → 跳到那一天（日视图）
    cell.onclick = () => {
        parentAnchor = new Date(d.getFullYear(), d.getMonth(), d.getDate());
        parentRange = 'day';
        document.querySelectorAll('#p-range-switch .range-btn').forEach(btn => {
            btn.classList.toggle('on', btn.dataset.range === 'day');
        });
        renderParentList();
    };
    return cell;
}

// 家长端单条作业行
function buildParentItem(hw) {
    const el = document.createElement('div');
    const overdue = !hw.done && isOverdue(hw.deadline);
    el.className = 'hw-row' + (hw.done ? ' done' : '') + (overdue ? ' overdue' : '');
    el.dataset.hwId = hw.id;   // 供「全量修改」后定位高亮

    let timeText;
    if (hw.done) {
        timeText = '✅ ' + (hw.completedAt ? formatDateTime(hw.completedAt) : '已完成');
    } else if (hw.deadline) {
        timeText = (overdue ? '⚠️ 已逾期 · ' : '⏰ ') + formatDateTime(hw.deadline);
    } else {
        timeText = '📌 无截止时间';
    }

    const isRecur = !!hw.recurringTaskId;

    el.innerHTML = `
        <span class="r-ico ${subjectClass(hw.subject)}">${subjectIcon(hw.subject)}</span>
        <div class="hw-main">
            <div class="hw-top">
                <span class="hw-subj">${escapeHtml(hw.subject)}${isRecur ? ' <span class="hw-recur-mark">🔄</span>' : ''}</span>
                <span class="hw-pts">${hw.done ? '+' + (hw.earnedPoints || hw.points) + ' 分' : '预计 +' + hw.points + ' 分'}</span>
            </div>
            <span class="hw-desc">${escapeHtml(hw.content)}</span>
            <span class="hw-note${overdue ? ' warn' : ''}">${timeText}${hw.duration ? ' · ⏳ ' + hw.duration + ' 分钟' : ''}</span>
            ${attachmentsHtml(hw.attachments)}
            <div class="hw-acts">
                <button class="hw-btn" onclick="openHomeworkEditor('${hw.id}')">✏️ 编辑</button>
                ${hw.done
                    ? `<button class="hw-btn undo" onclick="undoHomework('${hw.id}')">↩ 取消完成</button>
                       <button class="hw-btn del" onclick="deleteHomework('${hw.id}')">删除</button>`
                    : `<button class="hw-btn done" onclick="completeHomework('${hw.id}')">🌟 标记完成</button>
                       <button class="hw-btn del" onclick="deleteHomework('${hw.id}')">删除</button>`}
            </div>
        </div>
    `;
    return el;
}

async function addManualHomework() {
    const subject = $('manual-subject').value;
    const content = $('manual-content').value.trim();
    const deadline = $('manual-deadline').value;
    const duration = parseInt($('manual-duration').value, 10) || 20;
    const pointsInput = parseInt($('manual-points').value, 10);
    const points = pointsInput > 0 ? pointsInput : Math.max(5, Math.round(duration / 3));
    const isRecurring = $('manual-is-recurring').checked;
    const attachInput = $('manual-attachments');

    if (!content) {
        showToast('请填写作业内容哦');
        return;
    }

    const data = getData();
    const attachments = await mergeAttachments([], attachInput ? attachInput.files : []);

    if (isRecurring) {
        // ---- 周期作业：存为模板，由 generateRecurringTasks 每天自动派生 ----
        const frequency = $('manual-frequency').value;
        const task = {
            id: generateId(),
            subject,
            content,
            frequency,
            duration,
            points,
            active: true,
            createdAt: new Date().toISOString()
        };
        if (frequency === 'weekly') {
            task.weeklyDay = parseInt($('manual-weekly-day').value, 10);
        } else if (frequency === 'monthly') {
            task.monthlyDay = parseInt($('manual-monthly-day').value, 10) || 1;
        }
        task.attachments = attachments;
        data.recurringTasks.push(task);
        saveData(data);

        resetManualForm();
        generateRecurringTasks();
        closePublishSheet();
        gotoParentView('home');
        showToast('周期作业已发布，会自动重复哦 🔄');
        return;
    }

    // ---- 普通作业：一次性 ----
    data.homework.push({
        id: generateId(),
        subject,
        content,
        deadline: deadline || null,
        duration,
        points,
        done: false,
        attachments,
        createdAt: new Date().toISOString()
    });
    saveData(data);

    resetManualForm();
    closePublishSheet();
    gotoParentView('home');
    showToast('作业发布成功！');
}

function resetManualForm() {
    $('manual-content').value = '';
    $('manual-deadline').value = '';
    $('manual-duration').value = '20';
    $('manual-points').value = '7';
    manualPointsEdited = false;
    const attachInput = $('manual-attachments');
    if (attachInput) attachInput.value = '';
    const preview = $('manual-attach-preview');
    if (preview) preview.innerHTML = '';
    // 复位周期开关
    $('manual-is-recurring').checked = false;
    $('manual-frequency').value = 'daily';
    $('manual-weekly-day').value = '1';
    $('manual-monthly-day').value = '1';
    onCycleToggle();
}

let manualPointsEdited = false;

function onManualDurationChange() {
    if (manualPointsEdited) return;
    const duration = parseInt($('manual-duration').value, 10) || 20;
    $('manual-points').value = Math.max(5, Math.round(duration / 3));
}

async function parseOcrHomework() {
    let text = $('ocr-text').value.trim();
    if (!text) {
        showToast('请先粘贴识别出来的文字');
        return;
    }

    // 预处理：合并多余空格、统一分隔符、合并误换行
    text = text
        .replace(/\r\n/g, '\n')
        .replace(/[ 　]+/g, ' ')
        .replace(/([：:;；])\s+/g, '$1')
        .replace(/\n{3,}/g, '\n\n')
        .trim();

    const statusEl = $('ocr-status');
    const parseBtn = $('btn-parse-ocr');
    if (parseBtn) parseBtn.disabled = true;
    statusEl.className = 'ocr-status loading';
    statusEl.textContent = '正在整理作业内容...';

    // 优先交给 AI 按语义切分；失败再退回本地规则
    let parsed = null;
    const { cloud, text: model } = await getAiModels();
    if (cloud && model) {
        try {
            const out = await llmCollect(cloud, {
                model: model.id,
                messages: [
                    { role: 'system', content: AI_PARSE_SYSTEM_PROMPT },
                    { role: 'user', content: '把下面的作业记录整理成条目：\n' + text }
                ]
            });
            parsed = extractItems(out);
        } catch (e) { /* AI 失败时走本地规则 */ }
    }
    if (!parsed) parsed = parseHomeworkText(text);

    if (parseBtn) parseBtn.disabled = false;
    if (parsed.length === 0) {
        statusEl.className = 'ocr-status error';
        statusEl.textContent = '⚠️ 没有解析到作业内容，试试手动调整文字。';
        return;
    }

    statusEl.className = 'ocr-status success';
    statusEl.textContent = `✅ 解析出 ${parsed.length} 条作业，请检查预览`;
    renderParsedPreview(parsed);
}

let parsedHomeworkCache = [];

// ================= AI 识别与解析（WorkBuddy 云端大模型，免密钥） =================
const AI_PARSE_SYSTEM_PROMPT = '你是小学家庭作业登记助手，帮家长把作业记录整理成条目。'
    + '切分规则：按作业任务本身的语义切分，不要机械地一行一条；'
    + '被误换行或误空格打断的一句话要合并成一条（例如"语文：背诵《春晓》，预习第2课"是一条作业）；'
    + '同科目的多个独立任务要拆成多条。'
    + 'subject 只能取：语文、数学、英语、科学、美术、音乐、体育、其他。'
    + '只输出 JSON：{"fullText":"整理后的作业原文","items":[{"subject":"语文","content":"背诵《春晓》，预习第2课"}]}，不要输出任何其他文字。';

function getAiCloud() {
    // Public demo: image recognition uses the local OCR fallback only.
    return null;
}

async function getAiModels() {
    const cloud = getAiCloud();
    if (!cloud) return { cloud: null, vision: null, text: null };
    try {
        const models = await cloud.llm.models.list();
        const usable = (models || []).filter(m => m.disabled !== true);
        const byId = id => usable.find(m => m.id === id) || null;
        const anyVision = usable.find(m => m.supportsImages === true) || null;
        // 偏好快且便宜的多模态模型；找不到再退回任意可用模型
        const vision = byId('glm-5.3-flash') || byId('glm-4.6v') || byId('glm-5v-turbo') || anyVision;
        const text = vision || byId('deepseek-v4.1-flash') || byId('hunyuan-2.0-thinking') || usable[0] || null;
        return { cloud: cloud, vision: vision, text: text };
    } catch (e) {
        return { cloud: cloud, vision: null, text: null };
    }
}

async function llmCollect(cloud, params) {
    let out = '';
    const config = Object.assign({ stream: true, temperature: 0.2, reasoning_effort: 'low' }, params);
    for await (const chunk of cloud.llm.chat.completions.create(config)) {
        const d = chunk.choices && chunk.choices[0] && chunk.choices[0].delta;
        if (d && d.content) out += d.content;
    }
    return out;
}

function extractItems(text) {
    const m = (text || '').match(/\{[\s\S]*\}|\[[\s\S]*\]/);
    if (!m) return null;
    let obj;
    try { obj = JSON.parse(m[0]); } catch (e) { return null; }
    const raw = Array.isArray(obj) ? obj : (obj.items || obj.homework || []);
    if (!Array.isArray(raw)) return null;
    const items = raw.map(i => {
        if (!i) return null;
        const subject = SUBJECT_OPTIONS.indexOf(i.subject) >= 0 ? i.subject
            : (SUBJECT_OPTIONS.indexOf(i.科目) >= 0 ? i.科目 : '其他');
        const content = String(i.content || i.内容 || '').trim();
        return content ? { subject: subject, content: content } : null;
    }).filter(Boolean);
    return items.length ? items : null;
}

// 把解析结果渲染成可确认的预览列表
function renderParsedPreview(parsed) {
    const previewEl = $('ocr-preview');
    previewEl.innerHTML = '<p style="font-size:13px;color:var(--text-light);margin-bottom:8px;">解析结果预览，确认无误后点击下方按钮：</p>';

    parsed.forEach((item, idx) => {
        const defPoints = Math.max(5, Math.round(20 / 3));
        const el = document.createElement('div');
        el.className = 'ocr-item';
        el.dataset.idx = idx;
        el.innerHTML = `
            <div class="ocr-item-content">
                <b>${escapeHtml(item.subject)}</b>：${escapeHtml(item.content)}
            </div>
            <div class="ocr-item-points">
                <input type="number" class="ocr-points-input" min="1" value="${defPoints}" title="奖励积分">
            </div>
            <button class="ocr-remove-btn" onclick="removeParsedItem(this)" title="删除">×</button>
        `;
        previewEl.appendChild(el);
    });

    if (!$('btn-confirm-ocr')) {
        const confirmBtn = document.createElement('button');
        confirmBtn.id = 'btn-confirm-ocr';
        confirmBtn.className = 'btn-primary';
        confirmBtn.style.marginTop = '12px';
        confirmBtn.textContent = '✅ 确认添加以上作业';
        confirmBtn.onclick = confirmOcrHomework;
        previewEl.parentNode.insertBefore(confirmBtn, previewEl.nextSibling);
    }
}

function parseHomeworkText(text) {
    const lines = text.split(/\n/).map(l => l.trim()).filter(l => l);
    const parsed = [];

    lines.forEach(line => {
        // 去掉行首的序号、项目符号
        const clean = line.replace(/^[\s\d\.\-•·]+/, '').trim();
        if (!clean) return;

        // 一行内可能有多个科目，按分号、句号、换行分隔
        const segments = clean.split(/；|;|。|\n/).map(s => s.trim()).filter(s => s);

        segments.forEach(seg => {
            const result = splitSubjectAndContent(seg);
            if (result) parsed.push(result);
        });
    });

    return parsed;
}

function splitSubjectAndContent(seg) {
    const subjectKeywords = {
        '语文': ['语文', '语', '阅读', '背诵', '默写', '古诗', '课文', '作文'],
        '数学': ['数学', '数', '计算', '口算', '练习册', '算术', '应用题'],
        '英语': ['英语', '英', '单词', '听读', '课文', '听力', '口语'],
        '科学': ['科学', '实验', '观察', '自然'],
        '美术': ['美术', '画画', '手抄报', '绘画'],
        '音乐': ['音乐', '唱歌', '练琴', '声乐'],
        '体育': ['体育', '运动', '跳绳', '跑步'],
        '其他': []
    };

    function detectSubject(line) {
        const lineClean = line.replace(/(作业|任务|练习|今日|今天|明天|课后|课堂)/g, '').trim();

        // 精确匹配科目名
        for (const subj of Object.keys(subjectKeywords)) {
            const re = new RegExp('^' + subj + '[：:\\s]|' + subj + '$');
            if (re.test(lineClean) || lineClean === subj) {
                return subj;
            }
        }

        // 按关键词匹配，优先长关键词
        const allKeywords = [];
        for (const [subj, keys] of Object.entries(subjectKeywords)) {
            keys.forEach(k => allKeywords.push({ subj, key: k }));
        }
        allKeywords.sort((a, b) => b.key.length - a.key.length);

        for (const { subj, key } of allKeywords) {
            if (lineClean.includes(key)) return subj;
        }
        return '其他';
    }

    // 尝试按常见分隔符拆分
    const separators = ['：', ':', '——', '--', '-', ' '];
    let subject = null;
    let content = seg;

    for (const sep of separators) {
        const idx = seg.indexOf(sep);
        if (idx > 0 && idx < 12) {
            const maybeSubject = seg.slice(0, idx).trim();
            const rest = seg.slice(idx + 1).trim();
            if (rest) {
                subject = detectSubject(maybeSubject);
                content = rest;
                break;
            }
        }
    }

    if (!subject) {
        subject = detectSubject(seg);
        content = seg;
    }

    return { subject, content };
}

function removeParsedItem(btn) {
    const item = btn.closest('.ocr-item');
    if (item) item.remove();
}

function confirmOcrHomework() {
    const items = document.querySelectorAll('.ocr-item');
    if (items.length === 0) {
        showToast('没有要添加的作业');
        return;
    }

    const data = getData();
    let addedCount = 0;

    items.forEach(el => {
        const text = el.querySelector('.ocr-item-content').innerText;
        const idx = text.indexOf('：');
        const subject = idx > 0 ? text.slice(0, idx).trim() : '其他';
        const content = idx > 0 ? text.slice(idx + 1).trim() : text;

        if (!content) return;

        const duration = 20;
        const pointsInput = parseInt(el.querySelector('.ocr-points-input').value, 10);
        const points = pointsInput > 0 ? pointsInput : Math.max(5, Math.round(duration / 3));

        data.homework.push({
            id: generateId(),
            subject,
            content,
            deadline: null,
            duration,
            points,
            done: false,
            createdAt: new Date().toISOString()
        });
        addedCount++;
    });

    saveData(data);

    // 清理预览区
    $('ocr-preview').innerHTML = '';
    const confirmBtn = $('btn-confirm-ocr');
    if (confirmBtn) confirmBtn.remove();
    $('ocr-text').value = '';

    showToast(`成功添加 ${addedCount} 条作业`);
    switchParentTab('manual');
    closePublishSheet();
    gotoParentView('home');
}

function completeHomework(id) {
    const data = getData();
    const hw = data.homework.find(h => h.id === id);
    if (!hw || hw.done) return;

    hw.done = true;
    hw.completedAt = new Date().toISOString();

    // 计算连击加成
    const today = todayStr();
    if (data.lastCompletedDate && isSameDay(data.lastCompletedDate, today)) {
        // 今天已完成过，不重置连击
    } else if (data.lastCompletedDate && isYesterday(today, data.lastCompletedDate)) {
        data.currentStreak += 1;
    } else {
        data.currentStreak = 1;
    }
    data.lastCompletedDate = today;

    const streakBonus = 0; // V2: only the configured homework points.
    hw.earnedPoints = hw.points + streakBonus;
    data.points += hw.earnedPoints;
    data.totalCompleted += 1;

    // 收集材料奖励
    const gainedMaterials = grantMaterialRewards(data);
    sessionNewMaterials.push(...gainedMaterials.map(m => m.id));

    saveData(data);

    refreshAfterChange();

    fireConfetti();
    showToast(`完成！获得 ${hw.earnedPoints} 积分（连击 x${data.currentStreak}）`);
    checkNewRewards(data);

    // 水果雨庆祝
    if (document.body.getAttribute('data-mode') === 'child') {
        for (let i = 0; i < 6; i++) {
            setTimeout(spawnFallingItem, 200 + i * 300);
        }
    }
}

function deleteHomework(id) {
    if (!confirm('确定要删除这条作业吗？')) return;
    const data = getData();
    data.homework = data.homework.filter(h => h.id !== id);
    saveData(data);
    refreshAfterChange();
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// ================= 附件：图片压缩后随作业一起保存 =================
const MAX_ATTACHMENTS = 3;

// 图片压到长边 1280、JPEG 0.72，避免同步的包太大
function compressImage(file, maxSide, quality) {
    maxSide = maxSide || 1280;
    quality = quality || 0.72;
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onerror = reject;
        reader.onload = () => {
            const img = new Image();
            img.onerror = reject;
            img.onload = () => {
                const scale = Math.min(1, maxSide / Math.max(img.width, img.height));
                const w = Math.max(1, Math.round(img.width * scale));
                const h = Math.max(1, Math.round(img.height * scale));
                const canvas = document.createElement('canvas');
                canvas.width = w;
                canvas.height = h;
                canvas.getContext('2d').drawImage(img, 0, 0, w, h);
                resolve(canvas.toDataURL('image/jpeg', quality));
            };
            img.src = reader.result;
        };
        reader.readAsDataURL(file);
    });
}

async function filesToAttachments(fileList) {
    const files = Array.from(fileList || []).filter(f => f && f.type.indexOf('image/') === 0);
    const out = [];
    for (const f of files) {
        try {
            out.push({ id: generateId(), name: f.name || '图片', url: await compressImage(f) });
        } catch (e) { /* 单张失败就跳过 */ }
    }
    return out;
}

// 已有附件 + 新选文件合并，最多 MAX_ATTACHMENTS 张
async function mergeAttachments(existing, fileList) {
    const added = await filesToAttachments(fileList);
    const room = Math.max(0, MAX_ATTACHMENTS - (existing || []).length);
    if (added.length > room) showToast(`最多 ${MAX_ATTACHMENTS} 张图片，多的没加上哦`);
    return (existing || []).concat(added.slice(0, room));
}

function attachmentsHtml(list) {
    if (!list || !list.length) return '';
    return `<div class="hw-attach">${list.map(a =>
        `<img class="hw-thumb" src="${a.url}" alt="${escapeHtml(a.name || '附件')}" onclick="openImageViewer(this.src)">`
    ).join('')}</div>`;
}

function openImageViewer(src) {
    const old = document.getElementById('img-viewer');
    if (old) old.remove();
    const wrap = document.createElement('div');
    wrap.id = 'img-viewer';
    wrap.className = 'img-viewer';
    wrap.onclick = () => wrap.remove();
    wrap.innerHTML = `<img src="${src}" alt="附件大图"><button class="img-viewer-close" aria-label="关闭">✕</button>`;
    document.body.appendChild(wrap);
}

function toLocalInput(iso) {
    if (!iso) return '';
    const d = new Date(iso);
    const pad = n => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function fromLocalInput(v) {
    if (!v) return null;
    const d = new Date(v);
    return isNaN(d.getTime()) ? null : d.toISOString();
}

// ================= 家长端：编辑已发布的作业 =================
const SUBJECT_OPTIONS = ['语文', '数学', '英语', '科学', '美术', '音乐', '体育', '其他'];
let editingHomeworkId = null;
let editingAttachments = [];

function openHomeworkEditor(id) {
    const data = getData();
    const hw = data.homework.find(h => h.id === id);
    if (!hw) return;

    editingHomeworkId = id;
    editingAttachments = (hw.attachments || []).slice();

    const old = document.getElementById('hw-editor');
    if (old) old.remove();

    const mask = document.createElement('div');
    mask.id = 'hw-editor-mask';
    mask.className = 'hw-editor-mask';
    mask.onclick = closeHomeworkEditor;

    const sheet = document.createElement('div');
    sheet.id = 'hw-editor';
    sheet.className = 'hw-editor';
    sheet.innerHTML = `
        <div class="hw-editor-head">
            <h3>✏️ 修改作业${hw.recurringTaskId ? '（这一次）' : ''}</h3>
            <button class="hw-editor-close" onclick="closeHomeworkEditor()" aria-label="关闭">✕</button>
        </div>
        <div class="hw-editor-body">
            <div class="form-row">
                <label>科目</label>
                <select id="edit-subject">
                    ${SUBJECT_OPTIONS.map(s => `<option value="${s}"${s === hw.subject ? ' selected' : ''}>${s}</option>`).join('')}
                </select>
            </div>
            <div class="form-row">
                <label>作业内容</label>
                <textarea id="edit-content" rows="3">${escapeHtml(hw.content)}</textarea>
            </div>
            <div class="form-row">
                <label>截止时间</label>
                <input type="datetime-local" id="edit-deadline" value="${toLocalInput(hw.deadline)}">
            </div>
            <div class="form-row two-col">
                <div>
                    <label>预计时长（分钟）</label>
                    <input type="number" id="edit-duration" min="1" value="${hw.duration || 20}">
                </div>
                <div>
                    <label>奖励积分</label>
                    <input type="number" id="edit-points" min="1" value="${hw.points}">
                </div>
            </div>
            <div class="form-row">
                <label>附件图片（最多 ${MAX_ATTACHMENTS} 张）</label>
                <input type="file" id="edit-attachments" accept="image/*" multiple>
                <div class="edit-attach-grid" id="edit-attach-grid"></div>
            </div>
            ${hw.recurringTaskId
                ? '<p class="hw-editor-tip">这是定时作业自动生成的一条，在这里改只影响这一条。</p>'
                  + '<button class="btn-secondary" style="width:100%;margin-bottom:12px;" '
                  + 'onclick="openRecurEditor(&#39;' + hw.recurringTaskId + '&#39;,&#39;' + hw.id + '&#39;)">'
                  + '🔄 全量修改这个定时作业</button>'
                : ''}
            <div class="hw-editor-actions">
                <button class="btn-primary" onclick="saveHomeworkEdit()">保存修改</button>
                <button class="btn-secondary" onclick="closeHomeworkEditor()">取消</button>
            </div>
        </div>
    `;
    document.body.appendChild(mask);
    document.body.appendChild(sheet);
    renderEditAttachments();
    const attachInput = document.getElementById('edit-attachments');
    if (attachInput) attachInput.onchange = () => onEditAttachPicked(attachInput);
}

function renderEditAttachments() {
    const grid = document.getElementById('edit-attach-grid');
    if (!grid) return;
    grid.innerHTML = '';
    editingAttachments.forEach((a, idx) => {
        const cell = document.createElement('div');
        cell.className = 'edit-attach-cell';
        cell.innerHTML = `
            <img src="${a.url}" alt="${escapeHtml(a.name || '附件')}">
            <button class="edit-attach-del" onclick="removeEditAttachment(${idx})" aria-label="删除">✕</button>
        `;
        cell.querySelector('img').onclick = () => openImageViewer(a.url);
        grid.appendChild(cell);
    });
}

function removeEditAttachment(idx) {
    editingAttachments.splice(idx, 1);
    renderEditAttachments();
}

async function onEditAttachPicked(input) {
    if (!input || !input.files || !input.files.length) return;
    editingAttachments = await mergeAttachments(editingAttachments, input.files);
    input.value = '';
    renderEditAttachments();
}

function closeHomeworkEditor() {
    const sheet = document.getElementById('hw-editor');
    const mask = document.getElementById('hw-editor-mask');
    if (sheet) sheet.remove();
    if (mask) mask.remove();
    editingHomeworkId = null;
    editingAttachments = [];
}

function saveHomeworkEdit() {
    if (!editingHomeworkId) return;
    const data = getData();
    const hw = data.homework.find(h => h.id === editingHomeworkId);
    if (!hw) { closeHomeworkEditor(); return; }

    const content = (document.getElementById('edit-content').value || '').trim();
    if (!content) { showToast('作业内容不能为空哦'); return; }

    hw.subject = document.getElementById('edit-subject').value;
    hw.content = content;
    hw.deadline = fromLocalInput(document.getElementById('edit-deadline').value);
    hw.duration = parseInt(document.getElementById('edit-duration').value, 10) || hw.duration || 20;
    hw.points = parseInt(document.getElementById('edit-points').value, 10) || hw.points;
    hw.attachments = editingAttachments.slice();

    saveData(data);
    closeHomeworkEditor();
    refreshAfterChange();
    showToast('已保存修改 ✨');
}

// ================= 家长端：定时（周期）作业的全量修改 =================
// 定时作业由两部分组成：
//   · 模板：data.recurringTasks[]，决定"什么时候生成、生成什么"
//   · 实例：data.homework[] 里 recurringTaskId 指向模板的那些，由 generateRecurringTasks 派生
// 「全量修改」= 改模板，并把新内容一次性盖到所有【还没完成】的实例上；
// 已完成的实例保留原样（历史记录不能被追溯改写）。

// 周期文案：每天 / 每周三 / 每月 15 号
function cycleText(task) {
    if (!task) return '';
    if (task.frequency === 'weekly') {
        const d = parseInt(task.weeklyDay, 10);
        const cn = (WEEKDAY_CN[d] || '周一').replace('周', '');
        return '每周' + cn;
    }
    if (task.frequency === 'monthly') return `每月 ${parseInt(task.monthlyDay, 10) || 1} 号`;
    return '每天';
}

// 某个模板下还没完成的实例
function pendingInstancesOf(data, taskId) {
    return (data.homework || []).filter(h => h.recurringTaskId === taskId && !h.done);
}

let editingRecurId = null;
let recurAttachments = [];

function recurFreqOptions(cur) {
    return [
        ['daily', '每天'],
        ['weekly', '每周'],
        ['monthly', '每月']
    ].map(([v, label]) =>
        `<option value="${v}"${v === (cur || 'daily') ? ' selected' : ''}>${label}</option>`
    ).join('');
}

// 打开「定时作业」全量修改弹层。fromSingleId = 从某条派生作业跳进来的，顺便关掉那个弹层
function openRecurEditor(taskId, fromSingleId) {
    const data = getData();
    const task = (data.recurringTasks || []).find(t => t.id === taskId);
    if (!task) { showToast('这个定时作业已经不在了'); return; }
    if (fromSingleId) closeHomeworkEditor();

    editingRecurId = taskId;
    recurAttachments = (task.attachments || []).slice();

    const old = document.getElementById('recur-editor');
    if (old) old.remove();
    const oldMask = document.getElementById('recur-editor-mask');
    if (oldMask) oldMask.remove();

    const freq = task.frequency || 'daily';
    const pendingCount = pendingInstancesOf(data, taskId).length;

    const mask = document.createElement('div');
    mask.id = 'recur-editor-mask';
    mask.className = 'hw-editor-mask';
    mask.onclick = closeRecurEditor;

    const sheet = document.createElement('div');
    sheet.id = 'recur-editor';
    sheet.className = 'hw-editor';
    sheet.innerHTML = `
        <div class="hw-editor-head">
            <h3>🔄 全量修改定时作业</h3>
            <button class="hw-editor-close" onclick="closeRecurEditor()" aria-label="关闭">✕</button>
        </div>
        <div class="hw-editor-body">
            <div class="form-row">
                <label>科目</label>
                <select id="recur-subject">
                    ${SUBJECT_OPTIONS.map(s => `<option value="${s}"${s === task.subject ? ' selected' : ''}>${s}</option>`).join('')}
                </select>
            </div>
            <div class="form-row">
                <label>作业内容</label>
                <textarea id="recur-content" rows="3">${escapeHtml(task.content)}</textarea>
            </div>
            <div class="form-row">
                <label>重复周期</label>
                <select id="recur-frequency" onchange="onRecurFrequencyChange()">
                    ${recurFreqOptions(freq)}
                </select>
            </div>
            <div class="form-row" id="recur-weekly-row" style="display:${freq === 'weekly' ? 'block' : 'none'};">
                <label>每周几</label>
                <select id="recur-weekly-day">
                    ${WEEKDAY_CN.map((n, i) => `<option value="${i}"${i === parseInt(task.weeklyDay, 10) ? ' selected' : ''}>${n}</option>`).join('')}
                </select>
            </div>
            <div class="form-row" id="recur-monthly-row" style="display:${freq === 'monthly' ? 'block' : 'none'};">
                <label>每月几号</label>
                <input type="number" id="recur-monthly-day" min="1" max="31" value="${parseInt(task.monthlyDay, 10) || 1}">
            </div>
            <div class="form-row two-col">
                <div>
                    <label>预计时长（分钟）</label>
                    <input type="number" id="recur-duration" min="1" value="${task.duration || 20}">
                </div>
                <div>
                    <label>奖励积分</label>
                    <input type="number" id="recur-points" min="1" value="${task.points || 10}">
                </div>
            </div>
            <div class="form-row">
                <label>附件图片（最多 ${MAX_ATTACHMENTS} 张）</label>
                <input type="file" id="recur-attachments" accept="image/*" multiple>
                <div class="edit-attach-grid" id="recur-attach-grid"></div>
            </div>
            <p class="hw-editor-tip">保存后会<b>同步更新所有还没完成的同类作业</b>${pendingCount ? `（当前 ${pendingCount} 条）` : ''}，以后按新设置自动生成；已经完成的记录会保留原样。${pendingCount ? '' : '<br><b class="tip-warn">⚠️ 这条下面的作业都已经完成了，所以这次改动在页面上不会立刻看到变化，会从下次自动生成开始生效。</b>'}</p>
            <div class="hw-editor-actions">
                <button class="btn-primary" onclick="saveRecurEdit()">保存全量修改</button>
                <button class="btn-secondary" onclick="closeRecurEditor()">取消</button>
            </div>
        </div>
    `;
    document.body.appendChild(mask);
    document.body.appendChild(sheet);
    renderRecurAttachments();
    const attachInput = document.getElementById('recur-attachments');
    if (attachInput) attachInput.onchange = () => onRecurAttachPicked(attachInput);
}

function onRecurFrequencyChange() {
    const freq = $('recur-frequency').value;
    $('recur-weekly-row').style.display = freq === 'weekly' ? 'block' : 'none';
    $('recur-monthly-row').style.display = freq === 'monthly' ? 'block' : 'none';
}

function renderRecurAttachments() {
    const grid = document.getElementById('recur-attach-grid');
    if (!grid) return;
    grid.innerHTML = '';
    recurAttachments.forEach((a, idx) => {
        const cell = document.createElement('div');
        cell.className = 'edit-attach-cell';
        cell.innerHTML = `
            <img src="${a.url}" alt="${escapeHtml(a.name || '附件')}">
            <button class="edit-attach-del" onclick="removeRecurAttachment(${idx})" aria-label="删除">✕</button>
        `;
        cell.querySelector('img').onclick = () => openImageViewer(a.url);
        grid.appendChild(cell);
    });
}

function removeRecurAttachment(idx) {
    recurAttachments.splice(idx, 1);
    renderRecurAttachments();
}

async function onRecurAttachPicked(input) {
    if (!input || !input.files || !input.files.length) return;
    recurAttachments = await mergeAttachments(recurAttachments, input.files);
    input.value = '';
    renderRecurAttachments();
}

function closeRecurEditor() {
    const sheet = document.getElementById('recur-editor');
    const mask = document.getElementById('recur-editor-mask');
    if (sheet) sheet.remove();
    if (mask) mask.remove();
    editingRecurId = null;
    recurAttachments = [];
}

function saveRecurEdit() {
    if (!editingRecurId) return;
    const data = getData();
    const task = (data.recurringTasks || []).find(t => t.id === editingRecurId);
    if (!task) { closeRecurEditor(); return; }

    // 表单元素万一不在了，安全读取；直接 .value 抛错的话整个保存会静默失败
    const val = id => { const el = document.getElementById(id); return el ? el.value : ''; };
    const content = (val('recur-content') || '').trim();
    if (!content) { showToast('作业内容不能为空哦'); return; }

    const snap = () => JSON.stringify({
        s: task.subject, c: task.content, f: task.frequency,
        w: task.weeklyDay, m: task.monthlyDay,
        d: task.duration, p: task.points, a: task.attachments
    });
    const before = snap();
    let touched = [];

    try {
        task.subject = val('recur-subject') || task.subject;
        task.content = content;
        task.frequency = val('recur-frequency') || task.frequency || 'daily';
        if (task.frequency === 'weekly') {
            task.weeklyDay = parseInt(val('recur-weekly-day'), 10);
        } else if (task.frequency === 'monthly') {
            task.monthlyDay = parseInt(val('recur-monthly-day'), 10) || 1;
        }
        task.duration = parseInt(val('recur-duration'), 10) || task.duration || 20;
        task.points = parseInt(val('recur-points'), 10) || task.points || 10;
        task.attachments = recurAttachments.slice();
        task.updatedAt = new Date().toISOString();

        // ---- 全量同步：盖到所有还没完成的实例上（截止时间、完成状态、积分记录都不动）----
        touched = pendingInstancesOf(data, task.id);
        touched.forEach(h => {
            h.subject = task.subject;
            h.content = task.content;
            h.duration = task.duration;
            h.points = task.points;
            h.attachments = (task.attachments || []).slice();
        });

        saveData(data);

        // 立刻回读，确认真的落盘了（避免"看着保存了其实没写进去"）
        const written = JSON.parse(localStorage.getItem(activeStorageKey()) || '{}');
        const back = (written.recurringTasks || []).find(t => t.id === task.id);
        if (!back || back.content !== task.content) throw new Error('写入后回读校验不一致');
    } catch (err) {
        console.warn('[定时作业] 全量修改保存失败：', err);
        showToast('保存出错了，请再试一次');
        return;
    }

    const noChange = before === snap();

    closeRecurEditor();
    refreshAfterChange();
    highlightRecurChanges(task.id, touched.map(h => h.id));

    if (noChange) {
        showToast('这次没有改动任何内容哦');
    } else if (touched.length) {
        showToast(`已全量修改，同步更新 ${touched.length} 条未完成作业 ✨`);
    } else {
        // 0 条同步时，页面本来就不会有可见变化——必须说清楚原因，否则就像功能坏了
        showToast('已全量修改 ✨ 这条下面的作业都已完成了，改动从下次自动生成开始生效');
    }
}

// 全量修改后，提示当前周期作业卡片已经更新。
function highlightRecurChanges(taskId, instIds) {
    requestAnimationFrame(() => {
        const sel = [`#upgrade-root .up-recurring-card[data-recur-id="${taskId}"]`];
        let nodes = [];
        try { nodes = Array.prototype.slice.call(document.querySelectorAll(sel.join(','))); } catch (e) { return; }
        nodes.forEach(n => {
            n.classList.remove('flash');
            void n.offsetWidth;            // 强制重排，动画能重复触发
            n.classList.add('flash');
            setTimeout(() => n.classList.remove('flash'), 2000);
        });
    });
}

// 暂停 / 恢复自动生成（模板的 active 开关）
function toggleRecurTemplate(taskId) {
    const data = getData();
    const task = (data.recurringTasks || []).find(t => t.id === taskId);
    if (!task) return;
    task.active = !task.active;
    saveData(data);
    refreshAfterChange();
    showToast(task.active ? '已恢复自动生成 ▶️' : '已暂停，不会再自动生成 ⏸');
}

function deleteRecurTemplate(taskId) {
    const data = getData();
    const task = (data.recurringTasks || []).find(t => t.id === taskId);
    if (!task) return;

    if (!confirm(`删除定时作业「${task.content}」？\n\n删除后不再自动生成，已经完成的记录会保留。`)) return;

    const pending = pendingInstancesOf(data, task.id);
    let dropPending = false;
    if (pending.length) {
        dropPending = confirm(`还有 ${pending.length} 条没完成的作业。\n\n「确定」= 一起删掉；「取消」= 只停止自动生成，这些作业留着。`);
    }

    data.recurringTasks = (data.recurringTasks || []).filter(t => t.id !== taskId);
    if (dropPending) {
        const ids = pending.map(h => h.id);
        data.homework = data.homework.filter(h => ids.indexOf(h.id) === -1);
    }
    saveData(data);
    refreshAfterChange();
    showToast(dropPending ? '定时作业和未完成的记录都删掉了' : '已停止自动生成');
}

// 家长端首页的「定时作业」清单
function renderParentRecurring(data) {
    const host = $('p-recur-list');
    if (!host) return;

    // 启用的排前面，暂停的沉底
    const tasks = (data.recurringTasks || []).slice().sort((a, b) => {
        const av = a.active ? 0 : 1, bv = b.active ? 0 : 1;
        return av - bv;
    });
    const activeCount = tasks.filter(t => t.active).length;
    setText('p-recur-badge', tasks.length ? `${activeCount}/${tasks.length} 启用` : '没设置');

    host.innerHTML = '';
    if (!tasks.length) {
        host.innerHTML = `<div class="empty-state">
            <span class="big-emoji">🔄</span>
            <p>还没有定时作业。<br>发布作业时勾上「🔄 周期作业」，就能每天 / 每周 / 每月自动布置啦。</p>
        </div>`;
        return;
    }

    tasks.forEach(task => {
        const pending = pendingInstancesOf(data, task.id).length;
        const row = document.createElement('div');
        row.className = 'hw-row' + (task.active ? '' : ' off');
        row.dataset.recurId = task.id;   // 供「全量修改」后定位高亮
        row.innerHTML = `
            <span class="r-ico ${subjectClass(task.subject)}">${subjectIcon(task.subject)}</span>
            <div class="hw-main">
                <div class="hw-top">
                    <span class="hw-subj">${escapeHtml(task.subject)} <span class="hw-recur-mark">🔄</span></span>
                    <span class="hw-pts">+${task.points || 0} 分</span>
                </div>
                <span class="hw-desc">${escapeHtml(task.content)}</span>
                <span class="hw-note"><span class="recur-when">${cycleText(task)}</span>${task.duration ? ' ⏳ ' + task.duration + ' 分钟' : ''}${task.active ? (pending ? ` · 待完成 ${pending} 条` : '') : ' · ⏸ 已暂停'}</span>
                ${attachmentsHtml(task.attachments)}
                <div class="hw-acts">
                    <button class="hw-btn done" onclick="openRecurEditor('${task.id}')">✏️ 全量修改</button>
                    <button class="hw-btn undo" onclick="toggleRecurTemplate('${task.id}')">${task.active ? '⏸ 暂停' : '▶️ 恢复'}</button>
                    <button class="hw-btn del" onclick="deleteRecurTemplate('${task.id}')">删除</button>
                </div>
            </div>
        `;
        host.appendChild(row);
    });
}

// ================= 儿童端 =================
function renderChild() {
    const data = getData();

    // 每个区块独立容错：任意一段出错都不会连累后面的区块
    // （尤其是展示墙——早期某一区块抛错会导致展示墙留在空白状态）
    const step = (name, fn) => {
        try { fn(); } catch (err) { console.warn('[儿童端] ' + name + ' 渲染失败：', err); }
    };

    step('伙伴', () => renderMate(data));
    step('顶栏', () => renderChildTopbar(data));
    step('首页文案', () => renderChildHome(data));
    step('月历', () => renderChildMonth());
    step('今日时间线', () => renderChildTimelineForDay());
    step('日历页选中日', () => renderChildCalendarDay());
    step('展示墙', () => renderInventory(data));
    step('成就', () => renderChildAchieve(data));
    step('商城', () => renderShop(data));
    step('报告', () => renderChildReportPage(data));
}

// 顶栏：小岛天气 / 小岛情况 胶囊 + 积分胶囊 + 伙伴头像
// 天气与「岛屿情况」都按真实数据算，不是写死的文案：
//   天气：按日期确定性取一个（同一天永远一样，不会刷新就变）
//   岛屿情况：按今天的完成进度分三档（平静 / 忙碌 / 丰收）
function renderChildTopbar(data) {
    setText('child-points', data.points);

    const today = todayStr();
    const weatherIcons = ['#i-sun', '#i-leaf', '#i-sun', '#i-leaf'];
    const weatherTexts = ['今日晴', '今日风', '今日阳', '今日爽'];
    const wi = parseInt(today.replace(/-/g, ''), 10) % weatherTexts.length;
    const wEl = $('hud-weather');
    if (wEl) {
        const svg = '<svg class="ci"><use href="' + weatherIcons[wi] + '"/></svg>';
        wEl.innerHTML = svg + weatherTexts[wi] + ' 22&deg;';
    }

    // 小岛情况：今天还有几件事没做
    const tl = buildDayTimeline(data, new Date());
    const rest = tl.items.filter(i => !i.done).length;
    setText('hud-mood', rest === 0 ? '岛屿丰收' : (rest <= 2 ? '岛屿平静' : '岛屿忙碌'));

    const hours = new Date().getHours();
    let hi = '你好呀';
    if (hours < 5) hi = '夜深啦';
    else if (hours < 12) hi = '早上好';
    else if (hours < 18) hi = '下午好';
    else hi = '晚上好';
    setText('child-hi', hi);
}

// 今日岛屿：欢迎语 + 当日三统计 + 选中日概要
// 文案全部由真实数据算出，不写死。
function renderChildHome(data) {
    const dayItems = data.homework.filter(h => isTaskOnDate(h, childDay));
    const open = dayItems.filter(h => !h.done).length;
    const done = dayItems.length - open;
    const isToday = childDay === todayStr();
    const dt = new Date(childDay + 'T00:00:00');
    const when = isToday ? '今天' : `${dt.getMonth() + 1}月${dt.getDate()}日`;

    setText('child-greeting', dayItems.length
        ? (open
            ? `${when}有 ${dayItems.length} 项作业，完成一项就离新伙伴更近一步！`
            : `${when}的 ${dayItems.length} 项作业全部完成，太棒啦 🎉`)
        : `${when}还没有作业，先去岛上玩一会儿吧！`);

    // 今日三统计：作业 / 已完成 / 小岛积分（和家长端看板同一套组件）
    const statsEl = $('c-stats');
    if (statsEl) {
        statsEl.innerHTML =
            `<span class="stat"><b>${dayItems.length}</b><span>今日作业</span></span>` +
            `<span class="stat hot"><b>${done}</b><span>已完成</span></span>` +
            `<span class="stat gold"><b>${data.points || 0}</b><span>小岛积分</span></span>`;
    }

    // 报告页副标题也用今天的数据
    setText('rep-sub', dayItems.length
        ? `今天已完成 ${done}/${dayItems.length} 项，继续加油～`
        : '先完成几项作业，报告就丰富起来啦～');
}

// ================= 儿童端：今日岛屿（月历 + 当日时间线） =================
// childDay：当前查看的日期（'YYYY-MM-DD'）；childMonthAnchor：月历所在的月份。
let childDay = todayStr();
let childMonthAnchor = new Date();

// 作业是否落在指定日期（无日期的作业默认算"今天"，与 app 既有口径一致）
function isTaskOnDate(hw, ds) {
    const d = taskDate(hw);
    if (!d) return ds === todayStr();
    return isSameDayOf(d, new Date(ds + 'T00:00:00'));
}

// 渲染月历网格：每天下方用圆点 + 数字标记当天有「作业/课/事件」共几件
function renderChildMonth() {
    const grid = $('c-month-grid');
    if (!grid) return;
    const y = childMonthAnchor.getFullYear(), m = childMonthAnchor.getMonth();
    setText('c-month-title', `${y}年${m + 1}月`);
    const firstDow = (new Date(y, m, 1).getDay() + 6) % 7; // 周一为一周起点
    const n = new Date(y, m + 1, 0).getDate();
    const data = getData();
    const today = todayStr();
    const cells = [];
    for (let i = 0; i < firstDow; i++) cells.push('<span class="cd mute"></span>');
    for (let d = 1; d <= n; d++) {
        const ds = `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
        const hwCount = (data.homework || []).filter(h => isTaskOnDate(h, ds)).length;
        const clsCount = classesOnDay(data, new Date(y, m, d)).length;
        const evCount = (data.events || []).filter(e => e.date === ds).length;
        const total = hwCount + clsCount + evCount;
        const sel = ds === childDay ? ' sel' : '';
        const ist = ds === today ? ' today' : '';
        const mark = total ? `<i class="cd-dot${total >= 3 ? ' many' : ''}"></i><b class="cd-cnt">${total}</b>` : '';
        cells.push(`<button type="button" class="cd${sel}${ist}" onclick="selectChildDay('${ds}')">${d}${mark}</button>`);
    }
    grid.innerHTML = cells.join('');
}

// 渲染选中那天的统一时间线（作业 + 课表 + 自由安排）
function renderChildTimelineForDay() {
    const data = getData();
    const d = new Date(childDay + 'T00:00:00');
    const board = $('c-timeline-board');
    const r = renderTimeline('c-timeline', data, d, 'child');
    if (board) board.style.display = (r.total > 0) ? '' : 'none';
    setText('c-timeline-count', r.total ? `${r.done} / ${r.total} 项` : '暂无');
    const dt = new Date(childDay + 'T00:00:00');
    const wd = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'][dt.getDay()];
    const isToday = childDay === todayStr();
    setText('c-day-label', isToday ? '今天' : `${dt.getMonth() + 1}月${dt.getDate()}日 ${wd}`);
    const sum = $('c-day-summary');
    if (sum) {
        const rest = r.total - r.done;
        sum.innerHTML = isToday
            ? `今天 <b>${r.total}</b> 件事 · 完成 <b>${r.done}</b>${rest ? ` · 待完成 <b>${rest}</b>` : ''}`
            : `${dt.getMonth() + 1}月${dt.getDate()}日 共 <b>${r.total}</b> 件事`;
    }
}

function selectChildDay(ds) {
    childDay = ds;
    childMonthAnchor = new Date(ds + 'T00:00:00');
    renderChildMonth();
    renderChildTimelineForDay();
    renderChildCalendarDay();
}
// 小岛日历页：选中那天的安排（与「今日岛屿」用同一条时间轴组件，只是换个容器）
function renderChildCalendarDay() {
    const board = $('c-cal-board');
    if (!board) return;
    const data = getData();
    const d = new Date(childDay + 'T00:00:00');
    const r = renderTimeline('c-cal-timeline', data, d, 'child');
    board.style.display = r.total > 0 ? '' : 'none';
    const dt = new Date(childDay + 'T00:00:00');
    const wd = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'][dt.getDay()];
    const isToday = childDay === todayStr();
    setText('c-cal-day-label', isToday ? '今天' : `${dt.getMonth() + 1}月${dt.getDate()}日 ${wd}`);
    setText('c-cal-count', r.total ? `${r.done} / ${r.total} 项` : '暂无安排');
}
function stepChildMonth(dir) {
    childMonthAnchor = new Date(childMonthAnchor.getFullYear(), childMonthAnchor.getMonth() + dir, 1);
    renderChildMonth();
}
function goChildTodayDay() {
    childDay = todayStr();
    childMonthAnchor = new Date();
    renderChildMonth();
    renderChildTimelineForDay();
    renderChildCalendarDay();
}
function deleteEventFromEditor() {
    if (!editingEventId) { closeEventEditor(); return; }
    const id = editingEventId;
    closeEventEditor();
    deleteEvent(id);
}

// ================= 儿童端：日 / 周 / 月 视图 =================
let childRange = 'day';   // 'day' | 'week' | 'month'
let childAnchor = new Date();  // 当前查看的基准日期，可前后翻看过去 / 未来

function switchRange(range) {
    if (range !== childRange) childAnchor = new Date();  // 切换日/周/月时先回到今天所在区间
    childRange = range;
    document.querySelectorAll('#range-switch .range-btn').forEach(btn => {
        btn.classList.toggle('on', btn.dataset.range === range);
    });
    renderChildHomeworkList(getData());
}

// 往前 / 往后翻一个区间
function stepChildRange(dir) {
    const d = new Date(childAnchor.getFullYear(), childAnchor.getMonth(), childAnchor.getDate());
    if (childRange === 'day') d.setDate(d.getDate() + dir);
    else if (childRange === 'week') d.setDate(d.getDate() + dir * 7);
    else d.setMonth(d.getMonth() + dir);
    childAnchor = d;
    renderChildHomeworkList(getData());
}

function goChildToday() {
    childAnchor = new Date();
    renderChildHomeworkList(getData());
    showToast('已回到今天');
}

// 取某个日期所在周的周一 00:00
function startOfWeek(d) {
    const x = new Date(d.getFullYear(), d.getMonth(), d.getDate());
    const day = x.getDay();                  // 0=周日
    const offset = day === 0 ? -6 : 1 - day; // 让周一为一周起点
    x.setDate(x.getDate() + offset);
    return x;
}

// 取某天 00:00
function startOfDay(d) {
    return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

// 计算当前视图的时间区间 [start, end]（含端点）
function getRangeBounds() {
    const a = new Date(childAnchor.getFullYear(), childAnchor.getMonth(), childAnchor.getDate());
    if (childRange === 'day') {
        const s = startOfDay(a);
        const e = new Date(s); e.setDate(e.getDate() + 1);
        return { start: s, end: e };
    }
    if (childRange === 'week') {
        const s = startOfWeek(a);
        const e = new Date(s); e.setDate(e.getDate() + 7);
        return { start: s, end: e };
    }
    const s = new Date(a.getFullYear(), a.getMonth(), 1);
    const e = new Date(a.getFullYear(), a.getMonth() + 1, 1);
    return { start: s, end: e };
}

// 任务落在区间内？未完成按截止时间，已完成按完成时间判断
function taskInRange(hw, bounds) {
    const iso = hw.done ? (hw.completedAt || hw.deadline) : (hw.deadline || hw.createdAt);
    if (!iso) return childRange === 'day';   // 没时间的任务只在「日」视图显示
    const t = new Date(iso).getTime();
    return t >= bounds.start.getTime() && t < bounds.end.getTime();
}

// 区间提示文案
function getRangeLabel(bounds) {
    const s = bounds.start;
    const e = new Date(bounds.end.getTime() - 1);   // 回到区间最后一天
    if (childRange === 'day') {
        const today = startOfDay(new Date());
        const diff = Math.round((s - today) / 86400000);
        const base = `${s.getMonth() + 1}月${s.getDate()}日`;
        if (diff === 0) return `今天 · ${base}`;
        if (diff === 1) return `明天 · ${base}`;
        if (diff === -1) return `昨天 · ${base}`;
        return base;
    }
    if (childRange === 'week') {
        return `本周 ${s.getMonth() + 1}/${s.getDate()} - ${e.getMonth() + 1}/${e.getDate()}`;
    }
    return `${s.getFullYear()}年${s.getMonth() + 1}月`;
}

function renderChildHomeworkList(data) {
    const listEl = $('child-homework-list');
    if (!listEl) return;
    listEl.innerHTML = '';

    const bounds = getRangeBounds();

    // 标题与区间提示
    setText('hw-title', childRange === 'day' ? '今日作业'
                     : childRange === 'week' ? '本周作业' : '本月作业');
    setText('range-hint', getRangeLabel(bounds));

    // 该区间内的全部任务
    const inRange = data.homework.filter(h => taskInRange(h, bounds));

    // 顶部进度角标
    const doneCount = inRange.filter(h => h.done).length;
    const badge = $('hw-badge');
    if (badge) {
        badge.textContent = inRange.length ? `${doneCount}/${inRange.length} 完成` : '暂无作业';
        badge.classList.toggle('all-done', inRange.length > 0 && doneCount === inRange.length);
    }

    if (inRange.length === 0) {
        const todayStart = startOfDay(new Date()).getTime();
        const isToday = childRange === 'day' && bounds.start.getTime() === todayStart;
        const emptyText = childRange === 'day'
            ? (isToday ? '今天没有作业，去岛上玩吧！' : '这一天没有作业记录哦！')
            : childRange === 'week' ? '这一周还没有作业，好好休息吧！'
            : '这一月还没有作业记录哦！';
        listEl.innerHTML = `
            <div class="empty-state">
                <span class="big-emoji">🎉</span>
                <p>${emptyText}</p>
            </div>
        `;
        return;
    }

    // 按日期分组（日视图只有一天，不显示分组标题）
    const groups = {};
    const groupOrder = [];
    inRange.forEach(hw => {
        const iso = hw.done ? (hw.completedAt || hw.deadline || hw.createdAt)
                            : (hw.deadline || hw.createdAt);
        const d = iso ? new Date(iso) : new Date();
        const key = dayKey(d);
        if (!groups[key]) { groups[key] = []; groupOrder.push(key); }
        groups[key].push(hw);
    });

    // 组内：未完成排前面，各按时间升序
    groupOrder.forEach(k => {
        groups[k].sort((a, b) => {
            if (a.done !== b.done) return a.done ? 1 : -1;
            const ta = new Date(a.deadline || a.createdAt || 0).getTime();
            const tb = new Date(b.deadline || b.createdAt || 0).getTime();
            return ta - tb;
        });
    });
    groupOrder.sort();

    groupOrder.forEach(key => {
        // 日视图不显示分组标题
        if (childRange !== 'day') {
            const d = new Date(key + 'T00:00:00');
            const todayStart = startOfDay(new Date());
            const diff = Math.round((startOfDay(d) - todayStart) / 86400000);
            const wd = WEEKDAY_CN[d.getDay()];
            let label = `${d.getMonth() + 1}月${d.getDate()}日`;
            if (diff === 0) label = `今天 · ${label}`;
            else if (diff === 1) label = `明天 · ${label}`;
            else if (diff === -1) label = `昨天 · ${label}`;
            const groupEl = document.createElement('div');
            groupEl.className = 'hw-group';
            groupEl.innerHTML = `<div class="hw-group-title">${escapeHtml(label)} <span class="hw-group-wd">${wd}</span></div>`;
            listEl.appendChild(groupEl);
        }
        groups[key].forEach(hw => listEl.appendChild(buildChildItem(hw)));
    });
}

// 构建儿童端单条作业行
function buildChildItem(hw) {
    const el = document.createElement('div');
    const overdue = !hw.done && isOverdue(hw.deadline);
    el.className = 'hw-row' + (hw.done ? ' done' : '') + (overdue ? ' overdue' : '');

    let note;
    if (hw.done) {
        note = (hw.completedAt ? '✅ ' + formatDateTime(hw.completedAt) : '✅ 已完成')
             + (hw.duration ? ' · ⏳ ' + hw.duration + ' 分钟' : '');
    } else {
        note = (hw.deadline
                    ? (overdue ? '⚠️ 已逾期 · ' : '⏰ ') + formatDateTime(hw.deadline)
                    : '📌 没有截止时间')
             + (hw.duration ? ' · ⏳ ' + hw.duration + ' 分钟' : '');
    }

    // 右侧勾选圈：未完成 → 标记完成；已完成 → 取消完成
    const toggleFn = hw.done ? 'undoHomework' : 'completeHomework';

    el.innerHTML = `
        <span class="r-ico ${subjectClass(hw.subject)}">${subjectIcon(hw.subject)}</span>
        <div class="hw-main">
            <div class="hw-top">
                <span class="hw-subj">${escapeHtml(hw.subject)}${hw.recurringTaskId ? ' <span class="hw-recur-mark">🔄</span>' : ''}</span>
                <span class="hw-pts">+${hw.earnedPoints || hw.points} 分</span>
            </div>
            <span class="hw-desc">${escapeHtml(hw.content)}</span>
            <span class="hw-note${overdue ? ' warn' : ''}">${note}</span>
            ${attachmentsHtml(hw.attachments)}
            <div class="hw-acts">
                ${hw.done
                    ? `<button class="hw-btn undo" onclick="undoHomework('${hw.id}')">↩ 取消完成</button>`
                    : `<button class="hw-btn done" onclick="completeHomework('${hw.id}')">🌟 我完成啦</button>`}
            </div>
        </div>
        <button class="r-check" onclick="${toggleFn}('${hw.id}')"
                aria-label="${hw.done ? '取消完成' : '标记完成'}"></button>
    `;
    return el;
}

function undoHomework(id) {
    const data = getData();
    const hw = data.homework.find(h => h.id === id);
    if (!hw || !hw.done) return;

    const earned = hw.earnedPoints || hw.points;
    data.points = Math.max(0, data.points - earned);
    data.totalCompleted = Math.max(0, data.totalCompleted - 1);
    hw.done = false;
    hw.completedAt = null;
    hw.earnedPoints = 0;

    saveData(data);
    refreshAfterChange();
    showToast('已取消完成');
}

// ================= 材料收集 =================
const sessionNewMaterials = [];

// 按权重抽一件：越稀有的宝贝权重越小，深海 / 传说不会随随便便就掉出来
function pickMaterial() {
    const total = MATERIALS.reduce((s, m) => s + (m.w || 1), 0);
    let r = Math.random() * total;
    for (const m of MATERIALS) {
        r -= (m.w || 1);
        if (r <= 0) return m;
    }
    return MATERIALS[0];
}

function grantMaterialRewards(data) {
    if (!data.materials) data.materials = {};

    const count = 1 + Math.floor(Math.random() * 2); // 1-2 个
    const gained = [];

    for (let i = 0; i < count; i++) {
        const mat = pickMaterial();
        data.materials[mat.id] = (data.materials[mat.id] || 0) + 1;
        gained.push(mat);
    }
    return gained;
}

// ================= 小岛展示墙 =================
// 完成作业掉落的收集品，摆成一整面陈列墙用来装饰小岛。
// 2026-10-11 起按「岛上原野 / 浅海 / 深海 / 传说」分区，
// 儿童端展示墙与家长端「收集到的宝贝」共用这一个渲染函数，样式永远一致。
// opts.newIds      —— 本次刚捡到的 id（儿童端标⭐）
// opts.hideEmpty   —— 未收集的格子不画（家长端用：家长关心「已经收集了什么」，
//                     没必要摆一屏问号；儿童端展示墙保留问号，那是给孩子的目标感）
function renderMaterialWall(host, data, opts) {
    opts = opts || {};
    if (!host) return { kinds: 0, total: 0 };
    const hideEmpty = !!opts.hideEmpty;

    // 兜底：素材表异常时不留空白的木纹盒子（空盒子会像一排密密麻麻的竖纹）
    const list = Array.isArray(MATERIALS) ? MATERIALS : [];
    if (!list.length) {
        host.innerHTML = '<p class="wall-empty-tip">收集册还在准备中，先完成今天的作业吧～</p>';
        return { kinds: 0, total: 0 };
    }
    const newIds = Array.isArray(opts.newIds) ? opts.newIds : [];

    const mats = (data && data.materials) || {};
    const totalCollected = Object.values(mats).reduce((a, b) => a + b, 0);
    const kinds = list.filter(m => (mats[m.id] || 0) > 0).length;
    host.innerHTML = '';

    // 分区 → 组内按稀有度排（常见的在前，稀有的压轴）
    const groups = MATERIAL_GROUPS.map(g => ({
        ...g,
        items: list.filter(m => (m.group || 'isle') === g.id)
                   .sort((a, b) => (b.w || 1) - (a.w || 1))
    })).filter(g => g.items.length);

    let cellIdx = 0;
    groups.forEach(g => {
        const got = g.items.filter(m => (mats[m.id] || 0) > 0).length;
        if (got === 0 && hideEmpty) return;      // 家长端：不显示整片没碰过的海域

        const wrap = document.createElement('div');
        wrap.className = 'wall-group'
            + (g.id === 'legend' ? ' legend' : g.id === 'deep' ? ' deep' : '')
            + (got === 0 ? ' locked' : '');

        wrap.innerHTML = `<div class="wall-group-head"><span>${g.emo} ${g.name}</span>`
                       + `<span class="wall-group-num">${got === 0 ? '🔒 ' : ''}${got} / ${g.items.length}</span></div>`;

        // 整区没收集到：只留标题一行，不摆一排问号给孩子看
        if (got === 0) { host.appendChild(wrap); return; }

        g.items.forEach(mat => {
            const count = mats[mat.id] || 0;
            const has = count > 0;
            if (!has && hideEmpty) return;      // 家长端：只摆捡到的
            const isNew = has && newIds.includes(mat.id);

            const cell = document.createElement('div');
            cell.className = 'wall-cell' + (has ? ' filled' : ' empty') + (isNew ? ' is-new' : '');

            // 这里原来给每个格子加了 ±2° 的随机错落（rotate），想让陈列品"像真摆上去的"。
            // 但它带来两个真实问题，肉眼很明显：
            //   ① 旋转后的外接矩形比未旋转的大 1~2px，同一行格子尺寸不一致、边线对不齐；
            //   ② 角标、emoji、名字跟着一起微微转了，同一排东西歪向不同方向，看起来像"移位"。
            // 收集墙是给孩子数「几 / 几」的，规整对齐远比错落好看，所以去掉旋转。
            cell.innerHTML = `
                <div class="wall-shelf"><span class="wall-emoji">${has ? mat.emoji : '<span class="wall-lock">🔒</span>'}</span></div>
                <div class="wall-label">${has ? escapeHtml(mat.name) : '待解锁'}</div>
                ${has && count > 1 ? `<span class="wall-count">×${count}</span>` : ''}
                ${isNew ? '<span class="wall-star">⭐</span>' : ''}
            `;
            wrap.appendChild(cell);
        });

        host.appendChild(wrap);
    });

    return { kinds, total: totalCollected };
}

function renderInventory(data) {
    const wallEl = $('display-wall');
    if (!wallEl) return;

    const { kinds, total: totalCollected } = renderMaterialWall(wallEl, data, {
        newIds: sessionNewMaterials, collapsible: true
    });

    // 顶部提示
    const summaryEl = $('inventory-summary');
    if (summaryEl) {
        if (totalCollected === 0) {
            summaryEl.textContent = '完成一项作业，就能捡到一件宝贝摆上墙哦！';
        } else if (kinds === MATERIALS.length) {
            summaryEl.textContent = '哇，整面墙都摆满啦，海里的宝贝全被你捞回来了 🎉';
        } else {
            summaryEl.textContent = `已经摆上 ${kinds} / ${MATERIALS.length} 种宝贝，继续探索小岛的海吧！`;
        }
    }

    // 徽标
    const invTag = $('inv-count-tag');
    if (invTag) invTag.textContent = `${kinds} 种`;

    // 底部统计
    const statsEl = $('wall-stats');
    if (statsEl) {
        const progress = Math.round((kinds / MATERIALS.length) * 100);
        statsEl.innerHTML = `
            <div class="wall-progress">
                <div class="wall-progress-bar" style="width:${progress}%"></div>
            </div>
            <span class="wall-progress-text">小岛装饰度 ${progress}%　·　共 ${totalCollected} 件</span>
        `;
    }
}

// ================= 儿童端：今天的陪伴伙伴 =================
// 2026-09-22 起：伙伴不再按累计积分自动解锁，改为在「积分兑换」里花积分兑换。
// data.rewardsUnlocked 存的就是已经兑换到手的伙伴 emoji。

// 兑换清单里的伙伴项（含尚未兑换的）
function mateRewardItems(data) {
    return (data.rewardItems || []).filter(i => i.type === 'mate');
}

function findMateItem(data, emoji) {
    return mateRewardItems(data).find(i => i.emoji === emoji) || null;
}

// 已经兑换到手的伙伴
function getUnlockedRewards(data) {
    const owned = data.rewardsUnlocked || [];
    return mateRewardItems(data).filter(i => owned.includes(i.emoji));
}

// 取今天陪写的伙伴（跨天自动回到已兑换的某一个）
function getTodayMate(data) {
    const today = todayStr();
    if (data.mateDate !== today || !data.todayMate) return null;
    // 校验这个伙伴确实已经兑换到手
    if (!(data.rewardsUnlocked || []).includes(data.todayMate)) return null;
    return findMateItem(data, data.todayMate);
}

function ensureTodayMate(data) {
    const mate = getTodayMate(data);
    if (mate) return mate;
    // 默认给已兑换的最后一个伙伴；一个都没有时退回初始小熊
    const unlocked = getUnlockedRewards(data);
    const fallback = unlocked[unlocked.length - 1] || mateRewardItems(data)[0] || REWARDS[0];
    data.todayMate = fallback.emoji;
    data.mateDate = todayStr();
    saveData(data);
    return fallback;
}

function openMatePicker(e) {
    if (e) e.stopPropagation();
    const data = getData();
    const current = ensureTodayMate(data);
    const ovl = $('ovl-mate');

    if (ovl) {
        ovl.classList.add('on');
        document.body.classList.add('sheet-open');
    }

    const grid = $('mate-grid');
    if (grid) {
        grid.innerHTML = '';
        const all = mateRewardItems(data);
        all.forEach(r => {
            const isUnlocked = (data.rewardsUnlocked || []).includes(r.emoji);
            const isCurrent = current.emoji === r.emoji;
            const el = document.createElement('button');
            el.type = 'button';
            el.className = 'mate-card' + (isUnlocked ? ' unlocked' : ' locked') + (isCurrent ? ' current' : '');
            el.innerHTML = `
                <span class="mate-emoji">${isUnlocked ? r.emoji : '🔒'}</span>
                <span class="mate-name">${escapeHtml(r.name)}</span>
                <span class="mate-state">${isCurrent ? '今天陪你 ✨' : isUnlocked ? '选它' : `⭐ ${r.points} 分兑换`}</span>
            `;
            if (isUnlocked) {
                el.onclick = () => pickMate(r.emoji);
            } else {
                el.disabled = true;
            }
            grid.appendChild(el);
        });
    }

    const tip = $('mate-tip');
    if (tip) {
        const locked = mateRewardItems(data).filter(r => !(data.rewardsUnlocked || []).includes(r.emoji));
        tip.textContent = locked.length
            ? `还有 ${locked.length} 个伙伴没上岛，去「积分兑换」里用积分请它来吧！`
            : '所有伙伴都上岛啦，真棒！';
    }
}

function closeMatePicker() {
    const ovl = $('ovl-mate');
    if (ovl) ovl.classList.remove('on');
    document.body.classList.remove('sheet-open');
}

function pickMate(emoji, name) {
    const data = getData();
    if (!(data.rewardsUnlocked || []).includes(emoji)) {
        showToast('这个伙伴还没兑换哦，先去「积分兑换」请它上岛吧');
        return;
    }
    const r = findMateItem(data, emoji) || { emoji, name: name || '伙伴' };
    data.todayMate = emoji;
    data.mateDate = todayStr();
    saveData(data);
    closeMatePicker();
    refreshAfterChange();
    showToast(`${r.emoji} ${r.name} 今天陪你写作业啦！`);
    fireConfetti();
}

// 在顶栏头像与陪伴条上渲染当前伙伴
function renderMate(data) {
    const mate = ensureTodayMate(data);
    setText('mascot', mate.emoji);
    setText('mate-line', `${mate.name} 陪我写作业`);
    // 顶栏头像改为显示孩子自己（伙伴头像在首页那条陪伴栏里）
    setText('hud-avatar', data.kidAvatar || '👦');
}

// 保持旧调用名可用（内部已改为伙伴逻辑）
function renderRewards(data) {
    renderMate(data);
}

// ================= 儿童端：我的名片（头像 / 名字 / 心情签名） =================
// 头像全部用 emoji，不画图；孩子自己选一个
const AVATAR_CHOICES = [
    '👦', '👦', '👧', '🐣', '🐊', '🐬',
    '🐴', '🐯', '🐼', '🐺', '🐻', '🐰',
    '🐯', '🐨', '🐸', '🐙', '🐝', '🌸',
    '🌈', '⭐', '🍀', '🚀', '🎈', '🏝️'
];

let mePickedAvatar = null;

// 首页那张「我的名片」
function renderMeCard(data) {
    setText('me-avatar', data.kidAvatar || '👦');
    setText('me-name', data.kidName || '小岛主');
    const moodEl = $('me-mood');
    if (moodEl) {
        const mood = (data.kidMood || '').trim();
        moodEl.textContent = mood || '还没有心情签名，点一下写点什么吧～';
        moodEl.classList.toggle('empty', !mood);
    }
}

function openMeEditor() {
    const data = getData();
    closeMeEditor();
    mePickedAvatar = data.kidAvatar || '👦';

    const mask = document.createElement('div');
    mask.id = 'me-editor-mask';
    mask.className = 'hw-editor-mask';
    mask.onclick = closeMeEditor;

    const sheet = document.createElement('div');
    sheet.id = 'me-editor';
    sheet.className = 'hw-editor';
    sheet.innerHTML = `
        <div class="hw-editor-head">
            <h3>✏️ 我的名片</h3>
            <button class="hw-editor-close" onclick="closeMeEditor()" aria-label="关闭">✕</button>
        </div>
        <div class="hw-editor-body">
            <div class="form-row">
                <label>我的名字</label>
                <input type="text" id="me-name-input" maxlength="12" value="${escapeHtml(data.kidName || '')}" placeholder="写上你的名字">
            </div>
            <div class="form-row">
                <label>心情签名</label>
                <textarea id="me-mood-input" rows="2" maxlength="40" placeholder="今天心情怎么样？写一句话吧～">${escapeHtml(data.kidMood || '')}</textarea>
            </div>
            <div class="form-row">
                <label>选一个头像</label>
                <div class="avatar-grid" id="avatar-grid"></div>
            </div>
            <div class="hw-editor-actions">
                <button class="btn-primary" onclick="saveMeProfile()">保存</button>
                <button class="btn-secondary" onclick="closeMeEditor()">取消</button>
            </div>
        </div>
    `;
    document.body.appendChild(mask);
    document.body.appendChild(sheet);
    renderAvatarGrid();
}

function renderAvatarGrid() {
    const grid = document.getElementById('avatar-grid');
    if (!grid) return;
    grid.innerHTML = '';
    AVATAR_CHOICES.forEach(a => {
        const b = document.createElement('button');
        b.type = 'button';
        b.className = 'avatar-opt' + (a === mePickedAvatar ? ' on' : '');
        b.textContent = a;
        b.onclick = () => { mePickedAvatar = a; renderAvatarGrid(); };
        grid.appendChild(b);
    });
}

function saveMeProfile() {
    const data = getData();
    const nameEl = document.getElementById('me-name-input');
    const moodEl = document.getElementById('me-mood-input');
    const name = ((nameEl ? nameEl.value : '') || '').trim();
    if (!name) { showToast('给自己起个名字吧'); return; }

    try {
        data.kidName = name.slice(0, 12);
        data.kidMood = ((moodEl ? moodEl.value : '') || '').trim().slice(0, 40);
        data.kidAvatar = mePickedAvatar || data.kidAvatar || '👦';
        saveData(data);

        const back = JSON.parse(localStorage.getItem(activeStorageKey()) || '{}');
        if (back.kidName !== data.kidName || back.kidAvatar !== data.kidAvatar) {
            throw new Error('回读校验不一致');
        }
    } catch (err) {
        console.warn('[我的名片] 保存失败：', err);
        showToast('保存出错了，请再试一次');
        return;
    }

    closeMeEditor();
    refreshAfterChange();
    showToast('名片更新好啦 ✨');
}

function closeMeEditor() {
    const s = document.getElementById('me-editor');
    const m = document.getElementById('me-editor-mask');
    if (s) s.remove();
    if (m) m.remove();
}

// 伙伴改为积分兑换后，这里不再自动解锁（保留空实现兼容既有调用点）
function checkNewRewards(data) {
    /* 兑换制：解锁只能通过 redeemReward() 花积分完成 */
}

function renderDailyReport(data) {
    const today = todayStr();
    const todayItems = data.homework.filter(h => isSameDay(h.createdAt, today) || (h.deadline && isSameDay(h.deadline, today)));
    const todayDone = todayItems.filter(h => h.done);
    const todayPoints = todayDone.reduce((sum, h) => sum + (h.earnedPoints || h.points), 0);

    const container = $('child-daily-report');
    if (container) {
        container.innerHTML = `
            <div class="report-row"><span class="report-label">今日作业</span><span class="report-value">${todayItems.length} 项</span></div>
            <div class="report-row"><span class="report-label">已完成</span><span class="report-value">${todayDone.length} 项</span></div>
            <div class="report-row"><span class="report-label">今日积分</span><span class="report-value">+${todayPoints} 分</span></div>
            <div class="report-row"><span class="report-label">连续打卡</span><span class="report-value">${data.currentStreak || 0} 天</span></div>
        `;
    }

    const badge = $('rep-today-badge');
    if (badge) badge.textContent = todayItems.length ? `${todayDone.length}/${todayItems.length} 完成` : '还没有作业';
}

// ================= 儿童端：报告（v2 起改为独立页面） =================
function openReport() { gotoChildView('report'); }
function closeReport() { /* v2：报告已是独立页面，无需关闭 */ }
function switchReport() { /* v2：日报 / 月报在同一页里顺序展示 */ }

document.addEventListener('keydown', e => {
    if (e.key !== 'Escape') return;
    closeMatePicker();
    closePublishSheet();
});

function renderMonthlyReport(data, opts) {
    opts = opts || {};
    const canvasId = opts.canvasId || 'month-chart';
    const outId = opts.outId || 'child-monthly-report';

    const now = new Date();
    const year = now.getFullYear();
    const month = now.getMonth();

    // 统计本月每日积分
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const dailyPoints = new Array(daysInMonth).fill(0);

    data.homework.forEach(h => {
        if (!h.done || !h.completedAt) return;
        const d = new Date(h.completedAt);
        if (d.getFullYear() === year && d.getMonth() === month) {
            dailyPoints[d.getDate() - 1] += (h.earnedPoints || h.points);
        }
    });

    const monthTotal = dailyPoints.reduce((a, b) => a + b, 0);
    const monthDone = data.homework.filter(h => {
        if (!h.done || !h.completedAt) return false;
        const d = new Date(h.completedAt);
        return d.getFullYear() === year && d.getMonth() === month;
    }).length;

    const out = $(outId);
    if (out) {
        out.innerHTML = `
            <div class="report-row"><span class="report-label">本月完成</span><span class="report-value">${monthDone} 项</span></div>
            <div class="report-row"><span class="report-label">本月积分</span><span class="report-value">${monthTotal} 分</span></div>
        `;
    }

    if (opts.titleId) setText(opts.titleId, `${year} 年 ${month + 1} 月`);
    if (opts.badgeId) setText(opts.badgeId, `${monthDone} 项 · ${monthTotal} 分`);

    drawMonthChart(canvasId, dailyPoints, daysInMonth);
}

function drawMonthChart(canvasId, dailyPoints, daysInMonth) {
    const canvas = $(canvasId);
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const width = canvas.width;
    const height = canvas.height;
    const padding = 24;
    const chartW = width - padding * 2;
    const chartH = height - padding * 2;

    ctx.clearRect(0, 0, width, height);

    const max = Math.max(...dailyPoints, 10);
    const stepX = chartW / Math.max(daysInMonth, 1);

    // 绘制柱状图
    const barW = Math.max(4, stepX - 4);
    dailyPoints.forEach((val, idx) => {
        const x = padding + idx * stepX + (stepX - barW) / 2;
        const barH = (val / max) * chartH;
        const y = padding + chartH - barH;

        const gradient = ctx.createLinearGradient(0, y, 0, y + barH);
        gradient.addColorStop(0, '#aed581');
        gradient.addColorStop(1, '#7cb342');

        ctx.fillStyle = gradient;
        ctx.fillRect(x, y, barW, barH);
    });

    // 标签
    ctx.fillStyle = '#7a6853';
    ctx.font = '10px sans-serif';
    ctx.textAlign = 'center';
    for (let i = 0; i < daysInMonth; i += 5) {
        const x = padding + i * stepX + stepX / 2;
        ctx.fillText((i + 1) + '日', x, height - 4);
    }
}

// ================= 礼花特效 =================
function fireConfetti() {
    const canvas = $('confetti-canvas');
    const ctx = canvas.getContext('2d');
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;

    const colors = ['#7cb342', '#aed581', '#fff176', '#f8bbd0', '#b3e5fc', '#ffcc80'];
    const particles = [];
    const emojis = ['⭐', '🌟', '✨', '🎉', '🍊', '🍐', '🍒', '🌸', '🍃', '🍎'];

    for (let i = 0; i < 70; i++) {
        particles.push({
            x: canvas.width / 2,
            y: canvas.height / 2,
            vx: (Math.random() - 0.5) * 14,
            vy: (Math.random() - 1) * 14 - 4,
            gravity: 0.35,
            color: colors[Math.floor(Math.random() * colors.length)],
            size: Math.random() * 8 + 4,
            rotation: Math.random() * Math.PI * 2,
            rotSpeed: (Math.random() - 0.5) * 0.2,
            emoji: Math.random() > 0.6 ? emojis[Math.floor(Math.random() * emojis.length)] : null,
            life: 1
        });
    }

    function animate() {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        let alive = false;

        particles.forEach(p => {
            if (p.life <= 0) return;
            alive = true;
            p.x += p.vx;
            p.y += p.vy;
            p.vy += p.gravity;
            p.rotation += p.rotSpeed;
            p.life -= 0.015;

            ctx.save();
            ctx.translate(p.x, p.y);
            ctx.rotate(p.rotation);
            ctx.globalAlpha = Math.max(0, p.life);

            if (p.emoji) {
                ctx.font = `${p.size * 2}px sans-serif`;
                ctx.fillText(p.emoji, -p.size, p.size / 2);
            } else {
                ctx.fillStyle = p.color;
                ctx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size);
            }

            ctx.restore();
        });

        if (alive) {
            requestAnimationFrame(animate);
        } else {
            ctx.clearRect(0, 0, canvas.width, canvas.height);
        }
    }

    animate();
}

// ================= 岛屿随机动效 =================
// v2 起首页主视觉是一张静态插画，不再有会走动的场景元素，
// 只保留「水果 / 花瓣飘落」这一种不依赖场景容器的轻量动效。
const FALLING_ITEMS = ['🍊', '🍐', '🍒', '🌸', '🍃', '🍎', '🌸', '🍃'];
const WALKERS = ['🐻', '🐰', '🐺', '🐱', '🐶', '🐼', '🐿️', '🐦', '🐯'];

function startIslandEvents() {
    if (document.body.getAttribute('data-mode') !== 'child') return;
    // 开场撒一波
    for (let i = 0; i < 3; i++) {
        setTimeout(spawnFallingItem, 600 + i * 900);
    }
    scheduleIslandEvent(spawnFallingItem, 5000, 11000);
}

function scheduleIslandEvent(fn, minMs, maxMs) {
    const run = () => {
        try { fn(); } catch (e) { /* 忽略动效异常 */ }
        setTimeout(run, minMs + Math.random() * (maxMs - minMs));
    };
    setTimeout(run, minMs + Math.random() * (maxMs - minMs));
}

function spawnFallingItem() {
    // 只服务儿童端的「水果 / 花瓣飘落」；家长端没有主视觉容器，别让它们飘到 body 上
    if (document.body.getAttribute('data-mode') !== 'child') return;
    const host = document.querySelector('.hero') || document.body;
    if (!host) return;
    const item = document.createElement('div');
    item.className = 'falling-item';
    item.textContent = FALLING_ITEMS[Math.floor(Math.random() * FALLING_ITEMS.length)];
    item.style.left = (Math.random() * 88 + 4) + '%';
    item.style.top = '-10px';
    item.style.fontSize = (14 + Math.random() * 12) + 'px';
    item.style.animationDuration = (4 + Math.random() * 3) + 's';
    host.appendChild(item);
    setTimeout(() => item.remove(), 9000);
}

// ================= 图片 OCR =================
let pendingImageFile = null;

function handleImageUpload(input) {
    const statusEl = $('ocr-status');
    const previewBox = $('image-preview-box');
    const previewImg = $('image-preview');
    const recognizeBtn = $('btn-recognize');

    if (!input.files || input.files.length === 0) {
        pendingImageFile = null;
        previewBox.style.display = 'none';
        recognizeBtn.disabled = true;
        return;
    }

    const file = input.files[0];
    pendingImageFile = file;

    // 预览
    const reader = new FileReader();
    reader.onload = (e) => {
        previewImg.src = e.target.result;
        previewBox.style.display = 'block';
    };
    reader.readAsDataURL(file);

    recognizeBtn.disabled = false;
    statusEl.className = 'ocr-status';
    statusEl.textContent = '';
}

async function recognizeImage() {
    if (!pendingImageFile) {
        showToast('请先选择一张图片');
        return;
    }

    const statusEl = $('ocr-status');
    const recognizeBtn = $('btn-recognize');

    statusEl.className = 'ocr-status loading';
    statusEl.textContent = '🔍 正在识别作业图片...';
    recognizeBtn.disabled = true;

    // ---- 首选：视觉大模型直接看图（比本地 OCR 对中文准确得多）----
    const { cloud, vision, text: textModel } = await getAiModels();
    if (cloud && vision) {
        try {
            const dataUrl = await compressImage(pendingImageFile, 1600, 0.85);
            const out = await llmCollect(cloud, {
                model: vision.id,
                messages: [
                    { role: 'system', content: AI_PARSE_SYSTEM_PROMPT },
                    {
                        role: 'user',
                        content: [
                            { type: 'image_url', image_url: { url: dataUrl } },
                            { type: 'text', text: '识别图中的作业内容：fullText 填识别出的原文，items 为拆分好的作业条目。' }
                        ]
                    }
                ]
            });
            let fullText = out;
            let items = extractItems(out);
            const m = out.match(/\{[\s\S]*\}/);
            if (m) {
                try {
                    const o = JSON.parse(m[0]);
                    if (o.fullText) fullText = o.fullText;
                    items = items || extractItems(JSON.stringify(o.items || []));
                } catch (e) { /* JSON 不完整时用原文 */ }
            }
            $('ocr-text').value = String(fullText).trim();
            recognizeBtn.disabled = false;
            if (items && items.length) {
                statusEl.className = 'ocr-status success';
                statusEl.textContent = `✅ AI 识别并拆分出 ${items.length} 条作业，请检查预览`;
                renderParsedPreview(items);
            } else {
                statusEl.className = 'ocr-status success';
                statusEl.textContent = '✅ 识别完成，检查文字后点击「一键解析为作业」。';
            }
            return;
        } catch (err) {
            statusEl.className = 'ocr-status loading';
            statusEl.textContent = '⚠️ AI 识别不可用，改用本地识别...';
        }
    }

    // ---- 兜底：本地 tesseract OCR ----
    try {
        const { createWorker } = Tesseract;
        const worker = await createWorker('chi_sim+eng');

        const result = await worker.recognize(pendingImageFile);
        await worker.terminate();

        let text = result.data.text.trim();
        $('ocr-text').value = text;

        // 本地 OCR 完后，如果 AI 文本模型可用，让它重新按语义切分一遍
        if (text && cloud && textModel) {
            try {
                const out = await llmCollect(cloud, {
                    model: textModel.id,
                    messages: [
                        { role: 'system', content: AI_PARSE_SYSTEM_PROMPT },
                        { role: 'user', content: '这是 OCR 原文（可能有很多识别错误和断行），整理成作业条目：\n' + text }
                    ]
                });
                const items = extractItems(out);
                if (items) {
                    const m2 = out.match(/"fullText"\s*:\s*"([\s\S]*?)"\s*,\s*"items"/);
                    if (m2) text = m2[1].replace(/\\n/g, '\n');
                    $('ocr-text').value = text.trim();
                    statusEl.className = 'ocr-status success';
                    statusEl.textContent = `✅ 识别完成，AI 整理出 ${items.length} 条作业，请检查预览`;
                    renderParsedPreview(items);
                    return;
                }
            } catch (e) { /* 继续走普通流程 */ }
        }

        if (text) {
            statusEl.className = 'ocr-status success';
            statusEl.textContent = `✅ 识别完成，共 ${text.length} 个字符。点击「一键解析为作业」即可。`;
        } else {
            statusEl.className = 'ocr-status error';
            statusEl.textContent = '⚠️ 没有识别到文字，建议手动粘贴或使用更清晰的截图。';
        }
    } catch (err) {
        console.error('OCR 失败', err);
        statusEl.className = 'ocr-status error';
        statusEl.textContent = '❌ 识别失败：' + (err.message || '请检查网络或换一张图片');
    } finally {
        recognizeBtn.disabled = false;
    }
}

// ================= 固定白天主题 =================
// 已取消夜间模式：全站始终使用白天配色（天空蓝 + 草地绿 + 米白）
function applyDayNightTheme() {
    // 确保不会残留夜间样式
    document.body.classList.remove('is-night');

    // 太阳图标固定
    const sunEl = document.querySelector('.scene-sun');
    if (sunEl) sunEl.textContent = '☀️';

    // 状态栏配色固定为天空顶部色（与 style.css / html 里的 theme-color 一致）
    const metaTheme = document.querySelector('meta[name="theme-color"]');
    if (metaTheme) metaTheme.setAttribute('content', '#8FD6FF');

    return false;
}

// ================= 儿童端 v2：成就 / 商城 / 日历 / 周打卡 =================

// 本周打卡：7 天格子，全部完成打勾，今天高亮
function renderChildWeek(data) {
    const weekEl = $('child-week');
    const start = startOfWeek(new Date());
    const today = startOfDay(new Date());
    const wdShort = ['日', '一', '二', '三', '四', '五', '六'];

    if (weekEl) {
        let html = '';
        for (let i = 0; i < 7; i++) {
            const d = new Date(start); d.setDate(d.getDate() + i);
            const k = dayKey(d);
            const items = data.homework.filter(h => {
                const iso = h.done ? (h.completedAt || h.deadline || h.createdAt) : (h.deadline || h.createdAt);
                return iso && dayKey(new Date(iso)) === k;
            });
            const allDone = items.length > 0 && items.every(h => h.done);
            const isToday = d.getTime() === today.getTime();
            const isFuture = d.getTime() > today.getTime();

            let mark = '·';
            if (allDone) mark = '✓';
            else if (items.length) mark = String(items.length);
            else if (isFuture) mark = '🌙';

            html += `<span class="day${allDone ? ' on' : ''}${isToday ? ' today' : ''}">`
                  + `<span class="d-dot">${mark}</span><span>${wdShort[d.getDay()]}</span></span>`;
        }
        weekEl.innerHTML = html;
    }

    setText('streak-badge', `连续 ${data.currentStreak || 0} 天`);
}

// ---- 成就徽章：全部用真实数据判定 ----
function countSubjectDone(data, subject) {
    return data.homework.filter(h => h.done && h.subject === subject).length;
}
const BADGES = [
    { ico: '🌱', name: '初次登场', desc: '完成第 1 项作业', done: c => c.completed >= 1 },
    { ico: '🔥', name: '连续 3 天', desc: '连续打卡 3 天', done: c => c.streak >= 3 },
    { ico: '📚', name: '小小读书郎', desc: '完成 5 项语文', done: c => c.chinese >= 5 },
    { ico: '🔢', name: '计算达人', desc: '完成 5 项数学', done: c => c.math >= 5 },
    { ico: '🔤', name: '单词高手', desc: '完成 5 项英语', done: c => c.english >= 5 },
    { ico: '🐾', name: '好伙伴', desc: '解锁第 2 个伙伴', done: c => c.unlocked >= 2 },
    { ico: '⭐', name: '积分 100', desc: '当前积分达到 100 分', done: c => c.points >= 100 },
    { ico: '🏝️', name: '小岛主人', desc: '建好小岛花园、海边码头和森林书屋', done: c => c.buildings >= 3 },
    { ico: '👑', name: '作业之王', desc: '累计完成 50 项', done: c => c.completed >= 50 }
];

function renderChildAchieve(data) {
    const wall = $('badge-wall');
    if (!wall) return;

    const ctx = {
        completed: data.totalCompleted || 0,
        streak: data.currentStreak || 0,
        chinese: countSubjectDone(data, '语文'),
        math: countSubjectDone(data, '数学'),
        english: countSubjectDone(data, '英语'),
        unlocked: new Set(data.rewardsUnlocked || []).size,
        points: data.points || 0,
        buildings: data.demoGrowth?.buildings?.length || 0
    };

    let lit = 0;
    wall.innerHTML = BADGES.map(b => {
        const ok = !!b.done(ctx);
        if (ok) lit++;
        return `<span class="medal${ok ? '' : ' locked'}">`
             + `<span class="m-ico">${b.ico}</span><b>${b.name}</b><span class="m-state">${ok ? '已解锁' : '未解锁'}</span><span class="m-condition">条件：${b.desc}</span></span>`;
    }).join('');

    setText('badge-count', `${lit} / ${BADGES.length} 已点亮`);
    setText('ach-sub', lit
        ? `已经点亮 ${lit} 枚徽章，还有 ${BADGES.length - lit} 枚等着你发现～`
        : '完成作业就能点亮第一枚徽章啦～');
}

// 家庭奖励使用站内图片；旧奖励没有 imageId 时继续显示原图标。
const REWARD_IMAGE_CHOICES = [
    { id: 'gift', name: '礼物', file: 'icon_chest.png' },
    { id: 'book', name: '图书', file: 'icon_book.png' },
    { id: 'star', name: '星星', file: 'icon_star.png' },
    { id: 'boat', name: '小船', file: 'icon_boat.png' },
    { id: 'house', name: '小屋', file: 'icon_house.png' },
    { id: 'leaf', name: '树叶', file: 'icon_leaf.png' },
    { id: 'fish', name: '小鱼', file: 'icon_fish.png' },
    { id: 'medal', name: '奖牌', file: 'icon_medal.png' }
];
function rewardArt(item) {
    const chosen = REWARD_IMAGE_CHOICES.find(x => x.id === item?.imageId);
    return chosen
        ? `<img class="reward-art" src="assets/characters/${chosen.file}" alt="${chosen.name}">`
        : escapeHtml(item?.emoji || '🎁');
}

// ---- 家庭奖励与已捡到的宝贝；伙伴在“小岛伙伴”单独解锁 ----
function renderShop(data) {
    setText('shop-points', data.points);

    const items = (data.rewardItems || []).filter(i => i.active && i.type === 'prize');
    const redemptions = (data.redemptions || []).filter(r => r.type === 'prize');
    const affordable = items.filter(i => data.points >= i.points);
    const locked = items.filter(i => data.points < i.points);

    setText('shop-sub', affordable.length
        ? `现在可以兑换 ${affordable.length} 个奖励`
        : (locked.length
            ? `再攒 ${locked[0].points - data.points} 分就能换「${locked[0].name}」`
            : '能换的奖励都已经换过啦 🎉'));

    // ---- 可以兑换 ----
    const grid = $('shop-items');
    if (grid) {
        grid.innerHTML = '';
        if (!affordable.length) {
            grid.innerHTML = '<p class="wall-empty-tip">还没有能兑换的奖励，继续完成作业攒积分吧～</p>';
        } else {
            affordable.forEach(i => grid.appendChild(buildRewardCard(data, i, 'redeem')));
        }
    }
    setText('shop-redeem-count', `${affordable.length} 个`);

    // ---- 还要再攒攒 ----
    const lockGrid = $('shop-locked');
    if (lockGrid) {
        lockGrid.innerHTML = '';
        if (!locked.length) {
            lockGrid.innerHTML = '<p class="wall-empty-tip">没有需要继续攒的啦 🎉</p>';
        } else {
            locked.forEach(i => lockGrid.appendChild(buildRewardCard(data, i, 'locked')));
        }
    }
    setText('shop-locked-count', `${locked.length} 个`);

    // ---- 我的奖励（兑换记录）----
    const mineGrid = $('shop-mine');
    if (mineGrid) {
        mineGrid.innerHTML = '';
        if (!redemptions.length) {
            mineGrid.innerHTML = '<p class="wall-empty-tip">还没有兑换过奖励，去上面看看吧～</p>';
        } else {
            redemptions.slice(-12).reverse().forEach(r => {
                const card = document.createElement('div');
                card.className = 'shop-card' + (r.fulfilled ? '' : ' warm');
                card.innerHTML = `
                    <span class="sc-img">${rewardArt(r)}</span>
                    <b>${escapeHtml(r.name)}</b>
                    <span class="sc-price">⭐ ${r.points} 分</span>
                    <span class="sc-btn${r.fulfilled ? ' owned' : ''}">${r.fulfilled ? '已到手 ✅' : '等兑现'}</span>
                `;
                mineGrid.appendChild(card);
            });
        }
    }
    setText('shop-mine-count', `${redemptions.length} 次`);

}

// 兑换清单里的一张卡片（mode: 'redeem' 可兑换 / 'locked' 还差分）
function buildRewardCard(data, item, mode) {
    const locked = mode === 'locked';
    const card = document.createElement('div');
    card.className = 'shop-card' + (locked ? '' : ' leaf');
    card.innerHTML = `
        <span class="sc-img">${locked ? '🔒' : rewardArt(item)}</span>
        <b>${escapeHtml(item.name)}</b>
        <span class="sc-price${locked ? ' gold' : ''}">⭐ ${item.points} 分</span>
        <span class="sc-btn${locked ? ' owned' : ''}">${locked ? `还差 ${item.points - data.points} 分` : '兑换'}</span>
    `;
    if (!locked) {
        card.style.cursor = 'pointer';
        card.onclick = () => redeemReward(item.id);
    }
    return card;
}

// 发起兑换：先弹一个确认，避免小朋友误点把积分花掉
function redeemReward(itemId) {
    const data = getData();
    const item = (data.rewardItems || []).find(i => i.id === itemId);
    if (!item) return;
    if (data.points < item.points) { showToast('积分还不够哦'); return; }
    if (item.type === 'mate' && (data.rewardsUnlocked || []).includes(item.emoji)) {
        showToast('这个伙伴已经上岛啦'); return;
    }

    const after = data.points - item.points;
    openConfirm({
        emoji: item.emoji,
        title: `兑换「${item.name}」？`,
        sub: `会花掉 ${item.points} 分，兑换后还剩 ${after} 分。`,
        okText: '确认兑换',
        onOk: () => doRedeem(itemId)
    });
}

// 真正扣分并落库（写后回读校验，避免"看着兑换成功其实没写进去"）
function doRedeem(itemId) {
    const data = getData();
    const item = (data.rewardItems || []).find(i => i.id === itemId);
    if (!item) return;
    if (data.points < item.points) { showToast('积分还不够哦'); return; }

    let record;
    try {
        data.points -= item.points;
        if (item.type === 'mate') {
            data.rewardsUnlocked = data.rewardsUnlocked || [];
            if (!data.rewardsUnlocked.includes(item.emoji)) data.rewardsUnlocked.push(item.emoji);
        }
        record = {
            id: generateId(),
            itemId: item.id,
            name: item.name,
            emoji: item.emoji,
            imageId: item.imageId || null,
            points: item.points,
            type: item.type,
            at: new Date().toISOString(),
            fulfilled: item.type === 'mate'   // 伙伴兑换到手即生效，不需要家长再兑现
        };
        data.redemptions = data.redemptions || [];
        data.redemptions.push(record);

        saveData(data);

        const back = JSON.parse(localStorage.getItem(activeStorageKey()) || '{}');
        if (typeof back.points !== 'number' || back.points !== data.points) {
            throw new Error('兑换后回读校验不一致');
        }
    } catch (err) {
        console.warn('[兑换] 保存失败：', err);
        showToast('兑换出错了，请再试一次');
        return;
    }

    refreshAfterChange();
    showToast(item.type === 'mate'
        ? `🎉 ${item.emoji} ${item.name} 上岛啦！去「选伙伴」让它今天陪你写作业`
        : `🎉 兑换成功：${item.emoji} ${item.name}，记得找爸爸妈妈兑现哦`);
    if (typeof fireConfetti === 'function') fireConfetti();
}

// ---- 通用确认弹层（比浏览器原生 confirm 好看，儿童端也用这个）----
let _confirmCb = null;

function openConfirm(opts) {
    closeConfirm();
    const mask = document.createElement('div');
    mask.id = 'confirm-mask';
    mask.className = 'hw-editor-mask';
    mask.onclick = closeConfirm;

    const sheet = document.createElement('div');
    sheet.id = 'confirm-sheet';
    sheet.className = 'hw-editor confirm-sheet';
    sheet.innerHTML = `
        <div class="confirm-body">
            <span class="confirm-emo">${opts.emoji || '❓'}</span>
            <h3>${escapeHtml(opts.title || '')}</h3>
            <p>${escapeHtml(opts.sub || '')}</p>
            <div class="hw-editor-actions">
                <button class="btn-primary" id="confirm-ok">${escapeHtml(opts.okText || '确定')}</button>
                <button class="btn-secondary" id="confirm-cancel">取消</button>
            </div>
        </div>
    `;
    document.body.appendChild(mask);
    document.body.appendChild(sheet);

    _confirmCb = opts.onOk || null;
    const okBtn = document.getElementById('confirm-ok');
    const cancelBtn = document.getElementById('confirm-cancel');
    if (okBtn) okBtn.onclick = () => { const cb = _confirmCb; closeConfirm(); if (cb) cb(); };
    if (cancelBtn) cancelBtn.onclick = closeConfirm;
}

function closeConfirm() {
    const m = document.getElementById('confirm-mask');
    const s = document.getElementById('confirm-sheet');
    if (m) m.remove();
    if (s) s.remove();
    _confirmCb = null;
}

// ---- 儿童端日历页：日 / 周 / 月 ----
let calRange = 'month';
let calAnchor = new Date();

function switchCalRange(r) {
    if (r !== calRange) calAnchor = new Date();   // 换档时先回到今天所在区间
    calRange = r;
    document.querySelectorAll('#cal-range-switch .range-btn').forEach(b => {
        b.classList.toggle('on', b.dataset.range === r);
    });
    renderChildCalendar();
}

function stepCalRange(dir) {
    const d = new Date(calAnchor.getFullYear(), calAnchor.getMonth(), calAnchor.getDate());
    if (calRange === 'day') d.setDate(d.getDate() + dir);
    else if (calRange === 'week') d.setDate(d.getDate() + dir * 7);
    else d.setMonth(d.getMonth() + dir);
    calAnchor = d;
    renderChildCalendar();
}

function goCalToday() {
    calAnchor = new Date();
    renderChildCalendar();
    showToast('已回到今天');
}

function getCalBounds() {
    const a = new Date(calAnchor.getFullYear(), calAnchor.getMonth(), calAnchor.getDate());
    if (calRange === 'day') {
        const s = startOfDay(a), e = new Date(s); e.setDate(e.getDate() + 1);
        return { start: s, end: e };
    }
    if (calRange === 'week') {
        const s = startOfWeek(a), e = new Date(s); e.setDate(e.getDate() + 7);
        return { start: s, end: e };
    }
    const s = new Date(a.getFullYear(), a.getMonth(), 1);
    const e = new Date(a.getFullYear(), a.getMonth() + 1, 1);
    return { start: s, end: e };
}

function taskDayIndexOf(hw) {
    const iso = hw.done ? (hw.completedAt || hw.deadline || hw.createdAt) : (hw.deadline || hw.createdAt);
    return iso ? dayKey(new Date(iso)) : null;
}

function renderChildCalendar() {
    const data = getData();
    const b = getCalBounds();
    const last = new Date(b.end.getTime() - 86400000);
    const today = startOfDay(new Date());

    const inRange = data.homework.filter(h => {
        const k = taskDayIndexOf(h);
        if (!k) return calRange === 'day';
        const t = new Date(k + 'T00:00:00').getTime();
        return t >= b.start.getTime() && t < b.end.getTime();
    });
    const doneCount = inRange.filter(h => h.done).length;

    const calIsToday = b.start.getTime() === today.getTime();
    setText('cal-title', calRange === 'day' ? (calIsToday ? '今天' : '这一天')
                       : calRange === 'week' ? '本周' : `${b.start.getMonth() + 1} 月`);
    setText('cal-range-label', calRange === 'day'
        ? `${b.start.getMonth() + 1}月${b.start.getDate()}日`
        : calRange === 'week'
            ? `${b.start.getMonth() + 1}/${b.start.getDate()} - ${last.getMonth() + 1}/${last.getDate()}`
            : `${b.start.getFullYear()}年${b.start.getMonth() + 1}月`);
    setText('cal-badge', inRange.length ? `${doneCount}/${inRange.length} 完成` : '暂无作业');

    const grid = $('cal-grid');
    if (grid) {
        const cells = [];
        if (calRange !== 'day') {
            ['一', '二', '三', '四', '五', '六', '日'].forEach(w => cells.push(`<span class="cd head">${w}</span>`));
        }

        const days = [];
        if (calRange === 'month') {
            // 周一为一周起点，补足前面的空位
            const firstDow = (new Date(b.start.getFullYear(), b.start.getMonth(), 1).getDay() + 6) % 7;
            for (let i = 0; i < firstDow; i++) days.push(null);
            const n = new Date(b.start.getFullYear(), b.start.getMonth() + 1, 0).getDate();
            for (let i = 1; i <= n; i++) days.push(new Date(b.start.getFullYear(), b.start.getMonth(), i));
        } else if (calRange === 'week') {
            for (let i = 0; i < 7; i++) { const d = new Date(b.start); d.setDate(d.getDate() + i); days.push(d); }
        } else {
            days.push(b.start);
        }

        days.forEach(d => {
            if (!d) { cells.push('<span class="cd mute"></span>'); return; }
            const k = dayKey(d);
            const items = data.homework.filter(h => taskDayIndexOf(h) === k);
            const allDone = items.length > 0 && items.every(h => h.done);
            const isToday = d.getTime() === today.getTime();
            const cls = 'cd' + (allDone ? ' done' : '') + (isToday ? ' today' : '') + (calRange === 'day' && !allDone && !isToday ? ' mute' : '');
            const dots = items.length
                ? `<i class="cdot">${'<i></i>'.repeat(Math.min(items.length, 3))}</i>`
                : '';
            cells.push(`<span class="${cls}" data-day="${k}">${d.getDate()}${dots}</span>`);
        });

        grid.innerHTML = cells.join('');
        grid.querySelectorAll('[data-day]').forEach(el => {
            el.onclick = () => {
                calAnchor = new Date(el.dataset.day + 'T00:00:00');
                calRange = 'day';
                document.querySelectorAll('#cal-range-switch .range-btn').forEach(x => x.classList.toggle('on', x.dataset.range === 'day'));
                renderChildCalendar();
            };
        });
    }

    const statsEl = $('cal-stats');
    if (statsEl) {
        const pct = inRange.length ? Math.round(doneCount / inRange.length * 100) : 0;
        statsEl.innerHTML = `
            <span class="stat"><b>${inRange.length}</b><span>这个区间</span></span>
            <span class="stat hot"><b>${inRange.length - doneCount}</b><span>待完成</span></span>
            <span class="stat gold"><b>${pct}<small>%</small></b><span>完成率</span></span>`;
    }

    setText('cal-day-title', calRange === 'day' ? `${b.start.getMonth() + 1}月${b.start.getDate()}日` : '这个区间的作业');
    setText('cal-day-badge', inRange.length ? `${doneCount}/${inRange.length} 完成` : '暂无作业');

    const dayList = $('cal-day-list');
    if (dayList) {
        dayList.innerHTML = '';
        if (!inRange.length) {
            dayList.innerHTML = '<div class="empty-state"><span class="big-emoji">🏝️</span><p>这段时间没有作业，好好休息吧！</p></div>';
        } else {
            inRange.slice().sort((a, c) => {
                if (a.done !== c.done) return a.done ? 1 : -1;
                return new Date(a.deadline || a.createdAt || 0) - new Date(c.deadline || c.createdAt || 0);
            }).forEach(h => dayList.appendChild(buildChildItem(h)));
        }
    }
}

// ---- 儿童端学习报告页 ----
function weekSummary(data) {
    const start = startOfWeek(new Date());
    const end = new Date(start.getTime() + 7 * 86400000);
    const days = [];
    for (let i = 0; i < 7; i++) { const d = new Date(start); d.setDate(d.getDate() + i); days.push(d); }

    const inWeek = data.homework.filter(h => {
        const k = taskDayIndexOf(h);
        if (!k) return false;
        const t = new Date(k + 'T00:00:00').getTime();
        return t >= start.getTime() && t < end.getTime();
    });
    const doneWeek = inWeek.filter(h => h.done);
    const counts = days.map(d => inWeek.filter(h => h.done && taskDayIndexOf(h) === dayKey(d)).length);
    const rate = inWeek.length ? Math.round(doneWeek.length / inWeek.length * 100) : 0;
    const ptsWeek = doneWeek.reduce((s, h) => s + (h.earnedPoints || h.points), 0);
    return { start, end, days, inWeek, doneWeek, counts, rate, ptsWeek };
}

// 各科完成情况（本周数据）
function renderSubjectBars(host, items, totalId) {
    if (!host) return;
    const rows = Object.keys(SUBJECT_ICON).map(s => ({
        s,
        total: items.filter(h => h.subject === s).length,
        done: items.filter(h => h.subject === s && h.done).length
    })).filter(r => r.total > 0);

    if (!rows.length) {
        host.innerHTML = '<p class="wall-empty-tip">这段时间还没有作业记录～</p>';
        if (totalId) setText(totalId, '—');
        return;
    }

    host.innerHTML = rows.map(r => {
        const pct = Math.round(r.done / r.total * 100);
        return `
            <div class="subj">
                <span class="s-ico ${subjectClass(r.s)}">${subjectIcon(r.s)}</span>
                <span class="s-main">
                    <span class="s-top">${r.s} <em>${r.done} / ${r.total} 项</em></span>
                    <span class="s-bar"><i class="${subjectClass(r.s)}" style="width:${pct}%"></i></span>
                </span>
            </div>`;
    }).join('');
    if (totalId) setText(totalId, `${rows.length} 个科目`);
}

// 每天完成情况柱状图
function renderDayBars(host, w, hintId) {
    if (host) {
        const max = Math.max(...w.counts, 1);
        const today = startOfDay(new Date());
        host.innerHTML = w.days.map((d, i) => {
            const isToday = d.getTime() === today.getTime();
            const pct = w.counts[i] ? Math.max(16, Math.round(w.counts[i] / max * 100)) : 8;
            const cls = 'bar' + (isToday ? ' today' : '') + (w.counts[i] === 0 ? ' zero' : '');
            const wd = WEEKDAY_CN[d.getDay()].replace('周', '');
            return `<span class="${cls}"><i style="height:${pct}%"></i><span>${wd}</span></span>`;
        }).join('');
    }
    if (hintId) {
        const maxCount = Math.max(...w.counts, 0);
        const bestIdx = w.counts.indexOf(maxCount);
        setText(hintId, maxCount > 0
            ? `${WEEKDAY_CN[w.days[bestIdx].getDay()]}完成得最多，一共 ${maxCount} 项！`
            : '这周还没有完成的作业，从今天开始吧～');
    }
}

function renderChildReportPage(data) {
    const w = weekSummary(data);
    const last = new Date(w.end.getTime() - 86400000);

    setText('rep-range', `${w.start.getMonth() + 1}/${w.start.getDate()} - ${last.getMonth() + 1}/${last.getDate()}`);
    setText('rep-week-total', `共 ${w.inWeek.length} 项`);

    const statsEl = $('rep-stats');
    if (statsEl) {
        statsEl.innerHTML = `
            <span class="stat"><b>${w.rate}<small>%</small></b><span>作业完成率</span></span>
            <span class="stat gold"><b>${w.ptsWeek}</b><span>本周积分</span></span>
            <span class="stat"><b>${data.currentStreak || 0}<small> 天</small></b><span>连续打卡</span></span>`;
    }

    renderDayBars($('rep-bars'), w, 'rep-hint');
    renderSubjectBars($('rep-subjects'), w.inWeek, 'rep-subj-total');
    renderDailyReport(data);
    renderMonthlyReport(data, {
        canvasId: 'month-chart',
        outId: 'child-monthly-report',
        titleId: 'rep-month-title',
        badgeId: 'rep-month-badge'
    });
}

// ================= 家长端 v2：确认 / 报告 / 奖励 / 设置 =================

// 确认完成：今天未完成 + 今天已完成
function renderParentReview(data) {
    const items = data.homework.filter(isTaskToday);
    const open = items.filter(h => !h.done);
    const done = items.filter(h => h.done);

    setText('rev-open-badge', `${open.length} 项`);
    setText('rev-done-badge', `${done.length} 项`);
    setText('rev-sub', open.length
        ? `今天还有 ${open.length} 项没完成，孩子做完后可以在这里帮他确认。`
        : (items.length ? '今天的作业全部完成啦 🎉' : '今天还没有作业。'));

    const fill = (hostId, list, emptyIco, emptyText) => {
        const host = $(hostId);
        if (!host) return;
        host.innerHTML = '';
        if (!list.length) {
            host.innerHTML = `<div class="empty-state"><span class="big-emoji">${emptyIco}</span><p>${emptyText}</p></div>`;
            return;
        }
        list.forEach(h => host.appendChild(buildParentItem(h)));
    };
    fill('rev-open-list', open, '🌤️', '今天没有未完成的作业');
    fill('rev-done-list', done, '📝', '今天还没有完成的作业');

    updateReviewBadge(data);
}

// 报告页
function renderParentReport(data) {
    const w = weekSummary(data);
    const last = new Date(w.end.getTime() - 86400000);

    setText('p-rep-range', `${w.start.getMonth() + 1}/${w.start.getDate()} - ${last.getMonth() + 1}/${last.getDate()}`);
    setText('p-rep-week-total', `共 ${w.inWeek.length} 项`);
    setText('p-rep-sub', w.inWeek.length
        ? `本周完成率 ${w.rate}%，完成 ${w.doneWeek.length} / ${w.inWeek.length} 项。`
        : '先发布几份作业，这里就会有数据啦。');

    const statsEl = $('p-rep-stats');
    if (statsEl) {
        statsEl.innerHTML = `
            <span class="stat"><b>${w.doneWeek.length}</b><span>完成作业</span></span>
            <span class="stat hot"><b>${w.inWeek.length - w.doneWeek.length}</b><span>还没完成</span></span>
            <span class="stat gold"><b>${w.ptsWeek}</b><span>本周积分</span></span>`;
    }

    renderDayBars($('p-rep-bars'), w, 'p-rep-hint');
    renderSubjectBars($('p-rep-subjects'), w.inWeek, 'p-rep-subj-total');
    renderMonthlyReport(data, {
        canvasId: 'p-month-chart',
        outId: 'p-month-report',
        titleId: 'p-rep-month-title',
        badgeId: 'p-rep-month-badge'
    });
}

// 奖励页：积分余额 + 调整积分 + 伙伴解锁 + 收集统计
function renderParentReward(data) {
    setText('p-balance-num', data.points);

    const items = (data.rewardItems || []).filter(i => i.type === 'prize');
    const redemptions = (data.redemptions || []).filter(r => r.type === 'prize');
    const pendings = redemptions.filter(r => !r.fulfilled);
    const activeCount = items.filter(i => i.active).length;

    setText('p-balance-sub', items.length
        ? `共 ${activeCount} 个奖励可以兑换 · 孩子已兑换 ${redemptions.length} 次`
        : '还没有设置奖励，点下面「添加奖励」准备几个吧');

    // ---- 奖励清单管理 ----
    const listEl = $('p-reward-items');
    if (listEl) {
        listEl.innerHTML = '';
        if (!items.length) {
            listEl.innerHTML = '<p class="wall-empty-tip">还没有奖励项，点下面「添加奖励」加一个吧～</p>';
        } else {
            items.forEach(item => {
                const row = document.createElement('div');
                row.className = 'manage-row' + (item.active ? '' : ' off');
                row.innerHTML = `
                    <span class="mr-img">${rewardArt(item)}</span>
                    <span class="mr-main">
                        <b>${escapeHtml(item.name)}</b>
                        <span>⭐ ${item.points} 分${item.repeatable ? ' · 可重复' : ''}${item.desc ? ' · ' + escapeHtml(item.desc) : ''}</span>
                    </span>
                    <span class="mr-act">
                        <button class="hw-btn" onclick="openRewardItemEditor('${item.id}')">编辑</button>
                        <button class="hw-btn undo" onclick="toggleRewardItem('${item.id}')">${item.active ? '停用' : '启用'}</button>
                        <button class="hw-btn del" onclick="deleteRewardItem('${item.id}')">删除</button>
                    </span>
                `;
                listEl.appendChild(row);
            });
        }
    }
    setText('p-reward-count', `${items.length} 个`);

    // ---- 孩子兑换记录 / 待兑现 ----
    const redEl = $('p-redemptions');
    if (redEl) {
        redEl.innerHTML = '';
        if (!redemptions.length) {
            redEl.innerHTML = '<p class="wall-empty-tip">孩子还没兑换过东西～</p>';
        } else {
            redemptions.slice().reverse().slice(0, 20).forEach(r => {
                const row = document.createElement('div');
                row.className = 'manage-row';
                row.innerHTML = `
                    <span class="mr-img">${rewardArt(r)}</span>
                    <span class="mr-main">
                        <b>${escapeHtml(r.name)}</b>
                        <span>${r.points} 分 · ${formatDateTime(r.at)}</span>
                    </span>
                    <span class="mr-act">
                        ${r.fulfilled
                            ? '<span class="si-val">已兑现</span>'
                            : `<button class="hw-btn done" onclick="fulfillRedemption('${r.id}')">标记已兑现</button>`}
                    </span>
                `;
                redEl.appendChild(row);
            });
        }
    }
    setText('p-redeem-count', pendings.length ? `${pendings.length} 项待兑现` : '都兑现了');

}

// ================= 家长端：奖励清单的增删改 =================

let rewardImagePick = 'gift';
let editingRewardId = null;

function openRewardItemEditor(itemId) {
    const data = getData();
    const item = itemId ? (data.rewardItems || []).find(i => i.id === itemId) : null;
    if (item && item.type !== 'prize') return;

    // 顺序很重要：closeRewardItemEditor() 会把 editingRewardId 清成 null，
    // 之前是先赋值再 close，等于编辑一次就被降级成「新增」，
    // 表现就是点「编辑」改积分，结果清单里多出一条新奖励。
    // 所以先拆旧弹层，再确定这次是编辑还是新增。
    closeRewardItemEditor();
    editingRewardId = item ? item.id : null;
    rewardImagePick = item?.imageId || 'gift';

    const mask = document.createElement('div');
    mask.id = 'reward-item-mask';
    mask.className = 'hw-editor-mask';
    mask.onclick = closeRewardItemEditor;

    const sheet = document.createElement('div');
    sheet.id = 'reward-item-editor';
    sheet.className = 'hw-editor';
    sheet.innerHTML = `
        <div class="hw-editor-head">
            <h3>${item ? '✏️ 编辑奖励' : '🎁 添加奖励'}</h3>
            <button class="hw-editor-close" onclick="closeRewardItemEditor()" aria-label="关闭">✕</button>
        </div>
        <div class="hw-editor-body">
            <div class="form-row">
                <label>奖励名称</label>
                <input type="text" id="ri-name" maxlength="20" value="${item ? escapeHtml(item.name) : ''}" placeholder="例如：游乐场玩一次">
            </div>
            <div class="form-row">
                <label>需要积分</label>
                <input type="number" id="ri-points" min="0" value="${item ? item.points : 50}">
            </div>
            <div class="form-row">
                <label>说明（可留空）</label>
                <input type="text" id="ri-desc" maxlength="30" value="${item ? escapeHtml(item.desc || '') : ''}" placeholder="例如：周末去游乐场玩半天">
            </div>
            <div class="form-row">
                <label>选择内置图片</label>
                <div class="reward-image-grid" id="reward-image-grid" role="group" aria-label="奖励图片"></div>
            </div>
            <div class="form-row">
                <label class="switch-row">
                    <input type="checkbox" id="ri-repeatable"${item && item.repeatable ? ' checked' : ''}>
                    <span>可以重复兑换</span>
                </label>
            </div>
            <p class="hw-editor-tip">图片从作业岛内置素材中选择。兑换后的奖励会进入你的“待兑现”清单。</p>
            <div class="hw-editor-actions">
                <button class="btn-primary" onclick="saveRewardItem()">保存</button>
                <button class="btn-secondary" onclick="closeRewardItemEditor()">取消</button>
            </div>
        </div>
    `;
    document.body.appendChild(mask);
    document.body.appendChild(sheet);
    renderRewardImageGrid();
}

function renderRewardImageGrid() {
    const grid = document.getElementById('reward-image-grid');
    if (!grid) return;
    grid.innerHTML = '';
    REWARD_IMAGE_CHOICES.forEach(choice => {
        const b = document.createElement('button');
        b.type = 'button';
        b.className = 'reward-image-opt' + (choice.id === rewardImagePick ? ' on' : '');
        b.setAttribute('aria-pressed', String(choice.id === rewardImagePick));
        b.setAttribute('aria-label', choice.name);
        b.innerHTML = `<img src="assets/characters/${choice.file}" alt=""><small>${choice.name}</small>`;
        b.onclick = () => { rewardImagePick = choice.id; renderRewardImageGrid(); };
        grid.appendChild(b);
    });
}

function saveRewardItem() {
    const data = getData();
    const val = id => { const el = document.getElementById(id); return el ? el.value : ''; };
    const name = (val('ri-name') || '').trim();
    if (!name) { showToast('给奖励起个名字吧'); return; }

    const points = Math.max(0, parseInt(val('ri-points'), 10) || 0);
    const desc = (val('ri-desc') || '').trim();
    const repEl = document.getElementById('ri-repeatable');
    const repeatable = !!(repEl && repEl.checked);
    const isEdit = !!editingRewardId;

    try {
        data.rewardItems = data.rewardItems || [];
        if (isEdit) {
            const item = data.rewardItems.find(i => i.id === editingRewardId);
            if (!item) { closeRewardItemEditor(); return; }
            if (item.type !== 'prize') { closeRewardItemEditor(); return; }
            Object.assign(item, { name, points, desc, repeatable, imageId: rewardImagePick });
        } else {
            data.rewardItems.push({
                id: generateId(),
                name, points, type: 'prize', desc, repeatable,
                imageId: rewardImagePick,
                emoji: '🎁',
                active: true
            });
        }
        saveData(data);

        const back = JSON.parse(localStorage.getItem(activeStorageKey()) || '{}');
        if (!(back.rewardItems || []).some(i => i.name === name)) throw new Error('回读校验不一致');
    } catch (err) {
        console.warn('[奖励清单] 保存失败：', err);
        showToast('保存出错了，请再试一次');
        return;
    }

    closeRewardItemEditor();
    refreshAfterChange();
    showToast(isEdit ? '奖励已更新 ✨' : '奖励已添加 ✨');
}

function toggleRewardItem(itemId) {
    const data = getData();
    const item = (data.rewardItems || []).find(i => i.id === itemId);
    if (!item) return;
    item.active = !item.active;
    saveData(data);
    refreshAfterChange();
    showToast(item.active ? '已启用，孩子能看到它了 ▶️' : '已停用，孩子看不到了 ⏸');
}

function deleteRewardItem(itemId) {
    const data = getData();
    const item = (data.rewardItems || []).find(i => i.id === itemId);
    if (!item) return;
    openConfirm({
        emoji: item.emoji || '🗑',
        title: `删除「${item.name}」？`,
        sub: '删除后孩子就看不到这个奖励了，已经兑换过的记录会保留。',
        okText: '删除',
        onOk: () => {
            const d = getData();
            d.rewardItems = (d.rewardItems || []).filter(i => i.id !== itemId);
            saveData(d);
            refreshAfterChange();
            showToast('奖励已删除');
        }
    });
}

// 家长把孩子的兑换标记为已兑现
function fulfillRedemption(redemptionId) {
    const data = getData();
    const r = (data.redemptions || []).find(x => x.id === redemptionId);
    if (!r) return;
    r.fulfilled = true;
    r.fulfilledAt = new Date().toISOString();
    saveData(data);
    refreshAfterChange();
    showToast('已记一笔，兑现完成 ✅');
}

function closeRewardItemEditor() {
    const s = document.getElementById('reward-item-editor');
    const m = document.getElementById('reward-item-mask');
    if (s) s.remove();
    if (m) m.remove();
    editingRewardId = null;
}

// 设置页：家庭码 / 同步 / 数据
// 设置页：家长也能直接改孩子的名字（另外孩子自己在儿童端也能改）
function saveKidName() {
    const el = $('set-kid-name');
    const name = ((el ? el.value : '') || '').trim();
    if (!name) { showToast('写个名字吧'); return; }
    const data = getData();
    data.kidName = name.slice(0, 12);
    saveData(data);
    refreshAfterChange();
    showToast('名字已更新 ✨');
}

function renderParentSettings(data) {
    const code = (typeof IslandSync !== 'undefined') ? IslandSync.getCode() : '';
    setText('set-code', code || '未设置');
    // 孩子资料
    setText('set-kid-avatar', data.kidAvatar || '👦');
    const knEl = $('set-kid-name');
    if (knEl && document.activeElement !== knEl) knEl.value = data.kidName || '';
    setText('set-code-sub', code
        ? '家里所有设备都用这个码'
        : '点「换一个码」给自己起个好记的');
    setText('set-sync-state', code
        ? `已连接 · 家庭码 ${code}`
        : '尚未连接，点这里设置家庭码');

    const cutoff = Date.now() - 30 * 86400000;
    const stale = data.homework.filter(h => h.done && h.completedAt && new Date(h.completedAt).getTime() < cutoff).length;
    setText('set-clean-sub', stale ? `有 ${stale} 条 30 天前的记录可以收起来` : '暂时没有需要清理的记录');

    const statsEl = $('set-stats');
    if (statsEl) {
        const doneCount = data.homework.filter(h => h.done).length;
        statsEl.innerHTML = `
            <div class="report-row"><span class="report-label">作业总数</span><span class="report-value">${data.homework.length} 条</span></div>
            <div class="report-row"><span class="report-label">已完成</span><span class="report-value">${doneCount} 条</span></div>
            <div class="report-row"><span class="report-label">周期作业模板</span><span class="report-value">${(data.recurringTasks || []).length} 个</span></div>
            <div class="report-row"><span class="report-label">累计积分</span><span class="report-value">${data.points} 分</span></div>
            <div class="report-row"><span class="report-label">连续打卡</span><span class="report-value">${data.currentStreak || 0} 天</span></div>`;
    }
}

// ---- 发布作业弹层 ----
function openPublishSheet(tab) {
    const ovl = $('ovl-publish');
    if (!ovl) return;
    ovl.classList.add('on');
    document.body.classList.add('sheet-open');
    switchParentTab(tab || 'manual');
}

function closePublishSheet() {
    const ovl = $('ovl-publish');
    if (ovl) ovl.classList.remove('on');
    document.body.classList.remove('sheet-open');
}

// ---- 设置页动作 ----
function openSyncPanel() {
    if (typeof IslandSync === 'undefined') { showToast('云端同步还没加载好'); return; }
    IslandSync.openPanel();
}

function copyInviteLink() {
    const code = (typeof IslandSync !== 'undefined') ? IslandSync.getCode() : '';
    if (!code) { showToast('先设置一个家庭码吧'); openSyncPanel(); return; }
    copyInviteLinkFor('child');
}

// 剪贴板不可用时的兜底：在页面上显示一个可长按选中的输入框。
// 不用 window.prompt —— 它在部分安卓 WebView / 主屏 PWA 里会被静默拦截，
// 用户点了按钮却什么反应也没有。
function showCopyFallback(link) {
    let box = document.getElementById('copy-fallback-box');
    if (box) box.remove();
    box = document.createElement('div');
    box.id = 'copy-fallback-box';
    box.className = 'copy-fallback';
    box.innerHTML = `
        <div class="copy-fallback-card" role="dialog" aria-label="复制邀请链接">
            <p class="copy-fallback-tip">长按下面的链接 → 全选 → 复制，发给家人</p>
            <input class="copy-fallback-input" readonly value="${link.replace(/"/g, '&quot;')}" />
            <button class="copy-fallback-btn" onclick="this.closest('.copy-fallback').remove()">知道了</button>
        </div>`;
    box.onclick = (e) => { if (e.target === box) box.remove(); };
    document.body.appendChild(box);
    const input = box.querySelector('.copy-fallback-input');
    input.focus();
    try { input.select(); } catch (e) { /* 某些环境不支持 */ }
}

// 生成邀请链接。家人（尤其孩子）点开就能直接进对应端，不用先进首页再选。
function copyInviteLinkFor(end) {
    const code = (typeof IslandSync !== 'undefined') ? IslandSync.getCode() : '';
    if (!code) { showToast('先设置一个家庭码吧'); openSyncPanel(); return; }
    // 注意 location.pathname 末尾是文件名（如 /parent.html），要换成同目录下的目标页，
    // 直接在原路径后面拼 child.html 会得到 /parent.htmlchild.html。
    const dir = location.origin + location.pathname.replace(/[^/]*$/, '');
    const link = dir + (end === 'parent' ? 'parent.html' : 'child.html')
               + '?code=' + encodeURIComponent(code);
    const label = (end === 'parent' ? '家长端' : '儿童端') + '邀请链接已复制 ✅';

    if (!navigator.clipboard || !navigator.clipboard.writeText) {
        showCopyFallback(link);
        return;
    }
    navigator.clipboard.writeText(link)
        .then(() => showToast(label))
        .catch(() => showCopyFallback(link));   // 非安全上下文 / 无权限 → 手动复制
}

function exportData() {
    const blob = new Blob([JSON.stringify(getData(), null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `小岛日历备份-${todayStr()}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
    showToast('已导出备份 ✅');
}

function cleanDoneHomework() {
    const data = getData();
    const cutoff = Date.now() - 30 * 86400000;
    const stale = data.homework.filter(h => h.done && h.completedAt && new Date(h.completedAt).getTime() < cutoff);
    if (!stale.length) { showToast('暂时没有需要清理的记录'); return; }
    if (!confirm(`要收起来 ${stale.length} 条 30 天前的已完成记录吗？\n（积分、伙伴和展示墙都不会受影响）`)) return;
    data.homework = data.homework.filter(h => stale.indexOf(h) === -1);
    saveData(data);
    refreshAfterChange();
    showToast('已清理旧记录');
}

function adjustPoints(sign) {
    const id = sign > 0 ? 'p-points-add' : 'p-points-sub';
    const el = $(id);
    const n = parseInt(el ? el.value : '', 10);
    if (!n || n <= 0) { showToast('请输入一个大于 0 的分数'); return; }
    const data = getData();
    const next = Math.max(0, data.points + sign * n);
    if (next === data.points) { showToast('积分已经是 0 啦'); return; }
    data.points = next;
    saveData(data);
    refreshAfterChange();
    showToast(sign > 0 ? `已加 ${n} 分` : `已扣 ${n} 分`);
}

// ================= 初始化 =================
window.addEventListener('resize', () => {
    const canvas = $('confetti-canvas');
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
});

// 默认设置截止时间为当天 21:00
document.addEventListener('DOMContentLoaded', () => {
    const bodyMode = document.body.getAttribute('data-mode');
    const hasManualDeadline = !!$('manual-deadline');

    // 固定白天主题（已取消夜间模式）
    applyDayNightTheme();

    if (hasManualDeadline) {
        const deadlineInput = $('manual-deadline');
        const now = new Date();
        now.setHours(21, 0, 0, 0);
        const iso = new Date(now.getTime() - now.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
        deadlineInput.value = iso;
    }

    // 根据页面自动进入对应模式并首次渲染（只渲染一次，switchMode 内部不再重复调用）
    if (bodyMode === 'child') {
        currentMode = 'child';
        generateRecurringTasks();
        renderChild();
        startIslandEvents();
    } else if (bodyMode === 'parent') {
        currentMode = 'parent';
        generateRecurringTasks();
        renderParent();
    }

    // 底部导航绑事件（tab 是 span，不绑就没有点击行为）
    initTabbar();

    // 支持 ?view=xxx 直接定位到某个页面（分享 / 调试用）
    const want = new URLSearchParams(location.search).get('view');
    if (want) {
        if (bodyMode === 'child') gotoChildView(want === 'mates' ? 'home' : want);
        else if (bodyMode === 'parent') gotoParentView(want === 'publish' ? 'home' : want);
        if (want === 'mates') openMatePicker();
        if (want === 'publish') openPublishSheet('manual');
    } else if (bodyMode === 'child') {
        gotoChildView('home');
    }

    // 启动家庭同步：本地先渲染，云端数据更新后自动覆盖并刷新
    if (typeof IslandSync !== 'undefined') {
        IslandSync.start({ onRemoteUpdate: refreshCurrentView });
    }
});

