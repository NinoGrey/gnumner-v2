import os
import re
import time
import hashlib
import urllib3
from datetime import datetime
import requests
from bs4 import BeautifulSoup

# Отключаем предупреждения об SSL
urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)

BASE_URL = "https://gnumner.minfin.am"

# Переменные окружения Supabase (из GitHub Secrets)
SUPABASE_URL = os.environ.get("SUPABASE_URL")
SUPABASE_KEY = os.environ.get("SUPABASE_KEY")

SECTIONS = [
    {"name": "Էլեկտրոնային աճուրդ", "url": f"{BASE_URL}/hy/page/elektronayin_achurdi_haytararutyun_ev_hraver"},
    {"name": "Բաց մրցույթ", "url": f"{BASE_URL}/hy/page/bac_mrcuyti_haytararutyun_ev_hraver"},
    {"name": "Գնանշման հարցում", "url": f"{BASE_URL}/hy/page/gnanshman_harcman_haytararutyun_ev_hraver"},
    {"name": "Երկփուլ մրցույթի նախաորակավորում", "url": f"{BASE_URL}/hy/page/erkpul_mrcuyti_nakhaorakavorman_haytararutyun"},
    {"name": "Բաց մրցույթի նախաորակավորում", "url": f"{BASE_URL}/hy/page/bac_mrcuyti_nakhaorakavorman_haytararutyun"},
    {"name": "Գնանշման հարցման նախաորակավորում", "url": f"{BASE_URL}/hy/page/gnanshman_harcman_nakhaorakavorman_haytararutyun"},
    {"name": "Փակ նպատակային մրցույթի նախաորակավորում", "url": f"{BASE_URL}/hy/page/_pak_npatakayin_mrcuyti_nakhaorakavorman_haytararutyun"},
    {"name": "Փակ պարբերական մրցույթի նախաորակավորում", "url": f"{BASE_URL}/hy/page/pak_parberakan_mrcuyti_nakhaorakavorman_haytararutyun_ev_hraver"},
    {"name": "Փակ պարբերական մրցույթի սկզբնական պայմանագրեր", "url": f"{BASE_URL}/hy/page/pak_parberakan_mrcuyti_ardyunqum_knqvats_skzbnakan_paymanagrer"}
]

HEADERS = {
    "User-Agent": "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    "Accept-Language": "hy,en-US;q=0.9,en;q=0.8,ru;q=0.7",
}

MAX_PAGES_PER_SECTION = 50
DELAY_BETWEEN_PAGES = 1.5


def generate_md5_id(link: str, pub_date: str) -> str:
    """Генерирует уникальный ID записи на основе ссылки и даты."""
    raw = f"{link}_{pub_date}"
    return hashlib.md5(raw.encode('utf-8')).hexdigest()


def clean_text(text: str) -> str:
    if not text:
        return ""
    return re.sub(r'\s+', ' ', text).strip()


def extract_dates(block) -> tuple[datetime | None, str | None, str | None]:
    time_elem = block.find('p', class_='tender_time')
    text = time_elem.get_text() if time_elem else block.get_text()

    raw_dates = re.findall(r'\b(\d{4}-\d{2}-\d{2})\b', text)

    pub_dt = None
    pub_iso = None
    end_iso = None

    if len(raw_dates) >= 1:
        try:
            pub_dt = datetime.strptime(raw_dates[0], "%Y-%m-%d")
            pub_iso = raw_dates[0]
        except ValueError:
            pub_dt = None

    if len(raw_dates) >= 2:
        try:
            datetime.strptime(raw_dates[1], "%Y-%m-%d")
            end_iso = raw_dates[1]
        except ValueError:
            end_iso = None

    return pub_dt, pub_iso, end_iso


def get_latest_date_from_db(section_name: str) -> datetime | None:
    """Запрашивает из Supabase самую последнюю дату публикации для конкретного раздела."""
    if not SUPABASE_URL or not SUPABASE_KEY:
        return None

    endpoint = f"{SUPABASE_URL.rstrip('/')}/rest/v1/tenders"
    headers = {
        "apikey": SUPABASE_KEY,
        "Authorization": f"Bearer {SUPABASE_KEY}"
    }
    params = {
        "select": "publish_date",
        "category": f"eq.{section_name}",
        "order": "publish_date.desc",
        "limit": 1
    }

    try:
        response = requests.get(endpoint, headers=headers, params=params, timeout=15)
        if response.status_code == 200:
            data = response.json()
            if data and len(data) > 0 and data[0].get("publish_date"):
                last_date_str = data[0]["publish_date"]
                return datetime.strptime(last_date_str, "%Y-%m-%d")
    except Exception as e:
        print(f"⚠️ Не удалось получить последнюю дату из БД для «{section_name}»: {e}")

    return None


def push_to_supabase(tenders: list) -> int:
    """Отправляет батч тендеров в Supabase REST API с игнорированием дубликатов."""
    if not tenders or not SUPABASE_URL or not SUPABASE_KEY:
        return 0

    endpoint = f"{SUPABASE_URL.rstrip('/')}/rest/v1/tenders"
    headers = {
        "apikey": SUPABASE_KEY,
        "Authorization": f"Bearer {SUPABASE_KEY}",
        "Content-Type": "application/json",
        "Prefer": "resolution=ignore-duplicates"
    }

    try:
        response = requests.post(endpoint, json=tenders, headers=headers, timeout=30)
        if response.status_code in [200, 201]:
            print(f"💾 Успешно отправлено в базу: {len(tenders)} тендеров.")
            return len(tenders)
        else:
            print(f"❌ Ошибка Supabase API ({response.status_code}): {response.text}")
            return 0
    except Exception as e:
        print(f"❌ Ошибка соединения с Supabase: {e}")
        return 0


def fetch_with_retries(session: requests.Session, url: str, retries: int = 3) -> requests.Response | None:
    for attempt in range(1, retries + 1):
        try:
            response = session.get(url, headers=HEADERS, timeout=20, verify=False)
            if response.status_code == 404:
                return None
            response.raise_for_status()
            response.encoding = 'utf-8'
            return response
        except Exception as e:
            print(f"⚠️ [Попытка {attempt}/{retries}] Сбой запроса: {e}")
            if attempt < retries:
                time.sleep(2 * attempt)
    return None


def parse_section(section: dict, session: requests.Session, collected_tenders: list):
    section_name = section["name"]
    start_url = section["url"]

    print(f"\n📂 === Раздел: {section_name} ===")
    
    # 1. Запрашиваем из Supabase последнюю дату для ЭТОГО раздела
    latest_db_dt = get_latest_date_from_db(section_name)
    if latest_db_dt:
        print(f"📌 Последняя запись в БД для раздела: {latest_db_dt.strftime('%Y-%m-%d')}")
    else:
        print("📌 В БД нет записей для этого раздела (сканируем с нуля).")

    page = 1
    added_in_section = 0

    while page <= MAX_PAGES_PER_SECTION:
        url = start_url if page == 1 else f"{start_url.rstrip('/')}/{page}"
        print(f"📡 [Стр. {page}] Загрузка: {url}")

        response = fetch_with_retries(session, url)
        if not response:
            break

        soup = BeautifulSoup(response.text, 'html.parser')

        tender_blocks = soup.find_all('div', class_='tender')
        if not tender_blocks:
            tender_blocks = soup.find_all('tr', class_=re.compile(r'(even|odd)'))

        if not tender_blocks:
            print("🏁 Блоки тендеров не найдены. Конец раздела.")
            break

        added_on_page = 0
        stop_section = False

        for block in tender_blocks:
            link_elem = block.find('a', href=True)
            if not link_elem:
                continue

            href = link_elem['href'].strip()
            full_url = href if href.startswith('http') else f"{BASE_URL}{href}"
            title = clean_text(link_elem.get_text())

            if not title or len(title) < 3:
                continue

            pub_dt, pub_iso, end_iso = extract_dates(block)

            # 2. Остановка парсинга: если дата тендера строго МЕНЬШЕ даты последней записи в базе
            if latest_db_dt and pub_dt and pub_dt < latest_db_dt:
                print(f"⏹ ОСТАНОВКА РАЗДЕЛА: Тендер от {pub_iso} старше даты в базе ({latest_db_dt.strftime('%Y-%m-%d')}).")
                stop_section = True
                break

            if not pub_iso:
                continue

            # Убираем теги из названия, но сохраняем категории
            cat_match = re.search(r'\[(.*?)\]', title)
            if cat_match:
                title = title.replace(cat_match.group(0), "").strip()

            tender_id = generate_md5_id(full_url, pub_iso)

            collected_tenders.append({
                "id": tender_id,
                "title": title,
                "category": section_name, # Привязываем к названию раздела для точной фильтрации
                "publish_date": pub_iso,
                "deadline_date": end_iso,
                "link": full_url
            })
            added_on_page += 1
            added_in_section += 1

        print(f"  └ Новых записей на странице: {added_on_page}")

        if stop_section or added_on_page == 0:
            break

        page += 1
        time.sleep(DELAY_BETWEEN_PAGES)

    print(f"✅ Раздел «{section_name}» обработан. Найдено записей: {added_in_section}.")


def main():
    print("🚀 Старт инкрементального парсинга по разделам...")
    session = requests.Session()
    all_tenders = []

    for section in SECTIONS:
        parse_section(section, session, all_tenders)

    print(f"\n📊 Всего новых тендеров к отправке: {len(all_tenders)}")

    if all_tenders:
        batch_size = 100
        total_pushed = 0
        for i in range(0, len(all_tenders), batch_size):
            batch = all_tenders[i:i + batch_size]
            total_pushed += push_to_supabase(batch)

        print(f"✨ Синхронизация завершена! Добавлено/обновлено: {total_pushed}")
    else:
        print("ℹ️ Новых тендеров во всех разделах не обнаружено.")


if __name__ == "__main__":
    main()
