// Конфигурация Supabase
const SUPABASE_URL = 'https://pkjrjtwlryuuconrpcnx.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_QfqhRHEjHYp_xA1nC_y7AQ__4pDx3-F';

const GH_USER = 'NinoGrey';
const GH_REPO = 'gnumner-v2';
const WORKFLOW_ID = 'tracker.yml';

const supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

let allTenders = [];
let currentDateMode = 'all';

// Инициализация при загрузке
window.addEventListener('DOMContentLoaded', () => {
  setDateFilter('all');
  loadTenders();
});

// Полный обход системного лимита Supabase через постраничную выгрузку (Pagination Loop)
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
    applyFilters();
  } catch (err) {
    log.innerText = '❌ Ошибка загрузки данных из Supabase: ' + err.message;
  }
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

// Применение фильтров и динамический счетчик тендеров
function applyFilters() {
  const search = document.getElementById('searchInput').value.toLowerCase();
  const statusVal = document.getElementById('statusFilter').value;
  const customDateVal = document.getElementById('customDate').value;

  const todayStr = new Date().toISOString().split('T')[0];
  
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  const yesterdayStr = yesterday.toISOString().split('T')[0];

  const filtered = allTenders.filter(item => {
    // 1. Фильтр по дате
    if (currentDateMode === 'today' && item.publish_date !== todayStr) return false;
    if (currentDateMode === 'yesterday' && item.publish_date !== yesterdayStr) return false;
    if (currentDateMode === 'custom' && customDateVal && item.publish_date !== customDateVal) return false;

    // 2. Фильтр по статусу
    if (statusVal !== 'all' && (item.user_status || 'unprocessed') !== statusVal) return false;

    // 3. Поиск по тексту
    if (search) {
      const text = `${item.title} ${item.category || ''}`.toLowerCase();
      if (!text.includes(search)) return false;
    }

    return true;
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

  tbody.innerHTML = data.map(item => `
    <tr>
      <td><b>${item.publish_date}</b></td>
      <td>${item.deadline_date || '—'}</td>
      <td><span style="font-size:0.8rem; color: var(--muted);">${item.category || 'Общее'}</span></td>
      <td>${item.title}</td>
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
  `).join('');
}

// Изменение статуса тендера (Целевой / Нецелевой)
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
    const res = allTenders ? await fetch(`https://api.github.com/repos/${GH_USER}/${GH_REPO}/actions/workflows/${WORKFLOW_ID}/dispatches`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ ref: 'main' })
    }) : null;

    if (res && !res.ok) throw new Error('Ошибка запуска Actions.');

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