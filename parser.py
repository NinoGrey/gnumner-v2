import os
import re
import time
import hashlib
import urllib3
from datetime import datetime
from concurrent.futures import ThreadPoolExecutor, as_completed
import requests
from bs4 import BeautifulSoup

# Отключаем предупреждения об SSL
urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)

BASE_URL = "https://gnumner.minfin.am"

# Переменные окружения Supabase + авто-исправление протокола https://
SUPABASE_URL = os.environ.get("SUPABASE_URL", "").strip()
SUPABASE_KEY = os.environ.get("SUPABASE_KEY", "").strip()

if SUPABASE_URL and not SUPABASE_URL.startswith(("http://", "https://")):
    SUPABASE_URL = f"https://{SUPABASE_URL}"

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

MAX_PAGES_PER_SECTION = 1000
DELAY_BETWEEN_PAGES = 0.3


def generate_md5_id(link: str, pub_date: str) -> str:
    raw = f"{link}_{pub_date}"
    return hashlib.md5(raw.encode('utf-8')).hexdigest()


def clean_text(text: str) -> str:
    if not text:
        return ""
    return re.sub(r'\s+', ' ', text).strip()


def extract_dates_and_times(block) -> tuple[str | None, str | None, str | None, str | None]:
    """
    Извлекает даты и время публикации/завершения из блока тендера.
    Возвращает: (pub_date, pub_time, end_date, end_time)
    """
    time_elem = block.find('p', class_='tender_time')
    text = time_elem.get_text() if time_elem else block.get_text()

    # Ищем все совпадения формата YYYY-MM-DD и опционально HH:MM:SS (или HH:MM)
    datetime_matches = re.findall(r'(\d{4}-\d{2}-\d{2})(?:\s+(\d{2}:\d{2}(?::\d{2})?))?', text)

    pub_date, pub_time = None, None
    end_date, end_time = None, None

    if len(datetime_matches) >= 1:
        pub_date = datetime_matches[0][0]
        pub_time = datetime_matches[0][1] if datetime_matches[0][1] else None

    if len(datetime_matches) >= 2:
        end_date = datetime_matches[1][0]
        end_time = datetime_matches[1][1] if datetime_matches[1][1] else None

    # Дополнительный поиск времени с секундами, если оно записано отдельно
    if not pub_time:
        time_match = re.search(r'(\d{2}:\d{2}(?::\d{2})?)', text)
        if time_match:
            pub_time = time_match.group(1)

    # Нормализация нулевых дат
    if pub_date == "0000-00-00":
        pub_date = None
    if end_date == "0000-00-00":
        end_date = None

    return pub_date, pub_time, end_date, end_time


def get_latest_date_from_db(section_name: str) -> datetime | None:
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
        response = requests.get(endpoint, headers=headers, params=params, timeout=10)
        if response.status_code == 200:
            data = response.json()
            if data and len(data) > 0 and data[0].get("publish_date"):
                last_date_str = str(data[0]["publish_date"])[:10]
                return datetime.strptime(last_date_str, "%Y-%m-%d")
    except Exception as e:
        print(f"⚠️ Ошибка запроса последней даты для «{section_name}»: {e}")

    return None


def push_to_supabase(tenders: list) -> int:
    if not tenders or not SUPABASE_URL or not SUPABASE_KEY:
        return 0

    endpoint = f"{SUPABASE_URL.rstrip('/')}/rest/v1/tenders"
    headers = {
        "apikey": SUPABASE_KEY,
        "Authorization": f"Bearer {SUPABASE_KEY}",
        "Content-Type": "application/json",
        "Prefer": "resolution=merge-duplicates"
    }

    try:
        response = requests.post(endpoint, json=tenders, headers=headers, timeout=20)
        if response.status_code in [200, 201]:
            print(f"💾 Успешно обработано в Supabase: {len(tenders)} шт.")
            return len(tenders)
        else:
            print(f"❌ Ошибка Supabase API ({response.status_code}): {response.text}")
            return 0
    except Exception as e:
        print(f"❌ Ошибка соединения с Supabase: {e}")
        return 0


def fetch_with_retries(session: requests.Session, url: str, retries: int = 2) -> requests.Response | None:
    for attempt in range(1, retries + 1):
        try:
            response = session.get(url, headers=HEADERS, timeout=(3.05, 10), verify=False)
            if response.status_code == 404:
                return None
            response.raise_for_status()
            response.encoding = 'utf-8'
            return response
        except Exception:
            if attempt < retries:
                time.sleep(1)
    return None


def parse_section(section: dict) -> list[dict]:
    session = requests.Session()
    section_name = section["name"]
    start_url = section["url"]
    section_tenders = []

    page = 1
    while page <= MAX_PAGES_PER_SECTION:
        url = start_url if page == 1 else f"{start_url.rstrip('/')}/{page}"
        response = fetch_with_retries(session, url)
        if not response:
            break

        soup = BeautifulSoup(response.text, 'html.parser')
        tender_blocks = soup.find_all('div', class_='tender')
        if not tender_blocks:
            tender_blocks = soup.find_all('tr', class_=re.compile(r'(even|odd)'))

        if not tender_blocks:
            break

        added_on_page = 0

        for block in tender_blocks:
            link_elem = block.find('a', href=True)
            if not link_elem:
                continue

            href = link_elem['href'].strip()
            full_url = href if href.startswith('http') else f"{BASE_URL}{href}"
            title = clean_text(link_elem.get_text())

            if not title or len(title) < 3:
                continue

            pub_iso, pub_time, end_iso, end_time = extract_dates_and_times(block)

            # Игнорируем записи без корректной даты публикации
            if not pub_iso:
                continue

            cat_match = re.search(r'\[(.*?)\]', title)
            if cat_match:
                title = title.replace(cat_match.group(0), "").strip()

            tender_id = generate_md5_id(full_url, pub_iso)

            section_tenders.append({
                "id": tender_id,
                "title": title,
                "category": section_name,
                "publish_date": pub_iso,
                "publish_time": pub_time,
                "deadline_date": end_iso,
                "deadline_time": end_time,
                "link": full_url
            })
            added_on_page += 1

        if added_on_page == 0:
            break

        page += 1
        time.sleep(DELAY_BETWEEN_PAGES)

    print(f"✅ Раздел «{section_name}» готов (найдено для обновления/добавления: {len(section_tenders)})")
    return section_tenders


def main():
    start_time = time.time()
    print("🚀 Старт полного обновления тендеров в Supabase...")
    all_tenders = []

    with ThreadPoolExecutor(max_workers=5) as executor:
        futures = [executor.submit(parse_section, sec) for sec in SECTIONS]
        for future in as_completed(futures):
            try:
                tenders = future.result()
                all_tenders.extend(tenders)
            except Exception as e:
                print(f"❌ Ошибка в потоке: {e}")

    elapsed = round(time.time() - start_time, 2)
    print(f"\n📊 Все разделы сгружены за {elapsed} сек. Обработано записей: {len(all_tenders)}")

    if all_tenders:
        batch_size = 100
        total_pushed = 0
        for i in range(0, len(all_tenders), batch_size):
            batch = all_tenders[i:i + batch_size]

            # Удаляем дубликаты по 'id' внутри одного батча перед отправкой
            unique_batch = list({item["id"]: item for item in batch}.values())

            total_pushed += push_to_supabase(unique_batch)

        print(f"✨ Синхронизация завершена! Обновлено/добавлено записей: {total_pushed}")
    else:
        print("ℹ️ Тендеров для обработки не найдено.")


if __name__ == "__main__":
    main()