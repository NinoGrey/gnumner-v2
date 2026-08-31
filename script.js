// ====== КОНФИГУРАЦИЯ ======
const SUPABASE_URL = 'https://pkjrjtwlryuuconrpcnx.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_QfqhRHEjHYp_xA1nC_y7AQ__4pDx3-F';

const GH_USER = 'NinoGrey';
const GH_REPO = 'gnumner-v2';
const WORKFLOW_ID = 'tracker.yml';

const supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// ====== СОСТОЯНИЕ ======
let allTenders = [];
let filteredTenders = [];
let currentDateMode = 'all';

let currentSortColumn = 'publish_date';
let currentSortDirection = 'desc'; 

let selectedCategories = new Set();
let availableCategoriesList = [];

// ПАГИНАЦИЯ
let currentPage = 1;
const PAGE_SIZE = 100;

// ЦВЕТОВАЯ ПАЛИТРА КАТЕГОРИЙ
const CATEGORY_PALETTE = {
  'Էլեկտրոնային աճուրդ': { bg: 'rgba(14, 116, 144, 0.4)', border: '#06b6d4', color: '#67e8f9' },
  'Բաց մրցույթ': { bg: 'rgba(21, 128, 61, 0.4)', border: '#22c55e', color: '#86efac' },
  'Գնանշման հարցում': { bg: 'rgba(180, 83, 9, 0.4)', border: '#f59e0b', color: '#fde047' },
  'Երկփուլ մրցույթի նախաորակավորում': { bg: 'rgba(109, 40, 217, 0.4)', border: '#8b5cf6', color: '#ddd6fe' },
  'Բաց մրցույթի նախաորակավորում': { bg: 'rgba(13, 148, 136, 0.4)', border: '#14b8a6', color: '#99f6e4' },
  'Գնանշման հարցման նախաորակավորում': { bg: 'rgba(190, 24, 93, 0.4)', border: '#ec4899', color: '#fbcfe8' },
  'Փակ նպատակային մրցույթի նախաորակավորում': { bg: 'rgba(185, 28, 28, 0.4)', border: '#ef4444', color: '#fca5a5' },
  'Փակ պարբերական մրցույթի նախաորակավորում': { bg: 'rgba(161, 98, 7, 0.4)', border: '#eab308', color: '#fef08a' },
  'Փակ պարբերական մրցույթի սկզբնական պայմանագրեր': { bg: 'rgba(67, 56, 202, 0.4)', border: '#6366f1', color: '#c7d2fe' }
};
// ====== КЛЮЧЕВЫЕ СЛОВА ДЛЯ ПОДСВЕТКИ ======
const GREEN_KEYWORDS = ['համազգեստ']; // слова для зеленой подсветки
const RED_KEYWORDS = ['ԿԱՀՈՒՅՔ', 'ծառայություն', 'ՕԴՈՐԱԿԻՉ', 'ՀԱՄԱԿԱՐԳԻՉ','ՀԱՄԱԿԱՐԳՉԱՅԻՆ', 'պլանշետներ', 'վերկառուցուման','կենցաղային', 'աշխատանք', 'տեխնիկա', 'լուծում','կազմակերպման', 'բարեկարգման','սարքավորում','էլեկտրական','մեքենա', 'շինարարական', 'շինարար','Դեղորայք','պատվաստանյութ', 'ԿԱՆԱՉԱՊԱՏ','բարեկարգման','Համակարգիչ','վառելիք', 'քարթիրջներ', 'համակարգ','սարքերի', 'պահեստամասեր','ավտոմեքենա', 'լաբորատոր', 'պարագաներ', 'միջոցառում', 'փորձաքննութ', 'փաստաթղթեր', 'գործիք']; // слова для красной подсветки

function highlightKeywords(titleText) {
  if (!titleText) return '';
  
  let formattedText = titleText;

  // Функция для безопасной замены слов без учета регистра
  const replaceWords = (text, words, colorClass) => {
    words.forEach(word => {
      if (!word.trim()) return;
      const regex = new RegExp(`(${word.trim()})`, 'gi');
      formattedText = formattedText.replace(regex, `<span class="keyword-${colorClass}">$1</span>`);
    });
  };

  replaceWords(formattedText, GREEN_KEYWORDS, 'green');
  replaceWords(formattedText, RED_KEYWORDS, 'red');

  return formattedText;
}

// ====== ИНИЦИАЛИЗАЦИЯ ======
window.addEventListener('DOMContentLoaded', () => {
  lucide.createIcons();
  setDateFilter('all');
  loadTenders();

  window.addEventListener('click', (e) => {
    const dropdown = document.getElementById('categoryDropdown');
    if (dropdown && !e.target.closest('.th-dropdown-container')) {
      dropdown.classList.remove('show');
    }
  });
});

// ====== СТИЛИ КАТЕГОРИЙ ======
function getCategoryBadgeStyle(categoryName) {
  const cat = categoryName || 'Общее';
  const palette = CATEGORY_PALETTE[cat] || { bg: 'rgba(71, 85, 105, 0.4)', border: '#94a3b8', color: '#cbd5e1' };
  return `background: ${palette.bg}; border: 1px solid ${palette.border}; color: ${palette.color};`;
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
        if (data.length < step) hasMore = false;
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

// Быстрые фильтры даты (сбрасывают ручные диапазоны при желании, либо работают вместе)
function setDateFilter(mode) {
  currentDateMode = mode;
  document.querySelectorAll('.tab').forEach(b => b.classList.remove('active'));

  if (mode === 'today') document.getElementById('tabToday').classList.add('active');
  if (mode === 'yesterday') document.getElementById('tabYesterday').classList.add('active');
  if (mode === 'dayBefore') document.getElementById('tabDayBefore').classList.add('active');
  if (mode === 'all') document.getElementById('tabAll').classList.add('active');
  
  if (mode !== 'all') {
    // Очищаем ручные фильтры публикации при выборе быстрых пресетов
    const pubFrom = document.getElementById('pubDateFrom');
    const pubTo = document.getElementById('pubDateTo');
    if (pubFrom) pubFrom.value = '';
    if (pubTo) pubTo.value = '';
  }

  applyFilters();
}

function clearDateFilters() {
  document.getElementById('pubDateFrom').value = '';
  document.getElementById('pubDateTo').value = '';
  document.getElementById('deadlineDateFrom').value = '';
  document.getElementById('deadlineDateTo').value = '';
  setDateFilter('all');
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

// ====== ПРИМЕНЕНИЕ ФИЛЬТРОВ ======
function applyFilters() {
  updateSortIcons();

  const search = document.getElementById('searchInput').value.toLowerCase();
  const statusVal = document.getElementById('statusFilter').value;

  // Значения диапазона дат публикации
  const pubFrom = document.getElementById('pubDateFrom')?.value || '';
  const pubTo = document.getElementById('pubDateTo')?.value || '';

  // Значения диапазона дат дедлайна
  const dlFrom = document.getElementById('deadlineDateFrom')?.value || '';
  const dlTo = document.getElementById('deadlineDateTo')?.value || '';

  const today = new Date();
  const todayStr = today.toISOString().split('T')[0];
  
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);
  const yesterdayStr = yesterday.toISOString().split('T')[0];

  const dayBefore = new Date(today);
  dayBefore.setDate(today.getDate() - 2);
  const dayBeforeStr = dayBefore.toISOString().split('T')[0];

  filteredTenders = allTenders.filter(item => {
    // 1. Быстрые фильтры по дате публикации (если активны)
    if (currentDateMode === 'today' && item.publish_date !== todayStr) return false;
    if (currentDateMode === 'yesterday' && item.publish_date !== yesterdayStr) return false;
    if (currentDateMode === 'dayBefore' && item.publish_date !== dayBeforeStr) return false;

    // 2. Ручной диапазон даты публикации (С - По)
    if (pubFrom && item.publish_date < pubFrom) return false;
    if (pubTo && item.publish_date > pubTo) return false;

    // 3. Ручной диапазон даты завершения / дедлайна (С - По)
    if (dlFrom) {
      if (!item.deadline_date || item.deadline_date < dlFrom) return false;
    }
    if (dlTo) {
      if (!item.deadline_date || item.deadline_date > dlTo) return false;
    }

    // 4. Фильтр по статусу
    if (statusVal !== 'all' && (item.user_status || 'unprocessed') !== statusVal) return false;

    // 5. Фильтр по категориям
    const cat = item.category || 'Общее';
    if (!selectedCategories.has(cat)) return false;

    // 6. Текстовый поиск
    if (search) {
      const text = `${item.title} ${cat}`.toLowerCase();
      if (!text.includes(search)) return false;
    }
    return true;
  });

  filteredTenders.sort((a, b) => {
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
  log.innerHTML = `<i data-lucide="check-circle-2" class="icon-sm" style="display:inline-block; vertical-align:middle; margin-right:4px; color: var(--success);"></i> Отображается тендеров: <b>${filteredTenders.length}</b> (всего в базе: ${allTenders.length})`;

  renderCurrentPage();
}

// ====== РЕНДЕР ТАБЛИЦЫ И ПАГИНАЦИЯ ======
function renderCurrentPage() {
  const totalPages = Math.ceil(filteredTenders.length / PAGE_SIZE) || 1;
  if (currentPage > totalPages) currentPage = totalPages;
  if (currentPage < 1) currentPage = 1;

  const startIdx = (currentPage - 1) * PAGE_SIZE;
  const pageData = filteredTenders.slice(startIdx, startIdx + PAGE_SIZE);

  renderTable(pageData);
  renderPaginationControls(totalPages, startIdx, pageData.length);
}

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
    const currentStatus = item.user_status || 'unprocessed';

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
        <td class="td-title">${highlightKeywords(item.title)}</td>
        <td>
          <div class="status-segmented-control">
            <button class="status-seg-btn seg-ignore ${currentStatus === 'ignore' ? 'active' : ''}" onclick="updateStatus('${item.id}', 'ignore', this)" title="Нецелевой">
              <i data-lucide="x" class="icon-sm"></i>
            </button>
            <button class="status-seg-btn seg-unprocessed ${currentStatus === 'unprocessed' ? 'active' : ''}" onclick="updateStatus('${item.id}', 'unprocessed', this)" title="На рассмотрении">
              <i data-lucide="minus" class="icon-sm"></i>
            </button>
            <button class="status-seg-btn seg-target ${currentStatus === 'target' ? 'active' : ''}" onclick="updateStatus('${item.id}', 'target', this)" title="Целевой">
              <i data-lucide="check" class="icon-sm"></i>
            </button>
          </div>
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

function renderPaginationControls(totalPages, startIdx, countOnPage) {
  const tableContainer = document.querySelector('.table-container') || document.querySelector('table').parentNode;

  let topContainer = document.getElementById('paginationTop');
  if (!topContainer) {
    topContainer = document.createElement('div');
    topContainer.id = 'paginationTop';
    topContainer.className = 'pagination-container top-pagination';
    tableContainer.before(topContainer);
  }

  let bottomContainer = document.getElementById('paginationBottom');
  if (!bottomContainer) {
    bottomContainer = document.createElement('div');
    bottomContainer.id = 'paginationBottom';
    bottomContainer.className = 'pagination-container bottom-pagination';
    tableContainer.after(bottomContainer);
  }

  if (filteredTenders.length === 0) {
    topContainer.style.display = 'none';
    bottomContainer.style.display = 'none';
    return;
  }

  topContainer.style.display = 'flex';
  bottomContainer.style.display = 'flex';

  const endIdx = startIdx + countOnPage;
  const htmlContent = `
    <div class="pagination-info">
      Показаны <b>${startIdx + 1}–${endIdx}</b> из <b>${filteredTenders.length}</b>
    </div>
    <div class="pagination-controls">
      <button class="pagination-btn" onclick="changePage(1)" ${currentPage === 1 ? 'disabled' : ''}>« Первая</button>
      <button class="pagination-btn" onclick="changePage(${currentPage - 1})" ${currentPage === 1 ? 'disabled' : ''}>‹ Назад</button>
      
      <div class="pagination-page-wrapper">
        <input 
          type="number" 
          class="pagination-input" 
          value="${currentPage}" 
          min="1" 
          max="${totalPages}" 
          onkeydown="if(event.key==='Enter') jumpToPage(this.value, ${totalPages})"
          onchange="jumpToPage(this.value, ${totalPages})"
        />
        <span>/ ${totalPages}</span>
      </div>

      <button class="pagination-btn" onclick="changePage(${currentPage + 1})" ${currentPage === totalPages ? 'disabled' : ''}>Вперед ›</button>
      <button class="pagination-btn" onclick="changePage(${totalPages})" ${currentPage === totalPages ? 'disabled' : ''}>Последняя »</button>
    </div>
  `;

  topContainer.innerHTML = htmlContent;
  bottomContainer.innerHTML = htmlContent;
}

function jumpToPage(value, totalPages) {
  let page = parseInt(value, 10);
  if (isNaN(page)) page = 1;
  if (page < 1) page = 1;
  if (page > totalPages) page = totalPages;

  if (page !== currentPage) {
    changePage(page);
  } else {
    renderCurrentPage();
  }
}

function changePage(newPage) {
  currentPage = newPage;
  renderCurrentPage();
}

// ====== ОБНОВЛЕНИЕ СТАТУСА ======
async function updateStatus(id, newStatus, btnElement) {
  const { error } = await supabaseClient
    .from('tenders')
    .update({ user_status: newStatus })
    .eq('id', id);

  if (error) {
    alert('Ошибка обновления статуса: ' + error.message);
    return;
  }

  const target = allTenders.find(x => x.id === id);
  if (target) target.user_status = newStatus;

  const statusFilterVal = document.getElementById('statusFilter').value;
  if (statusFilterVal !== 'all' && statusFilterVal !== newStatus) {
    applyFilters();
    return;
  }

  if (btnElement) {
    const tr = btnElement.closest('tr');
    if (tr) {
      tr.className = '';
      if (newStatus === 'target') tr.classList.add('row-target');
      if (newStatus === 'ignore') tr.classList.add('row-ignore');

      const container = btnElement.closest('.status-segmented-control');
      if (container) {
        container.querySelectorAll('.status-seg-btn').forEach(btn => btn.classList.remove('active'));
        btnElement.classList.add('active');
      }
    }
  }
}

// ====== ЭКСПОРТ И ПАРСИНГ ======
function exportToExcel() {
  const rows = filteredTenders.map(t => ({
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