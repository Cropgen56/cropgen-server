/**
 * Build one daily weather series (past days + today + forecast) that every
 * rule reads. Accepts the raw Observearth historical payload and the
 * advisory `weatherSummary` (current + next7Days).
 */

const HIST_KEYS = {
  tmax: ["temp_max", "temperature_2m_max", "tmax", "max_temp"],
  tmin: ["temp_min", "temperature_2m_min", "tmin", "min_temp"],
  tmean: ["temp_mean", "temperature_2m_mean", "tmean", "temp"],
  rain: ["precipitation", "precipitation_sum", "rain", "rain_sum"],
  rh: ["relative_humidity", "relative_humidity_2m_mean", "humidity", "rh_mean"],
  wind: ["wind_speed", "wind_speed_10m_max", "windspeed"],
  gust: ["wind_gusts", "wind_gusts_10m_max"],
  et0: ["evapotranspiration", "et0_fao_evapotranspiration", "et0"],
};

function toNum(v) {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function pick(obj, keys, i) {
  for (const k of keys) {
    const arr = obj?.[k];
    if (Array.isArray(arr) && i < arr.length) {
      const n = toNum(arr[i]);
      if (n !== null) return n;
    }
  }
  return null;
}

function isoDay(d) {
  return String(d || "").slice(0, 10);
}

export function addDays(iso, days) {
  const d = new Date(`${iso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function fromDailyBlock(daily) {
  const times = Array.isArray(daily?.time) ? daily.time : [];
  return times.map((t, i) => {
    const tmax = pick(daily, HIST_KEYS.tmax, i);
    const tmin = pick(daily, HIST_KEYS.tmin, i);
    let tmean = pick(daily, HIST_KEYS.tmean, i);
    if (tmean === null && tmax !== null && tmin !== null) tmean = (tmax + tmin) / 2;
    return {
      date: isoDay(t),
      tmax,
      tmin,
      tmean,
      rain: pick(daily, HIST_KEYS.rain, i),
      rh: pick(daily, HIST_KEYS.rh, i),
      wind: pick(daily, HIST_KEYS.wind, i),
      gust: pick(daily, HIST_KEYS.gust, i),
      et0: pick(daily, HIST_KEYS.et0, i),
    };
  });
}

function fromNext7(next7) {
  const dates = Array.isArray(next7?.dates) ? next7.dates : [];
  return dates.map((t, i) => {
    const tmax = toNum(next7.tempMax?.[i]);
    const tmin = toNum(next7.tempMin?.[i]);
    let tmean = toNum(next7.tempMean?.[i]);
    if (tmean === null && tmax !== null && tmin !== null) tmean = (tmax + tmin) / 2;
    return {
      date: isoDay(t),
      tmax,
      tmin,
      tmean,
      rain: toNum(next7.rainfall?.[i]),
      rh: toNum(next7.humidity?.[i]),
      wind: toNum(next7.windSpeed?.[i]),
      gust: toNum(next7.windGusts?.[i]),
      et0: toNum(next7.et0?.[i]),
    };
  });
}

/**
 * @param {object} p
 * @param {object} [p.historical] raw historical payload ({ daily: {...} }) or already-built rows
 * @param {object} p.weatherSummary advisory weatherSummary
 * @param {string} p.todayISO YYYY-MM-DD
 * @returns {{ days: object[], todayIndex: number, current: object, hasPast: boolean }}
 */
export function buildDailySeries({ historical, weatherSummary, todayISO }) {
  const byDate = new Map();
  const pastRows = Array.isArray(historical)
    ? historical
    : fromDailyBlock(historical?.daily || historical?.data?.daily);
  for (const row of pastRows) {
    if (row.date && row.date < todayISO) byDate.set(row.date, { ...row, source: "observed" });
  }

  const forecastRows = fromNext7(weatherSummary?.next7Days);
  if (forecastRows.length && !forecastRows.some((r) => r.date === todayISO)) {
    // Forecast without matching dates: assume index 0 is today.
    forecastRows.forEach((r, i) => {
      r.date = addDays(todayISO, i);
    });
  }
  for (const row of forecastRows) {
    if (row.date >= todayISO) byDate.set(row.date, { ...row, source: "forecast" });
  }

  const days = [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date));
  let todayIndex = days.findIndex((d) => d.date === todayISO);
  if (todayIndex < 0) {
    days.push({ date: todayISO, tmax: null, tmin: null, tmean: null, rain: null, rh: null, wind: null, gust: null, et0: null, source: "missing" });
    days.sort((a, b) => a.date.localeCompare(b.date));
    todayIndex = days.findIndex((d) => d.date === todayISO);
  }

  const cur = weatherSummary?.current || {};
  const today = days[todayIndex];
  // Fill today's gaps from current conditions.
  if (today.rh === null) today.rh = toNum(cur.humidity);
  if (today.tmean === null) today.tmean = toNum(cur.temp);
  if (today.wind === null) today.wind = toNum(cur.windSpeed);
  if (today.et0 === null) today.et0 = toNum(cur.et0);

  return {
    days,
    todayIndex,
    hasPast: todayIndex > 0,
    current: {
      temp: toNum(cur.temp),
      humidity: toNum(cur.humidity),
      windSpeed: toNum(cur.windSpeed),
      et0: toNum(cur.et0),
      soilMoisture5: toNum(cur.soilMoisture_5cm),
      soilMoisture15: toNum(cur.soilMoisture_15cm),
    },
  };
}

/** Sum of a field over [from, to] day offsets relative to today (inclusive). */
export function sumField(series, field, from, to) {
  let sum = 0;
  for (let o = from; o <= to; o++) {
    const d = series.days[series.todayIndex + o];
    if (d && d[field] !== null && d[field] !== undefined) sum += d[field];
  }
  return sum;
}

export function dayAt(series, offset) {
  return series.days[series.todayIndex + offset] || null;
}

/** Consecutive past days (ending yesterday) with rain below 1 mm; null if no past data. */
export function daysWithoutRain(series) {
  if (!series.hasPast) return null;
  let n = 0;
  for (let i = series.todayIndex - 1; i >= 0; i--) {
    const r = series.days[i].rain;
    if (r === null) break;
    if (r >= 1) return n;
    n++;
  }
  return n;
}
