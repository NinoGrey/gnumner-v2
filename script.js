// ====== КОНФИГУРАЦИЯ ======
const SUPABASE_URL = 'https://pkjrjtwlryuuconrpcnx.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_QfqhRHEjHYp_xA1nC_y7AQ__4pDx3-F';

const GH_USER = 'NinoGrey';
const GH_REPO = 'gnumner-v2';
const WORKFLOW_ID = 'tracker.yml';

const supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// ====== СОСТОЯНИЕ ======
let allTenders = [];
let currentDateMode = 'all';

let currentSortColumn = 'publish_date';
let currentSortDirection = 'desc'; 

let selectedCategories = new Set();
let availableCategoriesList = [];
const categoryColorCache = {};

// ====== ИНИЦИАЛИЗАЦИЯ ======
window.addEventListener('DOMContentLoaded', () => {
  lucide.createIcons();
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

// ====== ГЕНЕРАЦИЯ ЦВЕТОВ КАТЕГОРИЙ ======
function getCategoryBadgeStyle(categoryName) {
  if (!categoryName) categoryName = 'Общее';
  if (categoryColorCache[categoryName]) return categoryColorCache[categoryName];

  let hash = 0;
  for (let i = 0; i < categoryName.length; i++) {
    hash = categoryName.charCodeAt(i) + ((hash << 5) - hash);
  }

  const hue = Math.abs(hash) % 360;
  const bgColor = `hsla(${hue}, 65%, 22%, 0.6)`;
  const borderColor = `hsla(${hue}, 65%, 45%, 0.8)`;
  const textColor = `hsl(${hue}, 80%, 75%)`;

  const styleString = `background: ${bgColor}; border-color: ${borderColor}; color: ${textColor};`;
  categoryColorCache[categoryName] = styleString;
  return styleString;
}

// ====== ЗАГРУЗКА ИЗ SUPABASE ======
async function loadTenders() {
  const log = document.getElementById('statusLog');
  log.innerHTML = `<i data-lucide="loader-2" class="icon-sm" style="display:inline-block; vertical-align:middle; margin-right:4px; animation: spin 1s linear infinite;"></i> Загрузка базы данных...`;
  lucide.createIcons();

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
        .order('publish_time', { ascending: false })
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
    log.innerHTML = `<i data-lucide="alert-circle" class="icon-sm" style="color:var(--danger);"></i> Ошибка загрузки данных: ${err.message}`;
    lucide.createIcons();
  }
}

// ====== ФИЛЬТРЫ И СОРТИРОВКА ======
function initCategoriesFilterList() {
  const catSet = new Set();
  allTenders.forEach(item => {
    catSet.add(item.category || 'Общее');
  });
  availableCategoriesList = Array.from(catSet).sort();

  selectedCategories = new Set(availableCategoriesList);

  const container = document.getElementById('categoryCheckboxesList');
  container.innerHTML = availableCategoriesList.map(cat => `
    <label class="category-checkbox-item">
      <input type="checkbox" value="${cat}" checked onchange="handleCategoryCheckboxChange(this)">
      <span class="category-badge" style="${getCategoryBadgeStyle(cat)}">${cat}</span>
    </label>
  `).join('');
}

function toggleCategoryDropdown(event) {
  event.stopPropagation();
  document.getElementById('categoryDropdown').classList.toggle('show');
}

function handleCategoryCheckboxChange(checkbox) {
  const cat = checkbox.value;
  if (checkbox.checked) selectedCategories.add(cat);
  else selectedCategories.delete(cat);
  applyFilters();
}

function selectAllCategories(select) {
  const checkboxes = document.querySelectorAll('#categoryCheckboxesList input[type="checkbox"]');
  checkboxes.forEach(cb => {
    cb.checked = select;
    if (select) selectedCategories.add(cb.value);
    else selectedCategories.delete(cb.value);
  });
  applyFilters();
}

function setDateFilter(mode) {
  currentDateMode = mode;
  document.querySelectorAll('.tab').forEach(b => b.classList.remove('active'));

  if (mode === 'today') document.getElementById('tabToday').classList.add('active');
  if (mode === 'yesterday') document.getElementById('tabYesterday').classList.add('active');
  if (mode === 'all') document.getElementById('tabAll').classList.add('active');
  if (mode !== 'custom') document.getElementById('customDate').value = '';

  applyFilters();
}

function sortData(column) {
  if (currentSortColumn === column) {
    currentSortDirection = currentSortDirection === 'asc' ? 'desc' : 'asc';
  } else {
    currentSortColumn = column;
    currentSortDirection = 'asc'; 
  }
  applyFilters();
}

function updateSortIcons() {
  document.querySelectorAll('.sort-icon').forEach(icon => {
    if (icon.closest('th') && !icon.closest('th').classList.contains('th-dropdown-container')) {
      icon.setAttribute('data-lucide', 'arrow-up-down');
    }
  });
  
  const activeTh = document.querySelector(`th[onclick="sortData('${currentSortColumn}')"]`);
  if (activeTh) {
    const icon = activeTh.querySelector('.sort-icon');
    if (icon) {
      icon.setAttribute('data-lucide', currentSortDirection === 'asc' ? 'arrow-up' : 'arrow-down');
    }
  }
}

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
    if (currentDateMode === 'today' && item.publish_date !== todayStr) return false;
    if (currentDateMode === 'yesterday' && item.publish_date !== yesterdayStr) return false;
    if (currentDateMode === 'custom' && customDateVal && item.publish_date !== customDateVal) return false;

    if (statusVal !== 'all' && (item.user_status || 'unprocessed') !== statusVal) return false;

    const cat = item.category || 'Общее';
    if (!selectedCategories.has(cat)) return false;

    if (search) {
      const text = `${item.title} ${cat}`.toLowerCase();
      if (!text.includes(search)) return false;
    }
    return true;
  });

  filtered.sort((a, b) => {
    let valA, valB;

    if (currentSortColumn === 'publish_date') {
      valA = `${a.publish_date || ''} ${a.publish_time || '00:00:00'}`;
      valB = `${b.publish_date || ''} ${b.publish_time || '00:00:00'}`;
    } else if (currentSortColumn === 'deadline_date') {
      valA = `${a.deadline_date || ''} ${a.deadline_time || '00:00:00'}`;
      valB = `${b.deadline_date || ''} ${b.deadline_time || '00:00:00'}`;
    } else {
      valA = a[currentSortColumn] || '';
      valB = b[currentSortColumn] || '';
    }

    if (valA < valB) return currentSortDirection === 'asc' ? -1 : 1;
    if (valA > valB) return currentSortDirection === 'asc' ? 1 : -1;
    return 0;
  });

  const log = document.getElementById('statusLog');
  log.innerHTML = `<i data-lucide="check-circle-2" class="icon-sm" style="display:inline-block; vertical-align:middle; margin-right:4px; color: var(--success);"></i> Отображается тендеров: <b>${filtered.length}</b> (всего в базе: ${allTenders.length})`;

  renderTable(filtered);
}

// ====== РЕНДЕР ТАБЛИЦЫ ======
function renderTable(data) {
  const tbody = document.getElementById('tendersBody');
  if (data.length === 0) {
    tbody.innerHTML = `<tr><td colspan="6" style="text-align:center; padding: 30px; color: var(--muted);">Записи не найдены</td></tr>`;
    lucide.createIcons();
    return;
  }

  const todayDate = new Date();
  todayDate.setHours(0,0,0,0);

  tbody.innerHTML = data.map(item => {
    let rowClass = '';
    if (item.user_status === 'target') rowClass = 'row-target';
    if (item.user_status === 'ignore') rowClass = 'row-ignore';

    let deadlineClass = '';
    if (item.deadline_date) {
      const dDate = new Date(item.deadline_date);
      dDate.setHours(0,0,0,0);
      const diffDays = Math.ceil((dDate - todayDate) / (1000 * 60 * 60 * 24));
      
      if (diffDays < 0) deadlineClass = 'deadline-expired';
      else if (diffDays <= 2) deadlineClass = 'deadline-soon';
    }

    const catName = item.category || 'Общее';
    
    let pubTimeStr = item.publish_time || (item.created_at ? item.created_at.split('T')[1].substring(0, 5) : '--:--');
    let dlTimeStr = item.deadline_time || '--:--';

    return `
      <tr class="${rowClass}">
        <td>
          <div class="date-container">
            <span class="td-date">${item.publish_date}</span>
            <span class="td-time"><i data-lucide="clock" class="icon-sm"></i> ${pubTimeStr}</span>
          </div>
        </td>
        <td class="${deadlineClass}">
          <div class="date-container">
            <span class="td-date">${item.deadline_date || '—'}</span>
            <span class="td-time"><i data-lucide="clock" class="icon-sm"></i> ${dlTimeStr}</span>
          </div>
        </td>
        <td>
          <span class="category-badge" style="${getCategoryBadgeStyle(catName)}" title="${catName}">
            ${catName}
          </span>
        </td>
        <td class="td-title">${item.title}</td>
        <td>
          <select class="status-select status-${item.user_status || 'unprocessed'}" onchange="updateStatus('${item.id}', this.value)">
            <option value="unprocessed" ${!item.user_status || item.user_status === 'unprocessed' ? 'selected' : ''}>⏳ Рассмотреть</option>
            <option value="target" ${item.user_status === 'target' ? 'selected' : ''}>🎯 Целевой</option>
            <option value="ignore" ${item.user_status === 'ignore' ? 'selected' : ''}>❌ Нецелевой</option>
          </select>
        </td>
        <td>
          <a href="${item.link}" target="_blank" class="link">
            <i data-lucide="external-link" class="icon-sm"></i> Открыть
          </a>
        </td>
      </tr>
    `;
  }).join('');

  lucide.createIcons();
}

// ====== ОБНОВЛЕНИЕ СТАТУСА ======
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

// ====== ЭКСПОРТ И ПАРСИНГ ======
function exportToExcel() {
  const rows = allTenders.map(t => ({
    'Дата публикации': t.publish_date,
    'Время публикации': t.publish_time || (t.created_at ? t.created_at.split('T')[1]?.substring(0, 5) || '' : ''),
    'Дата окончания': t.deadline_date || '',
    'Время окончания': t.deadline_time || '',
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
  
  log.innerHTML = `<i data-lucide="rocket" class="icon-sm" style="display:inline-block; vertical-align:middle; margin-right:4px;"></i> Запуск парсера в GitHub Actions...`;
  lucide.createIcons();

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

    log.innerHTML = `<i data-lucide="settings" class="icon-sm" style="display:inline-block; vertical-align:middle; margin-right:4px; animation: spin 2s linear infinite;"></i> Парсер запущен. Проверяем новые тендеры...`;
    lucide.createIcons();
    
    let checks = 0;
    const interval = setInterval(async () => {
      checks++;
      await loadTenders();
      if (checks >= 12) {
        clearInterval(interval);
        btn.disabled = false;
        log.innerHTML = `<i data-lucide="check-circle-2" class="icon-sm" style="display:inline-block; vertical-align:middle; margin-right:4px; color: var(--success);"></i> Синхронизация завершена.`;
        lucide.createIcons();
      }
    }, 5000);

  } catch (err) {
    alert(err.message);
    btn.disabled = false;
  }
}