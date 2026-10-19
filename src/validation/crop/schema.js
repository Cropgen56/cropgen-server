import Joi from "joi";

const controlMethodsSchema = Joi.object({
  organic: Joi.object({
    preventive: Joi.array()
      .items(Joi.string().required())
      .min(1)
      .required()
      .messages({
        "array.base": "Organic preventive methods must be an array",
        "array.min": "At least one organic preventive method is required",
        "any.required": "Organic preventive methods are required",
      }),
    curative: Joi.array()
      .items(Joi.string().required())
      .min(1)
      .required()
      .messages({
        "array.base": "Organic curative methods must be an array",
        "array.min": "At least one organic curative method is required",
        "any.required": "Organic curative methods are required",
      }),
  }).required(),
  inorganic: Joi.object({
    preventive: Joi.array()
      .items(Joi.string().required())
      .min(1)
      .required()
      .messages({
        "array.base": "Inorganic preventive methods must be an array",
        "array.min": "At least one inorganic preventive method is required",
        "any.required": "Inorganic preventive methods are required",
      }),
    curative: Joi.array()
      .items(Joi.string().required())
      .min(1)
      .required()
      .messages({
        "array.base": "Inorganic curative methods must be an array",
        "array.min": "At least one inorganic curative method is required",
        "any.required": "Inorganic curative methods are required",
      }),
  }).required(),
});

export const cropValidationSchema = Joi.object({
  cropName: Joi.string().min(2).max(100).required().messages({
    "string.base": "Crop name must be text",
    "string.empty": "Crop name is required",
    "string.min": "Crop name must be at least 2 characters",
    "string.max": "Crop name cannot exceed 100 characters",
    "any.required": "Crop name is required",
  }),

  generalInfo: Joi.string().max(2000).required().messages({
    "string.empty": "General information is required",
    "string.max": "General information cannot exceed 2000 characters",
    "any.required": "General information is required",
  }),

  climate: Joi.object({
    temperature: Joi.string().required().messages({
      "string.empty": "Climate temperature is required",
    }),
    sowingTemperature: Joi.string().required().messages({
      "string.empty": "Sowing temperature is required",
    }),
    rainfall: Joi.string().required().messages({
      "string.empty": "Rainfall information is required",
    }),
    harvestingTemperature: Joi.string().required().messages({
      "string.empty": "Harvesting temperature is required",
    }),
  })
    .required()
    .messages({
      "object.base": "Climate must be an object",
      "any.required": "Climate details are required",
    }),

  soil: Joi.string().max(1000).required().messages({
    "string.empty": "Soil information is required",
    "string.max": "Soil information cannot exceed 1000 characters",
  }),

  variety: Joi.array()
    .items(
      Joi.object({
        name: Joi.string().max(100).required().messages({
          "string.empty": "Variety name is required",
          "string.max": "Variety name cannot exceed 100 characters",
        }),
        description: Joi.string().max(1000).required().messages({
          "string.empty": "Variety description is required",
          "string.max": "Variety description cannot exceed 1000 characters",
        }),
        plantHeight: Joi.string().required().messages({
          "string.empty": "Plant height is required",
        }),
        maturityDays: Joi.number().positive().required().messages({
          "number.base": "Maturity days must be a number",
          "number.positive": "Maturity days must be positive",
          "any.required": "Maturity days are required",
        }),
        yield: Joi.string().required().messages({
          "string.empty": "Yield information is required",
        }),
      })
    )
    .min(1)
    .required()
    .messages({
      "array.min": "At least one crop variety is required",
      "any.required": "Variety details are required",
    }),

  nursery: Joi.object({
    preparation: Joi.string().max(1000).allow(""),
    duration: Joi.string().max(100).allow(""),
    management: Joi.string().max(1000).allow(""),
  }),

  sowing: Joi.object({
    time: Joi.string().required().messages({
      "string.empty": "Sowing time is required",
    }),
    spacing: Joi.string().required().messages({
      "string.empty": "Sowing spacing is required",
    }),
    method: Joi.string().required().messages({
      "string.empty": "Sowing method is required",
    }),
    depth: Joi.string().required().messages({
      "string.empty": "Sowing depth is required",
    }),
    seedRate: Joi.string().required().messages({
      "string.empty": "Seed rate is required",
    }),
  })
    .required()
    .messages({
      "object.base": "Sowing must be an object",
      "any.required": "Sowing details are required",
    }),

  fertilizer: Joi.object({
    nutrients: Joi.object({
      nitrogen: Joi.string().required().messages({
        "string.empty": "Nitrogen requirement is required",
      }),
      phosphorus: Joi.string().required().messages({
        "string.empty": "Phosphorus requirement is required",
      }),
      potash: Joi.string().required().messages({
        "string.empty": "Potash requirement is required",
      }),
    }).required(),
    fertilizers: Joi.array()
      .items(
        Joi.object({
          name: Joi.string().max(100).required().messages({
            "string.empty": "Fertilizer name is required",
            "string.max": "Fertilizer name cannot exceed 100 characters",
          }),
          dosage: Joi.string().required().messages({
            "string.empty": "Fertilizer dosage is required",
          }),
        })
      )
      .min(1)
      .required()
      .messages({
        "array.min": "At least one fertilizer entry is required",
      }),
    applicationMethods: Joi.string().required().messages({
      "string.empty": "Fertilizer application methods are required",
    }),
    additionalNotes: Joi.string().max(1000).allow(""),
  })
    .required()
    .messages({
      "object.base": "Fertilizer must be an object",
      "any.required": "Fertilizer details are required",
    }),

  landPreparation: Joi.string().max(1000).required().messages({
    "string.empty": "Land preparation details are required",
    "string.max": "Land preparation cannot exceed 1000 characters",
  }),

  seed: Joi.object({
    seedRate: Joi.string().required().messages({
      "string.empty": "Seed rate is required",
    }),
    seedTreatment: Joi.object({
      method: Joi.string().required().messages({
        "string.empty": "Seed treatment method is required",
      }),
      chemicals: Joi.array()
        .items(
          Joi.object({
            name: Joi.string().max(100).required().messages({
              "string.empty": "Chemical name is required",
              "string.max": "Chemical name cannot exceed 100 characters",
            }),
            dosage: Joi.string().required().messages({
              "string.empty": "Chemical dosage is required",
            }),
          })
        )
        .required()
        .messages({
          "array.base": "Chemicals must be an array",
          "any.required": "Seed treatment chemicals are required",
        }),
    }).required(),
  })
    .required()
    .messages({
      "object.base": "Seed must be an object",
      "any.required": "Seed details are required",
    }),

  pestProtection: Joi.array()
    .items(
      Joi.object({
        pest: Joi.string().required().messages({
          "string.empty": "Pest name is required",
        }),
        symptoms: Joi.string().required().messages({
          "string.empty": "Pest symptoms are required",
        }),
        controlMethods: controlMethodsSchema,
        image: Joi.array()
          .items(
            Joi.string().uri().messages({
              "string.uri": "Pest image must be a valid URL",
            })
          )
          .optional(),
      })
    )
    .min(1)
    .required()
    .messages({
      "array.min": "At least one pest protection entry is required",
      "any.required": "Pest protection is required",
    }),

  diseaseProtection: Joi.array()
    .items(
      Joi.object({
        disease: Joi.string().required().messages({
          "string.empty": "Disease name is required",
        }),
        symptoms: Joi.string().required().messages({
          "string.empty": "Disease symptoms are required",
        }),
        controlMethods: controlMethodsSchema,
        image: Joi.array()
          .items(
            Joi.string().uri().messages({
              "string.uri": "Disease image must be a valid URL",
            })
          )
          .optional(),
      })
    )
    .min(1)
    .required()
    .messages({
      "array.min": "At least one disease protection entry is required",
      "any.required": "Disease protection is required",
    }),

  weedControl: Joi.string().max(1000).required().messages({
    "string.empty": "Weed control information is required",
  }),
  irrigation: Joi.string().max(1000).required().messages({
    "string.empty": "Irrigation details are required",
  }),
  harvesting: Joi.string().max(1000).required().messages({
    "string.empty": "Harvesting details are required",
  }),
  postHarvesting: Joi.string().max(1000).required().messages({
    "string.empty": "Post-harvesting details are required",
  }),
});
