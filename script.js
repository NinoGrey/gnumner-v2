// Конфигурация Supabase
const SUPABASE_URL = 'https://pkjrjtwlryuuconrpcnx.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_QfqhRHEjHYp_xA1nC_y7AQ__4pDx3-F';

const GH_USER = 'NinoGrey';
const GH_REPO = 'gnumner-v2';
const WORKFLOW_ID = 'tracker.yml';

const supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

let allTenders = [];
let currentDateMode = 'all';

// Состояние сортировки
let currentSortColumn = 'publish_date';
let currentSortDirection = 'desc'; // по умолчанию новые сверху

// Выбранные категории для мультифильтра (пустой Set означает «все выбраны»)
let selectedCategories = new Set();
let availableCategoriesList = [];

// Генератор стабильного цвета для каждой уникальной категории
const categoryColorCache = {};
function getCategoryBadgeStyle(categoryName) {
  if (!categoryName) categoryName = 'Общее';
  if (categoryColorCache[categoryName]) return categoryColorCache[categoryName];

  // Хэш-функция для перевода строки в число
  let hash = 0;
  for (let i = 0; i < categoryName.length; i++) {
    hash = categoryName.charCodeAt(i) + ((hash << 5) - hash);
  }

  // Генерация мягкого пастельного цвета в HSL
  const hue = Math.abs(hash) % 360;
  const bgColor = `hsla(${hue}, 65%, 22%, 0.6)`;
  const borderColor = `hsla(${hue}, 65%, 45%, 0.8)`;
  const textColor = `hsl(${hue}, 80%, 75%)`;

  const styleString = `background: ${bgColor}; border-color: ${borderColor}; color: ${textColor};`;
  categoryColorCache[categoryName] = styleString;
  return styleString;
}

// Инициализация при загрузке
window.addEventListener('DOMContentLoaded', () => {
  setDateFilter('all');
  loadTenders();

  // Закрытие выпадающего окна категорий при клике вне его
  window.addEventListener('click', (e) => {
    const dropdown = document.getElementById('categoryDropdown');
    if (dropdown && !e.target.closest('.th-dropdown-container')) {
      dropdown.classList.remove('show');
    }
  });
});

// Полный обход системного лимита Supabase через постраничную выгрузку
async function loadTenders() {
  const log = document.getElementById('statusLog');
  log.innerText = '⏳ Загрузка базы данных...';

  let fetchedData = [];
  let from = 0;
  const step = 1000;
  let hasMore = true;

  try {
    while (hasMore) {
      const { data, error } = await supabaseClient
        .from('tenders')
        .select('*')
        .order('publish_date', { ascending: false })
        .range(from, from + step - 1);

      if (error) throw error;

      if (data && data.length > 0) {
        fetchedData = fetchedData.concat(data);
        from += step;
        if (data.length < step) {
          hasMore = false;
        }
      } else {
        hasMore = false;
      }
    }

    allTenders = fetchedData;
    initCategoriesFilterList();
    applyFilters();
  } catch (err) {
    log.innerText = '❌ Ошибка загрузки данных из Supabase: ' + err.message;
  }
}

// Инициализация списка чекбоксов категорий
function initCategoriesFilterList() {
  const catSet = new Set();
  allTenders.forEach(item => {
    catSet.add(item.category || 'Общее');
  });
  availableCategoriesList = Array.from(catSet).sort();

  // Изначально выбираем все категории
  selectedCategories = new Set(availableCategoriesList);

  const container = document.getElementById('categoryCheckboxesList');
  container.innerHTML = availableCategoriesList.map(cat => `
    <label class="category-checkbox-item">
      <input type="checkbox" value="${cat}" checked onchange="handleCategoryCheckboxChange(this)">
      <span class="category-badge" style="${getCategoryBadgeStyle(cat)}">${cat}</span>
    </label>
  `).join('');
}

// Открытие/закрытие выпадающего списка категорий
function toggleCategoryDropdown(event) {
  event.stopPropagation();
  const dropdown = document.getElementById('categoryDropdown');
  dropdown.classList.toggle('show');
}

// Обработка изменения чекбокса категории
function handleCategoryCheckboxChange(checkbox) {
  const cat = checkbox.value;
  if (checkbox.checked) {
    selectedCategories.add(cat);
  } else {
    selectedCategories.delete(cat);
  }
  applyFilters();
}

// Выбрать все / Сбросить в чекбоксах категорий
function selectAllCategories(select) {
  const checkboxes = document.querySelectorAll('#categoryCheckboxesList input[type="checkbox"]');
  checkboxes.forEach(cb => {
    cb.checked = select;
    if (select) {
      selectedCategories.add(cb.value);
    } else {
      selectedCategories.delete(cb.value);
    }
  });
  applyFilters();
}

// Настройка фильтров по датам
function setDateFilter(mode) {
  currentDateMode = mode;
  document.querySelectorAll('.tab').forEach(b => b.classList.remove('active'));

  if (mode === 'today') document.getElementById('tabToday').classList.add('active');
  if (mode === 'yesterday') document.getElementById('tabYesterday').classList.add('active');
  if (mode === 'all') document.getElementById('tabAll').classList.add('active');
  if (mode !== 'custom') document.getElementById('customDate').value = '';

  applyFilters();
}

// Сортировка данных по клику на заголовок
function sortData(column) {
  if (currentSortColumn === column) {
    currentSortDirection = currentSortDirection === 'asc' ? 'desc' : 'asc';
  } else {
    currentSortColumn = column;
    currentSortDirection = 'asc'; // по умолчанию при смене колонки — по возрастанию
  }
  applyFilters();
}

// Обновление иконок сортировки в шапке
function updateSortIcons() {
  document.querySelectorAll('.sort-icon').forEach(icon => {
    if (!icon.closest('th').classList.contains('th-dropdown-container')) {
      icon.innerText = '↕';
    }
  });
  const activeIcon = document.getElementById(`sort-${currentSortColumn}`);
  if (activeIcon) {
    activeIcon.innerText = currentSortDirection === 'asc' ? '▲' : '▼';
  }
}

// Применение фильтров, поиска и сортировки
function applyFilters() {
  updateSortIcons();

  const search = document.getElementById('searchInput').value.toLowerCase();
  const statusVal = document.getElementById('statusFilter').value;
  const customDateVal = document.getElementById('customDate').value;

  const todayStr = new Date().toISOString().split('T')[0];
  
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  const yesterdayStr = yesterday.toISOString().split('T')[0];

  let filtered = allTenders.filter(item => {
    // 1. Фильтр по дате
    if (currentDateMode === 'today' && item.publish_date !== todayStr) return false;
    if (currentDateMode === 'yesterday' && item.publish_date !== yesterdayStr) return false;
    if (currentDateMode === 'custom' && customDateVal && item.publish_date !== customDateVal) return false;

    // 2. Фильтр по статусу
    if (statusVal !== 'all' && (item.user_status || 'unprocessed') !== statusVal) return false;

    // 3. Мультифильтр по выбранным категориям
    const cat = item.category || 'Общее';
    if (!selectedCategories.has(cat)) return false;

    // 4. Поиск по тексту
    if (search) {
      const text = `${item.title} ${cat}`.toLowerCase();
      if (!text.includes(search)) return false;
    }

    return true;
  });

  // 5. Сортировка отфильтрованного массива
  filtered.sort((a, b) => {
    let valA = a[currentSortColumn] || '';
    let valB = b[currentSortColumn] || '';

    // Если сортируем по датам или строкам
    if (valA < valB) return currentSortDirection === 'asc' ? -1 : 1;
    if (valA > valB) return currentSortDirection === 'asc' ? 1 : -1;
    return 0;
  });

  // Динамический счетчик отображаемых тендеров
  const log = document.getElementById('statusLog');
  log.innerHTML = `✅ Отображается тендеров: <b>${filtered.length}</b> (всего в базе: ${allTenders.length})`;

  renderTable(filtered);
}

// Отрисовка таблицы
function renderTable(data) {
  const tbody = document.getElementById('tendersBody');
  if (data.length === 0) {
    tbody.innerHTML = `<tr><td colspan="6" style="text-align:center; padding: 30px; color: var(--muted);">Записи не найдены</td></tr>`;
    return;
  }

  const todayDate = new Date();
  todayDate.setHours(0,0,0,0);

  tbody.innerHTML = data.map(item => {
    let rowClass = '';
    if (item.user_status === 'target') rowClass = 'row-target';
    if (item.user_status === 'ignore') rowClass = 'row-ignore';

    // Обработка дедлайна (без переноса строки)
    let deadlineHtml = '—';
    if (item.deadline_date) {
      const dDate = new Date(item.deadline_date);
      dDate.setHours(0,0,0,0);
      const diffDays = Math.ceil((dDate - todayDate) / (1000 * 60 * 60 * 24));
      
      if (diffDays < 0) {
        deadlineHtml = `<span class="deadline-expired" title="Просрочено">${item.deadline_date}</span>`;
      } else if (diffDays <= 2) {
        deadlineHtml = `<span class="deadline-soon" title="Горит! Осталось дней: ${diffDays}">⚠️ ${item.deadline_date}</span>`;
      } else {
        deadlineHtml = `<span>${item.deadline_date}</span>`;
      }
    }

    const catName = item.category || 'Общее';
    // Извлечение времени из created_at или publish_date (если в базе есть время)
    let timeStr = '';
    if (item.created_at) {
      const timePart = item.created_at.split('T')[1];
      if (timePart) {
        timeStr = timePart.substring(0, 5); // ЧЧ:ММ
      }
    }

    return `
      <tr class="${rowClass}">
        <td>
          <span class="td-date-pub">${item.publish_date}</span>
          ${timeStr ? `<span class="td-time-pub">⏰ ${timeStr}</span>` : ''}
        </td>
        <td class="td-date-deadline">${deadlineHtml}</td>
        <td>
          <span class="category-badge" style="${getCategoryBadgeStyle(catName)}" title="${catName}">
            ${catName}
          </span>
        </td>
        <td class="td-title">${item.title}</td>
        <td>
          <select class="status-select ${item.user_status === 'target' ? 'status-target' : (item.user_status === 'ignore' ? 'status-ignore' : '')}" 
                  onchange="updateStatus('${item.id}', this.value)">
            <option value="unprocessed" ${!item.user_status || item.user_status === 'unprocessed' ? 'selected' : ''}>⏳ Рассмотреть</option>
            <option value="target" ${item.user_status === 'target' ? 'selected' : ''}>🎯 Целевой</option>
            <option value="ignore" ${item.user_status === 'ignore' ? 'selected' : ''}>❌ Нецелевой</option>
          </select>
        </td>
        <td><a href="${item.link}" target="_blank" class="link">Открыть ↗</a></td>
      </tr>
    `;
  }).join('');
}

// Изменение статуса тендера
async function updateStatus(id, newStatus) {
  const { error } = await supabaseClient
    .from('tenders')
    .update({ user_status: newStatus })
    .eq('id', id);

  if (error) {
    alert('Ошибка обновления статуса: ' + error.message);
  } else {
    const target = allTenders.find(x => x.id === id);
    if (target) target.user_status = newStatus;
    applyFilters();
  }
}

// Выгрузка в Excel с учетом фильтров
function exportToExcel() {
  const rows = allTenders.map(t => ({
    'Дата публикации': t.publish_date,
    'Время': t.created_at ? t.created_at.split('T')[1]?.substring(0, 5) || '' : '',
    'Дата окончания': t.deadline_date || '',
    'Категория': t.category || '',
    'Наименование': t.title,
    'Статус': t.user_status === 'target' ? 'Целевой' : (t.user_status === 'ignore' ? 'Нецелевой' : 'На рассмотрении'),
    'Ссылка': t.link
  }));

  const worksheet = XLSX.utils.json_to_sheet(rows);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, "Тендеры");
  XLSX.writeFile(workbook, `Tenders_Export_${new Date().toISOString().split('T')[0]}.xlsx`);
}

// Запуск парсера через GitHub API
async function triggerParsing() {
  let token = localStorage.getItem('gh_token');
  if (!token) {
    token = prompt('Введите ваш GitHub PAT token:');
    if (!token) return;
    localStorage.setItem('gh_token', token.trim());
  }

  const btn = document.getElementById('updateBtn');
  const log = document.getElementById('statusLog');
  btn.disabled = true;
  log.innerText = '🚀 Запуск парсера в GitHub Actions...';

  try {
    const res = await fetch(`https://api.github.com/repos/${GH_USER}/${GH_REPO}/actions/workflows/${WORKFLOW_ID}/dispatches`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ ref: 'main' })
    });

    if (!res.ok) throw new Error('Ошибка запуска Actions.');

    log.innerText = '⚙️ Парсер запущен. Проверяем новые тендеры в Supabase каждые 5 секунд...';
    
    let checks = 0;
    const interval = setInterval(async () => {
      checks++;
      await loadTenders();
      if (checks >= 12) {
        clearInterval(interval);
        btn.disabled = false;
        log.innerText = '✅ Синхронизация завершена.';
      }
    }, 5000);

  } catch (err) {
    alert(err.message);
    btn.disabled = false;
  }
}