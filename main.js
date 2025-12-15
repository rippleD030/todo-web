// 全局状态：任务列表 + 分类列表
let todos = [];
let categories = [];

// 新建任务当前选中的日期（null 表示未选择日期）
let newTodoDueDate = null;

// localStorage 使用的 key（沿用原来的，兼容老数据）
const STORAGE_KEY = "todos-app-data";

// 特殊“今日任务”虚拟分类（不会被删除）
const TODAY_CATEGORY_ID = "today";
const TODAY_CATEGORY_NAME = "今日任务";

// DOM 元素缓存
const titleInput = document.getElementById("todo-title");
const descInput = document.getElementById("todo-desc");
const categorySelect = document.getElementById("todo-category");
const addBtn = document.getElementById("add-btn");
const todoList = document.getElementById("todo-list");
const searchInput = document.getElementById("search-input");
const filterCategory = document.getElementById("filter-category");
const dueDateInput = document.getElementById("todo-due-date");

// 分类管理按钮
const addCategoryBtn = document.getElementById("add-category-btn");
const deleteCategoryBtn = document.getElementById("delete-category-btn");

// 视图切换（列表 / 统计）相关
const tabListBtn = document.getElementById("tab-list");
const tabStatsBtn = document.getElementById("tab-stats");
const viewList = document.getElementById("view-list");
const viewStats = document.getElementById("view-stats");

// 图表 canvas + 实例缓存
const todayPieCanvas = document.getElementById("today-pie-chart");
const last7LineCanvas = document.getElementById("last7-line-chart");
let todayPieChart = null;
let last7LineChart = null;

/**
 * 获取今天日期字符串：YYYY-MM-DD
 */
function getTodayDateString() {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

/**
 * 创建默认分类（初始三组：工作 / 学习 / 生活）
 */
function createDefaultCategories() {
  return [
    { id: "work", name: "工作" },
    { id: "study", name: "学习" },
    { id: "life", name: "生活" }
  ];
}

/**
 * 兼容老版本：字符串分类映射到 id
 */
function legacyCategoryToId(category) {
  if (!category) return "work";
  if (category === "work" || category === "study" || category === "life") {
    return category;
  }
  return "work";
}

/**
 * 创建一个待办对象
 */
function createTodo(title, description, categoryId, dueDate) {
  const maxOrder = todos.reduce(
    (max, t) => (typeof t.order === "number" && t.order > max ? t.order : max),
    0
  );

  return {
    id: Date.now(), // 简单唯一 ID
    title,
    description,
    categoryId,
    dueDate: dueDate || null, // "YYYY-MM-DD" 或 null
    completed: false,
    createdAt: new Date().toISOString(),
    completedAt: null, // 完成日期（YYYY-MM-DD），未完成为 null
    order: maxOrder + 1 // 用于排序
  };
}

/**
 * 从 localStorage 加载数据
 * 支持两种格式：
 * - 老版本：直接存 todos 数组
 * - 新版本：{ todos, categories }
 */
function loadFromStorage() {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) {
    todos = [];
    categories = createDefaultCategories();
    return;
  }

  try {
    const parsed = JSON.parse(raw);

    // 老版本：直接存数组
    if (Array.isArray(parsed)) {
      categories = createDefaultCategories();
      todos = parsed.map((t, idx) => ({
        id: t.id || Date.now() + idx,
        title: t.title,
        description: t.description || "",
        categoryId: legacyCategoryToId(t.category),
        completed: !!t.completed,
        createdAt: t.createdAt || new Date().toISOString(),
        dueDate: t.dueDate || null,
        completedAt: t.completedAt || null,
        order: typeof t.order === "number" ? t.order : idx + 1
      }));
      return;
    }

    // 新版本：对象结构
    todos = Array.isArray(parsed.todos) ? parsed.todos : [];
    categories = Array.isArray(parsed.categories)
      ? parsed.categories
      : createDefaultCategories();

    // 补救缺失字段
    if (!categories.length) {
      categories = createDefaultCategories();
    }
    todos = todos.map((t, idx) => ({
      id: t.id || Date.now() + idx,
      title: t.title || "",
      description: t.description || "",
      categoryId: t.categoryId || legacyCategoryToId(t.category),
      completed: !!t.completed,
      createdAt: t.createdAt || new Date().toISOString(),
      dueDate: t.dueDate || null,
      completedAt: t.completedAt || null,
      order: typeof t.order === "number" ? t.order : idx + 1
    }));
  } catch (error) {
    console.error("Failed to parse state from storage", error);
    todos = [];
    categories = createDefaultCategories();
  }
}

/**
 * 保存数据到 localStorage
 */
function saveToStorage() {
  try {
    const payload = {
      todos,
      categories
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
  } catch (error) {
    console.error("Failed to save state to storage", error);
  }
}

/**
 * 根据当前搜索和分类过滤，返回应显示的 todos
 */
function getVisibleTodos() {
  const keyword = searchInput.value.trim().toLowerCase();
  const categoryFilter = filterCategory.value; // all / today / categoryId
  const todayStr = getTodayDateString();

  let result = todos.filter((todo) => {
    const matchKeyword =
      !keyword ||
      (todo.title && todo.title.toLowerCase().includes(keyword)) ||
      (todo.description && todo.description.toLowerCase().includes(keyword));

    let matchCategory = true;
    if (categoryFilter && categoryFilter !== "all") {
      if (categoryFilter === TODAY_CATEGORY_ID) {
        // “今日任务”：按日期筛
        matchCategory = todo.dueDate === todayStr;
      } else {
        // 普通分类：按 categoryId 筛
        matchCategory = String(todo.categoryId) === String(categoryFilter);
      }
    }

    return matchKeyword && matchCategory;
  });

  // 排序：未完成在前；有日期的排在前面；日期更早在前；再按创建时间
  result.sort((a, b) => {
    if (a.completed !== b.completed) {
      return a.completed ? 1 : -1;
    }
    const aHas = !!a.dueDate;
    const bHas = !!b.dueDate;
    if (aHas !== bHas) return aHas ? -1 : 1;
    if (aHas && bHas && a.dueDate !== b.dueDate) {
      return a.dueDate.localeCompare(b.dueDate);
    }
    const aCreated = a.createdAt || "";
    const bCreated = b.createdAt || "";
    if (aCreated !== bCreated) return aCreated.localeCompare(bCreated);
    return a.id - b.id;
  });

  return result;
}

/**
 * 更新统计视图里“今日已完成 XX 个任务”这行文案
 * 使用 completedAt 判断“今天完成”
 */
function updateTodayDoneText() {
  const label = document.getElementById("today-done-count");
  if (!label) return;

  const todayStr = getTodayDateString();
  const count = todos.filter(
    (t) => t.completed && t.completedAt === todayStr
  ).length;

  label.textContent = `今日已完成 ${count} 个任务`;
}

/**
 * 根据 categoryId 获取分类名
 */
function getCategoryNameById(categoryId) {
  const cat = categories.find((c) => String(c.id) === String(categoryId));
  return cat ? cat.name : "未分类";
}

/**
 * 搜索高亮
 */
function applySearchHighlight(element, text) {
  element.textContent = "";
  const keyword = searchInput.value.trim();
  if (!keyword) {
    element.textContent = text || "";
    return;
  }
  const src = String(text || "");
  const lower = src.toLowerCase();
  const kw = keyword.toLowerCase();
  let i = 0;
  while (true) {
    const idx = lower.indexOf(kw, i);
    if (idx === -1) {
      const rest = src.slice(i);
      if (rest) element.appendChild(document.createTextNode(rest));
      break;
    }
    if (idx > i) {
      element.appendChild(document.createTextNode(src.slice(i, idx)));
    }
    const hit = document.createElement("span");
    hit.className = "search-highlight";
    hit.textContent = src.slice(idx, idx + kw.length);
    element.appendChild(hit);
    i = idx + kw.length;
  }
}

/**
 * 渲染分类下拉（添加任务用 + 过滤用）
 */
function renderCategorySelects() {
  // 添加任务的分类选择：只展示真正的分类，不展示“今日任务”
  if (categorySelect) {
    categorySelect.innerHTML = "";
    categories.forEach((cat) => {
      const option = document.createElement("option");
      option.value = String(cat.id);
      option.textContent = cat.name;
      categorySelect.appendChild(option);
    });
  }

  // 筛选下拉：包含「全部分类」「今日任务」+ 所有分类
  if (filterCategory) {
    const currentValue = filterCategory.value;
    filterCategory.innerHTML = "";

    const allOption = document.createElement("option");
    allOption.value = "all";
    allOption.textContent = "全部分类";
    filterCategory.appendChild(allOption);

    const todayOption = document.createElement("option");
    todayOption.value = TODAY_CATEGORY_ID;
    todayOption.textContent = TODAY_CATEGORY_NAME;
    filterCategory.appendChild(todayOption);

    categories.forEach((cat) => {
      const option = document.createElement("option");
      option.value = String(cat.id);
      option.textContent = cat.name;
      filterCategory.appendChild(option);
    });

    // 恢复之前选择，如果不存在则回到 "all"
    if (
      currentValue &&
      currentValue !== "all" &&
      currentValue !== TODAY_CATEGORY_ID
    ) {
      const exists = categories.some(
        (c) => String(c.id) === String(currentValue)
      );
      filterCategory.value = exists ? currentValue : "all";
    } else if (currentValue === TODAY_CATEGORY_ID) {
      filterCategory.value = TODAY_CATEGORY_ID;
    } else {
      filterCategory.value = "all";
    }
  }
}

/**
 * 渲染任务列表
 */
function renderTodos() {
  todoList.innerHTML = "";

  const visibleTodos = getVisibleTodos();

  if (visibleTodos.length === 0) {
    const empty = document.createElement("li");
    empty.textContent = "暂无待办事项";
    empty.className = "todo-empty";
    todoList.appendChild(empty);
    return;
  }

  visibleTodos.forEach((todo) => {
    const li = document.createElement("li");
    li.className = "todo-item";
    li.dataset.id = String(todo.id);

    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.checked = todo.completed;
    checkbox.addEventListener("change", () => {
      toggleTodo(todo.id);
    });

    const textWrapper = document.createElement("div");
    textWrapper.className = "todo-text";

    const titleLine = document.createElement("div");
    titleLine.className = "todo-title-line";

    const titleSpan = document.createElement("span");
    titleSpan.className = "todo-title";
    applySearchHighlight(titleSpan, todo.title);

    const categoryTag = document.createElement("span");
    categoryTag.className = "todo-category-tag";
    categoryTag.textContent = getCategoryNameById(todo.categoryId);

    // 点击分类标签，用下拉框修改分类
    categoryTag.addEventListener("click", (event) => {
      editTodoCategory(todo.id, event.currentTarget);
    });

    titleLine.appendChild(titleSpan);
    titleLine.appendChild(categoryTag);
    textWrapper.appendChild(titleLine);

    if (todo.description) {
      const descSpan = document.createElement("div");
      descSpan.className = "todo-desc";
      applySearchHighlight(descSpan, todo.description);
      textWrapper.appendChild(descSpan);
    }

    // 任务日期：有日期就显示日期，没有就显示“未选择日期”
    const dueSpan = document.createElement("div");
    dueSpan.className = "todo-desc todo-due";
    const hasDate = todo.dueDate !== null && todo.dueDate !== "";
    dueSpan.textContent = hasDate
      ? `任务日期：${todo.dueDate}`
      : "未选择日期";

    // 点击日期文本，进入编辑态（日期选择 + 清除按钮）
    dueSpan.addEventListener("click", () => {
      editTodoDueDate(todo.id, dueSpan);
    });

    textWrapper.appendChild(dueSpan);

    if (todo.completed) {
      li.classList.add("todo-completed");
    }

    const deleteBtn = document.createElement("button");
    deleteBtn.className = "todo-delete-btn";
    deleteBtn.textContent = "删除";
    deleteBtn.addEventListener("click", () => {
      deleteTodo(todo.id);
    });

    li.appendChild(checkbox);
    li.appendChild(textWrapper);
    li.appendChild(deleteBtn);

    todoList.appendChild(li);
  });
}

/**
 * 添加新的待办
 */
function addTodo() {
  const title = titleInput.value.trim();
  const description = descInput.value.trim();
  const categoryId = categorySelect.value;
  const dueDate = newTodoDueDate || "";

  if (!title) {
    alert("标题不能为空");
    titleInput.focus();
    return;
  }

  if (!categoryId) {
    alert("请先选择或创建一个分类");
    return;
  }

  const newTodo = createTodo(title, description, categoryId, dueDate);
  todos.push(newTodo);

  titleInput.value = "";
  descInput.value = "";
  newTodoDueDate = null;
  updateCreateDueDateDisplay();

  saveToStorage();
  renderTodos();
  updateTodayDoneText();
  renderStats();
}

/**
 * 删除单个待办
 */
function deleteTodo(id) {
  const target = todos.find((todo) => todo.id === id);
  if (!target) return;

  const ok = confirm(`确定要删除「${target.title}」吗？`);
  if (!ok) return;

  todos = todos.filter((todo) => todo.id !== id);

  saveToStorage();
  renderTodos();
  updateTodayDoneText();
  renderStats();
}

/**
 * 显式删除分类（级联删除该分类下所有任务）
 */
function deleteCategoryById(categoryId) {
  // 今日任务是虚拟分类，禁止删除
  if (categoryId === TODAY_CATEGORY_ID) {
    alert("「今日任务」是默认分类，不能删除");
    return;
  }

  const cat = categories.find((c) => String(c.id) === String(categoryId));
  if (!cat) return;

  const relatedTodos = todos.filter(
    (t) => String(t.categoryId) === String(categoryId)
  );

  const ok = confirm(
    `删除分类「${cat.name}」将同时删除其下的 ${relatedTodos.length} 条任务，确定继续？`
  );
  if (!ok) return;

  todos = todos.filter((t) => String(t.categoryId) !== String(categoryId));
  categories = categories.filter((c) => String(c.id) !== String(categoryId));

  saveToStorage();
  renderCategorySelects();
  renderTodos();
  updateTodayDoneText();
  renderStats();
}

/**
 * 切换完成状态：同时写入 / 清空 completedAt
 */
function toggleTodo(id) {
  const todayStr = getTodayDateString();
  todos = todos.map((todo) => {
    if (todo.id !== id) return todo;
    const nextCompleted = !todo.completed;
    return {
      ...todo,
      completed: nextCompleted,
      completedAt: nextCompleted ? todayStr : null
    };
  });
  saveToStorage();
  renderTodos();
  updateTodayDoneText();
  renderStats();
}

/**
 * 修改任务分类：点击分类标签触发，下拉框选择
 */
function editTodoCategory(id, anchorEl) {
  const todo = todos.find((t) => t.id === id);
  if (!todo) return;

  if (!categories.length) {
    alert("当前没有可用的分类，请先创建分类");
    return;
  }

  // 创建一个临时下拉框
  const select = document.createElement("select");
  categories.forEach((cat) => {
    const option = document.createElement("option");
    option.value = String(cat.id);
    option.textContent = cat.name;
    select.appendChild(option);
  });

  select.value = String(todo.categoryId);

  // 用下拉框临时替换原来的分类标签
  anchorEl.replaceWith(select);
  select.focus();

  const applyChange = () => {
    const newCategoryId = select.value;
    todos = todos.map((t) =>
      t.id === id ? { ...t, categoryId: newCategoryId } : t
    );
    saveToStorage();
    renderTodos();
    renderStats();
  };

  select.addEventListener("change", applyChange);
  // 用户切换焦点但没改也要恢复渲染
  select.addEventListener("blur", () => {
    renderTodos();
    renderStats();
  });
}

/**
 * 修改任务日期：点击日期文本触发
 * 弹出“小编辑区”：日期选择器 + 清除按钮（无确定按钮）
 * - 选择日期（change）：立即保存该日期
 * - 点击清除：日期变为未选择
 * - Esc：放弃修改，恢复原来的显示
 */
function editTodoDueDate(id, anchorEl) {
  const todo = todos.find((t) => t.id === id);
  if (!todo) return;

  const wrapper = document.createElement("span");
  wrapper.className = "todo-date-editor";

  const input = document.createElement("input");
  input.type = "date";
  input.value = todo.dueDate || "";

  const clearBtn = document.createElement("button");
  clearBtn.type = "button";
  clearBtn.textContent = "清除";
  clearBtn.className = "todo-date-clear-btn";

  const btnCol = document.createElement("span");
  btnCol.className = "todo-date-editor-buttons";
  btnCol.appendChild(clearBtn);

  wrapper.appendChild(input);
  wrapper.appendChild(btnCol);

  // 替换原来的“任务日期：xxx”文本
  anchorEl.replaceWith(wrapper);
  input.focus();

  let finished = false;

  // 选了日期就立刻保存
  const applyFromInput = () => {
    if (finished) return;
    finished = true;
    const newValue = input.value.trim();
    todos = todos.map((t) =>
      t.id === id ? { ...t, dueDate: newValue || null } : t
    );
    saveToStorage();
    renderTodos();
    renderStats();
  };

  input.addEventListener("change", applyFromInput);

  // 清除：直接设为 null
  const handleClear = () => {
    if (finished) return;
    finished = true;
    todos = todos.map((t) =>
      t.id === id ? { ...t, dueDate: null } : t
    );
    saveToStorage();
    renderTodos();
    renderStats();
  };
  clearBtn.addEventListener("click", handleClear);

  // Esc：放弃修改
  input.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      if (finished) return;
      finished = true;
      renderTodos();
      renderStats();
    }
  });
}

/**
 * 新增分类
 */
function handleAddCategory() {
  const name = prompt("请输入新的分类名称：");
  if (!name) return;

  const trimmed = name.trim();
  if (!trimmed) return;

  const id = Date.now().toString();
  categories.push({ id, name: trimmed });

  saveToStorage();
  renderCategorySelects();
}

/**
 * 删除当前选中的分类（通过过滤下拉或添加表单的分类选择）
 */
function handleDeleteCurrentCategory() {
  // 优先看筛选下拉的选择
  if (filterCategory && filterCategory.value) {
    const v = filterCategory.value;

    // 全部分类 -> 默认视图，不能删除
    if (v === "all") {
      alert("「全部分类」是默认视图，不能删除");
      return;
    }

    // 今日任务 -> 默认分类，不能删除
    if (v === TODAY_CATEGORY_ID) {
      alert("「今日任务」是默认分类，不能删除");
      return;
    }

    // 其他正常分类
    deleteCategoryById(v);
    return;
  }

  // 如果筛选下拉没有选中具体分类，再看添加区域的分类选择
  if (categorySelect && categorySelect.value) {
    const categoryId = categorySelect.value;
    deleteCategoryById(categoryId);
    return;
  }

  // 都没有的话，就提示没有可删除的分类
  alert("当前没有可删除的分类");
}

/**
 * 更新创建任务区域的日期显示：根据 newTodoDueDate
 */
function updateCreateDueDateDisplay() {
  if (!dueDateInput) return;
  const text = newTodoDueDate || "未选择日期";
  dueDateInput.value = text;
}

/**
 * 打开创建任务区域的日期编辑面板（无确定按钮，只有清除）
 * - 选日期（change）：自动保存并退出
 * - 点击清除：设为未选择并退出
 * - Esc：放弃修改并退出
 */
function openCreateDueDateEditor() {
  if (!dueDateInput) return;

  const wrapper = document.createElement("span");
  wrapper.className = "todo-date-editor";

  const input = document.createElement("input");
  input.type = "date";
  input.value = newTodoDueDate || "";

  const clearBtn = document.createElement("button");
  clearBtn.type = "button";
  clearBtn.textContent = "清除";
  clearBtn.className = "todo-date-clear-btn";

  const btnCol = document.createElement("span");
  btnCol.className = "todo-date-editor-buttons";
  btnCol.appendChild(clearBtn);

  wrapper.appendChild(input);
  wrapper.appendChild(btnCol);

  // 用编辑区域替换掉原来的显示输入框
  dueDateInput.replaceWith(wrapper);
  input.focus();

  let finished = false;

  const finish = () => {
    wrapper.replaceWith(dueDateInput);
    updateCreateDueDateDisplay();
  };

  // 选日期：自动保存并结束
  const applyFromInput = () => {
    if (finished) return;
    finished = true;
    const v = input.value.trim();
    newTodoDueDate = v || null;
    finish();
  };

  input.addEventListener("change", applyFromInput);

  // 清除：设为未选择
  const handleClear = () => {
    if (finished) return;
    finished = true;
    newTodoDueDate = null;
    finish();
  };
  clearBtn.addEventListener("click", handleClear);

  // Esc：放弃修改
  input.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      if (finished) return;
      finished = true;
      finish();
    }
  });
}

/**
 * 今日完成任务统计（按分类）
 */
function getTodayCompletedStats() {
  const todayStr = getTodayDateString();
  const map = new Map(); // key: 分类名, value: 数量

  todos.forEach((t) => {
    if (!t.completed) return;
    if (t.completedAt !== todayStr) return;
    const name = getCategoryNameById(t.categoryId);
    map.set(name, (map.get(name) || 0) + 1);
  });

  const labels = [];
  const data = [];
  map.forEach((value, key) => {
    labels.push(key);
    data.push(value);
  });

  return { labels, data };
}

/**
 * 近 7 天完成任务统计
 */
function getLast7DaysCompletedStats() {
  const labels = [];
  const data = [];

  for (let i = 6; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    const dd = String(d.getDate()).padStart(2, "0");
    const dateStr = `${yyyy}-${mm}-${dd}`;

    const count = todos.filter(
      (t) => t.completed && t.completedAt === dateStr
    ).length;

    labels.push(`${mm}-${dd}`);
    data.push(count);
  }

  return { labels, data };
}

/**
 * 渲染统计视图：饼图 + 折线图
 */
function renderStats() {
  if (!todayPieCanvas || !last7LineCanvas || typeof Chart === "undefined") {
    return;
  }

  // 先更新“今日已完成 XX 个任务”这行
  updateTodayDoneText();

  const todayCtx = todayPieCanvas.getContext("2d");
  const last7Ctx = last7LineCanvas.getContext("2d");

  const todayStats = getTodayCompletedStats();
  const last7Stats = getLast7DaysCompletedStats();

  // 清除旧图表实例
  if (todayPieChart) todayPieChart.destroy();
  if (last7LineChart) last7LineChart.destroy();

  // 今日完成饼图
  todayPieChart = new Chart(todayCtx, {
    type: "pie",
    data: {
      labels: todayStats.labels.length ? todayStats.labels : ["无数据"],
      datasets: [
        {
          data: todayStats.data.length ? todayStats.data : [1]
        }
      ]
    },
    options: {
      plugins: {
        legend: {
          position: "bottom"
        },
        title: {
          display: todayStats.labels.length === 0,
          text: "今日没有完成任何任务"
        }
      }
    }
  });

  // 近 7 天折线图
  last7LineChart = new Chart(last7Ctx, {
    type: "line",
    data: {
      labels: last7Stats.labels,
      datasets: [
        {
          label: "完成任务数",
          data: last7Stats.data,
          fill: false,
          tension: 0.2
        }
      ]
    },
    options: {
      scales: {
        y: {
          beginAtZero: true,
          ticks: {
            precision: 0
          }
        }
      }
    }
  });
}

/**
 * 视图切换：列表 / 统计
 */
function switchView(view) {
  if (!viewList || !viewStats) return;

  if (view === "stats") {
    viewList.style.display = "none";
    viewStats.style.display = "";
    if (tabListBtn && tabStatsBtn) {
      tabListBtn.classList.remove("tab-active");
      tabStatsBtn.classList.add("tab-active");
    }
    renderStats();
  } else {
    viewList.style.display = "";
    viewStats.style.display = "none";
    if (tabListBtn && tabStatsBtn) {
      tabListBtn.classList.add("tab-active");
      tabStatsBtn.classList.remove("tab-active");
    }
    renderTodos();
  }
}

/**
 * 初始化事件绑定
 */
function bindEvents() {
  addBtn.addEventListener("click", addTodo);

  titleInput.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      addTodo();
    }
  });

  searchInput.addEventListener("input", () => {
    renderTodos();
  });

  filterCategory.addEventListener("change", () => {
    renderTodos();
  });

  if (addCategoryBtn) {
    addCategoryBtn.addEventListener("click", handleAddCategory);
  }
  if (deleteCategoryBtn) {
    deleteCategoryBtn.addEventListener("click", handleDeleteCurrentCategory);
  }

  // 创建任务区域的日期输入：作为“显示控件”，点击弹出编辑面板
  if (dueDateInput) {
    dueDateInput.readOnly = true; // 不手动输入，只通过面板选择
    updateCreateDueDateDisplay();
    dueDateInput.addEventListener("click", openCreateDueDateEditor);
  }

  // 页签切换
  if (tabListBtn) {
    tabListBtn.addEventListener("click", () => switchView("list"));
  }
  if (tabStatsBtn) {
    tabStatsBtn.addEventListener("click", () => switchView("stats"));
  }
}

/**
 * 初始化应用
 */
function init() {
  loadFromStorage();
  renderCategorySelects();
  bindEvents();
  renderTodos();
  updateTodayDoneText();
  // 默认展示列表视图
  switchView("list");
}

init();
