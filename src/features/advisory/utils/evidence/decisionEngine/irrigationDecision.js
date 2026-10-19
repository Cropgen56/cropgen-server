import { resolveIrrigationFamily } from "../../../../../constants/farmEnums.js";

export function getIrrigationDecision(evidence) {
  const irrigationReq = evidence?.irrigationRequirement ?? {};
  const irrigationType = evidence?.irrigationType ?? "";
  const family = resolveIrrigationFamily(irrigationType);

  const needsIrrigation = irrigationReq.needsIrrigation ?? false;
  const amountHours = irrigationReq.amountHours ?? 0;
  const amountMinutes = irrigationReq.amountMinutes ?? 0;
  const reason = irrigationReq.reason ?? "Check soil moisture.";
  const criticality = irrigationReq.criticality ?? "";

  if (!needsIrrigation) {
    return {
      shouldIrrigate: false,
      hint: {
        message:
          family === "rainfed"
            ? "Rainfed crop. No supplemental irrigation needed today."
            : reason,
        quantity: null,
        unit: null,
      },
    };
  }

  if (family === "rainfed") {
    const isDry = criticality === "CRITICAL" || criticality === "HIGH";
    if (!isDry) {
      return {
        shouldIrrigate: false,
        hint: {
          message: "Rainfed crop. Soil moisture is adequate — skip irrigation.",
          quantity: null,
          unit: null,
        },
      };
    }
    return {
      shouldIrrigate: true,
      hint: {
        message: `Rainfed field is dry. Give supplemental irrigation for ${amountHours} hours.`,
        quantity: amountHours,
        unit: "hours",
      },
    };
  }

  if (family === "flood") {
    return {
      shouldIrrigate: true,
      hint: {
        message: `Give ${irrigationType || "flood/surface"} irrigation for ${amountHours} hours.`,
        quantity: amountHours,
        unit: "hours",
      },
    };
  }

  const methodLabel =
    family === "sprinkler"
      ? "sprinkler/center pivot"
      : family === "drip"
        ? "drip/micro irrigation"
        : "irrigation";

  return {
    shouldIrrigate: true,
    hint: {
      message: `Run ${methodLabel} for ${amountMinutes} minutes.`,
      quantity: amountMinutes,
      unit: "minutes",
    },
  };
}
