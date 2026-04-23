import axios from "axios";

const OBSERVEARTH_BASE = "https://observearth.com/api/weather";

export async function getCurrentWeather(geometryId) {
  const apiKey = process.env.OBSERVEARTH_API_KEY;
  const csrf = process.env.OBSERVEARTH_CSRF || "";

  if (!apiKey) {
    console.warn("[Observearth] OBSERVEARTH_API_KEY is missing");
  }

  const headers = {
    accept: "application/json",
    "x-api-key": apiKey,
  };
  if (csrf) headers["X-CSRFTOKEN"] = csrf;

  const url = `${OBSERVEARTH_BASE}/current/?geometry_id=${geometryId}`;
  const { data } = await axios.get(url, { headers });
  return data;
}

export async function getForecastWeather(geometryId) {
  const apiKey = process.env.OBSERVEARTH_API_KEY;
  const csrf = process.env.OBSERVEARTH_CSRF || "";

  const headers = {
    accept: "application/json",
    "x-api-key": apiKey,
  };
  if (csrf) headers["X-CSRFTOKEN"] = csrf;

  const url = `${OBSERVEARTH_BASE}/forecast/?geometry_id=${geometryId}`;
  const { data } = await axios.get(url, { headers });
  return data;
}

export async function getHistoricalWeather(geometryId, startDate, endDate) {
  const apiKey = process.env.OBSERVEARTH_API_KEY;
  const csrf = process.env.OBSERVEARTH_CSRF || "";

  const headers = {
    accept: "application/json",
    "x-api-key": apiKey,
  };
  if (csrf) headers["X-CSRFTOKEN"] = csrf;

  const url = `${OBSERVEARTH_BASE}/historical/?geometry_id=${geometryId}&start_date=${startDate}&end_date=${endDate}`;
  const { data } = await axios.get(url, { headers });
  return data;
}
