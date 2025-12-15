// 全局状态：所有待办项
let todos = [];

// localStorage 使用的 key
const STORAGE_KEY = "todos-app-data";

// DOM 元素缓存
const titleInput = document.getElementById("todo-title");
const descInput = document.getElementById("todo-desc");
const categorySelect = document.getElementById("todo-category");
const addBtn = document.getElementById("add-btn");
const todoList = document.getElementById("todo-list");
const searchInput = document.getElementById("search-input");
const filterCategory = document.getElementById("filter-category");

/**
 * 创建一个待办对象
 * @param {string} title
 * @param {string} description
 * @param {string} category
 */
function createTodo(title, description, category) {
  return {
    id: Date.now(), // 简单唯一 ID
    title,
    description,
    category,
    completed: false,
    createdAt: new Date().toISOString()
  };
}

/**
 * 从 localStorage 加载 todos
 */
function loadTodosFromStorage() {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) {
    todos = [];
    return;
  }
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      todos = parsed;
    } else {
      todos = [];
    }
  } catch (error) {
    console.error("Failed to parse todos from storage", error);
    todos = [];
  }
}

/**
 * 保存 todos 到 localStorage
 */
function saveTodosToStorage() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(todos));
  } catch (error) {
    console.error("Failed to save todos to storage", error);
  }
}

/**
 * 根据当前搜索和分类过滤，返回应显示的 todos
 */
function getVisibleTodos() {
  const keyword = searchInput.value.trim().toLowerCase();
  const category = filterCategory.value; // all / work / study / life

  let result = todos.filter((todo) => {
    const matchCategory = category === "all" || todo.category === category;
    const matchKeyword =
      !keyword || todo.title.toLowerCase().includes(keyword);
    return matchCategory && matchKeyword;
  });

  // 未完成在前，已完成在后
  result.sort((a, b) => {
    if (a.completed === b.completed) {
      // 同一完成状态下，按创建时间排序（新任务在前）
      return b.id - a.id;
    }
    return a.completed ? 1 : -1;
  });

  return result;
}

/**
 * 将当前 todos 渲染到页面
 */
function renderTodos() {
  // 先清空列表
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
    categoryTag.textContent = mapCategoryToText(todo.category);

    titleLine.appendChild(titleSpan);
    titleLine.appendChild(categoryTag);
    textWrapper.appendChild(titleLine);

    if (todo.description) {
      const descSpan = document.createElement("div");
      descSpan.className = "todo-desc";
      descSpan.textContent = todo.description;
      textWrapper.appendChild(descSpan);
    }

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
 * 分类值映射为展示文本
 */
function mapCategoryToText(category) {
  switch (category) {
    case "work":
      return "工作";
    case "study":
      return "学习";
    case "life":
      return "生活";
    default:
      return "其他";
  }
}

/**
 * 添加新的待办
 */
function addTodo() {
  const title = titleInput.value.trim();
  const description = descInput.value.trim();
  const category = categorySelect.value;

  if (!title) {
    alert("标题不能为空");
    titleInput.focus();
    return;
  }

  const newTodo = createTodo(title, description, category);
  todos.push(newTodo);

  // 清空输入
  titleInput.value = "";
  descInput.value = "";
  categorySelect.value = "work";

  saveTodosToStorage();
  renderTodos();
}

/**
 * 删除待办
 * @param {number} id
 */
function deleteTodo(id) {
  const target = todos.find((todo) => todo.id === id);
  if (!target) return;

  const ok = confirm(`确定要删除「${target.title}」吗？`);
  if (!ok) return;

  todos = todos.filter((todo) => todo.id !== id);
  saveTodosToStorage();
  renderTodos();
}

/**
 * 切换完成状态
 * @param {number} id
 */
function toggleTodo(id) {
  todos = todos.map((todo) =>
    todo.id === id ? { ...todo, completed: !todo.completed } : todo
  );
  saveTodosToStorage();
  renderTodos();
}

/**
 * 初始化事件绑定
 */
function bindEvents() {
  addBtn.addEventListener("click", addTodo);

  // 在标题输入框按回车添加
  titleInput.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      addTodo();
    }
  });

  // 搜索实时触发过滤
  searchInput.addEventListener("input", () => {
    renderTodos();
  });

  // 分类切换时重新渲染
  filterCategory.addEventListener("change", () => {
    renderTodos();
  });
}

/**
 * 初始化应用
 */
function init() {
  loadTodosFromStorage();
  bindEvents();
  renderTodos();
}

init();

