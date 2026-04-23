export function getIrrigationDecision(evidence) {
  const irrigationReq = evidence?.irrigationRequirement ?? {};
  const irrigationType = evidence?.irrigationType ?? "";
  const isOpen = irrigationType?.toLowerCase?.().includes("open");

  const needsIrrigation = irrigationReq.needsIrrigation ?? false;
  const amountHours = irrigationReq.amountHours ?? 0;
  const amountMinutes = irrigationReq.amountMinutes ?? 0;
  const reason = irrigationReq.reason ?? "Check soil moisture.";

  if (!needsIrrigation) {
    return {
      shouldIrrigate: false,
      hint: {
        message: reason,
        quantity: null,
        unit: null,
      },
    };
  }

  if (isOpen) {
    return {
      shouldIrrigate: true,
      hint: {
        message: `Give open irrigation for ${amountHours} hours.`,
        quantity: amountHours,
        unit: "hours",
      },
    };
  }

  return {
    shouldIrrigate: true,
    hint: {
      message: `Run drip/sprinkler for ${amountMinutes} minutes.`,
      quantity: amountMinutes,
      unit: "minutes",
    },
  };
}
