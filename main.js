// 全局状态：任务列表 + 分类列表
let todos = [];
let categories = [];

// 新建任务当前选中的日期（null 表示未选择任务日期）
let newTodoDueDate = null;

// localStorage 使用的 key（沿用原来的，兼容老数据）
const STORAGE_KEY = "todos-app-data";

// 特殊“今日任务”虚拟分类（不会被删除）
const TODAY_CATEGORY_ID = "today";
const TODAY_CATEGORY_NAME = "今日任务";

// 拖拽相关：记录当前拖拽的任务 id
let draggingTodoId = null;

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
    order: maxOrder + 1 // 用于手动排序
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
      order:
        typeof t.order === "number"
          ? t.order
          : idx + 1
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
      !keyword || todo.title.toLowerCase().includes(keyword);

    let matchCategory = true;
    if (categoryFilter && categoryFilter !== "all") {
      if (categoryFilter === TODAY_CATEGORY_ID) {
        // “今日任务”：按日期筛
        matchCategory = todo.dueDate === todayStr;
      } else {
        // 普通分类：按 categoryId 筛
        matchCategory =
          String(todo.categoryId) === String(categoryFilter);
      }
    }

    return matchKeyword && matchCategory;
  });

  // 排序规则：
  // 1. 未完成在前，已完成在后
  // 2. 对未完成任务：如果都有 dueDate，则按日期早到晚
  // 3. 然后按 order 排序（用于拖拽手动排序）
  result.sort((a, b) => {
    if (a.completed !== b.completed) {
      return a.completed ? 1 : -1;
    }

    // 同为未完成任务时，优先看日期
    if (!a.completed && !b.completed) {
      if (a.dueDate && b.dueDate && a.dueDate !== b.dueDate) {
        return a.dueDate.localeCompare(b.dueDate);
      }
    }

    const orderA = typeof a.order === "number" ? a.order : 0;
    const orderB = typeof b.order === "number" ? b.order : 0;

    if (orderA !== orderB) {
      return orderA - orderB;
    }

    return a.id - b.id;
  });

  return result;
}

/**
 * 根据 categoryId 获取分类名
 */
function getCategoryNameById(categoryId) {
  const cat = categories.find(
    (c) => String(c.id) === String(categoryId)
  );
  return cat ? cat.name : "未分类";
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
 * 将当前 todos 渲染到页面
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
    li.draggable = true;

    // 拖拽事件
    li.addEventListener("dragstart", handleDragStart);
    li.addEventListener("dragover", handleDragOver);
    li.addEventListener("drop", handleDrop);
    li.addEventListener("dragend", handleDragEnd);

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
    titleSpan.textContent = todo.title;

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
      descSpan.textContent = todo.description;
      textWrapper.appendChild(descSpan);
    }

    // 任务日期：平时只显示一行文本，编辑时再出现“清除”等控件
    const dueSpan = document.createElement("div");
    dueSpan.className = "todo-desc todo-due";
    const dueText = todo.dueDate || "未选择任务日期";
    dueSpan.textContent = `任务日期：${dueText}`;

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

  const cat = categories.find(
    (c) => String(c.id) === String(categoryId)
  );
  if (!cat) return;

  const relatedTodos = todos.filter(
    (t) => String(t.categoryId) === String(categoryId)
  );

  const ok = confirm(
    `删除分类「${cat.name}」将同时删除其下的 ${relatedTodos.length} 条任务，确定继续？`
  );
  if (!ok) return;

  todos = todos.filter(
    (t) => String(t.categoryId) !== String(categoryId)
  );
  categories = categories.filter(
    (c) => String(c.id) !== String(categoryId)
  );

  saveToStorage();
  renderCategorySelects();
  renderTodos();
}

/**
 * 切换完成状态
 * 完成任务会自动排到列表末尾（通过排序规则实现）
 */
function toggleTodo(id) {
  todos = todos.map((todo) =>
    todo.id === id ? { ...todo, completed: !todo.completed } : todo
  );
  saveToStorage();
  renderTodos();
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
  };

  select.addEventListener("change", applyChange);
  // 用户切换焦点但没改也要恢复渲染
  select.addEventListener("blur", () => {
    renderTodos();
  });
}

/**
 * 修改任务日期：点击日期文本触发
 * 弹出“小编辑区”：日期选择器 + 清除按钮
 */
function editTodoDueDate(id, anchorEl) {
  const todo = todos.find((t) => t.id === id);
  if (!todo) return;

  // 容器，代替原来的文本 div
  const wrapper = document.createElement("span");
  wrapper.className = "todo-date-editor";

  const input = document.createElement("input");
  input.type = "date";
  input.value = todo.dueDate || "";

  const okBtn = document.createElement("button");
  okBtn.type = "button";
  okBtn.textContent = "确定";
  okBtn.className = "todo-date-ok-btn";

  const clearBtn = document.createElement("button");
  clearBtn.type = "button";
  clearBtn.textContent = "清除";
  clearBtn.className = "todo-date-clear-btn";

  wrapper.appendChild(input);
  wrapper.appendChild(okBtn);
  wrapper.appendChild(clearBtn);

  // 用编辑区域替换掉原来的“任务日期：xxx”文本
  anchorEl.replaceWith(wrapper);
  input.focus();

  // 点击“确定”：按当前 input 的值保存（为空则视为未选择）
  const handleOk = () => {
    const newValue = input.value.trim();
    todos = todos.map((t) =>
      t.id === id ? { ...t, dueDate: newValue || null } : t
    );
    saveToStorage();
    renderTodos();
  };

  // 点击“清除”：直接将日期清空为 null
  const handleClear = () => {
    todos = todos.map((t) =>
      t.id === id ? { ...t, dueDate: null } : t
    );
    saveToStorage();
    renderTodos();
  };

  okBtn.addEventListener("click", handleOk);
  clearBtn.addEventListener("click", handleClear);

  // 回车等于“确定”，Esc 等于“放弃修改”
  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      handleOk();
    } else if (e.key === "Escape") {
      renderTodos();
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
 * 拖拽开始
 */
function handleDragStart(event) {
  const li = event.currentTarget;
  draggingTodoId = Number(li.dataset.id);
  event.dataTransfer.effectAllowed = "move";
}

/**
 * 拖拽经过，必须阻止默认行为才能触发 drop
 */
function handleDragOver(event) {
  event.preventDefault();
  event.dataTransfer.dropEffect = "move";
}

/**
 * 拖拽放下
 */
function handleDrop(event) {
  event.preventDefault();
  const targetLi = event.currentTarget;
  const targetId = Number(targetLi.dataset.id);

  if (!draggingTodoId || draggingTodoId === targetId) {
    return;
  }

  reorderTodos(draggingTodoId, targetId);
  draggingTodoId = null;
}

/**
 * 拖拽结束
 */
function handleDragEnd() {
  draggingTodoId = null;
}

/**
 * 在当前可见列表中调整任务顺序
 * 只允许同一完成状态之间的拖拽
 */
function reorderTodos(sourceId, targetId) {
  const visible = getVisibleTodos();
  const source = visible.find((t) => t.id === sourceId);
  const target = visible.find((t) => t.id === targetId);
  if (!source || !target) return;

  // 已完成与未完成之间不允许调整顺序（已完成必须在列表末尾）
  if (source.completed !== target.completed) {
    return;
  }

  const sourceIndex = visible.indexOf(source);
  const targetIndex = visible.indexOf(target);
  if (sourceIndex === -1 || targetIndex === -1) return;

  visible.splice(sourceIndex, 1);
  visible.splice(targetIndex, 0, source);

  // 按新顺序更新 order
  visible.forEach((todo, index) => {
    const idx = todos.findIndex((t) => t.id === todo.id);
    if (idx !== -1) {
      todos[idx].order = index + 1;
    }
  });

  saveToStorage();
  renderTodos();
}

/**
 * 更新创建任务区域的日期显示：根据 newTodoDueDate
 */
function updateCreateDueDateDisplay() {
  if (!dueDateInput) return;
  const text = newTodoDueDate || "未选择任务日期";
  dueDateInput.value = text;
}

/**
 * 打开创建任务区域的日期编辑面板
 */
function openCreateDueDateEditor() {
  if (!dueDateInput) return;

  const wrapper = document.createElement("span");
  wrapper.className = "todo-date-editor";

  const input = document.createElement("input");
  input.type = "date";
  input.value = newTodoDueDate || "";

  const okBtn = document.createElement("button");
  okBtn.type = "button";
  okBtn.textContent = "确定";
  okBtn.className = "todo-date-ok-btn";

  const clearBtn = document.createElement("button");
  clearBtn.type = "button";
  clearBtn.textContent = "清除";
  clearBtn.className = "todo-date-clear-btn";

  wrapper.appendChild(input);
  wrapper.appendChild(okBtn);
  wrapper.appendChild(clearBtn);

  // 用编辑区域替换掉原来的输入框
  dueDateInput.replaceWith(wrapper);
  input.focus();

  const finish = () => {
    wrapper.replaceWith(dueDateInput);
    updateCreateDueDateDisplay();
  };

  const handleOk = () => {
    const v = input.value.trim();
    newTodoDueDate = v || null;
    finish();
  };

  const handleClear = () => {
    newTodoDueDate = null;
    finish();
  };

  okBtn.addEventListener("click", handleOk);
  clearBtn.addEventListener("click", handleClear);

  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      handleOk();
    } else if (e.key === "Escape") {
      finish(); // 放弃修改，恢复原显示
    }
  });
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
}

/**
 * 初始化应用
 */
function init() {
  loadFromStorage();
  renderCategorySelects();
  bindEvents();
  renderTodos();
}

init();
