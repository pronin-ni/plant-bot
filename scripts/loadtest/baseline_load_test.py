import json
import random
import statistics
import string
import threading
import time
import urllib.error
import urllib.parse
import urllib.request
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path

BASE_URL = 'http://127.0.0.1:8081'
CONCURRENCY = 50
DURATION_SECONDS = 20
SEED_PLANTS = 12
OUTPUT_PATH = Path('/Users/nikitapronin/projects/study/plant-bot/build/loadtest-baseline-report.json')

print_lock = threading.Lock()
seed_counter = 0


def request(method, path, payload=None, timeout=15):
    url = BASE_URL + path
    data = None
    headers = {'Content-Type': 'application/json'}
    if payload is not None:
        data = json.dumps(payload).encode('utf-8')
    req = urllib.request.Request(url, data=data, headers=headers, method=method)
    started = time.perf_counter()
    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            body = resp.read()
            elapsed = (time.perf_counter() - started) * 1000
            parsed = json.loads(body.decode('utf-8')) if body else None
            return {'ok': True, 'status': resp.status, 'latency_ms': elapsed, 'body': parsed}
    except urllib.error.HTTPError as e:
        elapsed = (time.perf_counter() - started) * 1000
        try:
            body = e.read().decode('utf-8')
        except Exception:
            body = ''
        return {'ok': False, 'status': e.code, 'latency_ms': elapsed, 'error': body}
    except Exception as e:
        elapsed = (time.perf_counter() - started) * 1000
        return {'ok': False, 'status': 0, 'latency_ms': elapsed, 'error': str(e)}


def percentile(values, p):
    if not values:
        return None
    values = sorted(values)
    k = (len(values) - 1) * (p / 100.0)
    f = int(k)
    c = min(f + 1, len(values) - 1)
    if f == c:
        return values[f]
    d0 = values[f] * (c - k)
    d1 = values[c] * (k - f)
    return d0 + d1


def record(result_list, item):
    result_list.append(item)


def auth_validate():
    return request('POST', '/api/auth/validate', {})


def get_plants():
    return request('GET', '/api/plants')


def get_plant(plant_id):
    return request('GET', f'/api/plants/{plant_id}')


def water_plant(plant_id):
    return request('PUT', f'/api/plants/{plant_id}/water', {})


def preview_outdoor_ornamental():
    return request('POST', '/api/watering/recommendation/preview', {
        'plantName': 'Петуния loadtest',
        'environmentType': 'OUTDOOR_ORNAMENTAL',
        'baseIntervalDays': 3,
        'containerType': 'CONTAINER',
        'containerVolume': 6,
        'sunExposure': 'FULL_SUN',
        'soilType': 'LOAMY',
        'city': 'Санкт-Петербург'
    })


def preview_outdoor_garden():
    return request('POST', '/api/watering/recommendation/preview', {
        'plantName': 'Томат loadtest',
        'environmentType': 'OUTDOOR_GARDEN',
        'baseIntervalDays': 2,
        'containerType': 'FLOWERBED',
        'growthStage': 'FRUITING',
        'greenhouse': True,
        'mulched': True,
        'dripIrrigation': True,
        'outdoorAreaM2': 1.2,
        'sunExposure': 'FULL_SUN',
        'soilType': 'SANDY',
        'city': 'Санкт-Петербург'
    })


def create_plant(name_suffix):
    return request('POST', '/api/plants', {
        'name': f'Load Test Plant {name_suffix}',
        'category': 'OUTDOOR_DECORATIVE',
        'environmentType': 'OUTDOOR_ORNAMENTAL',
        'wateringProfile': 'OUTDOOR_ORNAMENTAL',
        'placement': 'OUTDOOR',
        'type': 'DEFAULT',
        'city': 'Санкт-Петербург',
        'region': 'Санкт-Петербург',
        'containerType': 'CONTAINER',
        'containerVolumeLiters': 5,
        'baseIntervalDays': 3,
        'preferredWaterMl': 450,
        'potVolumeLiters': 5,
        'outdoorSoilType': 'LOAMY',
        'sunExposure': 'FULL_SUN',
        'mulched': False,
        'perennial': True,
        'winterDormancyEnabled': True,
        'recommendationSource': 'FALLBACK',
        'recommendationSummary': 'Load test create flow',
        'recommendationReasoningJson': '[]',
        'recommendationWarningsJson': '[]',
        'confidenceScore': 0.45
    })


def ensure_seed_data():
    auth_validate()
    current = get_plants()
    plants = current.get('body') or []
    missing = max(0, SEED_PLANTS - len(plants))
    for i in range(missing):
        create_plant(f'seed-{i}-{int(time.time())}')
    refreshed = get_plants()
    return refreshed.get('body') or []


def scenario_auth_burst():
    results = []
    with ThreadPoolExecutor(max_workers=CONCURRENCY) as pool:
        futures = [pool.submit(auth_validate) for _ in range(CONCURRENCY)]
        for f in as_completed(futures):
            record(results, f.result())
    return results


def scenario_browse(plants):
    ids = [p['id'] for p in plants[:max(1, min(10, len(plants)))]]
    results = []
    stop_at = time.time() + DURATION_SECONDS

    def worker(_):
        local = []
        while time.time() < stop_at:
            local.append(get_plants())
            if ids:
                local.append(get_plant(random.choice(ids)))
        return local

    with ThreadPoolExecutor(max_workers=CONCURRENCY) as pool:
        futures = [pool.submit(worker, i) for i in range(CONCURRENCY)]
        for f in as_completed(futures):
            results.extend(f.result())
    return results


def scenario_detail_water(plants):
    ids = [p['id'] for p in plants[:max(1, min(10, len(plants)))]]
    results = []
    stop_at = time.time() + DURATION_SECONDS

    def worker(_):
        local = []
        while time.time() < stop_at:
            pid = random.choice(ids)
            local.append(get_plant(pid))
            local.append(water_plant(pid))
        return local

    with ThreadPoolExecutor(max_workers=min(CONCURRENCY, len(ids) or 1)) as pool:
        futures = [pool.submit(worker, i) for i in range(CONCURRENCY)]
        for f in as_completed(futures):
            results.extend(f.result())
    return results


def scenario_add_wizard_like():
    results = []
    stop_at = time.time() + DURATION_SECONDS
    counter = 0
    counter_lock = threading.Lock()

    def worker(_):
        local = []
        nonlocal counter
        while time.time() < stop_at:
            local.append(preview_outdoor_ornamental())
            local.append(preview_outdoor_garden())
            with counter_lock:
                counter += 1
                suffix = counter
            local.append(create_plant(f'wizard-{suffix}-{int(time.time())}'))
        return local

    with ThreadPoolExecutor(max_workers=max(10, CONCURRENCY // 2)) as pool:
        futures = [pool.submit(worker, i) for i in range(max(10, CONCURRENCY // 2))]
        for f in as_completed(futures):
            results.extend(f.result())
    return results


def scenario_mixed(plants):
    ids = [p['id'] for p in plants[:max(1, min(10, len(plants)))]]
    results = []
    stop_at = time.time() + DURATION_SECONDS
    counter = 0
    counter_lock = threading.Lock()

    def worker(_):
        local = []
        nonlocal counter
        while time.time() < stop_at:
            roll = random.random()
            if roll < 0.20:
                local.append(auth_validate())
            elif roll < 0.50:
                local.append(get_plants())
            elif roll < 0.70 and ids:
                local.append(get_plant(random.choice(ids)))
            elif roll < 0.80 and ids:
                local.append(water_plant(random.choice(ids)))
            elif roll < 0.90:
                local.append(preview_outdoor_ornamental())
            else:
                with counter_lock:
                    counter += 1
                    suffix = counter
                local.append(create_plant(f'mixed-{suffix}-{int(time.time())}'))
        return local

    with ThreadPoolExecutor(max_workers=CONCURRENCY) as pool:
        futures = [pool.submit(worker, i) for i in range(CONCURRENCY)]
        for f in as_completed(futures):
            results.extend(f.result())
    return results


def summarize(name, results):
    lat = [r['latency_ms'] for r in results]
    errors = [r for r in results if not r['ok']]
    statuses = {}
    for r in results:
        statuses[str(r['status'])] = statuses.get(str(r['status']), 0) + 1
    return {
        'scenario': name,
        'requests': len(results),
        'errors': len(errors),
        'error_rate': round((len(errors) / len(results) * 100.0), 2) if results else 0.0,
        'p50_ms': round(percentile(lat, 50) or 0, 2),
        'p95_ms': round(percentile(lat, 95) or 0, 2),
        'p99_ms': round(percentile(lat, 99) or 0, 2),
        'avg_ms': round(statistics.mean(lat), 2) if lat else 0.0,
        'status_counts': statuses,
        'sample_errors': errors[:5],
    }


def main():
    plants = ensure_seed_data()
    report = {
        'base_url': BASE_URL,
        'concurrency': CONCURRENCY,
        'duration_seconds': DURATION_SECONDS,
        'seed_plants': len(plants),
        'started_at': time.strftime('%Y-%m-%d %H:%M:%S'),
        'results': []
    }
    scenarios = [
        ('auth_burst', scenario_auth_burst),
        ('browse', lambda: scenario_browse(plants)),
        ('detail_water', lambda: scenario_detail_water(plants)),
        ('add_wizard_like', scenario_add_wizard_like),
        ('mixed', lambda: scenario_mixed(plants)),
    ]
    for name, fn in scenarios:
        with print_lock:
            print(f'Running {name}...')
        results = fn()
        summary = summarize(name, results)
        report['results'].append(summary)
        with print_lock:
            print(json.dumps(summary, ensure_ascii=False, indent=2))
    OUTPUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    OUTPUT_PATH.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding='utf-8')
    print(f'Report written to {OUTPUT_PATH}')

if __name__ == '__main__':
    main()
