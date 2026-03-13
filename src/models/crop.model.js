import mongoose from "mongoose";
const { Schema } = mongoose;

const cropSchema = new Schema(
  {
    cropName: {
      type: String,
      required: [true, "Crop name is required"],
      trim: true,
      maxlength: [100, "Crop name cannot exceed 100 characters"],
      index: true,
      lowercase: true,
      unique: true,
    },
    cropImage: {
      type: String,
      required: [false, "Crop image URL is required"],
      trim: true,
      validate: {
        validator: (url) => /^https?:\/\//.test(url),
        message: "Invalid image URL format",
      },
    },
    generalInfo: {
      type: String,
      required: [true, "General information is required"],
      trim: true,
      maxlength: [2000, "General info cannot exceed 2000 characters"],
    },
    climate: {
      temperature: {
        type: String,
        required: [true, "Temperature range is required"],
        trim: true,
      },
      sowingTemperature: {
        type: String,
        required: [true, "Sowing temperature is required"],
        trim: true,
      },
      rainfall: {
        type: String,
        required: [true, "Rainfall information is required"],
        trim: true,
      },
      harvestingTemperature: {
        type: String,
        required: [true, "Harvesting temperature is required"],
        trim: true,
      },
    },
    soil: {
      type: String,
      required: [true, "Soil information is required"],
      trim: true,
      maxlength: [1000, "Soil info cannot exceed 1000 characters"],
    },
    variety: [
      {
        name: {
          type: String,
          required: [true, "Variety name is required"],
          trim: true,
          maxlength: [100, "Variety name cannot exceed 100 characters"],
        },
        description: {
          type: String,
          required: [true, "Variety description is required"],
          trim: true,
          maxlength: [1000, "Description cannot exceed 1000 characters"],
        },
        plantHeight: {
          type: String,
          required: [true, "Plant height is required"],
          trim: true,
        },
        maturityDays: {
          type: Number,
          required: [true, "Maturity days is required"],
          min: [1, "Maturity days must be positive"],
        },
        yield: {
          type: String,
          required: [true, "Yield information is required"],
          trim: true,
        },
        _id: false,
      },
    ],
    nursery: {
      preparation: {
        type: String,
        trim: true,
        maxlength: [1000, "Nursery preparation cannot exceed 1000 characters"],
      },
      duration: {
        type: String,
        trim: true,
        maxlength: [100, "Nursery duration cannot exceed 100 characters"],
      },
      management: {
        type: String,
        trim: true,
        maxlength: [1000, "Nursery management cannot exceed 1000 characters"],
      },
    },
    sowing: {
      time: {
        type: String,
        required: [true, "Sowing time is required"],
        trim: true,
      },
      spacing: {
        type: String,
        required: [true, "Spacing information is required"],
        trim: true,
      },
      method: {
        type: String,
        required: [true, "Sowing method is required"],
        trim: true,
      },
      depth: {
        type: String,
        required: [true, "Sowing depth is required"],
        trim: true,
      },
      seedRate: {
        type: String,
        required: [true, "Seed rate is required"],
        trim: true,
      },
    },
    fertilizer: {
      nutrients: {
        nitrogen: {
          type: String,
          required: [true, "Nitrogen requirement is required"],
          trim: true,
        },
        phosphorus: {
          type: String,
          required: [true, "Phosphorus requirement is required"],
          trim: true,
        },
        potash: {
          type: String,
          required: [true, "Potash requirement is required"],
          trim: true,
        },
      },
      fertilizers: [
        {
          name: {
            type: String,
            required: [true, "Fertilizer name is required"],
            trim: true,
            maxlength: [100, "Fertilizer name cannot exceed 100 characters"],
          },
          dosage: {
            type: String,
            required: [true, "Dosage is required"],
            trim: true,
          },
          _id: false,
        },
      ],
      applicationMethods: {
        type: String,
        required: [true, "Application methods are required"],
        trim: true,
      },
      additionalNotes: {
        type: String,
        trim: true,
        maxlength: [1000, "Additional notes cannot exceed 1000 characters"],
        default: "",
      },
    },
    landPreparation: {
      type: String,
      required: [true, "Land preparation details are required"],
      trim: true,
      maxlength: [1000, "Land preparation cannot exceed 1000 characters"],
    },
    seed: {
      seedRate: {
        type: String,
        required: [true, "Seed rate is required"],
        trim: true,
      },
      seedTreatment: {
        method: {
          type: String,
          required: [true, "Seed treatment method is required"],
          trim: true,
        },
        chemicals: [
          {
            name: {
              type: String,
              required: [true, "Chemical name is required"],
              trim: true,
              maxlength: [100, "Chemical name cannot exceed 100 characters"],
            },
            dosage: {
              type: String,
              required: [true, "Dosage is required"],
              trim: true,
            },
            _id: false,
          },
        ],
      },
    },
    pestProtection: [
      {
        image: [
          {
            type: String,
            required: [true, "Pest image URL is required"],
            trim: true,
            validate: {
              validator: (url) => /^https?:\/\//.test(url),
              message: "Invalid image URL format",
            },
          },
        ],
        pest: {
          type: String,
          required: [true, "Pest information is required"],
          trim: true,
        },
        symptoms: {
          type: String,
          required: [true, "Pest symptoms are required"],
          trim: true,
        },
        controlMethods: {
          organic: {
            preventive: [
              {
                type: String,
                required: true,
                trim: true,
              },
            ],
            curative: [
              {
                type: String,
                required: true,
                trim: true,
              },
            ],
          },
          inorganic: {
            preventive: [
              {
                type: String,
                required: true,
                trim: true,
              },
            ],
            curative: [
              {
                type: String,
                required: true,
                trim: true,
              },
            ],
          },
        },
      },
    ],
    diseaseProtection: [
      {
        image: [
          {
            type: String,
            required: [true, "Disease image URL is required"],
            trim: true,
            validate: {
              validator: (url) => /^https?:\/\//.test(url),
              message: "Invalid image URL format",
            },
          },
        ],
        disease: {
          type: String,
          required: [true, "Disease information is required"],
          trim: true,
        },
        symptoms: {
          type: String,
          required: [true, "Disease symptoms are required"],
          trim: true,
        },
        controlMethods: {
          organic: {
            preventive: [
              {
                type: String,
                required: true,
                trim: true,
              },
            ],
            curative: [
              {
                type: String,
                required: true,
                trim: true,
              },
            ],
          },
          inorganic: {
            preventive: [
              {
                type: String,
                required: true,
                trim: true,
              },
            ],
            curative: [
              {
                type: String,
                required: true,
                trim: true,
              },
            ],
          },
        },
        _id: false,
      },
    ],
    weedControl: {
      type: String,
      required: [true, "Weed control information is required"],
      trim: true,
      maxlength: [1000, "Weed control cannot exceed 1000 characters"],
    },
    irrigation: {
      type: String,
      required: [true, "Irrigation details are required"],
      trim: true,
      maxlength: [1000, "Irrigation details cannot exceed 1000 characters"],
    },
    harvesting: {
      type: String,
      required: [true, "Harvesting details are required"],
      trim: true,
      maxlength: [1000, "Harvesting details cannot exceed 1000 characters"],
    },
    postHarvesting: {
      type: String,
      required: [true, "Post-harvesting details are required"],
      trim: true,
      maxlength: [
        1000,
        "Post-harvesting details cannot exceed 1000 characters",
      ],
    },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
);

// Virtual field for variety count
cropSchema.virtual("varietyCount").get(function () {
  return this.variety.length;
});

// Compound index for efficient querying
cropSchema.index({ cropName: 1, "variety.name": 1 });
cropSchema.index({ createdAt: -1 });

// Input validation middleware
cropSchema.pre("save", function (next) {
  // Validate maturity days for all varieties
  if (this.variety.some((v) => v.maturityDays <= 0)) {
    return next(
      new Error("All variety maturity days must be positive numbers")
    );
  }

  // Normalize cropName to lowercase before saving
  if (this.cropName) {
    this.cropName = this.cropName.toLowerCase();
  }

  next();
});

// Prevent duplicate crop varieties
cropSchema.pre("save", async function (next) {
  if (this.isNew || this.isModified("variety")) {
    const existingCrop = await this.constructor.findOne({
      _id: { $ne: this._id },
      cropName: this.cropName,
      "variety.name": { $in: this.variety.map((v) => v.name) },
    });

    if (existingCrop) {
      return next(new Error("A variety of this crop already exists"));
    }
  }
  next();
});

// Error handling for validation
cropSchema.post("save", (error, doc, next) => {
  if (error.name === "ValidationError") {
    const errors = Object.values(error.errors).map((err) => err.message);
    next(new Error(`Validation failed: ${errors.join(", ")}`));
  } else if (error.code === 11000) {
    next(new Error("Crop name must be unique"));
  } else {
    next(error);
  }
});

// Create and export the Crop model
const Crop = mongoose.model("Crop", cropSchema);

export default Crop;
