
export const CROP_PROFILES = {
  wheat: {
    category: "cereal",
    totalNPK: { N: 120, P: 60, K: 40 },
    maturityBBCH: 90,
    stageSplit: {
      early: { N: 0.3, P: 0.5, K: 0.3 },
      vegetative: { N: 0.4, P: 0.3, K: 0.4 },
      reproductive: { N: 0.3, P: 0.2, K: 0.3 }
    },
    ndviExpected: {
      early: 0.4,
      vegetative: 0.55,
      reproductive: 0.75
    }
  },
  sugarcane: {
    category: "cereal",
    totalNPK: { N: 200, P: 80, K: 80 },
    maturityBBCH: 90,
    stageSplit: {
      early: { N: 0.3, P: 0.5, K: 0.3 },
      vegetative: { N: 0.4, P: 0.3, K: 0.4 },
      reproductive: { N: 0.3, P: 0.2, K: 0.3 }
    },
    ndviExpected: {
      early: 0.4,
      vegetative: 0.55,
      reproductive: 0.75
    }
  },
  rice: {
    category: "cereal",
    totalNPK: { N: 120, P: 60, K: 40 },
    maturityBBCH: 90,
    stageSplit: {
      early: { N: 0.2, P: 0.5, K: 0.3 },
      vegetative: { N: 0.5, P: 0.3, K: 0.4 },
      reproductive: { N: 0.3, P: 0.2, K: 0.3 }
    },
    ndviExpected: {
      early: 0.4,
      vegetative: 0.55,
      reproductive: 0.75
    }
  },
  soybean: {
    category: "oilseed",
    totalNPK: { N: 20, P: 80, K: 40 },
    maturityBBCH: 90,
    stageSplit: {
      early: { N: 0.5, P: 0.8, K: 0.5 },
      vegetative: { N: 0.5, P: 0.2, K: 0.5 },
      reproductive: { N: 0, P: 0, K: 0 }
    },
    ndviExpected: {
      early: 0.4,
      vegetative: 0.55,
      reproductive: 0.75
    }
  },
  corn: {
    category: "cereal",
    totalNPK: { N: 135, P: 62.5, K: 50 },
    maturityBBCH: 90,
    stageSplit: {
      early: { N: 0.3, P: 0.5, K: 0.3 },
      vegetative: { N: 0.4, P: 0.3, K: 0.4 },
      reproductive: { N: 0.3, P: 0.2, K: 0.3 }
    },
    ndviExpected: {
      early: 0.4,
      vegetative: 0.55,
      reproductive: 0.75
    }
  },
  cotton: {
    category: "oilseed",
    totalNPK: { N: 120, P: 60, K: 60 },
    maturityBBCH: 90,
    stageSplit: {
      early: { N: 0.5, P: 0.8, K: 0.5 },
      vegetative: { N: 0.5, P: 0.2, K: 0.5 },
      reproductive: { N: 0, P: 0, K: 0 }
    },
    ndviExpected: {
      early: 0.4,
      vegetative: 0.55,
      reproductive: 0.75
    }
  },
  groundnut: {
    category: "oilseed",
    totalNPK: { N: 25, P: 50, K: 75 },
    maturityBBCH: 90,
    stageSplit: {
      early: { N: 0.5, P: 0.8, K: 0.5 },
      vegetative: { N: 0.5, P: 0.2, K: 0.5 },
      reproductive: { N: 0, P: 0, K: 0 }
    },
    ndviExpected: {
      early: 0.4,
      vegetative: 0.55,
      reproductive: 0.75
    }
  },
  chickpea: {
    category: "pulse",
    totalNPK: { N: 20, P: 50, K: 10 },
    maturityBBCH: 90,
    stageSplit: {
      early: { N: 0.5, P: 0.8, K: 0.5 },
      vegetative: { N: 0.5, P: 0.2, K: 0.5 },
      reproductive: { N: 0, P: 0, K: 0 }
    },
    ndviExpected: {
      early: 0.4,
      vegetative: 0.5,
      reproductive: 0.7
    }
  },
  greengram: {
    category: "pulse",
    totalNPK: { N: 25, P: 50, K: 0 },
    maturityBBCH: 90,
    stageSplit: {
      early: { N: 0.5, P: 0.8, K: 0.5 },
      vegetative: { N: 0.5, P: 0.2, K: 0.5 },
      reproductive: { N: 0, P: 0, K: 0 }
    },
    ndviExpected: {
      early: 0.4,
      vegetative: 0.5,
      reproductive: 0.7
    }
  },
  kidneybeansrajma: {
    category: "pulse",
    totalNPK: { N: 100, P: 60, K: 20 },
    maturityBBCH: 90,
    stageSplit: {
      early: { N: 0.5, P: 0.8, K: 0.5 },
      vegetative: { N: 0.5, P: 0.2, K: 0.5 },
      reproductive: { N: 0, P: 0, K: 0 }
    },
    ndviExpected: {
      early: 0.4,
      vegetative: 0.5,
      reproductive: 0.7
    }
  },
  redgram: {
    category: "pulse",
    totalNPK: { N: 25, P: 50, K: 0 },
    maturityBBCH: 90,
    stageSplit: {
      early: { N: 0.5, P: 0.8, K: 0.5 },
      vegetative: { N: 0.5, P: 0.2, K: 0.5 },
      reproductive: { N: 0, P: 0, K: 0 }
    },
    ndviExpected: {
      early: 0.4,
      vegetative: 0.5,
      reproductive: 0.7
    }
  },
  grapes: {
    category: "fruit",
    totalNPK: { N: 500, P: 300, K: 600 },
    maturityBBCH: 85,
    stageSplit: {
      vegetative: { N: 0.4, P: 0.4, K: 0.4 },
      fruiting: { N: 0.4, P: 0.4, K: 0.6 }
    },
    ndviExpected: {
      vegetative: 0.55,
      fruiting: 0.65
    }
  },
  banana: {
    category: "fruit",
    totalNPK: { N: 150, P: 60, K: 300 },
    maturityBBCH: 85,
    stageSplit: {
      vegetative: { N: 0.4, P: 0.4, K: 0.4 },
      fruiting: { N: 0.4, P: 0.4, K: 0.6 }
    },
    ndviExpected: {
      vegetative: 0.55,
      fruiting: 0.65
    }
  },
  papaya: {
    category: "fruit",
    totalNPK: { N: 250, P: 250, K: 250 },
    maturityBBCH: 85,
    stageSplit: {
      vegetative: { N: 0.4, P: 0.4, K: 0.4 },
      fruiting: { N: 0.4, P: 0.4, K: 0.6 }
    },
    ndviExpected: {
      vegetative: 0.55,
      fruiting: 0.65
    }
  },
  guava: {
    category: "fruit",
    totalNPK: { N: 278, P: 278, K: 278 },
    maturityBBCH: 85,
    stageSplit: {
      vegetative: { N: 0.4, P: 0.4, K: 0.4 },
      fruiting: { N: 0.4, P: 0.4, K: 0.6 }
    },
    ndviExpected: {
      vegetative: 0.55,
      fruiting: 0.65
    }
  },
  pomegranate: {
    category: "fruit",
    totalNPK: { N: 240, P: 200, K: 480 },
    maturityBBCH: 85,
    stageSplit: {
      vegetative: { N: 0.4, P: 0.4, K: 0.4 },
      fruiting: { N: 0.4, P: 0.4, K: 0.6 }
    },
    ndviExpected: {
      vegetative: 0.55,
      fruiting: 0.65
    }
  },
  watermelon: {
    category: "fruit",
    totalNPK: { N: 100, P: 50, K: 50 },
    maturityBBCH: 85,
    stageSplit: {
      vegetative: { N: 0.4, P: 0.4, K: 0.4 },
      fruiting: { N: 0.4, P: 0.4, K: 0.6 }
    },
    ndviExpected: {
      vegetative: 0.55,
      fruiting: 0.65
    }
  },
  orange: {
    category: "fruit",
    totalNPK: { N: 300, P: 100, K: 150 },
    maturityBBCH: 85,
    stageSplit: {
      vegetative: { N: 0.4, P: 0.4, K: 0.4 },
      fruiting: { N: 0.4, P: 0.4, K: 0.6 }
    },
    ndviExpected: {
      vegetative: 0.55,
      fruiting: 0.65
    }
  },
  sapota: {
    category: "fruit",
    totalNPK: { N: 500, P: 500, K: 750 },
    maturityBBCH: 85,
    stageSplit: {
      vegetative: { N: 0.4, P: 0.4, K: 0.4 },
      fruiting: { N: 0.4, P: 0.4, K: 0.6 }
    },
    ndviExpected: {
      vegetative: 0.55,
      fruiting: 0.65
    }
  },
  mango: {
    category: "fruit",
    totalNPK: { N: 100, P: 100, K: 150 },
    maturityBBCH: 85,
    stageSplit: {
      vegetative: { N: 0.4, P: 0.4, K: 0.4 },
      fruiting: { N: 0.4, P: 0.4, K: 0.6 }
    },
    ndviExpected: {
      vegetative: 0.55,
      fruiting: 0.65
    }
  },
  muskmelon: {
    category: "fruit",
    totalNPK: { N: 100, P: 50, K: 50 },
    maturityBBCH: 85,
    stageSplit: {
      vegetative: { N: 0.4, P: 0.4, K: 0.4 },
      fruiting: { N: 0.4, P: 0.4, K: 0.6 }
    },
    ndviExpected: {
      vegetative: 0.55,
      fruiting: 0.65
    }
  },
  fig: {
    category: "fruit",
    totalNPK: { N: 200, P: 100, K: 200 },
    maturityBBCH: 85,
    stageSplit: {
      vegetative: { N: 0.4, P: 0.4, K: 0.4 },
      fruiting: { N: 0.4, P: 0.4, K: 0.6 }
    },
    ndviExpected: {
      vegetative: 0.55,
      fruiting: 0.65
    }
  },
  coriander: {
    category: "vegetable",
    totalNPK: { N: 10, P: 40, K: 20 },
    maturityBBCH: 90,
    stageSplit: {
      vegetative: { N: 0.5, P: 0.8, K: 0.5 },
      reproductive: { N: 0.5, P: 0.2, K: 0.5 }
    },
    ndviExpected: {
      vegetative: 0.55,
      reproductive: 0.75
    }
  },
  turmeric: {
    category: "vegetable",
    totalNPK: { N: 60, P: 60, K: 108 },
    maturityBBCH: 90,
    stageSplit: {
      vegetative: { N: 0.5, P: 0.8, K: 0.5 },
      reproductive: { N: 0.5, P: 0.2, K: 0.5 }
    },
    ndviExpected: {
      vegetative: 0.55,
      reproductive: 0.75
    }
  },
  ginger: {
    category: "vegetable",
    totalNPK: { N: 75, P: 50, K: 50 },
    maturityBBCH: 90,
    stageSplit: {
      vegetative: { N: 0.5, P: 0.8, K: 0.5 },
      reproductive: { N: 0.5, P: 0.2, K: 0.5 }
    },
    ndviExpected: {
      vegetative: 0.55,
      reproductive: 0.75
    }
  },
  ashgourd: {
    category: "vegetable",
    totalNPK: { N: 100, P: 50, K: 50 },
    maturityBBCH: 90,
    stageSplit: {
      vegetative: { N: 0.5, P: 0.8, K: 0.5 },
      reproductive: { N: 0.5, P: 0.2, K: 0.5 }
    },
    ndviExpected: {
      vegetative: 0.55,
      reproductive: 0.75
    }
  },
  beetroot: {
    category: "vegetable",
    totalNPK: { N: 80, P: 40, K: 40 },
    maturityBBCH: 90,
    stageSplit: {
      vegetative: { N: 0.5, P: 0.8, K: 0.5 },
      reproductive: { N: 0.5, P: 0.2, K: 0.5 }
    },
    ndviExpected: {
      vegetative: 0.55,
      reproductive: 0.75
    }
  },
  bittergourd: {
    category: "vegetable",
    totalNPK: { N: 70, P: 25, K: 25 },
    maturityBBCH: 90,
    stageSplit: {
      vegetative: { N: 0.5, P: 0.8, K: 0.5 },
      reproductive: { N: 0.5, P: 0.2, K: 0.5 }
    },
    ndviExpected: {
      vegetative: 0.55,
      reproductive: 0.75
    }
  },
  bottlegourd: {
    category: "vegetable",
    totalNPK: { N: 100, P: 50, K: 50 },
    maturityBBCH: 90,
    stageSplit: {
      vegetative: { N: 0.5, P: 0.8, K: 0.5 },
      reproductive: { N: 0.5, P: 0.2, K: 0.5 }
    },
    ndviExpected: {
      vegetative: 0.55,
      reproductive: 0.75
    }
  },
  brinjal: {
    category: "vegetable",
    totalNPK: { N: 100, P: 50, K: 50 },
    maturityBBCH: 90,
    stageSplit: {
      vegetative: { N: 0.5, P: 0.8, K: 0.5 },
      reproductive: { N: 0.5, P: 0.2, K: 0.5 }
    },
    ndviExpected: {
      vegetative: 0.55,
      reproductive: 0.75
    }
  },
  broccoli: {
    category: "vegetable",
    totalNPK: { N: 120, P: 60, K: 60 },
    maturityBBCH: 90,
    stageSplit: {
      vegetative: { N: 0.5, P: 0.8, K: 0.5 },
      reproductive: { N: 0.5, P: 0.2, K: 0.5 }
    },
    ndviExpected: {
      vegetative: 0.55,
      reproductive: 0.75
    }
  },
  cabbage: {
    category: "vegetable",
    totalNPK: { N: 120, P: 60, K: 60 },
    maturityBBCH: 90,
    stageSplit: {
      vegetative: { N: 0.5, P: 0.8, K: 0.5 },
      reproductive: { N: 0.5, P: 0.2, K: 0.5 }
    },
    ndviExpected: {
      vegetative: 0.55,
      reproductive: 0.75
    }
  },
  capsicum: {
    category: "vegetable",
    totalNPK: { N: 120, P: 60, K: 60 },
    maturityBBCH: 90,
    stageSplit: {
      vegetative: { N: 0.5, P: 0.8, K: 0.5 },
      reproductive: { N: 0.5, P: 0.2, K: 0.5 }
    },
    ndviExpected: {
      vegetative: 0.55,
      reproductive: 0.75
    }
  },
  carrot: {
    category: "vegetable",
    totalNPK: { N: 80, P: 40, K: 40 },
    maturityBBCH: 90,
    stageSplit: {
      vegetative: { N: 0.5, P: 0.8, K: 0.5 },
      reproductive: { N: 0.5, P: 0.2, K: 0.5 }
    },
    ndviExpected: {
      vegetative: 0.55,
      reproductive: 0.75
    }
  },
  cauliflower: {
    category: "vegetable",
    totalNPK: { N: 120, P: 60, K: 60 },
    maturityBBCH: 90,
    stageSplit: {
      vegetative: { N: 0.5, P: 0.8, K: 0.5 },
      reproductive: { N: 0.5, P: 0.2, K: 0.5 }
    },
    ndviExpected: {
      vegetative: 0.55,
      reproductive: 0.75
    }
  },
  celery: {
    category: "vegetable",
    totalNPK: { N: 100, P: 50, K: 50 },
    maturityBBCH: 90,
    stageSplit: {
      vegetative: { N: 0.5, P: 0.8, K: 0.5 },
      reproductive: { N: 0.5, P: 0.2, K: 0.5 }
    },
    ndviExpected: {
      vegetative: 0.55,
      reproductive: 0.75
    }
  },
  cucumber: {
    category: "vegetable",
    totalNPK: { N: 60, P: 30, K: 30 },
    maturityBBCH: 90,
    stageSplit: {
      vegetative: { N: 0.5, P: 0.8, K: 0.5 },
      reproductive: { N: 0.5, P: 0.2, K: 0.5 }
    },
    ndviExpected: {
      vegetative: 0.55,
      reproductive: 0.75
    }
  },
  garlic: {
    category: "vegetable",
    totalNPK: { N: 50, P: 50, K: 50 },
    maturityBBCH: 90,
    stageSplit: {
      vegetative: { N: 0.5, P: 0.8, K: 0.5 },
      reproductive: { N: 0.5, P: 0.2, K: 0.5 }
    },
    ndviExpected: {
      vegetative: 0.55,
      reproductive: 0.75
    }
  },
  onion: {
    category: "vegetable",
    totalNPK: { N: 60, P: 40, K: 40 },
    maturityBBCH: 90,
    stageSplit: {
      vegetative: { N: 0.5, P: 0.8, K: 0.5 },
      reproductive: { N: 0.5, P: 0.2, K: 0.5 }
    },
    ndviExpected: {
      vegetative: 0.55,
      reproductive: 0.75
    }
  },
  lettuce: {
    category: "vegetable",
    totalNPK: { N: 100, P: 50, K: 50 },
    maturityBBCH: 90,
    stageSplit: {
      vegetative: { N: 0.5, P: 0.8, K: 0.5 },
      reproductive: { N: 0.5, P: 0.2, K: 0.5 }
    },
    ndviExpected: {
      vegetative: 0.55,
      reproductive: 0.75
    }
  },
  longmelon: {
    category: "vegetable",
    totalNPK: { N: 100, P: 50, K: 50 },
    maturityBBCH: 90,
    stageSplit: {
      vegetative: { N: 0.5, P: 0.8, K: 0.5 },
      reproductive: { N: 0.5, P: 0.2, K: 0.5 }
    },
    ndviExpected: {
      vegetative: 0.55,
      reproductive: 0.75
    }
  },
  mushroom: {
    category: "vegetable",
    totalNPK: { N: 0, P: 0, K: 0 }, // No typical NPK for mushroom
    maturityBBCH: 90,
    stageSplit: {
      vegetative: { N: 0, P: 0, K: 0 },
      reproductive: { N: 0, P: 0, K: 0 }
    },
    ndviExpected: {
      vegetative: 0.55,
      reproductive: 0.75
    }
  },
  okra: {
    category: "vegetable",
    totalNPK: { N: 110, P: 35, K: 70 },
    maturityBBCH: 90,
    stageSplit: {
      vegetative: { N: 0.5, P: 0.8, K: 0.5 },
      reproductive: { N: 0.5, P: 0.2, K: 0.5 }
    },
    ndviExpected: {
      vegetative: 0.55,
      reproductive: 0.75
    }
  },
  greenpeas: {
    category: "pulse",
    totalNPK: { N: 20, P: 40, K: 20 },
    maturityBBCH: 90,
    stageSplit: {
      early: { N: 0.5, P: 0.8, K: 0.5 },
      vegetative: { N: 0.5, P: 0.2, K: 0.5 },
      reproductive: { N: 0, P: 0, K: 0 }
    },
    ndviExpected: {
      early: 0.4,
      vegetative: 0.5,
      reproductive: 0.7
    }
  },
  potato: {
    category: "vegetable",
    totalNPK: { N: 120, P: 60, K: 60 },
    maturityBBCH: 90,
    stageSplit: {
      vegetative: { N: 0.5, P: 0.8, K: 0.5 },
      reproductive: { N: 0.5, P: 0.2, K: 0.5 }
    },
    ndviExpected: {
      vegetative: 0.55,
      reproductive: 0.75
    }
  },
  pumpkin: {
    category: "vegetable",
    totalNPK: { N: 60, P: 30, K: 30 },
    maturityBBCH: 90,
    stageSplit: {
      vegetative: { N: 0.5, P: 0.8, K: 0.5 },
      reproductive: { N: 0.5, P: 0.2, K: 0.5 }
    },
    ndviExpected: {
      vegetative: 0.55,
      reproductive: 0.75
    }
  },
  radish: {
    category: "vegetable",
    totalNPK: { N: 50, P: 25, K: 25 },
    maturityBBCH: 90,
    stageSplit: {
      vegetative: { N: 0.5, P: 0.8, K: 0.5 },
      reproductive: { N: 0.5, P: 0.2, K: 0.5 }
    },
    ndviExpected: {
      vegetative: 0.55,
      reproductive: 0.75
    }
  },
  spinach: {
    category: "vegetable",
    totalNPK: { N: 60, P: 30, K: 30 },
    maturityBBCH: 90,
    stageSplit: {
      vegetative: { N: 0.5, P: 0.8, K: 0.5 },
      reproductive: { N: 0.5, P: 0.2, K: 0.5 }
    },
    ndviExpected: {
      vegetative: 0.55,
      reproductive: 0.75
    }
  },
  spongegourd: {
    category: "vegetable",
    totalNPK: { N: 100, P: 50, K: 50 },
    maturityBBCH: 90,
    stageSplit: {
      vegetative: { N: 0.5, P: 0.8, K: 0.5 },
      reproductive: { N: 0.5, P: 0.2, K: 0.5 }
    },
    ndviExpected: {
      vegetative: 0.55,
      reproductive: 0.75
    }
  },
  squashmelon: {
    category: "vegetable",
    totalNPK: { N: 60, P: 30, K: 30 },
    maturityBBCH: 90,
    stageSplit: {
      vegetative: { N: 0.5, P: 0.8, K: 0.5 },
      reproductive: { N: 0.5, P: 0.2, K: 0.5 }
    },
    ndviExpected: {
      vegetative: 0.55,
      reproductive: 0.75
    }
  },
  summersquash: {
    category: "vegetable",
    totalNPK: { N: 60, P: 30, K: 30 },
    maturityBBCH: 90,
    stageSplit: {
      vegetative: { N: 0.5, P: 0.8, K: 0.5 },
      reproductive: { N: 0.5, P: 0.2, K: 0.5 }
    },
    ndviExpected: {
      vegetative: 0.55,
      reproductive: 0.75
    }
  },
  sweetpotato: {
    category: "vegetable",
    totalNPK: { N: 75, P: 50, K: 75 },
    maturityBBCH: 90,
    stageSplit: {
      vegetative: { N: 0.5, P: 0.8, K: 0.5 },
      reproductive: { N: 0.5, P: 0.2, K: 0.5 }
    },
    ndviExpected: {
      vegetative: 0.55,
      reproductive: 0.75
    }
  },
  tomato: {
    category: "vegetable",
    totalNPK: { N: 200, P: 250, K: 100 },
    maturityBBCH: 90,
    stageSplit: {
      vegetative: { N: 0.5, P: 0.8, K: 0.5 },
      reproductive: { N: 0.5, P: 0.2, K: 0.5 }
    },
    ndviExpected: {
      vegetative: 0.55,
      reproductive: 0.75
    }
  },
  turnip: {
    category: "vegetable",
    totalNPK: { N: 80, P: 40, K: 40 },
    maturityBBCH: 90,
    stageSplit: {
      vegetative: { N: 0.5, P: 0.8, K: 0.5 },
      reproductive: { N: 0.5, P: 0.2, K: 0.5 }
    },
    ndviExpected: {
      vegetative: 0.55,
      reproductive: 0.75
    }
  },
  tobacco: {
    category: "vegetable",
    totalNPK: { N: 50, P: 50, K: 50 },
    maturityBBCH: 90,
    stageSplit: {
      vegetative: { N: 0.5, P: 0.8, K: 0.5 },
      reproductive: { N: 0.5, P: 0.2, K: 0.5 }
    },
    ndviExpected: {
      vegetative: 0.55,
      reproductive: 0.75
    }
  },
  barley: {
    category: "cereal",
    totalNPK: { N: 60, P: 30, K: 20 },
    maturityBBCH: 90,
    stageSplit: {
      early: { N: 0.3, P: 0.5, K: 0.3 },
      vegetative: { N: 0.4, P: 0.3, K: 0.4 },
      reproductive: { N: 0.3, P: 0.2, K: 0.3 }
    },
    ndviExpected: {
      early: 0.4,
      vegetative: 0.55,
      reproductive: 0.75
    }
  },
  pearlmillet: {
    category: "cereal",
    totalNPK: { N: 70, P: 35, K: 35 },
    maturityBBCH: 90,
    stageSplit: {
      early: { N: 0.3, P: 0.5, K: 0.3 },
      vegetative: { N: 0.4, P: 0.3, K: 0.4 },
      reproductive: { N: 0.3, P: 0.2, K: 0.3 }
    },
    ndviExpected: {
      early: 0.4,
      vegetative: 0.55,
      reproductive: 0.75
    }
  },
  sorghum: {
    category: "cereal",
    totalNPK: { N: 90, P: 45, K: 45 },
    maturityBBCH: 90,
    stageSplit: {
      early: { N: 0.3, P: 0.5, K: 0.3 },
      vegetative: { N: 0.4, P: 0.3, K: 0.4 },
      reproductive: { N: 0.3, P: 0.2, K: 0.3 }
    },
    ndviExpected: {
      early: 0.4,
      vegetative: 0.55,
      reproductive: 0.75
    }
  },
  fingermillet: {
    category: "cereal",
    totalNPK: { N: 60, P: 30, K: 30 },
    maturityBBCH: 90,
    stageSplit: {
      early: { N: 0.3, P: 0.5, K: 0.3 },
      vegetative: { N: 0.4, P: 0.3, K: 0.4 },
      reproductive: { N: 0.3, P: 0.2, K: 0.3 }
    },
    ndviExpected: {
      early: 0.4,
      vegetative: 0.55,
      reproductive: 0.75
    }
  },
  blackgram: {
    category: "pulse",
    totalNPK: { N: 25, P: 50, K: 0 },
    maturityBBCH: 90,
    stageSplit: {
      early: { N: 0.5, P: 0.8, K: 0.5 },
      vegetative: { N: 0.5, P: 0.2, K: 0.5 },
      reproductive: { N: 0, P: 0, K: 0 }
    },
    ndviExpected: {
      early: 0.4,
      vegetative: 0.5,
      reproductive: 0.7
    }
  },
  lentil: {
    category: "pulse",
    totalNPK: { N: 20, P: 40, K: 20 },
    maturityBBCH: 90,
    stageSplit: {
      early: { N: 0.5, P: 0.8, K: 0.5 },
      vegetative: { N: 0.5, P: 0.2, K: 0.5 },
      reproductive: { N: 0, P: 0, K: 0 }
    },
    ndviExpected: {
      early: 0.4,
      vegetative: 0.5,
      reproductive: 0.7
    }
  },
  horsegram: {
    category: "pulse",
    totalNPK: { N: 12.5, P: 25, K: 0 },
    maturityBBCH: 90,
    stageSplit: {
      early: { N: 0.5, P: 0.8, K: 0.5 },
      vegetative: { N: 0.5, P: 0.2, K: 0.5 },
      reproductive: { N: 0, P: 0, K: 0 }
    },
    ndviExpected: {
      early: 0.4,
      vegetative: 0.5,
      reproductive: 0.7
    }
  },
  cowpealobia: {
    category: "pulse",
    totalNPK: { N: 25, P: 50, K: 0 },
    maturityBBCH: 90,
    stageSplit: {
      early: { N: 0.5, P: 0.8, K: 0.5 },
      vegetative: { N: 0.5, P: 0.2, K: 0.5 },
      reproductive: { N: 0, P: 0, K: 0 }
    },
    ndviExpected: {
      early: 0.4,
      vegetative: 0.5,
      reproductive: 0.7
    }
  },
  mustard: {
    category: "oilseed",
    totalNPK: { N: 60, P: 30, K: 20 },
    maturityBBCH: 90,
    stageSplit: {
      early: { N: 0.5, P: 0.8, K: 0.5 },
      vegetative: { N: 0.5, P: 0.2, K: 0.5 },
      reproductive: { N: 0, P: 0, K: 0 }
    },
    ndviExpected: {
      early: 0.4,
      vegetative: 0.55,
      reproductive: 0.75
    }
  },
  sunflower: {
    category: "oilseed",
    totalNPK: { N: 60, P: 90, K: 30 },
    maturityBBCH: 90,
    stageSplit: {
      early: { N: 0.5, P: 0.8, K: 0.5 },
      vegetative: { N: 0.5, P: 0.2, K: 0.5 },
      reproductive: { N: 0, P: 0, K: 0 }
    },
    ndviExpected: {
      early: 0.4,
      vegetative: 0.55,
      reproductive: 0.75
    }
  },
  sesame: {
    category: "oilseed",
    totalNPK: { N: 30, P: 15, K: 15 },
    maturityBBCH: 90,
    stageSplit: {
      early: { N: 0.5, P: 0.8, K: 0.5 },
      vegetative: { N: 0.5, P: 0.2, K: 0.5 },
      reproductive: { N: 0, P: 0, K: 0 }
    },
    ndviExpected: {
      early: 0.4,
      vegetative: 0.55,
      reproductive: 0.75
    }
  },
  linseed: {
    category: "oilseed",
    totalNPK: { N: 60, P: 30, K: 30 },
    maturityBBCH: 90,
    stageSplit: {
      early: { N: 0.5, P: 0.8, K: 0.5 },
      vegetative: { N: 0.5, P: 0.2, K: 0.5 },
      reproductive: { N: 0, P: 0, K: 0 }
    },
    ndviExpected: {
      early: 0.4,
      vegetative: 0.55,
      reproductive: 0.75
    }
  },
  castor: {
    category: "oilseed",
    totalNPK: { N: 90, P: 45, K: 45 },
    maturityBBCH: 90,
    stageSplit: {
      early: { N: 0.5, P: 0.8, K: 0.5 },
      vegetative: { N: 0.5, P: 0.2, K: 0.5 },
      reproductive: { N: 0, P: 0, K: 0 }
    },
    ndviExpected: {
      early: 0.4,
      vegetative: 0.55,
      reproductive: 0.75
    }
  },
  safflower: {
    category: "oilseed",
    totalNPK: { N: 40, P: 20, K: 20 },
    maturityBBCH: 90,
    stageSplit: {
      early: { N: 0.5, P: 0.8, K: 0.5 },
      vegetative: { N: 0.5, P: 0.2, K: 0.5 },
      reproductive: { N: 0, P: 0, K: 0 }
    },
    ndviExpected: {
      early: 0.4,
      vegetative: 0.55,
      reproductive: 0.75
    }
  },
  niger: {
    category: "oilseed",
    totalNPK: { N: 40, P: 20, K: 0 },
    maturityBBCH: 90,
    stageSplit: {
      early: { N: 0.5, P: 0.8, K: 0.5 },
      vegetative: { N: 0.5, P: 0.2, K: 0.5 },
      reproductive: { N: 0, P: 0, K: 0 }
    },
    ndviExpected: {
      early: 0.4,
      vegetative: 0.55,
      reproductive: 0.75
    }
  },
  jute: {
    category: "cereal",
    totalNPK: { N: 60, P: 30, K: 30 },
    maturityBBCH: 90,
    stageSplit: {
      early: { N: 0.3, P: 0.5, K: 0.3 },
      vegetative: { N: 0.4, P: 0.3, K: 0.4 },
      reproductive: { N: 0.3, P: 0.2, K: 0.3 }
    },
    ndviExpected: {
      early: 0.4,
      vegetative: 0.55,
      reproductive: 0.75
    }
  },
  beans: {
    category: "pulse",
    totalNPK: { N: 20, P: 40, K: 20 },
    maturityBBCH: 90,
    stageSplit: {
      early: { N: 0.5, P: 0.8, K: 0.5 },
      vegetative: { N: 0.5, P: 0.2, K: 0.5 },
      reproductive: { N: 0, P: 0, K: 0 }
    },
    ndviExpected: {
      early: 0.4,
      vegetative: 0.5,
      reproductive: 0.7
    }
  },
  apple: {
    category: "fruit",
    totalNPK: { N: 70, P: 35, K: 70 },
    maturityBBCH: 85,
    stageSplit: {
      vegetative: { N: 0.4, P: 0.4, K: 0.4 },
      fruiting: { N: 0.4, P: 0.4, K: 0.6 }
    },
    ndviExpected: {
      vegetative: 0.55,
      fruiting: 0.65
    }
  },
  lemon: {
    category: "fruit",
    totalNPK: { N: 300, P: 100, K: 150 },
    maturityBBCH: 85,
    stageSplit: {
      vegetative: { N: 0.4, P: 0.4, K: 0.4 },
      fruiting: { N: 0.4, P: 0.4, K: 0.6 }
    },
    ndviExpected: {
      vegetative: 0.55,
      fruiting: 0.65
    }
  },
  pineapple: {
    category: "fruit",
    totalNPK: { N: 320, P: 160, K: 320 },
    maturityBBCH: 85,
    stageSplit: {
      vegetative: { N: 0.4, P: 0.4, K: 0.4 },
      fruiting: { N: 0.4, P: 0.4, K: 0.6 }
    },
    ndviExpected: {
      vegetative: 0.55,
      fruiting: 0.65
    }
  },
  cumin: {
    category: "vegetable",
    totalNPK: { N: 30, P: 20, K: 20 },
    maturityBBCH: 90,
    stageSplit: {
      vegetative: { N: 0.5, P: 0.8, K: 0.5 },
      reproductive: { N: 0.5, P: 0.2, K: 0.5 }
    },
    ndviExpected: {
      vegetative: 0.55,
      reproductive: 0.75
    }
  },
  blackpepper: {
    category: "fruit",
    totalNPK: { N: 100, P: 100, K: 300 },
    maturityBBCH: 85,
    stageSplit: {
      vegetative: { N: 0.4, P: 0.4, K: 0.4 },
      fruiting: { N: 0.4, P: 0.4, K: 0.6 }
    },
    ndviExpected: {
      vegetative: 0.55,
      fruiting: 0.65
    }
  },
  tea: {
    category: "fruit",
    totalNPK: { N: 300, P: 100, K: 300 },
    maturityBBCH: 85,
    stageSplit: {
      vegetative: { N: 0.4, P: 0.4, K: 0.4 },
      fruiting: { N: 0.4, P: 0.4, K: 0.6 }
    },
    ndviExpected: {
      vegetative: 0.55,
      fruiting: 0.65
    }
  },
  coffee: {
    category: "fruit",
    totalNPK: { N: 120, P: 90, K: 120 },
    maturityBBCH: 85,
    stageSplit: {
      vegetative: { N: 0.4, P: 0.4, K: 0.4 },
      fruiting: { N: 0.4, P: 0.4, K: 0.6 }
    },
    ndviExpected: {
      vegetative: 0.55,
      fruiting: 0.65
    }
  },
  coconut: {
    category: "fruit",
    totalNPK: { N: 220, P: 140, K: 530 },
    maturityBBCH: 85,
    stageSplit: {
      vegetative: { N: 0.4, P: 0.4, K: 0.4 },
      fruiting: { N: 0.4, P: 0.4, K: 0.6 }
    },
    ndviExpected: {
      vegetative: 0.55,
      fruiting: 0.65
    }
  },
  arecanut: {
    category: "fruit",
    totalNPK: { N: 136, P: 55, K: 191 },
    maturityBBCH: 85,
    stageSplit: {
      vegetative: { N: 0.4, P: 0.4, K: 0.4 },
      fruiting: { N: 0.4, P: 0.4, K: 0.6 }
    },
    ndviExpected: {
      vegetative: 0.55,
      fruiting: 0.65
    }
  },
  rubber: {
    category: "fruit",
    totalNPK: { N: 80, P: 80, K: 65 },
    maturityBBCH: 85,
    stageSplit: {
      vegetative: { N: 0.4, P: 0.4, K: 0.4 },
      fruiting: { N: 0.4, P: 0.4, K: 0.6 }
    },
    ndviExpected: {
      vegetative: 0.55,
      fruiting: 0.65
    }
  },
  dragonfruit: {
    category: "fruit",
    totalNPK: { N: 200, P: 100, K: 200 },
    maturityBBCH: 85,
    stageSplit: {
      vegetative: { N: 0.4, P: 0.4, K: 0.4 },
      fruiting: { N: 0.4, P: 0.4, K: 0.6 }
    },
    ndviExpected: {
      vegetative: 0.55,
      fruiting: 0.65
    }
  },
  snakegourd: {
    category: "vegetable",
    totalNPK: { N: 100, P: 50, K: 50 },
    maturityBBCH: 90,
    stageSplit: {
      vegetative: { N: 0.5, P: 0.8, K: 0.5 },
      reproductive: { N: 0.5, P: 0.2, K: 0.5 }
    },
    ndviExpected: {
      vegetative: 0.55,
      reproductive: 0.75
    }
  },
  drumstick: {
    category: "vegetable",
    totalNPK: { N: 100, P: 50, K: 50 },
    maturityBBCH: 90,
    stageSplit: {
      vegetative: { N: 0.5, P: 0.8, K: 0.5 },
      reproductive: { N: 0.5, P: 0.2, K: 0.5 }
    },
    ndviExpected: {
      vegetative: 0.55,
      reproductive: 0.75
    }
  },
  chilli: {
    category: "vegetable",
    totalNPK: { N: 120, P: 60, K: 60 },
    maturityBBCH: 90,
    stageSplit: {
      vegetative: { N: 0.5, P: 0.8, K: 0.5 },
      reproductive: { N: 0.5, P: 0.2, K: 0.5 }
    },
    ndviExpected: {
      vegetative: 0.55,
      reproductive: 0.75
    }
  },
  chia: {
    category: "oilseed",
    totalNPK: { N: 40, P: 20, K: 20 },
    maturityBBCH: 90,
    stageSplit: {
      early: { N: 0.5, P: 0.8, K: 0.5 },
      vegetative: { N: 0.5, P: 0.2, K: 0.5 },
      reproductive: { N: 0, P: 0, K: 0 }
    },
    ndviExpected: {
      early: 0.4,
      vegetative: 0.55,
      reproductive: 0.75
    }
  },
  kiwi: {
    category: "fruit",
    totalNPK: { N: 700, P: 400, K: 650 },
    maturityBBCH: 85,
    stageSplit: {
      vegetative: { N: 0.4, P: 0.4, K: 0.4 },
      fruiting: { N: 0.4, P: 0.4, K: 0.6 }
    },
    ndviExpected: {
      vegetative: 0.55,
      fruiting: 0.65
    }
  },
  amla: {
    category: "fruit",
    totalNPK: { N: 200, P: 500, K: 200 },
    maturityBBCH: 85,
    stageSplit: {
      vegetative: { N: 0.4, P: 0.4, K: 0.4 },
      fruiting: { N: 0.4, P: 0.4, K: 0.6 }
    },
    ndviExpected: {
      vegetative: 0.55,
      fruiting: 0.65
    }
  },
  fenugreekmethi: {
    category: "vegetable",
    totalNPK: { N: 30, P: 20, K: 20 },
    maturityBBCH: 90,
    stageSplit: {
      vegetative: { N: 0.5, P: 0.8, K: 0.5 },
      reproductive: { N: 0.5, P: 0.2, K: 0.5 }
    },
    ndviExpected: {
      vegetative: 0.55,
      reproductive: 0.75
    }
  }
};