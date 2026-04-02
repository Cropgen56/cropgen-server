// src/clients/timeseriesClient.js
import axios from "axios";

const CROPGEN_TS_BASE =
  process.env.CROPGEN_TS_BASE || "https://server.cropgenapp.com/v4/api";

export async function getVegetationTimeseries(
  geometry,
  startDate,
  endDate,
  index = "NDVI"
) {
  const url = `${CROPGEN_TS_BASE}/timeseries/vegetation/vegetation`;
  const body = {
    geometry,
    start_date: startDate,
    end_date: endDate,
    index: index.toLowerCase(),
    provider: "aws",
    satellite: "s2",
    max_items: 25,
  };
  const { data } = await axios.post(url, body, {
    headers: {
      accept: "application/json",
      "Content-Type": "application/json",
      "x-api-key": process.env.SATELLITE_API_KEY,
    },
  });
  return data;
}

export async function getWaterTimeseries(
  geometry,
  startDate,
  endDate,
  index = "NDMI"
) {
  const url = `${CROPGEN_TS_BASE}/timeseries/water/water`;
  const body = {
    geometry,
    start_date: startDate,
    end_date: endDate,
    index: index.toLowerCase(), 
    provider: "aws",
    satellite: "s2",
    max_items: 25,
  };
  const { data } = await axios.post(url, body, {
    headers: {
      accept: "application/json",
      "Content-Type": "application/json",
      "x-api-key": process.env.SATELLITE_API_KEY,
    },
  });
  return data;
}
