import { generateSoilHealthReport } from "./soilHealth.service.js";
import { DEFAULT_ORGANIZATION_CODE } from "./soilHealth.constants.js";
import {
  FARMER_LANGUAGE_CODES,
  normalizeFarmerLanguage,
} from "../../utils/language/farmerLanguages.js";

function extractPolygonGeometry(input) {
  if (!input || typeof input !== "object") return null;

  // Accept direct GeoJSON Polygon (existing API contract).
  if (input.type === "Polygon") return input;

  // Accept GeoJSON Feature with Polygon geometry.
  if (input.type === "Feature" && input.geometry?.type === "Polygon") {
    return input.geometry;
  }

  if (input.type === "Feature" && input.geometry?.type === "MultiPolygon") {
    return input.geometry;
  }

  // Accept GeoJSON FeatureCollection and pick first Polygon feature.
  if (input.type === "FeatureCollection" && Array.isArray(input.features)) {
    const firstPolygonFeature = input.features.find(
      (f) => f?.geometry?.type === "Polygon",
    );
    if (firstPolygonFeature?.geometry) return firstPolygonFeature.geometry;

    const firstMulti = input.features.find(
      (f) => f?.geometry?.type === "MultiPolygon",
    );
    return firstMulti?.geometry || null;
  }

  if (input.type === "MultiPolygon") return input;

  return null;
}

function validateGeometry(geometry) {
  if (!geometry || typeof geometry !== "object") return false;
  if (geometry.type !== "Polygon" && geometry.type !== "MultiPolygon") return false;
  if (!Array.isArray(geometry.coordinates) || !geometry.coordinates.length) return false;
  return true;
}

function isIsoDate(value) {
  return /^\d{4}-\d{2}-\d{2}$/.test(String(value || ""));
}

export async function createSoilHealthReport(req, res) {
  try {
    const {
      geometry: geometryInput,
      startDate,
      endDate,
      currentCrop = "default",
      previousCrop = "default",
      organizationCode,
      language = "en",
    } = req.body || {};

    const geometry = extractPolygonGeometry(geometryInput);
    if (!validateGeometry(geometry)) {
      return res.status(400).json({
        success: false,
        message:
          "Invalid geometry. Send a GeoJSON Polygon, MultiPolygon, Feature, or FeatureCollection.",
      });
    }

    if (!startDate || !endDate) {
      return res.status(400).json({
        success: false,
        message: "startDate and endDate are required in YYYY-MM-DD format.",
      });
    }
    if (!isIsoDate(startDate) || !isIsoDate(endDate)) {
      return res.status(400).json({
        success: false,
        message: "Invalid date format. Use YYYY-MM-DD for startDate and endDate.",
      });
    }
    if (new Date(startDate) > new Date(endDate)) {
      return res.status(400).json({
        success: false,
        message: "startDate cannot be after endDate.",
      });
    }

    const rawLanguage = String(language || "en").toLowerCase();
    const languageBaseCode = rawLanguage.split(/[-_]/)[0];
    const normalizedLanguage = normalizeFarmerLanguage(languageBaseCode);
    const isExactSupported = FARMER_LANGUAGE_CODES.includes(rawLanguage);
    const isBaseSupported = FARMER_LANGUAGE_CODES.includes(languageBaseCode);
    if (language && !isExactSupported && !isBaseSupported) {
      return res.status(400).json({
        success: false,
        message: `Unsupported language code '${language}'. Supported codes: ${FARMER_LANGUAGE_CODES.join(", ")}`,
      });
    }

    const report = await generateSoilHealthReport({
      geometry,
      startDate,
      endDate,
      currentCrop,
      previousCrop,
      organizationCode: organizationCode || "",
      language: normalizedLanguage,
    });

    return res.status(200).json({
      success: true,
      message: "Soil health report generated successfully.",
      data: {
        organizationCode: String(organizationCode || DEFAULT_ORGANIZATION_CODE).toUpperCase(),
        ...report,
      },
    });
  } catch (error) {
    console.error("Error in createSoilHealthReport:", error);
    const status = Number(error?.statusCode) || 500;
    return res.status(status).json({
      success: false,
      message: error?.message || "Failed to generate soil health report.",
    });
  }
}
